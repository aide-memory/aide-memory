import type Database from 'better-sqlite3';

const EMBEDDINGS_TABLE = `
CREATE TABLE IF NOT EXISTS embeddings (
  uuid TEXT PRIMARY KEY,
  vector BLOB NOT NULL,
  dimensions INTEGER NOT NULL
);
`;

/**
 * Cosine similarity between two vectors.
 * Returns a value in [-1, 1] where 1 = identical direction.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Convert a Float32Array to a Buffer for SQLite BLOB storage.
 */
export function vectorToBuffer(vector: Float32Array): Buffer {
  return Buffer.from(vector.buffer, vector.byteOffset, vector.byteLength);
}

/**
 * Convert a Buffer (from SQLite BLOB) back to Float32Array.
 */
export function bufferToVector(buf: Buffer): Float32Array {
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return new Float32Array(arrayBuffer);
}

/**
 * Ensure the embeddings table exists in the given database.
 */
export function ensureEmbeddingsTable(db: Database.Database): void {
  db.exec(EMBEDDINGS_TABLE);
}

export interface EmbeddingBackend {
  initialize(): Promise<boolean>;
  isReady(): boolean;
  generateEmbedding(text: string): Promise<Float32Array | null>;
}

/**
 * Hugging Face Transformers backend using @huggingface/transformers.
 * Dynamically imported so the module is optional.
 */
export class TransformersBackend implements EmbeddingBackend {
  private pipeline: any = null;
  private ready = false;

  constructor(private modelName: string = 'Xenova/bge-small-en-v1.5') {}

  async initialize(): Promise<boolean> {
    try {
      // @ts-ignore -- optional dependency, dynamically imported for graceful degradation
      const { pipeline, env } = await import('@huggingface/transformers');
      // Point cache to ~/.cache/aide-memory/models/
      const os = await import('os');
      const path = await import('path');
      env.cacheDir = path.join(os.homedir(), '.cache', 'aide-memory', 'models');

      this.pipeline = await pipeline('feature-extraction', this.modelName, {
        dtype: 'fp32',
      });
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async generateEmbedding(text: string): Promise<Float32Array | null> {
    if (!this.ready || !this.pipeline) return null;

    try {
      const output = await this.pipeline(text, { pooling: 'mean', normalize: true });
      return new Float32Array(output.data);
    } catch {
      return null;
    }
  }
}

/**
 * Ollama backend that calls the local Ollama API for embeddings.
 * Fallback when @huggingface/transformers is not available.
 */
export class OllamaBackend implements EmbeddingBackend {
  private ready = false;

  constructor(
    private model: string = 'nomic-embed-text',
    private baseUrl: string = 'http://localhost:11434',
  ) {}

  async initialize(): Promise<boolean> {
    try {
      // Quick health check — just see if Ollama is running
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        this.ready = false;
        return false;
      }
      this.ready = true;
      return true;
    } catch {
      this.ready = false;
      return false;
    }
  }

  isReady(): boolean {
    return this.ready;
  }

  async generateEmbedding(text: string): Promise<Float32Array | null> {
    if (!this.ready) return null;

    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.model, prompt: text }),
      });

      if (!response.ok) return null;

      const data = (await response.json()) as { embedding?: number[] };
      if (!data.embedding || !Array.isArray(data.embedding)) return null;

      return new Float32Array(data.embedding);
    } catch {
      return null;
    }
  }
}

/**
 * EmbeddingService — semantic search via local embeddings.
 *
 * Supports pluggable backends (Transformers.js or Ollama).
 * The service is OPTIONAL: the store and search work fine without it.
 * Embeddings supplement FTS5/LIKE search when available.
 */
export class EmbeddingService {
  private backend: EmbeddingBackend | null = null;
  private _ready = false;

  constructor(private preferredBackend?: EmbeddingBackend) {}

  /**
   * Initialize the embedding service. Tries the preferred backend first,
   * then falls back to Transformers, then Ollama.
   * Returns false if no backend is available (graceful degradation).
   */
  async initialize(): Promise<boolean> {
    // If caller specified an explicit preferredBackend (via
    // `embeddings.backend=transformers` or `=ollama` in config, constructed
    // by MemoryStore at startup), use THAT and nothing else. Don't silently
    // fall through to other backends — per spec (memory #309), explicit
    // values should fail loudly so the user can tell semantic search isn't
    // working because their chosen backend isn't installed/reachable.
    if (this.preferredBackend) {
      const ok = await this.preferredBackend.initialize();
      if (ok) {
        this.backend = this.preferredBackend;
        this._ready = true;
        return true;
      }
      // Preferred backend failed — stay un-ready. Semantic search will be
      // disabled (keyword/FTS5 still works). Caller can check isReady().
      this._ready = false;
      return false;
    }

    // 'auto' (no preferred backend): try the built-in chain.
    const transformers = new TransformersBackend();
    const transformersOk = await transformers.initialize();
    if (transformersOk) {
      this.backend = transformers;
      this._ready = true;
      return true;
    }

    const ollama = new OllamaBackend();
    const ollamaOk = await ollama.initialize();
    if (ollamaOk) {
      this.backend = ollama;
      this._ready = true;
      return true;
    }

    this._ready = false;
    return false;
  }

  isReady(): boolean {
    return this._ready;
  }

  async generateEmbedding(text: string): Promise<Float32Array | null> {
    if (!this._ready || !this.backend) return null;
    return this.backend.generateEmbedding(text);
  }

  /**
   * Store an embedding vector in the database.
   */
  storeEmbedding(db: Database.Database, uuid: string, vector: Float32Array): void {
    ensureEmbeddingsTable(db);
    const buf = vectorToBuffer(vector);
    db.prepare(
      'INSERT OR REPLACE INTO embeddings (uuid, vector, dimensions) VALUES (?, ?, ?)'
    ).run(uuid, buf, vector.length);
  }

  /**
   * Retrieve an embedding vector from the database.
   */
  getEmbedding(db: Database.Database, uuid: string): Float32Array | null {
    ensureEmbeddingsTable(db);
    const row = db.prepare('SELECT vector FROM embeddings WHERE uuid = ?').get(uuid) as
      | { vector: Buffer }
      | undefined;
    if (!row) return null;
    return bufferToVector(row.vector);
  }

  /**
   * Remove an embedding from the database.
   */
  removeEmbedding(db: Database.Database, uuid: string): boolean {
    ensureEmbeddingsTable(db);
    const result = db.prepare('DELETE FROM embeddings WHERE uuid = ?').run(uuid);
    return result.changes > 0;
  }

  /**
   * Semantic search: embed the query, compute cosine similarity against all
   * stored embeddings, return the top-N results sorted by score.
   */
  async semanticSearch(
    db: Database.Database,
    query: string,
    limit: number = 10,
  ): Promise<{ uuid: string; score: number }[]> {
    if (!this._ready || !this.backend) return [];

    const queryVector = await this.backend.generateEmbedding(query);
    if (!queryVector) return [];

    return this.semanticSearchWithVector(db, queryVector, limit);
  }

  /**
   * Semantic search using a pre-computed query vector.
   * Useful for testing without a real model.
   */
  semanticSearchWithVector(
    db: Database.Database,
    queryVector: Float32Array,
    limit: number = 10,
  ): { uuid: string; score: number }[] {
    ensureEmbeddingsTable(db);

    const rows = db.prepare('SELECT uuid, vector FROM embeddings').all() as {
      uuid: string;
      vector: Buffer;
    }[];

    const scored: { uuid: string; score: number }[] = [];

    for (const row of rows) {
      const stored = bufferToVector(row.vector);
      if (stored.length !== queryVector.length) continue;
      const score = cosineSimilarity(queryVector, stored);
      scored.push({ uuid: row.uuid, score });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }
}
