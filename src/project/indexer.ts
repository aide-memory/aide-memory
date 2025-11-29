import fs from 'fs';
import path from 'path';
import { FileChunk, ModelRuntime, ProjectConfig } from '../core/types';
import { findProjectFiles } from './fileWalker';
import { InMemoryVectorStore } from '../memory/vectorStore';
import { saveProjectIndex } from '../memory/projectStore';
import { logInfo } from '../core/logger';

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

export async function buildProjectIndex(
  config: ProjectConfig,
  model: ModelRuntime
): Promise<{ store: InMemoryVectorStore; chunks: FileChunk[] }> {
  const files = await findProjectFiles(config.rootPath);
  logInfo(`Found ${files.length} files to index.`);

  const allChunks: FileChunk[] = [];

  for (const absPath of files) {
    const content = fs.readFileSync(absPath, 'utf8');
    const rel = path.relative(config.rootPath, absPath);
    const chunks = chunkFile(config.id, rel, content);
    allChunks.push(...chunks);
  }

  logInfo(`Created ${allChunks.length} chunks. Embedding...`);

  const texts = allChunks.map((c) => c.content);
  const embeddings = await model.embed(texts);

  for (let i = 0; i < allChunks.length; i++) {
    allChunks[i].embedding = embeddings[i];
  }

  const store = new InMemoryVectorStore();
  await store.upsert(allChunks);

  await saveProjectIndex(config.id, allChunks);
  logInfo(`Saved index with ${allChunks.length} chunks.`);

  return { store, chunks: allChunks };
}
