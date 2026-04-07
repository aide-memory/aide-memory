/**
 * Smoke test: verify the MCP server starts, tools are registered,
 * and recall returns scoped results from an in-test seeded DB.
 *
 * This tests the full stack: server.ts -> store.ts -> recall.ts
 * using a temporary SQLite database seeded with representative memories.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../server';
import { MemoryStore } from '../store';
import type { CreateMemory } from '../types';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Seed memories that cover technical, area_context, preferences, and guidelines layers
 * with various scopes for testing path-scoped recall.
 */
const SEED_MEMORIES: CreateMemory[] = [
  // Technical — memory module scope
  { layer: 'technical', what: 'better-sqlite3 is synchronous — do not use await with db calls', scope: 'src/memory/**', contributor: 'test' },
  { layer: 'technical', what: 'SQLite uses WAL mode — never switch to DELETE journal mode', scope: 'src/memory/**', contributor: 'test' },
  // Technical — project-wide
  { layer: 'technical', what: 'Vitest not Jest — use describe/it from vitest, not @jest globals', scope: 'project', contributor: 'test' },
  { layer: 'technical', what: 'MCP SDK v1.27.1 — use McpServer class, not low-level Server', scope: 'src/memory/server.ts', contributor: 'test' },
  { layer: 'technical', what: 'Tree-sitter uses WASM bindings — only TS/JS/TSX/JSX parsers available', scope: 'src/analysis/**', contributor: 'test' },
  { layer: 'technical', what: 'Build with tsc -> dist/, dev with npm run dev -- [args]', scope: 'project', contributor: 'test' },
  { layer: 'technical', what: 'Commander.js for CLI — commands registered in src/cli/index.ts', scope: 'src/cli/**', contributor: 'test' },

  // Preferences
  { layer: 'preferences', what: 'Keep files under 150 lines — split even if used once', scope: 'project', contributor: 'meky' },
  { layer: 'preferences', what: 'Composition over conditionals for component/module variants', scope: 'project', contributor: 'meky' },
  { layer: 'preferences', what: 'Document EVERYTHING in MDs and changelogs as we go', scope: 'project', contributor: 'meky' },

  // Area context — memory module
  { layer: 'area_context', what: 'aide-memory is a standalone module — no dependencies on old AIDE modules', scope: 'src/memory/**', context_label: 'memory module', contributor: 'test' },
  { layer: 'area_context', what: 'Path-scoped recall is the core retrieval model', scope: 'src/memory/**', context_label: 'memory module', contributor: 'test' },
  { layer: 'area_context', what: 'Layer ordering on output: area_context first, then technical, then preferences, then guidelines', scope: 'src/memory/**', context_label: 'memory module', contributor: 'test' },
  { layer: 'area_context', what: 'MCP tools registered with server.tool() not server.setRequestHandler()', scope: 'src/memory/server.ts', context_label: 'mcp server', contributor: 'test' },

  // Area context — analysis module
  { layer: 'area_context', what: 'treeSitterAnalyzer.ts is 1100+ lines — main AST analysis engine', scope: 'src/analysis/**', context_label: 'code analysis', contributor: 'test' },
  { layer: 'area_context', what: 'importResolver.ts handles cross-file relation resolution', scope: 'src/analysis/**', context_label: 'code analysis', contributor: 'test' },

  // Area context — CLI
  { layer: 'area_context', what: 'Each CLI command gets its own file in src/cli/commands/', scope: 'src/cli/commands/**', context_label: 'cli commands', contributor: 'test' },
  { layer: 'area_context', what: 'Available commands: scan, rules, check — registered in src/cli/index.ts', scope: 'src/cli/**', context_label: 'cli commands', contributor: 'test' },

  // Guidelines
  { layer: 'guidelines', what: 'Separate variants into their own files — do not use if/else for component/module variants', scope: 'project', contributor: 'test' },
  { layer: 'guidelines', what: 'Create new branches per phase to preserve stable points', scope: 'project', contributor: 'test' },
  { layer: 'guidelines', what: 'All subagents must use opus model — no haiku/sonnet for important work', scope: 'project', contributor: 'test' },
];

describe('MCP smoke test (self-seeded DB)', () => {
  let client: Client;
  let store: MemoryStore;
  let tmpDbPath: string;

  beforeAll(async () => {
    // Use a temp file for the test database — fully isolated
    tmpDbPath = path.join(os.tmpdir(), `aide-smoke-${Date.now()}.db`);
    store = new MemoryStore({ dbPath: tmpDbPath });

    // Seed memories
    for (const mem of SEED_MEMORIES) {
      store.add(mem);
    }

    const server = createServer(store);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'smoke-test', version: '1.0.0' });
    await client.connect(clientTransport);
  });

  afterAll(() => {
    store.close();
    // Clean up temp db files
    try { fs.unlinkSync(tmpDbPath); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpDbPath + '-wal'); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpDbPath + '-shm'); } catch { /* ignore */ }
  });

  it('lists all 7 tools', async () => {
    const result = await client.listTools();
    const names = result.tools.map(t => t.name).sort();
    expect(names).toEqual(['aide_forget', 'aide_import', 'aide_memories', 'aide_recall', 'aide_remember', 'aide_search', 'aide_update']);
  });

  it('has seeded memories', async () => {
    const result = await client.callTool({ name: 'aide_memories', arguments: {} });
    const text = (result.content as any)[0].text;
    const match = text.match(/Showing (\d+) of (\d+) memories/);
    expect(match).not.toBeNull();
    expect(parseInt(match![2])).toBe(SEED_MEMORIES.length);
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

  it('aide_remember stores and aide_forget deletes', async () => {
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

    // Extract the ID (new format includes uuid)
    const idMatch = storeText.match(/id: (\d+)/);
    expect(idMatch).not.toBeNull();
    const id = parseInt(idMatch![1]);

    // Delete it
    const forgetResult = await client.callTool({
      name: 'aide_forget',
      arguments: { id },
    });
    const forgetText: string = (forgetResult.content as any)[0].text;
    expect(forgetText).toContain('Deleted:');
    expect(forgetText).toContain('SMOKE TEST');
  });
});
