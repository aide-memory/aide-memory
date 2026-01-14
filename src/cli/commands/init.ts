/**
 * aide init - Full project indexing
 */

import fs from 'fs';
import { SQLiteBrainStore } from '../../brain/sqliteStore';
import { ProjectConfig } from '../../brain/types';
import { ProjectIndexer } from '../../project/indexer';
import { logInfo, logError } from '../../core/logger';
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

  // Create indexer and index all files
  const indexer = new ProjectIndexer(store);

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
