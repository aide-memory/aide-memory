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

import { ModelRuntimes, ToolDefinition, ChatResponse } from '../models/types';
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
// report_evaluation tool definition (cloud path only)
// Cloud models express their evaluation entirely through native tool calls,
// eliminating the fragile JSON-in-content parsing.
// ============================================================================

const EVALUATION_TOOL: ToolDefinition = {
  name: 'report_evaluation',
  description:
    'Report your evaluation of the gathered results. You MUST call this tool exactly once. If more context is needed (sufficient=false), also call the appropriate tools directly in the same response.',
  parameters: {
    type: 'object',
    properties: {
      sufficient: {
        type: 'boolean',
        description:
          'Whether the gathered context is sufficient to answer the question',
      },
      relevantIndices: {
        type: 'array',
        items: { type: 'number' },
        description: 'Indices of results to KEEP (e.g., [0, 2, 4]). Use the sequential indices from the evaluation prompt.',
      },
      strippedIndices: {
        type: 'array',
        items: { type: 'number' },
        description:
          'Indices of results to STRIP (e.g., [1, 3]). Results at these indices will be removed.',
      },
    },
    required: ['sufficient', 'relevantIndices'],
  },
};

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
  /** Stored during answer() so evaluateWithContextModel can pass tools to chatWithTools */
  private availableTools: ToolDefinition[] = [];
  /** Verbose logging counters (reset per answer() call) */
  private contextCallCount = 0;

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
    // Store tools so evaluateWithContextModel can access them
    this.availableTools = context.availableTools;

    const state: IterationState = {
      previousCalls: new Map(),
      relevantResults: [],
      strippedSummaries: [],
      iteration: 0,
    };

    // Verbose logging counters (reset per query)
    let globalIter = 0;
    let reasoningCallCount = 0;
    this.contextCallCount = 0;

    // Conversation history is now accessed via tool calls (search_conversation,
    // read_conversation, get_full_conversation) rather than injected into prompts.
    const hasConversation = this.toolExecutor.hasConversationHistory();

    // =====================================================================
    // Step 1: Reasoning model plans initial tool calls
    // =====================================================================
    logInfo('[orchestrator] Step 1: Reasoning model planning...');

    const reasoningUsesNativeTools = this.runtimes.reasoning.supportsNativeTools();
    const planningSystemPrompt = buildPlanningPrompt(
      context.availableTools,
      !reasoningUsesNativeTools, // include tool descriptions in text for Ollama
      hasConversation
    );

    globalIter = 1;
    reasoningCallCount++;

    if (this.verbose && this.log) {
      this.log.header(`[Iter ${globalIter}] Reasoning #${reasoningCallCount} (Planning)`);
      this.log.label('Provider mode', reasoningUsesNativeTools ? 'native tools' : 'text-based JSON');
      this.log.label('System prompt length', `${planningSystemPrompt.length} chars`);
      this.log.text(planningSystemPrompt);
      this.log.separator();
      this.log.label('User message', query);
      this.log.footer();
    }

    let planningResponse: ChatResponse;
    if (reasoningUsesNativeTools) {
      // Cloud path: use native tool calling
      planningResponse = await this.runtimes.reasoning.chatWithTools(
        [
          { role: 'system', content: planningSystemPrompt },
          { role: 'user', content: query },
        ],
        context.availableTools
      );
    } else {
      // Ollama path: use plain chat, tool descriptions are in the prompt text
      planningResponse = await this.runtimes.reasoning.chat([
        { role: 'system', content: planningSystemPrompt },
        { role: 'user', content: query },
      ]);
    }

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
      this.log.header(`[Iter ${globalIter}] Reasoning #${reasoningCallCount} Response (Planning)`);
      if (planningResponse.usage) {
        this.log.label('Tokens', `in=${planningResponse.usage.inputTokens} out=${planningResponse.usage.outputTokens}`);
      }
      if (planningResponse.toolCalls && planningResponse.toolCalls.length > 0) {
        this.log.label('Tool calls', `${planningResponse.toolCalls.length}`);
        for (const tc of planningResponse.toolCalls) {
          this.log.tool(tc.name, tc.arguments);
        }
      }
      if (planningResponse.content) {
        this.log.content(planningResponse.content);
      }
      this.log.footer();
    }

    // Parse tool calls using the appropriate method for the provider
    let toolCalls: ToolCallSpec[];
    if (reasoningUsesNativeTools) {
      // Cloud: primary extraction from structured tool calls, fallback to text
      toolCalls = this.extractToolCalls(planningResponse);
      if (toolCalls.length === 0 && planningResponse.content) {
        toolCalls = this.parseToolCallsFromResponse(planningResponse.content);
      }
    } else {
      // Ollama: parse from text response (primary path)
      toolCalls = planningResponse.content
        ? this.parseToolCallsFromResponse(planningResponse.content)
        : [];
    }

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

      globalIter = state.iteration;

      if (this.verbose && this.log) {
        this.log.header(`[Iter ${globalIter}] Executing ${toolCalls.length} tools`);
        for (const tc of toolCalls) {
          this.log.tool(tc.name, tc.arguments);
        }
        this.log.footer();
      }

      // Step 2: Execute tool calls (pure code, no model -- parallel via Promise.all)
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
        this.log.header(`[Iter ${globalIter}] Tool Results`);
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

        // Full visibility: rebuild state.relevantResults from scratch
        // The model evaluated ALL results (accumulated + new) with continuous indices:
        // [0..accumulatedLen-1] = previously kept, [accumulatedLen..total-1] = new
        const allResults = [...state.relevantResults, ...results];
        const newRelevantResults: ToolCallResult[] = [];
        let anyValidIndex = false;

        for (const idx of evaluation.relevantIndices) {
          if (idx >= 0 && idx < allResults.length) {
            newRelevantResults.push(allResults[idx]);
            anyValidIndex = true;
          }
        }

        // Safety: if model returned indices but none were valid, keep all successful results
        if (evaluation.relevantIndices.length > 0 && !anyValidIndex) {
          logWarn(
            `[orchestrator] All ${evaluation.relevantIndices.length} relevantIndices were out of bounds (max ${allResults.length - 1}). Keeping all results as fallback.`
          );
          for (const r of allResults) {
            if (r.success && r.data) {
              newRelevantResults.push(r);
            }
          }
        }

        // Safety: if relevantIndices is empty but we had accumulated results,
        // preserve them. An empty relevantIndices should not wipe existing context.
        if (evaluation.relevantIndices.length === 0 && state.relevantResults.length > 0) {
          logWarn(
            `[orchestrator] Empty relevantIndices with ${state.relevantResults.length} accumulated results. Preserving existing results.`
          );
          // Keep existing accumulated results, also add any successful new results
          for (const r of results) {
            if (r.success && r.data) {
              newRelevantResults.push(r);
            }
          }
          state.relevantResults = [...state.relevantResults, ...newRelevantResults];
        } else {
          // Replace state.relevantResults entirely (progressive refinement)
          state.relevantResults = newRelevantResults;
        }

        // Track stripped results
        for (const strippedIdx of evaluation.strippedIndices) {
          if (strippedIdx >= 0 && strippedIdx < allResults.length) {
            const r = allResults[strippedIdx];
            state.strippedSummaries.push({
              callKey: r.callKey,
              toolName: r.spec.name,
              resultSummary: (r.data ?? '').slice(0, 100),
              reason: 'stripped by context model',
            });
          }
        }

        if (evaluation.sufficient) {
          logInfo('[orchestrator] Context model: sufficient context gathered');
          break;
        }

        // Not sufficient: use follow-up calls for next iteration.
        // If the model suggests duplicate calls (already in previousCalls),
        // the executor will silently skip them.
        if (evaluation.newToolCalls.length > 0) {
          toolCalls = evaluation.newToolCalls.slice(
            0,
            this.config.maxToolCallsPerBatch
          );
          logInfo(
            `[orchestrator] Context model requested ${toolCalls.length} more calls`
          );
        } else {
          // Re-prompt fallback: model said insufficient but gave no follow-up calls
          logWarn(
            '[orchestrator] Context model said insufficient but no follow-up calls. Sending re-prompt...'
          );
          const repromptResult = await this.repromptForFollowUpCalls(query, state);
          if (repromptResult && repromptResult.length > 0) {
            toolCalls = repromptResult.slice(0, this.config.maxToolCallsPerBatch);
            logInfo(`[orchestrator] Re-prompt yielded ${toolCalls.length} follow-up calls`);
          } else {
            logWarn('[orchestrator] Re-prompt also yielded no calls, proceeding to answer');
            break;
          }
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
    // Safety-net dedup: merge overlapping line ranges before answering
    // The context model handles most dedup, but this catches any remaining
    // overlapping file ranges the model didn't consolidate.
    // =====================================================================
    state.relevantResults = this.safetyNetDedup(state.relevantResults);

    // =====================================================================
    // Step 4: Reasoning model answers with curated context
    // The reasoning model can loop back for more context (max maxReasoningLoops).
    // Cloud: uses chatWithTools, tool calls trigger loop-back.
    // Ollama: uses chat, no loop-back support (answers directly).
    // =====================================================================
    const reasoningCanLoop = reasoningUsesNativeTools;
    let reasoningLoops = 0;

    while (true) {
      logInfo(`[orchestrator] Reasoning model answering (loop ${reasoningLoops})...`);

      const curatedContext = formatResultsAsContext(state.relevantResults);

      // Answering prompt receives curated context (which may include conversation
      // tool results alongside codebase results). A flag indicates whether
      // conversation tools were available so the answering model knows follow-up
      // context may be present in the curated results.
      const canRequestMore = reasoningCanLoop && reasoningLoops < this.config.maxReasoningLoops;
      const answeringSystemPrompt = buildAnsweringPrompt(
        curatedContext,
        state.strippedSummaries,
        hasConversation,
        canRequestMore
      );

      reasoningCallCount++;

      if (this.verbose && this.log) {
        this.log.header(`[Iter ${globalIter}] Reasoning #${reasoningCallCount} (Answering)`);
        this.log.label('System prompt length', `${answeringSystemPrompt.length} chars`);
        this.log.label('Can request more context', canRequestMore ? 'yes' : 'no');
        this.log.text(answeringSystemPrompt);
        this.log.separator();
        this.log.label('User message', query);
        this.log.footer();
      }

      let answerResponse: ChatResponse;
      if (canRequestMore) {
        // Cloud path: give reasoning model tools so it can request more context
        answerResponse = await this.runtimes.reasoning.chatWithTools(
          [
            { role: 'system', content: answeringSystemPrompt },
            { role: 'user', content: query },
          ],
          context.availableTools
        );
      } else {
        // Ollama or max loops reached: plain chat, must answer
        answerResponse = await this.runtimes.reasoning.chat([
          { role: 'system', content: answeringSystemPrompt },
          { role: 'user', content: query },
        ]);
      }

      // Track answer tokens
      if (answerResponse.usage) {
        this.tracker.record(
          'model_response',
          'reasoning',
          `answer (loop ${reasoningLoops})`,
          answerResponse.usage.inputTokens,
          answerResponse.usage.outputTokens
        );
      }

      if (this.verbose && this.log) {
        this.log.header(`[Iter ${globalIter}] Reasoning #${reasoningCallCount} Response (Answering)`);
        if (answerResponse.usage) {
          this.log.label('Tokens', `in=${answerResponse.usage.inputTokens} out=${answerResponse.usage.outputTokens}`);
        }
        if (answerResponse.toolCalls && answerResponse.toolCalls.length > 0) {
          this.log.label('Requesting more context', `${answerResponse.toolCalls.length} tool calls`);
          for (const tc of answerResponse.toolCalls) {
            this.log.tool(tc.name, tc.arguments);
          }
        }
        this.log.label('Answer length', `${answerResponse.content.length} chars`);
        this.log.footer();
      }

      // Check if reasoning model wants more context (cloud path only)
      const moreToolCalls = canRequestMore
        ? this.extractToolCalls(answerResponse)
        : [];

      if (moreToolCalls.length > 0) {
        // Reasoning model loop-back: re-enter execute/evaluate loop.
        // If any calls are duplicates, the executor will silently skip them.
        reasoningLoops++;
        logInfo(
          `[orchestrator] Reasoning model requested ${moreToolCalls.length} more calls (reasoning loop ${reasoningLoops})`
        );

        toolCalls = moreToolCalls.slice(0, this.config.maxToolCallsPerBatch);

        // Run through the execute/evaluate loop again (reuse Steps 2-3)
        while (state.iteration < this.config.maxIterations) {
          state.iteration++;
          logInfo(
            `[orchestrator] Reasoning loop-back iteration ${state.iteration}: Executing ${toolCalls.length} tool calls...`
          );

          globalIter = state.iteration;

          if (this.verbose && this.log) {
            this.log.header(`[Iter ${globalIter}] Executing ${toolCalls.length} tools (reasoning loop-back)`);
            for (const tc of toolCalls) {
              this.log.tool(tc.name, tc.arguments);
            }
            this.log.footer();
          }

          const results = await this.toolExecutor.executeBatch(
            toolCalls,
            state.previousCalls
          );

          totalToolCalls += results.length;

          for (const result of results) {
            state.previousCalls.set(result.callKey, result);
          }

          if (this.verbose && this.log) {
            this.log.header(`[Iter ${globalIter}] Tool Results (reasoning loop-back)`);
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

          // Context model evaluates the new results (same full-visibility approach)
          if (this.config.enableContextStripping) {
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

            // Rebuild relevantResults from scratch (same as main loop)
            const allResults = [...state.relevantResults, ...results];
            const newRelevant: ToolCallResult[] = [];
            let anyValid = false;
            for (const idx of evaluation.relevantIndices) {
              if (idx >= 0 && idx < allResults.length) {
                newRelevant.push(allResults[idx]);
                anyValid = true;
              }
            }
            if (evaluation.relevantIndices.length > 0 && !anyValid) {
              logWarn('[orchestrator] Loop-back: all relevantIndices out of bounds, keeping all results');
              for (const r of allResults) {
                if (r.success && r.data) {
                  newRelevant.push(r);
                }
              }
            }

            // Safety: preserve accumulated results if relevantIndices is empty
            if (evaluation.relevantIndices.length === 0 && state.relevantResults.length > 0) {
              logWarn('[orchestrator] Loop-back: empty relevantIndices, preserving accumulated results');
              for (const r of results) {
                if (r.success && r.data) {
                  newRelevant.push(r);
                }
              }
              state.relevantResults = [...state.relevantResults, ...newRelevant];
            } else {
              state.relevantResults = newRelevant;
            }

            for (const strippedIdx of evaluation.strippedIndices) {
              if (strippedIdx >= 0 && strippedIdx < allResults.length) {
                const r = allResults[strippedIdx];
                state.strippedSummaries.push({
                  callKey: r.callKey,
                  toolName: r.spec.name,
                  resultSummary: (r.data ?? '').slice(0, 100),
                  reason: 'stripped by context model',
                });
              }
            }

            if (evaluation.sufficient || evaluation.newToolCalls.length === 0) {
              break;
            }

            toolCalls = evaluation.newToolCalls.slice(
              0,
              this.config.maxToolCallsPerBatch
            );
          } else {
            for (const r of results) {
              if (r.success && r.data) {
                state.relevantResults.push(r);
              }
            }
            break;
          }
        }

        // Loop back to the top of the while(true) for another answering attempt
        continue;
      }

      // No tool calls -- model is providing its final answer
      if (this.verbose && this.log) {
        this.log.header('Summary');
        this.log.label('Iterations', globalIter);
        this.log.label('Reasoning calls', reasoningCallCount);
        this.log.label('Context calls', this.contextCallCount);
        this.log.label('Total tool calls', totalToolCalls);
        this.log.label('Relevant results kept', state.relevantResults.length);
        this.log.label('Results stripped', state.strippedSummaries.length);
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
  }

  // =========================================================================
  // Internal
  // =========================================================================

  /**
   * Use the context model to evaluate tool call results.
   * Provider-aware:
   * - Cloud: uses chatWithTools with report_evaluation tool. Evaluation AND follow-up
   *   calls come through native tool calls (single channel, no JSON content parsing).
   * - Ollama: uses chat() with JSON in content (evaluation + newToolCalls embedded).
   */
  private async evaluateWithContextModel(
    query: string,
    newResults: ToolCallResult[],
    state: IterationState
  ): Promise<ContextEvaluation | null> {
    // Pre-evaluation dedup: merge overlapping file:line chunks before showing to context model.
    // This reduces noise (e.g., App.tsx:762-797 appearing in both semantic_search AND read_lines).
    const dedupedNewResults = this.safetyNetDedup(newResults);
    const dedupedAccumulated = this.safetyNetDedup(state.relevantResults);

    if (dedupedNewResults.length < newResults.length) {
      logInfo(`[orchestrator] Pre-eval dedup: new results ${newResults.length} → ${dedupedNewResults.length}`);
    }

    // Build human-readable previous call descriptions so the model can understand
    // what was already tried (hash-based keys like "search:9704bee7" are meaningless to models)
    const previousCallDescriptions = Array.from(state.previousCalls.values()).map(
      (r) => `${r.spec.name}(${JSON.stringify(r.spec.arguments)})`
    );

    // ALL models use native tool calling with simplified evaluation schema.
    // The EVALUATION_TOOL has no nested objects (followUpCalls removed), so it works
    // with both cloud and Ollama models. Follow-ups are derived from direct tool calls.
    const contextUsesNativeTools = this.runtimes.context.supportsNativeTools();

    // Full visibility: pass BOTH accumulated results AND new results
    // The prompt uses continuous indices [0..N] across both sections
    const prompt = buildContextEvaluationPrompt(
      query,
      dedupedAccumulated, // Previously kept (deduped)
      dedupedNewResults, // New this iteration (deduped)
      previousCallDescriptions,
      state.iteration,
      this.config.maxIterations,
    );

    this.contextCallCount++;

    if (this.verbose && this.log) {
      this.log.header(`[Iter ${state.iteration}] Context #${this.contextCallCount} (Eval)`);
      this.log.label('Provider mode', contextUsesNativeTools ? 'native tools' : 'text-based JSON fallback');
      this.log.label('Accumulated results', `${dedupedAccumulated.length}${dedupedAccumulated.length < state.relevantResults.length ? ` (deduped from ${state.relevantResults.length})` : ''}`);
      this.log.label('New results', `${dedupedNewResults.length}${dedupedNewResults.length < newResults.length ? ` (deduped from ${newResults.length})` : ''}`);
      this.log.label('Prompt length', `${prompt.length} chars`);
      this.log.text(prompt);
      this.log.footer();
    }

    let response: ChatResponse;
    if (contextUsesNativeTools) {
      // All models with native tools: provide EVALUATION_TOOL + all available tools.
      // Model calls report_evaluation for assessment AND other tools directly for follow-ups.
      response = await this.runtimes.context.chatWithTools(
        [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content:
              'Evaluate the above results. Call report_evaluation with your assessment. ' +
              'If you need more context, also call the appropriate tools directly.',
          },
        ],
        [EVALUATION_TOOL, ...this.availableTools]
      );
    } else {
      // Fallback: text-based JSON for models that don't support native tools
      response = await this.runtimes.context.chat([
        { role: 'system', content: prompt },
        {
          role: 'user',
          content:
            'Evaluate the above results. Respond with the JSON evaluation object.',
        },
      ]);
    }

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
      this.log.header(`[Iter ${state.iteration}] Context #${this.contextCallCount} Response`);
      if (response.usage) {
        this.log.label('Tokens', `in=${response.usage.inputTokens} out=${response.usage.outputTokens}`);
      }
      if (response.toolCalls && response.toolCalls.length > 0) {
        this.log.label('Tool calls', `${response.toolCalls.length}`);
        for (const tc of response.toolCalls) {
          this.log.tool(tc.name, tc.arguments);
        }
      }
      if (response.content) {
        this.log.content(response.content);
      }
      this.log.footer();
    }

    if (contextUsesNativeTools) {
      // Native tools: extract evaluation from report_evaluation tool call,
      // and follow-up requests from all other direct tool calls.
      return this.parseNativeEvaluation(response, state.relevantResults.length);
    } else {
      // Text fallback: parse evaluation from JSON in text content
      return this.parseTextEvaluation(response.content);
    }
  }

  /**
   * Parse evaluation from native tool calls (works for both cloud and Ollama).
   *
   * The model should call report_evaluation for its assessment AND call other
   * tools directly for follow-ups. No nested followUpCalls in the schema.
   */
  private parseNativeEvaluation(
    response: ChatResponse,
    accumulatedCount: number
  ): ContextEvaluation | null {
    if (!response.toolCalls || response.toolCalls.length === 0) {
      logWarn('[orchestrator] Context model returned no tool calls');
      return null;
    }

    const evalCall = response.toolCalls.find((tc) => tc.name === 'report_evaluation');

    // Collect direct tool calls (not report_evaluation) as follow-ups.
    // This is the PRIMARY mechanism for follow-up calls now.
    const followUpCalls: ToolCallSpec[] = response.toolCalls
      .filter((tc) => tc.name !== 'report_evaluation' && tc.name !== 'done')
      .map((tc) => ({
        name: tc.name,
        arguments:
          typeof tc.arguments === 'string'
            ? JSON.parse(tc.arguments)
            : (tc.arguments ?? {}),
      }));

    if (!evalCall) {
      // Model didn't call report_evaluation — only made direct tool calls.
      // Treat as insufficient with accumulated results preserved.
      if (followUpCalls.length > 0) {
        return {
          sufficient: false,
          relevantIndices: Array.from({ length: accumulatedCount }, (_, i) => i),
          strippedIndices: [],
          newToolCalls: followUpCalls,
        };
      }
      logWarn('[orchestrator] Context model returned no report_evaluation and no tool calls');
      return null;
    }

    // Parse the evaluation arguments from report_evaluation
    const args =
      typeof evalCall.arguments === 'string'
        ? JSON.parse(evalCall.arguments)
        : (evalCall.arguments ?? {});

    const evaluation: ContextEvaluation = {
      sufficient: args.sufficient ?? true,
      relevantIndices: Array.isArray(args.relevantIndices)
        ? args.relevantIndices
        : [],
      strippedIndices: this.normalizeStrippedIndices(args.strippedIndices),
      newToolCalls: followUpCalls,
    };

    return evaluation;
  }

  /**
   * Normalize strippedIndices: models may return numbers [1, 3] or objects [{index: 1, reason: "..."}].
   * Always returns number[].
   */
  private normalizeStrippedIndices(raw: unknown): number[] {
    if (!Array.isArray(raw)) return [];
    return raw
      .map((item: unknown) => {
        if (typeof item === 'number') return item;
        if (typeof item === 'object' && item !== null && 'index' in item) {
          return (item as { index: number }).index;
        }
        return null;
      })
      .filter((idx): idx is number => idx !== null);
  }

  /**
   * Extract structured tool calls from a ChatResponse (native tool calling).
   * Maps provider-specific ToolCallRequest[] to our ToolCallSpec[].
   */
  private extractToolCalls(response: ChatResponse): ToolCallSpec[] {
    if (!response.toolCalls || response.toolCalls.length === 0) return [];

    return response.toolCalls
      .filter((tc) => tc.name !== 'done')
      .map((tc) => ({
        name: tc.name,
        arguments:
          typeof tc.arguments === 'string'
            ? JSON.parse(tc.arguments)
            : (tc.arguments ?? {}),
      }));
  }

  /**
   * Parse tool call specs from text (fallback for models that don't use native tool calling).
   * Handles multiple JSON arrays and prose mixed in.
   */
  private parseToolCallsFromResponse(content: string): ToolCallSpec[] {
    const allCalls: ToolCallSpec[] = [];

    try {
      // Extract all valid JSON arrays from the response individually.
      // This handles models that output multiple arrays or mix prose with JSON.
      let searchFrom = 0;
      while (searchFrom < content.length) {
        const start = content.indexOf('[', searchFrom);
        if (start === -1) break;

        // Try to find matching closing bracket by parsing progressively
        let found = false;
        for (let end = start + 2; end <= content.length; end++) {
          if (content[end - 1] === ']') {
            try {
              const parsed = JSON.parse(content.slice(start, end));
              if (Array.isArray(parsed) && parsed.length > 0) {
                // Valid array found — extract tool call objects
                for (const item of parsed) {
                  if (
                    typeof item === 'object' &&
                    item !== null &&
                    'name' in item &&
                    item.name !== 'done'
                  ) {
                    allCalls.push({
                      name: item.name as string,
                      arguments: (item.arguments ?? {}) as Record<
                        string,
                        unknown
                      >,
                    });
                  }
                }
                searchFrom = end;
                found = true;
                break;
              }
            } catch {
              // Not valid JSON yet, keep extending
            }
          }
        }

        // If no valid array found starting at this '[', skip it
        if (!found) {
          searchFrom = start + 1;
        }
      }
    } catch {
      logWarn(
        '[orchestrator] Failed to parse tool calls from planning response'
      );
    }

    if (allCalls.length > 0) {
      logInfo(
        `[orchestrator] Parsed ${allCalls.length} tool calls from text fallback`
      );
    }

    return allCalls;
  }

  /**
   * Parse context evaluation JSON from text content (fallback for models without native tools).
   */
  private parseTextEvaluation(content: string): ContextEvaluation | null {
    try {
      // Try to find JSON object in the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Support followUpCalls / newToolCalls in text-based JSON output
      const rawFollowUps = Array.isArray(parsed.followUpCalls)
        ? parsed.followUpCalls
        : Array.isArray(parsed.newToolCalls)
          ? parsed.newToolCalls
          : [];

      return {
        sufficient: parsed.sufficient ?? true,
        relevantIndices: Array.isArray(parsed.relevantIndices)
          ? parsed.relevantIndices
          : [],
        strippedIndices: this.normalizeStrippedIndices(parsed.strippedIndices),
        newToolCalls: rawFollowUps
          .filter((tc: Record<string, unknown>) => tc.name && tc.name !== 'done')
          .map((tc: Record<string, unknown>) => ({
            name: tc.name as string,
            arguments: (tc.arguments ?? {}) as Record<string, unknown>,
          })),
      };
    } catch {
      logWarn('[orchestrator] Failed to parse context evaluation from text');
      return null;
    }
  }

  /**
   * Universal deduplication: merge results that reference overlapping file line ranges.
   * Works across ALL tool types (semantic_search, read_lines, read_file, get_file_chunk, find_symbol).
   * Groups by file path, unions overlapping ranges.
   */
  private safetyNetDedup(results: ToolCallResult[]): ToolCallResult[] {
    if (results.length <= 1) return results;

    interface FileRange {
      filePath: string;
      startLine: number;
      endLine: number;
    }

    /**
     * Extract file:line ranges from ANY tool result type.
     * - read_lines / get_file_chunk: from arguments (filePath, startLine, endLine)
     * - semantic_search / find_symbol: parse "file.ts:start-end" patterns from result data
     * - read_file: entire file (no line range to dedup against)
     */
    const parseFileRanges = (r: ToolCallResult): FileRange[] => {
      const ranges: FileRange[] = [];

      // Direct from arguments (read_lines, get_file_chunk)
      if (
        (r.spec.name === 'read_lines' || r.spec.name === 'get_file_chunk') &&
        r.spec.arguments.filePath &&
        r.spec.arguments.startLine != null &&
        r.spec.arguments.endLine != null
      ) {
        ranges.push({
          filePath: r.spec.arguments.filePath as string,
          startLine: r.spec.arguments.startLine as number,
          endLine: r.spec.arguments.endLine as number,
        });
        return ranges;
      }

      // Parse from result data (semantic_search, find_symbol, etc.)
      // Format: "- path/file.ts:start-end" or "path/file.ts:start-end:"
      if (r.data) {
        const rangePattern = /[-\s]*([^\s:]+\.[a-zA-Z]+):(\d+)-(\d+)/g;
        let match: RegExpExecArray | null;
        while ((match = rangePattern.exec(r.data)) !== null) {
          ranges.push({
            filePath: match[1],
            startLine: parseInt(match[2], 10),
            endLine: parseInt(match[3], 10),
          });
        }
      }

      return ranges;
    };

    // Group all file ranges across all results
    const byFile = new Map<string, Array<{ result: ToolCallResult; range: FileRange }>>();
    const noRangeResults: ToolCallResult[] = [];

    for (const r of results) {
      const ranges = parseFileRanges(r);
      if (ranges.length === 0) {
        noRangeResults.push(r);
      } else {
        // For results with explicit ranges (read_lines), use the single range
        // For results with multiple ranges (semantic_search), check each range
        for (const range of ranges) {
          const key = range.filePath;
          if (!byFile.has(key)) byFile.set(key, []);
          byFile.get(key)!.push({ result: r, range });
        }
      }
    }

    // For each file, merge overlapping ranges and keep only non-overlapping results
    const dedupedResults = new Set<ToolCallResult>();
    for (const [, group] of byFile) {
      if (group.length === 1) {
        dedupedResults.add(group[0].result);
        continue;
      }

      // Sort by start line
      group.sort((a, b) => a.range.startLine - b.range.startLine);

      // Merge overlapping ranges, keep the result with the largest span
      const kept: typeof group = [group[0]];
      for (let i = 1; i < group.length; i++) {
        const prev = kept[kept.length - 1];
        const curr = group[i];

        if (curr.range.startLine <= prev.range.endLine + 5) {
          // Overlapping or adjacent (within 5 lines): keep the one with more content
          const prevSpan = prev.range.endLine - prev.range.startLine;
          const currSpan = curr.range.endLine - curr.range.startLine;
          if (currSpan > prevSpan) {
            kept[kept.length - 1] = curr;
          }
        } else {
          kept.push(curr);
        }
      }

      for (const k of kept) {
        dedupedResults.add(k.result);
      }
    }

    // Combine: non-range results + deduped file-range results (preserving order)
    const dedupedOrdered: ToolCallResult[] = [];
    for (const r of results) {
      if (noRangeResults.includes(r) || dedupedResults.has(r)) {
        // Avoid adding the same result twice (if it appeared in multiple file groups)
        if (!dedupedOrdered.includes(r)) {
          dedupedOrdered.push(r);
        }
      }
    }

    if (dedupedOrdered.length < results.length) {
      logInfo(`[orchestrator] Universal dedup: ${results.length} → ${dedupedOrdered.length} results`);
    }

    return dedupedOrdered;
  }

  /**
   * Re-prompt the context model when it says insufficient but provides no follow-up calls.
   * Returns extracted tool call specs, or null/empty if re-prompt also fails.
   */
  private async repromptForFollowUpCalls(
    query: string,
    _state: IterationState
  ): Promise<ToolCallSpec[] | null> {
    const repromptMessage = `You indicated more context is needed but didn't specify follow-up tool calls. Based on the results you kept, what specific tool calls should be made next to address: "${query}"? You MUST call at least one tool.`;

    try {
      if (this.runtimes.context.supportsNativeTools()) {
        const response = await this.runtimes.context.chatWithTools(
          [{ role: 'user', content: repromptMessage }],
          this.availableTools
        );
        const calls = this.extractToolCalls(response);
        return calls.length > 0 ? calls : null;
      } else {
        const response = await this.runtimes.context.chat([
          { role: 'user', content: repromptMessage + '\n\nRespond with a JSON array of tool calls: [{"name": "...", "arguments": {...}}]' },
        ]);
        const calls = this.parseToolCallsFromResponse(response.content);
        return calls.length > 0 ? calls : null;
      }
    } catch (err) {
      logWarn(`[orchestrator] Re-prompt failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      return null;
    }
  }
}
