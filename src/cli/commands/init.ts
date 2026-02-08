/**
 * aide init - Full project indexing
 */

import fs from 'fs';
import { SQLiteBrainStore } from '../../brain/sqliteStore';
import { ProjectConfig } from '../../brain/types';
import { ProjectIndexer } from '../../project/indexer';
import { SemanticSearchEngine } from '../../retrieval/semanticSearch';
import { OllamaRuntime } from '../../models/localModelClient';
import { detectProvider } from '../../models/modelFactory';
import { logInfo, logError, logWarn } from '../../core/logger';
import { getProjectDbPath, getSessionsDir } from '../../storage/paths';
import { SessionManager } from '../../session/sessionManager';

export interface InitOptions {
  force?: boolean;
  clearSessions?: boolean;
}

export async function initProject(
  config: ProjectConfig,
  options: InitOptions = {}
): Promise<void> {
  const dbPath = getProjectDbPath(config.id);

  // Check if already indexed
  if (fs.existsSync(dbPath) && !options.force) {
    logInfo('Project already indexed. Use --force to reindex from scratch.');
    return;
  }

  logInfo(`Initializing project: ${config.rootPath}`);

  // Create store
  const store = new SQLiteBrainStore(dbPath);
  store.initialize();

  if (options.force) {
    logInfo('Clearing existing index...');
    store.clearAll();
  }

  // Clear sessions if requested
  if (options.clearSessions) {
    const sessionsDir = getSessionsDir(config.id);
    const deleted = SessionManager.clearAllSessions(sessionsDir);
    logInfo(`Cleared ${deleted} session files.`);
  }

  // Create embedding runtime for embedding generation (only needs embedding model, not reasoning/context)
  let searchEngine: SemanticSearchEngine | undefined;
  try {
    const embeddingModelName = config.models.embedding;
    const embeddingProvider = detectProvider(embeddingModelName);

    if (embeddingProvider === 'ollama') {
      const embeddingRuntime = new OllamaRuntime({
        model: embeddingModelName,
        baseUrl: config.ollamaBaseUrl,
        embeddingModel: embeddingModelName,
      });
      searchEngine = new SemanticSearchEngine(
        store,
        embeddingRuntime,
        embeddingModelName
      );
    } else {
      logWarn(`Cloud embedding models require API keys. Skipping embedding generation.`);
    }
  } catch (err) {
    logWarn(`Embedding model not available, skipping embedding generation: ${err}`);
  }

  // Create indexer and index all files (with optional embedding generation)
  const indexer = new ProjectIndexer(store, {}, searchEngine);

  try {
    await indexer.initialize();
    logInfo('Indexing files with Tree-sitter...');

    const stats = await indexer.indexAll(config.rootPath, config.id);

    // Print summary
    const dbStats = store.getStats();
    logInfo('');
    logInfo('Index Summary:');
    logInfo(`  Files:     ${dbStats.fileCount}`);
    logInfo(`  Symbols:   ${dbStats.symbolCount}`);
    logInfo(`  Blocks:    ${dbStats.blockCount}`);
    logInfo(`  Relations: ${dbStats.relationCount}`);
    logInfo('');
    logInfo(`Database: ${dbPath}`);
    logInfo('Project initialized successfully!');
  } catch (err) {
    logError('Failed to initialize project', err);
    throw err;
  } finally {
    store.close();
  }
}
