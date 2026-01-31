/**
 * File-level analysis: language detection, hashing, and metadata extraction
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const LANGUAGE_MAP: Record<string, string> = {
  // TypeScript/JavaScript
  '.ts': 'typescript',
  '.tsx': 'tsx',
  '.js': 'javascript',
  '.jsx': 'jsx',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  // Python
  '.py': 'python',
  '.pyw': 'python',
  '.pyi': 'python',
  // Go
  '.go': 'go',
  // Rust
  '.rs': 'rust',
  // Java
  '.java': 'java',
  // Ruby
  '.rb': 'ruby',
  '.rake': 'ruby',
  // PHP
  '.php': 'php',
  // C/C++
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.cc': 'cpp',
  '.cxx': 'cpp',
  '.hpp': 'cpp',
  '.hxx': 'cpp',
  // C#
  '.cs': 'csharp',
  // Swift
  '.swift': 'swift',
  // Kotlin
  '.kt': 'kotlin',
  '.kts': 'kotlin',
  // Scala
  '.scala': 'scala',
  // Lua
  '.lua': 'lua',
  // R
  '.r': 'r',
  '.R': 'r',
  // Perl
  '.pl': 'perl',
  '.pm': 'perl',
  // Shell
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  // Config/Data
  '.json': 'json',
  '.md': 'markdown',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  // Web
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  // Other
  '.sql': 'sql',
};

// Languages that support symbol extraction (via ts-morph or ctags)
const PROGRAMMING_LANGUAGES = new Set([
  'typescript',
  'tsx',
  'javascript',
  'jsx',
  'python',
  'go',
  'rust',
  'java',
  'ruby',
  'php',
  'c',
  'cpp',
  'csharp',
  'swift',
  'kotlin',
  'scala',
  'lua',
  'r',
  'perl',
  'shell',
]);

export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return LANGUAGE_MAP[ext] || 'unknown';
}

export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

export function generateFileId(
  projectId: string,
  relativePath: string
): string {
  const hash = crypto
    .createHash('sha1')
    .update(`${projectId}:${relativePath}`)
    .digest('hex')
    .slice(0, 12);
  return `file:${hash}`;
}

export function isTypeScriptOrJavaScript(language: string): boolean {
  return language === 'typescript' || language === 'tsx' || language === 'javascript' || language === 'jsx';
}

export function isProgrammingLanguage(language: string): boolean {
  return PROGRAMMING_LANGUAGES.has(language);
}

export function isConfigFile(filePath: string): boolean {
  const name = path.basename(filePath).toLowerCase();
  const configPatterns = [
    /^\..*rc$/,
    /^\..*rc\.(js|ts|json|yaml|yml)$/,
    /config\.(js|ts|json|yaml|yml)$/,
    /^tsconfig.*\.json$/,
    /^package\.json$/,
    /^\.env/,
    /^dockerfile$/i,
    /^docker-compose/,
    /^\.gitignore$/,
    /^\.eslintrc/,
    /^\.prettierrc/,
  ];
  return configPatterns.some((pattern) => pattern.test(name));
}

export function isTestFile(filePath: string): boolean {
  const testPatterns = [
    /\.test\.(ts|tsx|js|jsx)$/,
    /\.spec\.(ts|tsx|js|jsx)$/,
    /__tests__\//,
    /\/test\//,
    /\.test$/,
  ];
  return testPatterns.some((pattern) => pattern.test(filePath));
}

export interface FileInfo {
  relativePath: string;
  absolutePath: string;
  language: string;
  contentHash: string;
  content: string;
  isConfig: boolean;
  isTest: boolean;
}

export function analyzeFile(
  projectRoot: string,
  absolutePath: string
): FileInfo | null {
  try {
    const content = fs.readFileSync(absolutePath, 'utf8');
    const relativePath = path.relative(projectRoot, absolutePath);
    const language = detectLanguage(absolutePath);

    return {
      relativePath,
      absolutePath,
      language,
      contentHash: computeContentHash(content),
      content,
      isConfig: isConfigFile(relativePath),
      isTest: isTestFile(relativePath),
    };
  } catch (err) {
    // File might be binary or unreadable
    return null;
  }
}
