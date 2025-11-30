/**
 * @deprecated Legacy in-memory vector store for reference.
 * Kept for potential future use as optional/secondary retrieval method.
 */

export type Embedding = number[];

export interface FileChunk {
  id: string;
  projectId: string;
  filePath: string;
  startLine: number;
  endLine: number;
  content: string;
  embedding?: Embedding;
}

export interface VectorStore {
  upsert(chunks: FileChunk[]): Promise<void>;
  query(embedding: Embedding, k: number): Promise<FileChunk[]>;
}

function cosineSimilarity(a: Embedding, b: Embedding): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class InMemoryVectorStore implements VectorStore {
  private chunks: FileChunk[] = [];

  async upsert(chunks: FileChunk[]): Promise<void> {
    this.chunks = chunks;
  }

  async query(embedding: Embedding, k: number): Promise<FileChunk[]> {
    const scored = this.chunks
      .filter((c) => c.embedding && c.embedding.length === embedding.length)
      .map((c) => ({
        chunk: c,
        score: cosineSimilarity(embedding, c.embedding as Embedding),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((s) => s.chunk);

    return scored;
  }

  getAllChunks(): FileChunk[] {
    return this.chunks;
  }
}
