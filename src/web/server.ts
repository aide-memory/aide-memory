/**
 * AIDE Web Server
 *
 * Express + WebSocket server that streams the same output as terminal
 * to a React frontend for markdown rendering.
 */

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { ProjectConfig } from '../brain/types';
import { SQLiteBrainStore } from '../brain/sqliteStore';
import { createRetrievalStrategy } from '../retrieval';
import { SessionManager } from '../session/sessionManager';
import { ContextAssembler, extractAnswerSummary } from '../context/assembler';
import { OllamaRuntime } from '../models/localModelClient';
import { getProjectDbPath, getSessionsDir } from '../storage/paths';
import { TokenBudgetManager } from '../core/tokenBudget';
import { AIDE_DEFAULTS, getEffectiveSettings } from '../core/config';
import { ChatMessage } from '../brain/types';
import { addWebLogListener } from '../cli/ui';

const MAX_HISTORY_MESSAGES = 8;

interface WebMessage {
  type:
    | 'question'
    | 'response'
    | 'verbose'
    | 'tool'
    | 'error'
    | 'status'
    | 'stats'
    | 'reindex_complete'
    | 'sessions'
    | 'session_switched';
  content: string;
  metadata?: Record<string, unknown>;
}

interface SessionInfo {
  id: string;
  name: string;
  updatedAt: string;
}

// Global state
let currentStore: SQLiteBrainStore | null = null;
let currentConfig: ProjectConfig | null = null;
let sessionsDir: string = '';

// Map of session ID to SessionManager
const sessionCache: Map<string, SessionManager> = new Map();
// Currently active session per client (in single-user mode, we track one)
let activeSessionId: string | null = null;

// Event emitter for verbose logging
type LogListener = (message: WebMessage) => void;
const logListeners: Set<LogListener> = new Set();

export function emitLog(message: WebMessage): void {
  for (const listener of logListeners) {
    listener(message);
  }
}

/**
 * Start the AIDE web server
 */
export async function startWebServer(
  config: ProjectConfig,
  options: { port?: number; open?: boolean } = {}
): Promise<void> {
  const port = options.port ?? 3000;
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  // Store config
  currentConfig = config;

  // Initialize database
  const dbPath = getProjectDbPath(config.id);
  if (!fs.existsSync(dbPath)) {
    throw new Error('Project not indexed. Run `aide init` first.');
  }

  currentStore = new SQLiteBrainStore(dbPath);
  currentStore.initialize();

  // Set sessions directory
  sessionsDir = getSessionsDir(config.id);

  // Load latest session or create new one
  const latestSession = SessionManager.loadLatest(
    config.id,
    sessionsDir,
    currentStore,
    { sessionsDir }
  );
  if (latestSession) {
    sessionCache.set(latestSession.getId(), latestSession);
    activeSessionId = latestSession.getId();
  } else {
    const newSession = new SessionManager(config.id, currentStore, {
      sessionsDir,
    });
    sessionCache.set(newSession.getId(), newSession);
    activeSessionId = newSession.getId();
    newSession.save();
  }

  // Serve static files from web/dist (built React app)
  // __dirname is dist/web when compiled, so go up to project root then into web/dist
  const webDistPath = path.join(__dirname, '../../web/dist');
  console.log(`Serving static files from: ${webDistPath}`);
  app.use(express.static(webDistPath));

  // API endpoint for stats
  app.get('/api/stats', (_req, res) => {
    if (!currentStore) {
      return res.status(500).json({ error: 'Store not initialized' });
    }
    const stats = currentStore.getStats();
    res.json(stats);
  });

  // Fallback: serve index.html for SPA routes (must be LAST)
  app.use((_req, res) => {
    res.sendFile(path.join(webDistPath, 'index.html'));
  });

  // Helper to get or load a session
  function getSession(sessionId: string): SessionManager | null {
    if (!currentStore || !currentConfig) return null;

    // Check cache first
    if (sessionCache.has(sessionId)) {
      return sessionCache.get(sessionId)!;
    }

    // Try to load from disk
    const session = SessionManager.load(sessionId, sessionsDir, currentStore, {
      sessionsDir,
    });
    if (session) {
      sessionCache.set(sessionId, session);
    }
    return session;
  }

  // Helper to get session list
  function getSessionList(): SessionInfo[] {
    return SessionManager.listSessions(sessionsDir);
  }

  // Helper to create new session
  function createNewSession(): SessionManager {
    if (!currentStore || !currentConfig) {
      throw new Error('Store not initialized');
    }
    const session = new SessionManager(currentConfig.id, currentStore, {
      sessionsDir,
    });
    sessionCache.set(session.getId(), session);
    session.save();
    return session;
  }

  // Get currently active session
  function getActiveSession(): SessionManager | null {
    if (!activeSessionId) return null;
    return getSession(activeSessionId);
  }

  // Handle commands from WebSocket
  async function handleCommand(
    ws: WebSocket,
    command: string,
    args?: Record<string, unknown>
  ): Promise<void> {
    if (!currentStore || !currentConfig) {
      sendMessage(ws, { type: 'error', content: 'Server not initialized' });
      return;
    }

    switch (command) {
      case 'stats': {
        const stats = currentStore.getStats();
        sendMessage(ws, {
          type: 'stats',
          content: JSON.stringify(stats, null, 2),
        });
        break;
      }

      case 'list_sessions': {
        const sessions = getSessionList();
        sendMessage(ws, {
          type: 'sessions',
          content: JSON.stringify(sessions),
          metadata: { activeSessionId },
        });
        break;
      }

      case 'new_session': {
        const newSession = createNewSession();
        activeSessionId = newSession.getId();
        const sessions = getSessionList();
        sendMessage(ws, {
          type: 'sessions',
          content: JSON.stringify(sessions),
          metadata: { activeSessionId },
        });
        sendMessage(ws, {
          type: 'session_switched',
          content: activeSessionId,
          metadata: { history: [] },
        });
        break;
      }

      case 'switch_session': {
        const targetId = args?.sessionId as string;
        if (!targetId) {
          sendMessage(ws, { type: 'error', content: 'Session ID required' });
          return;
        }
        const session = getSession(targetId);
        if (!session) {
          sendMessage(ws, { type: 'error', content: 'Session not found' });
          return;
        }
        activeSessionId = targetId;
        sendMessage(ws, {
          type: 'session_switched',
          content: targetId,
          metadata: { history: session.getHistory() },
        });
        break;
      }

      case 'clear': {
        const session = getActiveSession();
        if (session) {
          session.clearHistory();
          session.clearAllFocus();
          session.save();
        }
        sendMessage(ws, { type: 'status', content: 'Session cleared' });
        break;
      }

      case 'clear_all': {
        SessionManager.clearAllSessions(sessionsDir);
        sessionCache.clear();
        const newSession = createNewSession();
        activeSessionId = newSession.getId();
        sendMessage(ws, {
          type: 'sessions',
          content: JSON.stringify([
            {
              id: newSession.getId(),
              name: 'New Session',
              updatedAt: new Date().toISOString(),
            },
          ]),
          metadata: { activeSessionId },
        });
        sendMessage(ws, { type: 'status', content: 'All sessions cleared' });
        break;
      }

      case 'focus': {
        const session = getActiveSession();
        if (session) {
          const symbols = session.getFocusSymbols();
          const files = session.getFocusFiles();
          sendMessage(ws, {
            type: 'status',
            content: `Focus: ${symbols.length} symbols, ${files.length} files`,
            metadata: { symbols, files },
          });
        }
        break;
      }

      case 'reindex': {
        sendMessage(ws, { type: 'status', content: 'Reindexing project...' });

        try {
          const { ProjectIndexer } = await import('../project/indexer');
          const indexer = new ProjectIndexer(currentStore);
          const stats = await indexer.indexAll(
            currentConfig.rootPath,
            currentConfig.id
          );
          const newStats = currentStore.getStats();

          sendMessage(ws, {
            type: 'reindex_complete',
            content: JSON.stringify({
              ...newStats,
              projectPath: currentConfig.rootPath,
            }),
          });

          sendMessage(ws, {
            type: 'verbose',
            content: `Reindex complete: ${stats.files} files, ${stats.symbols} symbols, ${stats.blocks} blocks`,
            metadata: { logType: 'info' },
          });
        } catch (err) {
          sendMessage(ws, {
            type: 'error',
            content: `Reindex failed: ${
              err instanceof Error ? err.message : 'Unknown error'
            }`,
          });
        }
        break;
      }

      default:
        sendMessage(ws, {
          type: 'error',
          content: `Unknown command: ${command}`,
        });
    }
  }

  // WebSocket handling
  wss.on('connection', (ws: WebSocket) => {
    console.log('Client connected');

    // Send initial stats
    if (currentStore) {
      const stats = currentStore.getStats();
      sendMessage(ws, {
        type: 'stats',
        content: JSON.stringify(stats),
        metadata: { projectPath: config.rootPath },
      });
    }

    // Send session list
    const sessions = getSessionList();
    sendMessage(ws, {
      type: 'sessions',
      content: JSON.stringify(sessions),
      metadata: { activeSessionId },
    });

    // Register log listener for this connection
    const logListener: LogListener = (message) => {
      sendMessage(ws, message);
    };
    logListeners.add(logListener);

    // Register web log listener for verbose output from retrieval strategies
    const removeWebListener = addWebLogListener((type, content, metadata) => {
      sendMessage(ws, {
        type: 'verbose',
        content,
        metadata: { logType: type, ...metadata },
      });
    });

    // Handle incoming messages
    ws.on('message', async (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === 'question') {
          await handleQuestion(
            ws,
            message.content,
            message.options || {},
            getActiveSession
          );
        } else if (message.type === 'command') {
          await handleCommand(ws, message.command, message.args);
        }
      } catch (err) {
        sendMessage(ws, {
          type: 'error',
          content: `Error: ${
            err instanceof Error ? err.message : 'Unknown error'
          }`,
        });
      }
    });

    ws.on('close', () => {
      console.log('Client disconnected');
      logListeners.delete(logListener);
      removeWebListener();
    });
  });

  // Start server
  server.listen(port, () => {
    console.log(`\n🌐 AIDE Web running at http://localhost:${port}`);
    console.log(`   Project: ${config.rootPath}`);
    console.log(`   Press Ctrl+C to stop\n`);

    // Open browser if requested
    if (options.open) {
      const url = `http://localhost:${port}`;
      const { exec } = require('child_process');
      const cmd =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
          ? 'start'
          : 'xdg-open';
      exec(`${cmd} ${url}`);
    }
  });

  // Handle shutdown
  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    // Save all cached sessions
    for (const session of sessionCache.values()) {
      session.end();
    }
    currentStore?.close();
    server.close();
    process.exit(0);
  });
}

function sendMessage(ws: WebSocket, message: WebMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

async function handleQuestion(
  ws: WebSocket,
  question: string,
  options: {
    strategy?: string;
    hybridMode?: string;
    historyMode?: string;
    verbose?: boolean;
  },
  getActiveSession: () => SessionManager | null
): Promise<void> {
  const currentSession = getActiveSession();
  if (!currentStore || !currentSession || !currentConfig) {
    sendMessage(ws, { type: 'error', content: 'Server not initialized' });
    return;
  }

  const verbose = options.verbose ?? true; // Default to verbose in web UI

  // Send status
  sendMessage(ws, {
    type: 'status',
    content: 'Retrieving context...',
  });

  try {
    // Create model runtime
    const model = new OllamaRuntime(currentConfig);

    // Get effective settings (project config + runtime options + defaults)
    const settings = getEffectiveSettings(currentConfig, {
      strategy: options.strategy as 'simple' | 'tools' | 'hybrid' | undefined,
      hybridMode: options.hybridMode as 'code' | 'hints' | undefined,
      historyMode: options.historyMode as 'direct' | 'tools' | undefined,
    });

    const retrieval = createRetrievalStrategy(
      {
        strategy: settings.strategy,
        hybridMode: settings.hybridMode,
        maxDepth: settings.maxDepth,
        maxFanout: settings.maxFanout,
        tokenBudget: settings.tokenBudget,
        maxBlocks: settings.maxBlocks,
      },
      model,
      undefined,
      {
        verbose,
        historyMode: settings.historyMode,
        historyLimit: settings.historyLimit,
      }
    );

    // Update session
    currentSession.setLastQuestion(question);
    const userMsg: ChatMessage = { role: 'user', content: question };
    currentSession.addMessage(userMsg);
    currentSession.save();

    // Echo question
    sendMessage(ws, { type: 'question', content: question });

    // Retrieve context
    sendMessage(ws, {
      type: 'verbose',
      content: `Starting ${settings.strategy} retrieval...`,
      metadata: { logType: 'header' },
    });

    // Build retrieval query with conversation history based on mode
    const sessionHistory = currentSession.getHistory();

    // Debug: log session history
    if (verbose) {
      sendMessage(ws, {
        type: 'verbose',
        content: `Session history: ${sessionHistory.length} messages`,
        metadata: { logType: 'info' },
      });
    }

    const retrievalQuery = {
      question,
      focusSymbolIds: currentSession.getFocusSymbolIds(),
      focusFileIds: currentSession.getFocusFileIds(),
      // For direct mode: include recent history
      conversationHistory:
        settings.historyMode === 'direct'
          ? sessionHistory.slice(-settings.historyLimit)
          : sessionHistory, // Tools mode still needs history for the tools
      // For tools mode: provide session access callbacks
      listSessions:
        settings.historyMode === 'tools'
          ? () => SessionManager.listSessions(sessionsDir)
          : undefined,
      loadSessionHistory:
        settings.historyMode === 'tools'
          ? (sessionId: string) => {
              // Load session from disk (currentStore is checked at function start)
              const session = SessionManager.load(
                sessionId,
                sessionsDir,
                currentStore!,
                { sessionsDir }
              );
              return session ? session.getHistory() : null;
            }
          : undefined,
    };

    const result = await retrieval.retrieve(retrievalQuery, currentStore);

    // Log retrieval result (including conversation context status)
    const convContextStatus = result.conversationContext
      ? `${result.conversationContext.messages.length} msgs`
      : 'NONE';
    sendMessage(ws, {
      type: 'verbose',
      content: `Found: ${result.symbols.length} symbols, ${result.blocks.length} blocks, ${result.files.length} files | ConversationContext: ${convContextStatus}`,
      metadata: { logType: 'info' },
    });

    // Assemble context
    const assembler = new ContextAssembler({
      projectRoot: currentConfig.rootPath,
      maxContextTokens: settings.tokenBudget,
    });

    const assembled = assembler.assemble(
      question,
      result,
      currentSession.getState()
    );

    // Build messages
    const recentHistory = currentSession
      .getHistory()
      .slice(-MAX_HISTORY_MESSAGES);
    const messages: ChatMessage[] = [
      { role: 'system', content: assembled.systemPrompt },
      ...recentHistory.slice(0, -1),
      ...assembled.messages.filter((m) => m.role !== 'system'),
    ];

    // Log verbose info - FINAL PROMPT TO ANSWER MODEL (FULL, NO TRUNCATION)
    if (verbose) {
      const budget = new TokenBudgetManager(AIDE_DEFAULTS.tokenBudget);
      const totalTokens = messages.reduce(
        (sum, m) => sum + budget.estimate(m.content),
        0
      );

      // Log detailed prompt info
      sendMessage(ws, {
        type: 'verbose',
        content: `\n${'='.repeat(
          60
        )}\n=== FINAL PROMPT TO ANSWER MODEL ===\n${'='.repeat(60)}`,
        metadata: { logType: 'header' },
      });

      // Log FULL system prompt
      sendMessage(ws, {
        type: 'verbose',
        content: `\n--- SYSTEM PROMPT (${budget.estimate(
          assembled.systemPrompt
        )} tokens) ---\n${assembled.systemPrompt}\n--- END SYSTEM ---`,
        metadata: { logType: 'info' },
      });

      // Log history being sent
      sendMessage(ws, {
        type: 'verbose',
        content: `\n--- HISTORY (${recentHistory.length - 1} messages) ---`,
        metadata: { logType: 'info' },
      });
      for (const msg of recentHistory.slice(0, -1)) {
        const preview =
          msg.content.length > 200
            ? msg.content.slice(0, 200) + '...'
            : msg.content;
        sendMessage(ws, {
          type: 'verbose',
          content: `[${msg.role}]: ${preview}`,
          metadata: { logType: 'info' },
        });
      }

      // Log FULL user message with context (this is the key one!)
      const userMsgContent =
        assembled.messages.find((m) => m.role === 'user')?.content || '';
      sendMessage(ws, {
        type: 'verbose',
        content: `\n--- USER MESSAGE WITH CONTEXT (${budget.estimate(
          userMsgContent
        )} tokens) ---\n${userMsgContent}\n--- END USER MESSAGE ---`,
        metadata: { logType: 'info' },
      });

      sendMessage(ws, {
        type: 'verbose',
        content: `\n${'='.repeat(
          60
        )}\nTotal tokens: ${totalTokens}\n${'='.repeat(60)}`,
        metadata: { logType: 'info' },
      });
    }

    // Get response
    sendMessage(ws, { type: 'status', content: 'Generating response...' });
    const response = await model.chat(messages);

    // Add to session with metadata
    const assistantMsg: ChatMessage = {
      role: 'assistant',
      content: response.content,
      metadata: {
        strategy: result.strategy,
        hybridMode:
          settings.strategy === 'hybrid' ? settings.hybridMode : undefined,
        symbolCount: result.symbols.length,
        blockCount: result.blocks.length,
      },
    };
    currentSession.addMessage(assistantMsg);
    currentSession.setLastAnswerSummary(extractAnswerSummary(response.content));
    currentSession.updateFocusFromResponse(response.content);

    // Update focus
    for (const sym of result.symbols.slice(0, 3)) {
      currentSession.addFocusSymbol(sym.id);
    }
    currentSession.save();

    // Send response
    sendMessage(ws, {
      type: 'response',
      content: response.content,
      metadata: {
        strategy: result.strategy,
        hybridMode:
          settings.strategy === 'hybrid' ? settings.hybridMode : undefined,
        symbolCount: result.symbols.length,
        blockCount: result.blocks.length,
      },
    });
  } catch (err) {
    sendMessage(ws, {
      type: 'error',
      content: `Error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    });
  }
}

// handleCommand is now defined inside startWebServer to access helper functions
