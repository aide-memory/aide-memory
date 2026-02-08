/**
 * ProjectIndexer
 *
 * Orchestrates the indexing flow:
 * 1. Walk project files
 * 2. Analyze each file with TreeSitterAnalyzer
 * 3. Store results (files, symbols, blocks) to ProjectGraph
 */

import fs from 'fs';
import path from 'path';
import fg from 'fast-glob';
import { ProjectGraph } from '../brain/projectGraph';
import { FileRecord } from '../brain/types';
import {
  TreeSitterAnalyzer,
  isTreeSitterSupported,
  ExtractionResult,
} from '../analysis/treeSitterAnalyzer';
import {
  analyzeFile,
  generateFileId,
  FileInfo,
} from '../analysis/fileAnalyzer';
import { SemanticSearchEngine } from '../retrieval/semanticSearch';
import { logInfo, logError, logWarn } from '../core/logger';

// ============================================================================
// Types
// ============================================================================

export interface IndexStats {
  files: number;
  symbols: number;
  blocks: number;
  relations: number;
}

export interface FileIndexResult {
  symbols: number;
  blocks: number;
  relations: number;
}

export interface IndexerConfig {
  /** File patterns to include */
  filePatterns?: string[];
  /** Patterns to ignore */
  ignorePatterns?: string[];
  /** Show progress every N files */
  progressInterval?: number;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_FILE_PATTERNS = [
  // TypeScript/JavaScript
  '**/*.ts',
  '**/*.tsx',
  '**/*.js',
  '**/*.jsx',
  // Python
  '**/*.py',
  // Go
  '**/*.go',
  // Rust
  '**/*.rs',
  // Java
  '**/*.java',
  // Ruby
  '**/*.rb',
  // C/C++
  '**/*.c',
  '**/*.cpp',
  '**/*.cc',
  '**/*.cxx',
  '**/*.h',
  '**/*.hpp',
  // Config/Doc files
  '**/*.json',
  '**/*.md',
  '**/*.yaml',
  '**/*.yml',
  '**/*.toml',
];

const DEFAULT_IGNORE_PATTERNS = [
  '**/node_modules/**',
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/yarn.lock',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.turbo/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/*.pyc',
  '**/*.egg-info/**',
  '**/vendor/**',
  '**/target/**',
  '**/*.class',
  '**/*.lock',
  '**/*.log',
  '**/*.min.js',
  '**/*.min.css',
  '**/coverage/**',
  '**/tmp/**',
  '**/.cache/**',
];

// ============================================================================
// ProjectIndexer
// ============================================================================

export class ProjectIndexer {
  private graph: ProjectGraph;
  private analyzer: TreeSitterAnalyzer;
  private config: Required<IndexerConfig>;
  private initialized = false;
  private searchEngine?: SemanticSearchEngine;

  constructor(graph: ProjectGraph, config: IndexerConfig = {}, searchEngine?: SemanticSearchEngine) {
    this.graph = graph;
    this.analyzer = new TreeSitterAnalyzer();
    this.searchEngine = searchEngine;
    this.config = {
      filePatterns: config.filePatterns ?? DEFAULT_FILE_PATTERNS,
      ignorePatterns: config.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS,
      progressInterval: config.progressInterval ?? 50,
    };
  }

  /**
   * Initialize the analyzer (loads Tree-sitter WASM)
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.analyzer.initialize();
    this.initialized = true;
  }

  /**
   * Index all files in a project
   */
  async indexAll(rootPath: string, projectId: string): Promise<IndexStats> {
    await this.initialize();

    const files = await this.walkFiles(rootPath);
    logInfo(`Found ${files.length} files to index.`);

    const stats: IndexStats = { files: 0, symbols: 0, blocks: 0, relations: 0 };

    for (const absPath of files) {
      try {
        const result = await this.indexFile(rootPath, absPath, projectId);
        stats.files++;
        stats.symbols += result.symbols;
        stats.blocks += result.blocks;
        stats.relations += result.relations;

        // Progress indicator
        if (stats.files % this.config.progressInterval === 0) {
          logInfo(
            `  Processed ${stats.files} files, ${stats.symbols} symbols, ${stats.blocks} blocks...`
          );
        }
      } catch (err) {
        logError(`Failed to index ${absPath}`, err);
      }
    }

    // Generate embeddings if a semantic search engine is available
    if (this.searchEngine) {
      logInfo('Generating embeddings from raw source files...');
      try {
        const embeddingStats = await this.searchEngine.indexProject(rootPath, {
          filePatterns: this.config.filePatterns,
          ignorePatterns: this.config.ignorePatterns,
        });
        logInfo(
          `Embeddings: ${embeddingStats.chunksCreated} chunks from ${embeddingStats.filesIndexed} files (${embeddingStats.chunksSkipped} unchanged)`
        );
      } catch (err) {
        logError('Failed to generate embeddings', err);
      }
    }

    return stats;
  }

  /**
   * Index a single file
   */
  async indexFile(
    rootPath: string,
    absPath: string,
    projectId: string
  ): Promise<FileIndexResult> {
    await this.initialize();

    const fileInfo = analyzeFile(rootPath, absPath);
    if (!fileInfo) {
      return { symbols: 0, blocks: 0, relations: 0 };
    }

    const fileId = generateFileId(projectId, fileInfo.relativePath);

    // Store file record
    const fileRecord: FileRecord = {
      id: fileId,
      path: fileInfo.relativePath,
      language: fileInfo.language,
      contentHash: fileInfo.contentHash,
      indexedAt: new Date().toISOString(),
    };
    this.graph.upsertFile(fileRecord);

    // Check if language is supported for Tree-sitter analysis
    if (!isTreeSitterSupported(fileInfo.language)) {
      return { symbols: 0, blocks: 0, relations: 0 };
    }

    // Analyze with Tree-sitter
    let result: ExtractionResult;
    try {
      result = await this.analyzer.analyze(
        fileInfo.content,
        fileInfo.language,
        fileId
      );
    } catch (err) {
      // Tree-sitter parsing failed - log but continue
      logWarn(`Tree-sitter analysis failed for ${fileInfo.relativePath}`);
      return { symbols: 0, blocks: 0, relations: 0 };
    }

    // Create a map of (startLine) -> symbolId for linking blocks to symbols
    const lineToSymbolId = new Map<number, string>();

    // Store symbols
    for (const sym of result.symbols) {
      const symbolId = TreeSitterAnalyzer.generateSymbolId(
        fileId,
        sym.name,
        sym.kind,
        sym.startLine
      );

      this.graph.upsertSymbol({
        id: symbolId,
        fileId,
        name: sym.name,
        kind: sym.kind,
        startLine: sym.startLine,
        endLine: sym.endLine,
        signature: sym.signature,
        docComment: sym.docComment,
      });

      // Track for block linking
      lineToSymbolId.set(sym.startLine, symbolId);
    }

    // Store ContentBlocks
    // Link blocks to symbols when they share the same start line
    for (const block of result.blocks) {
      const symbolId = lineToSymbolId.get(block.startLine);
      if (symbolId && block.kind === 'code') {
        // Link this block to its symbol
        block.symbolId = symbolId;
      }
      this.graph.upsertBlock(block);
    }

    // Store relations (if any from Tree-sitter analysis)
    for (const relation of result.relations) {
      this.graph.addRelation(relation);
    }

    return {
      symbols: result.symbols.length,
      blocks: result.blocks.length,
      relations: result.relations.length,
    };
  }

  /**
   * Reindex a single file (clears old data first)
   */
  async reindexFile(
    rootPath: string,
    absPath: string,
    projectId: string
  ): Promise<FileIndexResult> {
    const relativePath = path.relative(rootPath, absPath);
    const fileId = generateFileId(projectId, relativePath);

    // Clear old data for this file
    this.graph.deleteBlocksForFile(fileId);
    this.graph.deleteSymbolsForFile(fileId);

    // Re-index
    return this.indexFile(rootPath, absPath, projectId);
  }

  /**
   * Delete a file from the index
   */
  deleteFile(rootPath: string, absPath: string, projectId: string): void {
    const relativePath = path.relative(rootPath, absPath);
    const fileId = generateFileId(projectId, relativePath);

    this.graph.deleteBlocksForFile(fileId);
    this.graph.deleteSymbolsForFile(fileId);
    this.graph.deleteFile(fileId);
  }

  /**
   * Walk project files using fast-glob
   */
  private async walkFiles(rootPath: string): Promise<string[]> {
    return fg(this.config.filePatterns, {
      cwd: rootPath,
      ignore: this.config.ignorePatterns,
      absolute: true,
    });
  }
}
