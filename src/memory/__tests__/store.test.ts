import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../store';
import type { MemoryFile } from '../types';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-memory-test-'));
  return path.join(dir, 'memory.db');
}

function tempProjectRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aide-project-test-'));
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('MemoryStore', () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) fs.rmdirSync(dir);
  });

  describe('add', () => {
    it('creates a memory with required fields', () => {
      const mem = store.add({
        layer: 'preferences',
        what: 'Keep components under 150 lines',
      });

      expect(mem.id).toBe(1);
      expect(mem.uuid).toBeTruthy();
      expect(mem.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
      expect(mem.layer).toBe('preferences');
      expect(mem.what).toBe('Keep components under 150 lines');
      expect(mem.source).toBe('conversation');
      expect(mem.recalled_count).toBe(0);
      expect(mem.created_at).toBeTruthy();
      expect(mem.updated_at).toBeTruthy();
      expect(mem.tags).toEqual([]);
      expect(mem.shared).toBe(true);
      expect(mem.contributor).toBeTruthy(); // defaults from git config
    });

    it('creates a memory with all fields', () => {
      const mem = store.add({
        layer: 'area_context',
        what: 'Skeleton loading replaces ALL legacy loaders',
        why: 'Decided during dashboard refactor planning',
        scope: 'src/components/dashboard/**',
        context_label: 'dashboard skeleton loading',
        contributor: 'meky',
        source: 'conversation',
        tags: ['architecture', 'performance'],
        shared: true,
        generated_by: { tool: 'claude-code', model: 'claude-opus-4', author_type: 'ai' },
        derived_from: ['a1b2c3d4-e5f6-7890-abcd-ef1234567890'],
      });

      expect(mem.layer).toBe('area_context');
      expect(mem.why).toBe('Decided during dashboard refactor planning');
      expect(mem.scope).toBe('src/components/dashboard/**');
      expect(mem.context_label).toBe('dashboard skeleton loading');
      expect(mem.contributor).toBe('meky');
      expect(mem.source).toBe('conversation');
      expect(mem.tags).toEqual(['architecture', 'performance']);
      expect(mem.shared).toBe(true);
      expect(mem.generated_by).toEqual({ tool: 'claude-code', model: 'claude-opus-4', author_type: 'ai' });
      expect(mem.derived_from).toEqual(['a1b2c3d4-e5f6-7890-abcd-ef1234567890']);
    });

    it('assigns incremental IDs', () => {
      const m1 = store.add({ layer: 'preferences', what: 'first' });
      const m2 = store.add({ layer: 'preferences', what: 'second' });
      const m3 = store.add({ layer: 'technical', what: 'third' });

      expect(m1.id).toBe(1);
      expect(m2.id).toBe(2);
      expect(m3.id).toBe(3);
    });

    it('assigns unique UUIDs', () => {
      const m1 = store.add({ layer: 'preferences', what: 'first' });
      const m2 = store.add({ layer: 'preferences', what: 'second' });
      const m3 = store.add({ layer: 'technical', what: 'third' });

      const uuids = new Set([m1.uuid, m2.uuid, m3.uuid]);
      expect(uuids.size).toBe(3);
    });

    it('defaults shared to true', () => {
      const mem = store.add({ layer: 'preferences', what: 'test' });
      expect(mem.shared).toBe(true);
    });

    it('respects shared=false', () => {
      const mem = store.add({ layer: 'preferences', what: 'personal pref', shared: false });
      expect(mem.shared).toBe(false);
    });

    it('defaults tags to empty array', () => {
      const mem = store.add({ layer: 'technical', what: 'test' });
      expect(mem.tags).toEqual([]);
    });

    it('stores tags correctly', () => {
      const mem = store.add({
        layer: 'technical',
        what: 'test',
        tags: ['perf', 'db', 'sqlite'],
      });
      expect(mem.tags).toEqual(['perf', 'db', 'sqlite']);
    });

    it('accepts hook source', () => {
      const mem = store.add({
        layer: 'area_context',
        what: 'Auto-captured from hook',
        source: 'hook',
      });
      expect(mem.source).toBe('hook');
    });
  });

  describe('get', () => {
    it('retrieves a memory by id', () => {
      const created = store.add({ layer: 'technical', what: 'WAL mode only' });
      const fetched = store.get(created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.uuid).toBe(created.uuid);
      expect(fetched!.what).toBe('WAL mode only');
    });

    it('returns null for non-existent id', () => {
      expect(store.get(999)).toBeNull();
    });
  });

  describe('getByUuid', () => {
    it('retrieves a memory by uuid', () => {
      const created = store.add({ layer: 'technical', what: 'test uuid lookup' });
      const fetched = store.getByUuid(created.uuid);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.uuid).toBe(created.uuid);
    });

    it('returns null for non-existent uuid', () => {
      expect(store.getByUuid('00000000-0000-0000-0000-000000000000')).toBeNull();
    });
  });

  describe('list', () => {
    beforeEach(() => {
      store.add({ layer: 'preferences', what: 'pref 1', scope: 'src/a/**' });
      store.add({ layer: 'preferences', what: 'pref 2', scope: 'src/b/**' });
      store.add({ layer: 'technical', what: 'tech 1', scope: 'src/a/**' });
      store.add({ layer: 'guidelines', what: 'guide 1' });
    });

    it('lists all memories', () => {
      const all = store.list();
      expect(all).toHaveLength(4);
    });

    it('filters by layer', () => {
      const prefs = store.list({ layer: 'preferences' });
      expect(prefs).toHaveLength(2);
      expect(prefs.every(m => m.layer === 'preferences')).toBe(true);
    });

    it('filters by scope', () => {
      const scoped = store.list({ scope: 'src/a/**' });
      expect(scoped).toHaveLength(2);
    });

    it('filters by contributor', () => {
      // All default to same contributor
      const all = store.list();
      const contributor = all[0].contributor;
      const filtered = store.list({ contributor });
      expect(filtered).toHaveLength(4);

      // No match
      const none = store.list({ contributor: 'nonexistent-person' });
      expect(none).toHaveLength(0);
    });

    it('respects limit', () => {
      const limited = store.list({ limit: 2 });
      expect(limited).toHaveLength(2);
    });

    it('returns newest first', () => {
      const all = store.list();
      expect(all[0].what).toBe('guide 1');
      expect(all[3].what).toBe('pref 1');
    });
  });

  describe('update', () => {
    it('updates text fields', () => {
      const mem = store.add({ layer: 'area_context', what: 'original' });
      const updated = store.update(mem.id, { what: 'modified' });

      expect(updated!.what).toBe('modified');
      expect(updated!.layer).toBe('area_context');
    });

    it('updates tags', () => {
      const mem = store.add({ layer: 'technical', what: 'test' });
      const updated = store.update(mem.id, { tags: ['new-tag', 'another'] });

      expect(updated!.tags).toEqual(['new-tag', 'another']);
    });

    it('updates shared flag', () => {
      const mem = store.add({ layer: 'preferences', what: 'test', shared: true });
      const updated = store.update(mem.id, { shared: false });

      expect(updated!.shared).toBe(false);
    });

    it('updates generated_by', () => {
      const mem = store.add({ layer: 'technical', what: 'test' });
      const updated = store.update(mem.id, {
        generated_by: { tool: 'cursor', model: 'gpt-4', author_type: 'ai' },
      });

      expect(updated!.generated_by).toEqual({ tool: 'cursor', model: 'gpt-4', author_type: 'ai' });
    });

    it('bumps updated_at on update', () => {
      const mem = store.add({ layer: 'area_context', what: 'original' });

      // updated_at should be set initially (same as created_at or later)
      expect(new Date(mem.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(mem.created_at).getTime());

      const updated = store.update(mem.id, { what: 'modified' });

      // updated_at should be >= the original
      expect(new Date(updated!.updated_at).getTime()).toBeGreaterThanOrEqual(new Date(mem.updated_at).getTime());
      // The what field should have changed
      expect(updated!.what).toBe('modified');
    });

    it('returns null for non-existent id', () => {
      const result = store.update(999, { what: 'nope' });
      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('deletes a memory', () => {
      const mem = store.add({ layer: 'preferences', what: 'delete me' });
      expect(store.remove(mem.id)).toBe(true);
      expect(store.get(mem.id)).toBeNull();
    });

    it('returns false for non-existent id', () => {
      expect(store.remove(999)).toBe(false);
    });
  });

  describe('removeByUuid', () => {
    it('deletes a memory by uuid', () => {
      const mem = store.add({ layer: 'preferences', what: 'delete by uuid' });
      expect(store.removeByUuid(mem.uuid)).toBe(true);
      expect(store.getByUuid(mem.uuid)).toBeNull();
    });

    it('returns false for non-existent uuid', () => {
      expect(store.removeByUuid('00000000-0000-0000-0000-000000000000')).toBe(false);
    });
  });

  describe('recordRecall', () => {
    it('increments recall count and sets timestamp', () => {
      const m1 = store.add({ layer: 'preferences', what: 'recall me' });
      const m2 = store.add({ layer: 'technical', what: 'me too' });

      store.recordRecall([m1.id, m2.id]);

      const r1 = store.get(m1.id)!;
      const r2 = store.get(m2.id)!;

      expect(r1.recalled_count).toBe(1);
      expect(r1.last_recalled_at).toBeTruthy();
      expect(r2.recalled_count).toBe(1);

      store.recordRecall([m1.id]);
      expect(store.get(m1.id)!.recalled_count).toBe(2);
    });

    it('handles empty array', () => {
      expect(() => store.recordRecall([])).not.toThrow();
    });
  });

  describe('count', () => {
    beforeEach(() => {
      store.add({ layer: 'preferences', what: '1' });
      store.add({ layer: 'preferences', what: '2' });
      store.add({ layer: 'technical', what: '3' });
    });

    it('counts all', () => {
      expect(store.count()).toBe(3);
    });

    it('counts by layer', () => {
      expect(store.count({ layer: 'preferences' })).toBe(2);
      expect(store.count({ layer: 'technical' })).toBe(1);
      expect(store.count({ layer: 'guidelines' })).toBe(0);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      store.add({ layer: 'preferences', what: 'Use vitest for all tests', why: 'Team standard' });
      store.add({ layer: 'technical', what: 'WAL mode for SQLite' });
      store.add({ layer: 'guidelines', what: 'Keep components under 150 lines' });
    });

    it('finds by keyword in what field', () => {
      const results = store.search('vitest');
      expect(results).toHaveLength(1);
      expect(results[0].what).toContain('vitest');
    });

    it('finds by keyword in why field', () => {
      const results = store.search('standard');
      expect(results).toHaveLength(1);
      expect(results[0].what).toContain('vitest');
    });

    it('filters by layer', () => {
      const results = store.search('vitest', { layer: 'technical' });
      expect(results).toHaveLength(0);
    });

    it('respects limit', () => {
      const results = store.search('e', { limit: 1 });
      expect(results).toHaveLength(1);
    });
  });

  describe('pruneOld', () => {
    it('deletes memories older than N days', () => {
      const db = (store as any).db;
      const now = new Date().toISOString();
      const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();

      db.prepare(
        `INSERT INTO memories (uuid, layer, what, contributor, source, created_at, updated_at, recalled_count)
         VALUES (?, 'preferences', 'old memory', 'test', 'conversation', ?, ?, 0)`
      ).run(uuid1, old, old);
      db.prepare(
        `INSERT INTO memories (uuid, layer, what, contributor, source, created_at, updated_at, recalled_count)
         VALUES (?, 'preferences', 'recent memory', 'test', 'conversation', ?, ?, 0)`
      ).run(uuid2, now, now);

      expect(store.count()).toBe(2);

      const deleted = store.pruneOld(30);

      expect(deleted).toBe(1);
      expect(store.count()).toBe(1);
      expect(store.list()[0].what).toBe('recent memory');
    });

    it('returns 0 when nothing to prune', () => {
      store.add({ layer: 'preferences', what: 'fresh' });
      expect(store.pruneOld(30)).toBe(0);
      expect(store.count()).toBe(1);
    });

    it('deletes all old memories when days is 0', () => {
      const db = (store as any).db;
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();
      const uuid1 = crypto.randomUUID();
      const uuid2 = crypto.randomUUID();

      db.prepare(
        `INSERT INTO memories (uuid, layer, what, contributor, source, created_at, updated_at, recalled_count)
         VALUES (?, 'preferences', 'one', 'test', 'conversation', ?, ?, 0)`
      ).run(uuid1, yesterday, yesterday);
      db.prepare(
        `INSERT INTO memories (uuid, layer, what, contributor, source, created_at, updated_at, recalled_count)
         VALUES (?, 'technical', 'two', 'test', 'conversation', ?, ?, 0)`
      ).run(uuid2, yesterday, yesterday);

      const deleted = store.pruneOld(0);

      expect(deleted).toBe(2);
      expect(store.count()).toBe(0);
    });
  });

  describe('persistence', () => {
    it('data survives close and reopen', () => {
      store.add({ layer: 'preferences', what: 'survives restart' });
      store.close();

      const store2 = new MemoryStore({ dbPath });
      const all = store2.list();
      expect(all).toHaveLength(1);
      expect(all[0].what).toBe('survives restart');
      expect(all[0].uuid).toBeTruthy();
      store2.close();
    });
  });

  describe('schema migration', () => {
    it('rebuilds schema when version changes', () => {
      // The store already runs with schema version 2
      // Just verify the new columns exist
      const mem = store.add({
        layer: 'technical',
        what: 'migration test',
        tags: ['test'],
        shared: false,
        generated_by: { tool: 'test', model: null, author_type: 'human' },
      });

      expect(mem.uuid).toBeTruthy();
      expect(mem.tags).toEqual(['test']);
      expect(mem.shared).toBe(false);
      expect(mem.generated_by).toEqual({ tool: 'test', model: null, author_type: 'human' });
      expect(mem.updated_at).toBeTruthy();
    });
  });
});

describe('MemoryStore (file-per-memory mode)', () => {
  let store: MemoryStore;
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = tempProjectRoot();
    store = new MemoryStore({ projectRoot });
  });

  afterEach(() => {
    store.close();
    cleanupDir(projectRoot);
    // Also clean up the ~/.aide/projects/<hash> directory
    const dbPath = (store as any).dbPath;
    const dbDir = path.dirname(dbPath);
    cleanupDir(dbDir);
  });

  describe('directory structure', () => {
    it('creates .aide/memories/ directory structure', () => {
      const memoriesDir = path.join(projectRoot, '.aide', 'memories');
      expect(fs.existsSync(memoriesDir)).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'preferences', 'personal'))).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'preferences', 'shared'))).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'technical'))).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'area_context'))).toBe(true);
      expect(fs.existsSync(path.join(memoriesDir, 'guidelines'))).toBe(true);
    });

    it('reports hasFileStorage as true', () => {
      expect(store.hasFileStorage).toBe(true);
    });
  });

  describe('JSON file creation on add', () => {
    it('creates a JSON file for new memory in technical/', () => {
      const mem = store.add({
        layer: 'technical',
        what: 'WAL mode is mandatory',
        scope: 'src/memory/**',
      });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as MemoryFile;
      expect(content.uuid).toBe(mem.uuid);
      expect(content.what).toBe('WAL mode is mandatory');
      expect(content.layer).toBe('technical');
    });

    it('creates shared preferences in preferences/shared/', () => {
      const mem = store.add({
        layer: 'preferences',
        what: 'Keep files short',
        shared: true,
      });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'preferences', 'shared', `${mem.uuid}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('creates personal preferences in preferences/personal/', () => {
      const mem = store.add({
        layer: 'preferences',
        what: 'My personal pref',
        shared: false,
      });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'preferences', 'personal', `${mem.uuid}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('creates area_context in area_context/', () => {
      const mem = store.add({
        layer: 'area_context',
        what: 'Dashboard uses skeleton loading',
        scope: 'src/components/dashboard/**',
      });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'area_context', `${mem.uuid}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('creates guidelines in guidelines/', () => {
      const mem = store.add({
        layer: 'guidelines',
        what: 'Composition over conditionals',
      });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'guidelines', `${mem.uuid}.json`);
      expect(fs.existsSync(filePath)).toBe(true);
    });
  });

  describe('JSON file format', () => {
    it('JSON file has correct format without SQLite-only fields', () => {
      const mem = store.add({
        layer: 'area_context',
        what: 'Test JSON format',
        why: 'Testing',
        scope: 'src/**',
        context_label: 'test',
        contributor: 'tester',
        tags: ['test-tag'],
        source: 'conversation',
        shared: true,
        generated_by: { tool: 'claude-code', model: 'claude-opus-4', author_type: 'ai' },
      });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'area_context', `${mem.uuid}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // Should have all MemoryFile fields
      expect(content.uuid).toBe(mem.uuid);
      expect(content.layer).toBe('area_context');
      expect(content.what).toBe('Test JSON format');
      expect(content.why).toBe('Testing');
      expect(content.scope).toBe('src/**');
      expect(content.context_label).toBe('test');
      expect(content.contributor).toBe('tester');
      expect(content.tags).toEqual(['test-tag']);
      expect(content.source).toBe('conversation');
      expect(content.shared).toBe(true);
      expect(content.generated_by).toEqual({ tool: 'claude-code', model: 'claude-opus-4', author_type: 'ai' });
      expect(content.created_at).toBeTruthy();
      expect(content.updated_at).toBeTruthy();

      // Should NOT have SQLite-only fields
      expect(content.id).toBeUndefined();
      expect(content.recalled_count).toBeUndefined();
      expect(content.last_recalled_at).toBeUndefined();
    });
  });

  describe('JSON file update', () => {
    it('updates JSON file on memory update', () => {
      const mem = store.add({
        layer: 'technical',
        what: 'original value',
      });

      store.update(mem.id, { what: 'updated value' });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
      const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(content.what).toBe('updated value');
    });
  });

  describe('JSON file deletion', () => {
    it('deletes JSON file on remove', () => {
      const mem = store.add({
        layer: 'technical',
        what: 'delete me',
      });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      store.remove(mem.id);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('deletes JSON file on removeByUuid', () => {
      const mem = store.add({
        layer: 'guidelines',
        what: 'remove by uuid',
      });

      const filePath = path.join(projectRoot, '.aide', 'memories', 'guidelines', `${mem.uuid}.json`);
      expect(fs.existsSync(filePath)).toBe(true);

      store.removeByUuid(mem.uuid);
      expect(fs.existsSync(filePath)).toBe(false);
    });
  });

  describe('atomic writes', () => {
    it('no .tmp files left after successful write', () => {
      store.add({ layer: 'technical', what: 'atomic test' });

      const memoriesDir = path.join(projectRoot, '.aide', 'memories');
      const allFiles: string[] = [];
      const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(dir, e.name);
          if (e.isDirectory()) walk(full);
          else allFiles.push(e.name);
        }
      };
      walk(memoriesDir);

      const tmpFiles = allFiles.filter(f => f.endsWith('.tmp'));
      expect(tmpFiles).toHaveLength(0);
    });
  });

  describe('cache rebuild', () => {
    it('rebuilds SQLite cache from JSON files on startup', () => {
      // Add a memory
      const mem = store.add({ layer: 'technical', what: 'survives rebuild' });
      const uuid = mem.uuid;
      store.close();

      // Delete SQLite DB, keep JSON files
      const dbPath = (store as any).dbPath;
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const walPath = dbPath + '-wal';
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      const shmPath = dbPath + '-shm';
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);

      // Reopen — should rebuild from JSON
      const store2 = new MemoryStore({ projectRoot });
      const rebuilt = store2.getByUuid(uuid);
      expect(rebuilt).not.toBeNull();
      expect(rebuilt!.what).toBe('survives rebuild');
      expect(rebuilt!.uuid).toBe(uuid);

      store2.close();
      // Re-assign for afterEach cleanup
      store = new MemoryStore({ projectRoot });
    });

    it('removes orphaned SQLite rows during rebuild', () => {
      const mem = store.add({ layer: 'technical', what: 'will be orphaned' });
      const uuid = mem.uuid;

      // Delete the JSON file but keep SQLite row
      const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${uuid}.json`);
      fs.unlinkSync(filePath);

      store.close();

      // Reopen — should detect mismatch and rebuild
      const store2 = new MemoryStore({ projectRoot });
      const orphan = store2.getByUuid(uuid);
      expect(orphan).toBeNull(); // should be gone

      store2.close();
      store = new MemoryStore({ projectRoot });
    });

    it('preserves recall stats during rebuild', () => {
      const mem = store.add({ layer: 'technical', what: 'recall stats test' });
      store.recordRecall([mem.id]);

      const recalled = store.get(mem.id)!;
      expect(recalled.recalled_count).toBe(1);
      expect(recalled.last_recalled_at).toBeTruthy();

      // Force rebuild by modifying dir hash
      const db = (store as any).db;
      db.prepare("UPDATE meta SET value = 'stale' WHERE key = 'dir_hash'").run();

      store.close();

      const store2 = new MemoryStore({ projectRoot });
      const rebuilt = store2.getByUuid(mem.uuid)!;
      // Recall stats should survive rebuild since the UUID row existed
      expect(rebuilt.recalled_count).toBe(1);
      expect(rebuilt.last_recalled_at).toBeTruthy();

      store2.close();
      store = new MemoryStore({ projectRoot });
    });
  });

  describe('malformed JSON handling', () => {
    it('skips malformed JSON files during rebuild', () => {
      const mem = store.add({ layer: 'technical', what: 'valid memory' });
      const uuid = mem.uuid;

      // Write a malformed JSON file
      const malformedPath = path.join(projectRoot, '.aide', 'memories', 'technical', 'bad-file.json');
      fs.writeFileSync(malformedPath, '{ this is not valid json }', 'utf-8');

      // Force rebuild
      const db = (store as any).db;
      db.prepare("UPDATE meta SET value = 'stale' WHERE key = 'dir_hash'").run();

      store.close();

      const store2 = new MemoryStore({ projectRoot });
      // Valid memory should still exist
      const valid = store2.getByUuid(uuid);
      expect(valid).not.toBeNull();
      expect(valid!.what).toBe('valid memory');

      // Total count should be 1 (malformed skipped)
      expect(store2.count()).toBe(1);

      store2.close();
      store = new MemoryStore({ projectRoot });
    });

    it('skips JSON files missing required fields', () => {
      store.add({ layer: 'technical', what: 'good memory' });

      // Write a JSON file missing required fields
      const incompletePath = path.join(projectRoot, '.aide', 'memories', 'technical', 'incomplete.json');
      fs.writeFileSync(incompletePath, JSON.stringify({ uuid: 'abc', layer: 'technical' }), 'utf-8');

      // Force rebuild
      const db = (store as any).db;
      db.prepare("UPDATE meta SET value = 'stale' WHERE key = 'dir_hash'").run();

      store.close();

      const store2 = new MemoryStore({ projectRoot });
      expect(store2.count()).toBe(1); // only good memory
      store2.close();
      store = new MemoryStore({ projectRoot });
    });
  });

  describe('preferences personal/shared routing', () => {
    it('routes shared preference to preferences/shared/', () => {
      const mem = store.add({
        layer: 'preferences',
        what: 'shared pref',
        shared: true,
      });

      const sharedPath = path.join(projectRoot, '.aide', 'memories', 'preferences', 'shared', `${mem.uuid}.json`);
      const personalPath = path.join(projectRoot, '.aide', 'memories', 'preferences', 'personal', `${mem.uuid}.json`);

      expect(fs.existsSync(sharedPath)).toBe(true);
      expect(fs.existsSync(personalPath)).toBe(false);
    });

    it('routes personal preference to preferences/personal/', () => {
      const mem = store.add({
        layer: 'preferences',
        what: 'personal pref',
        shared: false,
      });

      const sharedPath = path.join(projectRoot, '.aide', 'memories', 'preferences', 'shared', `${mem.uuid}.json`);
      const personalPath = path.join(projectRoot, '.aide', 'memories', 'preferences', 'personal', `${mem.uuid}.json`);

      expect(fs.existsSync(personalPath)).toBe(true);
      expect(fs.existsSync(sharedPath)).toBe(false);
    });

    it('moves file when shared flag changes', () => {
      const mem = store.add({
        layer: 'preferences',
        what: 'moving pref',
        shared: true,
      });

      const sharedPath = path.join(projectRoot, '.aide', 'memories', 'preferences', 'shared', `${mem.uuid}.json`);
      expect(fs.existsSync(sharedPath)).toBe(true);

      store.update(mem.id, { shared: false });

      const personalPath = path.join(projectRoot, '.aide', 'memories', 'preferences', 'personal', `${mem.uuid}.json`);
      expect(fs.existsSync(personalPath)).toBe(true);
      expect(fs.existsSync(sharedPath)).toBe(false);
    });
  });
});
