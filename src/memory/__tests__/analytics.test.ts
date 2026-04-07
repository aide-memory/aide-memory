import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Analytics } from '../analytics';
import { MemoryStore } from '../store';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-analytics-test-'));
  return path.join(dir, 'memory.db');
}

describe('Analytics', () => {
  let store: MemoryStore;
  let analytics: Analytics;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });
    analytics = new Analytics(store.getDatabase());
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const walPath = dbPath + '-wal';
    const shmPath = dbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) fs.rmdirSync(dir);
  });

  describe('table creation', () => {
    it('creates the analytics table on construction', () => {
      const db = store.getDatabase();
      const tables = db.prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='analytics'"
      ).all() as { name: string }[];
      expect(tables).toHaveLength(1);
      expect(tables[0].name).toBe('analytics');
    });
  });

  describe('logEvent', () => {
    it('writes an event to the analytics table', () => {
      analytics.logEvent('memory_stored', 'technical', 'claude-code');

      const events = analytics.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('memory_stored');
      expect(events[0].value).toBe('technical');
      expect(events[0].tool).toBe('claude-code');
      expect(events[0].timestamp).toBeTruthy();
    });

    it('stores event with null value and tool when omitted', () => {
      analytics.logEvent('hook_triggered');

      const events = analytics.getEvents();
      expect(events).toHaveLength(1);
      expect(events[0].value).toBeNull();
      expect(events[0].tool).toBeNull();
    });
  });

  describe('getEvents', () => {
    beforeEach(() => {
      analytics.logEvent('memory_stored', 'technical', 'claude-code');
      analytics.logEvent('memory_recalled', '3', 'cursor');
      analytics.logEvent('memory_stored', 'preferences', 'cli');
      analytics.logEvent('search_performed', 'fts5', 'claude-code');
    });

    it('returns all events when no filter', () => {
      const events = analytics.getEvents();
      expect(events).toHaveLength(4);
    });

    it('returns events filtered by type', () => {
      const events = analytics.getEvents({ event: 'memory_stored' });
      expect(events).toHaveLength(2);
      expect(events.every(e => e.event === 'memory_stored')).toBe(true);
    });

    it('returns events filtered by time range', () => {
      // Insert a backdated event via raw SQL
      const db = store.getDatabase();
      const oldDate = new Date(Date.now() - 7 * 86_400_000).toISOString();
      db.prepare(
        'INSERT INTO analytics (event, value, tool, timestamp) VALUES (?, ?, ?, ?)'
      ).run('memory_deleted', 'uuid-1', 'cli', oldDate);

      const since = new Date(Date.now() - 86_400_000).toISOString(); // 1 day ago
      const recent = analytics.getEvents({ since });
      expect(recent).toHaveLength(4); // only the 4 from beforeEach

      const all = analytics.getEvents();
      expect(all).toHaveLength(5);
    });

    it('respects limit', () => {
      const events = analytics.getEvents({ limit: 2 });
      expect(events).toHaveLength(2);
    });
  });

  describe('countEvents', () => {
    it('returns correct count', () => {
      analytics.logEvent('memory_stored', 'technical');
      analytics.logEvent('memory_stored', 'preferences');
      analytics.logEvent('memory_recalled', '5');

      expect(analytics.countEvents('memory_stored')).toBe(2);
      expect(analytics.countEvents('memory_recalled')).toBe(1);
      expect(analytics.countEvents('nonexistent')).toBe(0);
    });

    it('filters by since', () => {
      const db = store.getDatabase();
      const oldDate = new Date(Date.now() - 7 * 86_400_000).toISOString();
      db.prepare(
        'INSERT INTO analytics (event, value, tool, timestamp) VALUES (?, ?, ?, ?)'
      ).run('memory_stored', 'old', null, oldDate);

      analytics.logEvent('memory_stored', 'new');

      const since = new Date(Date.now() - 86_400_000).toISOString();
      expect(analytics.countEvents('memory_stored', since)).toBe(1);
      expect(analytics.countEvents('memory_stored')).toBe(2);
    });
  });

  describe('getStats', () => {
    it('returns memory count by layer', () => {
      store.add({ layer: 'preferences', what: 'pref 1' });
      store.add({ layer: 'preferences', what: 'pref 2' });
      store.add({ layer: 'technical', what: 'tech 1' });
      store.add({ layer: 'area_context', what: 'area 1' });

      const stats = analytics.getStats();
      expect(stats.totalMemories).toBe(4);
      expect(stats.byLayer.preferences).toBe(2);
      expect(stats.byLayer.technical).toBe(1);
      expect(stats.byLayer.area_context).toBe(1);
    });

    it('returns most recalled memories', () => {
      const m1 = store.add({ layer: 'technical', what: 'Use datetime() for SQLite dates' });
      const m2 = store.add({ layer: 'preferences', what: 'Prefer composition over conditionals' });
      store.add({ layer: 'guidelines', what: 'never recalled' });

      // Recall m1 multiple times
      store.recordRecall([m1.id]);
      store.recordRecall([m1.id]);
      store.recordRecall([m1.id]);
      // Recall m2 once
      store.recordRecall([m2.id]);

      const stats = analytics.getStats();
      expect(stats.mostRecalled).toHaveLength(2);
      expect(stats.mostRecalled[0].what).toBe('Use datetime() for SQLite dates');
      expect(stats.mostRecalled[0].recalled_count).toBe(3);
      expect(stats.mostRecalled[0].layer).toBe('technical');
      expect(stats.mostRecalled[1].what).toBe('Prefer composition over conditionals');
      expect(stats.mostRecalled[1].recalled_count).toBe(1);
    });

    it('returns source breakdown', () => {
      store.add({ layer: 'preferences', what: 'conv 1', source: 'conversation' });
      store.add({ layer: 'preferences', what: 'conv 2', source: 'conversation' });
      store.add({ layer: 'technical', what: 'imp 1', source: 'import' });

      const stats = analytics.getStats();
      expect(stats.captureSourceBreakdown.conversation).toBe(2);
      expect(stats.captureSourceBreakdown.import).toBe(1);
    });

    it('returns stale count', () => {
      const db = store.getDatabase();
      const old = new Date(Date.now() - 40 * 86_400_000).toISOString();
      const recent = new Date().toISOString();

      // Old memory with 0 recalls = stale
      db.prepare(
        `INSERT INTO memories (layer, what, status, source, created_at, recalled_count)
         VALUES ('preferences', 'old never recalled', 'active', 'conversation', ?, 0)`
      ).run(old);

      // Old memory with recalls = not stale
      db.prepare(
        `INSERT INTO memories (layer, what, status, source, created_at, recalled_count)
         VALUES ('preferences', 'old but recalled', 'active', 'conversation', ?, 5)`
      ).run(old);

      // Recent memory with 0 recalls = not stale (too new)
      db.prepare(
        `INSERT INTO memories (layer, what, status, source, created_at, recalled_count)
         VALUES ('preferences', 'new never recalled', 'active', 'conversation', ?, 0)`
      ).run(recent);

      const stats = analytics.getStats();
      expect(stats.staleCount).toBe(1);
    });

    it('excludes archived memories from counts', () => {
      store.add({ layer: 'preferences', what: 'active one' });
      const m2 = store.add({ layer: 'preferences', what: 'will be archived' });
      store.archive(m2.id);

      const stats = analytics.getStats();
      expect(stats.totalMemories).toBe(1);
      expect(stats.byLayer.preferences).toBe(1);
    });
  });

  describe('prune', () => {
    it('removes events older than N days', () => {
      const db = store.getDatabase();
      const old = new Date(Date.now() - 40 * 86_400_000).toISOString();

      db.prepare(
        'INSERT INTO analytics (event, value, tool, timestamp) VALUES (?, ?, ?, ?)'
      ).run('memory_stored', 'technical', 'cli', old);

      analytics.logEvent('memory_stored', 'preferences', 'claude-code');

      expect(analytics.getEvents()).toHaveLength(2);

      const deleted = analytics.prune(30);
      expect(deleted).toBe(1);
      expect(analytics.getEvents()).toHaveLength(1);
    });

    it('preserves recent events', () => {
      analytics.logEvent('memory_stored', 'technical');
      analytics.logEvent('memory_recalled', '2');
      analytics.logEvent('search_performed', 'like');

      const deleted = analytics.prune(30);
      expect(deleted).toBe(0);
      expect(analytics.getEvents()).toHaveLength(3);
    });

    it('removes all old events when days is 0', () => {
      const db = store.getDatabase();
      const yesterday = new Date(Date.now() - 86_400_000).toISOString();

      db.prepare(
        'INSERT INTO analytics (event, value, tool, timestamp) VALUES (?, ?, ?, ?)'
      ).run('memory_stored', 'a', null, yesterday);
      db.prepare(
        'INSERT INTO analytics (event, value, tool, timestamp) VALUES (?, ?, ?, ?)'
      ).run('memory_recalled', 'b', null, yesterday);

      const deleted = analytics.prune(0);
      expect(deleted).toBe(2);
      expect(analytics.getEvents()).toHaveLength(0);
    });
  });
});
