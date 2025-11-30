/**
 * aide reindex - Incremental project reindexing
 *
 * Only updates files that have changed since last index.
 */

import fs from 'fs';
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
} from '../../analysis/parser';
import {
  resolveAllRelations,
  resolveCtagsRelations,
} from '../../analysis/relationResolver';
import { isCtagsAvailable, parseWithCtags } from '../../analysis/ctagsParser';
import { logInfo, logError } from '../../core/logger';
import { getProjectDbPath } from '../../storage/paths';

export interface ReindexOptions {
  /** Specific files to reindex */
  files?: string[];
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
  '**/*.cs',
  '**/*.swift',
  '**/*.kt',
  '**/*.scala',
  '**/*.lua',
  '**/*.r',
  '**/*.R',
  '**/*.pl',
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

  // Check ctags availability
  const hasCtagsSupport = isCtagsAvailable();

  // Open store
  const store = new SQLiteBrainStore(dbPath);
  store.initialize();

  // Get current files in store
  const existingFiles = store.findFiles();
  const existingByPath = new Map<string, FileRecord>();
  for (const file of existingFiles) {
    existingByPath.set(file.path, file);
  }

  // Find all current files on disk
  let diskFiles: string[];
  if (options.files && options.files.length > 0) {
    // Reindex specific files
    diskFiles = options.files.map((f) => {
      if (fs.existsSync(f)) return f;
      const abs = `${config.rootPath}/${f}`;
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

  // Create ts-morph project for parsing
  const project = createProject(config.rootPath);

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let removed = 0;

  // Phase 1: Process files on disk
  logInfo('Checking for changes...');

  const filesToResolve: Array<{
    fileId: string;
    relativePath: string;
    content: string;
    language: string;
    isTest: boolean;
    isConfig: boolean;
  }> = [];

  for (const absPath of diskFiles) {
    const fileInfo = analyzeFile(config.rootPath, absPath);
    if (!fileInfo) continue;

    diskFileSet.add(fileInfo.relativePath);
    const fileId = generateFileId(config.id, fileInfo.relativePath);
    const existing = existingByPath.get(fileInfo.relativePath);

    // Check if file has changed
    if (existing && existing.contentHash === fileInfo.contentHash) {
      unchanged++;
      continue;
    }

    // File is new or changed
    if (existing) {
      // Delete old symbols and relations
      store.deleteSymbolsForFile(fileId);
      updated++;
    } else {
      added++;
    }

    // Create/update file record
    const fileRecord: FileRecord = {
      id: fileId,
      path: fileInfo.relativePath,
      language: fileInfo.language,
      contentHash: fileInfo.contentHash,
      indexedAt: new Date().toISOString(),
    };

    store.upsertFile(fileRecord);

    // Parse files for symbols
    if (isTypeScriptOrJavaScript(fileInfo.language)) {
      // Use ts-morph for TypeScript/JavaScript
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
        }

        // Queue for relation resolution
        filesToResolve.push({
          fileId,
          relativePath: fileInfo.relativePath,
          content: fileInfo.content,
          language: fileInfo.language,
          isTest: fileInfo.isTest,
          isConfig: fileInfo.isConfig,
        });
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
        }

        // Queue for relation resolution
        filesToResolve.push({
          fileId,
          relativePath: fileInfo.relativePath,
          content: fileInfo.content,
          language: fileInfo.language,
          isTest: fileInfo.isTest,
          isConfig: fileInfo.isConfig,
        });
      } catch (err) {
        // Silently skip ctags parsing errors
      }
    }
  }

  // Phase 2: Remove deleted files (only when doing full reindex, not partial)
  if (!options.files || options.files.length === 0) {
    for (const [path, file] of existingByPath) {
      if (!diskFileSet.has(path)) {
        store.deleteFile(file.id);
        removed++;
      }
    }
  }

  // Phase 3: Resolve relations for changed files
  if (filesToResolve.length > 0) {
    logInfo('Resolving relations for changed files...');

    for (const file of filesToResolve) {
      try {
        if (isTypeScriptOrJavaScript(file.language)) {
          // Use ts-morph for TypeScript/JavaScript
          const absPath = `${config.rootPath}/${file.relativePath}`;
          const parsed = parseFile(project, absPath, file.content);

          const relations = resolveAllRelations(
            store,
            file.fileId,
            file.relativePath,
            parsed,
            config.rootPath,
            file.isTest,
            file.isConfig
          );

          for (const rel of relations) {
            store.addRelation(rel);
          }
        } else if (isProgrammingLanguage(file.language)) {
          // Use ctags-based relation resolution
          const ctagsResult = await parseWithCtags(
            config.rootPath,
            file.relativePath,
            file.content
          );

          const relations = resolveCtagsRelations(
            store,
            file.fileId,
            file.relativePath,
            ctagsResult,
            file.content,
            config.rootPath,
            file.language
          );

          for (const rel of relations) {
            store.addRelation(rel);
          }
        }
      } catch (err) {
        // Silently skip
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

  const stats = store.getStats();
  logInfo('');
  logInfo('Current Index:');
  logInfo(`  Files:     ${stats.fileCount}`);
  logInfo(`  Symbols:   ${stats.symbolCount}`);
  logInfo(`  Relations: ${stats.relationCount}`);

  store.close();
  logInfo('Reindex complete!');
}
