/**
 * HybridRetrieval
 *
 * Combines SimpleGraphRetrieval and ToolBasedRetrieval.
 * - Start with simple (cheap, deterministic)
 * - Let model call tools to refine if runtime supports tools
 * - Best of both worlds
 */

import {
  RetrievalStrategy,
  RetrievalResult,
  RetrievalConfig,
  DEFAULT_RETRIEVAL_CONFIG,
} from './types';
import { RetrievalQuery } from '../brain/types';
import { ProjectGraph } from '../brain/projectGraph';
import { TokenBudgetManager } from '../core/tokenBudget';
import { SimpleGraphRetrieval } from './simpleGraphRetrieval';
import { ToolBasedRetrieval, ToolRetrievalOptions } from './toolBasedRetrieval';
import { ToolCapableRuntime } from '../models/types';
import { verbose as verboseUI } from '../cli/ui';

// ============================================================================
// HybridRetrieval
// ============================================================================

export class HybridRetrieval implements RetrievalStrategy {
  private config: RetrievalConfig;
  private budget: TokenBudgetManager;
  private simpleRetrieval: SimpleGraphRetrieval;
  private toolRetrieval: ToolBasedRetrieval | null;
  private runtime: ToolCapableRuntime | null;
  private verbose: boolean;

  constructor(
    runtime: ToolCapableRuntime | null,
    config: Partial<RetrievalConfig> = {},
    budget?: TokenBudgetManager,
    options?: ToolRetrievalOptions
  ) {
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
    this.budget = budget || new TokenBudgetManager(this.config.tokenBudget);
    this.runtime = runtime;
    this.verbose = options?.verbose ?? false;

    // Pass verbose to simple retrieval
    this.simpleRetrieval = new SimpleGraphRetrieval(config, this.budget, {
      verbose: this.verbose,
    });

    // Only create tool retrieval if we have a runtime
    this.toolRetrieval = runtime
      ? new ToolBasedRetrieval(runtime, config, this.budget, options)
      : null;
  }

  private log(message: string): void {
    if (this.verbose) {
      verboseUI.info(message);
    }
  }

  /**
   * Get the tool definitions (for model to know what's available)
   */
  get tools() {
    return this.toolRetrieval?.tools ?? [];
  }

  /**
   * Main retrieval method
   */
  async retrieve(
    query: RetrievalQuery,
    graph: ProjectGraph
  ): Promise<RetrievalResult> {
    if (this.verbose) {
      verboseUI.header('HYBRID RETRIEVAL');
    }
    this.log('Starting hybrid retrieval...');

    // Always start with simple retrieval for initial hints
    this.log('Phase 1: Simple graph traversal for initial hints...');
    const hints = await this.simpleRetrieval.retrieve(query, graph);
    this.log(
      `Simple found: ${hints.symbols.length} symbols, ${hints.blocks.length} blocks`
    );

    // If we have a tool-capable runtime that supports tools, let it refine
    if (this.toolRetrieval && this.runtime?.supportsTools()) {
      const mode = this.config.hybridMode || 'code';
      this.log(`Phase 2: Tool-based refinement (mode: ${mode})...`);
      const result = await this.toolRetrieval.retrieveWithHints(
        query,
        hints,
        graph,
        mode
      );
      this.log(
        `After tool refinement: ${result.symbols.length} symbols, ${result.blocks.length} blocks`
      );
      // Override strategy to indicate hybrid was used
      return { ...result, strategy: 'hybrid' };
    }

    this.log('No tool-capable runtime - returning simple results');
    // Otherwise just return hints with hybrid strategy marker
    return {
      ...hints,
      strategy: 'hybrid',
    };
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export interface CreateRetrievalOptions {
  /** Log retrieval steps and tool calls */
  verbose?: boolean;
}

/**
 * Create a retrieval strategy based on configuration
 *
 * @param config - Retrieval configuration
 * @param runtime - Tool-capable runtime (required for 'tools' and 'hybrid' strategies)
 * @param budget - Optional token budget manager
 * @param options - Additional options (verbose logging, etc.)
 */
export function createRetrievalStrategy(
  config: Partial<RetrievalConfig> = {},
  runtime?: ToolCapableRuntime,
  budget?: TokenBudgetManager,
  options?: CreateRetrievalOptions
): RetrievalStrategy {
  const strategyType = config.strategy || DEFAULT_RETRIEVAL_CONFIG.strategy;

  switch (strategyType) {
    case 'simple':
      return new SimpleGraphRetrieval(config, budget, options);

    case 'tools':
      if (!runtime) {
        console.warn(
          '[aide] Tools strategy requires a ToolCapableRuntime. Falling back to simple.'
        );
        return new SimpleGraphRetrieval(config, budget, options);
      }
      return new ToolBasedRetrieval(runtime, config, budget, options);

    case 'hybrid':
    default:
      return new HybridRetrieval(runtime ?? null, config, budget, options);
  }
}
