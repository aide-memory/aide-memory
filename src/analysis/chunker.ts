/**
 * Raw File Chunker
 *
 * Part of the analysis/indexing pipeline (NOT retrieval).
 * Reads raw source files and produces chunks for embedding.
 * Works independently of tree-sitter and the project graph.
 *
 * Chunking approach:
 * 1. Split on natural boundaries (function/class declarations via regex)
 * 2. If a chunk exceeds maxTokensPerChunk, split at logical line breaks
 * 3. Small adjacent chunks (< 50 tokens) are merged with neighbors
 * 4. Each chunk gets a few lines of overlap with the next for context
 */

import crypto from 'crypto';

// ============================================================================
// Types
// ============================================================================

export interface Chunk {
  content: string;
  filePath: string;
  startLine: number;
  endLine: number;
  contentHash: string;
}

export interface ChunkerOptions {
  /** Max tokens per chunk (default 512) */
  maxTokensPerChunk?: number;
  /** Lines of overlap between chunks (default 2) */
  overlap?: number;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_MAX_TOKENS = 256;
const DEFAULT_OVERLAP = 2;
const MIN_CHUNK_TOKENS = 50;

/**
 * Regex patterns for natural code boundaries.
 * Matches the start of function/class/interface/type declarations.
 */
const BOUNDARY_PATTERNS = [
  // TypeScript/JavaScript
  /^(?:export\s+)?(?:async\s+)?(?:function|class|interface|type|enum|const|let|var)\s+\w+/,
  /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function/,
  /^(?:export\s+)?(?:abstract\s+)?class\s+/,
  // Python
  /^(?:def|class|async\s+def)\s+\w+/,
  // Go
  /^func\s+(?:\(\w+\s+\*?\w+\)\s+)?\w+/,
  /^type\s+\w+\s+(?:struct|interface)/,
  // Rust
  /^(?:pub\s+)?(?:fn|struct|enum|trait|impl|mod)\s+/,
  /^(?:pub\s+)?(?:async\s+)?fn\s+/,
  // Java/C++
  /^(?:public|private|protected|static|abstract|final|virtual)\s+.*(?:class|interface|void|int|String|boolean)\s+\w+/,
  // Ruby
  /^(?:def|class|module)\s+\w+/,
  // C/C++ function definitions
  /^(?:\w+\s+)+\w+\s*\([^)]*\)\s*\{?\s*$/,
  // Markdown headers
  /^#{1,3}\s+/,
];

// ============================================================================
// Chunker
// ============================================================================

/**
 * Estimate token count for text (~4 chars per token)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Generate content hash for change detection
 */
function hashContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
}

/**
 * Check if a line matches a natural code boundary
 */
function isBoundary(line: string): boolean {
  const trimmed = line.trimStart();
  return BOUNDARY_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * Chunk a single file's content into semantically meaningful pieces
 */
export function chunkFile(
  filePath: string,
  content: string,
  options?: ChunkerOptions
): Chunk[] {
  const maxTokens = options?.maxTokensPerChunk ?? DEFAULT_MAX_TOKENS;
  const overlap = options?.overlap ?? DEFAULT_OVERLAP;

  const lines = content.split('\n');

  if (lines.length === 0) {
    return [];
  }

  // Step 1: Find natural boundary lines
  const boundaries: number[] = [0]; // Always start at line 0
  for (let i = 1; i < lines.length; i++) {
    if (isBoundary(lines[i])) {
      boundaries.push(i);
    }
  }

  // Step 2: Create initial chunks from boundaries
  const rawChunks: Array<{ startLine: number; endLine: number; content: string }> = [];

  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i];
    const end = i + 1 < boundaries.length ? boundaries[i + 1] - 1 : lines.length - 1;
    const chunkContent = lines.slice(start, end + 1).join('\n');

    rawChunks.push({
      startLine: start + 1, // 1-indexed
      endLine: end + 1,
      content: chunkContent,
    });
  }

  // Step 3: Split oversized chunks
  const splitChunks: typeof rawChunks = [];
  for (const chunk of rawChunks) {
    if (estimateTokens(chunk.content) <= maxTokens) {
      splitChunks.push(chunk);
    } else {
      // Split at logical line breaks within the chunk
      const chunkLines = chunk.content.split('\n');
      let currentLines: string[] = [];
      let currentStart = chunk.startLine;

      for (let i = 0; i < chunkLines.length; i++) {
        currentLines.push(chunkLines[i]);
        const currentContent = currentLines.join('\n');

        if (estimateTokens(currentContent) >= maxTokens && currentLines.length > 1) {
          // Emit chunk without last line
          const emitLines = currentLines.slice(0, -1);
          splitChunks.push({
            startLine: currentStart,
            endLine: currentStart + emitLines.length - 1,
            content: emitLines.join('\n'),
          });

          // Start new chunk with overlap
          const overlapStart = Math.max(0, emitLines.length - overlap);
          currentLines = [...currentLines.slice(overlapStart)];
          currentStart = currentStart + overlapStart;
        }
      }

      // Emit remaining
      if (currentLines.length > 0) {
        splitChunks.push({
          startLine: currentStart,
          endLine: currentStart + currentLines.length - 1,
          content: currentLines.join('\n'),
        });
      }
    }
  }

  // Step 4: Merge small adjacent chunks
  const mergedChunks: typeof rawChunks = [];
  let pending: typeof rawChunks[0] | null = null;

  for (const chunk of splitChunks) {
    if (!pending) {
      pending = { ...chunk };
      continue;
    }

    if (estimateTokens(pending.content) < MIN_CHUNK_TOKENS) {
      // Merge with next
      pending = {
        startLine: pending.startLine,
        endLine: chunk.endLine,
        content: pending.content + '\n' + chunk.content,
      };
    } else {
      mergedChunks.push(pending);
      pending = { ...chunk };
    }
  }

  if (pending) {
    // If the last pending chunk is too small, merge with the previous one
    if (
      estimateTokens(pending.content) < MIN_CHUNK_TOKENS &&
      mergedChunks.length > 0
    ) {
      const last = mergedChunks[mergedChunks.length - 1];
      mergedChunks[mergedChunks.length - 1] = {
        startLine: last.startLine,
        endLine: pending.endLine,
        content: last.content + '\n' + pending.content,
      };
    } else {
      mergedChunks.push(pending);
    }
  }

  // Step 5: Convert to Chunk objects with hashes
  return mergedChunks.map((chunk) => ({
    content: chunk.content,
    filePath,
    startLine: chunk.startLine,
    endLine: chunk.endLine,
    contentHash: hashContent(chunk.content),
  }));
}
