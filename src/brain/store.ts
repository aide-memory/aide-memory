/**
 * ProjectBrainStore Interface
 *
 * Defines the contract for all brain storage implementations.
 * V0 uses SQLite, but this interface allows future backends:
 * - Postgres
 * - Graph DB
 * - DuckDB
 * - Custom backends
 */

import {
  FileRecord,
  FileFilter,
  SymbolRecord,
  SymbolFilter,
  Relation,
  RelationFilter,
  Note,
  NoteFilter,
  Tag,
  TagFilter,
} from './types';

export interface ProjectBrainStore {
  // =========================================================================
  // Lifecycle
  // =========================================================================

  /** Initialize the store (create tables, etc.) */
  initialize(): void;

  /** Close connections and cleanup */
  close(): void;

  // =========================================================================
  // File Operations
  // =========================================================================

  /** Insert or update a file record */
  upsertFile(file: FileRecord): void;

  /** Find files matching the filter */
  findFiles(filter?: FileFilter): FileRecord[];

  /** Get a single file by ID */
  getFile(id: string): FileRecord | undefined;

  /** Delete a file and its associated symbols/relations */
  deleteFile(id: string): void;

  // =========================================================================
  // Symbol Operations
  // =========================================================================

  /** Insert or update a symbol record */
  upsertSymbol(symbol: SymbolRecord): void;

  /** Find symbols matching the filter */
  findSymbols(filter?: SymbolFilter): SymbolRecord[];

  /** Get a single symbol by ID */
  getSymbol(id: string): SymbolRecord | undefined;

  /** Get all symbols in a file */
  getSymbolsForFile(fileId: string): SymbolRecord[];

  /** Delete a symbol and its relations */
  deleteSymbol(id: string): void;

  /** Delete all symbols for a file */
  deleteSymbolsForFile(fileId: string): void;

  // =========================================================================
  // Relation Operations
  // =========================================================================

  /** Add a relation between symbols */
  addRelation(relation: Relation): void;

  /** Find relations matching the filter */
  findRelations(filter?: RelationFilter): Relation[];

  /** Get all relations where symbol is the source */
  getOutgoingRelations(symbolId: string): Relation[];

  /** Get all relations where symbol is the target */
  getIncomingRelations(symbolId: string): Relation[];

  /** Delete a specific relation */
  deleteRelation(id: string): void;

  /** Delete all relations for a symbol */
  deleteRelationsForSymbol(symbolId: string): void;

  // =========================================================================
  // Note Operations
  // =========================================================================

  /** Add a note */
  addNote(note: Note): void;

  /** Find notes matching the filter */
  findNotes(filter?: NoteFilter): Note[];

  /** Get notes for a symbol */
  getNotesForSymbol(symbolId: string): Note[];

  /** Get notes for a file */
  getNotesForFile(fileId: string): Note[];

  /** Delete a note */
  deleteNote(id: string): void;

  // =========================================================================
  // Tag Operations
  // =========================================================================

  /** Add a tag to a symbol */
  addTag(tag: Tag): void;

  /** Get all tags for a symbol */
  getTagsForSymbol(symbolId: string): Tag[];

  /** Find symbols with a specific tag */
  findSymbolsByTag(name: string, value?: string): SymbolRecord[];

  /** Delete a tag */
  deleteTag(id: string): void;

  /** Delete all tags for a symbol */
  deleteTagsForSymbol(symbolId: string): void;

  // =========================================================================
  // Bulk Operations
  // =========================================================================

  /** Clear all data (for full reindex) */
  clearAll(): void;

  /** Get statistics about the store */
  getStats(): {
    fileCount: number;
    symbolCount: number;
    relationCount: number;
    noteCount: number;
    tagCount: number;
  };
}
