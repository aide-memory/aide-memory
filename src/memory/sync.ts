import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import type { MemoryStore } from './store';
import type { MemoryFile, MemoryLayer } from './types';

export interface SyncResult {
  imported: number;
  updated: number;
  removed: number;
  conflicts: SyncConflict[];
  errors: string[];
}

export interface SyncConflict {
  uuid: string;
  reason: string;
  localUpdatedAt: string;
  incomingUpdatedAt: string;
}

/**
 * Layer directories under .aide/memories/
 */
const LAYER_DIRS: Record<MemoryLayer, string> = {
  preferences: 'preferences',
  technical: 'technical',
  area_context: 'area_context',
  guidelines: 'guidelines',
};

/**
 * Handles synchronization between JSON memory files and the SQLite cache.
 *
 * JSON files are ALWAYS the source of truth. SQLite is a rebuildable cache.
 * Conflict detection uses updated_at timestamps -- newer always wins.
 *
 * All DB operations bypass the MemoryStore's file-writing behavior to avoid
 * creating duplicate JSON files or bumping timestamps during sync.
 */
export class MemorySync {
  private readonly store: MemoryStore;
  private readonly db: Database.Database;
  private readonly memoriesDir: string;

  constructor(store: MemoryStore) {
    this.store = store;
    this.db = (store as any).db;

    const memoriesPath = store.memoriesPath;
    if (!memoriesPath) {
      throw new Error('MemorySync requires a store in file-per-memory mode (use { projectRoot } constructor)');
    }
    this.memoriesDir = memoriesPath;
  }

  /**
   * Full rebuild: import all JSON files into SQLite, replacing the entire cache.
   * Equivalent to deleting the SQLite cache and letting it rebuild.
   * Safe, idempotent.
   */
  importFromFiles(): SyncResult {
    const result: SyncResult = {
      imported: 0,
      updated: 0,
      removed: 0,
      conflicts: [],
      errors: [],
    };

    const jsonFiles = this.collectJsonFiles();
    const fileUuids = new Set<string>();

    for (const filePath of jsonFiles) {
      // Skip preferences/personal/ (gitignored, should never appear in sync)
      if (this.isPersonalPreference(filePath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as MemoryFile;

        if (!this.isValidMemoryFile(data)) {
          result.errors.push(`Malformed file: ${path.relative(this.memoriesDir, filePath)}`);
          continue;
        }

        fileUuids.add(data.uuid);
        const existing = this.getByUuid(data.uuid);

        if (existing) {
          // Check for conflict: local SQLite is newer than incoming file
          if (existing.updated_at > data.updated_at) {
            result.conflicts.push({
              uuid: data.uuid,
              reason: 'local edits would be overwritten',
              localUpdatedAt: existing.updated_at,
              incomingUpdatedAt: data.updated_at,
            });
            // Keep newer (local) version
            continue;
          }

          if (existing.updated_at === data.updated_at) {
            // Unchanged — skip
            continue;
          }

          // File is newer — update cache
          this.updateFromFile(existing.id, data);
          result.updated++;
        } else {
          // New file — insert into cache
          this.insertFromFile(data);
          result.imported++;
        }
      } catch (err) {
        const relPath = path.relative(this.memoriesDir, filePath);
        result.errors.push(`Error reading ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Remove SQLite rows whose JSON files no longer exist
    const allUuids = this.getAllUuids();
    for (const row of allUuids) {
      if (!fileUuids.has(row.uuid)) {
        // Don't remove personal preferences (they're gitignored, so won't have shared files)
        if (row.layer === 'preferences' && row.shared === 0) {
          continue;
        }
        this.deleteByUuid(row.uuid);
        result.removed++;
      }
    }

    return result;
  }

  /**
   * Export: create missing JSON files for any memories in SQLite that don't have them.
   * Never overwrites existing JSON files — only fills gaps.
   */
  exportToFiles(): SyncResult {
    const result: SyncResult = {
      imported: 0,
      updated: 0,
      removed: 0,
      conflicts: [],
      errors: [],
    };

    const allMemories = this.store.list();

    for (const mem of allMemories) {
      try {
        const filePath = this.getMemoryFilePath(mem.uuid, mem.layer, mem.shared);

        if (fs.existsSync(filePath)) {
          // File already exists — don't overwrite
          continue;
        }

        // Ensure directory exists
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const memoryFile: MemoryFile = {
          uuid: mem.uuid,
          layer: mem.layer,
          what: mem.what,
          why: mem.why,
          scope: mem.scope,
          context_label: mem.context_label,
          contributor: mem.contributor,
          tags: mem.tags,
          source: mem.source,
          shared: mem.shared,
          generated_by: mem.generated_by,
          derived_from: mem.derived_from,
          created_at: mem.created_at,
          updated_at: mem.updated_at,
        };

        // Atomic write: tmp file + rename
        const tmpPath = filePath + '.tmp';
        fs.writeFileSync(tmpPath, JSON.stringify(memoryFile, null, 2) + '\n', 'utf-8');
        fs.renameSync(tmpPath, filePath);

        result.imported++;
      } catch (err) {
        result.errors.push(`Error exporting ${mem.uuid}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    return result;
  }

  /**
   * Incremental sync: only process changed files (for post-checkout hook).
   * Compares UUID + updated_at — newer wins.
   * In non-interactive mode, always keeps the newer version.
   */
  syncFromGit(): SyncResult {
    const result: SyncResult = {
      imported: 0,
      updated: 0,
      removed: 0,
      conflicts: [],
      errors: [],
    };

    const jsonFiles = this.collectJsonFiles();
    const fileUuids = new Set<string>();

    for (const filePath of jsonFiles) {
      if (this.isPersonalPreference(filePath)) {
        continue;
      }

      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content) as MemoryFile;

        if (!this.isValidMemoryFile(data)) {
          result.errors.push(`Malformed file: ${path.relative(this.memoriesDir, filePath)}`);
          continue;
        }

        fileUuids.add(data.uuid);
        const existing = this.getByUuid(data.uuid);

        if (!existing) {
          // New file — insert
          this.insertFromFile(data);
          result.imported++;
        } else if (data.updated_at > existing.updated_at) {
          // File is newer — update cache
          this.updateFromFile(existing.id, data);
          result.updated++;
        } else if (data.updated_at < existing.updated_at) {
          // Local is newer — conflict detected
          result.conflicts.push({
            uuid: data.uuid,
            reason: 'local edits would be overwritten',
            localUpdatedAt: existing.updated_at,
            incomingUpdatedAt: data.updated_at,
          });
          // Keep newer (local) version in non-interactive mode
        }
        // else: same updated_at — unchanged, skip
      } catch (err) {
        const relPath = path.relative(this.memoriesDir, filePath);
        result.errors.push(`Error reading ${relPath}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Remove SQLite rows whose JSON files no longer exist
    const allUuids = this.getAllUuids();
    for (const row of allUuids) {
      if (!fileUuids.has(row.uuid)) {
        if (row.layer === 'preferences' && row.shared === 0) {
          continue;
        }
        this.deleteByUuid(row.uuid);
        result.removed++;
      }
    }

    return result;
  }

  // ---- Direct DB operations (bypass store's file-writing) ----

  /**
   * Get a row by UUID directly from the DB.
   */
  private getByUuid(uuid: string): { id: number; updated_at: string; layer: string; shared: number } | undefined {
    return this.db.prepare(
      'SELECT id, updated_at, layer, shared FROM memories WHERE uuid = ?'
    ).get(uuid) as any;
  }

  /**
   * Get all UUIDs from the DB.
   */
  private getAllUuids(): { uuid: string; layer: string; shared: number }[] {
    return this.db.prepare('SELECT uuid, layer, shared FROM memories').all() as any[];
  }

  /**
   * Insert a new memory row from a MemoryFile. Bypasses store.add() to avoid
   * generating a new UUID or writing a JSON file.
   */
  private insertFromFile(data: MemoryFile): void {
    this.db.prepare(`
      INSERT INTO memories (uuid, layer, what, why, scope, context_label, contributor,
        tags, source, shared, generated_by, derived_from, created_at, updated_at,
        recalled_count, last_recalled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)
    `).run(
      data.uuid,
      data.layer,
      data.what,
      data.why ?? null,
      data.scope ?? null,
      data.context_label ?? null,
      data.contributor,
      JSON.stringify(data.tags ?? []),
      data.source ?? 'import',
      data.shared ? 1 : 0,
      data.generated_by ? JSON.stringify(data.generated_by) : null,
      data.derived_from ? JSON.stringify(data.derived_from) : null,
      data.created_at,
      data.updated_at,
    );
  }

  /**
   * Update an existing row from a MemoryFile. Preserves recall stats.
   * Bypasses store.update() to avoid writing a JSON file or bumping updated_at.
   */
  private updateFromFile(id: number, data: MemoryFile): void {
    this.db.prepare(`
      UPDATE memories SET
        layer = ?, what = ?, why = ?, scope = ?, context_label = ?,
        contributor = ?, tags = ?, source = ?, shared = ?,
        generated_by = ?, derived_from = ?,
        created_at = ?, updated_at = ?
      WHERE id = ?
    `).run(
      data.layer,
      data.what,
      data.why ?? null,
      data.scope ?? null,
      data.context_label ?? null,
      data.contributor,
      JSON.stringify(data.tags ?? []),
      data.source ?? 'import',
      data.shared ? 1 : 0,
      data.generated_by ? JSON.stringify(data.generated_by) : null,
      data.derived_from ? JSON.stringify(data.derived_from) : null,
      data.created_at,
      data.updated_at,
      id,
    );
  }

  /**
   * Delete a row by UUID. Does NOT delete the JSON file (sync only manages the cache).
   */
  private deleteByUuid(uuid: string): void {
    this.db.prepare('DELETE FROM memories WHERE uuid = ?').run(uuid);
  }

  // ---- Path/validation helpers ----

  /**
   * Check if a file path is inside preferences/personal/ (gitignored).
   */
  private isPersonalPreference(filePath: string): boolean {
    const rel = path.relative(this.memoriesDir, filePath).replace(/\\/g, '/');
    return rel.startsWith('preferences/personal/');
  }

  /**
   * Validate that a parsed JSON object has the required MemoryFile fields.
   */
  private isValidMemoryFile(data: any): data is MemoryFile {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.uuid === 'string' &&
      typeof data.layer === 'string' &&
      typeof data.what === 'string' &&
      typeof data.contributor === 'string' &&
      typeof data.created_at === 'string' &&
      typeof data.updated_at === 'string'
    );
  }

  /**
   * Get the file path for a memory's JSON file.
   */
  private getMemoryFilePath(uuid: string, layer: MemoryLayer, shared: boolean): string {
    let subdir: string;
    if (layer === 'preferences') {
      subdir = path.join('preferences', shared ? 'shared' : 'personal');
    } else {
      subdir = LAYER_DIRS[layer];
    }
    return path.join(this.memoriesDir, subdir, `${uuid}.json`);
  }

  /**
   * Collect all .json files under .aide/memories/, excluding .tmp files.
   */
  private collectJsonFiles(): string[] {
    if (!fs.existsSync(this.memoriesDir)) return [];

    const files: string[] = [];
    const walk = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.json') && !entry.name.endsWith('.tmp')) {
          files.push(full);
        }
      }
    };
    walk(this.memoriesDir);
    return files;
  }
}
