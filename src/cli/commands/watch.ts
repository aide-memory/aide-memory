/**
 * aide watch - Automatic file change detection and reindexing
 */

import chokidar from 'chokidar';
import path from 'path';
import { ProjectConfig } from '../../brain/types';
import { reindexProject } from './reindex';
import { logInfo } from '../../core/logger';

export interface WatchOptions {
  /** Debounce delay in milliseconds */
  debounceMs?: number;
}

const DEFAULT_OPTIONS: WatchOptions = {
  debounceMs: 1000,
};

const WATCH_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.json',
  '**/*.md',
];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/.turbo/**',
  '**/.next/**',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/*.lock',
  '**/*.log',
];

export async function watchProject(
  config: ProjectConfig,
  options: WatchOptions = {}
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  logInfo(`Watching for changes in: ${config.rootPath}`);
  logInfo('Press Ctrl+C to stop.\n');

  // Track pending changes for debouncing
  let pendingFiles = new Set<string>();
  let debounceTimer: NodeJS.Timeout | null = null;

  const processChanges = async () => {
    if (pendingFiles.size === 0) return;

    const files = Array.from(pendingFiles);
    pendingFiles.clear();

    logInfo(`\nReindexing ${files.length} changed file(s)...`);

    try {
      await reindexProject(config, { files });
    } catch (err) {
      console.error('Reindex error:', err);
    }
  };

  const scheduleProcess = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(processChanges, opts.debounceMs);
  };

  // Create watcher
  const watcher = chokidar.watch(WATCH_PATTERNS, {
    cwd: config.rootPath,
    ignored: IGNORE_PATTERNS,
    persistent: true,
    ignoreInitial: true,
    awaitWriteFinish: {
      stabilityThreshold: 200,
      pollInterval: 100,
    },
  });

  // Handle events
  watcher.on('add', (relativePath) => {
    const absPath = path.join(config.rootPath, relativePath);
    logInfo(`[+] Added: ${relativePath}`);
    pendingFiles.add(absPath);
    scheduleProcess();
  });

  watcher.on('change', (relativePath) => {
    const absPath = path.join(config.rootPath, relativePath);
    logInfo(`[~] Changed: ${relativePath}`);
    pendingFiles.add(absPath);
    scheduleProcess();
  });

  watcher.on('unlink', (relativePath) => {
    logInfo(`[-] Deleted: ${relativePath}`);
    // For deletions, we need to do a full reindex of affected relations
    pendingFiles.add('*'); // Signal for full relation re-resolution
    scheduleProcess();
  });

  watcher.on('error', (err) => {
    console.error('Watcher error:', err);
  });

  watcher.on('ready', () => {
    logInfo('Watching for file changes...');
  });

  // Keep the process running
  await new Promise(() => {});
}
