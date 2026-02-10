/**
 * Orchestrator
 *
 * Multi-model orchestration loop:
 * 1. Reasoning model plans tool calls (including semantic_search for entry points)
 * 2. Code executes tool calls (ToolExecutor, no model)
 * 3. Context model evaluates results, strips irrelevant, may request more
 * 4. Loop until context model says "enough" or max iterations
 * 5. Reasoning model answers with curated context
 *
 * Token tracking flows through the entire pipeline.
 */

import { ModelRuntimes, ToolDefinition } from '../models/types';
import { TokenTracker } from '../core/tokenTracker';
import { ToolExecutor } from './toolExecutor';
import {
  OrchestratorConfig,
  OrchestratorContext,
  OrchestratorResult,
  ToolCallSpec,
  ToolCallResult,
  ToolCallSummary,
  IterationState,
  ContextEvaluation,
  DEFAULT_ORCHESTRATOR_CONFIG,
} from './types';
import {
  buildPlanningPrompt,
  buildAnsweringPrompt,
  buildContextEvaluationPrompt,
  formatResultsAsContext,
} from './prompts';
import { logInfo, logWarn } from '../core/logger';

/** Verbose logging callback interface */
export interface VerboseLogger {
  header(title: string): void;
  label(label: string, value: string | number): void;
  text(text: string): void;
  content(text: string): void;
  separator(): void;
  footer(): void;
  tool(name: string, args?: Record<string, unknown>): void;
  toolResult(result: string, truncate?: number): void;
  info(message: string): void;
}

// ============================================================================
// Orchestrator
// ============================================================================

export class Orchestrator {
  private runtimes: ModelRuntimes;
  private toolExecutor: ToolExecutor;
  private tracker: TokenTracker;
  private config: OrchestratorConfig;
  private verbose: boolean;
  private log?: VerboseLogger;

  constructor(
    runtimes: ModelRuntimes,
    toolExecutor: ToolExecutor,
    tracker: TokenTracker,
    config?: Partial<OrchestratorConfig>,
    options?: { verbose?: boolean; logger?: VerboseLogger }
  ) {
    this.runtimes = runtimes;
    this.toolExecutor = toolExecutor;
    this.tracker = tracker;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
    this.verbose = options?.verbose ?? false;
    this.log = options?.logger;
  }

  /**
   * Run the full orchestration loop for a query
   */
  async answer(
    query: string,
    context: OrchestratorContext
  ): Promise<OrchestratorResult> {
    const state: IterationState = {
      previousCalls: new Map(),
      relevantResults: [],
      strippedSummaries: [],
      iteration: 0,
    };

    // Conversation history is now accessed via tool calls (get_conversation_history,
    // search_conversation) rather than injected into prompts. The tools are automatically
    // included in availableTools when the ToolExecutor has conversation history.
    const hasConversation = this.toolExecutor.hasConversationHistory();

    // =====================================================================
    // Step 1: Reasoning model plans initial tool calls
    // =====================================================================
    logInfo('[orchestrator] Step 1: Reasoning model planning...');

    const planningSystemPrompt = buildPlanningPrompt(
      context.availableTools,
      hasConversation
    );

    if (this.verbose && this.log) {
      this.log.header('ORCHESTRATOR: PLANNING PROMPT → Reasoning Model');
      this.log.label('System prompt length', `${planningSystemPrompt.length} chars`);
      this.log.text(planningSystemPrompt);
      this.log.separator();
      this.log.label('User message', query);
      this.log.footer();
    }

    const planningResponse = await this.runtimes.reasoning.chat([
      { role: 'system', content: planningSystemPrompt },
      { role: 'user', content: query },
    ]);

    // Track planning tokens
    if (planningResponse.usage) {
      this.tracker.record(
        'tool_call',
        'reasoning',
        'planning',
        planningResponse.usage.inputTokens,
        planningResponse.usage.outputTokens
      );
    }

    if (this.verbose && this.log) {
      this.log.header('REASONING MODEL RESPONSE (Planning)');
      if (planningResponse.usage) {
        this.log.label('Tokens', `in=${planningResponse.usage.inputTokens} out=${planningResponse.usage.outputTokens}`);
      }
      this.log.content(planningResponse.content);
      this.log.footer();
    }

    // Parse tool calls from planning response
    let toolCalls = this.parseToolCallsFromResponse(planningResponse.content);

    if (toolCalls.length === 0) {
      logWarn('[orchestrator] Planning model returned no tool calls, attempting direct answer');
      return {
        answer: planningResponse.content,
        relevantResults: [],
        strippedSummaries: [],
        iterations: 0,
        totalToolCalls: 0,
      };
    }

    // Limit batch size
    toolCalls = toolCalls.slice(0, this.config.maxToolCallsPerBatch);
    logInfo(`[orchestrator] Planning: ${toolCalls.length} tool calls planned`);

    // =====================================================================
    // Steps 2-3: Execute -> Evaluate loop
    // =====================================================================
    let totalToolCalls = 0;

    while (state.iteration < this.config.maxIterations) {
      state.iteration++;
      logInfo(
        `[orchestrator] Iteration ${state.iteration}: Executing ${toolCalls.length} tool calls...`
      );

      if (this.verbose && this.log) {
        this.log.header(`ITERATION ${state.iteration}: TOOL CALLS`);
        for (const tc of toolCalls) {
          this.log.tool(tc.name, tc.arguments);
        }
        this.log.footer();
      }

      // Step 2: Execute tool calls (pure code, no model)
      const results = await this.toolExecutor.executeBatch(
        toolCalls,
        state.previousCalls
      );

      totalToolCalls += results.length;

      // Record results in state
      for (const result of results) {
        state.previousCalls.set(result.callKey, result);
      }

      // Verbose: show each tool result
      if (this.verbose && this.log) {
        this.log.header(`ITERATION ${state.iteration}: TOOL RESULTS`);
        for (const r of results) {
          this.log.tool(r.spec.name, r.spec.arguments);
          if (r.success && r.data) {
            this.log.toolResult(r.data, 500);
          } else if (r.error) {
            this.log.info(`ERROR: ${r.error}`);
          } else {
            this.log.info('(skipped - duplicate)');
          }
        }
        this.log.footer();
      }

      // Track tool execution (estimate tokens from result size)
      const resultTokenEstimate = results.reduce(
        (sum, r) => sum + Math.ceil((r.data?.length ?? 0) / 4),
        0
      );
      this.tracker.record(
        'tool_result',
        'context',
        `iteration ${state.iteration} results`,
        resultTokenEstimate,
        0
      );

      // Check for 'done' call
      if (results.some((r) => r.spec.name === 'done')) {
        for (const r of results) {
          if (r.spec.name !== 'done' && r.success && r.data) {
            state.relevantResults.push(r);
          }
        }
        break;
      }

      // Step 3: Context model evaluates results
      if (this.config.enableContextStripping) {
        logInfo(
          `[orchestrator] Iteration ${state.iteration}: Context model evaluating...`
        );

        const evaluation = await this.evaluateWithContextModel(
          query,
          results,
          state
        );

        if (!evaluation) {
          for (const r of results) {
            if (r.success && r.data) {
              state.relevantResults.push(r);
            }
          }
          break;
        }

        // Process evaluation
        for (const idx of evaluation.relevantIndices) {
          if (idx >= 0 && idx < results.length) {
            state.relevantResults.push(results[idx]);
          }
        }

        for (const stripped of evaluation.strippedIndices) {
          if (stripped.index >= 0 && stripped.index < results.length) {
            const r = results[stripped.index];
            state.strippedSummaries.push({
              callKey: r.callKey,
              toolName: r.spec.name,
              resultSummary: (r.data ?? '').slice(0, 100),
              reason: stripped.reason,
            });
          }
        }

        if (evaluation.sufficient) {
          logInfo('[orchestrator] Context model: sufficient context gathered');
          break;
        }

        // Not sufficient: use new tool calls for next iteration
        if (evaluation.newToolCalls.length > 0) {
          toolCalls = evaluation.newToolCalls.slice(
            0,
            this.config.maxToolCallsPerBatch
          );
          logInfo(
            `[orchestrator] Context model requested ${toolCalls.length} more calls`
          );
        } else {
          logInfo(
            '[orchestrator] Context model requested no more calls, finishing'
          );
          break;
        }
      } else {
        // No context stripping -- keep all results
        for (const r of results) {
          if (r.success && r.data) {
            state.relevantResults.push(r);
          }
        }
        break;
      }
    }

    // =====================================================================
    // Step 4: Reasoning model answers with curated context
    // =====================================================================
    logInfo('[orchestrator] Final step: Reasoning model answering...');

    const curatedContext = formatResultsAsContext(state.relevantResults);

    // Answering prompt receives curated context (which may include conversation
    // tool results alongside codebase results). A flag indicates whether
    // conversation tools were available so the answering model knows follow-up
    // context may be present in the curated results.
    const answeringSystemPrompt = buildAnsweringPrompt(
      curatedContext,
      state.strippedSummaries,
      hasConversation
    );

    if (this.verbose && this.log) {
      this.log.header('ORCHESTRATOR: ANSWERING PROMPT → Reasoning Model');
      this.log.label('System prompt length', `${answeringSystemPrompt.length} chars`);
      this.log.text(answeringSystemPrompt);
      this.log.separator();
      this.log.label('User message', query);
      this.log.footer();
    }

    const answerResponse = await this.runtimes.reasoning.chat([
      { role: 'system', content: answeringSystemPrompt },
      { role: 'user', content: query },
    ]);

    // Track answer tokens
    if (answerResponse.usage) {
      this.tracker.record(
        'model_response',
        'reasoning',
        'final answer',
        answerResponse.usage.inputTokens,
        answerResponse.usage.outputTokens
      );
    }

    if (this.verbose && this.log) {
      this.log.header('REASONING MODEL RESPONSE (Final Answer)');
      if (answerResponse.usage) {
        this.log.label('Tokens', `in=${answerResponse.usage.inputTokens} out=${answerResponse.usage.outputTokens}`);
      }
      this.log.label('Answer length', `${answerResponse.content.length} chars`);
      this.log.footer();
    }

    return {
      answer: answerResponse.content,
      relevantResults: state.relevantResults,
      strippedSummaries: state.strippedSummaries,
      iterations: state.iteration,
      totalToolCalls,
    };
  }

  // =========================================================================
  // Internal
  // =========================================================================

  /**
   * Use the context model to evaluate tool call results
   */
  private async evaluateWithContextModel(
    query: string,
    results: ToolCallResult[],
    state: IterationState
  ): Promise<ContextEvaluation | null> {
    const previousCallKeys = Array.from(state.previousCalls.keys());

    const prompt = buildContextEvaluationPrompt(
      query,
      results,
      previousCallKeys,
      state.iteration,
      this.config.maxIterations
    );

    if (this.verbose && this.log) {
      this.log.header(`CONTEXT EVALUATION PROMPT → Context Model (Iteration ${state.iteration})`);
      this.log.label('Prompt length', `${prompt.length} chars`);
      this.log.text(prompt);
      this.log.footer();
    }

    const response = await this.runtimes.context.chat([
      { role: 'system', content: prompt },
      {
        role: 'user',
        content:
          'Evaluate the above results and respond with the JSON evaluation.',
      },
    ]);

    // Track context model tokens
    if (response.usage) {
      this.tracker.record(
        'tool_call',
        'context',
        `evaluation iteration ${state.iteration}`,
        response.usage.inputTokens,
        response.usage.outputTokens
      );
    }

    if (this.verbose && this.log) {
      this.log.header(`CONTEXT MODEL RESPONSE (Iteration ${state.iteration})`);
      if (response.usage) {
        this.log.label('Tokens', `in=${response.usage.inputTokens} out=${response.usage.outputTokens}`);
      }
      this.log.content(response.content);
      this.log.footer();
    }

    // Parse the JSON evaluation
    return this.parseContextEvaluation(response.content);
  }

  /**
   * Parse tool call specs from the reasoning model's planning response
   */
  private parseToolCallsFromResponse(content: string): ToolCallSpec[] {
    try {
      // Try to find JSON array in the response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        return [];
      }

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter(
          (item: unknown) =>
            typeof item === 'object' && item !== null && 'name' in item
        )
        .map((item: Record<string, unknown>) => ({
          name: item.name as string,
          arguments: (item.arguments ?? {}) as Record<string, unknown>,
        }));
    } catch {
      logWarn(
        '[orchestrator] Failed to parse tool calls from planning response'
      );
      return [];
    }
  }

  /**
   * Parse context evaluation JSON from the context model's response
   */
  private parseContextEvaluation(content: string): ContextEvaluation | null {
    try {
      // Try to find JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        sufficient: parsed.sufficient ?? true,
        relevantIndices: Array.isArray(parsed.relevantIndices)
          ? parsed.relevantIndices
          : [],
        strippedIndices: Array.isArray(parsed.strippedIndices)
          ? parsed.strippedIndices
          : [],
        newToolCalls: Array.isArray(parsed.newToolCalls)
          ? parsed.newToolCalls.map((tc: Record<string, unknown>) => ({
              name: tc.name as string,
              arguments: (tc.arguments ?? {}) as Record<string, unknown>,
            }))
          : [],
      };
    } catch {
      logWarn('[orchestrator] Failed to parse context evaluation');
      return null;
    }
  }
}
