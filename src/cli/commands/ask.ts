/**
 * aide ask - Single question mode
 */

import fs from 'fs';
import { SQLiteBrainStore } from '../../brain/sqliteStore';
import { ProjectConfig, ChatMessage } from '../../brain/types';
import { GraphTraversalStrategy } from '../../retrieval/graphTraversal';
import { SessionManager } from '../../session/sessionManager';
import {
  ContextAssembler,
  extractAnswerSummary,
} from '../../context/assembler';
import { OllamaRuntime } from '../../models/localModelClient';
import { logInfo, logError } from '../../core/logger';
import { getProjectDbPath, getSessionsDir } from '../../storage/paths';

export interface AskOptions {
  /** Maximum depth for graph traversal */
  depth?: number;

  /** Maximum symbols per relation type */
  fanout?: number;

  /** Token budget for context */
  tokenBudget?: number;

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

  // Create retrieval strategy
  const strategy = new GraphTraversalStrategy(store, {
    maxDepth: options.depth ?? 2,
    maxFanout: options.fanout ?? 5,
    tokenBudget: options.tokenBudget ?? 4000,
  });

  // Retrieve relevant context using session focus
  if (options.debug) {
    logInfo('Retrieving context...');
  }

  const slice = await strategy.retrieve({
    question,
    focusSymbolIds: session.getFocusSymbolIds(),
    focusFileIds: session.getFocusFileIds(),
  });

  if (options.debug) {
    logInfo(`Found ${slice.central.length} central symbols`);
    logInfo(`Found ${slice.callers.length} callers`);
    logInfo(`Found ${slice.callees.length} callees`);
    logInfo(`Found ${slice.tests.length} tests`);
    logInfo(`Found ${slice.files.size} files`);
    logInfo('');
  }

  // Assemble context
  const assembler = new ContextAssembler({
    projectRoot: config.rootPath,
  });

  const context = assembler.assemble(question, slice, session.getState());

  if (options.debug) {
    logInfo(`Context: ${context.contextSummary}`);
    logInfo(`Estimated tokens: ${context.estimatedTokens}`);
    logInfo('');
  }

  // Add user message to session and save
  session.setLastQuestion(question);
  session.addMessage({ role: 'user', content: question });
  session.save();

  // Create model runtime
  const model = new OllamaRuntime(config);

  // Build messages with recent history
  const recentHistory = session.getHistory().slice(-8);
  const messages: ChatMessage[] = [context.systemMessage, ...recentHistory];

  // Get response
  if (options.debug) {
    logInfo('Querying model...');
    logInfo('');
  }

  try {
    const response = await model.chat(messages);
    console.log(response.content);

    // Add response to session and save
    session.addMessage({ role: 'assistant', content: response.content });
    session.setLastAnswerSummary(extractAnswerSummary(response.content));
    session.updateFocusFromResponse(response.content);

    // Update focus with central symbols
    for (const sym of slice.central.slice(0, 3)) {
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
