/**
 * Retrieval Types
 *
 * Unified types for all retrieval strategies.
 */

import {
  SymbolRecord,
  ContentBlock,
  FileRecord,
  Relation,
  RetrievalQuery,
} from '../brain/types';
import { ProjectGraph } from '../brain/projectGraph';
import { AIDE_DEFAULTS } from '../core/config';

// ============================================================================
// RetrievalResult - Unified output from all strategies
// ============================================================================

export interface RetrievalResult {
  /** Symbols found */
  symbols: SymbolRecord[];

  /** Content blocks (code, comments, docs) */
  blocks: ContentBlock[];

  /** Files containing the symbols/blocks */
  files: FileRecord[];

  /** Relations between symbols */
  relations: Relation[];

  /** Which strategy produced this result */
  strategy: 'simple' | 'tools' | 'hybrid';

  /** Estimated token count for the content */
  tokenEstimate: number;

  /** Tool calls made (for tool-based retrieval) */
  toolCalls?: ToolCallRecord[];

  /** Priority for context assembly ordering (higher = more important) */
  priority?: number;
}

// ============================================================================
// Tool Types
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'array';
  description: string;
  required?: boolean;
}

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ToolCallRecord {
  call: ToolCall;
  result: ToolResult;
  timestamp: string;
}

// ============================================================================
// RetrievalStrategy Interface
// ============================================================================

export interface RetrievalStrategy {
  /**
   * Retrieve relevant code context for a query
   */
  retrieve(
    query: RetrievalQuery,
    graph: ProjectGraph
  ): Promise<RetrievalResult>;
}

// ============================================================================
// Strategy Configuration
// ============================================================================

export interface RetrievalConfig {
  /** Strategy to use */
  strategy: 'simple' | 'tools' | 'hybrid';

  /** Maximum depth for BFS graph traversal */
  maxDepth: number;

  /** Maximum fanout per relation type */
  maxFanout: number;

  /** Token budget for the result */
  tokenBudget: number;

  /** Maximum number of blocks to return */
  maxBlocks: number;

  /**
   * Hybrid mode: how to present initial context to the tool model
   * - 'code': Show full code blocks upfront (model can skip exploration if sufficient)
   * - 'hints': Show entry points only (symbol names, IDs, paths - model must explore)
   */
  hybridMode?: 'code' | 'hints';
}

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  strategy: AIDE_DEFAULTS.strategy,
  maxDepth: AIDE_DEFAULTS.maxDepth,
  maxFanout: 3, // Reduced from 5 - fewer symbols per relation
  tokenBudget: AIDE_DEFAULTS.tokenBudget,
  maxBlocks: AIDE_DEFAULTS.maxBlocks,
  hybridMode: AIDE_DEFAULTS.hybridMode,
};
