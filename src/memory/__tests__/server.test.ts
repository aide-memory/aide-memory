import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../store';
import { createServer } from '../server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-server-test-'));
  return path.join(dir, 'memory.db');
}

describe('MCP Server', () => {
  let store: MemoryStore;
  let client: Client;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });
    const server = createServer(store);

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: 'test-client', version: '0.1.0' });
    await client.connect(clientTransport);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) fs.rmdirSync(dir);
  });

  it('lists all 7 tools', async () => {
    const tools = await client.listTools();
    const names = tools.tools.map(t => t.name).sort();
    expect(names).toEqual(['aide_forget', 'aide_import', 'aide_memories', 'aide_recall', 'aide_remember', 'aide_search', 'aide_update']);
  });

  describe('aide_remember + aide_recall', () => {
    it('stores and retrieves a memory', async () => {
      // Remember
      const rememberResult = await client.callTool({
        name: 'aide_remember',
        arguments: {
          what: 'Keep files under 150 lines',
          layer: 'preferences',
          scope: 'src/components/**',
          contributor: 'meky',
        },
      });

      expect(rememberResult.content).toBeDefined();
      const rememberText = (rememberResult.content as any[])[0].text;
      expect(rememberText).toContain('Stored');
      expect(rememberText).toContain('Keep files under 150 lines');

      // Recall
      const recallResult = await client.callTool({
        name: 'aide_recall',
        arguments: {
          paths: ['src/components/Button.tsx'],
        },
      });

      const recallText = (recallResult.content as any[])[0].text;
      expect(recallText).toContain('Keep files under 150 lines');
      expect(recallText).toContain('meky');
    });

    it('returns empty message when nothing found', async () => {
      const result = await client.callTool({
        name: 'aide_recall',
        arguments: {
          paths: ['src/something/'],
        },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('No memories found');
    });
  });

  describe('aide_update', () => {
    it('updates memory with valid ID and returns confirmation', async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'original text', layer: 'technical', scope: 'src/**' },
      });

      const memories = store.list();
      const id = memories[0].id;

      const result = await client.callTool({
        name: 'aide_update',
        arguments: { id, what: 'updated text' },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('Updated memory');
      expect(text).toContain('updated text');

      const updated = store.get(id)!;
      expect(updated.what).toBe('updated text');
    });

    it('returns not found for nonexistent ID', async () => {
      const result = await client.callTool({
        name: 'aide_update',
        arguments: { id: 9999, what: 'nope' },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('not found');
    });

    it('returns unchanged memory when no change fields provided', async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'keep me', layer: 'preferences' },
      });

      const memories = store.list();
      const id = memories[0].id;

      const result = await client.callTool({
        name: 'aide_update',
        arguments: { id },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('No changes provided');
      expect(text).toContain('keep me');

      // Memory unchanged
      const mem = store.get(id)!;
      expect(mem.what).toBe('keep me');
    });

    it('sets updated_at to current time', async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'timestamps', layer: 'technical' },
      });

      const memories = store.list();
      const id = memories[0].id;
      const before = new Date().toISOString();

      await client.callTool({
        name: 'aide_update',
        arguments: { id, what: 'timestamps v2' },
      });

      const updated = store.get(id)!;
      expect(updated.updated_at).not.toBeNull();
      // updated_at should be recent (within a few seconds)
      const updatedTime = new Date(updated.updated_at!).getTime();
      const beforeTime = new Date(before).getTime();
      expect(updatedTime).toBeGreaterThanOrEqual(beforeTime - 1000);
      expect(updatedTime).toBeLessThanOrEqual(beforeTime + 5000);
    });

    it('does not change created_at', async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'created time check', layer: 'technical' },
      });

      const memories = store.list();
      const id = memories[0].id;
      const originalCreatedAt = memories[0].created_at;

      await client.callTool({
        name: 'aide_update',
        arguments: { id, what: 'modified text' },
      });

      const updated = store.get(id)!;
      expect(updated.created_at).toBe(originalCreatedAt);
    });

    it('updates multiple fields in a single call', async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'old what', layer: 'area_context', scope: 'src/old/**', why: 'old why' },
      });

      const memories = store.list();
      const id = memories[0].id;

      const result = await client.callTool({
        name: 'aide_update',
        arguments: {
          id,
          what: 'new what',
          why: 'new why',
          scope: 'src/new/**',
          context_label: 'refactored feature',
        },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('new what');
      expect(text).toContain('src/new/**');

      const updated = store.get(id)!;
      expect(updated.what).toBe('new what');
      expect(updated.why).toBe('new why');
      expect(updated.scope).toBe('src/new/**');
      expect(updated.context_label).toBe('refactored feature');
    });
  });

  describe('aide_forget', () => {
    it('deletes a memory permanently', async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'delete me', layer: 'technical' },
      });

      const memories = store.list();
      const id = memories[0].id;

      const result = await client.callTool({
        name: 'aide_forget',
        arguments: { id },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('Deleted');
      expect(store.get(id)).toBeNull();
    });

    it('returns not found for nonexistent ID', async () => {
      const result = await client.callTool({
        name: 'aide_forget',
        arguments: { id: 9999 },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('not found');
    });
  });

  describe('aide_memories', () => {
    it('lists stored memories', async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'pref one', layer: 'preferences' },
      });
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'tech one', layer: 'technical', scope: 'src/memory/**' },
      });

      const result = await client.callTool({
        name: 'aide_memories',
        arguments: {},
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('pref one');
      expect(text).toContain('tech one');
      expect(text).toContain('Showing 2 of 2');
    });

    it('filters by layer', async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'pref', layer: 'preferences' },
      });
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'tech', layer: 'technical' },
      });

      const result = await client.callTool({
        name: 'aide_memories',
        arguments: { layer: 'preferences' },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('pref');
      expect(text).not.toContain('| tech');
    });
  });

  describe('aide_search', () => {
    beforeEach(async () => {
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'Use vitest for all tests', layer: 'guidelines', why: 'Team standard' },
      });
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'Keep components under 150 lines', layer: 'preferences', scope: 'src/components/**' },
      });
      await client.callTool({
        name: 'aide_remember',
        arguments: { what: 'WAL mode for SQLite', layer: 'technical' },
      });
    });

    it('finds memories by keyword in what field', async () => {
      const result = await client.callTool({
        name: 'aide_search',
        arguments: { keyword: 'vitest' },
      });
      const text = (result.content as any[])[0].text;
      expect(text).toContain('Use vitest for all tests');
      expect(text).not.toContain('WAL mode');
    });

    it('finds memories by keyword in why field', async () => {
      const result = await client.callTool({
        name: 'aide_search',
        arguments: { keyword: 'standard' },
      });
      const text = (result.content as any[])[0].text;
      expect(text).toContain('Use vitest for all tests');
    });

    it('is case-insensitive', async () => {
      const result = await client.callTool({
        name: 'aide_search',
        arguments: { keyword: 'VITEST' },
      });
      const text = (result.content as any[])[0].text;
      expect(text).toContain('Use vitest for all tests');
    });

    it('filters by layer', async () => {
      const result = await client.callTool({
        name: 'aide_search',
        arguments: { keyword: 'vitest', layer: 'technical' },
      });
      const text = (result.content as any[])[0].text;
      expect(text).toContain('No memories found');
    });

    it('returns no-match message when nothing found', async () => {
      const result = await client.callTool({
        name: 'aide_search',
        arguments: { keyword: 'nonexistent-xyz' },
      });
      const text = (result.content as any[])[0].text;
      expect(text).toContain('No memories found matching "nonexistent-xyz"');
    });

    it('groups results by layer in markdown', async () => {
      const result = await client.callTool({
        name: 'aide_search',
        arguments: { keyword: 'e' },
      });
      const text = (result.content as any[])[0].text;
      // Should have layer headers
      expect(text).toMatch(/## (Preferences|Technical|Guidelines)/);
    });
  });

  describe('aide_import', () => {
    it('imports bullet points from markdown', async () => {
      const markdown = `# Testing Guidelines

- Always use vitest, never jest
- Mock external APIs with msw
- Keep test files next to source files
- Use describe blocks for grouping
`;

      const result = await client.callTool({
        name: 'aide_import',
        arguments: {
          content: markdown,
          layer: 'guidelines',
          scope: 'project',
          context_label: 'testing guidelines',
        },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('Imported 4 memories');

      // Verify they're in the store
      const all = store.list({ layer: 'guidelines' });
      expect(all).toHaveLength(4);
      expect(all[0].source).toBe('import');
      expect(all[0].context_label).toBe('testing guidelines');
    });

    it('imports numbered lists', async () => {
      const markdown = `1. Use composition over conditionals
2. Separate component variants into files
3. Keep components under 150 lines`;

      const result = await client.callTool({
        name: 'aide_import',
        arguments: { content: markdown, layer: 'preferences' },
      });

      const text = (result.content as any[])[0].text;
      expect(text).toContain('Imported 3 memories');
    });
  });
});
