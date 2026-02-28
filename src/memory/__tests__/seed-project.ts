#!/usr/bin/env npx ts-node

/**
 * Seeds aide-memory with real knowledge about this codebase.
 * Run once to populate, then use aide_recall in coding sessions.
 */

import { MemoryStore } from '../store';
import type { CreateMemory } from '../types';

const PROJECT_PATH = '/Users/meky/code/aide-v0';

const MEMORIES: CreateMemory[] = [
  // === Technical facts ===
  { layer: 'technical', what: 'better-sqlite3 is synchronous — do not use await with db calls', scope: 'src/memory/**' },
  { layer: 'technical', what: 'SQLite uses WAL mode — never switch to DELETE journal mode', scope: 'src/memory/**' },
  { layer: 'technical', what: 'Vitest not Jest — use describe/it from vitest, not @jest globals', scope: 'project' },
  { layer: 'technical', what: 'MCP SDK v1.27.1 — use McpServer class, not low-level Server', scope: 'src/memory/server.ts' },
  { layer: 'technical', what: 'Tree-sitter uses WASM bindings — only TS/JS/TSX/JSX parsers available', scope: 'src/analysis/**' },
  { layer: 'technical', what: 'Build with tsc -> dist/, dev with npm run dev -- [args]', scope: 'project' },
  { layer: 'technical', what: 'Commander.js for CLI — commands registered in src/cli/index.ts', scope: 'src/cli/**' },

  // === Preferences ===
  { layer: 'preferences', what: 'Keep files under 150 lines — split even if used once', scope: 'project', contributor: 'meky' },
  { layer: 'preferences', what: 'Composition over conditionals for component/module variants', scope: 'project', contributor: 'meky' },
  { layer: 'preferences', what: 'Document EVERYTHING in MDs and changelogs as we go', scope: 'project', contributor: 'meky' },
  { layer: 'preferences', what: 'Explore different approaches on separate branches/worktrees', scope: 'project', contributor: 'meky' },
  { layer: 'preferences', what: 'User prefers autonomous long-running work — signs off, expects continued progress', scope: 'project', contributor: 'meky' },
  { layer: 'preferences', what: 'New code/constructs should not be tied to old AIDE terminology (no brain, knowledge graph, symbols)', scope: 'project', contributor: 'meky' },

  // === Area context — memory module ===
  { layer: 'area_context', what: 'aide-memory is a standalone module — no dependencies on old AIDE modules (brain, analysis, orchestration)', scope: 'src/memory/**', context_label: 'memory module' },
  { layer: 'area_context', what: 'Path-scoped recall is the core retrieval model — agent provides file paths, gets scoped context', scope: 'src/memory/**', context_label: 'memory module' },
  { layer: 'area_context', what: 'Layer ordering on output: area_context first, then technical, then preferences, then guidelines', scope: 'src/memory/**', context_label: 'memory module' },
  { layer: 'area_context', what: 'Parent scope inheritance — memory scoped to src/components/** also matches src/components/dashboard/**', scope: 'src/memory/recall.ts', context_label: 'recall engine' },
  { layer: 'area_context', what: 'MCP tools registered with server.tool() not server.setRequestHandler()', scope: 'src/memory/server.ts', context_label: 'mcp server' },
  { layer: 'area_context', what: '47 tests across store (20), recall (18), server (9) — all passing', scope: 'src/memory/__tests__/**', context_label: 'memory tests' },

  // === Area context — analysis module ===
  { layer: 'area_context', what: 'treeSitterAnalyzer.ts is 1100+ lines — main AST analysis engine', scope: 'src/analysis/**', context_label: 'code analysis' },
  { layer: 'area_context', what: 'importResolver.ts handles cross-file relation resolution', scope: 'src/analysis/**', context_label: 'code analysis' },
  { layer: 'area_context', what: 'graphAnalysis.ts does module detection and health scoring', scope: 'src/analysis/**', context_label: 'code analysis' },

  // === Area context — CLI ===
  { layer: 'area_context', what: 'Each CLI command gets its own file in src/cli/commands/', scope: 'src/cli/commands/**', context_label: 'cli commands' },
  { layer: 'area_context', what: 'Available commands: scan (31/100 score), rules, check — registered in src/cli/index.ts', scope: 'src/cli/**', context_label: 'cli commands' },

  // === Guidelines ===
  { layer: 'guidelines', what: 'Separate variants into their own files — do not use if/else for component/module variants', scope: 'project' },
  { layer: 'guidelines', what: 'Create new branches per phase to preserve stable points', scope: 'project' },
  { layer: 'guidelines', what: 'All subagents must use opus model — no haiku/sonnet for important work', scope: 'project' },
];

function main() {
  const store = new MemoryStore(PROJECT_PATH);
  console.log(`DB path: ${store.dbPath}`);
  console.log(`Seeding ${MEMORIES.length} memories...\n`);

  for (const mem of MEMORIES) {
    const id = store.add(mem);
    console.log(`  [${mem.layer}] ${mem.what.slice(0, 70)}... → id=${id}`);
  }

  console.log(`\nDone. ${store.count()} total memories in store.`);
  store.close();
}

main();
