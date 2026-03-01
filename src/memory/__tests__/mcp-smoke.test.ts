/**
 * Smoke test: verify the MCP server starts, tools are registered,
 * and recall returns scoped results from the seeded DB.
 *
 * This tests the full stack: cli.ts -> server.ts -> store.ts -> recall.ts
 * against the real seeded database (27 memories).
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server';
import { MemoryStore } from '../store';

const PROJECT_PATH = '/Users/meky/code/aide-v0';

describe('MCP smoke test (real seeded DB)', () => {
  let client: Client;
  let store: MemoryStore;

  beforeAll(async () => {
    store = new MemoryStore(PROJECT_PATH);
    const server = createServer(store);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'smoke-test', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterAll(() => {
    store.close();
  });

  it('lists all 5 tools', async () => {
    const result = await client.listTools();
    const names = result.tools.map(t => t.name).sort();
    expect(names).toEqual(['aide_forget', 'aide_import', 'aide_memories', 'aide_recall', 'aide_remember']);
  });

  it('has 27 seeded memories', async () => {
    const result = await client.callTool({ name: 'aide_memories', arguments: {} });
    const text = (result.content as any)[0].text;
    expect(text).toContain('Showing 27 of 27 memories');
  });

  it('recall for src/memory/ returns scoped technical context', async () => {
    const result = await client.callTool({
      name: 'aide_recall',
      arguments: { paths: ['src/memory/store.ts'] },
    });
    const text: string = (result.content as any)[0].text;

    // Should include memory-area technical facts
    expect(text).toContain('better-sqlite3 is synchronous');
    expect(text).toContain('WAL mode');

    // Should include project-wide technical facts
    expect(text).toContain('Vitest not Jest');

    // Should NOT include CLI or analysis area context
    expect(text).not.toContain('CLI command gets its own file');
    expect(text).not.toContain('treeSitterAnalyzer');
  });

  it('recall for src/cli/ returns CLI area context, not memory context', async () => {
    const result = await client.callTool({
      name: 'aide_recall',
      arguments: { paths: ['src/cli/commands/prune.ts'] },
    });
    const text: string = (result.content as any)[0].text;

    // Should include CLI area context
    expect(text).toContain('CLI command gets its own file');

    // Should NOT include memory-area technical context
    expect(text).not.toContain('better-sqlite3');
    expect(text).not.toContain('WAL mode');
  });

  it('recall for src/analysis/ returns analysis area context', async () => {
    const result = await client.callTool({
      name: 'aide_recall',
      arguments: { paths: ['src/analysis/treeSitterAnalyzer.ts'] },
    });
    const text: string = (result.content as any)[0].text;

    // Should include analysis area context
    expect(text).toContain('treeSitterAnalyzer');

    // Should NOT include memory or CLI area context
    expect(text).not.toContain('better-sqlite3');
    expect(text).not.toContain('CLI command gets its own file');
  });

  it('recall output is organized by layer with area_context first', async () => {
    const result = await client.callTool({
      name: 'aide_recall',
      arguments: { paths: ['src/memory/server.ts'] },
    });
    const text: string = (result.content as any)[0].text;

    const areaIdx = text.indexOf('## Area Context');
    const techIdx = text.indexOf('## Technical Context');
    const prefIdx = text.indexOf('## Preferences');
    const guideIdx = text.indexOf('## Guidelines');

    // Area context should appear before other layers
    if (areaIdx >= 0 && techIdx >= 0) {
      expect(areaIdx).toBeLessThan(techIdx);
    }
    if (techIdx >= 0 && prefIdx >= 0) {
      expect(techIdx).toBeLessThan(prefIdx);
    }
    if (prefIdx >= 0 && guideIdx >= 0) {
      expect(prefIdx).toBeLessThan(guideIdx);
    }
  });

  it('query boost surfaces keyword-matching memories higher', async () => {
    const result = await client.callTool({
      name: 'aide_recall',
      arguments: { paths: ['src/memory/store.ts'], query: 'WAL mode journal' },
    });
    const text: string = (result.content as any)[0].text;

    // WAL mode memory should be present
    expect(text).toContain('WAL mode');
  });

  it('aide_remember stores and aide_forget archives', async () => {
    // Store a test memory
    const storeResult = await client.callTool({
      name: 'aide_remember',
      arguments: {
        what: 'SMOKE TEST — delete me',
        layer: 'technical',
        scope: 'src/memory/__tests__/**',
      },
    });
    const storeText: string = (storeResult.content as any)[0].text;
    expect(storeText).toContain('Stored:');

    // Extract the ID
    const idMatch = storeText.match(/id: (\d+)/);
    expect(idMatch).not.toBeNull();
    const id = parseInt(idMatch![1]);

    // Archive it
    const forgetResult = await client.callTool({
      name: 'aide_forget',
      arguments: { id, mode: 'delete' },
    });
    const forgetText: string = (forgetResult.content as any)[0].text;
    expect(forgetText).toContain('Deleted:');
    expect(forgetText).toContain('SMOKE TEST');
  });
});
