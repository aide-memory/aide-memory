import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import { execSync } from 'child_process';
import type { Memory, MemoryFile, CreateMemory, MemoryLayer, GeneratedBy } from './types';
import { initFts5, backfillFts5Index, escapeFts5Query } from './fts5';
import type { EmbeddingService } from './embeddings';

const SCHEMA_VERSION = 2;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  layer TEXT NOT NULL,
  what TEXT NOT NULL,
  why TEXT,
  scope TEXT,
  context_label TEXT,
  contributor TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'conversation',
  shared INTEGER NOT NULL DEFAULT 1,
  generated_by TEXT,
  derived_from TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  recalled_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_uuid ON memories(uuid);
CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
CREATE INDEX IF NOT EXISTS idx_memories_contributor ON memories(contributor);
`;

const META_TABLE = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

/**
 * Subdirectory layout under .aide/memories/
 */
const LAYER_DIRS: Record<MemoryLayer, string> = {
  preferences: 'preferences',
  technical: 'technical',
  area_context: 'area_context',
  guidelines: 'guidelines',
};

function projectHash(projectPath: string): string {
  const normalized = path.resolve(projectPath);
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}

function getDbPath(projectPath: string): string {
  const hash = projectHash(projectPath);
  return path.join(os.homedir(), '.aide', 'projects', hash, 'memory.db');
}

function detectGitUser(): string {
  try {
    return execSync('git config user.name', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

export class MemoryStore {
  private db: Database.Database;
  readonly dbPath: string;
  private _fts5Available: boolean = false;
  private embeddingService: EmbeddingService | null = null;

  /** Whether FTS5 full-text search is available and initialized. */
  get fts5Available(): boolean {
    return this._fts5Available;
  }

  /** Expose the underlying database for Analytics (same SQLite connection). */
  getDatabase(): Database.Database {
    return this.db;
  }

  // File-per-memory fields (null when using legacy dbPath-only mode)
  private memoriesDir: string | null = null;
  private defaultContributor: string;

  /**
   * Legacy constructor: SQLite-only mode (for tests using { dbPath }).
   * No JSON file I/O — only SQLite.
   */
  constructor(projectPath: string);
  constructor(options: { dbPath: string });
  constructor(options: { projectRoot: string });
  constructor(arg: string | { dbPath: string } | { projectRoot: string }) {
    this.defaultContributor = detectGitUser();

    if (typeof arg === 'string') {
      // Legacy: project path string -> derive db path
      this.dbPath = getDbPath(arg);
    } else if ('projectRoot' in arg) {
      // New: file-per-memory mode
      const projectRoot = arg.projectRoot;
      this.memoriesDir = path.join(projectRoot, '.aide', 'memories');
      const hash = projectHash(projectRoot);
      this.dbPath = path.join(os.homedir(), '.aide', 'projects', hash, 'memory.db');
      this.ensureMemoryDirs();
    } else {
      // Legacy: { dbPath } mode — SQLite only, no JSON files
      this.dbPath = arg.dbPath;
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.init();

    // If file-per-memory mode, sync cache on startup
    if (this.memoriesDir) {
      this.rebuildCacheIfNeeded();
    }
  }

  private ensureMemoryDirs(): void {
    if (!this.memoriesDir) return;

    const dirs = [
      path.join(this.memoriesDir, 'preferences', 'personal'),
      path.join(this.memoriesDir, 'preferences', 'shared'),
      path.join(this.memoriesDir, 'technical'),
      path.join(this.memoriesDir, 'area_context'),
      path.join(this.memoriesDir, 'guidelines'),
    ];

    for (const d of dirs) {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    }
  }

  /**
   * Attach an EmbeddingService to this store.
   * When attached, add() will generate embeddings in the background,
   * search() will supplement LIKE results with semantic search,
   * and remove() will clean up embeddings.
   */
  setEmbeddingService(service: EmbeddingService): void {
    this.embeddingService = service;
  }

  getEmbeddingService(): EmbeddingService | null {
    return this.embeddingService;
  }

  private init(): void {
    this.db.exec(META_TABLE);

    const versionRow = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
    const currentVersion = versionRow ? parseInt(versionRow.value, 10) : 0;

    if (currentVersion < SCHEMA_VERSION) {
      // Drop old table and recreate with new schema
      this.db.exec('DROP TABLE IF EXISTS memories');
      this.db.exec(CREATE_TABLE);
      this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
    } else {
      this.db.exec(CREATE_TABLE);
    }

    // Initialize FTS5 search (graceful fallback to LIKE if unavailable)
    this._fts5Available = initFts5(this.db);
    if (this._fts5Available) {
      backfillFts5Index(this.db);
    }
  }

  /**
   * Get the directory for a memory's JSON file based on layer and shared flag.
   */
  private getMemoryDir(layer: MemoryLayer, shared: boolean): string {
    if (!this.memoriesDir) throw new Error('File I/O not available in dbPath-only mode');

    if (layer === 'preferences') {
      return path.join(this.memoriesDir, 'preferences', shared ? 'shared' : 'personal');
    }
    return path.join(this.memoriesDir, LAYER_DIRS[layer]);
  }

  /**
   * Get the file path for a memory's JSON file.
   */
  private getMemoryFilePath(uuid: string, layer: MemoryLayer, shared: boolean): string {
    return path.join(this.getMemoryDir(layer, shared), `${uuid}.json`);
  }

  /**
   * Convert a Memory to a MemoryFile (strip SQLite-only fields).
   */
  private toMemoryFile(mem: Memory): MemoryFile {
    return {
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
  }

  /**
   * Write a memory JSON file atomically (write to .tmp, rename).
   */
  private writeMemoryFile(mem: Memory): void {
    if (!this.memoriesDir) return;

    const filePath = this.getMemoryFilePath(mem.uuid, mem.layer, mem.shared);
    const tmpPath = filePath + '.tmp';
    const content = JSON.stringify(this.toMemoryFile(mem), null, 2) + '\n';

    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * Delete a memory's JSON file.
   */
  private deleteMemoryFile(uuid: string, layer: MemoryLayer, shared: boolean): void {
    if (!this.memoriesDir) return;

    const filePath = this.getMemoryFilePath(uuid, layer, shared);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  /**
   * Hash the .aide/memories/ directory state for cache invalidation.
   */
  private hashMemoriesDir(): string {
    if (!this.memoriesDir) return '';

    const hash = crypto.createHash('sha1');
    const files = this.collectJsonFiles();

    for (const f of files.sort()) {
      const stat = fs.statSync(f);
      hash.update(f + ':' + stat.mtimeMs + ':' + stat.size);
    }

    return hash.digest('hex');
  }

  /**
   * Collect all .json files under .aide/memories/
   */
  private collectJsonFiles(): string[] {
    if (!this.memoriesDir || !fs.existsSync(this.memoriesDir)) return [];

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

  /**
   * Rebuild the SQLite cache from JSON files if the directory state has changed.
   */
  private rebuildCacheIfNeeded(): void {
    if (!this.memoriesDir) return;

    const currentHash = this.hashMemoriesDir();
    const storedHash = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('dir_hash') as { value: string } | undefined;

    if (storedHash?.value === currentHash) return;

    this.rebuildCache();
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('dir_hash', currentHash);
  }

  /**
   * Full cache rebuild: read all JSON files, reconcile with SQLite.
   */
  private rebuildCache(): void {
    if (!this.memoriesDir) return;

    const jsonFiles = this.collectJsonFiles();
    const fileUuids = new Set<string>();

    const insertOrUpdate = this.db.transaction(() => {
      for (const filePath of jsonFiles) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content) as MemoryFile;

          if (!data.uuid || !data.layer || !data.what) continue;

          fileUuids.add(data.uuid);

          // Check if already in SQLite
          const existing = this.db.prepare('SELECT id, recalled_count, last_recalled_at FROM memories WHERE uuid = ?').get(data.uuid) as any;

          if (existing) {
            // Update from file (preserve recall stats)
            this.db.prepare(`
              UPDATE memories SET layer = ?, what = ?, why = ?, scope = ?, context_label = ?,
                contributor = ?, tags = ?, source = ?, shared = ?, generated_by = ?,
                derived_from = ?, created_at = ?, updated_at = ?
              WHERE uuid = ?
            `).run(
              data.layer, data.what, data.why ?? null, data.scope ?? null,
              data.context_label ?? null, data.contributor, JSON.stringify(data.tags ?? []),
              data.source ?? 'conversation', data.shared ? 1 : 0,
              data.generated_by ? JSON.stringify(data.generated_by) : null,
              data.derived_from ? JSON.stringify(data.derived_from) : null,
              data.created_at, data.updated_at,
              data.uuid
            );
          } else {
            // Insert new
            this.db.prepare(`
              INSERT INTO memories (uuid, layer, what, why, scope, context_label, contributor,
                tags, source, shared, generated_by, derived_from, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              data.uuid, data.layer, data.what, data.why ?? null, data.scope ?? null,
              data.context_label ?? null, data.contributor, JSON.stringify(data.tags ?? []),
              data.source ?? 'conversation', data.shared ? 1 : 0,
              data.generated_by ? JSON.stringify(data.generated_by) : null,
              data.derived_from ? JSON.stringify(data.derived_from) : null,
              data.created_at, data.updated_at
            );
          }
        } catch {
          // Skip malformed JSON files silently
        }
      }

      // Remove SQLite rows whose JSON files no longer exist
      const allRows = this.db.prepare('SELECT uuid FROM memories').all() as { uuid: string }[];
      for (const row of allRows) {
        if (!fileUuids.has(row.uuid)) {
          this.db.prepare('DELETE FROM memories WHERE uuid = ?').run(row.uuid);
        }
      }
    });

    insertOrUpdate();
  }

  /**
   * Update the stored directory hash after a write/delete operation.
   */
  private updateDirHash(): void {
    if (!this.memoriesDir) return;
    const hash = this.hashMemoriesDir();
    this.db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)').run('dir_hash', hash);
  }

  add(input: CreateMemory): Memory {
    const now = new Date().toISOString();
    const uuid = crypto.randomUUID();
    const contributor = input.contributor ?? this.defaultContributor;
    const tags = input.tags ?? [];
    const shared = input.shared ?? true;
    const derivedJson = input.derived_from ? JSON.stringify(input.derived_from) : null;
    const generatedByJson = input.generated_by ? JSON.stringify(input.generated_by) : null;

    const result = this.db.prepare(`
      INSERT INTO memories (uuid, layer, what, why, scope, context_label, contributor,
        tags, source, shared, generated_by, derived_from, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      uuid,
      input.layer,
      input.what,
      input.why ?? null,
      input.scope ?? null,
      input.context_label ?? null,
      contributor,
      JSON.stringify(tags),
      input.source ?? 'conversation',
      shared ? 1 : 0,
      generatedByJson,
      derivedJson,
      now,
      now
    );

    const memory = this.get(Number(result.lastInsertRowid))!;

    // Write JSON file if in file-per-memory mode
    if (this.memoriesDir) {
      this.writeMemoryFile(memory);
      this.updateDirHash();
    }

    // Generate and store embedding in background (fire-and-forget)
    if (this.embeddingService?.isReady()) {
      const embeddingText = [memory.what, memory.why, memory.context_label]
        .filter(Boolean)
        .join(' ');
      this.embeddingService
        .generateEmbedding(embeddingText)
        .then((vec) => {
          if (vec && this.embeddingService) {
            this.embeddingService.storeEmbedding(this.db, String(memory.id), vec);
          }
        })
        .catch(() => {
          // Embedding failure is non-fatal — LIKE search still works
        });
    }

    return memory;
  }

  get(id: number): Memory | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as any;
    return row ? this.rowToMemory(row) : null;
  }

  getByUuid(uuid: string): Memory | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE uuid = ?').get(uuid) as any;
    return row ? this.rowToMemory(row) : null;
  }

  list(options?: {
    layer?: MemoryLayer;
    scope?: string;
    contributor?: string;
    limit?: number;
  }): Memory[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.layer) {
      conditions.push('layer = ?');
      params.push(options.layer);
    }
    if (options?.scope) {
      conditions.push('scope = ?');
      params.push(options.scope);
    }
    if (options?.contributor) {
      conditions.push('contributor = ?');
      params.push(options.contributor);
    }

    let sql = 'SELECT * FROM memories';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC, id DESC';
    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToMemory(r));
  }

  update(id: number, changes: Partial<Pick<Memory, 'what' | 'why' | 'scope' | 'context_label' | 'contributor' | 'tags' | 'shared' | 'generated_by'>>): Memory | null {
    const existing = this.get(id);
    if (!existing) return null;

    const fields: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) {
        if (key === 'tags') {
          fields.push('tags = ?');
          params.push(JSON.stringify(value));
        } else if (key === 'generated_by') {
          fields.push('generated_by = ?');
          params.push(value ? JSON.stringify(value) : null);
        } else if (key === 'shared') {
          fields.push('shared = ?');
          params.push(value ? 1 : 0);
        } else {
          fields.push(`${key} = ?`);
          params.push(value);
        }
      }
    }

    if (fields.length === 0) return existing;

    // Always bump updated_at
    const now = new Date().toISOString();
    fields.push('updated_at = ?');
    params.push(now);

    params.push(id);
    this.db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...params);

    const updated = this.get(id)!;

    // Update JSON file if in file-per-memory mode
    if (this.memoriesDir) {
      // If shared changed, delete old file location first
      if (changes.shared !== undefined && changes.shared !== existing.shared) {
        this.deleteMemoryFile(existing.uuid, existing.layer, existing.shared);
      }
      this.writeMemoryFile(updated);
      this.updateDirHash();
    }

    return updated;
  }

  remove(id: number): boolean {
    const existing = this.get(id);
    if (!existing) return false;

    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);

    if (result.changes > 0 && this.memoriesDir) {
      this.deleteMemoryFile(existing.uuid, existing.layer, existing.shared);
      this.updateDirHash();
    }

    // Clean up embedding if present
    if (result.changes > 0 && this.embeddingService) {
      try {
        this.embeddingService.removeEmbedding(this.db, String(id));
      } catch {
        // Embedding cleanup failure is non-fatal
      }
    }

    return result.changes > 0;
  }

  removeByUuid(uuid: string): boolean {
    const existing = this.getByUuid(uuid);
    if (!existing) return false;
    return this.remove(existing.id);
  }

  recordRecall(ids: number[]): void {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const stmt = this.db.prepare(
      'UPDATE memories SET recalled_count = recalled_count + 1, last_recalled_at = ? WHERE id = ?'
    );
    const tx = this.db.transaction(() => {
      for (const id of ids) {
        stmt.run(now, id);
      }
    });
    tx();
  }

  count(options?: { layer?: MemoryLayer; contributor?: string }): number {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.layer) {
      conditions.push('layer = ?');
      params.push(options.layer);
    }
    if (options?.contributor) {
      conditions.push('contributor = ?');
      params.push(options.contributor);
    }

    let sql = 'SELECT COUNT(*) as count FROM memories';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const row = this.db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  search(keyword: string, options?: { layer?: MemoryLayer; limit?: number }): Memory[] {
    if (this._fts5Available) {
      const ftsResults = this.searchFts5(keyword, options);
      if (ftsResults.length > 0) return ftsResults;
    }
    return this.searchLike(keyword, options);
  }

  /** FTS5-based search with BM25 ranking. */
  private searchFts5(keyword: string, options?: { layer?: MemoryLayer; limit?: number }): Memory[] {
    const escaped = escapeFts5Query(keyword);
    if (escaped === null) return [];

    const limit = options?.limit ?? 50;

    let sql = `
      SELECT m.* FROM memories m
      INNER JOIN (
        SELECT rowid, rank FROM memories_fts WHERE memories_fts MATCH ?
        ORDER BY rank
      ) fts ON m.id = fts.rowid
    `;
    const params: any[] = [escaped];

    const conditions: string[] = [];
    if (options?.layer) {
      conditions.push('m.layer = ?');
      params.push(options.layer);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY fts.rank';
    sql += ' LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToMemory(r));
  }

  /** LIKE-based fallback search (used when FTS5 is unavailable). */
  private searchLike(keyword: string, options?: { layer?: MemoryLayer; limit?: number }): Memory[] {
    if (!keyword || !keyword.trim()) return [];

    const conditions: string[] = ['(what LIKE ? OR why LIKE ?)'];
    const like = `%${keyword}%`;
    const params: any[] = [like, like];

    if (options?.layer) {
      conditions.push('layer = ?');
      params.push(options.layer);
    }

    let sql = 'SELECT * FROM memories WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC, id DESC';

    const limit = options?.limit ?? 50;
    sql += ' LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    const likeResults = rows.map(r => this.rowToMemory(r));

    // If LIKE returned fewer than 3 results and embeddings are available,
    // supplement with semantic search results
    if (likeResults.length < 3 && this.embeddingService?.isReady()) {
      // semanticSearch is async, but we return synchronously.
      // Store the promise; callers who want semantic results should use searchWithEmbeddings().
      // For the synchronous API, return LIKE results only.
    }

    return likeResults;
  }

  /**
   * Search with optional semantic embedding supplementation.
   * If search returns < 3 results and embeddings are available,
   * supplements with semantic search results (deduplicated).
   */
  async searchWithEmbeddings(keyword: string, options?: { layer?: MemoryLayer; limit?: number }): Promise<Memory[]> {
    const limit = options?.limit ?? 50;
    const likeResults = this.search(keyword, options);

    // Supplement with semantic search if too few results
    if (likeResults.length < 3 && this.embeddingService?.isReady()) {
      try {
        const semanticHits = await this.embeddingService.semanticSearch(
          this.db,
          keyword,
          limit,
        );

        const existingIds = new Set(likeResults.map(m => m.id));
        for (const hit of semanticHits) {
          if (hit.score < 0.3) continue; // Skip low-relevance results

          const memory = this.getByUuid(hit.uuid);
          if (!memory) continue;
          if (existingIds.has(memory.id)) continue;

          // Apply same filters as search
          if (options?.layer && memory.layer !== options.layer) continue;

          likeResults.push(memory);
          existingIds.add(memory.id);

          if (likeResults.length >= limit) break;
        }
      } catch {
        // Semantic search failure is non-fatal
      }
    }

    return likeResults;
  }

  pruneOld(days: number): number {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

    // If file-per-memory mode, delete JSON files first
    if (this.memoriesDir) {
      const toDelete = this.db.prepare('SELECT uuid, layer, shared FROM memories WHERE created_at < ?')
        .all(cutoff) as { uuid: string; layer: MemoryLayer; shared: number }[];
      for (const row of toDelete) {
        this.deleteMemoryFile(row.uuid, row.layer, row.shared === 1);
      }
    }

    const result = this.db.prepare('DELETE FROM memories WHERE created_at < ?').run(cutoff);

    if (this.memoriesDir) {
      this.updateDirHash();
    }

    return result.changes;
  }

  close(): void {
    this.db.close();
  }

  /**
   * Check if the store is in file-per-memory mode.
   */
  get hasFileStorage(): boolean {
    return this.memoriesDir !== null;
  }

  /**
   * Get the memories directory path (null if not in file-per-memory mode).
   */
  get memoriesPath(): string | null {
    return this.memoriesDir;
  }

  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      uuid: row.uuid,
      layer: row.layer as MemoryLayer,
      what: row.what,
      why: row.why,
      scope: row.scope,
      context_label: row.context_label,
      contributor: row.contributor,
      tags: row.tags ? JSON.parse(row.tags) : [],
      source: row.source as any,
      shared: row.shared === 1,
      generated_by: row.generated_by ? JSON.parse(row.generated_by) as GeneratedBy : null,
      derived_from: row.derived_from ? JSON.parse(row.derived_from) : null,
      created_at: row.created_at,
      updated_at: row.updated_at,
      recalled_count: row.recalled_count,
      last_recalled_at: row.last_recalled_at,
    };
  }
}
