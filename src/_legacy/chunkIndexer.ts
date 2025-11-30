/**
 * @deprecated Legacy chunk-based indexer for reference.
 * This has been replaced by the symbol-based parser in analysis/parser.ts
 */

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { FileChunk, Embedding } from './vectorStore';

const MAX_CHARS_PER_CHUNK = 1200;

function chunkFile(
  projectId: string,
  relPath: string,
  content: string
): FileChunk[] {
  const lines = content.split('\n');
  const chunks: FileChunk[] = [];

  let current: string[] = [];
  let startLine = 1;
  let length = 0;

  const pushChunk = (endLine: number) => {
    if (current.length === 0) return;
    const text = current.join('\n');
    const id = `${projectId}:${relPath}:${startLine}-${endLine}`;
    chunks.push({
      id,
      projectId,
      filePath: relPath,
      startLine,
      endLine,
      content: text,
    });
    current = [];
    startLine = endLine + 1;
    length = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (length + line.length > MAX_CHARS_PER_CHUNK && current.length > 0) {
      pushChunk(i);
    }
    current.push(line);
    length += line.length;
  }
  if (current.length > 0) {
    pushChunk(lines.length);
  }

  return chunks;
}

export interface EmbedFunction {
  (texts: string[]): Promise<Embedding[]>;
}

export async function buildChunkIndex(
  rootPath: string,
  projectId: string,
  embedFn: EmbedFunction
): Promise<FileChunk[]> {
  const patterns = [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.json',
    '**/*.md',
  ];

  const ignore = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
  ];

  const files = await fg(patterns, {
    cwd: rootPath,
    ignore,
    absolute: true,
  });

  const allChunks: FileChunk[] = [];

  for (const absPath of files) {
    const content = fs.readFileSync(absPath, 'utf8');
    const rel = path.relative(rootPath, absPath);
    const chunks = chunkFile(projectId, rel, content);
    allChunks.push(...chunks);
  }

  // Embed all chunks
  const texts = allChunks.map((c) => c.content);
  const embeddings = await embedFn(texts);

  for (let i = 0; i < allChunks.length; i++) {
    allChunks[i].embedding = embeddings[i];
  }

  return allChunks;
}
