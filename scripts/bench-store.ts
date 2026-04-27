/**
 * Microbenchmark for the recall-path hot path.
 *
 * Exercises real MemoryStore + recall() so the numbers reflect what users
 * actually hit through aide_recall on every preToolUse:Read.
 *
 * Run twice:
 *   - On spike worktree (libsql)
 *   - On main worktree (better-sqlite3)
 * Compare median + p95 latencies.
 *
 * Usage: ts-node scripts/bench-store.ts [seedCount] [iterations]
 *   defaults: seedCount=500, iterations=200
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MemoryStore } from '../src/memory/store';
import { recall } from '../src/memory/recall';

function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[idx];
}

function summarize(label: string, durationsMs: number[]) {
  const total = durationsMs.reduce((a, b) => a + b, 0);
  const mean = total / durationsMs.length;
  const median = quantile(durationsMs, 0.5);
  const p95 = quantile(durationsMs, 0.95);
  const p99 = quantile(durationsMs, 0.99);
  const max = Math.max(...durationsMs);
  console.log(
    `${label.padEnd(32)} n=${durationsMs.length}  mean=${mean.toFixed(2)}ms  median=${median.toFixed(2)}ms  p95=${p95.toFixed(2)}ms  p99=${p99.toFixed(2)}ms  max=${max.toFixed(2)}ms`,
  );
}

async function main() {
  const seedCount = parseInt(process.argv[2] ?? '500', 10);
  const iterations = parseInt(process.argv[3] ?? '200', 10);

  console.log(`# bench-store: seedCount=${seedCount} iterations=${iterations}`);
  console.log(`# node=${process.versions.node} ABI=${process.versions.modules}`);

  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bench-store-'));
  const projectRoot = path.join(tmpRoot, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });

  const store = new MemoryStore({ projectRoot });

  console.log(`# seeding ${seedCount} memories ...`);
  const seedStart = Date.now();
  const layers: Array<'preferences' | 'technical' | 'area_context' | 'guidelines'> = [
    'preferences',
    'technical',
    'area_context',
    'guidelines',
  ];
  const scopes = [
    undefined,
    'src/api/**',
    'src/auth/**',
    'src/components/**',
    'src/utils/**',
    'src/memory/**',
  ];
  for (let i = 0; i < seedCount; i++) {
    store.add({
      layer: layers[i % layers.length],
      what: `Memory ${i}: pretend this is a real piece of project context with enough text to be realistic for benchmark purposes — recall, scope, layer, hooks, validation tokens.`,
      why: `Reason ${i}`,
      scope: scopes[i % scopes.length],
      contributor: `dev${i % 5}`,
      tags: ['architecture', 'testing'].slice(0, (i % 2) + 1),
    });
  }
  console.log(`# seeding done in ${Date.now() - seedStart}ms`);
  console.log();

  // Warm up FTS5 + page cache.
  for (let i = 0; i < 20; i++) {
    recall(store, { paths: ['src/api/routes.ts'], limit: 20 });
  }

  const recallPaths = [
    ['src/api/routes.ts'],
    ['src/auth/middleware.ts'],
    ['src/components/Button.tsx'],
    ['src/utils/dates.ts'],
    ['src/memory/store.ts'],
  ];
  const queries = ['authentication', 'recall scope', 'hooks validation', 'memory layer', 'edit api'];

  // 1) recall() — the preToolUse:Read/Edit hot path.
  const recallTimings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const paths = recallPaths[i % recallPaths.length];
    const t0 = performance.now();
    recall(store, { paths, limit: 20 });
    recallTimings.push(performance.now() - t0);
  }
  summarize('recall(paths only)', recallTimings);

  // 2) recall() with query boost.
  const recallQueryTimings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const paths = recallPaths[i % recallPaths.length];
    const query = queries[i % queries.length];
    const t0 = performance.now();
    recall(store, { paths, query, limit: 20 });
    recallQueryTimings.push(performance.now() - t0);
  }
  summarize('recall(paths + query)', recallQueryTimings);

  // 3) store.search() — aide_search MCP path (FTS5).
  const searchTimings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const query = queries[i % queries.length];
    const t0 = performance.now();
    store.search(query, { limit: 50 });
    searchTimings.push(performance.now() - t0);
  }
  summarize('store.search (FTS5 keyword)', searchTimings);

  // 4) store.add() — aide_remember write path.
  const addTimings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    store.add({
      layer: 'technical',
      what: `Bench-write memory ${i} with realistic content simulating an aide_remember call.`,
      contributor: 'bench',
      scope: 'src/api/**',
    });
    addTimings.push(performance.now() - t0);
  }
  summarize('store.add (aide_remember)', addTimings);

  // 5) store.get() — point lookup.
  const getTimings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const id = (i % seedCount) + 1;
    const t0 = performance.now();
    store.get(id);
    getTimings.push(performance.now() - t0);
  }
  summarize('store.get (point lookup)', getTimings);

  // 6) store.list() — full table read (recall feeds this).
  const listTimings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    store.list();
    listTimings.push(performance.now() - t0);
  }
  summarize('store.list (full table)', listTimings);

  store.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

main().catch((err) => {
  console.error('bench failed:', err);
  process.exit(1);
});
