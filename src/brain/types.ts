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

// Forward reference for SessionManager to avoid circular imports
export interface SessionManagerRef {
  getHistory(): ChatMessage[];
  getId(): string;
}

// Forward reference for listing sessions
export interface SessionListItem {
  id: string;
  name: string;
  updatedAt: string;
}

export interface RetrievalQuery {
  question: string;
  focusSymbolIds?: string[];
  focusFileIds?: string[];
  maxDepth?: number;
  maxFanout?: number;
  tokenBudget?: number;

  // Conversation history access
  /** For direct mode: recent messages to include in retrieval context */
  conversationHistory?: ChatMessage[];
  /** For tool-based mode: session manager for cross-session search */
  sessionManager?: SessionManagerRef;
  /** Directory containing session files (for cross-session search) */
  sessionsDir?: string;
  /** Function to list all sessions (for cross-session search) */
  listSessions?: () => SessionListItem[];
  /** Function to load a session's history by ID */
  loadSessionHistory?: (sessionId: string) => ChatMessage[] | null;
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

export interface ModelRoleConfig {
  /** High-level planning, answering, and decision-making */
  reasoning: string;
  /** Context gathering, tool call iteration, relevance evaluation */
  context: string;
  /** Vector embedding generation */
  embedding: string;
}

export interface ProjectConfig {
  id: string;
  rootPath: string;
  /** All three model roles -- required */
  models: ModelRoleConfig;
  /** Ollama base URL (for local models) */
  ollamaBaseUrl: string;

  // === Optional overrides (fall back to AIDE_DEFAULTS) ===

  /** Token limits override */
  tokens?: {
    globalBudget?: number;
    maxModelInput?: number;
    reservedForResponse?: number;
  };

  /** Retrieval strategy override */
  strategy?: 'simple' | 'tools' | 'hybrid' | 'graph' | 'semantic' | 'auto';

  /** Orchestration override */
  orchestration?: {
    maxIterations?: number;
    maxToolCallsPerBatch?: number;
    enableContextStripping?: boolean;
  };

  /** Embedding override */
  embedding?: {
    batchSize?: number;
    chunkMaxTokens?: number;
    chunkOverlapLines?: number;
    minScore?: number;
    topK?: number;
  };

  // Legacy retrieval settings (still supported)
  tokenBudget?: number;
  maxBlocks?: number;
  hybridMode?: 'code' | 'hints';
  historyMode?: 'direct' | 'tools';
  historyLimit?: number;
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
