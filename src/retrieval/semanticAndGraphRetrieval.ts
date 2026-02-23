/**
 * Semantic and Graph Retrieval Strategy
 *
 * Unified retrieval that uses semantic search to find entry points,
 * then leverages graph tools (find_symbol, get_references, etc.) to
 * expand context via relationships. When no project graph is available
 * (or --no-graph is set), the same tools are offered but backed by
 * filesystem + tree-sitter fallbacks instead of the graph index.
 *
 * This is the default strategy. It adapts automatically:
 *   - With graph: SQL indexed symbols, FTS5 content search, relations
 *   - Without graph: fast-glob file discovery, tree-sitter symbol
 *     extraction, text-based reference search
 */

import {
  RetrievalStrategy,
  RetrievalResult,
  RetrievalConfig,
  DEFAULT_RETRIEVAL_CONFIG,
} from './types';
import { RetrievalQuery } from '../brain/types';
import { ProjectGraph } from '../brain/projectGraph';
import { SQLiteBrainStore } from '../brain/sqliteStore';
import { TokenBudgetManager } from '../core/tokenBudget';
import { TokenTracker } from '../core/tokenTracker';
import { ModelRuntimes, EmbeddingRuntime } from '../models/types';
import { SemanticSearchEngine } from './semanticSearch';
import { Orchestrator, VerboseLogger } from '../orchestration/orchestrator';
import { ToolExecutor } from '../orchestration/toolExecutor';
import { OrchestratorConfig } from '../orchestration/types';
import { logInfo } from '../core/logger';

export interface SemanticAndGraphRetrievalOptions {
  verbose?: boolean;
  tokenTracker?: TokenTracker;
  orchestration?: Partial<OrchestratorConfig>;
  logger?: VerboseLogger;
  projectRoot?: string;
  embeddingRuntime?: EmbeddingRuntime;
  sqliteStore?: SQLiteBrainStore;
  sessionId?: string;
  noGraph?: boolean;
}

export class SemanticAndGraphRetrieval implements RetrievalStrategy {
  private searchEngine: SemanticSearchEngine;
  private runtimes: ModelRuntimes;
  private config: RetrievalConfig;
  private budget: TokenBudgetManager;
  private tracker: TokenTracker;
  private orchestrationConfig?: Partial<OrchestratorConfig>;
  private verbose: boolean;
  private logger?: VerboseLogger;
  private projectRoot: string;
  private embeddingRuntime?: EmbeddingRuntime;
  private sqliteStore?: SQLiteBrainStore;
  private sessionId?: string;
  private noGraph: boolean;

  constructor(
    searchEngine: SemanticSearchEngine,
    runtimes: ModelRuntimes,
    config: Partial<RetrievalConfig> = {},
    budget?: TokenBudgetManager,
    options?: SemanticAndGraphRetrievalOptions
  ) {
    this.searchEngine = searchEngine;
    this.runtimes = runtimes;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
    this.budget = budget || new TokenBudgetManager(this.config.tokenBudget);
    this.tracker = options?.tokenTracker || new TokenTracker();
    this.orchestrationConfig = options?.orchestration;
    this.verbose = options?.verbose ?? false;
    this.logger = options?.logger;
    this.projectRoot = options?.projectRoot || process.cwd();
    this.embeddingRuntime = options?.embeddingRuntime;
    this.sqliteStore = options?.sqliteStore;
    this.sessionId = options?.sessionId;
    this.noGraph = options?.noGraph ?? false;
  }

  async retrieve(
    query: RetrievalQuery,
    graph: ProjectGraph
  ): Promise<RetrievalResult> {
    const useGraph = !this.noGraph;
    const graphForTools = useGraph ? graph : null;
    const mode = graphForTools ? 'graph+semantic' : 'semantic-only';

    if (this.verbose) {
      logInfo(`[retrieval] Starting retrieval (${mode})`);
    }

    const toolExecutor = new ToolExecutor(
      graphForTools,
      this.searchEngine,
      this.projectRoot,
      query.conversationHistory,
      this.embeddingRuntime,
      this.sqliteStore,
      this.sessionId
    );

    const hasEmbeddings = this.searchEngine.hasEmbeddings();
    const availableTools = toolExecutor.getAvailableTools(hasEmbeddings);

    const orchestrator = new Orchestrator(
      this.runtimes,
      toolExecutor,
      this.tracker,
      this.orchestrationConfig,
      { verbose: this.verbose, logger: this.logger }
    );

    const result = await orchestrator.answer(query.question, {
      availableTools,
    });

    if (this.verbose) {
      logInfo(
        `[retrieval] Done: ${result.iterations} iterations, ${result.totalToolCalls} tool calls`
      );
    }

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
      strategy: 'semanticandgraph',
      tokenEstimate: Math.ceil(result.answer.length / 4),
    };
  }
}
