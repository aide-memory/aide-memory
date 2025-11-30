/**
 * Universal Ctags parser for multi-language symbol extraction
 *
 * Supports 100+ languages including Python, Go, Rust, Java, C/C++, Ruby, PHP, etc.
 * Requires Universal Ctags to be installed on the system.
 */

import { execSync, spawnSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { SymbolKind } from '../brain/types';
import { ExtractedSymbol, ImportInfo } from './parser';

// Cached ctags availability check
let ctagsAvailableCache: boolean | null = null;
let ctagsPath: string | null = null;

/**
 * Check if Universal Ctags is installed and available
 */
export function isCtagsAvailable(): boolean {
  if (ctagsAvailableCache !== null) {
    return ctagsAvailableCache;
  }

  try {
    // Try common ctags paths
    const possiblePaths = [
      'ctags',
      'universal-ctags',
      '/usr/local/bin/ctags',
      '/opt/homebrew/bin/ctags',
    ];

    for (const ctags of possiblePaths) {
      try {
        const result = spawnSync(ctags, ['--version'], {
          encoding: 'utf-8',
          timeout: 5000,
        });

        if (result.status === 0 && result.stdout.includes('Universal Ctags')) {
          ctagsPath = ctags;
          ctagsAvailableCache = true;
          return true;
        }
      } catch {
        // Try next path
      }
    }

    ctagsAvailableCache = false;
    return false;
  } catch {
    ctagsAvailableCache = false;
    return false;
  }
}

/**
 * Get the path to ctags executable
 */
export function getCtagsPath(): string | null {
  if (!isCtagsAvailable()) {
    return null;
  }
  return ctagsPath;
}

/**
 * Map ctags kind to our SymbolKind
 */
function mapCtagsKind(ctagsKind: string, language: string): SymbolKind | null {
  const kindMap: Record<string, SymbolKind> = {
    // Universal mappings
    function: 'function',
    func: 'function',
    f: 'function',
    method: 'method',
    m: 'method',
    class: 'class',
    c: 'class',
    interface: 'interface',
    i: 'interface',
    type: 'type',
    t: 'type',
    variable: 'variable',
    v: 'variable',
    var: 'variable',
    module: 'module',
    property: 'property',
    p: 'property',
    member: 'property',

    // Python specific
    def: 'function',

    // Go specific
    struct: 'class',
    package: 'module',

    // Rust specific
    impl: 'class',
    trait: 'interface',
    mod: 'module',
    enum: 'type',

    // Java specific
    field: 'property',

    // C/C++ specific
    prototype: 'function',
    macro: 'variable',
    typedef: 'type',
    enumerator: 'variable',
  };

  return kindMap[ctagsKind.toLowerCase()] || null;
}

interface CtagsEntry {
  name: string;
  path: string;
  line: number;
  kind: string;
  scope?: string;
  scopeKind?: string;
  signature?: string;
  end?: number;
  language?: string;
}

/**
 * Parse ctags JSON output
 */
function parseCtagsOutput(output: string): CtagsEntry[] {
  const entries: CtagsEntry[] = [];

  for (const line of output.split('\n')) {
    if (!line.trim()) continue;

    try {
      const entry = JSON.parse(line);
      if (entry.name && entry.line) {
        entries.push({
          name: entry.name,
          path: entry.path || entry.input,
          line: parseInt(entry.line, 10),
          kind: entry.kind || 'unknown',
          scope: entry.scope,
          scopeKind: entry.scopeKind,
          signature: entry.signature,
          end: entry.end ? parseInt(entry.end, 10) : undefined,
          language: entry.language,
        });
      }
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Estimate end line for a symbol based on subsequent symbols
 */
function estimateEndLines(
  entries: CtagsEntry[],
  totalLines: number
): CtagsEntry[] {
  // Sort by line number
  const sorted = [...entries].sort((a, b) => a.line - b.line);

  for (let i = 0; i < sorted.length; i++) {
    if (!sorted[i].end) {
      // Estimate end as line before next symbol, or end of file
      const nextEntry = sorted[i + 1];
      sorted[i].end = nextEntry
        ? Math.max(sorted[i].line, nextEntry.line - 1)
        : totalLines;
    }
  }

  return sorted;
}

export interface CtagsParseResult {
  symbols: ExtractedSymbol[];
  imports: ImportInfo[];
}

/**
 * Parse a file using Universal Ctags
 */
export async function parseWithCtags(
  projectRoot: string,
  filePath: string,
  content: string
): Promise<CtagsParseResult> {
  if (!isCtagsAvailable()) {
    return { symbols: [], imports: [] };
  }

  const ctags = getCtagsPath()!;
  const absolutePath = path.isAbsolute(filePath)
    ? filePath
    : path.join(projectRoot, filePath);

  // Write content to temp file (ctags needs a file to parse)
  const tempDir = os.tmpdir();
  const tempFile = path.join(
    tempDir,
    `ctags-parse-${Date.now()}${path.extname(filePath)}`
  );

  try {
    fs.writeFileSync(tempFile, content, 'utf-8');

    // Run ctags with JSON output
    const result = spawnSync(
      ctags,
      [
        '--output-format=json',
        '--fields=*',
        '--extras=*',
        '-f',
        '-', // Output to stdout
        tempFile,
      ],
      {
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
      }
    );

    if (result.status !== 0) {
      console.warn(`Ctags failed for ${filePath}: ${result.stderr}`);
      return { symbols: [], imports: [] };
    }

    const entries = parseCtagsOutput(result.stdout);
    const totalLines = content.split('\n').length;
    const entriesWithEnd = estimateEndLines(entries, totalLines);

    // Convert to ExtractedSymbol
    const symbols: ExtractedSymbol[] = [];
    const language = detectLanguage(filePath);

    for (const entry of entriesWithEnd) {
      const kind = mapCtagsKind(entry.kind, language);
      if (!kind) continue;

      symbols.push({
        name: entry.name,
        kind,
        startLine: entry.line,
        endLine: entry.end || entry.line,
        signature: entry.signature,
        docComment: undefined, // Ctags doesn't extract doc comments
      });
    }

    // Extract imports using language-specific patterns
    const imports = extractImports(content, language);

    return { symbols, imports };
  } finally {
    // Clean up temp file
    try {
      fs.unlinkSync(tempFile);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Detect language from file extension
 */
function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.rb': 'ruby',
    '.php': 'php',
    '.c': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.cxx': 'cpp',
    '.h': 'c',
    '.hpp': 'cpp',
    '.hxx': 'cpp',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.lua': 'lua',
    '.r': 'r',
    '.R': 'r',
    '.pl': 'perl',
    '.pm': 'perl',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
  };

  return langMap[ext] || 'unknown';
}

/**
 * Extract imports using language-specific patterns
 */
function extractImports(content: string, language: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    let match: RegExpMatchArray | null = null;

    switch (language) {
      case 'python':
        // import module
        match = line.match(/^\s*import\s+(\S+)/);
        if (match) {
          imports.push({
            moduleSpecifier: match[1],
            importedNames: [match[1]],
            isDefault: true,
            line: lineNum,
          });
          continue;
        }
        // from module import names
        match = line.match(/^\s*from\s+(\S+)\s+import\s+(.+)/);
        if (match) {
          const names = match[2]
            .split(',')
            .map((n) => n.trim().split(' as ')[0].trim())
            .filter((n) => n && n !== '*');
          imports.push({
            moduleSpecifier: match[1],
            importedNames: names.length > 0 ? names : ['*'],
            isDefault: false,
            line: lineNum,
          });
        }
        break;

      case 'go':
        // import "package" or import name "package"
        match = line.match(/^\s*import\s+(?:(\w+)\s+)?["']([^"']+)["']/);
        if (match) {
          imports.push({
            moduleSpecifier: match[2],
            importedNames: [match[1] || path.basename(match[2])],
            isDefault: true,
            line: lineNum,
          });
        }
        break;

      case 'rust':
        // use crate::module or use std::collections::HashMap
        match = line.match(/^\s*use\s+([^;{]+)/);
        if (match) {
          const spec = match[1].trim();
          const parts = spec.split('::');
          imports.push({
            moduleSpecifier: spec,
            importedNames: [parts[parts.length - 1]],
            isDefault: false,
            line: lineNum,
          });
        }
        break;

      case 'java':
        // import package.Class
        match = line.match(/^\s*import\s+(?:static\s+)?([^;]+)/);
        if (match) {
          const spec = match[1].trim();
          const parts = spec.split('.');
          imports.push({
            moduleSpecifier: spec,
            importedNames: [parts[parts.length - 1]],
            isDefault: false,
            line: lineNum,
          });
        }
        break;

      case 'ruby':
        // require 'gem' or require_relative 'file'
        match = line.match(/^\s*require(?:_relative)?\s+['"]([^'"]+)['"]/);
        if (match) {
          imports.push({
            moduleSpecifier: match[1],
            importedNames: [path.basename(match[1], path.extname(match[1]))],
            isDefault: true,
            line: lineNum,
          });
        }
        break;

      case 'php':
        // use Namespace\Class
        match = line.match(/^\s*use\s+([^;]+)/);
        if (match) {
          const spec = match[1].trim();
          const parts = spec.split('\\');
          imports.push({
            moduleSpecifier: spec,
            importedNames: [parts[parts.length - 1]],
            isDefault: false,
            line: lineNum,
          });
        }
        break;

      case 'c':
      case 'cpp':
        // #include <header> or #include "header"
        match = line.match(/^\s*#include\s+[<"]([^>"]+)[>"]/);
        if (match) {
          imports.push({
            moduleSpecifier: match[1],
            importedNames: [path.basename(match[1], path.extname(match[1]))],
            isDefault: true,
            line: lineNum,
          });
        }
        break;
    }
  }

  return imports;
}

/**
 * Get supported languages info
 */
export function getSupportedLanguages(): string[] {
  return [
    'Python',
    'Go',
    'Rust',
    'Java',
    'Ruby',
    'PHP',
    'C',
    'C++',
    'C#',
    'Swift',
    'Kotlin',
    'Scala',
    'Lua',
    'R',
    'Perl',
    'Shell/Bash',
    '... and 100+ more via Universal Ctags',
  ];
}
