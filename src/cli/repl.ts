/**
 * Interactive REPL for AIDE
 *
 * Uses retrieval strategies and context assembly.
 */

import readline from 'readline';
import fs from 'fs';
import { ui, renderMarkdown, verbose } from './ui';
import { ProjectConfig, ChatMessage, Note } from '../brain/types';
import { SQLiteBrainStore } from '../brain/sqliteStore';
import { createRetrievalStrategy, RetrievalConfig } from '../retrieval';
import { SessionManager } from '../session/sessionManager';
import {
  ContextAssembler,
  extractAnswerSummary,
  parseSuggestedNotes,
} from '../context/assembler';
import { OllamaRuntime } from '../models/localModelClient';
import { logError } from '../core/logger';
import { getProjectDbPath, getSessionsDir } from '../storage/paths';
import { TokenBudgetManager } from '../core/tokenBudget';
import { AIDE_DEFAULTS, getEffectiveSettings } from '../core/config';

const MAX_HISTORY_MESSAGES = 8;

export interface ReplOptions {
  /** Start a fresh session instead of resuming the previous one */
  newSession?: boolean;
  /** Clear chat history before starting (keeps focus) */
  clearHistory?: boolean;
  /** Retrieval strategy to use */
  strategy?: RetrievalConfig['strategy'];
  /** Hybrid mode: 'code' (full code upfront) or 'hints' (entry points only) */
  hybridMode?: 'code' | 'hints';
  /** Token budget for context */
  tokenBudget?: number;
  /** Maximum number of code blocks to include */
  maxBlocks?: number;
  /** Log full context sent to model */
  verbose?: boolean;
}

/**
 * Log verbose details about what's being sent to the model
 */
function logVerbose(messages: ChatMessage[], budget: TokenBudgetManager): void {
  const systemMsg = messages.find((m) => m.role === 'system');
  // Find the LAST user message (the current question with context)
  const userMsgs = messages.filter((m) => m.role === 'user');
  const userMsg = userMsgs[userMsgs.length - 1];
  const historyMsgs = messages.filter(
    (m) => m.role !== 'system' && m !== userMsg
  );

  verbose.header('SENDING TO MODEL');

  if (systemMsg) {
    const tokens = budget.estimate(systemMsg.content);
    verbose.label('System prompt', `${tokens} tokens`);
    verbose.text(systemMsg.content);
    verbose.separator();
  }

  if (historyMsgs.length > 0) {
    const historyTokens = historyMsgs.reduce(
      (sum, m) => sum + budget.estimate(m.content),
      0
    );
    verbose.label(
      'History',
      `${historyMsgs.length} messages, ${historyTokens} tokens`
    );
    verbose.separator();
  }

  if (userMsg) {
    const tokens = budget.estimate(userMsg.content);
    verbose.label('User message with context', `${tokens} tokens`);
    verbose.content(userMsg.content);
    verbose.separator();
  }

  const totalTokens = messages.reduce(
    (sum, m) => sum + budget.estimate(m.content),
    0
  );
  verbose.label('Total tokens', totalTokens);
  verbose.footer();
}

export async function startRepl(
  config: ProjectConfig,
  options: ReplOptions = {}
): Promise<void> {
  const dbPath = getProjectDbPath(config.id);
  const sessionsDir = getSessionsDir(config.id);

  // Verify database exists
  if (!fs.existsSync(dbPath)) {
    logError('Project not indexed. Run `aide init` first.');
    process.exit(1);
  }

  // Initialize components
  const store = new SQLiteBrainStore(dbPath);
  store.initialize();

  const model = new OllamaRuntime(config);

  // Get effective settings (project config + CLI options + defaults)
  const settings = getEffectiveSettings(config, {
    strategy: options.strategy,
    hybridMode: options.hybridMode,
    tokenBudget: options.tokenBudget,
    maxBlocks: options.maxBlocks,
  });

  // Create retrieval strategy using effective settings
  const retrieval = createRetrievalStrategy(
    {
      strategy: settings.strategy,
      hybridMode: settings.hybridMode,
      maxDepth: settings.maxDepth,
      maxFanout: settings.maxFanout,
      tokenBudget: settings.tokenBudget,
      maxBlocks: settings.maxBlocks,
    },
    model, // Pass runtime for tool-based retrieval
    undefined, // budget
    { verbose: options.verbose } // Pass verbose for tool logging
  );

  // Token budget manager for verbose logging
  const budget = new TokenBudgetManager(8000);

  // Try to resume previous session unless --new flag is set
  let session: SessionManager;
  let isResumed = false;

  if (!options.newSession) {
    const existingSession = SessionManager.loadLatest(
      config.id,
      sessionsDir,
      store,
      { sessionsDir }
    );
    if (existingSession) {
      session = existingSession;
      isResumed = true;
    } else {
      session = new SessionManager(config.id, store, { sessionsDir });
    }
  } else {
    session = new SessionManager(config.id, store, { sessionsDir });
  }

  // Clear history if requested (but keep focus)
  if (options.clearHistory && isResumed) {
    session.clearHistory();
    session.save();
  }

  // Create context assembler using effective settings
  const assembler = new ContextAssembler({
    projectRoot: config.rootPath,
    maxContextTokens: settings.tokenBudget,
  });

  // Print header
  const stats = store.getStats();
  console.log(ui.heading(`\nAIDE - ${config.rootPath}`));
  console.log(
    ui.info(
      `Index: ${stats.fileCount} files, ${stats.symbolCount} symbols, ${stats.blockCount} blocks`
    )
  );

  // Show resume status
  if (isResumed) {
    const historyCount = session.getHistory().length;
    const startedAt = new Date(session.getStartedAt()).toLocaleString();
    if (options.clearHistory) {
      console.log(
        ui.info(`Resuming session from ${startedAt} (history cleared)`)
      );
    } else {
      console.log(
        ui.info(`Resuming session from ${startedAt} (${historyCount} messages)`)
      );
    }
  } else {
    console.log(ui.info('New session started'));
  }

  console.log(ui.info('Type :help for commands, :q to quit\n'));

  // Create readline interface
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const printHelp = () => {
    console.log(`
${ui.heading('Commands:')}
  ${ui.info(':q, :quit, :exit')}    Exit AIDE
  ${ui.info(':help')}               Show this help
  ${ui.info(':stats')}              Show index statistics
  ${ui.info(':focus')}              Show current session focus
  ${ui.info(':clear')}              Clear session focus
  ${ui.info(':history')}            Show chat history
  ${ui.info(':clear-history')}      Clear chat history only
  ${ui.info(':new')}                Start fresh (clear history + focus)
  ${ui.info(':note <text>')}        Add a note to current focus

${ui.heading('Tips:')}
  - Mention symbol names to bring them into focus
  - Ask about relationships between functions/classes
  - Use specific file paths for targeted queries
`);
  };

  const printStats = () => {
    const s = store.getStats();
    console.log(`
${ui.heading('Index Statistics:')}
  Files:     ${s.fileCount}
  Symbols:   ${s.symbolCount}
  Blocks:    ${s.blockCount}
  Relations: ${s.relationCount}
  Notes:     ${s.noteCount}
  Tags:      ${s.tagCount}
`);
  };

  const printFocus = () => {
    const symbols = session.getFocusSymbols();
    const files = session.getFocusFiles();

    if (symbols.length === 0 && files.length === 0) {
      console.log(ui.info('\nNo symbols or files in focus.\n'));
      return;
    }

    console.log(ui.heading('\nSession Focus:'));

    if (symbols.length > 0) {
      console.log('  Symbols:');
      for (const sym of symbols) {
        console.log(`    - ${sym.kind} ${ui.file(sym.name)}`);
      }
    }

    if (files.length > 0) {
      console.log('  Files:');
      for (const file of files) {
        console.log(`    - ${ui.file(file.path)}`);
      }
    }

    console.log('');
  };

  const addNote = (text: string) => {
    const symbols = session.getFocusSymbols();

    if (symbols.length === 0) {
      console.log(ui.error('No symbols in focus. Ask a question first.\n'));
      return;
    }

    // Add note to the first focus symbol
    const sym = symbols[0];
    const note: Note = {
      id: `note:${Date.now()}`,
      symbolId: sym.id,
      content: text,
      source: 'user',
      createdAt: new Date().toISOString(),
    };

    store.addNote(note);
    console.log(ui.info(`Note added to ${sym.name}\n`));
  };

  const askLoop = () => {
    rl.question(ui.prompt, async (line) => {
      const trimmed = line.trim();

      // Handle commands
      if (trimmed.startsWith(':')) {
        const cmd = trimmed.slice(1).toLowerCase();

        if (cmd === 'q' || cmd === 'quit' || cmd === 'exit') {
          session.end();
          store.close();
          rl.close();
          return;
        }

        if (cmd === 'help') {
          printHelp();
          askLoop();
          return;
        }

        if (cmd === 'stats') {
          printStats();
          askLoop();
          return;
        }

        if (cmd === 'focus') {
          printFocus();
          askLoop();
          return;
        }

        if (cmd === 'clear') {
          session.clearAllFocus();
          console.log(ui.info('Focus cleared.\n'));
          askLoop();
          return;
        }

        if (cmd === 'history') {
          const history = session.getHistory();
          if (history.length === 0) {
            console.log(ui.info('\nNo chat history.\n'));
          } else {
            console.log(ui.heading('\nChat History:'));
            for (const msg of history.slice(-10)) {
              const prefix = msg.role === 'user' ? '  You: ' : '  AI:  ';
              const content =
                msg.content.length > 100
                  ? msg.content.slice(0, 100) + '...'
                  : msg.content;
              console.log(prefix + content.replace(/\n/g, ' '));
            }
            console.log('');
          }
          askLoop();
          return;
        }

        if (cmd === 'clear-history') {
          session.clearHistory();
          session.save();
          console.log(ui.info('Chat history cleared.\n'));
          askLoop();
          return;
        }

        if (cmd === 'new') {
          // Clear history and focus to start fresh
          session.clearHistory();
          session.clearAllFocus();
          session.save();
          console.log(ui.info('Session cleared. Starting fresh.\n'));
          askLoop();
          return;
        }

        if (cmd.startsWith('note ')) {
          addNote(cmd.slice(5).trim());
          askLoop();
          return;
        }

        console.log(ui.error(`Unknown command: ${cmd}\n`));
        askLoop();
        return;
      }

      // Empty input
      if (!trimmed) {
        askLoop();
        return;
      }

      // Process question
      try {
        // Update session with the question and add to history
        session.setLastQuestion(trimmed);
        const userMsg: ChatMessage = { role: 'user', content: trimmed };
        session.addMessage(userMsg);

        // Save immediately after user prompt (preserves question if model crashes)
        session.save();

        // Retrieve context using configured strategy
        const result = await retrieval.retrieve(
          {
            question: trimmed,
            focusSymbolIds: session.getFocusSymbolIds(),
            focusFileIds: session.getFocusFileIds(),
          },
          store
        );

        // Show what we found (debug info)
        const contextInfo = [];
        if (result.symbols.length > 0) {
          contextInfo.push(`${result.symbols.length} symbols`);
        }
        if (result.blocks.length > 0) {
          contextInfo.push(`${result.blocks.length} blocks`);
        }
        if (result.files.length > 0) {
          contextInfo.push(`${result.files.length} files`);
        }

        if (contextInfo.length > 0) {
          console.log(
            ui.info(
              `[context: ${contextInfo.join(', ')} via ${result.strategy}]`
            )
          );
        }

        // Assemble LLM context
        const assembled = assembler.assemble(
          trimmed,
          result,
          session.getState()
        );

        // AssembledContext.messages already includes system prompt
        // Just add recent history before the user message
        const recentHistory = session.getHistory().slice(-MAX_HISTORY_MESSAGES);

        // Build final messages: system + history + user with context
        const messages: ChatMessage[] = [
          { role: 'system', content: assembled.systemPrompt },
          ...recentHistory.slice(0, -1), // Exclude the last user message (it's in assembled.messages)
          ...assembled.messages.filter((m) => m.role !== 'system'), // User message with context
        ];

        // Verbose logging if enabled
        if (options.verbose) {
          logVerbose(messages, budget);
        }

        // Get response
        const response = await model.chat(messages);

        // Add response to session history
        const assistantMsg: ChatMessage = {
          role: 'assistant',
          content: response.content,
        };
        session.addMessage(assistantMsg);

        // Update session
        session.setLastAnswerSummary(extractAnswerSummary(response.content));
        session.updateFocusFromResponse(response.content);

        // Update focus with symbols from this query
        for (const sym of result.symbols.slice(0, 3)) {
          session.addFocusSymbol(sym.id);
        }

        // Save after response (persists complete exchange)
        session.save();

        // Check for suggested notes from the model
        const suggestedNotes = parseSuggestedNotes(response.content);
        for (const suggestion of suggestedNotes) {
          // Find the target symbol
          const symbols = store.findSymbols({ name: suggestion.target });
          if (symbols.length > 0) {
            const note: Note = {
              id: `note:${Date.now()}-${Math.random().toString(36).slice(2)}`,
              symbolId: symbols[0].id,
              content: suggestion.content,
              source: 'model',
              createdAt: new Date().toISOString(),
            };
            store.addNote(note);
          }
        }

        // Print response (rendered as markdown via glow)
        renderMarkdown(response.content);
      } catch (err) {
        logError('Error processing question', err);
      }

      askLoop();
    });
  };

  // Handle cleanup on interrupt
  process.on('SIGINT', () => {
    console.log('\n');
    session.end();
    store.close();
    process.exit(0);
  });

  askLoop();
}
