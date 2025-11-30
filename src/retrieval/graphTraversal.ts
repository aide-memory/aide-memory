/**
 * Graph Traversal Strategy
 *
 * Retrieves code context by:
 * 1. Finding seed symbols from question text (fuzzy match)
 * 2. Including session focus symbols as additional seeds
 * 3. Expanding via relations up to configurable depth
 * 4. Ranking by relevance and trimming to token budget
 */

import {
  CodeSlice,
  RetrievalQuery,
  SymbolRecord,
  FileRecord,
  Note,
  Relation,
} from '../brain/types';
import { ProjectBrainStore } from '../brain/store';
import { BaseRetrievalStrategy, RetrievalConfig } from './strategy';

export class GraphTraversalStrategy extends BaseRetrievalStrategy {
  constructor(store: ProjectBrainStore, config: Partial<RetrievalConfig> = {}) {
    super(store, config);
  }

  async retrieve(query: RetrievalQuery): Promise<CodeSlice> {
    const maxDepth = query.maxDepth ?? this.config.maxDepth;
    const maxFanout = query.maxFanout ?? this.config.maxFanout;
    const tokenBudget = query.tokenBudget ?? this.config.tokenBudget;

    // Check for usage queries ("where is X used", "who calls X")
    const isUsageQuery = this.isUsageQuery(query.question);

    // Step 1: Find seed symbols (prioritize focus when pronouns detected)
    const seeds = this.findSeedSymbols(query);

    // Step 2: Expand via relations
    // For usage queries, expand callers more aggressively
    const effectiveFanout = isUsageQuery ? maxFanout * 2 : maxFanout;
    const expanded = this.expandFromSeeds(
      seeds,
      maxDepth,
      effectiveFanout,
      isUsageQuery
    );

    // Step 3: Categorize symbols
    const slice = this.categorizeSymbols(seeds, expanded);

    // Step 4: Trim to token budget
    this.trimToTokenBudget(slice, tokenBudget);

    // Step 5: Resolve files for symbols
    this.resolveFiles(slice);

    // Step 6: Gather relevant notes
    this.gatherNotes(slice);

    return slice;
  }

  /**
   * Detect if question contains pronouns or vague references
   * that should trigger focus symbol prioritization
   */
  private hasPronounReference(question: string): boolean {
    const lower = question.toLowerCase();
    const pronounPatterns = [
      /\bit\b/, // "it"
      /\bthis\b/, // "this"
      /\bthat\b/, // "that"
      /\bthey\b/, // "they"
      /\bthese\b/, // "these"
      /\bthose\b/, // "those"
      /\bthe same\b/, // "the same"
      /\bthe above\b/, // "the above"
    ];
    return pronounPatterns.some((p) => p.test(lower));
  }

  /**
   * Detect if question is asking about usage/callers
   */
  private isUsageQuery(question: string): boolean {
    const lower = question.toLowerCase();
    const usagePatterns = [
      /where\s+(is|are)\s+.+\s+used/, // "where is X used"
      /who\s+(calls|uses)/, // "who calls X"
      /what\s+(calls|uses)/, // "what calls X"
      /how\s+is\s+.+\s+used/, // "how is X used"
      /\bused\s+(by|in|from)\b/, // "used by/in/from"
      /\bcalled\s+(by|from)\b/, // "called by/from"
      /\bwhere.*used\b/, // general "where...used"
    ];
    return usagePatterns.some((p) => p.test(lower));
  }

  /**
   * Detect if query is asking for "all" of something
   * (e.g., "complete all TODO", "list all functions", "show all methods")
   */
  private isAllQuery(question: string): boolean {
    const lower = question.toLowerCase();
    const allPatterns = [
      /\ball\s+(todo|function|method|class)/i,
      /\bcomplete\s+all\b/i,
      /\blist\s+all\b/i,
      /\bshow\s+all\b/i,
      /\bevery\s+(function|method|todo)/i,
      /\ball\s+the\s+(function|method|todo)/i,
    ];
    return allPatterns.some((p) => p.test(lower));
  }

  /**
   * Find seed symbols from question text and focus symbols
   */
  private findSeedSymbols(query: RetrievalQuery): SymbolRecord[] {
    const seeds: SymbolRecord[] = [];
    const seenIds = new Set<string>();

    // Check if question has pronouns - if so, prioritize focus symbols
    const hasPronoun = this.hasPronounReference(query.question);
    const potentialNames = this.extractSymbolNames(query.question);
    const hasSpecificSymbols = potentialNames.length > 0;

    // When question has pronouns and no specific symbols,
    // focus symbols are the PRIMARY seeds (not just additional)
    const focusPriority = hasPronoun && !hasSpecificSymbols;

    // Check for "all" queries - return all functions/methods
    if (this.isAllQuery(query.question)) {
      const allFunctions = this.store.findSymbols({
        kinds: ['function', 'method', 'class'],
      });
      // Limit to reasonable amount (max 30 symbols)
      for (const sym of allFunctions.slice(0, 30)) {
        if (!seenIds.has(sym.id)) {
          seeds.push(sym);
          seenIds.add(sym.id);
        }
      }
      return seeds;
    }

    // Add focus symbols directly
    if (query.focusSymbolIds) {
      // Include more focus symbols when they're the priority
      const limit = focusPriority ? query.focusSymbolIds.length : 5;
      for (const id of query.focusSymbolIds.slice(0, limit)) {
        const symbol = this.store.getSymbol(id);
        if (symbol && !seenIds.has(symbol.id)) {
          seeds.push(symbol);
          seenIds.add(symbol.id);
        }
      }
    }

    // Add symbols from focus files
    if (query.focusFileIds) {
      const symbolsPerFile = focusPriority ? 10 : 3;
      for (const fileId of query.focusFileIds) {
        const symbols = this.store.getSymbolsForFile(fileId);
        for (const sym of symbols.slice(0, symbolsPerFile)) {
          if (!seenIds.has(sym.id)) {
            seeds.push(sym);
            seenIds.add(sym.id);
          }
        }
      }
    }

    // If focus symbols are the priority and we have some,
    // skip question text extraction
    if (focusPriority && seeds.length > 0) {
      return seeds;
    }

    // Extract potential symbol names from question

    for (const name of potentialNames) {
      // Try exact match first
      let matches = this.store.findSymbols({ name });

      // If we found a class/interface, also include its methods
      // This ensures we get callees from the methods, not just the class
      if (matches.length > 0 && matches[0].kind === 'class') {
        const classMatch = matches[0];
        // Find methods of this class (e.g., "ContextAssembler.assemble")
        const methodMatches = this.store.findSymbols({
          namePattern: `${classMatch.name}.`,
        });
        matches = [classMatch, ...methodMatches];
      }

      // Try fuzzy match if no exact match
      if (matches.length === 0) {
        matches = this.store.findSymbols({ namePattern: name });
      }

      for (const match of matches.slice(0, 10)) {
        if (!seenIds.has(match.id)) {
          seeds.push(match);
          seenIds.add(match.id);
        }
      }

      // Also search file paths for this term (e.g., "analysis" matches "src/analysis/")
      if (matches.length === 0) {
        const matchingFiles = this.store.findFiles({
          pathPattern: `*${name}*`,
        });
        // Include up to 10 files per path match, 10 symbols per file
        for (const file of matchingFiles.slice(0, 10)) {
          const fileSymbols = this.store.getSymbolsForFile(file.id);
          for (const sym of fileSymbols.slice(0, 10)) {
            if (!seenIds.has(sym.id)) {
              seeds.push(sym);
              seenIds.add(sym.id);
            }
          }
        }
      }
    }

    // Fallback: if still no seeds and question mentions common terms,
    // include all functions as context
    if (seeds.length === 0) {
      const lower = query.question.toLowerCase();
      const needsFallback =
        lower.includes('todo') ||
        lower.includes('implement') ||
        lower.includes('complete') ||
        lower.includes('function') ||
        lower.includes('code');

      if (needsFallback) {
        const allFunctions = this.store.findSymbols({
          kinds: ['function', 'method'],
        });
        for (const sym of allFunctions.slice(0, 20)) {
          seeds.push(sym);
        }
      }
    }

    return seeds;
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
      // Filter out common words
      if (!this.isCommonWord(name) && name.length > 2) {
        names.push(name);
      }
    }

    // Also look for quoted strings
    const quotedPattern = /[`"']([^`"']+)[`"']/g;
    while ((match = quotedPattern.exec(question)) !== null) {
      const name = match[1];
      if (!this.isCommonWord(name)) {
        names.push(name);
      }
    }

    return [...new Set(names)]; // Deduplicate
  }

  /**
   * Check if a word is a common English word (not a symbol)
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
      'dare',
      'ought',
      'used',
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
      'over',
      'after',
      'and',
      'but',
      'or',
      'as',
      'if',
      'when',
      'than',
      'because',
      'while',
      'although',
      'where',
      'how',
      'what',
      'which',
      'who',
      'whom',
      'this',
      'that',
      'these',
      'those',
      'i',
      'you',
      'he',
      'she',
      'it',
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
    ]);
    return common.has(word.toLowerCase());
  }

  /**
   * Expand from seed symbols via relations
   * @param isUsageQuery - If true, prioritize incoming relations (callers)
   */
  private expandFromSeeds(
    seeds: SymbolRecord[],
    maxDepth: number,
    maxFanout: number,
    isUsageQuery: boolean = false
  ): Map<
    string,
    { symbol: SymbolRecord; depth: number; relation: string; fromSeed: boolean }
  > {
    const expanded = new Map<
      string,
      {
        symbol: SymbolRecord;
        depth: number;
        relation: string;
        fromSeed: boolean;
      }
    >();

    const seedIds = new Set(seeds.map((s) => s.id));

    // Add seeds at depth 0
    for (const seed of seeds) {
      expanded.set(seed.id, {
        symbol: seed,
        depth: 0,
        relation: 'SEED',
        fromSeed: true,
      });
    }

    // BFS expansion
    let frontier = new Set(seeds.map((s) => s.id));

    // For usage queries, expand callers more aggressively
    const outgoingFanout = isUsageQuery ? Math.floor(maxFanout / 2) : maxFanout;
    const incomingFanout = isUsageQuery ? maxFanout * 2 : maxFanout;

    for (let depth = 1; depth <= maxDepth; depth++) {
      const nextFrontier = new Set<string>();

      for (const symbolId of frontier) {
        // Check if this symbol is a seed (for fromSeed tracking)
        const isFromSeed = seedIds.has(symbolId);

        // Get outgoing relations (callees, imports)
        const outgoing = this.store.getOutgoingRelations(symbolId);
        let count = 0;
        for (const rel of outgoing) {
          if (count >= outgoingFanout) break;
          if (!expanded.has(rel.targetSymbolId)) {
            const targetSymbol = this.store.getSymbol(rel.targetSymbolId);
            if (targetSymbol) {
              expanded.set(rel.targetSymbolId, {
                symbol: targetSymbol,
                depth,
                relation: rel.kind,
                fromSeed: isFromSeed, // Track if this came directly from a seed
              });
              nextFrontier.add(rel.targetSymbolId);
              count++;
            }
          }
        }

        // Get incoming relations (callers, tests)
        const incoming = this.store.getIncomingRelations(symbolId);
        count = 0;
        for (const rel of incoming) {
          if (count >= incomingFanout) break;
          if (!expanded.has(rel.sourceSymbolId)) {
            const sourceSymbol = this.store.getSymbol(rel.sourceSymbolId);
            if (sourceSymbol) {
              expanded.set(rel.sourceSymbolId, {
                symbol: sourceSymbol,
                depth,
                relation: `${rel.kind}_BY`,
                fromSeed: isFromSeed, // Track if this came directly from a seed
              });
              nextFrontier.add(rel.sourceSymbolId);
              count++;
            }
          }
        }
      }

      frontier = nextFrontier;
      if (frontier.size === 0) break;
    }

    return expanded;
  }

  /**
   * Categorize expanded symbols into slice categories
   */
  private categorizeSymbols(
    seeds: SymbolRecord[],
    expanded: Map<
      string,
      {
        symbol: SymbolRecord;
        depth: number;
        relation: string;
        fromSeed: boolean;
      }
    >
  ): CodeSlice {
    const slice: CodeSlice = {
      central: [],
      callers: [],
      callees: [],
      tests: [],
      configs: [],
      notes: [],
      files: new Map(),
    };

    const seedIds = new Set(seeds.map((s) => s.id));

    for (const [id, entry] of expanded) {
      if (seedIds.has(id)) {
        slice.central.push(entry.symbol);
      } else if (
        (entry.relation === 'CALLS_BY' || entry.relation === 'IMPORTS_BY') &&
        entry.fromSeed
      ) {
        // Callers: ONLY symbols that directly call/import central (seeds)
        // Don't include callers of callees - those cause model confusion
        slice.callers.push(entry.symbol);
      } else if (
        (entry.relation === 'TESTS' || entry.relation === 'TESTS_BY') &&
        entry.fromSeed
      ) {
        slice.tests.push(entry.symbol);
      } else if (
        (entry.relation === 'CALLS' || entry.relation === 'IMPORTS') &&
        entry.fromSeed
      ) {
        // Callees: ONLY symbols directly called by central (seeds)
        // Don't include callees of callers - those cause model confusion
        slice.callees.push(entry.symbol);
      }
      // Skip indirect relations (fromSeed=false) - they cause confusion
    }

    return slice;
  }

  /**
   * Trim slice to fit within token budget
   */
  private trimToTokenBudget(slice: CodeSlice, budget: number): void {
    let totalTokens = 0;

    // Priority: central > callers > callees > tests
    // Use conservative estimate - actual code may be truncated in context
    const estimateSymbolTokens = (sym: SymbolRecord): number => {
      let tokens = this.estimateTokens(sym.name);
      if (sym.signature) tokens += this.estimateTokens(sym.signature);
      if (sym.docComment) tokens += this.estimateTokens(sym.docComment);
      // Estimate for code content - use lower estimate since context truncates long functions
      const lines = Math.min(sym.endLine - sym.startLine + 1, 50); // Cap at 50 lines
      tokens += lines * 8; // ~8 tokens per line on average
      return tokens;
    };

    // Keep all central symbols
    for (const sym of slice.central) {
      totalTokens += estimateSymbolTokens(sym);
    }

    // Trim other categories if over budget
    const trimCategory = (arr: SymbolRecord[]): void => {
      while (arr.length > 0 && totalTokens > budget) {
        const removed = arr.pop();
        if (removed) {
          totalTokens -= estimateSymbolTokens(removed);
        }
      }
    };

    // Add tokens for other categories
    for (const sym of slice.callers) totalTokens += estimateSymbolTokens(sym);
    for (const sym of slice.callees) totalTokens += estimateSymbolTokens(sym);
    for (const sym of slice.tests) totalTokens += estimateSymbolTokens(sym);

    // Trim if over budget
    if (totalTokens > budget) {
      trimCategory(slice.tests);
      if (totalTokens > budget) trimCategory(slice.callees);
      if (totalTokens > budget) trimCategory(slice.callers);
    }
  }

  /**
   * Resolve file records for all symbols in the slice
   */
  private resolveFiles(slice: CodeSlice): void {
    const allSymbols = [
      ...slice.central,
      ...slice.callers,
      ...slice.callees,
      ...slice.tests,
    ];

    for (const sym of allSymbols) {
      if (!slice.files.has(sym.fileId)) {
        const file = this.store.getFile(sym.fileId);
        if (file) {
          slice.files.set(sym.fileId, file);

          // Check if it's a config file
          if (file.path.includes('config') || file.path.includes('tsconfig')) {
            slice.configs.push(file);
          }
        }
      }
    }
  }

  /**
   * Gather relevant notes for symbols in the slice
   */
  private gatherNotes(slice: CodeSlice): void {
    const allSymbols = [
      ...slice.central,
      ...slice.callers,
      ...slice.callees,
      ...slice.tests,
    ];

    for (const sym of allSymbols) {
      const notes = this.store.getNotesForSymbol(sym.id);
      slice.notes.push(...notes);
    }

    // Also gather notes for files
    for (const file of slice.files.values()) {
      const notes = this.store.getNotesForFile(file.id);
      slice.notes.push(...notes);
    }

    // Deduplicate notes
    const seen = new Set<string>();
    slice.notes = slice.notes.filter((n) => {
      if (seen.has(n.id)) return false;
      seen.add(n.id);
      return true;
    });
  }
}
