/**
 * aide ask - Single question mode
 *
 * Uses retrieval strategies and context assembly.
 */

import fs from 'fs';
import { SQLiteBrainStore } from '../../brain/sqliteStore';
import { ProjectConfig, ChatMessage } from '../../brain/types';
import { createRetrievalStrategy, RetrievalConfig } from '../../retrieval';
import { SessionManager } from '../../session/sessionManager';
import {
  ContextAssembler,
  extractAnswerSummary,
} from '../../context/assembler';
import { OllamaRuntime } from '../../models/localModelClient';
import { logInfo, logError } from '../../core/logger';
import { renderMarkdown, verbose } from '../ui';
import { getProjectDbPath, getSessionsDir } from '../../storage/paths';
import { TokenBudgetManager } from '../../core/tokenBudget';
import { AIDE_DEFAULTS, getEffectiveSettings } from '../../core/config';

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

export interface AskOptions {
  /** Maximum depth for graph traversal */
  depth?: number;

  /** Maximum symbols per relation type */
  fanout?: number;

  /** Token budget for context */
  tokenBudget?: number;

  /** Maximum number of code blocks to include */
  maxBlocks?: number;

  /** Retrieval strategy to use */
  strategy?: RetrievalConfig['strategy'];

  /** Hybrid mode: 'code' (full code upfront) or 'hints' (entry points only) */
  hybridMode?: 'code' | 'hints';

  /** Print debug info */
  debug?: boolean;
}

export async function askQuestion(
  config: ProjectConfig,
  question: string,
  options: AskOptions = {}
): Promise<void> {
  const dbPath = getProjectDbPath(config.id);
  const sessionsDir = getSessionsDir(config.id);

  // Check if index exists
  if (!fs.existsSync(dbPath)) {
    logError('Project not indexed. Run `aide init` first.');
    process.exit(1);
  }

  // Open store
  const store = new SQLiteBrainStore(dbPath);
  store.initialize();

  // Load or create session (for history continuity with REPL)
  let session = SessionManager.loadLatest(config.id, sessionsDir, store, {
    sessionsDir,
  });
  if (!session) {
    session = new SessionManager(config.id, store, { sessionsDir });
  }

  // Create model runtime (needed for tool-based retrieval)
  const model = new OllamaRuntime(config);

  // Get effective settings (project config + CLI options + defaults)
  const settings = getEffectiveSettings(config, {
    strategy: options.strategy,
    hybridMode: options.hybridMode,
    tokenBudget: options.tokenBudget,
    maxBlocks: options.maxBlocks,
    maxDepth: options.depth,
    maxFanout: options.fanout,
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
    { verbose: options.debug } // Pass debug as verbose for tool logging
  );

  // Retrieve relevant context using session focus
  if (options.debug) {
    logInfo('Retrieving context...');
  }

  // Retrieve context
  const result = await retrieval.retrieve(
    {
      question,
      focusSymbolIds: session.getFocusSymbolIds(),
      focusFileIds: session.getFocusFileIds(),
    },
    store
  );

  if (options.debug) {
    logInfo(`Found ${result.symbols.length} symbols`);
    logInfo(`Found ${result.blocks.length} blocks`);
    logInfo(`Found ${result.files.length} files`);
    logInfo(`Found ${result.relations.length} relations`);
    logInfo(`Strategy: ${result.strategy}`);
    logInfo(`Token estimate: ${result.tokenEstimate}`);
    logInfo('');
  }

  // Assemble context using effective settings
  const assembler = new ContextAssembler({
    projectRoot: config.rootPath,
    maxContextTokens: settings.tokenBudget,
  });

  const assembled = assembler.assemble(question, result, session.getState());

  if (options.debug) {
    logInfo(
      `Context: ${assembled.metadata.symbolCount} symbols, ${assembled.metadata.blockCount} blocks`
    );
    logInfo(`Estimated tokens: ${assembled.tokenEstimate}`);
    logInfo(`Truncated: ${assembled.metadata.wasTruncated}`);
    logInfo('');
  }

  // Add user message to session and save
  session.setLastQuestion(question);
  session.addMessage({ role: 'user', content: question });
  session.save();

  // Build messages with recent history
  const recentHistory = session.getHistory().slice(-8);

  // Build messages from AssembledContext
  const messages: ChatMessage[] = [
    { role: 'system', content: assembled.systemPrompt },
    ...recentHistory.slice(0, -1), // Exclude last user message (included in assembled.messages)
    ...assembled.messages.filter((m) => m.role !== 'system'),
  ];

  // Verbose logging if debug is enabled
  if (options.debug) {
    const budget = new TokenBudgetManager(options.tokenBudget ?? 8000);
    logVerbose(messages, budget);
    logInfo('Querying model...');
    logInfo('');
  }

  try {
    const response = await model.chat(messages);
    renderMarkdown(response.content);

    // Add response to session and save
    session.addMessage({ role: 'assistant', content: response.content });
    session.setLastAnswerSummary(extractAnswerSummary(response.content));
    session.updateFocusFromResponse(response.content);

    // Update focus with symbols from result
    for (const sym of result.symbols.slice(0, 3)) {
      session.addFocusSymbol(sym.id);
    }

    session.save();
  } catch (err) {
    logError('Failed to get response from model', err);
    process.exit(1);
  } finally {
    store.close();
  }
}
