#!/usr/bin/env npx ts-node

/**
 * E2E Comparison Runner
 *
 * Connects to AIDE Memory, ConPort, and mcp-memory-service via MCP.
 * Seeds the same data. Runs the same queries. Prints raw results.
 */

import { MemoryStore } from '../store';
import { createServer } from '../server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// ============================================================
// Test data
// ============================================================

const TEST_MEMORIES = [
  { layer: 'preferences', what: 'Keep files under 150 lines — split even if used once', scope: 'src/components/**', contributor: 'meky' },
  { layer: 'preferences', what: 'Composition over conditionals for component variants', scope: 'src/components/**', contributor: 'meky' },
  { layer: 'area_context', what: 'Skeleton loading replaces ALL legacy loaders — no disabled toggle fallback', scope: 'src/components/dashboard/**', context_label: 'dashboard skeleton loading' },
  { layer: 'area_context', what: 'DashboardSkeleton is its own file even though used in one place', scope: 'src/components/dashboard/**', context_label: 'dashboard skeleton loading' },
  { layer: 'technical', what: 'better-sqlite3 is synchronous — do not use await with db calls', scope: 'src/memory/**' },
  { layer: 'technical', what: 'SQLite uses WAL mode — never switch to DELETE journal mode', scope: 'src/memory/**' },
  { layer: 'technical', what: 'Vitest not Jest — use describe/it from vitest, not @jest globals', scope: 'project' },
  { layer: 'guidelines', what: 'Separate component variants into their own files — do not use if/else', scope: 'project' },
  { layer: 'area_context', what: 'Each CLI command gets its own file in src/cli/commands/', scope: 'src/cli/commands/**' },
  { layer: 'area_context', what: 'MCP tools registered with server.tool() not server.setRequestHandler()', scope: 'src/memory/server.ts' },
];

// ============================================================
// Helpers
// ============================================================

function hr(title: string) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function sub(title: string) {
  console.log(`\n--- ${title} ---`);
}

function getToolText(result: any): string {
  try {
    const content = result.content;
    if (Array.isArray(content)) {
      return content.map((c: any) => typeof c === 'string' ? c : c.text || JSON.stringify(c)).join('\n');
    }
    return JSON.stringify(content, null, 2);
  } catch { return String(result); }
}

// ============================================================
// AIDE Memory
// ============================================================

async function testAide() {
  hr('AIDE MEMORY');

  const dbPath = path.join(os.tmpdir(), `aide-e2e-${Date.now()}`, 'memory.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const store = new MemoryStore({ dbPath });
  const server = createServer(store);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: 'e2e-aide', version: '0.1.0' });
  await client.connect(clientTransport);

  // Seed
  for (const mem of TEST_MEMORIES) {
    await client.callTool({ name: 'aide_remember', arguments: mem });
  }
  console.log(`Seeded ${TEST_MEMORIES.length} memories`);

  // Test 1: Path-scoped recall for components
  sub('Query: aide_recall({ paths: ["src/components/NewComponent.tsx"] })');
  const r1 = await client.callTool({ name: 'aide_recall', arguments: { paths: ['src/components/NewComponent.tsx'] } });
  console.log(getToolText(r1));

  // Test 2: Dashboard-specific (child scope)
  sub('Query: aide_recall({ paths: ["src/components/dashboard/Widget.tsx"] })');
  const r2 = await client.callTool({ name: 'aide_recall', arguments: { paths: ['src/components/dashboard/Widget.tsx'] } });
  console.log(getToolText(r2));

  // Test 3: Memory area — should NOT include dashboard/CLI stuff
  sub('Query: aide_recall({ paths: ["src/memory/newfile.ts"] })');
  const r3 = await client.callTool({ name: 'aide_recall', arguments: { paths: ['src/memory/newfile.ts'] } });
  console.log(getToolText(r3));

  // Test 4: CLI area — should NOT include memory/dashboard stuff
  sub('Query: aide_recall({ paths: ["src/cli/commands/prune.ts"] })');
  const r4 = await client.callTool({ name: 'aide_recall', arguments: { paths: ['src/cli/commands/prune.ts'] } });
  console.log(getToolText(r4));

  store.close();
  fs.rmSync(path.dirname(dbPath), { recursive: true, force: true });
}

// ============================================================
// ConPort
// ============================================================

async function testConPort() {
  hr('CONPORT');

  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-e2e-conport-'));

  let client: Client;
  let transport: StdioClientTransport;
  try {
    transport = new StdioClientTransport({
      command: 'conport-mcp',
      args: ['--mode', 'stdio', '--workspace_id', workspace],
    });
    client = new Client({ name: 'e2e-conport', version: '0.1.0' });
    await client.connect(transport);
  } catch (err) {
    console.log('FAILED TO CONNECT:', String(err));
    return;
  }

  const ws = workspace;  // workspace_id required on every ConPort call

  // Seed — map layers to ConPort's entity types
  for (const mem of TEST_MEMORIES) {
    try {
      if (mem.layer === 'area_context') {
        await client.callTool({ name: 'log_decision', arguments: {
          workspace_id: ws,
          summary: mem.what,
          rationale: `Scope: ${mem.scope || 'project'}`,
        }});
      } else if (mem.layer === 'guidelines') {
        await client.callTool({ name: 'log_system_pattern', arguments: {
          workspace_id: ws,
          name: mem.what.slice(0, 80),
          description: mem.what,
        }});
      } else {
        await client.callTool({ name: 'log_custom_data', arguments: {
          workspace_id: ws,
          category: mem.layer,
          key: mem.what.slice(0, 80),
          value: { what: mem.what, scope: mem.scope, contributor: (mem as any).contributor },
        }});
      }
    } catch (e) {
      console.log(`Failed to seed: ${mem.what.slice(0, 40)}... — ${String(e).slice(0, 100)}`);
    }
  }
  console.log(`Seeded ${TEST_MEMORIES.length} items`);

  // Test 1: "Recall for components area" — ConPort has no path-based query
  sub('Best attempt: get_decisions (all — no path filter available)');
  try {
    const r1 = await client.callTool({ name: 'get_decisions', arguments: { workspace_id: ws } });
    console.log(getToolText(r1));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  sub('Best attempt: search_custom_data_value_fts for "components"');
  try {
    const r2 = await client.callTool({ name: 'search_custom_data_value_fts', arguments: { workspace_id: ws, query_term: 'components' } });
    console.log(getToolText(r2));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  sub('Best attempt: semantic_search_conport for "component preferences style 150 lines"');
  try {
    const r3 = await client.callTool({ name: 'semantic_search_conport', arguments: { workspace_id: ws, query_text: 'component preferences style 150 lines', top_k: 10 } });
    console.log(getToolText(r3));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  // Test 3: "Only memory-area stuff" — ConPort can't filter by path
  sub('Isolation test: search_custom_data_value_fts for "sqlite"');
  try {
    const r4 = await client.callTool({ name: 'search_custom_data_value_fts', arguments: { workspace_id: ws, query_term: 'sqlite' } });
    console.log(getToolText(r4));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  sub('All system patterns');
  try {
    const r5 = await client.callTool({ name: 'get_system_patterns', arguments: { workspace_id: ws } });
    console.log(getToolText(r5));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  sub('All custom data');
  try {
    const r6 = await client.callTool({ name: 'get_custom_data', arguments: { workspace_id: ws } });
    console.log(getToolText(r6));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  transport.close();
  fs.rmSync(workspace, { recursive: true, force: true });
}

// ============================================================
// mcp-memory-service
// ============================================================

async function testMcpMemory() {
  hr('MCP-MEMORY-SERVICE');

  const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-e2e-mcpmem-'));

  let client: Client;
  let transport: StdioClientTransport;
  try {
    transport = new StdioClientTransport({
      command: '/Users/meky/.mcp-memory-venv/bin/python',
      args: ['-m', 'mcp_memory_service.server'],
      env: {
        ...process.env,
        MCP_MEMORY_DB_PATH: path.join(dbDir, 'mem.db'),
        MCP_MEMORY_CHROMA_PATH: path.join(dbDir, 'chroma'),
      },
    });
    client = new Client({ name: 'e2e-mcpmem', version: '0.1.0' });
    await client.connect(transport);
  } catch (err) {
    console.log('FAILED TO CONNECT:', String(err));
    return;
  }

  // Seed
  for (const mem of TEST_MEMORIES) {
    try {
      await client.callTool({ name: 'memory_store', arguments: {
        content: mem.what,
        memory_type: mem.layer === 'area_context' ? 'decision' : mem.layer === 'technical' ? 'learning' : mem.layer === 'preferences' ? 'observation' : 'pattern',
        tags: [mem.scope || 'project', mem.layer, (mem as any).contributor, (mem as any).context_label].filter(Boolean),
        metadata: { scope: mem.scope, contributor: (mem as any).contributor },
      }});
    } catch (e) {
      console.log(`Failed to seed: ${mem.what.slice(0, 40)}... — ${String(e).slice(0, 100)}`);
    }
  }
  console.log(`Seeded ${TEST_MEMORIES.length} items`);

  // Test 1: Semantic recall for component work
  sub('Semantic: memory_search for "component style preferences file splitting"');
  try {
    const r1 = await client.callTool({ name: 'memory_search', arguments: { query: 'component style preferences file splitting', n_results: 10 } });
    console.log(getToolText(r1));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  // Test 2: Tag-based filter
  sub('Tags: search_by_tag ["src/components/**", "preferences"]');
  try {
    const r2 = await client.callTool({ name: 'memory_search', arguments: { query: 'component preferences', n_results: 10, tags: ['preferences'] } });
    console.log(getToolText(r2));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  // Test 3: Isolation — search for SQLite stuff
  sub('Semantic: memory_search for "SQLite WAL mode synchronous better-sqlite3"');
  try {
    const r3 = await client.callTool({ name: 'memory_search', arguments: { query: 'SQLite WAL mode synchronous better-sqlite3', n_results: 5 } });
    console.log(getToolText(r3));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  // Test 4: list all to see what's stored
  sub('List all memories');
  try {
    const r4 = await client.callTool({ name: 'memory_list', arguments: { limit: 20 } });
    console.log(getToolText(r4));
  } catch (e) { console.log('Error:', String(e).slice(0, 300)); }

  transport.close();
  fs.rmSync(dbDir, { recursive: true, force: true });
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('E2E Comparison: AIDE Memory vs ConPort vs mcp-memory-service');
  console.log('Date:', new Date().toISOString());
  console.log('');

  await testAide();
  await testConPort();
  await testMcpMemory();

  hr('COMPARISON COMPLETE');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
