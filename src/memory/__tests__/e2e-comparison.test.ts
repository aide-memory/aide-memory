/**
 * E2E Comparison: AIDE Memory vs ConPort vs mcp-memory-service
 *
 * Tests the core recall question: "I'm working in this area of the codebase,
 * what do I need to know?" against all three tools.
 *
 * We test programmatically via MCP client connections to all 3 servers.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MemoryStore } from '../store';
import { createServer } from '../server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import net from 'net';

// ============================================================
// Test data — same memories seeded into all 3 tools
// ============================================================

const TEST_MEMORIES = [
  {
    layer: 'preferences',
    what: 'Keep files under 150 lines — split even if used once',
    scope: 'src/components/**',
    contributor: 'meky',
  },
  {
    layer: 'preferences',
    what: 'Composition over conditionals for component variants',
    scope: 'src/components/**',
    contributor: 'meky',
  },
  {
    layer: 'area_context',
    what: 'Skeleton loading replaces ALL legacy loaders — no disabled toggle fallback',
    scope: 'src/components/dashboard/**',
    context_label: 'dashboard skeleton loading',
  },
  {
    layer: 'area_context',
    what: 'DashboardSkeleton is its own file even though used in one place',
    scope: 'src/components/dashboard/**',
    context_label: 'dashboard skeleton loading',
  },
  {
    layer: 'technical',
    what: 'better-sqlite3 is synchronous — do not use await with db calls',
    scope: 'src/memory/**',
  },
  {
    layer: 'technical',
    what: 'SQLite uses WAL mode — never switch to DELETE journal mode',
    scope: 'src/memory/**',
  },
  {
    layer: 'technical',
    what: 'Vitest not Jest — use describe/it from vitest, not @jest globals',
    scope: 'project',
  },
  {
    layer: 'guidelines',
    what: 'Separate component variants into their own files — do not use if/else',
    scope: 'project',
  },
  {
    layer: 'area_context',
    what: 'Each CLI command gets its own file in src/cli/commands/',
    scope: 'src/cli/commands/**',
  },
  {
    layer: 'area_context',
    what: 'MCP tools registered with server.tool() not server.setRequestHandler()',
    scope: 'src/memory/server.ts',
  },
];

// ============================================================
// Helpers
// ============================================================

function tempDbPath(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `aide-e2e-${prefix}-`));
  return path.join(dir, 'memory.db');
}

interface StdioMcpClient {
  client: Client;
  process: ChildProcess;
  cleanup: () => void;
}

async function connectStdioMcp(command: string, args: string[], env?: Record<string, string>): Promise<StdioMcpClient> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });

    let stderr = '';
    proc.stderr?.on('data', d => { stderr += d.toString(); });

    const client = new Client({ name: 'e2e-test', version: '0.1.0' });

    // Give the server time to start
    setTimeout(async () => {
      try {
        const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
        const mergedEnv: Record<string, string> = {};
        for (const [k, v] of Object.entries({ ...process.env, ...env })) {
          if (v !== undefined) mergedEnv[k] = v;
        }
        const transport = new StdioClientTransport({ command, args, env: mergedEnv });
        await client.connect(transport);
        resolve({
          client,
          process: proc,
          cleanup: () => {
            proc.kill();
          },
        });
      } catch (err) {
        proc.kill();
        reject(new Error(`Failed to connect: ${err}\nStderr: ${stderr}`));
      }
    }, 2000);
  });
}

// ============================================================
// AIDE Memory Tests
// ============================================================

describe('E2E: AIDE Memory', () => {
  let store: MemoryStore;
  let client: Client;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = tempDbPath('aide');
    store = new MemoryStore({ dbPath });
    const server = createServer(store);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'e2e-aide', version: '0.1.0' });
    await client.connect(clientTransport);

    // Seed test data
    for (const mem of TEST_MEMORIES) {
      await client.callTool({
        name: 'aide_remember',
        arguments: mem,
      });
    }
  });

  afterAll(() => {
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  describe('Scenario 1: Style Continuity', () => {
    it('recalls preferences when working in src/components/', async () => {
      const result = await client.callTool({
        name: 'aide_recall',
        arguments: { paths: ['src/components/NewComponent.tsx'] },
      });

      const text = (result.content as any[])[0].text;

      console.log('\n=== AIDE: Recall for src/components/NewComponent.tsx ===');
      console.log(text);
      console.log('=== END ===\n');

      // Should include component preferences
      expect(text).toContain('150 lines');
      expect(text).toContain('Composition over conditionals');
      expect(text).toContain('meky');
      // Should include project-wide guidelines
      expect(text).toContain('Separate component variants');
    });
  });

  describe('Scenario 2: Planning Details Survive', () => {
    it('recalls dashboard-specific decisions', async () => {
      const result = await client.callTool({
        name: 'aide_recall',
        arguments: { paths: ['src/components/dashboard/NewWidget.tsx'] },
      });

      const text = (result.content as any[])[0].text;

      console.log('\n=== AIDE: Recall for src/components/dashboard/NewWidget.tsx ===');
      console.log(text);
      console.log('=== END ===\n');

      // Should include dashboard-specific area context
      expect(text).toContain('Skeleton loading replaces ALL legacy loaders');
      expect(text).toContain('DashboardSkeleton is its own file');
      // Should include parent scope (components preferences)
      expect(text).toContain('150 lines');
      // Should include project-wide
      expect(text).toContain('Vitest not Jest');
    });
  });

  describe('Scenario 3: Technical Knowledge', () => {
    it('recalls technical context for memory module', async () => {
      const result = await client.callTool({
        name: 'aide_recall',
        arguments: { paths: ['src/memory/newfile.ts'] },
      });

      const text = (result.content as any[])[0].text;

      console.log('\n=== AIDE: Recall for src/memory/newfile.ts ===');
      console.log(text);
      console.log('=== END ===\n');

      // Should include memory-specific technical context
      expect(text).toContain('better-sqlite3 is synchronous');
      expect(text).toContain('WAL mode');
      // Should include project-wide
      expect(text).toContain('Vitest not Jest');
      // Should NOT include unrelated areas
      expect(text).not.toContain('CLI command');
      expect(text).not.toContain('Skeleton loading');
    });

    it('does NOT leak context from unrelated areas', async () => {
      const result = await client.callTool({
        name: 'aide_recall',
        arguments: { paths: ['src/cli/commands/newcommand.ts'] },
      });

      const text = (result.content as any[])[0].text;

      console.log('\n=== AIDE: Recall for src/cli/commands/newcommand.ts ===');
      console.log(text);
      console.log('=== END ===\n');

      // Should include CLI-specific context
      expect(text).toContain('Each CLI command gets its own file');
      // Should NOT include memory-specific or dashboard-specific
      expect(text).not.toContain('better-sqlite3');
      expect(text).not.toContain('Skeleton loading');
    });
  });

  describe('Scenario 4: Keyword Query', () => {
    it('boosts relevant results with query', async () => {
      const result = await client.callTool({
        name: 'aide_recall',
        arguments: {
          query: 'skeleton loading legacy',
        },
      });

      const text = (result.content as any[])[0].text;

      console.log('\n=== AIDE: Keyword query "skeleton loading legacy" ===');
      console.log(text);
      console.log('=== END ===\n');

      // Skeleton loading should be near the top
      const lines = text.split('\n').filter((l: string) => l.startsWith('- '));
      const skeletonIdx = lines.findIndex((l: string) => l.includes('Skeleton'));
      expect(skeletonIdx).toBeLessThan(3);
    });
  });

  describe('Scenario 5: Import from Docs', () => {
    it('imports and recalls guidelines from markdown', async () => {
      const markdown = `# Component Guidelines
- Always export components as named exports, not default
- Use React.memo only when profiler shows re-render issues
- Props interfaces go in the same file, not a separate types file`;

      await client.callTool({
        name: 'aide_import',
        arguments: {
          content: markdown,
          layer: 'guidelines',
          scope: 'src/components/**',
          context_label: 'component guidelines',
        },
      });

      const result = await client.callTool({
        name: 'aide_recall',
        arguments: { paths: ['src/components/Something.tsx'] },
      });

      const text = (result.content as any[])[0].text;

      console.log('\n=== AIDE: After import, recall for src/components/ ===');
      console.log(text);
      console.log('=== END ===\n');

      expect(text).toContain('named exports');
      expect(text).toContain('React.memo');
    });
  });
});

// ============================================================
// ConPort Comparison Tests
// ============================================================

describe('E2E: ConPort', () => {
  let client: Client;
  let connected = false;
  let workspaceDir: string;
  let cleanup: (() => void) | null = null;

  beforeAll(async () => {
    // Create temp workspace for ConPort
    workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-e2e-conport-'));

    try {
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      const transport = new StdioClientTransport({
        command: 'python3',
        args: ['-m', 'context_portal_mcp', '--mode', 'stdio', '--workspace_id', workspaceDir],
      });

      client = new Client({ name: 'e2e-conport', version: '0.1.0' });
      await client.connect(transport);
      connected = true;
      cleanup = () => {
        transport.close();
      };

      // Seed equivalent data using ConPort's tools
      // ConPort uses: log_decision for area_context, log_system_pattern for guidelines,
      // log_custom_data for preferences and technical context

      for (const mem of TEST_MEMORIES) {
        if (mem.layer === 'area_context') {
          await client.callTool({
            name: 'log_decision',
            arguments: {
              summary: mem.what,
              rationale: `Scope: ${mem.scope || 'project'}`,
              tags: [mem.scope || 'project', mem.context_label || ''].filter(Boolean),
            },
          });
        } else if (mem.layer === 'guidelines') {
          await client.callTool({
            name: 'log_system_pattern',
            arguments: {
              name: mem.what.slice(0, 50),
              description: mem.what,
              tags: [mem.scope || 'project'],
            },
          });
        } else {
          // preferences and technical → custom_data
          await client.callTool({
            name: 'log_custom_data',
            arguments: {
              category: mem.layer,
              key: mem.what.slice(0, 50),
              value: {
                what: mem.what,
                scope: mem.scope || 'project',
                contributor: mem.contributor || null,
              },
            },
          });
        }
      }
    } catch (err) {
      console.log('\n=== ConPort: FAILED TO CONNECT ===');
      console.log(String(err));
      console.log('ConPort tests will be skipped');
      console.log('=== END ===\n');
    }
  }, 30000);

  afterAll(() => {
    cleanup?.();
    if (workspaceDir && fs.existsSync(workspaceDir)) {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    }
  });

  describe('Scenario 1: Style Continuity — path-scoped recall', () => {
    it('attempt to recall preferences for src/components/', async () => {
      if (!connected) {
        console.log('ConPort: SKIPPED (not connected)');
        return;
      }

      // ConPort has no path-based recall. Best we can do: search by tag
      const result = await client.callTool({
        name: 'search_custom_data_value_fts',
        arguments: { query_term: 'components', category: 'preferences' },
      });

      const text = JSON.stringify((result.content as any[])[0], null, 2);
      console.log('\n=== ConPort: FTS search for "components" in preferences ===');
      console.log(text);
      console.log('=== END ===\n');

      // Also try semantic search if available
      try {
        const semantic = await client.callTool({
          name: 'semantic_search_conport',
          arguments: { query: 'component style preferences under 150 lines', top_k: 5 },
        });
        const semText = JSON.stringify((semantic.content as any[])[0], null, 2);
        console.log('\n=== ConPort: Semantic search "component style preferences" ===');
        console.log(semText);
        console.log('=== END ===\n');
      } catch (e) {
        console.log('ConPort: semantic search not available:', String(e));
      }
    });
  });

  describe('Scenario 3: Technical Knowledge — unrelated area isolation', () => {
    it('attempt to get only memory-area technical context', async () => {
      if (!connected) {
        console.log('ConPort: SKIPPED (not connected)');
        return;
      }

      // ConPort: search for SQLite-related technical context
      const result = await client.callTool({
        name: 'search_custom_data_value_fts',
        arguments: { query_term: 'sqlite', category: 'technical' },
      });

      const text = JSON.stringify((result.content as any[])[0], null, 2);
      console.log('\n=== ConPort: FTS search for "sqlite" in technical ===');
      console.log(text);
      console.log('=== END ===\n');

      // Note: ConPort returns ALL matches project-wide. No path filtering.
      // If someone stored technical context about SQLite in a different area,
      // it would show up too. There's no way to say "only memory-area SQLite stuff."
    });
  });
});

// ============================================================
// mcp-memory-service Comparison Tests
// ============================================================

describe('E2E: mcp-memory-service', () => {
  let client: Client;
  let connected = false;
  let dbDir: string;
  let cleanup: (() => void) | null = null;

  beforeAll(async () => {
    dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-e2e-mcpmem-'));

    try {
      const { StdioClientTransport } = await import('@modelcontextprotocol/sdk/client/stdio.js');
      const transport = new StdioClientTransport({
        command: 'python3',
        args: ['-m', 'mcp_memory_service.mcp_server'],
        env: {
          ...process.env,
          MCP_MEMORY_DB_PATH: path.join(dbDir, 'memories.db'),
          MCP_MEMORY_CHROMA_PATH: path.join(dbDir, 'chroma'),
        },
      });

      client = new Client({ name: 'e2e-mcpmem', version: '0.1.0' });
      await client.connect(transport);
      connected = true;
      cleanup = () => {
        transport.close();
      };

      // Seed equivalent data
      for (const mem of TEST_MEMORIES) {
        const memType = mem.layer === 'area_context' ? 'decision' :
                        mem.layer === 'technical' ? 'learning' :
                        mem.layer === 'preferences' ? 'observation' :
                        'pattern';

        await client.callTool({
          name: 'store_memory',
          arguments: {
            content: mem.what,
            memory_type: memType,
            tags: [
              mem.scope || 'project',
              mem.layer,
              mem.contributor || '',
              mem.context_label || '',
            ].filter(Boolean),
          },
        });
      }
    } catch (err) {
      console.log('\n=== mcp-memory-service: FAILED TO CONNECT ===');
      console.log(String(err));
      console.log('mcp-memory-service tests will be skipped');
      console.log('=== END ===\n');
    }
  }, 60000);

  afterAll(() => {
    cleanup?.();
    if (dbDir && fs.existsSync(dbDir)) {
      fs.rmSync(dbDir, { recursive: true, force: true });
    }
  });

  describe('Scenario 1: Style Continuity — semantic recall', () => {
    it('attempt to recall preferences for component work', async () => {
      if (!connected) {
        console.log('mcp-memory-service: SKIPPED (not connected)');
        return;
      }

      const result = await client.callTool({
        name: 'retrieve_memory',
        arguments: {
          query: 'component style preferences file size splitting',
          n_results: 10,
        },
      });

      const text = JSON.stringify((result.content as any[])[0], null, 2);
      console.log('\n=== mcp-memory-service: Semantic recall "component style preferences" ===');
      console.log(text);
      console.log('=== END ===\n');
    });
  });

  describe('Scenario 3: Technical Knowledge — area isolation', () => {
    it('attempt to get only memory-area technical context', async () => {
      if (!connected) {
        console.log('mcp-memory-service: SKIPPED (not connected)');
        return;
      }

      // Try tag-based filtering
      const tagResult = await client.callTool({
        name: 'search_by_tag',
        arguments: { tags: ['src/memory/**', 'technical'] },
      });

      const tagText = JSON.stringify((tagResult.content as any[])[0], null, 2);
      console.log('\n=== mcp-memory-service: Tag search [src/memory/**, technical] ===');
      console.log(tagText);
      console.log('=== END ===\n');

      // Try semantic search
      const semResult = await client.callTool({
        name: 'retrieve_memory',
        arguments: {
          query: 'SQLite better-sqlite3 synchronous WAL mode memory module',
          n_results: 5,
        },
      });

      const semText = JSON.stringify((semResult.content as any[])[0], null, 2);
      console.log('\n=== mcp-memory-service: Semantic "SQLite WAL mode memory module" ===');
      console.log(semText);
      console.log('=== END ===\n');
    });
  });
});
