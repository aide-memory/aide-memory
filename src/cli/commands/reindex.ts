/**
 * aide reindex - Incremental project reindexing
 *
 * Only updates files that have changed since last index.
 */

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { SQLiteBrainStore } from '../../brain/sqliteStore';
import { ProjectConfig, FileRecord } from '../../brain/types';
import { ProjectIndexer } from '../../project/indexer';
import { analyzeFile, generateFileId } from '../../analysis/fileAnalyzer';
import { logInfo, logError } from '../../core/logger';
import { getProjectDbPath } from '../../storage/paths';

export interface ReindexOptions {
  /** Specific files to reindex */
  files?: string[];
}

const FILE_PATTERNS = [
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  '**/*.py',
  '**/*.go',
  '**/*.rs',
  '**/*.java',
  '**/*.rb',
  '**/*.c',
  '**/*.cpp',
  '**/*.cc',
  '**/*.cxx',
  '**/*.h',
  '**/*.hpp',
  '**/*.json',
  '**/*.md',
  '**/*.yaml',
  '**/*.yml',
  '**/*.toml',
];

const IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.turbo/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/*.pyc',
  '**/*.egg-info/**',
  '**/vendor/**',
  '**/target/**',
  '**/*.class',
  '**/*.lock',
  '**/*.log',
  '**/*.min.js',
  '**/*.min.css',
  '**/coverage/**',
  '**/tmp/**',
  '**/.cache/**',
];

export async function reindexProject(
  config: ProjectConfig,
  options: ReindexOptions = {}
): Promise<void> {
  const dbPath = getProjectDbPath(config.id);

  // Check if index exists
  if (!fs.existsSync(dbPath)) {
    logError('Project not indexed. Run `aide init` first.');
    return;
  }

  logInfo(`Reindexing project: ${config.rootPath}`);

  // Open store
  const store = new SQLiteBrainStore(dbPath);
  store.initialize();

  // Create indexer
  const indexer = new ProjectIndexer(store);

  try {
    await indexer.initialize();

    // Get current files in store
    const existingFiles = store.findFiles();
    const existingByPath = new Map<string, FileRecord>();
    for (const file of existingFiles) {
      existingByPath.set(file.path, file);
    }

    // Find files to process
    let diskFiles: string[];
    if (options.files && options.files.length > 0) {
      // Reindex specific files
      diskFiles = options.files.map((f) => {
        if (fs.existsSync(f)) return f;
        const abs = path.join(config.rootPath, f);
        return fs.existsSync(abs) ? abs : f;
      });
    } else {
      // Find all files
      diskFiles = await fg(FILE_PATTERNS, {
        cwd: config.rootPath,
        ignore: IGNORE_PATTERNS,
        absolute: true,
      });
    }

    const diskFileSet = new Set<string>();
    let added = 0;
    let updated = 0;
    let unchanged = 0;
    let removed = 0;
    let totalSymbols = 0;
    let totalBlocks = 0;

    logInfo('Checking for changes...');

    for (const absPath of diskFiles) {
      const fileInfo = analyzeFile(config.rootPath, absPath);
      if (!fileInfo) continue;

      diskFileSet.add(fileInfo.relativePath);
      const existing = existingByPath.get(fileInfo.relativePath);

      // Check if file has changed
      if (existing && existing.contentHash === fileInfo.contentHash) {
        unchanged++;
        continue;
      }

      // File is new or changed - use ProjectIndexer
      if (existing) {
        // Reindex changed file (clears old data)
        const result = await indexer.reindexFile(
          config.rootPath,
          absPath,
          config.id
        );
        totalSymbols += result.symbols;
        totalBlocks += result.blocks;
        updated++;
      } else {
        // Index new file
        const result = await indexer.indexFile(
          config.rootPath,
          absPath,
          config.id
        );
        totalSymbols += result.symbols;
        totalBlocks += result.blocks;
        added++;
      }
    }

    // Remove deleted files (only when doing full reindex, not partial)
    if (!options.files || options.files.length === 0) {
      for (const [filePath, file] of existingByPath) {
        if (!diskFileSet.has(filePath)) {
          store.deleteBlocksForFile(file.id);
          store.deleteSymbolsForFile(file.id);
          store.deleteFile(file.id);
          removed++;
        }
      }
    }

    // Print summary
    logInfo('');
    logInfo('Reindex Summary:');
    logInfo(`  Added:     ${added}`);
    logInfo(`  Updated:   ${updated}`);
    logInfo(`  Removed:   ${removed}`);
    logInfo(`  Unchanged: ${unchanged}`);
    logInfo(`  New symbols: ${totalSymbols}`);
    logInfo(`  New blocks:  ${totalBlocks}`);

    const stats = store.getStats();
    logInfo('');
    logInfo('Current Index:');
    logInfo(`  Files:     ${stats.fileCount}`);
    logInfo(`  Symbols:   ${stats.symbolCount}`);
    logInfo(`  Blocks:    ${stats.blockCount}`);
    logInfo(`  Relations: ${stats.relationCount}`);

    logInfo('Reindex complete!');
  } catch (err) {
    logError('Failed to reindex project', err);
    throw err;
  } finally {
    store.close();
  }
}
