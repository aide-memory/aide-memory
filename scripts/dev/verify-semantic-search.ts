/**
 * Verify aide_search semantic backend works end-to-end against a real
 * embedding backend (Ollama or Transformers). Stores 3 memories with
 * embeddings, then runs queries that have ZERO keyword overlap with
 * any memory's `what` text and verifies semantic match returns the
 * expected memory.
 *
 * Run: npx ts-node scripts/dev/verify-semantic-search.ts
 *
 * Exits 0 on success, 1 on failure. Prints the empirical answer to:
 * "does aide_search-with-semantic actually work today?"
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { MemoryStore } from '../../src/memory/store';
import { EmbeddingService, OllamaBackend, TransformersBackend } from '../../src/memory/embeddings';

async function main(): Promise<number> {
  // Fresh project root.
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-semantic-verify-'));
  console.log(`fixture: ${projectRoot}`);

  // Pre-write minimal .aide so MemoryStore initializes file-per-memory mode.
  fs.mkdirSync(path.join(projectRoot, '.aide'), { recursive: true });

  const store = new MemoryStore({ projectRoot });

  // Try Ollama first (faster start, model already loaded on this dev box).
  // Fall back to Transformers (downloads model on first run, slower).
  let backend: OllamaBackend | TransformersBackend | null = null;
  let backendName = '';
  try {
    backend = new OllamaBackend('nomic-embed-text');
    await backend.initialize();
    backendName = 'ollama:nomic-embed-text';
  } catch (e) {
    console.log(`ollama init failed: ${(e as Error).message}; trying transformers`);
    backend = null;
  }
  if (!backend) {
    try {
      backend = new TransformersBackend();
      await backend.initialize();
      backendName = 'transformers';
    } catch (e) {
      console.error(`transformers init failed: ${(e as Error).message}`);
      console.error('VERDICT: NEITHER backend available, semantic cannot run on this machine');
      store.close();
      return 2;
    }
  }
  console.log(`backend: ${backendName}`);

  const svc = new EmbeddingService(backend!);
  const ok = await svc.initialize();
  if (!ok) {
    console.error('VERDICT: EmbeddingService.initialize returned false');
    store.close();
    return 1;
  }
  store.setEmbeddingService(svc);

  // Seed 3 memories.
  const seed = [
    { layer: 'technical' as const, what: 'Rate limiting middleware caps requests at 50 per minute per user', scope: 'src/api/**' },
    { layer: 'guidelines' as const, what: 'All API responses use camelCase keys for consistency', scope: 'src/api/**' },
    { layer: 'technical' as const, what: 'Date utilities must accept timezone-aware inputs and return UTC', scope: 'src/utils/**' },
  ];
  const created = seed.map((m) => store.add(m));
  console.log(`stored ${created.length} memories with ids: ${created.map((m) => m.id).join(',')}`);

  // store.add fires off generateEmbedding fire-and-forget. Wait long enough
  // for all 3 embedding round-trips to Ollama (~50-200ms each) plus
  // SQLite writes. The fix in commit (storeEmbedding key changed from
  // String(memory.id) to memory.uuid) is what makes the lookup-via-getByUuid
  // path work.
  console.log('waiting 8s for fire-and-forget embedding generation...');
  await new Promise((r) => setTimeout(r, 8000));

  const db = store.getDatabase();
  const embRow = db.prepare('SELECT COUNT(*) as n FROM embeddings').get() as { n: number };
  console.log(`embeddings persisted: ${embRow.n}/${created.length}`);
  if (embRow.n < created.length) {
    console.error('VERDICT: not all embeddings persisted within wait window');
    store.close();
    return 1;
  }
  const keys = db.prepare('SELECT uuid FROM embeddings').all() as { uuid: string }[];
  console.log(`stored keys (should be UUIDs): ${keys.map((k) => k.uuid).join(', ')}`);

  // Run 3 semantic-only queries that have zero substring overlap with any
  // memory's what/why text. If FTS5/LIKE hit, the test would tell us
  // nothing about semantic; we explicitly use mode='semantic' to bypass
  // keyword path.
  const queries = [
    { q: 'request throttling policy', expectedMatchId: created[0].id, label: 'rate-limit semantic match' },
    { q: 'naming convention for response payloads', expectedMatchId: created[1].id, label: 'camelCase semantic match' },
    { q: 'handle different time zones safely', expectedMatchId: created[2].id, label: 'timezone semantic match' },
  ];

  let pass = 0;
  let fail = 0;
  for (const { q, expectedMatchId, label } of queries) {
    const results = await store.searchWithEmbeddings(q, { mode: 'semantic', limit: 5 });
    const ids = results.map((r) => r.id);
    const matched = ids.includes(expectedMatchId);
    console.log(`  query: "${q}"`);
    console.log(`    expected id: ${expectedMatchId}  got: [${ids.join(',')}]  ${matched ? 'PASS' : 'FAIL'} (${label})`);
    if (matched) pass++;
    else fail++;
  }

  store.close();
  fs.rmSync(projectRoot, { recursive: true, force: true });

  console.log('\n────────────────────────────────────────');
  console.log(`backend: ${backendName}  pass: ${pass}  fail: ${fail}`);
  if (fail === 0) {
    console.log('VERDICT: aide_search semantic WORKS end-to-end with', backendName);
    return 0;
  }
  console.log('VERDICT: semantic backend is initialized + storing embeddings, but query results are not returning expected matches');
  return 1;
}

main().then(process.exit).catch((e) => {
  console.error('script error:', e);
  process.exit(3);
});
