/**
 * Interactive REPL for AIDE
 *
 * Uses the new graph-based retrieval strategy and session management.
 */

import readline from 'readline';
import fs from 'fs';
import { ui } from './ui';
import { ProjectConfig, ChatMessage, Note } from '../brain/types';
import { SQLiteBrainStore } from '../brain/sqliteStore';
import { GraphTraversalStrategy } from '../retrieval/graphTraversal';
import { SessionManager } from '../session/sessionManager';
import {
  ContextAssembler,
  extractAnswerSummary,
  parseSuggestedNotes,
} from '../context/assembler';
import { OllamaRuntime } from '../models/localModelClient';
import { logInfo, logError } from '../core/logger';
import { getProjectDbPath, getSessionsDir } from '../storage/paths';

const MAX_HISTORY_MESSAGES = 8;

export interface ReplOptions {
  /** Start a fresh session instead of resuming the previous one */
  newSession?: boolean;
  /** Clear chat history before starting (keeps focus) */
  clearHistory?: boolean;
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

  const strategy = new GraphTraversalStrategy(store, {
    maxDepth: 2,
    maxFanout: 5,
    tokenBudget: 4000,
  });

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

  const assembler = new ContextAssembler({
    projectRoot: config.rootPath,
  });

  // Print header
  const stats = store.getStats();
  console.log(ui.heading(`\nAIDE V0 - ${config.rootPath}`));
  console.log(
    ui.info(
      `Index: ${stats.fileCount} files, ${stats.symbolCount} symbols, ${stats.relationCount} relations`
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

        // Retrieve context using graph traversal
        const slice = await strategy.retrieve({
          question: trimmed,
          focusSymbolIds: session.getFocusSymbolIds(),
          focusFileIds: session.getFocusFileIds(),
        });

        // Show what we found (debug info)
        const contextInfo = [];
        if (slice.central.length > 0) {
          contextInfo.push(`${slice.central.length} central`);
        }
        if (slice.callers.length > 0) {
          contextInfo.push(`${slice.callers.length} callers`);
        }
        if (slice.callees.length > 0) {
          contextInfo.push(`${slice.callees.length} callees`);
        }
        if (slice.tests.length > 0) {
          contextInfo.push(`${slice.tests.length} tests`);
        }

        if (contextInfo.length > 0) {
          console.log(ui.info(`[context: ${contextInfo.join(', ')}]`));
        }

        // Assemble LLM context
        const context = assembler.assemble(trimmed, slice, session.getState());

        // Build messages for LLM using session history
        const recentHistory = session.getHistory().slice(-MAX_HISTORY_MESSAGES);
        const messages: ChatMessage[] = [
          context.systemMessage,
          ...recentHistory,
        ];

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

        // Update focus with central symbols from this query
        for (const sym of slice.central.slice(0, 3)) {
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

        // Print response
        console.log('\n' + response.content + '\n');
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
