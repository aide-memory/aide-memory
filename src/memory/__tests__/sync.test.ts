import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../store';
import { MemorySync } from '../sync';
import type { MemoryFile } from '../types';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * Create a temporary project directory with .aide/memories/ structure.
 * Does NOT create the MemoryStore yet — tests control when the store sees files.
 */
function createTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-sync-test-'));
  const memoriesDir = path.join(dir, '.aide', 'memories');
  fs.mkdirSync(path.join(memoriesDir, 'preferences', 'shared'), { recursive: true });
  fs.mkdirSync(path.join(memoriesDir, 'preferences', 'personal'), { recursive: true });
  fs.mkdirSync(path.join(memoriesDir, 'technical'), { recursive: true });
  fs.mkdirSync(path.join(memoriesDir, 'area_context'), { recursive: true });
  fs.mkdirSync(path.join(memoriesDir, 'guidelines'), { recursive: true });
  return dir;
}

/**
 * Write a memory JSON file to the appropriate layer directory.
 */
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

/**
 * Create a minimal valid MemoryFile with sensible defaults.
 */
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

/**
 * Recursively remove a directory.
 */
function rmrf(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Create a store and sync pair. The store is created FIRST (before any files),
 * so its auto-sync finds an empty directory. Files are written after.
 */
function createStoreAndSync(projectRoot: string): { store: MemoryStore; sync: MemorySync } {
  const store = new MemoryStore({ projectRoot });
  const sync = new MemorySync(store);
  return { store, sync };
}

/**
 * Directly insert a row into SQLite without going through MemoryStore
 * (which would write a JSON file). Used to set up specific DB state for tests.
 */
function directInsert(
  store: MemoryStore,
  data: MemoryFile,
): void {
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

/**
 * Directly update a row in SQLite (bypass store file-writing).
 */
function directUpdate(
  store: MemoryStore,
  uuid: string,
  changes: { what?: string; updated_at?: string },
): void {
  const db = (store as any).db as Database.Database;
  const sets: string[] = [];
  const params: any[] = [];
  if (changes.what !== undefined) { sets.push('what = ?'); params.push(changes.what); }
  if (changes.updated_at !== undefined) { sets.push('updated_at = ?'); params.push(changes.updated_at); }
  params.push(uuid);
  db.prepare(`UPDATE memories SET ${sets.join(', ')} WHERE uuid = ?`).run(...params);
}

/**
 * Record recall stats directly in SQLite.
 */
function directRecordRecall(store: MemoryStore, uuid: string, count: number): void {
  const db = (store as any).db as Database.Database;
  const now = new Date().toISOString();
  db.prepare('UPDATE memories SET recalled_count = ?, last_recalled_at = ? WHERE uuid = ?')
    .run(count, now, uuid);
}

describe('MemorySync', () => {
  let projectRoot: string;
  let store: MemoryStore;
  let sync: MemorySync;

  beforeEach(() => {
    projectRoot = createTempProject();
    // Create store FIRST with empty directory, then write files for tests
    ({ store, sync } = createStoreAndSync(projectRoot));
  });

  afterEach(() => {
    store.close();
    rmrf(projectRoot);
  });

  describe('importFromFiles', () => {
    it('rebuilds SQLite from JSON files', () => {
      const mem1 = makeMemoryFile({ what: 'WAL mode is required', layer: 'technical' });
      const mem2 = makeMemoryFile({ what: 'Use tabs not spaces', layer: 'preferences' });
      const mem3 = makeMemoryFile({ what: 'Always write tests', layer: 'guidelines' });

      writeMemoryFile(projectRoot, mem1);
      writeMemoryFile(projectRoot, mem2);
      writeMemoryFile(projectRoot, mem3);

      const result = sync.importFromFiles();

      expect(result.imported).toBe(3);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.errors).toHaveLength(0);

      // Verify all three are in SQLite
      const all = store.list();
      expect(all).toHaveLength(3);

      const uuids = all.map(m => m.uuid);
      expect(uuids).toContain(mem1.uuid);
      expect(uuids).toContain(mem2.uuid);
      expect(uuids).toContain(mem3.uuid);
    });

    it('handles empty directory', () => {
      const result = sync.importFromFiles();

      expect(result.imported).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.errors).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
    });

    it('skips malformed JSON', () => {
      // Write valid file
      const validMem = makeMemoryFile({ what: 'Valid memory' });
      writeMemoryFile(projectRoot, validMem);

      // Write malformed JSON syntax
      const malformedPath = path.join(projectRoot, '.aide', 'memories', 'technical', 'bad.json');
      fs.writeFileSync(malformedPath, '{ invalid json !!!', 'utf-8');

      // Write file missing required fields
      const incompletePath = path.join(projectRoot, '.aide', 'memories', 'technical', 'incomplete.json');
      fs.writeFileSync(incompletePath, JSON.stringify({ uuid: 'abc' }), 'utf-8');

      const result = sync.importFromFiles();

      expect(result.imported).toBe(1);
      expect(result.errors.length).toBeGreaterThanOrEqual(1);

      // Valid file should be imported
      const all = store.list();
      expect(all).toHaveLength(1);
      expect(all[0].uuid).toBe(validMem.uuid);
    });

    it('skips preferences/personal/', () => {
      // Write shared preference (should be imported)
      const sharedPref = makeMemoryFile({ what: 'Shared pref', layer: 'preferences', shared: true });
      writeMemoryFile(projectRoot, sharedPref);

      // Write personal preference (should be skipped)
      const personalPref = makeMemoryFile({ what: 'Personal pref', layer: 'preferences', shared: false });
      writeMemoryFile(projectRoot, personalPref);

      const result = sync.importFromFiles();

      // Only the shared one should be imported
      expect(result.imported).toBe(1);
      const all = store.list();
      expect(all).toHaveLength(1);
      expect(all[0].what).toBe('Shared pref');
    });

    it('removes SQLite entries when JSON files are deleted', () => {
      // Populate via sync first
      const mem1 = makeMemoryFile({ what: 'Keep me' });
      const mem2 = makeMemoryFile({ what: 'Delete me' });
      writeMemoryFile(projectRoot, mem1);
      const deletePath = writeMemoryFile(projectRoot, mem2);

      sync.importFromFiles();
      expect(store.list()).toHaveLength(2);

      // Delete one JSON file
      fs.unlinkSync(deletePath);

      // Re-import
      const result = sync.importFromFiles();
      expect(result.removed).toBe(1);
      expect(store.list()).toHaveLength(1);
      expect(store.list()[0].uuid).toBe(mem1.uuid);
    });

    it('detects conflicts when local SQLite is newer', () => {
      const uuid = crypto.randomUUID();

      // Write a JSON file with old timestamp
      const memFile = makeMemoryFile({
        uuid,
        what: 'Original from file',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      writeMemoryFile(projectRoot, memFile);

      // Insert directly into SQLite with a NEWER timestamp
      directInsert(store, {
        ...memFile,
        what: 'Locally updated content',
        updated_at: '2026-06-01T00:00:00.000Z',
      });

      // Import — should detect conflict
      const result = sync.importFromFiles();
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].uuid).toBe(uuid);
      expect(result.conflicts[0].reason).toBe('local edits would be overwritten');

      // Local (newer) version should be kept
      const current = store.getByUuid(uuid)!;
      expect(current.what).toBe('Locally updated content');
    });
  });

  describe('exportToFiles', () => {
    it('creates missing JSON files', () => {
      // Add memories directly to SQLite (no JSON files)
      const mem1 = makeMemoryFile({ what: 'Memory one', layer: 'technical' });
      const mem2 = makeMemoryFile({ what: 'Memory two', layer: 'guidelines' });
      directInsert(store, mem1);
      directInsert(store, mem2);

      // Export should create JSON files
      const result = sync.exportToFiles();

      expect(result.imported).toBe(2);

      // Verify files exist
      const memoriesDir = path.join(projectRoot, '.aide', 'memories');
      const filesAfter = collectAllJsonFiles(memoriesDir);
      expect(filesAfter).toHaveLength(2);

      // Verify file contents
      for (const f of filesAfter) {
        const content = JSON.parse(fs.readFileSync(f, 'utf-8'));
        expect(content.uuid).toBeTruthy();
        expect(content.what).toBeTruthy();
      }
    });

    it('does not overwrite existing files', () => {
      // Add memory directly to SQLite
      const mem = makeMemoryFile({ what: 'Original in SQLite', layer: 'technical' });
      directInsert(store, mem);

      // Write a JSON file with different content at the same path
      const fileMem = { ...mem, what: 'Original in file' };
      writeMemoryFile(projectRoot, fileMem);

      // Export should NOT overwrite the existing file
      const result = sync.exportToFiles();
      expect(result.imported).toBe(0);

      // File should still have original content
      const filePath = path.join(projectRoot, '.aide', 'memories', 'technical', `${mem.uuid}.json`);
      const fileContent = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      expect(fileContent.what).toBe('Original in file');
    });
  });

  describe('syncFromGit', () => {
    it('imports new files', () => {
      const mem = makeMemoryFile({ what: 'Brand new from git' });
      writeMemoryFile(projectRoot, mem);

      const result = sync.syncFromGit();

      expect(result.imported).toBe(1);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);

      const stored = store.getByUuid(mem.uuid);
      expect(stored).not.toBeNull();
      expect(stored!.what).toBe('Brand new from git');
    });

    it('updates changed files when file timestamp is newer', () => {
      const uuid = crypto.randomUUID();

      // Insert initial version directly into SQLite
      const memV1 = makeMemoryFile({
        uuid,
        what: 'Version 1',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      directInsert(store, memV1);

      // Write newer version as JSON file
      const memV2 = makeMemoryFile({
        uuid,
        what: 'Version 2 (updated by teammate)',
        updated_at: '2026-02-01T00:00:00.000Z',
      });
      writeMemoryFile(projectRoot, memV2);

      const result = sync.syncFromGit();

      expect(result.updated).toBe(1);
      expect(result.imported).toBe(0);

      const stored = store.getByUuid(uuid);
      expect(stored!.what).toBe('Version 2 (updated by teammate)');
    });

    it('removes deleted files', () => {
      // Set up two memories in SQLite and corresponding files
      const mem1 = makeMemoryFile({ what: 'Stays' });
      const mem2 = makeMemoryFile({ what: 'Gets deleted' });

      directInsert(store, mem1);
      directInsert(store, mem2);

      // Only write file for mem1 (mem2's file is "deleted" by teammate)
      writeMemoryFile(projectRoot, mem1);

      const result = sync.syncFromGit();

      expect(result.removed).toBe(1);
      expect(store.getByUuid(mem1.uuid)).not.toBeNull();
      expect(store.getByUuid(mem2.uuid)).toBeNull();
    });

    it('detects conflicts when local is newer than incoming', () => {
      const uuid = crypto.randomUUID();

      // SQLite has a newer version
      const localMem = makeMemoryFile({
        uuid,
        what: 'Locally edited',
        updated_at: '2026-06-01T00:00:00.000Z',
      });
      directInsert(store, localMem);

      // JSON file has an older version
      const fileMem = makeMemoryFile({
        uuid,
        what: 'Original from file',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      writeMemoryFile(projectRoot, fileMem);

      const result = sync.syncFromGit();

      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].uuid).toBe(uuid);
      expect(result.conflicts[0].reason).toContain('local edits');

      // Local (newer) version should be kept
      const current = store.getByUuid(uuid)!;
      expect(current.what).toBe('Locally edited');
    });

    it('skips unchanged files (same updated_at)', () => {
      const uuid = crypto.randomUUID();
      const timestamp = '2026-01-15T00:00:00.000Z';

      const mem = makeMemoryFile({
        uuid,
        what: 'Unchanged',
        updated_at: timestamp,
      });

      // Same data in both SQLite and file
      directInsert(store, mem);
      writeMemoryFile(projectRoot, mem);

      const result = sync.syncFromGit();

      expect(result.imported).toBe(0);
      expect(result.updated).toBe(0);
      expect(result.removed).toBe(0);
      expect(result.conflicts).toHaveLength(0);
    });
  });

  describe('idempotency', () => {
    it('running importFromFiles twice produces the same result', () => {
      const mem1 = makeMemoryFile({ what: 'Idempotent test 1', layer: 'technical' });
      const mem2 = makeMemoryFile({ what: 'Idempotent test 2', layer: 'guidelines' });
      writeMemoryFile(projectRoot, mem1);
      writeMemoryFile(projectRoot, mem2);

      // First run
      const result1 = sync.importFromFiles();
      expect(result1.imported).toBe(2);

      const afterFirst = store.list();
      expect(afterFirst).toHaveLength(2);

      // Second run — should produce no changes
      const result2 = sync.importFromFiles();
      expect(result2.imported).toBe(0);
      expect(result2.updated).toBe(0);
      expect(result2.removed).toBe(0);

      const afterSecond = store.list();
      expect(afterSecond).toHaveLength(2);

      // Verify same UUIDs
      const uuids1 = afterFirst.map(m => m.uuid).sort();
      const uuids2 = afterSecond.map(m => m.uuid).sort();
      expect(uuids1).toEqual(uuids2);
    });

    it('running syncFromGit twice produces the same result', () => {
      const mem = makeMemoryFile({ what: 'Sync idempotent' });
      writeMemoryFile(projectRoot, mem);

      sync.syncFromGit();

      const result2 = sync.syncFromGit();

      expect(result2.imported).toBe(0);
      expect(result2.updated).toBe(0);
      expect(result2.removed).toBe(0);
      expect(result2.conflicts).toHaveLength(0);
    });
  });

  describe('performance', () => {
    it('syncs 100 files in under 500ms', () => {
      // Create 100 memory files across different layers
      const layers = ['technical', 'guidelines', 'area_context', 'preferences'] as const;

      for (let i = 0; i < 100; i++) {
        const layer = layers[i % layers.length];
        const mem = makeMemoryFile({
          what: `Performance test memory ${i}`,
          layer,
          scope: `src/module-${i}/**`,
          shared: true,
        });
        writeMemoryFile(projectRoot, mem);
      }

      const start = performance.now();
      const result = sync.importFromFiles();
      const elapsed = performance.now() - start;

      expect(result.imported).toBe(100);
      expect(result.errors).toHaveLength(0);
      expect(elapsed).toBeLessThan(500);

      // Verify all 100 are in SQLite
      expect(store.list()).toHaveLength(100);
    });
  });

  describe('edge cases', () => {
    it('preserves recall stats during import update', () => {
      const uuid = crypto.randomUUID();

      // Insert initial version with recall stats
      const mem = makeMemoryFile({
        uuid,
        what: 'Recall stats test',
        updated_at: '2026-01-01T00:00:00.000Z',
      });
      directInsert(store, mem);
      directRecordRecall(store, uuid, 5);

      const beforeSync = store.getByUuid(uuid)!;
      expect(beforeSync.recalled_count).toBe(5);

      // Write a newer file version
      const memV2: MemoryFile = {
        ...mem,
        what: 'Updated content',
        updated_at: '2026-06-01T00:00:00.000Z',
      };
      writeMemoryFile(projectRoot, memV2);

      // Sync — recall stats should be preserved
      sync.syncFromGit();

      const afterSync = store.getByUuid(uuid)!;
      expect(afterSync.what).toBe('Updated content');
      expect(afterSync.recalled_count).toBe(5);
      expect(afterSync.last_recalled_at).toBeTruthy();
    });

    it('handles non-existent memories directory gracefully', () => {
      // Remove the entire memories directory
      const memoriesDir = path.join(projectRoot, '.aide', 'memories');
      rmrf(memoriesDir);

      // Recreate the bare minimum so the sync doesn't crash on collectJsonFiles
      fs.mkdirSync(memoriesDir, { recursive: true });

      const result = sync.importFromFiles();
      expect(result.imported).toBe(0);
      expect(result.errors).toHaveLength(0);
    });

    it('handles files with .tmp extension by ignoring them', () => {
      const mem = makeMemoryFile({ what: 'Real file' });
      writeMemoryFile(projectRoot, mem);

      // Write a .tmp file that should be ignored
      const tmpPath = path.join(projectRoot, '.aide', 'memories', 'technical', 'writing-in-progress.json.tmp');
      fs.writeFileSync(tmpPath, JSON.stringify(makeMemoryFile({ what: 'Incomplete write' })), 'utf-8');

      const result = sync.importFromFiles();

      expect(result.imported).toBe(1);
      const all = store.list();
      expect(all).toHaveLength(1);
      expect(all[0].what).toBe('Real file');
    });

    it('does not remove personal preferences during sync even without matching files', () => {
      // Insert a personal preference directly in SQLite
      const personalUuid = crypto.randomUUID();
      const personalMem = makeMemoryFile({
        uuid: personalUuid,
        layer: 'preferences',
        what: 'My personal IDE setting',
        shared: false,
      });
      directInsert(store, personalMem);

      // Add a shared technical memory via file
      const techMem = makeMemoryFile({ what: 'Shared knowledge', layer: 'technical' });
      writeMemoryFile(projectRoot, techMem);

      // Sync — personal preference should NOT be removed
      const result = sync.syncFromGit();

      expect(result.imported).toBe(1);
      expect(result.removed).toBe(0);

      // Both should still exist
      expect(store.getByUuid(personalUuid)).not.toBeNull();
      expect(store.getByUuid(techMem.uuid)).not.toBeNull();
    });
  });
});

/**
 * Helper: collect all JSON files recursively under a directory.
 */
function collectAllJsonFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];

  const files: string[] = [];
  const walk = (d: string) => {
    const entries = fs.readdirSync(d, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
        files.push(full);
      }
    }
  };
  walk(dir);
  return files;
}
