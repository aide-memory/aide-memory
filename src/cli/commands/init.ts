/**
 * aide init - Full project indexing
 */

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { Project } from 'ts-morph';
import { SQLiteBrainStore } from '../../brain/sqliteStore';
import { ProjectConfig, FileRecord } from '../../brain/types';
import {
  analyzeFile,
  generateFileId,
  isTypeScriptOrJavaScript,
} from '../../analysis/fileAnalyzer';
import {
  createProject,
  parseFile,
  generateSymbolId,
  ExtractedSymbol,
} from '../../analysis/parser';
import { resolveAllRelations } from '../../analysis/relationResolver';
import { logInfo, logError } from '../../core/logger';
import { getProjectDbPath, getSessionsDir } from '../../storage/paths';
import { SessionManager } from '../../session/sessionManager';

export interface InitOptions {
  force?: boolean;
  clearSessions?: boolean;
}

const FILE_PATTERNS = [
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
  '**/*.min.js',
  '**/*.min.css',
  '**/coverage/**',
  '**/tmp/**',
];

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

  // Find all files
  logInfo('Scanning files...');
  const files = await fg(FILE_PATTERNS, {
    cwd: config.rootPath,
    ignore: IGNORE_PATTERNS,
    absolute: true,
  });

  logInfo(`Found ${files.length} files to index.`);

  // Create ts-morph project for parsing
  const project = createProject(config.rootPath);

  // Phase 1: Index all files and extract symbols
  logInfo('Phase 1: Extracting files and symbols...');

  let fileCount = 0;
  let symbolCount = 0;

  for (const absPath of files) {
    const fileInfo = analyzeFile(config.rootPath, absPath);
    if (!fileInfo) continue;

    const fileId = generateFileId(config.id, fileInfo.relativePath);

    // Create file record
    const fileRecord: FileRecord = {
      id: fileId,
      path: fileInfo.relativePath,
      language: fileInfo.language,
      contentHash: fileInfo.contentHash,
      indexedAt: new Date().toISOString(),
    };

    store.upsertFile(fileRecord);
    fileCount++;

    // Parse TypeScript/JavaScript files for symbols
    if (isTypeScriptOrJavaScript(fileInfo.language)) {
      try {
        const parsed = parseFile(project, absPath, fileInfo.content);

        for (const sym of parsed.symbols) {
          const symbolId = generateSymbolId(
            fileId,
            sym.name,
            sym.kind,
            sym.startLine
          );

          store.upsertSymbol({
            id: symbolId,
            fileId,
            name: sym.name,
            kind: sym.kind,
            startLine: sym.startLine,
            endLine: sym.endLine,
            signature: sym.signature,
            docComment: sym.docComment,
          });

          symbolCount++;
        }

        // Store parsed data temporarily for relation resolution
        (fileInfo as any)._parsed = parsed;
      } catch (err) {
        logError(`Failed to parse ${fileInfo.relativePath}`, err);
      }
    }

    // Progress indicator
    if (fileCount % 50 === 0) {
      logInfo(`  Processed ${fileCount} files, ${symbolCount} symbols...`);
    }
  }

  logInfo(`Phase 1 complete: ${fileCount} files, ${symbolCount} symbols`);

  // Phase 2: Resolve relations
  logInfo('Phase 2: Resolving relations...');

  let relationCount = 0;

  for (const absPath of files) {
    const fileInfo = analyzeFile(config.rootPath, absPath);
    if (!fileInfo) continue;

    if (!isTypeScriptOrJavaScript(fileInfo.language)) continue;

    const fileId = generateFileId(config.id, fileInfo.relativePath);

    try {
      // Re-parse for relations (or use cached)
      const parsed = parseFile(project, absPath, fileInfo.content);

      const relations = resolveAllRelations(
        store,
        fileId,
        fileInfo.relativePath,
        parsed,
        config.rootPath,
        fileInfo.isTest,
        fileInfo.isConfig
      );

      for (const rel of relations) {
        store.addRelation(rel);
        relationCount++;
      }
    } catch (err) {
      // Silently skip relation resolution errors
    }
  }

  logInfo(`Phase 2 complete: ${relationCount} relations`);

  // Print summary
  const stats = store.getStats();
  logInfo('');
  logInfo('Index Summary:');
  logInfo(`  Files:     ${stats.fileCount}`);
  logInfo(`  Symbols:   ${stats.symbolCount}`);
  logInfo(`  Relations: ${stats.relationCount}`);
  logInfo('');
  logInfo(`Database: ${dbPath}`);

  store.close();
  logInfo('Project initialized successfully!');
}
