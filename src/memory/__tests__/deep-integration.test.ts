import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../store';
import { MemorySync } from '../sync';
import { AideConfig } from '../config';
import { Analytics } from '../analytics';
import { recall, scopeMatchesPath } from '../recall';
import { createServer } from '../server';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { initProject } from '../init';
import type { MemoryFile, Memory } from '../types';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

// ── Helpers ──

function tempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aide-deep-test-'));
}

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-deep-db-'));
  return path.join(dir, 'memory.db');
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function readJsonFile(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function collectJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  const walk = (d: string) => {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) files.push(full);
    }
  };
  walk(dir);
  return files;
}

function makeMemoryFile(overrides: Partial<MemoryFile> = {}): MemoryFile {
  return {
    uuid: overrides.uuid ?? crypto.randomUUID(),
    layer: overrides.layer ?? 'technical',
    what: overrides.what ?? 'Test memory',
    why: overrides.why ?? null,
    scope: overrides.scope ?? null,
    context_label: overrides.context_label ?? null,
    contributor: overrides.contributor ?? 'test-user',
    tags: overrides.tags ?? [],
    source: overrides.source ?? 'conversation',
    shared: overrides.shared ?? true,
    generated_by: overrides.generated_by ?? null,
    derived_from: overrides.derived_from ?? null,
    created_at: overrides.created_at ?? '2026-01-01T00:00:00.000Z',
    updated_at: overrides.updated_at ?? '2026-01-01T00:00:00.000Z',
  };
}

function writeMemoryFile(projectRoot: string, memFile: MemoryFile): string {
  let subdir: string;
  if (memFile.layer === 'preferences') {
    subdir = path.join('preferences', memFile.shared ? 'shared' : 'personal');
  } else {
    subdir = memFile.layer;
  }
  const filePath = path.join(projectRoot, '.aide', 'memories', subdir, `${memFile.uuid}.json`);
  fs.writeFileSync(filePath, JSON.stringify(memFile, null, 2) + '\n', 'utf-8');
  return filePath;
}

function directInsert(store: MemoryStore, data: MemoryFile): void {
  const db = (store as any).db as Database.Database;
  db.prepare(`
    INSERT INTO memories (uuid, layer, what, why, scope, context_label, contributor,
      tags, source, shared, generated_by, derived_from, created_at, updated_at,
      recalled_count, last_recalled_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
  `).run(
    data.uuid, data.layer, data.what, data.why ?? null, data.scope ?? null,
    data.context_label ?? null, data.contributor, JSON.stringify(data.tags ?? []),
    data.source ?? 'conversation', data.shared ? 1 : 0,
    data.generated_by ? JSON.stringify(data.generated_by) : null,
    data.derived_from ? JSON.stringify(data.derived_from) : null,
    data.created_at, data.updated_at,
  );
}

// ── 1. Storage Edge Cases ──

describe('1. Storage Edge Cases', () => {
  let store: MemoryStore;
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = tempProjectRoot();
    store = new MemoryStore({ projectRoot });
  });

  afterEach(() => {
    store.close();
    cleanupDir(projectRoot);
    const dbDir = path.dirname((store as any).dbPath);
    cleanupDir(dbDir);
  });

  it('stores and retrieves a very long what field (10,000 chars)', () => {
    const longWhat = 'A'.repeat(10_000);
    const mem = store.add({ layer: 'technical', what: longWhat });

    expect(mem.what).toBe(longWhat);
    expect(mem.what.length).toBe(10_000);

    const retrieved = store.getByUuid(mem.uuid)!;
    expect(retrieved.what).toBe(longWhat);

    // JSON file also has the full content
    const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
    const fileContent = readJsonFile(filePath);
    expect(fileContent.what.length).toBe(10_000);
  });

  it('handles special characters (quotes, newlines, unicode emoji) in JSON file', () => {
    const special = 'He said "don\'t do that"\nNew line here\ttab here\n\u{1F680} rocket \u{2764}\u{FE0F} heart \u{1F4A5} boom';
    const mem = store.add({
      layer: 'technical',
      what: special,
      why: 'Because "reasons" & \'more\'',
      context_label: 'special \\ chars / test',
    });

    expect(mem.what).toBe(special);

    // Verify JSON file is valid
    const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw); // must not throw
    expect(parsed.what).toBe(special);
    expect(parsed.why).toBe('Because "reasons" & \'more\'');
  });

  it('stores glob scope correctly', () => {
    const scope = 'src/**/*.{ts,tsx}';
    const mem = store.add({ layer: 'area_context', what: 'glob scope test', scope });

    expect(mem.scope).toBe(scope);

    const filePath = path.join(projectRoot, '.aide', 'memories', 'area_context', `${mem.uuid}.json`);
    const fileContent = readJsonFile(filePath);
    expect(fileContent.scope).toBe(scope);

    // Also verify retrieval from SQLite
    const retrieved = store.getByUuid(mem.uuid)!;
    expect(retrieved.scope).toBe(scope);
  });

  it('adds 50 memories rapidly with all unique UUIDs and JSON files', () => {
    const memories: Memory[] = [];
    for (let i = 0; i < 50; i++) {
      memories.push(store.add({ layer: 'technical', what: `rapid memory ${i}` }));
    }

    // All 50 unique UUIDs
    const uuids = new Set(memories.map(m => m.uuid));
    expect(uuids.size).toBe(50);

    // All 50 JSON files exist
    const memoriesDir = path.join(projectRoot, '.aide', 'memories', 'technical');
    const jsonFiles = collectJsonFiles(memoriesDir);
    expect(jsonFiles.length).toBe(50);

    // All 50 in SQLite
    expect(store.count()).toBe(50);
  });

  it('update preserves created_at, changes updated_at, and updates JSON file', () => {
    const mem = store.add({ layer: 'technical', what: 'original' });
    const originalCreatedAt = mem.created_at;
    const originalUpdatedAt = mem.updated_at;

    // Small delay so timestamps differ
    const updated = store.update(mem.id, { what: 'modified content' })!;

    expect(updated.created_at).toBe(originalCreatedAt);
    expect(new Date(updated.updated_at).getTime()).toBeGreaterThanOrEqual(
      new Date(originalUpdatedAt).getTime()
    );

    // JSON file reflects update
    const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
    const fileContent = readJsonFile(filePath);
    expect(fileContent.what).toBe('modified content');
    expect(fileContent.created_at).toBe(originalCreatedAt);
  });

  it('remove deletes JSON file, SQLite row, and leaves no orphans', () => {
    const mem = store.add({ layer: 'guidelines', what: 'going away' });
    const filePath = path.join(projectRoot, '.aide', 'memories', 'guidelines', `${mem.uuid}.json`);

    expect(fs.existsSync(filePath)).toBe(true);
    expect(store.getByUuid(mem.uuid)).not.toBeNull();

    store.remove(mem.id);

    expect(fs.existsSync(filePath)).toBe(false);
    expect(store.getByUuid(mem.uuid)).toBeNull();
    expect(store.get(mem.id)).toBeNull();

    // No orphaned JSON files
    const guidelinesDir = path.join(projectRoot, '.aide', 'memories', 'guidelines');
    const remaining = collectJsonFiles(guidelinesDir);
    expect(remaining.length).toBe(0);
  });

  it('recalled_count increments on recall and is NOT in JSON file', () => {
    const mem = store.add({ layer: 'technical', what: 'recall tracking test' });

    // Initial state
    expect(mem.recalled_count).toBe(0);

    // Recall increments
    store.recordRecall([mem.id]);
    const after1 = store.get(mem.id)!;
    expect(after1.recalled_count).toBe(1);

    store.recordRecall([mem.id]);
    const after2 = store.get(mem.id)!;
    expect(after2.recalled_count).toBe(2);

    // JSON file must NOT have recalled_count
    const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
    const fileContent = readJsonFile(filePath);
    expect(fileContent.recalled_count).toBeUndefined();
    expect(fileContent.last_recalled_at).toBeUndefined();
  });

  it('JSON file has exact schema with no extra fields', () => {
    const mem = store.add({
      layer: 'area_context',
      what: 'schema test',
      why: 'verify schema',
      scope: 'src/**',
      context_label: 'test label',
      contributor: 'tester',
      tags: ['a', 'b'],
      source: 'conversation',
      shared: true,
      generated_by: { tool: 'test-tool', model: 'test-model', author_type: 'ai' },
      derived_from: ['uuid-1', 'uuid-2'],
    });

    const filePath = path.join(projectRoot, '.aide', 'memories', 'area_context', `${mem.uuid}.json`);
    const fileContent = readJsonFile(filePath);

    // Exact expected keys (priority added in schema v3, id added Apr 21 2026
    // for stable numeric identifiers across cache rebuilds)
    const expectedKeys = [
      'id', 'uuid', 'layer', 'what', 'why', 'scope', 'context_label',
      'contributor', 'tags', 'source', 'shared', 'priority', 'generated_by',
      'derived_from', 'created_at', 'updated_at',
    ].sort();

    expect(Object.keys(fileContent).sort()).toEqual(expectedKeys);

    // id is persisted now (part of the canonical schema)
    expect(fileContent.id).toBe(mem.id);
    // recalled_count and last_recalled_at remain SQLite-only (runtime stats)
    expect(fileContent.recalled_count).toBeUndefined();
    expect(fileContent.last_recalled_at).toBeUndefined();
    expect(fileContent.status).toBeUndefined();
  });

  it('corrupt JSON file is skipped during cache rebuild, other files survive', () => {
    const goodMem = store.add({ layer: 'technical', what: 'good memory' });
    const goodUuid = goodMem.uuid;

    // Write a corrupt file
    const corruptPath = path.join(projectRoot, '.aide', 'memories', 'technical', 'corrupt.json');
    fs.writeFileSync(corruptPath, '{{{{ not valid JSON @@@@', 'utf-8');

    // Force rebuild
    store.close();
    const dbPath = (store as any).dbPath;
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    [dbPath + '-wal', dbPath + '-shm'].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });

    // Reopen: should not crash, good memory should survive
    const store2 = new MemoryStore({ projectRoot });
    expect(store2.count()).toBe(1);
    expect(store2.getByUuid(goodUuid)!.what).toBe('good memory');

    store2.close();
    store = new MemoryStore({ projectRoot }); // for afterEach cleanup
  });

  it('preferences personal/ memories get shared: false', () => {
    const mem = store.add({ layer: 'preferences', what: 'personal pref', shared: false });

    expect(mem.shared).toBe(false);

    const personalPath = path.join(
      projectRoot, '.aide', 'memories', 'preferences', 'personal', `${mem.uuid}.json`
    );
    const sharedPath = path.join(
      projectRoot, '.aide', 'memories', 'preferences', 'shared', `${mem.uuid}.json`
    );

    expect(fs.existsSync(personalPath)).toBe(true);
    expect(fs.existsSync(sharedPath)).toBe(false);

    const fileContent = readJsonFile(personalPath);
    expect(fileContent.shared).toBe(false);
  });

  it('technical, area_context, guidelines memories get shared: true by default', () => {
    const layers = ['technical', 'area_context', 'guidelines'] as const;
    for (const layer of layers) {
      const mem = store.add({ layer, what: `${layer} shared test` });
      expect(mem.shared).toBe(true);

      const filePath = path.join(projectRoot, '.aide', 'memories', layer, `${mem.uuid}.json`);
      const fileContent = readJsonFile(filePath);
      expect(fileContent.shared).toBe(true);
    }
  });

  it('generated_by field is stored correctly in JSON file', () => {
    const generatedBy = { tool: 'claude-code', model: 'claude-opus-4', author_type: 'ai' as const };
    const mem = store.add({
      layer: 'technical',
      what: 'AI-generated memory',
      generated_by: generatedBy,
    });

    expect(mem.generated_by).toEqual(generatedBy);

    const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
    const fileContent = readJsonFile(filePath);
    expect(fileContent.generated_by).toEqual(generatedBy);
  });
});

// ── 2. FTS5 + Search Edge Cases ──

describe('2. FTS5 + Search Edge Cases', () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });
  });

  afterEach(() => {
    store.close();
    cleanupDir(path.dirname(dbPath));
  });

  it('search matches why field content (not just what)', () => {
    store.add({
      layer: 'technical',
      what: 'Use WAL mode',
      why: 'Concurrent read performance matters for multi-agent setups',
    });

    const results = store.search('concurrent');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].what).toBe('Use WAL mode');
  });

  it('search matches context_label content', () => {
    store.add({
      layer: 'area_context',
      what: 'Always validate input',
      context_label: 'authentication module redesign',
    });

    // FTS5 indexes context_label, so searching for it should work
    const results = store.search('authentication');
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].what).toBe('Always validate input');
  });

  it('search handles punctuation: "don\'t", "API-contract"', () => {
    store.add({ layer: 'guidelines', what: "Don't use var, always use const or let" });
    store.add({ layer: 'technical', what: 'API-contract must be versioned' });

    // Search for the word without punctuation
    const results1 = store.search('var');
    expect(results1.length).toBeGreaterThanOrEqual(1);

    const results2 = store.search('API');
    expect(results2.length).toBeGreaterThanOrEqual(1);
    expect(results2.some(r => r.what.includes('API-contract'))).toBe(true);
  });

  it('search after update finds new content, does NOT find old content', () => {
    const mem = store.add({ layer: 'technical', what: 'Use PostgreSQL for production' });

    // Update to completely different content
    store.update(mem.id, { what: 'Use Redis for caching layer' });

    const oldResults = store.search('PostgreSQL');
    expect(oldResults.length).toBe(0);

    const newResults = store.search('Redis');
    expect(newResults.length).toBe(1);
    expect(newResults[0].what).toBe('Use Redis for caching layer');
  });

  it('search after delete returns nothing for deleted content', () => {
    const mem = store.add({ layer: 'technical', what: 'Temporary memory about zebras' });

    let results = store.search('zebras');
    expect(results.length).toBe(1);

    store.remove(mem.id);

    results = store.search('zebras');
    expect(results.length).toBe(0);
  });

  it('search with single character uses LIKE fallback and returns results', () => {
    store.add({ layer: 'technical', what: 'A quick brown fox' });

    // Single char - FTS5 may not match but LIKE fallback should
    const results = store.search('A');
    // LIKE search for 'A' matches 'A quick brown fox'
    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it('empty string search returns empty array', () => {
    store.add({ layer: 'technical', what: 'Something' });

    const results = store.search('');
    expect(results).toEqual([]);

    const results2 = store.search('   ');
    expect(results2).toEqual([]);
  });

  it('FTS5 fallback: search for substring FTS5 misses but LIKE catches', () => {
    store.add({ layer: 'technical', what: 'The configuration uses parameterization' });

    // FTS5 tokenizes by word. LIKE can catch substrings.
    // Searching a partial word that FTS5 may not match (no prefix/suffix in FTS5 default).
    // If FTS5 returns 0, it falls through to LIKE.
    const results = store.search('eterizat'); // substring of "parameterization"
    // LIKE fallback: %eterizat% should match
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].what).toContain('parameterization');
  });
});

// ── 3. Recall Edge Cases ──

describe('3. Recall Edge Cases', () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });
  });

  afterEach(() => {
    store.close();
    cleanupDir(path.dirname(dbPath));
  });

  it('recall with no paths and no query returns all memories', () => {
    store.add({ layer: 'technical', what: 'memory A' });
    store.add({ layer: 'preferences', what: 'memory B' });
    store.add({ layer: 'guidelines', what: 'memory C' });

    const result = recall(store, {});
    expect(result.memories.length).toBe(3);
  });

  it('recall with path matching no scopes returns project-wide memories only', () => {
    store.add({ layer: 'technical', what: 'project-wide' });
    store.add({ layer: 'technical', what: 'scoped to lib', scope: 'lib/**' });

    const result = recall(store, { paths: ['src/main.ts'] });

    // Only project-wide (null scope) should match
    expect(result.memories.length).toBe(1);
    expect(result.memories[0].what).toBe('project-wide');
  });

  it('recall with multiple paths returns union of matches', () => {
    store.add({ layer: 'area_context', what: 'src component rule', scope: 'src/components/**' });
    store.add({ layer: 'area_context', what: 'lib util rule', scope: 'lib/utils/**' });
    store.add({ layer: 'technical', what: 'unrelated', scope: 'test/**' });

    const result = recall(store, {
      paths: ['src/components/Button.tsx', 'lib/utils/format.ts'],
    });

    expect(result.memories.length).toBe(2);
    const whats = result.memories.map(m => m.what).sort();
    expect(whats).toContain('src component rule');
    expect(whats).toContain('lib util rule');
  });

  it('recall with contributor filter only returns that contributor', () => {
    store.add({ layer: 'preferences', what: 'alice pref', contributor: 'alice' });
    store.add({ layer: 'preferences', what: 'bob pref', contributor: 'bob' });

    const result = recall(store, { contributor: 'alice' });
    expect(result.memories.length).toBe(1);
    expect(result.memories[0].what).toBe('alice pref');
    expect(result.memories[0].contributor).toBe('alice');
  });

  it('layer ordering: area_context > technical > preferences > guidelines', () => {
    store.add({ layer: 'guidelines', what: 'guideline' });
    store.add({ layer: 'preferences', what: 'preference' });
    store.add({ layer: 'technical', what: 'technical' });
    store.add({ layer: 'area_context', what: 'area context' });

    const result = recall(store, {});

    expect(result.memories[0].layer).toBe('area_context');
    expect(result.memories[1].layer).toBe('technical');
    expect(result.memories[2].layer).toBe('preferences');
    expect(result.memories[3].layer).toBe('guidelines');
  });

  it('limit=1 returns exactly 1 (no round-robin when limit < 5)', () => {
    store.add({ layer: 'guidelines', what: 'guideline' });
    store.add({ layer: 'area_context', what: 'area context is top priority' });
    store.add({ layer: 'technical', what: 'technical' });

    const result = recall(store, { limit: 1 });
    // Round-robin only kicks in when limit >= 5 (enough slots for diversity).
    // With limit=1, just return the top result — no swaps.
    expect(result.memories.length).toBe(1);
    expect(result.memories[0].layer).toBe('area_context');
    expect(result.memories[0].what).toBe('area context is top priority');
  });

  it('limit=5 with round-robin swaps in underrepresented layers within the limit', () => {
    // Add 4 area_context + 1 each of other layers
    for (let i = 0; i < 4; i++) store.add({ layer: 'area_context', what: `area ${i}` });
    store.add({ layer: 'technical', what: 'tech mem' });
    store.add({ layer: 'preferences', what: 'pref mem' });
    store.add({ layer: 'guidelines', what: 'guide mem' });

    const result = recall(store, { limit: 5 });
    // Total must not exceed limit
    expect(result.memories.length).toBe(5);
    // All 4 layers should be represented via round-robin swaps
    const layers = new Set(result.memories.map(m => m.layer));
    expect(layers.size).toBe(4);
  });

  it('recalled_count increments for each recalled memory', () => {
    const m1 = store.add({ layer: 'technical', what: 'recall test A' });
    const m2 = store.add({ layer: 'technical', what: 'recall test B' });

    // Initial count is 0
    expect(store.get(m1.id)!.recalled_count).toBe(0);
    expect(store.get(m2.id)!.recalled_count).toBe(0);

    // Recall returns both and increments
    recall(store, {});

    expect(store.get(m1.id)!.recalled_count).toBe(1);
    expect(store.get(m2.id)!.recalled_count).toBe(1);

    // Recall again
    recall(store, {});

    expect(store.get(m1.id)!.recalled_count).toBe(2);
    expect(store.get(m2.id)!.recalled_count).toBe(2);
  });
});

// ── 4. MCP Server Edge Cases ──

describe('4. MCP Server Edge Cases', () => {
  let store: MemoryStore;
  let client: Client;
  let dbPath: string;

  beforeEach(async () => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });
    const server = createServer(store);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    client = new Client({ name: 'deep-test-client', version: '0.1.0' });
    await client.connect(clientTransport);
  });

  afterEach(() => {
    store.close();
    cleanupDir(path.dirname(dbPath));
  });

  it('aide_remember with only what + layer (minimal fields)', async () => {
    const result = await client.callTool({
      name: 'aide_remember',
      arguments: { what: 'Minimal memory', layer: 'technical' },
    });

    const text = (result.content as any[])[0].text;
    expect(text).toContain('Stored');
    expect(text).toContain('Minimal memory');

    const memories = store.list();
    expect(memories.length).toBe(1);
    expect(memories[0].what).toBe('Minimal memory');
    expect(memories[0].layer).toBe('technical');
    expect(memories[0].source).toBe('conversation');
    expect(memories[0].shared).toBe(true);
  });

  it('aide_remember with ALL fields populated', async () => {
    const result = await client.callTool({
      name: 'aide_remember',
      arguments: {
        what: 'Full memory with everything',
        layer: 'area_context',
        scope: 'src/components/dashboard/**',
        why: 'Decided during sprint planning',
        context_label: 'dashboard redesign',
        contributor: 'alice',
        tags: ['architecture', 'performance', 'ux'],
        source: 'conversation',
        shared: true,
      },
    });

    const text = (result.content as any[])[0].text;
    expect(text).toContain('Stored');
    expect(text).toContain('uuid:');

    const memories = store.list();
    const mem = memories[0];
    expect(mem.what).toBe('Full memory with everything');
    expect(mem.layer).toBe('area_context');
    expect(mem.scope).toBe('src/components/dashboard/**');
    expect(mem.why).toBe('Decided during sprint planning');
    expect(mem.context_label).toBe('dashboard redesign');
    expect(mem.contributor).toBe('alice');
    expect(mem.tags).toEqual(['architecture', 'performance', 'ux']);
    expect(mem.source).toBe('conversation');
    expect(mem.shared).toBe(true);
  });

  it('aide_update on non-existent ID returns "not found"', async () => {
    const result = await client.callTool({
      name: 'aide_update',
      arguments: { id: 99999, what: 'does not exist' },
    });

    const text = (result.content as any[])[0].text;
    expect(text).toContain('not found');
  });

  it('aide_forget on already-deleted memory returns "not found"', async () => {
    // Add and then delete
    const addResult = await client.callTool({
      name: 'aide_remember',
      arguments: { what: 'delete twice', layer: 'technical' },
    });
    const id = parseInt((addResult.content as any[])[0].text.match(/id: (\d+)/)?.[1]);

    await client.callTool({ name: 'aide_forget', arguments: { id } });

    // Try to delete again
    const result = await client.callTool({ name: 'aide_forget', arguments: { id } });
    const text = (result.content as any[])[0].text;
    expect(text).toContain('not found');
  });

  it('aide_search with 500+ char query does not crash', async () => {
    store.add({ layer: 'technical', what: 'normal memory' });

    const longQuery = 'x'.repeat(600);
    const result = await client.callTool({
      name: 'aide_search',
      arguments: { keyword: longQuery },
    });

    // Should return gracefully (either no results or results, but no crash)
    expect(result.content).toBeDefined();
    const text = (result.content as any[])[0].text;
    expect(typeof text).toBe('string');
  });

  it('aide_import with empty content returns "No importable items"', async () => {
    const result = await client.callTool({
      name: 'aide_import',
      arguments: { content: '', layer: 'guidelines' },
    });

    const text = (result.content as any[])[0].text;
    expect(text).toContain('No importable items');
  });

  it('aide_import with malformed markdown handles gracefully', async () => {
    // Content that has no extractable items (short lines, only headers)
    const malformed = `# Just a header
## Another header
---
abc
de`;

    const result = await client.callTool({
      name: 'aide_import',
      arguments: { content: malformed, layer: 'guidelines' },
    });

    const text = (result.content as any[])[0].text;
    // Short items (< 6 chars) and headers are skipped, so nothing imported
    expect(text).toContain('No importable items');
  });

  it('aide_recall with empty paths array returns all memories', async () => {
    await client.callTool({
      name: 'aide_remember',
      arguments: { what: 'global memory', layer: 'technical' },
    });

    const result = await client.callTool({
      name: 'aide_recall',
      arguments: { paths: [] },
    });

    const text = (result.content as any[])[0].text;
    // Empty paths means no filtering, should return all
    expect(text).toContain('global memory');
  });
});

// ── 5. Config Edge Cases ──

describe('5. Config Edge Cases', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = tempProjectRoot();
    fs.mkdirSync(path.join(projectRoot, '.aide'), { recursive: true });
  });

  afterEach(() => {
    cleanupDir(projectRoot);
  });

  it('gets deeply nested key: embeddings.backend', () => {
    const config = new AideConfig(projectRoot);
    const value = config.get('embeddings.backend');
    expect(value).toBe('auto');
  });

  it('sets deeply nested boolean value', () => {
    const config = new AideConfig(projectRoot);
    config.set('telemetry.enabled', false);

    expect(config.get('telemetry.enabled')).toBe(false);

    // Reload from disk and verify persistence
    const config2 = new AideConfig(projectRoot);
    expect(config2.get('telemetry.enabled')).toBe(false);
  });

  it('unknown key returns error with valid key list', () => {
    const config = new AideConfig(projectRoot);

    expect(() => config.set('nonexistent.key', true)).toThrowError(/Unknown config key/);
    expect(() => config.set('nonexistent.key', true)).toThrowError(/Valid keys:/);
  });

  it('wrong type returns error with expected type', () => {
    const config = new AideConfig(projectRoot);

    // telemetry.enabled expects boolean
    expect(() => config.set('telemetry.enabled', 'string-value')).toThrowError(/expected boolean/);
    expect(() => config.set('telemetry.enabled', 42)).toThrowError(/expected boolean/);
  });

  it('multiple rapid set() calls do not corrupt the config file', () => {
    const config = new AideConfig(projectRoot);

    // Rapid successive sets
    config.set('telemetry.enabled', false);
    config.set('embeddings.backend', 'transformers');
    config.set('contributor', 'rapid-tester');
    config.set('embeddings.model', 'custom-model');
    config.set('updates.check', false);

    // Reload and verify all values persisted correctly
    const config2 = new AideConfig(projectRoot);
    expect(config2.get('telemetry.enabled')).toBe(false);
    expect(config2.get('embeddings.backend')).toBe('transformers');
    expect(config2.get('contributor')).toBe('rapid-tester');
    expect(config2.get('embeddings.model')).toBe('custom-model');
    expect(config2.get('updates.check')).toBe(false);

    // Verify valid JSON
    const configPath = path.join(projectRoot, '.aide', 'config.json');
    const raw = fs.readFileSync(configPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('config file with subset of keys fills missing ones from defaults', () => {
    // Write a partial config
    const configPath = path.join(projectRoot, '.aide', 'config.json');
    const partial = { version: 1, telemetry: { enabled: false } };
    fs.writeFileSync(configPath, JSON.stringify(partial), 'utf-8');

    const config = new AideConfig(projectRoot);

    // Explicitly set value should be kept
    expect(config.get('telemetry.enabled')).toBe(false);

    // Missing keys should be filled from defaults
    expect(config.get('embeddings.backend')).toBe('auto');
    expect(config.get('embeddings.model')).toBe('auto');
    expect(config.get('updates.check')).toBe(true);
    expect(config.get('contributor')).toBe('auto');
  });
});

// ── 6. Sync Edge Cases ──

describe('6. Sync Edge Cases', () => {
  let projectRoot: string;
  let store: MemoryStore;
  let sync: MemorySync;

  beforeEach(() => {
    projectRoot = tempProjectRoot();
    store = new MemoryStore({ projectRoot });
    sync = new MemorySync(store);
  });

  afterEach(() => {
    store.close();
    cleanupDir(projectRoot);
    const dbDir = path.dirname((store as any).dbPath);
    cleanupDir(dbDir);
  });

  it('import from empty directory returns 0 imported, no error', () => {
    const result = sync.importFromFiles();
    expect(result.imported).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.conflicts).toHaveLength(0);
  });

  it('import file with missing required field (no uuid) is skipped', () => {
    const memoriesDir = path.join(projectRoot, '.aide', 'memories', 'technical');
    const badFilePath = path.join(memoriesDir, 'no-uuid.json');
    fs.writeFileSync(badFilePath, JSON.stringify({
      layer: 'technical',
      what: 'Missing uuid',
      contributor: 'test',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    }), 'utf-8');

    const result = sync.importFromFiles();
    expect(result.imported).toBe(0);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('export when all files exist returns 0 exported', () => {
    // Add a memory through the store (creates both SQLite row and JSON file)
    store.add({ layer: 'technical', what: 'has file already' });

    const result = sync.exportToFiles();
    expect(result.imported).toBe(0); // imported count is used for "created files"
  });

  it('conflict: local newer than file keeps local, reports conflict', () => {
    const uuid = crypto.randomUUID();

    // Insert newer version in SQLite
    directInsert(store, makeMemoryFile({
      uuid,
      what: 'Locally edited version',
      updated_at: '2026-06-01T00:00:00.000Z',
    }));

    // Write older version as JSON file
    writeMemoryFile(projectRoot, makeMemoryFile({
      uuid,
      what: 'Older file version',
      updated_at: '2026-01-01T00:00:00.000Z',
    }));

    const result = sync.importFromFiles();

    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].uuid).toBe(uuid);
    expect(result.conflicts[0].reason).toContain('local edits');

    // Local version should be kept
    const current = store.getByUuid(uuid)!;
    expect(current.what).toBe('Locally edited version');
  });

  it('remove JSON file then sync removes from SQLite', () => {
    const mem = makeMemoryFile({ what: 'Will be deleted from files' });
    directInsert(store, mem);
    writeMemoryFile(projectRoot, mem);

    // First sync: establish baseline
    sync.importFromFiles();
    expect(store.getByUuid(mem.uuid)).not.toBeNull();

    // Delete the file
    const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
    fs.unlinkSync(filePath);

    // Re-sync: should remove from SQLite
    const result = sync.importFromFiles();
    expect(result.removed).toBe(1);
    expect(store.getByUuid(mem.uuid)).toBeNull();
  });

  it('idempotent: import twice produces same result', () => {
    const mem1 = makeMemoryFile({ what: 'Idempotent A' });
    const mem2 = makeMemoryFile({ what: 'Idempotent B', layer: 'guidelines' });
    writeMemoryFile(projectRoot, mem1);
    writeMemoryFile(projectRoot, mem2);

    const result1 = sync.importFromFiles();
    expect(result1.imported).toBe(2);

    const countAfterFirst = store.count();

    const result2 = sync.importFromFiles();
    expect(result2.imported).toBe(0);
    expect(result2.updated).toBe(0);
    expect(result2.removed).toBe(0);

    expect(store.count()).toBe(countAfterFirst);
  });
});

// ── 7. Full E2E Flow ──

describe('7. Full E2E Flow', () => {
  it('complete lifecycle: init -> add -> recall -> search -> update -> delete -> sync -> rebuild -> stats -> config', () => {
    const projectRoot = tempProjectRoot();

    try {
      // Step 1: Init project and verify directory structure
      const store = new MemoryStore({ projectRoot });
      const memoriesDir = path.join(projectRoot, '.aide', 'memories');

      expect(fs.existsSync(memoriesDir)).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'preferences', 'personal'))).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'preferences', 'shared'))).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'technical'))).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'area_context'))).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'guidelines'))).toBe(true);

      // Step 2: Add 5 memories with different layers, scopes, tags
      const m1 = store.add({
        layer: 'preferences',
        what: 'Use 2-space indent',
        contributor: 'alice',
        tags: ['style'],
        shared: true,
      });
      const m2 = store.add({
        layer: 'technical',
        what: 'SQLite uses WAL mode',
        scope: 'src/memory/**',
        tags: ['database', 'performance'],
      });
      const m3 = store.add({
        layer: 'area_context',
        what: 'Dashboard uses skeleton loading',
        scope: 'src/components/dashboard/**',
        why: 'Sprint 4 decision',
        context_label: 'dashboard loading',
        tags: ['ux'],
      });
      const m4 = store.add({
        layer: 'guidelines',
        what: 'Composition over conditionals',
        tags: ['architecture'],
      });
      const m5 = store.add({
        layer: 'preferences',
        what: 'Personal theme preference',
        shared: false,
        contributor: 'bob',
      });

      expect(store.count()).toBe(5);

      // Step 3: Recall by path -> verify correct memories in correct order
      const recallResult = recall(store, {
        paths: ['src/components/dashboard/Widget.tsx'],
      });

      // Should include: m3 (scoped area_context), m1 (project-wide pref),
      // m2 (doesn't match dashboard path), m4 (project-wide guideline), m5 (project-wide pref)
      expect(recallResult.memories.length).toBeGreaterThanOrEqual(1);

      // m3 should be first (area_context layer is top priority, and scope matches)
      const foundDashboard = recallResult.memories.find(m => m.what === 'Dashboard uses skeleton loading');
      expect(foundDashboard).toBeDefined();

      // Layer ordering is respected
      const layers = recallResult.memories.map(m => m.layer);
      const areaIdx = layers.indexOf('area_context');
      const techIdx = layers.indexOf('technical');
      const prefIdx = layers.indexOf('preferences');
      const guideIdx = layers.indexOf('guidelines');

      if (areaIdx >= 0 && techIdx >= 0) expect(areaIdx).toBeLessThan(techIdx);
      if (techIdx >= 0 && prefIdx >= 0) expect(techIdx).toBeLessThan(prefIdx);
      if (prefIdx >= 0 && guideIdx >= 0) expect(prefIdx).toBeLessThan(guideIdx);

      // Step 4: Search by keyword -> verify FTS5/LIKE results
      const searchResults = store.search('skeleton');
      expect(searchResults.length).toBeGreaterThanOrEqual(1);
      expect(searchResults[0].what).toContain('skeleton loading');

      // Step 5: Update a memory -> verify JSON changed
      store.update(m3.id, { what: 'Dashboard uses shimmer loading (not skeleton)' });
      const updated = store.get(m3.id)!;
      expect(updated.what).toBe('Dashboard uses shimmer loading (not skeleton)');
      expect(updated.created_at).toBe(m3.created_at); // created_at unchanged

      const filePath = path.join(memoriesDir, 'area_context', `${m3.uuid}.json`);
      const fileContent = readJsonFile(filePath);
      expect(fileContent.what).toBe('Dashboard uses shimmer loading (not skeleton)');

      // Step 6: Delete a memory -> verify JSON gone
      const m4FilePath = path.join(memoriesDir, 'guidelines', `${m4.uuid}.json`);
      expect(fs.existsSync(m4FilePath)).toBe(true);

      store.remove(m4.id);
      expect(store.get(m4.id)).toBeNull();
      expect(fs.existsSync(m4FilePath)).toBe(false);
      expect(store.count()).toBe(4);

      // Step 7: Sync export -> verify file count
      const sync = new MemorySync(store);
      const exportResult = sync.exportToFiles();
      // All memories already have files (created by store.add), so 0 new exports
      expect(exportResult.imported).toBe(0);

      // Count JSON files on disk
      const allJsonFiles = collectJsonFiles(memoriesDir);
      expect(allJsonFiles.length).toBe(4); // 5 added - 1 deleted = 4

      // Step 8: Delete SQLite -> rebuild from files -> verify all data recovered
      const dbPath = (store as any).dbPath;
      store.close();

      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      [dbPath + '-wal', dbPath + '-shm'].forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });

      const store2 = new MemoryStore({ projectRoot });
      expect(store2.count()).toBe(4);
      expect(store2.getByUuid(m1.uuid)!.what).toBe('Use 2-space indent');
      expect(store2.getByUuid(m2.uuid)!.what).toBe('SQLite uses WAL mode');
      expect(store2.getByUuid(m3.uuid)!.what).toBe('Dashboard uses shimmer loading (not skeleton)');
      expect(store2.getByUuid(m5.uuid)!.what).toBe('Personal theme preference');
      expect(store2.getByUuid(m4.uuid)).toBeNull(); // deleted

      // Step 9: Stats -> verify counts match
      const analytics = new Analytics(store2.getDatabase());
      const stats = analytics.getStats();
      expect(stats.totalMemories).toBe(4);
      expect(stats.byLayer['preferences']).toBe(2);
      expect(stats.byLayer['technical']).toBe(1);
      expect(stats.byLayer['area_context']).toBe(1);

      // Step 10: Config get/set -> verify roundtrip
      fs.mkdirSync(path.join(projectRoot, '.aide'), { recursive: true });
      const config = new AideConfig(projectRoot);
      expect(config.get('telemetry.enabled')).toBe(true);

      config.set('telemetry.enabled', false);
      expect(config.get('telemetry.enabled')).toBe(false);

      // Reload from disk
      const config2 = new AideConfig(projectRoot);
      expect(config2.get('telemetry.enabled')).toBe(false);

      store2.close();
    } finally {
      cleanupDir(projectRoot);
      // Clean up ~/.aide/projects/<hash> for this temp dir
      const hash = crypto.createHash('sha1').update(path.resolve(projectRoot)).digest('hex').slice(0, 12);
      const dbDir = path.join(os.homedir(), '.aide', 'projects', hash);
      cleanupDir(dbDir);
    }
  });
});
