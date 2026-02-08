/**
 * Graph Retrieval Strategy
 *
 * Uses semantic search to find entry points, then the orchestration loop
 * uses project graph tools to expand context via relationships.
 * This is the most powerful strategy: semantic search eliminates wasteful
 * top-down exploration, and the graph enables relationship-based expansion.
 *
 * Default when both project graph and embeddings exist.
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
import { TokenTracker } from '../core/tokenTracker';
import { ModelRuntimes } from '../models/types';
import { SemanticSearchEngine } from './semanticSearch';
import { Orchestrator } from '../orchestration/orchestrator';
import { ToolExecutor } from '../orchestration/toolExecutor';
import { OrchestratorConfig } from '../orchestration/types';
import { logInfo } from '../core/logger';

export interface GraphRetrievalOptions {
  verbose?: boolean;
  tokenTracker?: TokenTracker;
  orchestration?: Partial<OrchestratorConfig>;
}

export class GraphRetrieval implements RetrievalStrategy {
  private searchEngine: SemanticSearchEngine;
  private runtimes: ModelRuntimes;
  private config: RetrievalConfig;
  private budget: TokenBudgetManager;
  private tracker: TokenTracker;
  private orchestrationConfig?: Partial<OrchestratorConfig>;
  private verbose: boolean;

  constructor(
    searchEngine: SemanticSearchEngine,
    runtimes: ModelRuntimes,
    config: Partial<RetrievalConfig> = {},
    budget?: TokenBudgetManager,
    options?: GraphRetrievalOptions
  ) {
    this.searchEngine = searchEngine;
    this.runtimes = runtimes;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
    this.budget = budget || new TokenBudgetManager(this.config.tokenBudget);
    this.tracker = options?.tokenTracker || new TokenTracker();
    this.orchestrationConfig = options?.orchestration;
    this.verbose = options?.verbose ?? false;
  }

  async retrieve(
    query: RetrievalQuery,
    graph: ProjectGraph
  ): Promise<RetrievalResult> {
    if (this.verbose) {
      logInfo('[graph-retrieval] Starting graph retrieval with semantic entry points');
    }

    // Create tool executor with both graph and semantic search
    const toolExecutor = new ToolExecutor(graph, this.searchEngine);

    // Get available tools (graph + embeddings)
    const hasGraph = true;
    const hasEmbeddings = this.searchEngine.hasEmbeddings();
    const availableTools = toolExecutor.getAvailableTools(hasGraph, hasEmbeddings);

    // Create orchestrator
    const orchestrator = new Orchestrator(
      this.runtimes,
      toolExecutor,
      this.tracker,
      this.orchestrationConfig
    );

    // Build conversation context if available
    const conversationHistory = query.conversationHistory;

    // Run the orchestration loop
    const result = await orchestrator.answer(query.question, {
      availableTools,
      conversationHistory,
    });

    if (this.verbose) {
      logInfo(
        `[graph-retrieval] Done: ${result.iterations} iterations, ${result.totalToolCalls} tool calls`
      );
    }

    // Convert orchestrator result to RetrievalResult
    // The orchestrator returns the final answer; we wrap it in a synthetic block
    return {
      symbols: [],
      blocks: result.answer
        ? [
            {
              id: 'orchestrator:context',
              fileId: '',
              kind: 'code' as const,
              startLine: 0,
              endLine: 0,
              content: result.answer,
              isChunk: false,
            },
          ]
        : [],
      files: [],
      relations: [],
      strategy: 'graph',
      tokenEstimate: Math.ceil(result.answer.length / 4),
    };
  }
}
