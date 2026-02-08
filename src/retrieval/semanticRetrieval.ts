/**
 * Semantic Retrieval Strategy
 *
 * Pure semantic search with file-level tools, no graph dependency.
 * Works when no project graph has been built but embeddings exist.
 * Also useful for quick exploration of unfamiliar codebases.
 *
 * Default fallback when no project graph is available.
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

export interface SemanticRetrievalOptions {
  verbose?: boolean;
  tokenTracker?: TokenTracker;
  orchestration?: Partial<OrchestratorConfig>;
}

export class SemanticRetrieval implements RetrievalStrategy {
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
    options?: SemanticRetrievalOptions
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
      logInfo('[semantic-retrieval] Starting pure semantic retrieval');
    }

    // Create tool executor with semantic search only (no graph reliance)
    // We pass graph for basic file operations but tools are semantic-only
    const toolExecutor = new ToolExecutor(graph, this.searchEngine);

    // Semantic-only tools (no graph-dependent tools)
    const hasGraph = false; // Force semantic-only tools
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
        `[semantic-retrieval] Done: ${result.iterations} iterations, ${result.totalToolCalls} tool calls`
      );
    }

    // Convert orchestrator result to RetrievalResult
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
      strategy: 'semantic',
      tokenEstimate: Math.ceil(result.answer.length / 4),
    };
  }
}
