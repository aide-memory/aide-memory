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
import { ChatMessage } from '../brain/types';
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

// ============================================================================
// Orchestrator
// ============================================================================

export class Orchestrator {
  private runtimes: ModelRuntimes;
  private toolExecutor: ToolExecutor;
  private tracker: TokenTracker;
  private config: OrchestratorConfig;

  constructor(
    runtimes: ModelRuntimes,
    toolExecutor: ToolExecutor,
    tracker: TokenTracker,
    config?: Partial<OrchestratorConfig>
  ) {
    this.runtimes = runtimes;
    this.toolExecutor = toolExecutor;
    this.tracker = tracker;
    this.config = { ...DEFAULT_ORCHESTRATOR_CONFIG, ...config };
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

    // Build conversation context string if available
    const conversationContext = context.conversationHistory
      ?.slice(-6)
      .map((m) => `${m.role}: ${m.content.slice(0, 200)}`)
      .join('\n');

    // =====================================================================
    // Step 1: Reasoning model plans initial tool calls
    // =====================================================================
    logInfo('[orchestrator] Step 1: Reasoning model planning...');

    const planningSystemPrompt = buildPlanningPrompt(
      context.availableTools,
      conversationContext
    );

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

    // Parse tool calls from planning response
    let toolCalls = this.parseToolCallsFromResponse(planningResponse.content);

    if (toolCalls.length === 0) {
      logWarn('[orchestrator] Planning model returned no tool calls, attempting direct answer');
      // Fall back to direct answer
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
      logInfo(`[orchestrator] Iteration ${state.iteration}: Executing ${toolCalls.length} tool calls...`);

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
        // Collect all non-done results as relevant
        for (const r of results) {
          if (r.spec.name !== 'done' && r.success && r.data) {
            state.relevantResults.push(r);
          }
        }
        break;
      }

      // Step 3: Context model evaluates results
      if (this.config.enableContextStripping) {
        logInfo(`[orchestrator] Iteration ${state.iteration}: Context model evaluating...`);

        const evaluation = await this.evaluateWithContextModel(
          query,
          results,
          state
        );

        if (!evaluation) {
          // Context model failed to produce valid evaluation, keep all results
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
          logInfo(`[orchestrator] Context model requested ${toolCalls.length} more calls`);
        } else {
          logInfo('[orchestrator] Context model requested no more calls, finishing');
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

    const answeringSystemPrompt = buildAnsweringPrompt(
      curatedContext,
      state.strippedSummaries
    );

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

    const response = await this.runtimes.context.chat([
      { role: 'system', content: prompt },
      {
        role: 'user',
        content: 'Evaluate the above results and respond with the JSON evaluation.',
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
            typeof item === 'object' &&
            item !== null &&
            'name' in item
        )
        .map((item: Record<string, unknown>) => ({
          name: item.name as string,
          arguments: (item.arguments ?? {}) as Record<string, unknown>,
        }));
    } catch {
      logWarn('[orchestrator] Failed to parse tool calls from planning response');
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
        relevantIndices: Array.isArray(parsed.relevantIndices) ? parsed.relevantIndices : [],
        strippedIndices: Array.isArray(parsed.strippedIndices) ? parsed.strippedIndices : [],
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
