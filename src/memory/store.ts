import Database from 'better-sqlite3';
import path from 'path';
import os from 'os';
import fs from 'fs';
import crypto from 'crypto';
import type { Memory, CreateMemory, MemoryLayer, MemoryStatus } from './types';
import { initFts5, backfillFts5Index, escapeFts5Query } from './fts5';

const SCHEMA_VERSION = 1;

const CREATE_TABLE = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer TEXT NOT NULL,
  what TEXT NOT NULL,
  why TEXT,
  scope TEXT,
  context_label TEXT,
  contributor TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'conversation',
  derived_from TEXT,
  created_at TEXT NOT NULL,
  recalled_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_layer ON memories(layer);
CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
CREATE INDEX IF NOT EXISTS idx_memories_context ON memories(context_label);
`;

const META_TABLE = `
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

function projectHash(projectPath: string): string {
  const normalized = path.resolve(projectPath);
  return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 12);
}

function getDbPath(projectPath: string): string {
  const hash = projectHash(projectPath);
  return path.join(os.homedir(), '.aide', 'projects', hash, 'memory.db');
}

export class MemoryStore {
  private db: Database.Database;
  readonly dbPath: string;
  private _fts5Available: boolean = false;

  /** Whether FTS5 full-text search is available and initialized. */
  get fts5Available(): boolean {
    return this._fts5Available;
  }

  constructor(projectPath: string);
  constructor(options: { dbPath: string });
  constructor(arg: string | { dbPath: string }) {
    if (typeof arg === 'string') {
      this.dbPath = getDbPath(arg);
    } else {
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
  }

  private init(): void {
    this.db.exec(META_TABLE);
    this.db.exec(CREATE_TABLE);

    const versionRow = this.db.prepare('SELECT value FROM meta WHERE key = ?').get('schema_version') as { value: string } | undefined;
    if (!versionRow) {
      this.db.prepare('INSERT INTO meta (key, value) VALUES (?, ?)').run('schema_version', String(SCHEMA_VERSION));
    }

    // Initialize FTS5 search (graceful fallback to LIKE if unavailable)
    this._fts5Available = initFts5(this.db);
    if (this._fts5Available) {
      backfillFts5Index(this.db);
    }
  }

  add(input: CreateMemory): Memory {
    const now = new Date().toISOString();
    const derivedJson = input.derived_from ? JSON.stringify(input.derived_from) : null;

    const result = this.db.prepare(`
      INSERT INTO memories (layer, what, why, scope, context_label, contributor, source, derived_from, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      input.layer,
      input.what,
      input.why ?? null,
      input.scope ?? null,
      input.context_label ?? null,
      input.contributor ?? null,
      input.source ?? 'conversation',
      derivedJson,
      now
    );

    return this.get(Number(result.lastInsertRowid))!;
  }

  get(id: number): Memory | null {
    const row = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as any;
    return row ? this.rowToMemory(row) : null;
  }

  list(options?: {
    layer?: MemoryLayer;
    status?: MemoryStatus;
    scope?: string;
    limit?: number;
  }): Memory[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.layer) {
      conditions.push('layer = ?');
      params.push(options.layer);
    }
    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }
    if (options?.scope) {
      conditions.push('scope = ?');
      params.push(options.scope);
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

  update(id: number, changes: Partial<Pick<Memory, 'what' | 'why' | 'scope' | 'context_label' | 'contributor' | 'status'>>): Memory | null {
    const fields: string[] = [];
    const params: any[] = [];

    for (const [key, value] of Object.entries(changes)) {
      if (value !== undefined) {
        fields.push(`${key} = ?`);
        params.push(value);
      }
    }

    if (fields.length === 0) return this.get(id);

    params.push(id);
    this.db.prepare(`UPDATE memories SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.get(id);
  }

  remove(id: number): boolean {
    const result = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  }

  archive(id: number): Memory | null {
    return this.update(id, { status: 'archived' });
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

  count(options?: { layer?: MemoryLayer; status?: MemoryStatus }): number {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.layer) {
      conditions.push('layer = ?');
      params.push(options.layer);
    }
    if (options?.status) {
      conditions.push('status = ?');
      params.push(options.status);
    }

    let sql = 'SELECT COUNT(*) as count FROM memories';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }

    const row = this.db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  search(keyword: string, options?: { layer?: MemoryLayer; status?: MemoryStatus; limit?: number }): Memory[] {
    if (this._fts5Available) {
      const ftsResults = this.searchFts5(keyword, options);
      // Fall back to LIKE if FTS5 returns nothing (handles substring matches
      // that FTS5 tokenization misses, e.g. single-character queries).
      if (ftsResults.length > 0) return ftsResults;
    }
    return this.searchLike(keyword, options);
  }

  /** FTS5-based search with BM25 ranking. */
  private searchFts5(keyword: string, options?: { layer?: MemoryLayer; status?: MemoryStatus; limit?: number }): Memory[] {
    const escaped = escapeFts5Query(keyword);
    if (escaped === null) return [];

    const limit = options?.limit ?? 50;

    // Use a JOIN to preserve BM25 ordering from the FTS5 MATCH.
    // The outer query applies layer/status filters without disturbing rank order.
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
    const status = options?.status ?? 'active';
    conditions.push('m.status = ?');
    params.push(status);

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
  private searchLike(keyword: string, options?: { layer?: MemoryLayer; status?: MemoryStatus; limit?: number }): Memory[] {
    if (!keyword || !keyword.trim()) return [];

    const conditions: string[] = ['(what LIKE ? OR why LIKE ?)'];
    const like = `%${keyword}%`;
    const params: any[] = [like, like];

    if (options?.layer) {
      conditions.push('layer = ?');
      params.push(options.layer);
    }

    const status = options?.status ?? 'active';
    conditions.push('status = ?');
    params.push(status);

    let sql = 'SELECT * FROM memories WHERE ' + conditions.join(' AND ');
    sql += ' ORDER BY created_at DESC, id DESC';

    const limit = options?.limit ?? 50;
    sql += ' LIMIT ?';
    params.push(limit);

    const rows = this.db.prepare(sql).all(...params) as any[];
    return rows.map(r => this.rowToMemory(r));
  }

  pruneOld(days: number): number {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const result = this.db.prepare('DELETE FROM memories WHERE created_at < ?').run(cutoff);
    return result.changes;
  }

  close(): void {
    this.db.close();
  }

  private rowToMemory(row: any): Memory {
    return {
      id: row.id,
      layer: row.layer as MemoryLayer,
      what: row.what,
      why: row.why,
      scope: row.scope,
      context_label: row.context_label,
      contributor: row.contributor,
      status: row.status as MemoryStatus,
      source: row.source as any,
      derived_from: row.derived_from ? JSON.parse(row.derived_from) : null,
      created_at: row.created_at,
      recalled_count: row.recalled_count,
      last_recalled_at: row.last_recalled_at,
    };
  }
}
