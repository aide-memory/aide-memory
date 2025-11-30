/**
 * Retrieval Strategy Interface
 *
 * Defines how code context is retrieved for LLM prompts.
 * V0 implements GraphTraversalStrategy.
 * Future: EmbeddingStrategy, HybridStrategy
 */

import { CodeSlice, RetrievalQuery } from '../brain/types';
import { ProjectBrainStore } from '../brain/store';

export interface RetrievalStrategy {
  /**
   * Retrieve a code slice based on the query
   */
  retrieve(query: RetrievalQuery): Promise<CodeSlice>;
}

export interface RetrievalConfig {
  /** Maximum depth for graph traversal (default: 2) */
  maxDepth: number;

  /** Maximum fanout per relation type (default: 5) */
  maxFanout: number;

  /** Approximate token budget for the slice (default: 4000) */
  tokenBudget: number;

  /** Relation types to follow during traversal */
  relationTypes: (
    | 'CALLS'
    | 'IMPORTS'
    | 'TESTS'
    | 'CONFIGURES'
    | 'EXTENDS'
    | 'IMPLEMENTS'
  )[];
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  maxDepth: 2,
  maxFanout: 5,
  tokenBudget: 8000, // Increased to accommodate callers/callees
  relationTypes: ['CALLS', 'IMPORTS', 'TESTS', 'CONFIGURES'],
};

/**
 * Base class for retrieval strategies
 */
export abstract class BaseRetrievalStrategy implements RetrievalStrategy {
  protected store: ProjectBrainStore;
  protected config: RetrievalConfig;

  constructor(store: ProjectBrainStore, config: Partial<RetrievalConfig> = {}) {
    this.store = store;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
  }

  abstract retrieve(query: RetrievalQuery): Promise<CodeSlice>;

  /**
   * Estimate tokens for a symbol (rough heuristic)
   */
  protected estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}
