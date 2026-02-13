/**
 * Session Manager
 *
 * Maintains short-term session memory:
 * - Focus symbols and files
 * - Last question and answer summary
 * - Session metadata
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  SessionState,
  SymbolRecord,
  FileRecord,
  ChatMessage,
} from '../brain/types';
import { ProjectGraph as ProjectBrainStore } from '../brain/projectGraph';
import { EmbeddingRuntime } from '../models/types';
import { SQLiteBrainStore } from '../brain/sqliteStore';

export interface SessionConfig {
  /** Maximum number of focus symbols to track */
  maxFocusSymbols: number;

  /** Maximum number of focus files to track */
  maxFocusFiles: number;

  /** Maximum number of chat messages to persist */
  maxChatHistory: number;

  /** Session persistence directory */
  sessionsDir: string;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  maxFocusSymbols: 10,
  maxFocusFiles: 5,
  maxChatHistory: 50,
  sessionsDir: '',
};

export class SessionManager {
  private state: SessionState;
  private config: SessionConfig;
  private store: ProjectBrainStore;
  private dirty: boolean = false;
  private embeddingRuntime: EmbeddingRuntime | null = null;
  private sqliteStore: SQLiteBrainStore | null = null;

  constructor(
    projectId: string,
    store: ProjectBrainStore,
    config: Partial<SessionConfig> = {}
  ) {
    this.store = store;
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };

    // Initialize new session
    const now = new Date().toISOString();
    const sessionId = this.generateSessionId();

    this.state = {
      id: sessionId,
      projectId,
      focusSymbolIds: [],
      focusFileIds: [],
      chatHistory: [],
      startedAt: now,
      updatedAt: now,
    };
  }

  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `session-${timestamp}-${random}`;
  }

  // =========================================================================
  // State Accessors
  // =========================================================================

  getId(): string {
    return this.state.id;
  }

  getProjectId(): string {
    return this.state.projectId;
  }

  getFocusSymbolIds(): string[] {
    return [...this.state.focusSymbolIds];
  }

  getFocusFileIds(): string[] {
    return [...this.state.focusFileIds];
  }

  getLastQuestion(): string | undefined {
    return this.state.lastQuestion;
  }

  getLastAnswerSummary(): string | undefined {
    return this.state.lastAnswerSummary;
  }

  getState(): Readonly<SessionState> {
    return { ...this.state };
  }

  // =========================================================================
  // Focus Management
  // =========================================================================

  /**
   * Add a symbol to the focus set
   */
  addFocusSymbol(symbolId: string): void {
    // Remove if already present (to move to front)
    this.state.focusSymbolIds = this.state.focusSymbolIds.filter(
      (id) => id !== symbolId
    );

    // Add to front
    this.state.focusSymbolIds.unshift(symbolId);

    // Trim to max
    if (this.state.focusSymbolIds.length > this.config.maxFocusSymbols) {
      this.state.focusSymbolIds = this.state.focusSymbolIds.slice(
        0,
        this.config.maxFocusSymbols
      );
    }

    this.markDirty();
  }

  /**
   * Add multiple symbols to the focus set
   */
  addFocusSymbols(symbolIds: string[]): void {
    for (const id of symbolIds) {
      this.addFocusSymbol(id);
    }
  }

  /**
   * Remove a symbol from the focus set
   */
  removeFocusSymbol(symbolId: string): void {
    const index = this.state.focusSymbolIds.indexOf(symbolId);
    if (index !== -1) {
      this.state.focusSymbolIds.splice(index, 1);
      this.markDirty();
    }
  }

  /**
   * Clear all focus symbols
   */
  clearFocusSymbols(): void {
    if (this.state.focusSymbolIds.length > 0) {
      this.state.focusSymbolIds = [];
      this.markDirty();
    }
  }

  /**
   * Add a file to the focus set
   */
  addFocusFile(fileId: string): void {
    // Remove if already present
    this.state.focusFileIds = this.state.focusFileIds.filter(
      (id) => id !== fileId
    );

    // Add to front
    this.state.focusFileIds.unshift(fileId);

    // Trim to max
    if (this.state.focusFileIds.length > this.config.maxFocusFiles) {
      this.state.focusFileIds = this.state.focusFileIds.slice(
        0,
        this.config.maxFocusFiles
      );
    }

    this.markDirty();
  }

  /**
   * Add multiple files to the focus set
   */
  addFocusFiles(fileIds: string[]): void {
    for (const id of fileIds) {
      this.addFocusFile(id);
    }
  }

  /**
   * Remove a file from the focus set
   */
  removeFocusFile(fileId: string): void {
    const index = this.state.focusFileIds.indexOf(fileId);
    if (index !== -1) {
      this.state.focusFileIds.splice(index, 1);
      this.markDirty();
    }
  }

  /**
   * Clear all focus files
   */
  clearFocusFiles(): void {
    if (this.state.focusFileIds.length > 0) {
      this.state.focusFileIds = [];
      this.markDirty();
    }
  }

  /**
   * Clear all focus (symbols and files)
   */
  clearAllFocus(): void {
    this.clearFocusSymbols();
    this.clearFocusFiles();
  }

  // =========================================================================
  // Question/Answer Tracking
  // =========================================================================

  /**
   * Record a new question
   */
  setLastQuestion(question: string): void {
    this.state.lastQuestion = question;
    this.markDirty();
  }

  /**
   * Record an answer summary
   */
  setLastAnswerSummary(summary: string): void {
    this.state.lastAnswerSummary = summary;
    this.markDirty();
  }

  // =========================================================================
  // Chat History Management
  // =========================================================================

  /**
   * Add a message to chat history
   */
  addMessage(message: ChatMessage): void {
    this.state.chatHistory.push(message);

    // Trim to max history size
    if (this.state.chatHistory.length > this.config.maxChatHistory) {
      this.state.chatHistory = this.state.chatHistory.slice(
        -this.config.maxChatHistory
      );
    }

    this.markDirty();
  }

  /**
   * Get chat history
   */
  getHistory(): ChatMessage[] {
    return [...this.state.chatHistory];
  }

  /**
   * Clear chat history and last question/answer
   */
  clearHistory(): void {
    if (
      this.state.chatHistory.length > 0 ||
      this.state.lastQuestion ||
      this.state.lastAnswerSummary
    ) {
      this.state.chatHistory = [];
      this.state.lastQuestion = undefined;
      this.state.lastAnswerSummary = undefined;
      this.markDirty();
    }
  }

  // =========================================================================
  // Conversation Embedding Support
  // =========================================================================

  /**
   * Enable conversation embedding by providing the embedding runtime and sqlite store.
   * Call this after session creation/load when embedding support is available.
   */
  setEmbeddingSupport(embeddingRuntime: EmbeddingRuntime, sqliteStore: SQLiteBrainStore): void {
    this.embeddingRuntime = embeddingRuntime;
    this.sqliteStore = sqliteStore;
  }

  /**
   * Generate embeddings for the latest exchange (user + assistant).
   * Should be called after an assistant response is added to history.
   * Non-blocking: errors are logged but don't affect the main flow.
   */
  async embedLatestExchange(): Promise<void> {
    if (!this.embeddingRuntime || !this.sqliteStore) return;

    try {
      const exchanges = this.buildExchanges();
      if (exchanges.length === 0) return;

      const latest = exchanges[exchanges.length - 1];
      const sessionId = this.state.id;

      // Check if already embedded (by content hash)
      const existingHashes = this.sqliteStore.getConversationEmbeddingHashes(sessionId);

      // Embed user message
      if (latest.user) {
        const userHash = crypto.createHash('sha1').update(latest.user).digest('hex');
        const existingUserHash = existingHashes.get(`${latest.index}:user`);

        if (existingUserHash !== userHash) {
          const [userEmbedding] = await this.embeddingRuntime.embed([latest.user]);
          if (userEmbedding && userEmbedding.length > 0) {
            this.sqliteStore.upsertConversationEmbedding(
              sessionId, latest.index, 'user', userEmbedding, userHash
            );
          }
        }
      }

      // Embed assistant message
      if (latest.assistant) {
        const assistantHash = crypto.createHash('sha1').update(latest.assistant).digest('hex');
        const existingAssistantHash = existingHashes.get(`${latest.index}:assistant`);

        if (existingAssistantHash !== assistantHash) {
          const [assistantEmbedding] = await this.embeddingRuntime.embed([latest.assistant]);
          if (assistantEmbedding && assistantEmbedding.length > 0) {
            this.sqliteStore.upsertConversationEmbedding(
              sessionId, latest.index, 'assistant', assistantEmbedding, assistantHash
            );
          }
        }
      }
    } catch (err) {
      // Non-blocking: log error but don't throw
      console.warn(`[session] Failed to embed exchange: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Backfill embeddings for all exchanges that don't have them yet.
   * Called on session start/load.
   */
  async backfillEmbeddings(): Promise<void> {
    if (!this.embeddingRuntime || !this.sqliteStore) return;

    try {
      const exchanges = this.buildExchanges();
      if (exchanges.length === 0) return;

      const sessionId = this.state.id;
      const existingHashes = this.sqliteStore.getConversationEmbeddingHashes(sessionId);
      let backfilled = 0;

      for (const exchange of exchanges) {
        // Check and embed user message
        if (exchange.user) {
          const userHash = crypto.createHash('sha1').update(exchange.user).digest('hex');
          const existingUserHash = existingHashes.get(`${exchange.index}:user`);

          if (existingUserHash !== userHash) {
            const [userEmbedding] = await this.embeddingRuntime.embed([exchange.user]);
            if (userEmbedding && userEmbedding.length > 0) {
              this.sqliteStore.upsertConversationEmbedding(
                sessionId, exchange.index, 'user', userEmbedding, userHash
              );
              backfilled++;
            }
          }
        }

        // Check and embed assistant message
        if (exchange.assistant) {
          const assistantHash = crypto.createHash('sha1').update(exchange.assistant).digest('hex');
          const existingAssistantHash = existingHashes.get(`${exchange.index}:assistant`);

          if (existingAssistantHash !== assistantHash) {
            const [assistantEmbedding] = await this.embeddingRuntime.embed([exchange.assistant]);
            if (assistantEmbedding && assistantEmbedding.length > 0) {
              this.sqliteStore.upsertConversationEmbedding(
                sessionId, exchange.index, 'assistant', assistantEmbedding, assistantHash
              );
              backfilled++;
            }
          }
        }
      }

      if (backfilled > 0) {
        console.log(`[session] Backfilled ${backfilled} conversation embeddings`);
      }
    } catch (err) {
      console.warn(`[session] Failed to backfill embeddings: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  }

  /**
   * Build exchange pairs from chat history.
   */
  private buildExchanges(): Array<{ index: number; user: string; assistant: string }> {
    const exchanges: Array<{ index: number; user: string; assistant: string }> = [];
    const history = this.state.chatHistory;
    let exchangeIndex = 0;

    for (let i = 0; i < history.length; i++) {
      if (history[i].role === 'user') {
        const user = history[i].content;
        let assistant = '';
        if (i + 1 < history.length && history[i + 1].role === 'assistant') {
          assistant = history[i + 1].content;
          i++;
        }
        exchanges.push({ index: exchangeIndex, user, assistant });
        exchangeIndex++;
      }
    }

    return exchanges;
  }

  /**
   * Get start time of session
   */
  getStartedAt(): string {
    return this.state.startedAt;
  }

  /**
   * Update focus based on symbols mentioned in a response
   * Extracts symbol names from text and adds matching symbols to focus
   */
  updateFocusFromResponse(responseText: string): void {
    // Extract potential symbol names from the response
    const identifierPattern =
      /\b([A-Z][a-zA-Z0-9]*|[a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*)\b/g;
    const potentialNames = new Set<string>();

    let match;
    while ((match = identifierPattern.exec(responseText)) !== null) {
      const name = match[1];
      if (name.length > 3 && !this.isCommonWord(name)) {
        potentialNames.add(name);
      }
    }

    // Look for code blocks with file paths
    const codeBlockPattern = /```[\w]*:?\s*([^\n`]+)/g;
    const filePatterns: string[] = [];
    while ((match = codeBlockPattern.exec(responseText)) !== null) {
      if (match[1].includes('/') || match[1].includes('.')) {
        filePatterns.push(match[1]);
      }
    }

    // Find matching symbols (limit to avoid too many)
    let addedSymbols = 0;
    for (const name of potentialNames) {
      if (addedSymbols >= 3) break;

      const symbols = this.store.findSymbols({ name });
      for (const sym of symbols.slice(0, 1)) {
        this.addFocusSymbol(sym.id);
        addedSymbols++;
      }
    }

    // Find matching files
    for (const pattern of filePatterns.slice(0, 2)) {
      const files = this.store.findFiles({ pathPattern: `*${pattern}*` });
      for (const file of files.slice(0, 1)) {
        this.addFocusFile(file.id);
      }
    }
  }

  private isCommonWord(word: string): boolean {
    const common = new Set([
      'the',
      'and',
      'for',
      'that',
      'this',
      'with',
      'you',
      'have',
      'from',
      'are',
      'was',
      'were',
      'been',
      'being',
      'will',
      'would',
      'could',
      'should',
      'function',
      'class',
      'method',
      'file',
      'code',
      'error',
      'return',
      'value',
      'type',
      'string',
      'number',
      'boolean',
      'object',
      'array',
      'null',
      'undefined',
      'true',
      'false',
      'const',
      'let',
      'var',
    ]);
    return common.has(word.toLowerCase());
  }

  // =========================================================================
  // Persistence
  // =========================================================================

  private markDirty(): void {
    this.state.updatedAt = new Date().toISOString();
    this.dirty = true;
  }

  /**
   * Save session state to disk
   */
  save(): void {
    if (!this.config.sessionsDir) return;

    try {
      if (!fs.existsSync(this.config.sessionsDir)) {
        fs.mkdirSync(this.config.sessionsDir, { recursive: true });
      }

      const filePath = path.join(
        this.config.sessionsDir,
        `${this.state.id}.json`
      );
      fs.writeFileSync(filePath, JSON.stringify(this.state, null, 2), 'utf8');

      // Update latest.txt to point to this session
      const latestPath = path.join(this.config.sessionsDir, 'latest.txt');
      fs.writeFileSync(latestPath, this.state.id, 'utf8');

      this.dirty = false;
    } catch (err) {
      console.error('Failed to save session:', err);
    }
  }

  /**
   * Load a session from disk
   */
  static load(
    sessionId: string,
    sessionsDir: string,
    store: ProjectBrainStore,
    config: Partial<SessionConfig> = {}
  ): SessionManager | null {
    try {
      const filePath = path.join(sessionsDir, `${sessionId}.json`);
      if (!fs.existsSync(filePath)) return null;

      const content = fs.readFileSync(filePath, 'utf8');
      const state = JSON.parse(content) as SessionState;

      // Ensure chatHistory exists (for backwards compatibility with old sessions)
      if (!state.chatHistory) {
        state.chatHistory = [];
      }

      const manager = new SessionManager(state.projectId, store, {
        ...config,
        sessionsDir,
      });
      manager.state = state;
      manager.dirty = false;

      return manager;
    } catch (err) {
      console.error('Failed to load session:', err);
      return null;
    }
  }

  /**
   * Load the most recent session for a project
   */
  static loadLatest(
    projectId: string,
    sessionsDir: string,
    store: ProjectBrainStore,
    config: Partial<SessionConfig> = {}
  ): SessionManager | null {
    try {
      const latestPath = path.join(sessionsDir, 'latest.txt');
      if (!fs.existsSync(latestPath)) return null;

      const sessionId = fs.readFileSync(latestPath, 'utf8').trim();
      if (!sessionId) return null;

      return SessionManager.load(sessionId, sessionsDir, store, config);
    } catch (err) {
      // No latest session found
      return null;
    }
  }

  /**
   * List all sessions in a directory
   */
  static listSessions(
    sessionsDir: string
  ): Array<{ id: string; name: string; updatedAt: string }> {
    try {
      if (!fs.existsSync(sessionsDir)) return [];

      const files = fs.readdirSync(sessionsDir);
      const sessions: Array<{ id: string; name: string; updatedAt: string }> =
        [];

      for (const file of files) {
        if (file.endsWith('.json') && file !== 'latest.txt') {
          try {
            const filePath = path.join(sessionsDir, file);
            const content = fs.readFileSync(filePath, 'utf8');
            const state = JSON.parse(content) as SessionState;
            // Use first question as name, or session ID
            const firstQuestion = state.chatHistory?.find(
              (m) => m.role === 'user'
            );
            const name = firstQuestion
              ? firstQuestion.content.slice(0, 40) +
                (firstQuestion.content.length > 40 ? '...' : '')
              : state.id;
            sessions.push({
              id: state.id,
              name,
              updatedAt: state.updatedAt,
            });
          } catch {
            // Skip corrupted files
          }
        }
      }

      // Sort by updatedAt descending
      sessions.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
      return sessions;
    } catch (err) {
      console.error('Failed to list sessions:', err);
      return [];
    }
  }

  /**
   * Delete all session files for a project
   */
  static clearAllSessions(sessionsDir: string): number {
    try {
      if (!fs.existsSync(sessionsDir)) return 0;

      const files = fs.readdirSync(sessionsDir);
      let deleted = 0;

      for (const file of files) {
        const filePath = path.join(sessionsDir, file);
        if (file.endsWith('.json') || file === 'latest.txt') {
          fs.unlinkSync(filePath);
          deleted++;
        }
      }

      return deleted;
    } catch (err) {
      console.error('Failed to clear sessions:', err);
      return 0;
    }
  }

  /**
   * End the session and save final state
   */
  end(): void {
    this.markDirty();
    this.save();
  }

  // =========================================================================
  // Focus Resolution (get actual records)
  // =========================================================================

  /**
   * Get the actual SymbolRecord objects for focus symbols
   */
  getFocusSymbols(): SymbolRecord[] {
    const symbols: SymbolRecord[] = [];
    for (const id of this.state.focusSymbolIds) {
      const sym = this.store.getSymbol(id);
      if (sym) symbols.push(sym);
    }
    return symbols;
  }

  /**
   * Get the actual FileRecord objects for focus files
   */
  getFocusFiles(): FileRecord[] {
    const files: FileRecord[] = [];
    for (const id of this.state.focusFileIds) {
      const file = this.store.getFile(id);
      if (file) files.push(file);
    }
    return files;
  }

  /**
   * Check if session has any focus
   */
  hasFocus(): boolean {
    return (
      this.state.focusSymbolIds.length > 0 || this.state.focusFileIds.length > 0
    );
  }
}
