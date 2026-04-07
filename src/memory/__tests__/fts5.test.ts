import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../store';
import { escapeFts5Query, isFts5Available, rebuildFts5Index } from '../fts5';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-fts5-test-'));
  return path.join(dir, 'memory.db');
}

describe('FTS5 Search', () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });
  });

  afterEach(() => {
    store.close();
    try {
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      // WAL and SHM files
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
      const dir = path.dirname(dbPath);
      if (fs.existsSync(dir)) fs.rmdirSync(dir);
    } catch { /* cleanup best-effort */ }
  });

  it('should have FTS5 available', () => {
    expect(store.fts5Available).toBe(true);
  });

  // 1. Single-word search returns matching memories
  it('single-word search returns matching memories', () => {
    store.add({ layer: 'technical', what: 'Use TypeScript strict mode everywhere' });
    store.add({ layer: 'preferences', what: 'Prefer dark theme for the editor' });
    store.add({ layer: 'technical', what: 'Database uses WAL mode' });

    const results = store.search('TypeScript');
    expect(results.length).toBe(1);
    expect(results[0].what).toContain('TypeScript');
  });

  // 2. Multi-word search returns BM25-ranked results
  it('multi-word search returns BM25-ranked results', () => {
    store.add({
      layer: 'technical',
      what: 'The authentication service handles login and issues tokens',
      why: 'Core security component for authentication tokens',
    });
    store.add({
      layer: 'technical',
      what: 'Authentication tokens use JWT with refresh flow for authentication',
      why: 'Authentication architecture decision about tokens',
    });
    store.add({
      layer: 'preferences',
      what: 'Keep components small',
    });

    const results = store.search('authentication tokens');
    expect(results.length).toBe(2);
    // Both memories mention "authentication" and "tokens", BM25 ranks by relevance
    expect(results[0].what).toContain('authentication');
    expect(results[0].what).toContain('tokens');
  });

  // 3. Search with layer filter returns only that layer
  it('search with layer filter returns only that layer', () => {
    store.add({ layer: 'technical', what: 'SQLite database for storage' });
    store.add({ layer: 'preferences', what: 'SQLite is preferred over Postgres for local tools' });
    store.add({ layer: 'guidelines', what: 'Always use SQLite WAL mode' });

    const techOnly = store.search('SQLite', { layer: 'technical' });
    expect(techOnly.length).toBe(1);
    expect(techOnly[0].layer).toBe('technical');

    const prefsOnly = store.search('SQLite', { layer: 'preferences' });
    expect(prefsOnly.length).toBe(1);
    expect(prefsOnly[0].layer).toBe('preferences');
  });

  // 4. FTS5 index updated on insert (add a memory, search finds it)
  it('FTS5 index updated on insert', () => {
    const resultsBefore = store.search('kubernetes');
    expect(resultsBefore.length).toBe(0);

    store.add({ layer: 'technical', what: 'Deploy to kubernetes cluster' });

    const resultsAfter = store.search('kubernetes');
    expect(resultsAfter.length).toBe(1);
    expect(resultsAfter[0].what).toContain('kubernetes');
  });

  // 5. FTS5 index updated on delete (remove a memory, search doesn't find it)
  it('FTS5 index updated on delete', () => {
    const mem = store.add({ layer: 'technical', what: 'Temporary caching strategy with Redis' });

    let results = store.search('Redis');
    expect(results.length).toBe(1);

    store.remove(mem.id);

    results = store.search('Redis');
    expect(results.length).toBe(0);
  });

  // 6. FTS5 index updated on update (change content, search reflects change)
  it('FTS5 index updated on update', () => {
    const mem = store.add({ layer: 'technical', what: 'Use Postgres for the database' });

    let results = store.search('Postgres');
    expect(results.length).toBe(1);

    store.update(mem.id, { what: 'Use MongoDB for the database' });

    // Old term should no longer match
    results = store.search('Postgres');
    expect(results.length).toBe(0);

    // New term should match
    results = store.search('MongoDB');
    expect(results.length).toBe(1);
    expect(results[0].what).toContain('MongoDB');
  });

  // 7. Empty query returns empty results
  it('empty query returns empty results', () => {
    store.add({ layer: 'technical', what: 'Something important' });

    expect(store.search('')).toEqual([]);
    expect(store.search('   ')).toEqual([]);
  });

  // 8. Special characters in query escaped properly
  it('special characters in query escaped properly', () => {
    store.add({ layer: 'technical', what: 'Use C++ for performance-critical code' });
    store.add({ layer: 'technical', what: 'The config uses key=value format' });

    // Queries with special FTS5 characters should not throw
    expect(() => store.search('"quoted"')).not.toThrow();
    expect(() => store.search('key*')).not.toThrow();
    expect(() => store.search('(parentheses)')).not.toThrow();
    expect(() => store.search('test OR something')).not.toThrow();
    expect(() => store.search('NOT this')).not.toThrow();
    expect(() => store.search('col:value')).not.toThrow();

    // The escaped query should still find relevant results
    const results = store.search('config');
    expect(results.length).toBe(1);
  });

  // 9. No matches returns empty (not error)
  it('no matches returns empty array, not error', () => {
    store.add({ layer: 'technical', what: 'Regular memory content' });

    const results = store.search('xyznonexistent');
    expect(results).toEqual([]);
    expect(Array.isArray(results)).toBe(true);
  });

  // 10. Performance: search across 500 memories completes in < 50ms
  it('search across 500 memories completes in < 50ms', () => {
    const topics = [
      'authentication', 'database', 'API', 'frontend', 'backend',
      'testing', 'deployment', 'security', 'performance', 'caching',
      'logging', 'monitoring', 'CI/CD', 'Docker', 'Kubernetes',
      'React', 'TypeScript', 'Node.js', 'GraphQL', 'REST',
    ];

    for (let i = 0; i < 500; i++) {
      const topic = topics[i % topics.length];
      store.add({
        layer: (['technical', 'preferences', 'area_context', 'guidelines'] as const)[i % 4],
        what: `Memory ${i}: Important detail about ${topic} in the ${topic} subsystem`,
        why: `Discovered during ${topic} review session ${Math.floor(i / 20)}`,
        context_label: topic,
      });
    }

    // Use a single-word search that we know exists in the dataset
    const start = performance.now();
    const results = store.search('authentication');
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(50);
    expect(results.length).toBeGreaterThan(0);
  });

  // 11. Search matches across what, why, and context_label
  it('searches across what, why, and context_label fields', () => {
    store.add({
      layer: 'technical',
      what: 'Basic component structure',
      why: 'Following the skeleton pattern for loading states',
      context_label: 'dashboard refactor',
    });

    // Match in "why" field
    const skelResults = store.search('skeleton');
    expect(skelResults.length).toBe(1);

    // Match in "context_label" field
    const dashResults = store.search('dashboard');
    expect(dashResults.length).toBe(1);

    // Match in "what" field
    const compResults = store.search('component');
    expect(compResults.length).toBe(1);
  });

  // 12. Removed memory not found in search
  it('search does not find removed memories', () => {
    const mem = store.add({ layer: 'technical', what: 'Removed knowledge about caching' });
    store.remove(mem.id);

    const results = store.search('caching');
    expect(results.length).toBe(0);
  });

  // 13. FTS5 index rebuilt correctly via rebuild
  it('FTS5 index can be rebuilt from memories table', () => {
    store.add({ layer: 'technical', what: 'Rebuild test memory about microservices' });
    store.add({ layer: 'preferences', what: 'Prefer monolith over microservices initially' });

    // Access the internal db for rebuild
    const db = (store as any).db as Database.Database;
    rebuildFts5Index(db);

    const results = store.search('microservices');
    expect(results.length).toBe(2);
  });
});

describe('escapeFts5Query', () => {
  it('returns null for empty string', () => {
    expect(escapeFts5Query('')).toBeNull();
  });

  it('returns null for whitespace-only string', () => {
    expect(escapeFts5Query('   ')).toBeNull();
  });

  it('escapes special characters', () => {
    const result = escapeFts5Query('hello "world" test*');
    expect(result).not.toBeNull();
    // Special chars replaced with spaces, words quoted
    expect(result).not.toContain('*');
  });

  it('truncates queries longer than 500 chars', () => {
    const longQuery = 'a'.repeat(600);
    const result = escapeFts5Query(longQuery);
    expect(result).not.toBeNull();
    // The underlying string should be based on at most 500 chars
    // After truncation, the 500 chars of 'a' become one word
    expect(result!.length).toBeLessThanOrEqual(502); // "aaa...a" = 500 + 2 quotes
  });

  it('handles multi-word queries', () => {
    const result = escapeFts5Query('hello world');
    expect(result).toBe('"hello" "world"');
  });

  it('collapses multiple spaces', () => {
    const result = escapeFts5Query('hello    world');
    expect(result).toBe('"hello" "world"');
  });
});

describe('isFts5Available', () => {
  it('returns true for standard better-sqlite3', () => {
    const db = new Database(':memory:');
    expect(isFts5Available(db)).toBe(true);
    db.close();
  });
});
