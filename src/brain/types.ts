/**
 * Core types for the Project Brain
 */

// ============================================================================
// File Records
// ============================================================================

export interface FileRecord {
  id: string;
  path: string; // relative to project root
  language: string;
  contentHash: string;
  summary?: string;
  indexedAt: string; // ISO timestamp
}

export interface FileFilter {
  id?: string;
  path?: string;
  pathPattern?: string; // glob or regex pattern
  language?: string;
}

// ============================================================================
// Symbol Records
// ============================================================================

export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'module'
  | 'method'
  | 'property';

export interface SymbolRecord {
  id: string;
  fileId: string;
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
}

export interface SymbolFilter {
  id?: string;
  fileId?: string;
  name?: string;
  namePattern?: string; // fuzzy match pattern
  kind?: SymbolKind;
  kinds?: SymbolKind[];
}

// ============================================================================
// Relations
// ============================================================================

export type RelationKind =
  | 'CALLS'
  | 'IMPORTS'
  | 'TESTS'
  | 'CONFIGURES'
  | 'EXTENDS'
  | 'IMPLEMENTS';

export interface Relation {
  id: string;
  sourceSymbolId: string;
  targetSymbolId: string;
  kind: RelationKind;
}

export interface RelationFilter {
  sourceSymbolId?: string;
  targetSymbolId?: string;
  kind?: RelationKind;
  kinds?: RelationKind[];
}

// ============================================================================
// Notes
// ============================================================================

export type NoteSource = 'system' | 'model' | 'user';

export interface Note {
  id: string;
  symbolId?: string;
  fileId?: string;
  content: string;
  source: NoteSource;
  createdAt: string; // ISO timestamp
}

export interface NoteFilter {
  id?: string;
  symbolId?: string;
  fileId?: string;
  source?: NoteSource;
}

// ============================================================================
// Tags
// ============================================================================

export interface Tag {
  id: string;
  symbolId: string;
  name: string;
  value?: string;
}

export interface TagFilter {
  symbolId?: string;
  name?: string;
}

// ============================================================================
// Content Blocks
// ============================================================================

export type BlockKind =
  // Code content
  | 'code' // Function/class/method body
  | 'import' // Import statements
  | 'export' // Export statements

  // Documentation
  | 'comment' // Standalone comments
  | 'docstring' // JSDoc, docstring, rustdoc
  | 'todo' // TODO/FIXME markers

  // Non-code
  | 'markdown' // Markdown content
  | 'prose' // Plain text
  | 'config' // Config files (JSON, YAML)
  | 'data' // Data structures

  // Notebook
  | 'cell' // Notebook cell
  | 'output'; // Cell output

export interface ContentBlock {
  id: string;
  fileId: string;
  kind: BlockKind;
  startLine: number;
  endLine: number;
  content: string;

  // Linkage
  symbolId?: string; // Associated symbol (if code block)
  parentBlockId?: string; // Parent block (for nesting)

  // Chunking
  isChunk: boolean;
  chunkIndex?: number;
  fullBlockId?: string; // Reference to full block

  // Quick reference
  signature?: string;

  metadata?: Record<string, unknown>;
}

export interface BlockFilter {
  id?: string;
  fileId?: string;
  symbolId?: string;
  kind?: BlockKind;
  kinds?: BlockKind[];
  isChunk?: boolean;
  fullBlockId?: string;
}

// ============================================================================
// Graph Stats
// ============================================================================

export interface GraphStats {
  fileCount: number;
  symbolCount: number;
  blockCount: number;
  relationCount: number;
  noteCount: number;
  tagCount: number;
}

// ============================================================================
// Retrieval Types
// ============================================================================

export interface RetrievalQuery {
  question: string;
  focusSymbolIds?: string[];
  focusFileIds?: string[];
  maxDepth?: number;
  maxFanout?: number;
  tokenBudget?: number;
}

export interface CodeSlice {
  central: SymbolRecord[];
  callers: SymbolRecord[];
  callees: SymbolRecord[];
  tests: SymbolRecord[];
  configs: FileRecord[];
  notes: Note[];
  files: Map<string, FileRecord>; // fileId -> FileRecord for resolving
}

// ============================================================================
// Session Types
// ============================================================================

export interface SessionState {
  id: string;
  projectId: string;
  focusSymbolIds: string[];
  focusFileIds: string[];
  lastQuestion?: string;
  lastAnswerSummary?: string;
  chatHistory: ChatMessage[]; // Persisted chat history
  startedAt: string;
  updatedAt: string;
}

// ============================================================================
// Project Config
// ============================================================================

export interface ProjectConfig {
  id: string;
  rootPath: string;
  model: string;
  embeddingModel: string;
  ollamaBaseUrl: string;

  // Retrieval settings (optional - falls back to AIDE_DEFAULTS)
  tokenBudget?: number;
  maxBlocks?: number;
  strategy?: 'simple' | 'tools' | 'hybrid';
  hybridMode?: 'code' | 'hints';
}

// ============================================================================
// Model Types (kept from original)
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  metadata?: {
    strategy?: string;
    hybridMode?: string;
    symbolCount?: number;
    blockCount?: number;
  };
}

export interface ChatResponse {
  content: string;
}

export interface ModelRuntime {
  chat(messages: ChatMessage[]): Promise<ChatResponse>;
}
