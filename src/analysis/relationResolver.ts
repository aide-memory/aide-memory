/**
 * Relation resolver: discovers CALLS, IMPORTS, TESTS, CONFIGURES relations
 */

import path from 'path';
import crypto from 'crypto';
import {
  Relation,
  RelationKind,
  SymbolRecord,
  FileRecord,
} from '../brain/types';
import { ProjectBrainStore } from '../brain/store';
import { ParsedFile, ImportInfo } from './parser';
import { CtagsParseResult } from './ctagsParser';

export function generateRelationId(
  sourceId: string,
  targetId: string,
  kind: RelationKind
): string {
  const hash = crypto
    .createHash('sha1')
    .update(`${sourceId}:${targetId}:${kind}`)
    .digest('hex')
    .slice(0, 12);
  return `rel:${hash}`;
}

/**
 * Resolve import statements to actual file/symbol relations
 */
export function resolveImports(
  store: ProjectBrainStore,
  fileId: string,
  filePath: string,
  imports: ImportInfo[],
  projectRoot: string
): Relation[] {
  const relations: Relation[] = [];
  const fileSymbols = store.getSymbolsForFile(fileId);

  for (const imp of imports) {
    // Skip external packages (node_modules)
    if (
      !imp.moduleSpecifier.startsWith('.') &&
      !imp.moduleSpecifier.startsWith('/')
    ) {
      continue;
    }

    // Resolve the import path
    const importedPath = resolveImportPath(
      filePath,
      imp.moduleSpecifier,
      projectRoot
    );
    if (!importedPath) continue;

    // Find the target file
    const targetFiles = store.findFiles({ pathPattern: `*${importedPath}*` });
    if (targetFiles.length === 0) continue;

    const targetFile = targetFiles[0];
    const targetSymbols = store.getSymbolsForFile(targetFile.id);

    // Create IMPORTS relations for each imported name
    for (const importedName of imp.importedNames) {
      // Skip namespace imports for now
      if (importedName.startsWith('*')) continue;

      // Find the target symbol
      const targetSymbol = targetSymbols.find((s) => s.name === importedName);
      if (!targetSymbol) continue;

      // Find a source symbol that uses this import (or use file-level)
      // For simplicity, we create a relation from the first symbol in the file
      const sourceSymbol = fileSymbols[0];
      if (!sourceSymbol) continue;

      relations.push({
        id: generateRelationId(sourceSymbol.id, targetSymbol.id, 'IMPORTS'),
        sourceSymbolId: sourceSymbol.id,
        targetSymbolId: targetSymbol.id,
        kind: 'IMPORTS',
      });
    }
  }

  return relations;
}

/**
 * Resolve function calls to symbol relations
 */
export function resolveCalls(
  store: ProjectBrainStore,
  fileId: string,
  parsed: ParsedFile
): Relation[] {
  const relations: Relation[] = [];
  const fileSymbols = store.getSymbolsForFile(fileId);
  const allSymbols = store.findSymbols();

  // Create a map for quick lookup
  const symbolMap = new Map<string, SymbolRecord>();
  for (const sym of allSymbols) {
    symbolMap.set(sym.name, sym);
    // Also map by short name for method calls
    const parts = sym.name.split('.');
    if (parts.length > 1) {
      symbolMap.set(parts[parts.length - 1], sym);
    }
  }

  for (const call of parsed.calls) {
    // Find the caller symbol
    const callerSymbol = fileSymbols.find((s) => s.name === call.callerName);
    if (!callerSymbol) continue;

    // Find the callee symbol
    let calleeSymbol = symbolMap.get(call.calleeName);

    // Try to find by partial match (for method calls like obj.method)
    if (!calleeSymbol) {
      const parts = call.calleeName.split('.');
      if (parts.length > 0) {
        calleeSymbol = symbolMap.get(parts[parts.length - 1]);
      }
    }

    if (!calleeSymbol) continue;

    // Don't create self-references
    if (callerSymbol.id === calleeSymbol.id) continue;

    relations.push({
      id: generateRelationId(callerSymbol.id, calleeSymbol.id, 'CALLS'),
      sourceSymbolId: callerSymbol.id,
      targetSymbolId: calleeSymbol.id,
      kind: 'CALLS',
    });
  }

  return relations;
}

/**
 * Match test files to their source files and create TESTS relations
 */
export function resolveTests(
  store: ProjectBrainStore,
  testFileId: string,
  testFilePath: string
): Relation[] {
  const relations: Relation[] = [];

  // Extract the base name from test file (e.g., "parser.test.ts" -> "parser")
  const baseName = path
    .basename(testFilePath)
    .replace(/\.(test|spec)\.(ts|tsx|js|jsx)$/, '');

  // Find potential source files
  const sourceFiles = store.findFiles({
    pathPattern: `*${baseName}*`,
  });

  const testSymbols = store.getSymbolsForFile(testFileId);

  for (const sourceFile of sourceFiles) {
    // Skip if it's the same file or another test file
    if (
      sourceFile.id === testFileId ||
      sourceFile.path.includes('.test.') ||
      sourceFile.path.includes('.spec.')
    ) {
      continue;
    }

    const sourceSymbols = store.getSymbolsForFile(sourceFile.id);

    // Create TESTS relation from test symbols to source symbols with matching names
    for (const testSym of testSymbols) {
      for (const sourceSym of sourceSymbols) {
        // Check if test function name contains the source function name
        if (
          testSym.name.toLowerCase().includes(sourceSym.name.toLowerCase()) ||
          sourceSym.name.toLowerCase().includes(testSym.name.toLowerCase())
        ) {
          relations.push({
            id: generateRelationId(testSym.id, sourceSym.id, 'TESTS'),
            sourceSymbolId: testSym.id,
            targetSymbolId: sourceSym.id,
            kind: 'TESTS',
          });
        }
      }
    }
  }

  return relations;
}

/**
 * Create CONFIGURES relations for config files that affect source files
 */
export function resolveConfigs(
  store: ProjectBrainStore,
  configFileId: string,
  configFilePath: string
): Relation[] {
  const relations: Relation[] = [];
  const configName = path.basename(configFilePath).toLowerCase();

  // Find symbols that might be configured by this config file
  // This is heuristic-based

  if (configName.includes('tsconfig')) {
    // TypeScript config affects all TypeScript files
    const tsFiles = store.findFiles({ language: 'typescript' });
    for (const file of tsFiles) {
      const symbols = store.getSymbolsForFile(file.id);
      for (const sym of symbols.slice(0, 1)) {
        // Just link to first symbol
        const configSymbols = store.getSymbolsForFile(configFileId);
        if (configSymbols.length > 0) {
          relations.push({
            id: generateRelationId(configSymbols[0].id, sym.id, 'CONFIGURES'),
            sourceSymbolId: configSymbols[0].id,
            targetSymbolId: sym.id,
            kind: 'CONFIGURES',
          });
        }
      }
    }
  }

  return relations;
}

/**
 * Resolve an import path to a relative file path
 */
function resolveImportPath(
  fromFile: string,
  importSpec: string,
  projectRoot: string
): string | null {
  try {
    const fromDir = path.dirname(fromFile);
    let resolved: string;

    if (importSpec.startsWith('.')) {
      resolved = path.resolve(fromDir, importSpec);
    } else if (importSpec.startsWith('/')) {
      resolved = path.resolve(projectRoot, importSpec.slice(1));
    } else {
      return null; // External package
    }

    // Try common extensions
    const extensions = [
      '',
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '/index.ts',
      '/index.js',
    ];
    for (const ext of extensions) {
      const fullPath = resolved + ext;
      const relativePath = path.relative(projectRoot, fullPath);
      if (!relativePath.startsWith('..')) {
        return relativePath;
      }
    }

    return path.relative(projectRoot, resolved);
  } catch {
    return null;
  }
}

/**
 * Run all relation resolution for a file
 */
export function resolveAllRelations(
  store: ProjectBrainStore,
  fileId: string,
  filePath: string,
  parsed: ParsedFile,
  projectRoot: string,
  isTest: boolean,
  isConfig: boolean
): Relation[] {
  const relations: Relation[] = [];

  // Always resolve imports
  relations.push(
    ...resolveImports(store, fileId, filePath, parsed.imports, projectRoot)
  );

  // Resolve calls
  relations.push(...resolveCalls(store, fileId, parsed));

  // Resolve test relations for test files
  if (isTest) {
    relations.push(...resolveTests(store, fileId, filePath));
  }

  // Resolve config relations for config files
  if (isConfig) {
    relations.push(...resolveConfigs(store, fileId, filePath));
  }

  return relations;
}

/**
 * Resolve relations for ctags-parsed files (non-TypeScript languages)
 * Uses text-based heuristics since ctags doesn't provide call information
 */
export function resolveCtagsRelations(
  store: ProjectBrainStore,
  fileId: string,
  filePath: string,
  ctagsResult: CtagsParseResult,
  content: string,
  projectRoot: string,
  language: string
): Relation[] {
  const relations: Relation[] = [];

  // Resolve imports using ctags-extracted import info
  for (const imp of ctagsResult.imports) {
    const fileSymbols = store.getSymbolsForFile(fileId);

    // Try to find target file based on import specifier
    const targetPath = resolveGenericImportPath(
      filePath,
      imp.moduleSpecifier,
      projectRoot,
      language
    );
    if (!targetPath) continue;

    const targetFiles = store.findFiles({ pathPattern: `*${targetPath}*` });
    if (targetFiles.length === 0) continue;

    const targetFile = targetFiles[0];
    const targetSymbols = store.getSymbolsForFile(targetFile.id);

    // Create IMPORTS relations
    for (const importedName of imp.importedNames) {
      if (importedName === '*') continue;

      const targetSymbol = targetSymbols.find((s) => s.name === importedName);
      if (!targetSymbol) continue;

      const sourceSymbol = fileSymbols[0];
      if (!sourceSymbol) continue;

      relations.push({
        id: generateRelationId(sourceSymbol.id, targetSymbol.id, 'IMPORTS'),
        sourceSymbolId: sourceSymbol.id,
        targetSymbolId: targetSymbol.id,
        kind: 'IMPORTS',
      });
    }
  }

  // Text-based call detection for non-TS files
  const fileSymbols = store.getSymbolsForFile(fileId);
  const allSymbols = store.findSymbols();
  const lines = content.split('\n');

  // Build a map of all symbol names across the project
  const symbolMap = new Map<string, SymbolRecord>();
  for (const sym of allSymbols) {
    // Only track functions and classes (things that can be "called")
    if (
      sym.kind === 'function' ||
      sym.kind === 'class' ||
      sym.kind === 'method'
    ) {
      symbolMap.set(sym.name, sym);
    }
  }

  // For each symbol in this file, check if it references other symbols
  for (const sourceSym of fileSymbols) {
    if (sourceSym.kind !== 'function' && sourceSym.kind !== 'method') continue;

    // Get the lines within this symbol
    const startLine = Math.max(0, sourceSym.startLine - 1);
    const endLine = Math.min(lines.length, sourceSym.endLine);
    const symbolCode = lines.slice(startLine, endLine).join('\n');

    // Check for references to other symbols
    for (const [targetName, targetSym] of symbolMap) {
      // Skip self-references and symbols from the same file (usually local)
      if (targetSym.id === sourceSym.id) continue;
      if (targetSym.fileId === fileId) continue;

      // Check if the target symbol name appears in this symbol's code
      // Use word boundary matching to avoid partial matches
      const pattern = new RegExp(`\\b${escapeRegExp(targetName)}\\s*\\(`, 'g');
      if (pattern.test(symbolCode)) {
        relations.push({
          id: generateRelationId(sourceSym.id, targetSym.id, 'CALLS'),
          sourceSymbolId: sourceSym.id,
          targetSymbolId: targetSym.id,
          kind: 'CALLS',
        });
      }
    }
  }

  return relations;
}

/**
 * Resolve import path for various languages
 */
function resolveGenericImportPath(
  fromFile: string,
  importSpec: string,
  projectRoot: string,
  language: string
): string | null {
  try {
    const fromDir = path.dirname(fromFile);

    switch (language) {
      case 'python':
        // Convert Python imports like 'package.module' to 'package/module.py'
        if (importSpec.startsWith('.')) {
          // Relative import
          const parts = importSpec.replace(/^\.+/, '').split('.');
          const levels = (importSpec.match(/^\.*/) || [''])[0].length;
          let baseDir = fromDir;
          for (let i = 1; i < levels; i++) {
            baseDir = path.dirname(baseDir);
          }
          return parts.join('/');
        } else {
          // Absolute import
          return importSpec.split('.').join('/');
        }

      case 'go':
        // Go imports are typically full paths within the module
        return path.basename(importSpec);

      case 'rust':
        // Rust uses :: separator
        return importSpec.split('::').pop() || null;

      case 'java':
        // Java imports like com.example.Class
        const parts = importSpec.split('.');
        return parts[parts.length - 1];

      default:
        // For other languages, try to match the last component
        const pathParts = importSpec.split(/[./\\:]/);
        return pathParts[pathParts.length - 1] || null;
    }
  } catch {
    return null;
  }
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
