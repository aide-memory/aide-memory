/**
 * ProjectGraph Interface
 *
 * The central interface for all graph operations.
 * All layers access the graph through this interface:
 * - analysis/ writes via ProjectGraph
 * - retrieval/ reads via ProjectGraph
 * - brain/sqliteStore.ts implements ProjectGraph
 *
 * This allows future backend swaps (Postgres, DuckDB, Graph DB, etc.)
 */

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

export interface ProjectGraph {
  // =========================================================================
  // Lifecycle
  // =========================================================================

  /** Initialize the graph store (create tables, indexes, etc.) */
  initialize(): void;

  /** Close connections and cleanup */
  close(): void;

  /** Clear all data (for full reindex) */
  clearAll(): void;

  /** Get statistics about the graph */
  getStats(): GraphStats;

  // =========================================================================
  // File Operations
  // =========================================================================

  /** Insert or update a file record */
  upsertFile(file: FileRecord): void;

  /** Get a single file by ID */
  getFile(id: string): FileRecord | undefined;

  /** Find files matching the filter */
  findFiles(filter?: FileFilter): FileRecord[];

  /** Delete a file and all associated data (symbols, blocks, relations) */
  deleteFile(id: string): void;

  // =========================================================================
  // Symbol Operations
  // =========================================================================

  /** Insert or update a symbol record */
  upsertSymbol(symbol: SymbolRecord): void;

  /** Get a single symbol by ID */
  getSymbol(id: string): SymbolRecord | undefined;

  /** Find symbols matching the filter */
  findSymbols(filter?: SymbolFilter): SymbolRecord[];

  /** Get all symbols in a file */
  getSymbolsForFile(fileId: string): SymbolRecord[];

  /** Delete a symbol and its relations */
  deleteSymbol(id: string): void;

  /** Delete all symbols for a file */
  deleteSymbolsForFile(fileId: string): void;

  // =========================================================================
  // Content Block Operations
  // =========================================================================

  /** Insert or update a content block */
  upsertBlock(block: ContentBlock): void;

  /** Get a single block by ID */
  getBlock(id: string): ContentBlock | undefined;

  /** Find blocks matching the filter */
  findBlocks(filter?: BlockFilter): ContentBlock[];

  /** Get all blocks for a symbol (including chunks) */
  getBlocksForSymbol(symbolId: string): ContentBlock[];

  /** Get all blocks for a file */
  getBlocksForFile(fileId: string): ContentBlock[];

  /** Get all chunks for a full block */
  getChunksForBlock(fullBlockId: string): ContentBlock[];

  /** Full-text search across block content */
  searchBlocks(query: string, kinds?: BlockKind[]): ContentBlock[];

  /** Delete a block */
  deleteBlock(id: string): void;

  /** Delete all blocks for a file */
  deleteBlocksForFile(fileId: string): void;

  /** Delete all blocks for a symbol */
  deleteBlocksForSymbol(symbolId: string): void;

  // =========================================================================
  // Relation Operations
  // =========================================================================

  /** Add a relation between symbols */
  addRelation(relation: Relation): void;

  /** Find relations matching the filter */
  findRelations(filter?: RelationFilter): Relation[];

  /** Get all relations where symbol is the source (outgoing) */
  getOutgoingRelations(symbolId: string): Relation[];

  /** Get all relations where symbol is the target (incoming) */
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
  // Graph Traversal
  // =========================================================================

  /**
   * Get neighboring nodes (symbols or files) connected by relations.
   * This is the core graph traversal primitive.
   */
  neighbors(
    id: string,
    opts?: {
      /** Filter by relation types */
      edgeKinds?: RelationKind[];
      /** Direction: incoming, outgoing, or both */
      direction?: 'in' | 'out' | 'both';
      /** Maximum number of neighbors to return */
      limit?: number;
    }
  ): SymbolRecord[];
}

/**
 * Legacy compatibility: ProjectBrainStore is an alias for ProjectGraph
 * @deprecated Use ProjectGraph instead
 */
export type ProjectBrainStore = ProjectGraph;

