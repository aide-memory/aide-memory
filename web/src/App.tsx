import { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';

// Types
interface Message {
  role: 'user' | 'assistant' | 'error';
  content: string;
  metadata?: {
    strategy?: string;
    hybridMode?: string;
    symbolCount?: number;
    blockCount?: number;
  };
}

interface VerboseLog {
  preview: string; // Short preview text
  fullContent: string; // Full content for expanded view
  type: string;
  args?: Record<string, unknown>;
  expanded?: boolean;
}

interface Session {
  id: string; // Server session IDs are strings
  name: string;
  messages: Message[];
  verboseLogs: VerboseLog[];
  updatedAt: string;
}

interface Stats {
  fileCount: number;
  symbolCount: number;
  blockCount: number;
  projectPath?: string;
}

interface WebMessage {
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

// Server session info (from list)
interface ServerSessionInfo {
  id: string;
  name: string;
  updatedAt: string;
}

// Truncate text for preview
function truncate(text: string, maxLen = 100): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

// Create a new local session from server info
function createLocalSession(info: ServerSessionInfo): Session {
  return {
    id: info.id,
    name: info.name,
    messages: [],
    verboseLogs: [],
    updatedAt: info.updatedAt,
  };
}

export default function App() {
  // Sessions from server
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Get current session (may be undefined while loading)
  const currentSession =
    sessions.find((s) => s.id === activeSessionId) || sessions[0] || null;

  const [input, setInput] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [strategy, setStrategy] = useState<'simple' | 'tools' | 'hybrid'>(
    'tools'
  );
  const [hybridMode, setHybridMode] = useState<'code' | 'hints'>('code');
  const [historyMode, setHistoryMode] = useState<'direct' | 'tools'>('tools');
  const [verboseOpen, setVerboseOpen] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const verboseEndRef = useRef<HTMLDivElement>(null);

  // Track which session is currently processing a question
  const processingSessionIdRef = useRef<string | null>(null);

  // Helper to update a specific session by ID
  const updateSession = useCallback(
    (
      sessionId: string,
      updater: Partial<Session> | ((s: Session) => Partial<Session>)
    ) => {
      setSessions((prev) =>
        prev.map((s) => {
          if (s.id === sessionId) {
            if (typeof updater === 'function') {
              return { ...s, ...updater(s) };
            }
            return { ...s, ...updater };
          }
          return s;
        })
      );
    },
    []
  );

  // Helper to update the session that is processing (or active if none processing)
  const updateProcessingSession = useCallback(
    (updater: Partial<Session> | ((s: Session) => Partial<Session>)) => {
      const targetSessionId = processingSessionIdRef.current ?? activeSessionId;
      if (targetSessionId) {
        updateSession(targetSessionId, updater);
      }
    },
    [activeSessionId, updateSession]
  );

  // Add new session tab (via server)
  const addSession = () => {
    if (!ws || !connected) return;
    ws.send(JSON.stringify({ type: 'command', command: 'new_session' }));
  };

  // Switch to a different session
  const switchSession = (sessionId: string) => {
    if (!ws || !connected) return;
    if (sessionId === activeSessionId) return;
    ws.send(
      JSON.stringify({
        type: 'command',
        command: 'switch_session',
        args: { sessionId },
      })
    );
  };

  // Close session tab (just removes from local view, server keeps it)
  const closeSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (sessions.length === 1) return;

    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (activeSessionId === id) {
      const remaining = sessions.filter((s) => s.id !== id);
      if (remaining.length > 0) {
        switchSession(remaining[remaining.length - 1].id);
      }
    }
  };

  // Toggle verbose log expansion
  const toggleLogExpand = (index: number) => {
    if (!activeSessionId) return;
    updateSession(activeSessionId, (s) => ({
      verboseLogs: s.verboseLogs.map((log, i) =>
        i === index ? { ...log, expanded: !log.expanded } : log
      ),
    }));
  };

  // Send command to server
  const sendCommand = (command: string, args?: Record<string, unknown>) => {
    if (!ws || !connected) return;
    ws.send(JSON.stringify({ type: 'command', command, args }));
  };

  // Clear current session history
  const clearSessionHistory = () => {
    if (!activeSessionId) return;
    updateSession(activeSessionId, {
      messages: [],
      verboseLogs: [],
      name: 'New Session',
    });
    sendCommand('clear');
  };

  // Clear all sessions and start fresh (via server)
  const clearAllSessions = () => {
    processingSessionIdRef.current = null;
    sendCommand('clear_all');
  };

  // Reindex project
  const reindexProject = () => {
    setStatus('Reindexing project...');
    sendCommand('reindex');
  };

  // Handle incoming WebSocket messages
  const handleMessage = useCallback(
    (message: WebMessage) => {
      switch (message.type) {
        case 'question':
          // Question echo - goes to processing session
          updateProcessingSession((s) => {
            // If this is the first message, rename the session based on the question
            const isFirstMessage = s.messages.length === 0;
            const newName = isFirstMessage
              ? message.content.slice(0, 30) +
                (message.content.length > 30 ? '...' : '')
              : s.name;
            return {
              name: newName,
              messages: [
                ...s.messages,
                { role: 'user' as const, content: message.content },
              ],
            };
          });
          setStatus(null);
          break;

        case 'response':
          // Response - goes to processing session, then clear processing
          updateProcessingSession((s) => ({
            messages: [
              ...s.messages,
              {
                role: 'assistant' as const,
                content: message.content,
                metadata: message.metadata as Message['metadata'],
              },
            ],
          }));
          processingSessionIdRef.current = null;
          setStatus(null);
          break;

        case 'verbose': {
          // Verbose log with full content
          const fullContent = message.metadata?.fullContent as
            | string
            | undefined;
          const content = message.content;
          updateProcessingSession((s) => ({
            verboseLogs: [
              ...s.verboseLogs,
              {
                preview: truncate(content, 80),
                fullContent: fullContent || content,
                type: (message.metadata?.logType as string) || 'info',
                expanded: false,
              },
            ],
          }));
          break;
        }

        case 'tool': {
          // Tool call log - result comes separately
          const args = message.metadata?.args as Record<string, unknown>;
          updateProcessingSession((s) => ({
            verboseLogs: [
              ...s.verboseLogs,
              {
                preview: `🔧 ${message.content}`,
                fullContent: `**Tool:** ${
                  message.content
                }\n\n**Args:**\n\`\`\`json\n${JSON.stringify(
                  args,
                  null,
                  2
                )}\n\`\`\`\n\n_Waiting for result..._`,
                type: 'tool',
                args,
                expanded: false,
              },
            ],
          }));
          break;
        }

        case 'result': {
          // Tool result - update the last tool log with the result
          const fullResult =
            (message.metadata?.fullContent as string) || message.content;
          updateProcessingSession((s) => {
            const logs = [...s.verboseLogs];
            // Find the last tool log and update it with the result
            for (let i = logs.length - 1; i >= 0; i--) {
              if (logs[i].type === 'tool') {
                const toolLog = logs[i];
                logs[i] = {
                  ...toolLog,
                  preview: `🔧 ${toolLog.preview.replace('🔧 ', '')} → ✓`,
                  fullContent: toolLog.fullContent.replace(
                    '_Waiting for result..._',
                    `**Result:**\n\`\`\`\n${fullResult}\n\`\`\``
                  ),
                };
                break;
              }
            }
            return { verboseLogs: logs };
          });
          break;
        }

        case 'status':
          setStatus(message.content);
          break;

        case 'stats':
          setStats(JSON.parse(message.content));
          break;

        case 'reindex_complete':
          setStats(JSON.parse(message.content));
          setStatus(null);
          break;

        case 'sessions': {
          // Server sent list of sessions
          const serverSessions = JSON.parse(
            message.content
          ) as ServerSessionInfo[];
          const newActiveId = message.metadata?.activeSessionId as string;

          // Update sessions list, preserving local order and verbose logs
          setSessions((prev) => {
            // Keep existing sessions in their current order, update their info
            const updated = prev.map((existing) => {
              const serverInfo = serverSessions.find(
                (s) => s.id === existing.id
              );
              if (serverInfo) {
                return {
                  ...existing,
                  name: serverInfo.name,
                  updatedAt: serverInfo.updatedAt,
                };
              }
              return existing;
            });

            // Add any new sessions from server (at the end)
            const existingIds = new Set(prev.map((s) => s.id));
            const newSessions = serverSessions
              .filter((s) => !existingIds.has(s.id))
              .map(createLocalSession);

            return [...updated, ...newSessions];
          });

          // Only set active if we don't have one yet (first load)
          if (newActiveId) {
            setActiveSessionId((current) => current ?? newActiveId);
          }
          break;
        }

        case 'session_switched': {
          // Switched to a different session
          const sessionId = message.content;
          const history = message.metadata?.history as Message[] | undefined;

          setActiveSessionId(sessionId);

          // Update session messages from server history, preserve verbose logs
          if (history) {
            setSessions((prev) =>
              prev.map((s) =>
                s.id === sessionId ? { ...s, messages: history } : s
              )
            );
          }
          break;
        }

        case 'error':
          updateProcessingSession((s) => ({
            messages: [
              ...s.messages,
              { role: 'error' as const, content: message.content },
            ],
          }));
          processingSessionIdRef.current = null;
          setStatus(null);
          break;
      }
    },
    [updateProcessingSession]
  );

  // WebSocket connection
  useEffect(() => {
    const socket = new WebSocket(`ws://${window.location.host}/ws`);

    socket.onopen = () => {
      console.log('Connected to AIDE');
      setConnected(true);
    };

    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleMessage(message);
    };

    socket.onclose = () => {
      console.log('Disconnected from AIDE');
      setConnected(false);
    };

    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    setWs(socket);

    return () => socket.close();
  }, [handleMessage]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.messages]);

  useEffect(() => {
    verboseEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentSession?.verboseLogs]);

  function sendQuestion() {
    if (!input.trim() || !ws || !connected || !activeSessionId) return;

    // Track which session sent this question
    processingSessionIdRef.current = activeSessionId;

    // Clear verbose logs for new question in this session
    updateSession(activeSessionId, { verboseLogs: [] });

    ws.send(
      JSON.stringify({
        type: 'question',
        content: input.trim(),
        options: { strategy, hybridMode, historyMode, verbose: true },
      })
    );

    setInput('');
    setStatus('Processing...');
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion();
    }
  }

  return (
    <div className="app">
      <header className="header">
        <h1>
          <span className="logo">⚡</span> AIDE
          {stats && (
            <span className="project-path">
              {stats.projectPath || 'Project'}
            </span>
          )}
        </h1>
        <div className="header-actions">
          {stats && (
            <div className="header-stats">
              <div className="stat">
                <span>Files:</span>
                <span className="stat-value">{stats.fileCount}</span>
              </div>
              <div className="stat">
                <span>Symbols:</span>
                <span className="stat-value">{stats.symbolCount}</span>
              </div>
              <div className="stat">
                <span>Blocks:</span>
                <span className="stat-value">{stats.blockCount}</span>
              </div>
            </div>
          )}
          <button
            className="control-button"
            onClick={() => setControlsOpen(!controlsOpen)}
            title="Settings & Controls"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* Controls Panel */}
      {controlsOpen && (
        <div className="controls-panel">
          <div className="controls-section">
            <h3>Session</h3>
            <button className="control-btn" onClick={clearSessionHistory}>
              🗑️ Clear History
            </button>
            <button className="control-btn danger" onClick={clearAllSessions}>
              ⚠️ Clear All Sessions
            </button>
          </div>
          <div className="controls-section">
            <h3>Project</h3>
            <button className="control-btn" onClick={reindexProject}>
              🔄 Reindex
            </button>
          </div>
          <div className="controls-section">
            <h3>Retrieval Strategy</h3>
            <div className="control-options">
              {(['simple', 'tools', 'hybrid'] as const).map((s) => (
                <label key={s} className="control-option">
                  <input
                    type="radio"
                    name="strategy"
                    checked={strategy === s}
                    onChange={() => setStrategy(s)}
                  />
                  {s}
                </label>
              ))}
            </div>
          </div>
          {strategy === 'hybrid' && (
            <div className="controls-section">
              <h3>Hybrid Mode</h3>
              <div className="control-options">
                <label className="control-option">
                  <input
                    type="radio"
                    name="hybridMode"
                    checked={hybridMode === 'code'}
                    onChange={() => setHybridMode('code')}
                  />
                  Code upfront
                </label>
                <label className="control-option">
                  <input
                    type="radio"
                    name="hybridMode"
                    checked={hybridMode === 'hints'}
                    onChange={() => setHybridMode('hints')}
                  />
                  Entry points only
                </label>
              </div>
            </div>
          )}
          <div className="controls-section">
            <h3>History Mode</h3>
            <div className="control-options">
              <label className="control-option">
                <input
                  type="radio"
                  name="historyMode"
                  checked={historyMode === 'tools'}
                  onChange={() => setHistoryMode('tools')}
                />
                On-demand (tools)
              </label>
              <label className="control-option">
                <input
                  type="radio"
                  name="historyMode"
                  checked={historyMode === 'direct'}
                  onChange={() => setHistoryMode('direct')}
                />
                Always include
              </label>
            </div>
          </div>
          <div className="controls-section">
            <h3>Connection</h3>
            <div
              className={`connection-status ${
                connected ? 'connected' : 'disconnected'
              }`}
            >
              {connected ? '🟢 Connected' : '🔴 Disconnected'}
            </div>
          </div>
        </div>
      )}

      {/* Session tabs */}
      <div className="tabs-bar">
        {sessions.map((session) => (
          <button
            key={session.id}
            className={`tab ${session.id === activeSessionId ? 'active' : ''} ${
              processingSessionIdRef.current === session.id ? 'processing' : ''
            }`}
            onClick={() => switchSession(session.id)}
          >
            <span>{session.name}</span>
            {processingSessionIdRef.current === session.id && (
              <span className="processing-indicator">●</span>
            )}
            {sessions.length > 1 && (
              <button
                className="tab-close"
                onClick={(e) => closeSession(session.id, e)}
              >
                ×
              </button>
            )}
          </button>
        ))}
        <button className="tab-add" onClick={addSession} title="New session">
          +
        </button>
      </div>

      <main className="main">
        <div className="chat-panel">
          <div className="messages">
            {!currentSession && (
              <div className="welcome">
                <h2>⏳ Loading...</h2>
                <p>Connecting to AIDE server...</p>
              </div>
            )}

            {currentSession && currentSession.messages.length === 0 && (
              <div className="welcome">
                <h2>👋 Welcome to AIDE</h2>
                <p>Ask a question about your codebase to get started.</p>
                <div className="welcome-tips">
                  <p>
                    <strong>Tips:</strong>
                  </p>
                  <ul>
                    <li>Try "What is [symbol name]?" to explore code</li>
                    <li>Use the ⚙️ button for settings</li>
                    <li>Switch strategies with the buttons below</li>
                  </ul>
                </div>
              </div>
            )}

            {currentSession?.messages.map((msg, i) => (
              <div key={i} className="message">
                <div className="message-header">
                  <span className={`message-role ${msg.role}`}>
                    {msg.role === 'user'
                      ? '🧑 You'
                      : msg.role === 'error'
                      ? '❌ Error'
                      : '🤖 AIDE'}
                  </span>
                  {msg.metadata && (
                    <span className="message-meta">
                      via {msg.metadata.strategy}
                      {msg.metadata.hybridMode &&
                        ` (${msg.metadata.hybridMode})`}{' '}
                      • {msg.metadata.symbolCount} symbols,{' '}
                      {msg.metadata.blockCount} blocks
                    </span>
                  )}
                </div>
                <div className={`message-content ${msg.role}`}>
                  <ReactMarkdown
                    components={{
                      code({ className, children, ...props }) {
                        const match = /language-(\w+)/.exec(className || '');
                        const inline = !match;
                        return !inline ? (
                          <SyntaxHighlighter
                            style={oneDark}
                            language={match[1]}
                            PreTag="div"
                          >
                            {String(children).replace(/\n$/, '')}
                          </SyntaxHighlighter>
                        ) : (
                          <code className={className} {...props}>
                            {children}
                          </code>
                        );
                      },
                    }}
                  >
                    {msg.content}
                  </ReactMarkdown>
                </div>
              </div>
            ))}

            {status && processingSessionIdRef.current === activeSessionId && (
              <div className="status">
                <div className="status-dot"></div>
                {status}
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div className="input-area">
            <div className="strategy-selector">
              {(['simple', 'tools', 'hybrid'] as const).map((s) => (
                <button
                  key={s}
                  className={`strategy-button ${
                    strategy === s ? 'active' : ''
                  }`}
                  onClick={() => setStrategy(s)}
                >
                  {s}
                </button>
              ))}
              {strategy === 'hybrid' && (
                <select
                  className="hybrid-select"
                  value={hybridMode}
                  onChange={(e) =>
                    setHybridMode(e.target.value as 'code' | 'hints')
                  }
                >
                  <option value="code">code upfront</option>
                  <option value="hints">entry points</option>
                </select>
              )}
            </div>
            <div className="input-container">
              <div className="input-wrapper">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask about your code... (Enter to send, Shift+Enter for new line)"
                  rows={1}
                />
              </div>
              <button
                className="send-button"
                onClick={sendQuestion}
                disabled={!input.trim() || !connected || !!status}
              >
                Send
              </button>
            </div>
          </div>
        </div>

        {verboseOpen && (
          <div className="verbose-panel">
            <div
              className="verbose-header"
              onClick={() => setVerboseOpen(false)}
            >
              <h2>🔍 Verbose Log</h2>
              <button className="verbose-toggle">×</button>
            </div>
            <div className="verbose-content">
              {(!currentSession || currentSession.verboseLogs.length === 0) && (
                <div className="verbose-empty">
                  Logs will appear here when you ask a question
                </div>
              )}
              {currentSession?.verboseLogs.map((log, i) => (
                <div
                  key={i}
                  className={`verbose-log ${log.type} ${
                    log.expanded ? 'expanded' : ''
                  }`}
                  onClick={() => toggleLogExpand(i)}
                >
                  <div className="verbose-log-header">
                    {log.type === 'tool' ? (
                      <span className="tool-name">🔧 {log.preview}</span>
                    ) : log.type === 'header' ? (
                      <span className="log-header-text">📋 {log.preview}</span>
                    ) : (
                      <span>{log.preview}</span>
                    )}
                    <span className="expand-icon">
                      {log.expanded ? '▼' : '▶'}
                    </span>
                  </div>
                  {log.expanded && (
                    <div className="verbose-log-content">
                      <ReactMarkdown
                        components={{
                          code({ className, children, ...props }) {
                            const match = /language-(\w+)/.exec(
                              className || ''
                            );
                            const inline = !match;
                            return !inline ? (
                              <SyntaxHighlighter
                                style={oneDark}
                                language={match[1]}
                                PreTag="div"
                              >
                                {String(children).replace(/\n$/, '')}
                              </SyntaxHighlighter>
                            ) : (
                              <code className={className} {...props}>
                                {children}
                              </code>
                            );
                          },
                        }}
                      >
                        {log.fullContent}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              ))}
              <div ref={verboseEndRef} />
            </div>
          </div>
        )}

        {!verboseOpen && (
          <div
            className="verbose-panel collapsed"
            onClick={() => setVerboseOpen(true)}
          >
            <span className="verbose-collapsed-text">Verbose</span>
          </div>
        )}
      </main>
    </div>
  );
}
