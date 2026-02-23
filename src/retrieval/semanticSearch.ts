/**
 * Semantic Search Engine
 *
 * Provides vector-based code search using embeddings.
 * Works independently of the project graph -- chunks raw source files,
 * embeds them, and stores vectors in SQLite for fast similarity search.
 *
 * At index time: chunks -> embedding model -> vectors stored in SQLite
 * At query time: query -> embedding model -> cosine similarity -> ranked results
 */

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import crypto from 'crypto';
import { ProjectGraph } from '../brain/projectGraph';
import { EmbeddingRuntime } from '../models/types';
import { chunkFile, Chunk, ChunkerOptions } from '../analysis/chunker';
import { logInfo, logError, logWarn } from '../core/logger';

// ============================================================================
// Types
// ============================================================================

export interface SemanticSearchResult {
  chunkId: string;
  filePath: string;
  content: string;
  startLine: number;
  endLine: number;
  score: number; // cosine similarity
}

export interface SearchOptions {
  /** Number of top results to return (default 10) */
  topK?: number;
  /** Minimum similarity score threshold (default 0.3) */
  minScore?: number;
  /** Restrict search to this file/directory prefix */
  filePath?: string;
}

export interface EmbeddingIndexStats {
  filesIndexed: number;
  chunksCreated: number;
  chunksSkipped: number;
}

export interface SemanticSearchConfig {
  /** Chunks per embedding API call (default 50) */
  batchSize?: number;
  /** Chunker options */
  chunker?: ChunkerOptions;
  /** File patterns to include */
  filePatterns?: string[];
  /** Patterns to ignore */
  ignorePatterns?: string[];
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_TOP_K = 10;
const DEFAULT_MIN_SCORE = 0.3;

const DEFAULT_FILE_PATTERNS = [
  '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
  '**/*.py',
  '**/*.go',
  '**/*.rs',
  '**/*.java',
  '**/*.rb',
  '**/*.c', '**/*.cpp', '**/*.cc', '**/*.h', '**/*.hpp',
  '**/*.json', '**/*.md', '**/*.yaml', '**/*.yml', '**/*.toml',
];

const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**', '**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock',
  '**/.git/**', '**/dist/**', '**/build/**', '**/out/**',
  '**/.turbo/**', '**/.next/**',
  '**/__pycache__/**', '**/.venv/**', '**/venv/**', '**/*.pyc',
  '**/vendor/**', '**/target/**', '**/*.class',
  '**/*.lock', '**/*.log', '**/*.min.js', '**/*.min.css',
  '**/coverage/**', '**/tmp/**', '**/.cache/**',
  '**/orchestration/prompts.ts',
];

// ============================================================================
// Vector Math (pure TypeScript, no native deps)
// ============================================================================

/**
 * Compute cosine similarity between two vectors
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;

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

// ============================================================================
// SemanticSearchEngine
// ============================================================================

export class SemanticSearchEngine {
  private graph: ProjectGraph;
  private embeddingRuntime: EmbeddingRuntime;
  private config: Required<SemanticSearchConfig>;
  private embeddingModelName: string;

  constructor(
    graph: ProjectGraph,
    embeddingRuntime: EmbeddingRuntime,
    embeddingModelName: string,
    config?: SemanticSearchConfig
  ) {
    this.graph = graph;
    this.embeddingRuntime = embeddingRuntime;
    this.embeddingModelName = embeddingModelName;
    this.config = {
      batchSize: config?.batchSize ?? DEFAULT_BATCH_SIZE,
      chunker: config?.chunker ?? {},
      filePatterns: config?.filePatterns ?? DEFAULT_FILE_PATTERNS,
      ignorePatterns: config?.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS,
    };
  }

  /**
   * Index a project's files into embeddings.
   * Reads raw files from disk, chunks them, embeds, and stores in SQLite.
   */
  async indexProject(
    rootPath: string,
    options?: { filePatterns?: string[]; ignorePatterns?: string[] }
  ): Promise<EmbeddingIndexStats> {
    const filePatterns = options?.filePatterns ?? this.config.filePatterns;
    const ignorePatterns = options?.ignorePatterns ?? this.config.ignorePatterns;

    // Walk files
    const files = await fg(filePatterns, {
      cwd: rootPath,
      ignore: ignorePatterns,
      absolute: true,
    });

    logInfo(`Embedding: Found ${files.length} files to process.`);

    // Detect embedding model change — if model changed, clear all old embeddings
    // and force full re-embedding (old vectors have different dimensions/semantics)
    const storedModel = this.graph.getStoredEmbeddingModel();
    if (storedModel && storedModel !== this.embeddingModelName) {
      logInfo(
        `Embedding model changed: ${storedModel} -> ${this.embeddingModelName}. Clearing old embeddings for full re-embed.`
      );
      this.graph.clearEmbeddings();
    }

    const stats: EmbeddingIndexStats = {
      filesIndexed: 0,
      chunksCreated: 0,
      chunksSkipped: 0,
    };

    // Process files and collect chunks
    const allChunks: Chunk[] = [];

    for (const absPath of files) {
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        const relativePath = path.relative(rootPath, absPath);

        // Get existing hashes for this file (for incremental indexing)
        const existingHashes = this.graph.getEmbeddingHashesForFile(relativePath);

        // Chunk the file
        const chunks = chunkFile(relativePath, content, this.config.chunker);

        // Filter out unchanged chunks
        const newChunks: Chunk[] = [];
        for (const chunk of chunks) {
          if (existingHashes.has(chunk.contentHash)) {
            stats.chunksSkipped++;
          } else {
            newChunks.push(chunk);
          }
        }

        if (newChunks.length > 0) {
          // Delete old embeddings for this file before adding new ones
          this.graph.deleteEmbeddingsForFile(relativePath);
          allChunks.push(...chunks); // Re-embed all chunks for the file
          stats.filesIndexed++;
        } else if (chunks.length > 0 && newChunks.length === 0) {
          // All chunks unchanged, skip file
          stats.chunksSkipped += chunks.length;
        }
      } catch (err) {
        logWarn(`Failed to process ${absPath}: ${err}`);
      }
    }

    if (allChunks.length === 0) {
      logInfo('Embedding: No new chunks to embed.');
      return stats;
    }

    logInfo(`Embedding: Processing ${allChunks.length} chunks from ${stats.filesIndexed} files...`);

    // Batch embed and store
    for (let i = 0; i < allChunks.length; i += this.config.batchSize) {
      const batch = allChunks.slice(i, i + this.config.batchSize);
      const texts = batch.map((c) => c.content);

      try {
        const vectors = await this.embeddingRuntime.embed(texts);

        for (let j = 0; j < batch.length; j++) {
          const chunk = batch[j];
          const vec = vectors[j];

          // Skip chunks that failed to embed (empty vector)
          if (!vec || vec.length === 0) {
            continue;
          }

          const vector = new Float32Array(vec);
          const id = this.generateChunkId(chunk.filePath, chunk.startLine, chunk.endLine);

          this.graph.upsertEmbedding({
            id,
            filePath: chunk.filePath,
            content: chunk.content,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            contentHash: chunk.contentHash,
            embedding: vector,
            model: this.embeddingModelName,
          });

          stats.chunksCreated++;
        }

        // Progress logging
        const processed = Math.min(i + this.config.batchSize, allChunks.length);
        if (processed % (this.config.batchSize * 5) === 0 || processed === allChunks.length) {
          logInfo(`  Embedded ${processed}/${allChunks.length} chunks...`);
        }
      } catch (err) {
        logError(`Failed to embed batch starting at index ${i}`, err);
      }
    }

    logInfo(
      `Embedding: Done. ${stats.chunksCreated} chunks created, ${stats.chunksSkipped} unchanged.`
    );

    return stats;
  }

  /**
   * Index a single file
   */
  async indexFile(filePath: string, content: string): Promise<void> {
    const chunks = chunkFile(filePath, content, this.config.chunker);

    if (chunks.length === 0) return;

    // Delete old embeddings for this file
    this.graph.deleteEmbeddingsForFile(filePath);

    // Embed in batches
    for (let i = 0; i < chunks.length; i += this.config.batchSize) {
      const batch = chunks.slice(i, i + this.config.batchSize);
      const texts = batch.map((c) => c.content);

      const vectors = await this.embeddingRuntime.embed(texts);

      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const vector = new Float32Array(vectors[j]);
        const id = this.generateChunkId(chunk.filePath, chunk.startLine, chunk.endLine);

        this.graph.upsertEmbedding({
          id,
          filePath: chunk.filePath,
          content: chunk.content,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          contentHash: chunk.contentHash,
          embedding: vector,
          model: this.embeddingModelName,
        });
      }
    }
  }

  /**
   * Search by natural language query.
   * Embeds the query, then finds the most similar chunks via cosine similarity.
   */
  async search(
    query: string,
    options?: SearchOptions
  ): Promise<SemanticSearchResult[]> {
    const topK = options?.topK ?? DEFAULT_TOP_K;
    const minScore = options?.minScore ?? DEFAULT_MIN_SCORE;
    const filePrefix = options?.filePath;

    // Embed the query
    const [queryVector] = await this.embeddingRuntime.embed([query]);
    const queryVec = new Float32Array(queryVector);

    // Get all stored embeddings
    const allEmbeddings = this.graph.getAllEmbeddings();

    // Compute similarity scores
    const scored: SemanticSearchResult[] = [];

    for (const emb of allEmbeddings) {
      // Apply file path filter
      if (filePrefix && !emb.filePath.startsWith(filePrefix)) {
        continue;
      }

      const score = cosineSimilarity(queryVec, emb.embedding);

      if (score >= minScore) {
        scored.push({
          chunkId: emb.id,
          filePath: emb.filePath,
          content: emb.content,
          startLine: emb.startLine,
          endLine: emb.endLine,
          score,
        });
      }
    }

    // Sort by score descending and take top K
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  /**
   * Check if embeddings exist
   */
  hasEmbeddings(): boolean {
    return this.graph.hasEmbeddings();
  }

  /**
   * Get stats about stored embeddings
   */
  getStats(): { totalChunks: number; totalFiles: number } {
    return this.graph.getEmbeddingStats();
  }

  /**
   * Generate a deterministic chunk ID
   */
  private generateChunkId(filePath: string, startLine: number, endLine: number): string {
    const input = `${filePath}:${startLine}:${endLine}`;
    return 'emb:' + crypto.createHash('sha1').update(input).digest('hex').slice(0, 12);
  }
}
