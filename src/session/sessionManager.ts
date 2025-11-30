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
import { ProjectBrainStore } from '../brain/store';

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
