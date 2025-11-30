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
}

// ============================================================================
// Model Types (kept from original)
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
}

export interface ModelRuntime {
  chat(messages: ChatMessage[]): Promise<ChatResponse>;
}
