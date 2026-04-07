import type Database from 'better-sqlite3';

/**
 * FTS5 full-text search module for AIDE Memory.
 *
 * Provides BM25-ranked search over memories using SQLite's FTS5 extension.
 * Falls back to LIKE-based search if FTS5 is not available.
 *
 * The FTS5 virtual table indexes: what, why, context_label.
 * Sync triggers keep the index up to date on INSERT, UPDATE, DELETE.
 */

const FTS5_TABLE = `
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  what, why, context_label,
  content=memories, content_rowid=id
);
`;

const FTS5_TRIGGER_INSERT = `
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, what, why, context_label)
  VALUES (new.id, new.what, new.why, new.context_label);
END;
`;

const FTS5_TRIGGER_DELETE = `
CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, what, why, context_label)
  VALUES ('delete', old.id, old.what, old.why, old.context_label);
END;
`;

const FTS5_TRIGGER_UPDATE = `
CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, what, why, context_label)
  VALUES ('delete', old.id, old.what, old.why, old.context_label);
  INSERT INTO memories_fts(rowid, what, why, context_label)
  VALUES (new.id, new.what, new.why, new.context_label);
END;
`;

/** Characters that have special meaning in FTS5 query syntax. */
const FTS5_SPECIAL_CHARS = /["*(){}[\]:^~!@#$%&+\\|<>=,;]/g;

/** Maximum query length before truncation. */
const MAX_QUERY_LENGTH = 500;

/**
 * Check whether the FTS5 extension is available in this SQLite build.
 */
export function isFts5Available(db: Database.Database): boolean {
  try {
    // Attempt to compile an FTS5 statement. This throws if FTS5 is not loaded.
    db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS _fts5_probe USING fts5(x)');
    db.exec('DROP TABLE IF EXISTS _fts5_probe');
    return true;
  } catch {
    return false;
  }
}

/**
 * Initialize the FTS5 virtual table and sync triggers.
 *
 * Call this during store init AFTER the memories table exists.
 * If FTS5 is unavailable, this is a no-op and returns false.
 */
export function initFts5(db: Database.Database): boolean {
  if (!isFts5Available(db)) {
    return false;
  }

  db.exec(FTS5_TABLE);
  db.exec(FTS5_TRIGGER_INSERT);
  db.exec(FTS5_TRIGGER_DELETE);
  db.exec(FTS5_TRIGGER_UPDATE);

  return true;
}

/**
 * Rebuild the FTS5 index from the memories table.
 *
 * Useful after a cache rebuild (P1.1) or if the index gets out of sync.
 */
export function rebuildFts5Index(db: Database.Database): void {
  db.exec("INSERT INTO memories_fts(memories_fts) VALUES ('rebuild')");
}

/**
 * Populate the FTS5 index with all existing rows from the memories table.
 *
 * Call this once after creating the FTS5 table when there are pre-existing
 * memories that were inserted before the triggers existed.
 */
export function backfillFts5Index(db: Database.Database): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM memories').get() as { c: number }).c;
  if (count === 0) return;

  const ftsCount = (db.prepare('SELECT COUNT(*) as c FROM memories_fts').get() as { c: number }).c;
  if (ftsCount > 0) return; // Already populated

  db.exec(`
    INSERT INTO memories_fts(rowid, what, why, context_label)
    SELECT id, what, why, context_label FROM memories
  `);
}

/**
 * Escape a user-provided query string for safe use with FTS5 MATCH.
 *
 * - Removes FTS5 special characters
 * - Truncates to MAX_QUERY_LENGTH
 * - Returns null for empty/whitespace-only queries (caller should return [])
 */
export function escapeFts5Query(query: string): string | null {
  if (!query || !query.trim()) return null;

  let cleaned = query.slice(0, MAX_QUERY_LENGTH);
  cleaned = cleaned.replace(FTS5_SPECIAL_CHARS, ' ');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  if (!cleaned) return null;

  // Quote each word individually so FTS5 treats them as literals.
  // Multi-word queries use implicit AND (FTS5 default).
  const words = cleaned.split(' ').filter(w => w.length > 0);
  if (words.length === 0) return null;

  return words.map(w => `"${w}"`).join(' ');
}
