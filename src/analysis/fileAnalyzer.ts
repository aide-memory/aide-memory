/**
 * File-level analysis: language detection, hashing, and metadata extraction
 */

import crypto from 'crypto';
import path from 'path';
import fs from 'fs';

const LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript',
  '.tsx': 'typescript',
  '.js': 'javascript',
  '.jsx': 'javascript',
  '.mjs': 'javascript',
  '.cjs': 'javascript',
  '.json': 'json',
  '.md': 'markdown',
  '.py': 'python',
  '.rs': 'rust',
  '.go': 'go',
  '.java': 'java',
  '.rb': 'ruby',
  '.php': 'php',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.xml': 'xml',
  '.yaml': 'yaml',
  '.yml': 'yaml',
  '.toml': 'toml',
  '.sql': 'sql',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
};

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
  return language === 'typescript' || language === 'javascript';
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
