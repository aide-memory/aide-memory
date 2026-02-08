/**
 * SQLite Implementation of ProjectGraph
 *
 * Uses better-sqlite3 for synchronous, fast operations.
 * Implements the unified ProjectGraph interface.
 */

import Database from 'better-sqlite3';
import { ProjectGraph } from './projectGraph';
import {
  FileRecord,
  FileFilter,
  SymbolRecord,
  SymbolFilter,
  ContentBlock,
  BlockFilter,
  BlockKind,
  Relation,
  RelationFilter,
  RelationKind,
  Note,
  NoteFilter,
  Tag,
  GraphStats,
} from './types';

export class SQLiteBrainStore implements ProjectGraph {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  // =========================================================================
  // Lifecycle
  // =========================================================================

  initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS files (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL UNIQUE,
        language TEXT NOT NULL,
        content_hash TEXT NOT NULL,
        summary TEXT,
        indexed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS symbols (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        name TEXT NOT NULL,
        kind TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        signature TEXT,
        doc_comment TEXT,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS content_blocks (
        id TEXT PRIMARY KEY,
        file_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content TEXT NOT NULL,
        symbol_id TEXT,
        parent_block_id TEXT,
        is_chunk INTEGER NOT NULL DEFAULT 0,
        chunk_index INTEGER,
        full_block_id TEXT,
        signature TEXT,
        metadata TEXT,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
        FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE SET NULL,
        FOREIGN KEY (parent_block_id) REFERENCES content_blocks(id) ON DELETE SET NULL,
        FOREIGN KEY (full_block_id) REFERENCES content_blocks(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS relations (
        id TEXT PRIMARY KEY,
        source_symbol_id TEXT NOT NULL,
        target_symbol_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        FOREIGN KEY (source_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
        FOREIGN KEY (target_symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
        UNIQUE(source_symbol_id, target_symbol_id, kind)
      );

      CREATE TABLE IF NOT EXISTS notes (
        id TEXT PRIMARY KEY,
        symbol_id TEXT,
        file_id TEXT,
        content TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
        FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        symbol_id TEXT NOT NULL,
        name TEXT NOT NULL,
        value TEXT,
        FOREIGN KEY (symbol_id) REFERENCES symbols(id) ON DELETE CASCADE,
        UNIQUE(symbol_id, name)
      );

      -- Indexes for common queries
      CREATE INDEX IF NOT EXISTS idx_symbols_file ON symbols(file_id);
      CREATE INDEX IF NOT EXISTS idx_symbols_name ON symbols(name);
      CREATE INDEX IF NOT EXISTS idx_symbols_kind ON symbols(kind);
      CREATE INDEX IF NOT EXISTS idx_blocks_file ON content_blocks(file_id);
      CREATE INDEX IF NOT EXISTS idx_blocks_symbol ON content_blocks(symbol_id);
      CREATE INDEX IF NOT EXISTS idx_blocks_kind ON content_blocks(kind);
      CREATE INDEX IF NOT EXISTS idx_blocks_full_block ON content_blocks(full_block_id);
      CREATE INDEX IF NOT EXISTS idx_blocks_is_chunk ON content_blocks(is_chunk);
      CREATE INDEX IF NOT EXISTS idx_relations_source ON relations(source_symbol_id);
      CREATE INDEX IF NOT EXISTS idx_relations_target ON relations(target_symbol_id);
      CREATE INDEX IF NOT EXISTS idx_relations_kind ON relations(kind);
      CREATE INDEX IF NOT EXISTS idx_notes_symbol ON notes(symbol_id);
      CREATE INDEX IF NOT EXISTS idx_notes_file ON notes(file_id);
      CREATE INDEX IF NOT EXISTS idx_tags_symbol ON tags(symbol_id);
      CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
    `);

    // Create FTS virtual table for full-text search on content blocks
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS content_blocks_fts USING fts5(
        content,
        content='content_blocks',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS index in sync
      CREATE TRIGGER IF NOT EXISTS content_blocks_ai AFTER INSERT ON content_blocks BEGIN
        INSERT INTO content_blocks_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;

      CREATE TRIGGER IF NOT EXISTS content_blocks_ad AFTER DELETE ON content_blocks BEGIN
        INSERT INTO content_blocks_fts(content_blocks_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
      END;

      CREATE TRIGGER IF NOT EXISTS content_blocks_au AFTER UPDATE ON content_blocks BEGIN
        INSERT INTO content_blocks_fts(content_blocks_fts, rowid, content) VALUES('delete', OLD.rowid, OLD.content);
        INSERT INTO content_blocks_fts(rowid, content) VALUES (NEW.rowid, NEW.content);
      END;
    `);

    // Embeddings table (self-contained, independent of project graph)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        file_path TEXT NOT NULL,
        content TEXT NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        content_hash TEXT NOT NULL,
        embedding BLOB NOT NULL,
        model TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_embeddings_file ON embeddings(file_path);
      CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON embeddings(content_hash);
    `);
  }

  close(): void {
    this.db.close();
  }

  // =========================================================================
  // File Operations
  // =========================================================================

  upsertFile(file: FileRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO files (id, path, language, content_hash, summary, indexed_at)
      VALUES (@id, @path, @language, @contentHash, @summary, @indexedAt)
      ON CONFLICT(id) DO UPDATE SET
        path = @path,
        language = @language,
        content_hash = @contentHash,
        summary = @summary,
        indexed_at = @indexedAt
    `);
    // Ensure all named parameters are present (undefined -> null)
    stmt.run({
      id: file.id,
      path: file.path,
      language: file.language,
      contentHash: file.contentHash,
      summary: file.summary ?? null,
      indexedAt: file.indexedAt,
    });
  }

  findFiles(filter?: FileFilter): FileRecord[] {
    if (!filter) {
      return this.mapFileRows(this.db.prepare('SELECT * FROM files').all());
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.id) {
      conditions.push('id = @id');
      params.id = filter.id;
    }
    if (filter.path) {
      conditions.push('path = @path');
      params.path = filter.path;
    }
    if (filter.pathPattern) {
      conditions.push('path LIKE @pathPattern');
      params.pathPattern = filter.pathPattern.replace(/\*/g, '%');
    }
    if (filter.language) {
      conditions.push('language = @language');
      params.language = filter.language;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM files ${where}`).all(params);
    return this.mapFileRows(rows);
  }

  getFile(id: string): FileRecord | undefined {
    const row = this.db.prepare('SELECT * FROM files WHERE id = ?').get(id);
    return row ? this.mapFileRow(row) : undefined;
  }

  deleteFile(id: string): void {
    this.db.prepare('DELETE FROM files WHERE id = ?').run(id);
  }

  // =========================================================================
  // Symbol Operations
  // =========================================================================

  upsertSymbol(symbol: SymbolRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO symbols (id, file_id, name, kind, start_line, end_line, signature, doc_comment)
      VALUES (@id, @fileId, @name, @kind, @startLine, @endLine, @signature, @docComment)
      ON CONFLICT(id) DO UPDATE SET
        file_id = @fileId,
        name = @name,
        kind = @kind,
        start_line = @startLine,
        end_line = @endLine,
        signature = @signature,
        doc_comment = @docComment
    `);
    // Ensure all named parameters are present (undefined -> null)
    stmt.run({
      id: symbol.id,
      fileId: symbol.fileId,
      name: symbol.name,
      kind: symbol.kind,
      startLine: symbol.startLine,
      endLine: symbol.endLine,
      signature: symbol.signature ?? null,
      docComment: symbol.docComment ?? null,
    });
  }

  findSymbols(filter?: SymbolFilter): SymbolRecord[] {
    if (!filter) {
      return this.mapSymbolRows(this.db.prepare('SELECT * FROM symbols').all());
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.id) {
      conditions.push('id = @id');
      params.id = filter.id;
    }
    if (filter.fileId) {
      conditions.push('file_id = @fileId');
      params.fileId = filter.fileId;
    }
    if (filter.name) {
      conditions.push('name = @name');
      params.name = filter.name;
    }
    if (filter.namePattern) {
      conditions.push('name LIKE @namePattern');
      params.namePattern = `%${filter.namePattern}%`;
    }
    if (filter.kind) {
      conditions.push('kind = @kind');
      params.kind = filter.kind;
    }
    if (filter.kinds && filter.kinds.length > 0) {
      const placeholders = filter.kinds.map((_, i) => `@kind${i}`).join(', ');
      conditions.push(`kind IN (${placeholders})`);
      filter.kinds.forEach((k, i) => {
        params[`kind${i}`] = k;
      });
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM symbols ${where}`).all(params);
    return this.mapSymbolRows(rows);
  }

  getSymbol(id: string): SymbolRecord | undefined {
    const row = this.db.prepare('SELECT * FROM symbols WHERE id = ?').get(id);
    return row ? this.mapSymbolRow(row) : undefined;
  }

  getSymbolsForFile(fileId: string): SymbolRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM symbols WHERE file_id = ?')
      .all(fileId);
    return this.mapSymbolRows(rows);
  }

  deleteSymbol(id: string): void {
    this.db.prepare('DELETE FROM symbols WHERE id = ?').run(id);
  }

  deleteSymbolsForFile(fileId: string): void {
    this.db.prepare('DELETE FROM symbols WHERE file_id = ?').run(fileId);
  }

  // =========================================================================
  // Content Block Operations
  // =========================================================================

  upsertBlock(block: ContentBlock): void {
    const stmt = this.db.prepare(`
      INSERT INTO content_blocks (
        id, file_id, kind, start_line, end_line, content,
        symbol_id, parent_block_id, is_chunk, chunk_index, full_block_id,
        signature, metadata
      )
      VALUES (
        @id, @fileId, @kind, @startLine, @endLine, @content,
        @symbolId, @parentBlockId, @isChunk, @chunkIndex, @fullBlockId,
        @signature, @metadata
      )
      ON CONFLICT(id) DO UPDATE SET
        file_id = @fileId,
        kind = @kind,
        start_line = @startLine,
        end_line = @endLine,
        content = @content,
        symbol_id = @symbolId,
        parent_block_id = @parentBlockId,
        is_chunk = @isChunk,
        chunk_index = @chunkIndex,
        full_block_id = @fullBlockId,
        signature = @signature,
        metadata = @metadata
    `);
    stmt.run({
      id: block.id,
      fileId: block.fileId,
      kind: block.kind,
      startLine: block.startLine,
      endLine: block.endLine,
      content: block.content,
      symbolId: block.symbolId ?? null,
      parentBlockId: block.parentBlockId ?? null,
      isChunk: block.isChunk ? 1 : 0,
      chunkIndex: block.chunkIndex ?? null,
      fullBlockId: block.fullBlockId ?? null,
      signature: block.signature ?? null,
      metadata: block.metadata ? JSON.stringify(block.metadata) : null,
    });
  }

  getBlock(id: string): ContentBlock | undefined {
    const row = this.db
      .prepare('SELECT * FROM content_blocks WHERE id = ?')
      .get(id);
    return row ? this.mapBlockRow(row) : undefined;
  }

  findBlocks(filter?: BlockFilter): ContentBlock[] {
    if (!filter) {
      return this.mapBlockRows(
        this.db.prepare('SELECT * FROM content_blocks').all()
      );
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.id) {
      conditions.push('id = @id');
      params.id = filter.id;
    }
    if (filter.fileId) {
      conditions.push('file_id = @fileId');
      params.fileId = filter.fileId;
    }
    if (filter.symbolId) {
      conditions.push('symbol_id = @symbolId');
      params.symbolId = filter.symbolId;
    }
    if (filter.kind) {
      conditions.push('kind = @kind');
      params.kind = filter.kind;
    }
    if (filter.kinds && filter.kinds.length > 0) {
      const placeholders = filter.kinds.map((_, i) => `@kind${i}`).join(', ');
      conditions.push(`kind IN (${placeholders})`);
      filter.kinds.forEach((k, i) => {
        params[`kind${i}`] = k;
      });
    }
    if (filter.isChunk !== undefined) {
      conditions.push('is_chunk = @isChunk');
      params.isChunk = filter.isChunk ? 1 : 0;
    }
    if (filter.fullBlockId) {
      conditions.push('full_block_id = @fullBlockId');
      params.fullBlockId = filter.fullBlockId;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM content_blocks ${where}`)
      .all(params);
    return this.mapBlockRows(rows);
  }

  getBlocksForSymbol(symbolId: string): ContentBlock[] {
    const rows = this.db
      .prepare('SELECT * FROM content_blocks WHERE symbol_id = ?')
      .all(symbolId);
    return this.mapBlockRows(rows);
  }

  getBlocksForFile(fileId: string): ContentBlock[] {
    const rows = this.db
      .prepare('SELECT * FROM content_blocks WHERE file_id = ?')
      .all(fileId);
    return this.mapBlockRows(rows);
  }

  getChunksForBlock(fullBlockId: string): ContentBlock[] {
    const rows = this.db
      .prepare(
        'SELECT * FROM content_blocks WHERE full_block_id = ? ORDER BY chunk_index'
      )
      .all(fullBlockId);
    return this.mapBlockRows(rows);
  }

  searchBlocks(query: string, kinds?: BlockKind[]): ContentBlock[] {
    let sql = `
      SELECT cb.* FROM content_blocks cb
      JOIN content_blocks_fts fts ON cb.rowid = fts.rowid
      WHERE content_blocks_fts MATCH ?
    `;
    const params: unknown[] = [query];

    if (kinds && kinds.length > 0) {
      const placeholders = kinds.map(() => '?').join(', ');
      sql += ` AND cb.kind IN (${placeholders})`;
      params.push(...kinds);
    }

    const rows = this.db.prepare(sql).all(...params);
    return this.mapBlockRows(rows);
  }

  deleteBlock(id: string): void {
    this.db.prepare('DELETE FROM content_blocks WHERE id = ?').run(id);
  }

  deleteBlocksForFile(fileId: string): void {
    this.db.prepare('DELETE FROM content_blocks WHERE file_id = ?').run(fileId);
  }

  deleteBlocksForSymbol(symbolId: string): void {
    this.db
      .prepare('DELETE FROM content_blocks WHERE symbol_id = ?')
      .run(symbolId);
  }

  // =========================================================================
  // Relation Operations
  // =========================================================================

  addRelation(relation: Relation): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO relations (id, source_symbol_id, target_symbol_id, kind)
      VALUES (@id, @sourceSymbolId, @targetSymbolId, @kind)
    `);
    stmt.run(relation);
  }

  findRelations(filter?: RelationFilter): Relation[] {
    if (!filter) {
      return this.mapRelationRows(
        this.db.prepare('SELECT * FROM relations').all()
      );
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.sourceSymbolId) {
      conditions.push('source_symbol_id = @sourceSymbolId');
      params.sourceSymbolId = filter.sourceSymbolId;
    }
    if (filter.targetSymbolId) {
      conditions.push('target_symbol_id = @targetSymbolId');
      params.targetSymbolId = filter.targetSymbolId;
    }
    if (filter.kind) {
      conditions.push('kind = @kind');
      params.kind = filter.kind;
    }
    if (filter.kinds && filter.kinds.length > 0) {
      const placeholders = filter.kinds.map((_, i) => `@kind${i}`).join(', ');
      conditions.push(`kind IN (${placeholders})`);
      filter.kinds.forEach((k, i) => {
        params[`kind${i}`] = k;
      });
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db
      .prepare(`SELECT * FROM relations ${where}`)
      .all(params);
    return this.mapRelationRows(rows);
  }

  getOutgoingRelations(symbolId: string): Relation[] {
    const rows = this.db
      .prepare('SELECT * FROM relations WHERE source_symbol_id = ?')
      .all(symbolId);
    return this.mapRelationRows(rows);
  }

  getIncomingRelations(symbolId: string): Relation[] {
    const rows = this.db
      .prepare('SELECT * FROM relations WHERE target_symbol_id = ?')
      .all(symbolId);
    return this.mapRelationRows(rows);
  }

  deleteRelation(id: string): void {
    this.db.prepare('DELETE FROM relations WHERE id = ?').run(id);
  }

  deleteRelationsForSymbol(symbolId: string): void {
    this.db
      .prepare(
        'DELETE FROM relations WHERE source_symbol_id = ? OR target_symbol_id = ?'
      )
      .run(symbolId, symbolId);
  }

  // =========================================================================
  // Note Operations
  // =========================================================================

  addNote(note: Note): void {
    const stmt = this.db.prepare(`
      INSERT INTO notes (id, symbol_id, file_id, content, source, created_at)
      VALUES (@id, @symbolId, @fileId, @content, @source, @createdAt)
    `);
    // Ensure all named parameters are present (undefined -> null)
    stmt.run({
      id: note.id,
      symbolId: note.symbolId ?? null,
      fileId: note.fileId ?? null,
      content: note.content,
      source: note.source,
      createdAt: note.createdAt,
    });
  }

  findNotes(filter?: NoteFilter): Note[] {
    if (!filter) {
      return this.mapNoteRows(this.db.prepare('SELECT * FROM notes').all());
    }

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.id) {
      conditions.push('id = @id');
      params.id = filter.id;
    }
    if (filter.symbolId) {
      conditions.push('symbol_id = @symbolId');
      params.symbolId = filter.symbolId;
    }
    if (filter.fileId) {
      conditions.push('file_id = @fileId');
      params.fileId = filter.fileId;
    }
    if (filter.source) {
      conditions.push('source = @source');
      params.source = filter.source;
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const rows = this.db.prepare(`SELECT * FROM notes ${where}`).all(params);
    return this.mapNoteRows(rows);
  }

  getNotesForSymbol(symbolId: string): Note[] {
    const rows = this.db
      .prepare('SELECT * FROM notes WHERE symbol_id = ?')
      .all(symbolId);
    return this.mapNoteRows(rows);
  }

  getNotesForFile(fileId: string): Note[] {
    const rows = this.db
      .prepare('SELECT * FROM notes WHERE file_id = ?')
      .all(fileId);
    return this.mapNoteRows(rows);
  }

  deleteNote(id: string): void {
    this.db.prepare('DELETE FROM notes WHERE id = ?').run(id);
  }

  // =========================================================================
  // Tag Operations
  // =========================================================================

  addTag(tag: Tag): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO tags (id, symbol_id, name, value)
      VALUES (@id, @symbolId, @name, @value)
    `);
    // Ensure all named parameters are present (undefined -> null)
    stmt.run({
      id: tag.id,
      symbolId: tag.symbolId,
      name: tag.name,
      value: tag.value ?? null,
    });
  }

  getTagsForSymbol(symbolId: string): Tag[] {
    const rows = this.db
      .prepare('SELECT * FROM tags WHERE symbol_id = ?')
      .all(symbolId);
    return this.mapTagRows(rows);
  }

  findSymbolsByTag(name: string, value?: string): SymbolRecord[] {
    let query = `
      SELECT s.* FROM symbols s
      JOIN tags t ON s.id = t.symbol_id
      WHERE t.name = ?
    `;
    const params: unknown[] = [name];

    if (value !== undefined) {
      query += ' AND t.value = ?';
      params.push(value);
    }

    const rows = this.db.prepare(query).all(...params);
    return this.mapSymbolRows(rows);
  }

  deleteTag(id: string): void {
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id);
  }

  deleteTagsForSymbol(symbolId: string): void {
    this.db.prepare('DELETE FROM tags WHERE symbol_id = ?').run(symbolId);
  }

  // =========================================================================
  // Graph Traversal
  // =========================================================================

  neighbors(
    id: string,
    opts?: {
      edgeKinds?: RelationKind[];
      direction?: 'in' | 'out' | 'both';
      limit?: number;
    }
  ): SymbolRecord[] {
    const direction = opts?.direction ?? 'both';
    const limit = opts?.limit ?? 50;
    const edgeKinds = opts?.edgeKinds;

    const neighborIds = new Set<string>();

    // Get outgoing neighbors (this symbol -> others)
    if (direction === 'out' || direction === 'both') {
      let outQuery =
        'SELECT target_symbol_id FROM relations WHERE source_symbol_id = ?';
      const outParams: unknown[] = [id];

      if (edgeKinds && edgeKinds.length > 0) {
        const placeholders = edgeKinds.map(() => '?').join(', ');
        outQuery += ` AND kind IN (${placeholders})`;
        outParams.push(...edgeKinds);
      }

      const outRows = this.db.prepare(outQuery).all(...outParams) as Array<{
        target_symbol_id: string;
      }>;
      for (const row of outRows) {
        neighborIds.add(row.target_symbol_id);
      }
    }

    // Get incoming neighbors (others -> this symbol)
    if (direction === 'in' || direction === 'both') {
      let inQuery =
        'SELECT source_symbol_id FROM relations WHERE target_symbol_id = ?';
      const inParams: unknown[] = [id];

      if (edgeKinds && edgeKinds.length > 0) {
        const placeholders = edgeKinds.map(() => '?').join(', ');
        inQuery += ` AND kind IN (${placeholders})`;
        inParams.push(...edgeKinds);
      }

      const inRows = this.db.prepare(inQuery).all(...inParams) as Array<{
        source_symbol_id: string;
      }>;
      for (const row of inRows) {
        neighborIds.add(row.source_symbol_id);
      }
    }

    // Fetch the actual symbol records
    const neighbors: SymbolRecord[] = [];
    const ids = Array.from(neighborIds).slice(0, limit);

    for (const neighborId of ids) {
      const symbol = this.getSymbol(neighborId);
      if (symbol) {
        neighbors.push(symbol);
      }
    }

    return neighbors;
  }

  // =========================================================================
  // Bulk Operations
  // =========================================================================

  clearAll(): void {
    this.db.exec(`
      DELETE FROM tags;
      DELETE FROM notes;
      DELETE FROM relations;
      DELETE FROM content_blocks;
      DELETE FROM symbols;
      DELETE FROM files;
    `);
  }

  getStats(): GraphStats {
    const fileCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM files').get() as {
        count: number;
      }
    ).count;
    const symbolCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM symbols').get() as {
        count: number;
      }
    ).count;
    const blockCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM content_blocks').get() as {
        count: number;
      }
    ).count;
    const relationCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM relations').get() as {
        count: number;
      }
    ).count;
    const noteCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM notes').get() as {
        count: number;
      }
    ).count;
    const tagCount = (
      this.db.prepare('SELECT COUNT(*) as count FROM tags').get() as {
        count: number;
      }
    ).count;

    return {
      fileCount,
      symbolCount,
      blockCount,
      relationCount,
      noteCount,
      tagCount,
    };
  }

  // =========================================================================
  // Row Mapping Helpers
  // =========================================================================

  private mapFileRow(row: unknown): FileRecord {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      path: r.path as string,
      language: r.language as string,
      contentHash: r.content_hash as string,
      summary: r.summary as string | undefined,
      indexedAt: r.indexed_at as string,
    };
  }

  private mapFileRows(rows: unknown[]): FileRecord[] {
    return rows.map((r) => this.mapFileRow(r));
  }

  private mapSymbolRow(row: unknown): SymbolRecord {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      fileId: r.file_id as string,
      name: r.name as string,
      kind: r.kind as SymbolRecord['kind'],
      startLine: r.start_line as number,
      endLine: r.end_line as number,
      signature: r.signature as string | undefined,
      docComment: r.doc_comment as string | undefined,
    };
  }

  private mapSymbolRows(rows: unknown[]): SymbolRecord[] {
    return rows.map((r) => this.mapSymbolRow(r));
  }

  private mapBlockRow(row: unknown): ContentBlock {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      fileId: r.file_id as string,
      kind: r.kind as BlockKind,
      startLine: r.start_line as number,
      endLine: r.end_line as number,
      content: r.content as string,
      symbolId: (r.symbol_id as string) || undefined,
      parentBlockId: (r.parent_block_id as string) || undefined,
      isChunk: r.is_chunk === 1,
      chunkIndex:
        r.chunk_index !== null ? (r.chunk_index as number) : undefined,
      fullBlockId: (r.full_block_id as string) || undefined,
      signature: (r.signature as string) || undefined,
      metadata: r.metadata
        ? (JSON.parse(r.metadata as string) as Record<string, unknown>)
        : undefined,
    };
  }

  private mapBlockRows(rows: unknown[]): ContentBlock[] {
    return rows.map((r) => this.mapBlockRow(r));
  }

  private mapRelationRow(row: unknown): Relation {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      sourceSymbolId: r.source_symbol_id as string,
      targetSymbolId: r.target_symbol_id as string,
      kind: r.kind as Relation['kind'],
    };
  }

  private mapRelationRows(rows: unknown[]): Relation[] {
    return rows.map((r) => this.mapRelationRow(r));
  }

  private mapNoteRow(row: unknown): Note {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      symbolId: r.symbol_id as string | undefined,
      fileId: r.file_id as string | undefined,
      content: r.content as string,
      source: r.source as Note['source'],
      createdAt: r.created_at as string,
    };
  }

  private mapNoteRows(rows: unknown[]): Note[] {
    return rows.map((r) => this.mapNoteRow(r));
  }

  private mapTagRow(row: unknown): Tag {
    const r = row as Record<string, unknown>;
    return {
      id: r.id as string,
      symbolId: r.symbol_id as string,
      name: r.name as string,
      value: r.value as string | undefined,
    };
  }

  private mapTagRows(rows: unknown[]): Tag[] {
    return rows.map((r) => this.mapTagRow(r));
  }

  // =========================================================================
  // Embedding Operations
  // =========================================================================

  /** Embedding record for storage and retrieval */
  upsertEmbedding(record: {
    id: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    contentHash: string;
    embedding: Float32Array;
    model: string;
  }): void {
    const embeddingBlob = Buffer.from(record.embedding.buffer);
    this.db
      .prepare(
        `INSERT INTO embeddings (id, file_path, content, start_line, end_line, content_hash, embedding, model, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           start_line = excluded.start_line,
           end_line = excluded.end_line,
           content_hash = excluded.content_hash,
           embedding = excluded.embedding,
           model = excluded.model,
           created_at = excluded.created_at`
      )
      .run(
        record.id,
        record.filePath,
        record.content,
        record.startLine,
        record.endLine,
        record.contentHash,
        embeddingBlob,
        record.model,
        new Date().toISOString()
      );
  }

  /** Get all embeddings (for brute-force similarity search) */
  getAllEmbeddings(): Array<{
    id: string;
    filePath: string;
    content: string;
    startLine: number;
    endLine: number;
    embedding: Float32Array;
  }> {
    const rows = this.db
      .prepare('SELECT id, file_path, content, start_line, end_line, embedding FROM embeddings')
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: r.id as string,
      filePath: r.file_path as string,
      content: r.content as string,
      startLine: r.start_line as number,
      endLine: r.end_line as number,
      embedding: new Float32Array((r.embedding as Buffer).buffer, (r.embedding as Buffer).byteOffset, (r.embedding as Buffer).byteLength / 4),
    }));
  }

  /** Get existing content hashes for a file (for incremental re-indexing) */
  getEmbeddingHashesForFile(filePath: string): Set<string> {
    const rows = this.db
      .prepare('SELECT content_hash FROM embeddings WHERE file_path = ?')
      .all(filePath) as Array<Record<string, unknown>>;

    return new Set(rows.map((r) => r.content_hash as string));
  }

  /** Delete embeddings for a file */
  deleteEmbeddingsForFile(filePath: string): void {
    this.db
      .prepare('DELETE FROM embeddings WHERE file_path = ?')
      .run(filePath);
  }

  /** Delete all embeddings */
  clearEmbeddings(): void {
    this.db.prepare('DELETE FROM embeddings').run();
  }

  /** Check if any embeddings exist */
  hasEmbeddings(): boolean {
    const row = this.db
      .prepare('SELECT COUNT(*) as count FROM embeddings')
      .get() as Record<string, unknown>;
    return (row.count as number) > 0;
  }

  /** Get embedding stats */
  getEmbeddingStats(): { totalChunks: number; totalFiles: number } {
    const row = this.db
      .prepare(
        'SELECT COUNT(*) as chunks, COUNT(DISTINCT file_path) as files FROM embeddings'
      )
      .get() as Record<string, unknown>;
    return {
      totalChunks: row.chunks as number,
      totalFiles: row.files as number,
    };
  }
}
