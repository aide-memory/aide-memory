import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../store';
import fs from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-memory-test-'));
  return path.join(dir, 'memory.db');
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
      expect(mem.layer).toBe('preferences');
      expect(mem.what).toBe('Keep components under 150 lines');
      expect(mem.status).toBe('active');
      expect(mem.source).toBe('conversation');
      expect(mem.recalled_count).toBe(0);
      expect(mem.created_at).toBeTruthy();
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
        derived_from: [1, 2],
      });

      expect(mem.layer).toBe('area_context');
      expect(mem.why).toBe('Decided during dashboard refactor planning');
      expect(mem.scope).toBe('src/components/dashboard/**');
      expect(mem.context_label).toBe('dashboard skeleton loading');
      expect(mem.contributor).toBe('meky');
      expect(mem.source).toBe('conversation');
      expect(mem.derived_from).toEqual([1, 2]);
    });

    it('assigns incremental IDs', () => {
      const m1 = store.add({ layer: 'preferences', what: 'first' });
      const m2 = store.add({ layer: 'preferences', what: 'second' });
      const m3 = store.add({ layer: 'technical', what: 'third' });

      expect(m1.id).toBe(1);
      expect(m2.id).toBe(2);
      expect(m3.id).toBe(3);
    });
  });

  describe('get', () => {
    it('retrieves a memory by id', () => {
      const created = store.add({ layer: 'technical', what: 'WAL mode only' });
      const fetched = store.get(created.id);

      expect(fetched).not.toBeNull();
      expect(fetched!.id).toBe(created.id);
      expect(fetched!.what).toBe('WAL mode only');
    });

    it('returns null for non-existent id', () => {
      expect(store.get(999)).toBeNull();
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
    it('updates fields', () => {
      const mem = store.add({ layer: 'area_context', what: 'original' });
      const updated = store.update(mem.id, { what: 'modified', status: 'completed' });

      expect(updated!.what).toBe('modified');
      expect(updated!.status).toBe('completed');
      expect(updated!.layer).toBe('area_context');
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

  describe('archive', () => {
    it('sets status to archived', () => {
      const mem = store.add({ layer: 'preferences', what: 'archive me' });
      const archived = store.archive(mem.id);

      expect(archived!.status).toBe('archived');
      expect(archived!.what).toBe('archive me');
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

  describe('persistence', () => {
    it('data survives close and reopen', () => {
      store.add({ layer: 'preferences', what: 'survives restart' });
      store.close();

      const store2 = new MemoryStore({ dbPath });
      const all = store2.list();
      expect(all).toHaveLength(1);
      expect(all[0].what).toBe('survives restart');
      store2.close();
    });
  });
});
