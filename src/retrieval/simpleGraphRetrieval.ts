/**
 * SimpleGraphRetrieval
 *
 * Default retrieval strategy using BFS graph traversal.
 * - No tool calls, no LLM planning
 * - Cheap, deterministic, always works
 * - Good baseline for all models
 */

import {
  RetrievalStrategy,
  RetrievalResult,
  RetrievalConfig,
  DEFAULT_RETRIEVAL_CONFIG,
} from './types';
import {
  SymbolRecord,
  ContentBlock,
  FileRecord,
  Relation,
  RetrievalQuery,
} from '../brain/types';
import { ProjectGraph } from '../brain/projectGraph';
import { TokenBudgetManager } from '../core/tokenBudget';
import { verbose as verboseUI } from '../cli/ui';

// ============================================================================
// SimpleGraphRetrieval
// ============================================================================

export interface SimpleRetrievalOptions {
  /** Log retrieval steps */
  verbose?: boolean;
}

export class SimpleGraphRetrieval implements RetrievalStrategy {
  private config: RetrievalConfig;
  private budget: TokenBudgetManager;
  private verbose: boolean;

  constructor(
    config: Partial<RetrievalConfig> = {},
    budget?: TokenBudgetManager,
    options?: SimpleRetrievalOptions
  ) {
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
    this.budget = budget || new TokenBudgetManager(this.config.tokenBudget);
    this.verbose = options?.verbose ?? false;
  }

  private log(message: string): void {
    if (this.verbose) {
      verboseUI.info(message);
    }
  }

  async retrieve(
    query: RetrievalQuery,
    graph: ProjectGraph
  ): Promise<RetrievalResult> {
    this.log(`Retrieving context for: "${query.question}"`);

    // 1. Find seed symbols from question
    const seeds = this.findSeeds(query, graph);
    this.log(
      `Found ${seeds.length} seed symbols: ${
        seeds.map((s) => s.name).join(', ') || '(none)'
      }`
    );

    // 2. Expand via BFS
    const expanded = this.expandBFS(seeds, graph);
    this.log(
      `Expanded to ${expanded.length} symbols via BFS (depth=${this.config.maxDepth})`
    );

    // 3. Get blocks for expanded symbols
    const blocks = this.getBlocks(expanded, graph);
    this.log(`Retrieved ${blocks.length} code blocks`);

    // 4. Resolve files
    const files = this.resolveFiles(expanded, graph);
    this.log(
      `From ${files.length} files: ${
        files.map((f) => f.path).join(', ') || '(none)'
      }`
    );

    // 5. Get relations
    const relations = this.getRelations(expanded, graph);
    this.log(`Found ${relations.length} relations`);

    // 6. Trim to token budget
    const trimmed = this.trimToBudget(expanded, blocks, files, relations);
    const tokenEstimate = this.estimateTokens(trimmed.blocks);
    this.log(
      `Trimmed to budget: ${trimmed.symbols.length} symbols, ${trimmed.blocks.length} blocks (~${tokenEstimate} tokens)`
    );

    return {
      ...trimmed,
      strategy: 'simple',
      tokenEstimate,
      // Simple retrieval has no conversation context
      conversationContext: undefined,
    };
  }

  /**
   * Find seed symbols from query
   */
  private findSeeds(
    query: RetrievalQuery,
    graph: ProjectGraph
  ): SymbolRecord[] {
    const seeds: SymbolRecord[] = [];
    const seenIds = new Set<string>();

    // Add focus symbols if provided
    if (query.focusSymbolIds) {
      for (const id of query.focusSymbolIds) {
        const symbol = graph.getSymbol(id);
        if (symbol && !seenIds.has(symbol.id)) {
          seeds.push(symbol);
          seenIds.add(symbol.id);
        }
      }
    }

    // Add symbols from focus files
    if (query.focusFileIds) {
      for (const fileId of query.focusFileIds) {
        const symbols = graph.getSymbolsForFile(fileId);
        for (const sym of symbols.slice(0, 5)) {
          if (!seenIds.has(sym.id)) {
            seeds.push(sym);
            seenIds.add(sym.id);
          }
        }
      }
    }

    // NEW: Score directories by keyword relevance first
    const dirScores = this.scoreDirectories(query.question, graph);
    if (dirScores.size > 0) {
      const topDirs = [...dirScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);
      this.log(
        `Top directories: ${topDirs.map(([d, s]) => `${d}(${s})`).join(', ')}`
      );

      // Add symbols from relevant directories FIRST
      const relevantFiles = this.getRelevantFiles(dirScores, graph);
      for (const file of relevantFiles.slice(0, 5)) {
        const symbols = graph.getSymbolsForFile(file.id);
        for (const sym of symbols.slice(0, 3)) {
          if (!seenIds.has(sym.id)) {
            seeds.push(sym);
            seenIds.add(sym.id);
          }
        }
      }
    }

    // Extract potential symbol names from question
    const names = this.extractSymbolNames(query.question);

    for (const name of names) {
      // Try exact match
      const exactMatches = graph.findSymbols({ name });
      for (const match of exactMatches.slice(0, 5)) {
        if (!seenIds.has(match.id)) {
          seeds.push(match);
          seenIds.add(match.id);
        }
      }

      // Try pattern match
      if (exactMatches.length === 0) {
        const patternMatches = graph.findSymbols({ namePattern: name });
        for (const match of patternMatches.slice(0, 5)) {
          if (!seenIds.has(match.id)) {
            seeds.push(match);
            seenIds.add(match.id);
          }
        }
      }

      // Try file path match
      if (exactMatches.length === 0) {
        const files = graph.findFiles({ pathPattern: `*${name}*` });
        for (const file of files.slice(0, 3)) {
          const fileSymbols = graph.getSymbolsForFile(file.id);
          for (const sym of fileSymbols.slice(0, 3)) {
            if (!seenIds.has(sym.id)) {
              seeds.push(sym);
              seenIds.add(sym.id);
            }
          }
        }
      }
    }

    // Fallback: If no seeds found from symbol names, search code content
    if (seeds.length === 0) {
      this.log('No seeds from symbol names, falling back to content search');
      const contentSeeds = this.findSeedsFromContent(
        query.question,
        graph,
        seenIds
      );
      for (const sym of contentSeeds) {
        seeds.push(sym);
        seenIds.add(sym.id);
      }
    }

    return seeds;
  }

  /**
   * Find seeds by searching code content (fallback when symbol name search fails)
   */
  private findSeedsFromContent(
    question: string,
    graph: ProjectGraph,
    seenIds: Set<string>
  ): SymbolRecord[] {
    const seeds: SymbolRecord[] = [];

    // Extract meaningful terms from the question (skip very short or common words)
    const terms = this.extractSearchTerms(question);

    for (const term of terms.slice(0, 3)) {
      // Search code content for this term
      const blocks = graph.searchBlocks(term, ['code', 'comment']);

      // Get symbols associated with these blocks
      for (const block of blocks.slice(0, 5)) {
        if (block.symbolId) {
          const symbol = graph.getSymbol(block.symbolId);
          if (symbol && !seenIds.has(symbol.id)) {
            seeds.push(symbol);
            seenIds.add(symbol.id);
          }
        } else {
          // Block has no direct symbol - get symbols from the same file
          const fileSymbols = graph.getSymbolsForFile(block.fileId);
          // Find symbol that contains this block's lines
          for (const sym of fileSymbols) {
            if (
              !seenIds.has(sym.id) &&
              sym.startLine <= block.startLine &&
              sym.endLine >= block.endLine
            ) {
              seeds.push(sym);
              seenIds.add(sym.id);
              break; // One symbol per block
            }
          }
        }
      }

      // Found enough seeds, stop searching
      if (seeds.length >= 5) break;
    }

    if (seeds.length > 0) {
      this.log(`Found ${seeds.length} seeds from content search`);
    }

    return seeds;
  }

  /**
   * Extract search terms from question for content search
   */
  private extractSearchTerms(question: string): string[] {
    const terms: string[] = [];

    // Split into words and filter
    const words = question.toLowerCase().split(/\s+/);

    for (const word of words) {
      // Skip short words and common words
      if (word.length < 4) continue;
      if (this.isCommonWord(word)) continue;

      // Clean punctuation
      const clean = word.replace(/[^a-z0-9_]/g, '');
      if (clean.length >= 3) {
        terms.push(clean);
      }
    }

    return [...new Set(terms)];
  }

  /**
   * Score directories by keyword relevance (no LLM, deterministic)
   * Higher score = more likely to contain relevant code
   */
  private scoreDirectories(
    question: string,
    graph: ProjectGraph
  ): Map<string, number> {
    const keywords = this.extractSearchTerms(question);
    const dirScores = new Map<string, number>();

    if (keywords.length === 0) {
      return dirScores;
    }

    const files = graph.findFiles();
    for (const file of files) {
      // Get directory path (e.g., "web/src" from "web/src/App.tsx")
      const parts = file.path.split('/');
      const dir = parts.slice(0, -1).join('/') || '.';

      let score = 0;

      // Score by file path containing keywords
      for (const kw of keywords) {
        if (file.path.toLowerCase().includes(kw.toLowerCase())) {
          score += 2;
        }
      }

      // Score by searching blocks in this file for keywords
      const blocks = graph.getBlocksForFile(file.id);
      for (const block of blocks) {
        for (const kw of keywords) {
          if (block.content.toLowerCase().includes(kw.toLowerCase())) {
            score += 1;
            break; // Count once per block
          }
        }
      }

      if (score > 0) {
        dirScores.set(dir, (dirScores.get(dir) || 0) + score);
      }
    }

    return dirScores;
  }

  /**
   * Get files from highest-scoring directories
   */
  private getRelevantFiles(
    dirScores: Map<string, number>,
    graph: ProjectGraph,
    limit: number = 10
  ): FileRecord[] {
    if (dirScores.size === 0) {
      return [];
    }

    // Sort directories by score (highest first)
    const sorted = [...dirScores.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5); // Top 5 directories

    const files: FileRecord[] = [];
    const allFiles = graph.findFiles();

    for (const [dir] of sorted) {
      const dirFiles = allFiles.filter(
        (f) => f.path.startsWith(dir + '/') || f.path === dir
      );
      files.push(...dirFiles);
      if (files.length >= limit) break;
    }

    return files.slice(0, limit);
  }

  /**
   * Extract potential symbol names from question text
   */
  private extractSymbolNames(question: string): string[] {
    const names: string[] = [];

    // Match camelCase, PascalCase, snake_case identifiers
    const identifierPattern =
      /\b([A-Z][a-zA-Z0-9]*|[a-z][a-zA-Z0-9]*(?:_[a-zA-Z0-9]+)*)\b/g;
    let match;

    while ((match = identifierPattern.exec(question)) !== null) {
      const name = match[1];
      if (!this.isCommonWord(name) && name.length > 2) {
        names.push(name);
      }
    }

    // Match quoted strings
    const quotedPattern = /[`"']([^`"']+)[`"']/g;
    while ((match = quotedPattern.exec(question)) !== null) {
      names.push(match[1]);
    }

    return [...new Set(names)];
  }

  /**
   * Check if a word is common English (not a symbol)
   */
  private isCommonWord(word: string): boolean {
    const common = new Set([
      'the',
      'a',
      'an',
      'is',
      'are',
      'was',
      'were',
      'be',
      'been',
      'being',
      'have',
      'has',
      'had',
      'do',
      'does',
      'did',
      'will',
      'would',
      'could',
      'should',
      'may',
      'might',
      'must',
      'shall',
      'can',
      'need',
      'to',
      'of',
      'in',
      'for',
      'on',
      'with',
      'at',
      'by',
      'from',
      'up',
      'about',
      'into',
      'and',
      'but',
      'or',
      'as',
      'if',
      'when',
      'than',
      'because',
      'while',
      'where',
      'how',
      'what',
      'which',
      'who',
      'this',
      'that',
      'these',
      'those',
      'it',
      'you',
      'he',
      'she',
      'we',
      'they',
      'me',
      'him',
      'her',
      'us',
      'them',
      'my',
      'your',
      'his',
      'its',
      'our',
      'their',
      'function',
      'class',
      'method',
      'file',
      'code',
      'why',
      'does',
      'use',
      'used',
      'using',
    ]);
    return common.has(word.toLowerCase());
  }

  /**
   * BFS expansion from seed symbols
   */
  private expandBFS(
    seeds: SymbolRecord[],
    graph: ProjectGraph
  ): SymbolRecord[] {
    const expanded = new Map<string, SymbolRecord>();
    const maxDepth = this.config.maxDepth;
    const maxFanout = this.config.maxFanout;

    // Add seeds
    for (const seed of seeds) {
      expanded.set(seed.id, seed);
    }

    // BFS expansion
    let frontier = new Set(seeds.map((s) => s.id));

    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextFrontier = new Set<string>();

      for (const symbolId of frontier) {
        // Get outgoing relations (callees)
        const outgoing = graph.getOutgoingRelations(symbolId);
        let count = 0;
        for (const rel of outgoing) {
          if (count >= maxFanout) break;
          if (!expanded.has(rel.targetSymbolId)) {
            const target = graph.getSymbol(rel.targetSymbolId);
            if (target) {
              expanded.set(target.id, target);
              nextFrontier.add(target.id);
              count++;
            }
          }
        }

        // Get incoming relations (callers)
        const incoming = graph.getIncomingRelations(symbolId);
        count = 0;
        for (const rel of incoming) {
          if (count >= maxFanout) break;
          if (!expanded.has(rel.sourceSymbolId)) {
            const source = graph.getSymbol(rel.sourceSymbolId);
            if (source) {
              expanded.set(source.id, source);
              nextFrontier.add(source.id);
              count++;
            }
          }
        }
      }

      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }

    return Array.from(expanded.values());
  }

  /**
   * Get content blocks for symbols
   */
  private getBlocks(
    symbols: SymbolRecord[],
    graph: ProjectGraph
  ): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const seenIds = new Set<string>();

    for (const symbol of symbols) {
      const symbolBlocks = graph.getBlocksForSymbol(symbol.id);
      for (const block of symbolBlocks) {
        // Prefer full blocks over chunks
        if (!block.isChunk && !seenIds.has(block.id)) {
          blocks.push(block);
          seenIds.add(block.id);
        }
      }
    }

    return blocks;
  }

  /**
   * Resolve files for symbols
   */
  private resolveFiles(
    symbols: SymbolRecord[],
    graph: ProjectGraph
  ): FileRecord[] {
    const files = new Map<string, FileRecord>();

    for (const symbol of symbols) {
      if (!files.has(symbol.fileId)) {
        const file = graph.getFile(symbol.fileId);
        if (file) {
          files.set(file.id, file);
        }
      }
    }

    return Array.from(files.values());
  }

  /**
   * Get relations between expanded symbols
   */
  private getRelations(
    symbols: SymbolRecord[],
    graph: ProjectGraph
  ): Relation[] {
    const relations: Relation[] = [];
    const symbolIds = new Set(symbols.map((s) => s.id));
    const seenIds = new Set<string>();

    for (const symbol of symbols) {
      const outgoing = graph.getOutgoingRelations(symbol.id);
      for (const rel of outgoing) {
        if (symbolIds.has(rel.targetSymbolId) && !seenIds.has(rel.id)) {
          relations.push(rel);
          seenIds.add(rel.id);
        }
      }
    }

    return relations;
  }

  /**
   * Trim results to fit token budget
   */
  private trimToBudget(
    symbols: SymbolRecord[],
    blocks: ContentBlock[],
    files: FileRecord[],
    relations: Relation[]
  ): {
    symbols: SymbolRecord[];
    blocks: ContentBlock[];
    files: FileRecord[];
    relations: Relation[];
  } {
    const tokenBudget = this.config.tokenBudget;
    let totalTokens = 0;

    const trimmedSymbols: SymbolRecord[] = [];
    const trimmedBlocks: ContentBlock[] = [];
    const includedFileIds = new Set<string>();

    // Sort blocks by relevance (non-chunks first, then by size)
    const sortedBlocks = [...blocks].sort((a, b) => {
      if (a.isChunk !== b.isChunk) return a.isChunk ? 1 : -1;
      return a.endLine - a.startLine - (b.endLine - b.startLine);
    });

    // Add blocks until budget OR maxBlocks is reached
    const maxBlocks = this.config.maxBlocks || 10;
    for (const block of sortedBlocks) {
      if (trimmedBlocks.length >= maxBlocks) break;
      const blockTokens = this.budget.estimate(block.content);
      if (totalTokens + blockTokens <= tokenBudget) {
        trimmedBlocks.push(block);
        totalTokens += blockTokens;
        includedFileIds.add(block.fileId);
      }
    }

    // Include symbols that have blocks in the result
    const includedSymbolIds = new Set(
      trimmedBlocks.filter((b) => b.symbolId).map((b) => b.symbolId!)
    );
    for (const symbol of symbols) {
      if (includedSymbolIds.has(symbol.id)) {
        trimmedSymbols.push(symbol);
      }
    }

    // Include files that have blocks in the result
    const trimmedFiles = files.filter((f) => includedFileIds.has(f.id));

    // Filter relations to only include included symbols
    const trimmedRelations = relations.filter(
      (r) =>
        includedSymbolIds.has(r.sourceSymbolId) &&
        includedSymbolIds.has(r.targetSymbolId)
    );

    return {
      symbols: trimmedSymbols,
      blocks: trimmedBlocks,
      files: trimmedFiles,
      relations: trimmedRelations,
    };
  }

  /**
   * Estimate tokens for blocks
   */
  private estimateTokens(blocks: ContentBlock[]): number {
    return blocks.reduce(
      (sum, block) => sum + this.budget.estimate(block.content),
      0
    );
  }
}
