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
  isProgrammingLanguage,
} from '../../analysis/fileAnalyzer';
import {
  createProject,
  parseFile,
  generateSymbolId,
  ExtractedSymbol,
} from '../../analysis/parser';
import {
  resolveAllRelations,
  resolveCtagsRelations,
} from '../../analysis/relationResolver';
import { logInfo, logError, logWarn } from '../../core/logger';
import { getProjectDbPath, getSessionsDir } from '../../storage/paths';
import { SessionManager } from '../../session/sessionManager';
import {
  isCtagsAvailable,
  parseWithCtags,
  getSupportedLanguages,
} from '../../analysis/ctagsParser';

export interface InitOptions {
  force?: boolean;
  clearSessions?: boolean;
}

const FILE_PATTERNS = [
  // TypeScript/JavaScript (ts-morph)
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  // Python (ctags)
  '**/*.py',
  // Go (ctags)
  '**/*.go',
  // Rust (ctags)
  '**/*.rs',
  // Java (ctags)
  '**/*.java',
  // Ruby (ctags)
  '**/*.rb',
  // PHP (ctags)
  '**/*.php',
  // C/C++ (ctags)
  '**/*.c',
  '**/*.cpp',
  '**/*.cc',
  '**/*.cxx',
  '**/*.h',
  '**/*.hpp',
  // Other languages (ctags)
  '**/*.cs', // C#
  '**/*.swift',
  '**/*.kt', // Kotlin
  '**/*.scala',
  '**/*.lua',
  '**/*.r',
  '**/*.R',
  '**/*.pl', // Perl
  '**/*.pm',
  '**/*.sh',
  '**/*.bash',
  // Config/Doc files (file-only)
  '**/*.json',
  '**/*.md',
  '**/*.yaml',
  '**/*.yml',
  '**/*.toml',
];

const IGNORE_PATTERNS = [
  // Node.js
  '**/node_modules/**',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  // Git
  '**/.git/**',
  // Build outputs
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.turbo/**',
  '**/.next/**',
  // Python
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/*.pyc',
  '**/*.egg-info/**',
  // Go
  '**/vendor/**',
  // Rust
  '**/target/**',
  // Java
  '**/*.class',
  '**/target/**',
  // General
  '**/*.lock',
  '**/*.log',
  '**/*.min.js',
  '**/*.min.css',
  '**/coverage/**',
  '**/tmp/**',
  '**/.cache/**',
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

  // Check ctags availability
  const hasCtagsSupport = isCtagsAvailable();
  if (hasCtagsSupport) {
    logInfo(
      'Universal Ctags detected - multi-language symbol extraction enabled'
    );
  } else {
    logWarn(
      'Universal Ctags not found - only TypeScript/JavaScript symbols will be extracted'
    );
    logWarn(
      'Install with: brew install universal-ctags (macOS) or apt install universal-ctags (Linux)'
    );
  }

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

    // Parse files for symbols
    if (isTypeScriptOrJavaScript(fileInfo.language)) {
      // Use ts-morph for TypeScript/JavaScript (better relation detection)
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
    } else if (hasCtagsSupport && isProgrammingLanguage(fileInfo.language)) {
      // Use ctags for other programming languages
      try {
        const ctagsResult = await parseWithCtags(
          config.rootPath,
          fileInfo.relativePath,
          fileInfo.content
        );

        for (const sym of ctagsResult.symbols) {
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

        // Store for relation resolution
        (fileInfo as any)._ctagsParsed = ctagsResult;
      } catch (err) {
        // Silently skip ctags parsing errors
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

    const fileId = generateFileId(config.id, fileInfo.relativePath);

    try {
      if (isTypeScriptOrJavaScript(fileInfo.language)) {
        // Use ts-morph for TypeScript/JavaScript relations
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
      } else if (hasCtagsSupport && isProgrammingLanguage(fileInfo.language)) {
        // Use ctags-based relation resolution for other languages
        const ctagsResult = await parseWithCtags(
          config.rootPath,
          fileInfo.relativePath,
          fileInfo.content
        );

        const relations = resolveCtagsRelations(
          store,
          fileId,
          fileInfo.relativePath,
          ctagsResult,
          fileInfo.content,
          config.rootPath,
          fileInfo.language
        );

        for (const rel of relations) {
          store.addRelation(rel);
          relationCount++;
        }
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
