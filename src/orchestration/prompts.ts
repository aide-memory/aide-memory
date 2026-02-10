/**
 * Orchestration Prompts
 *
 * All prompt templates for model handoffs in the orchestration loop.
 * Each prompt clearly states: who the model is, what it received,
 * what to output, and what constraints apply.
 */

import { ToolDefinition } from '../models/types';
import { ToolCallResult, ToolCallSummary } from './types';

// ============================================================================
// Reasoning Model Prompts
// ============================================================================

/**
 * System prompt for the reasoning model's planning phase.
 * The model receives the user query and available tools,
 * and outputs a JSON array of tool calls to gather context.
 *
 * @param availableTools - tools the model can use (includes conversation tools when history exists)
 * @param hasConversation - whether conversation tools are available (history exists)
 */
export function buildPlanningPrompt(
  availableTools: ToolDefinition[],
  hasConversation: boolean
): string {
  const toolDescriptions = availableTools
    .map((t) => {
      const params = Object.entries(t.parameters.properties)
        .map(([name, prop]) => `    ${name} (${prop.type}): ${prop.description}`)
        .join('\n');
      const required = t.parameters.required?.join(', ') || 'none';
      return `  - ${t.name}: ${t.description}\n    Parameters:\n${params}\n    Required: ${required}`;
    })
    .join('\n\n');

  let prompt = `You are the PLANNING model. Your job is to decide which tool calls to make to gather the context needed to answer the user's question.

You have these tools available:
${toolDescriptions}

IMPORTANT GUIDELINES:
- Start with semantic_search to find relevant entry points -- do NOT start with list_packages or broad file listing
- Plan targeted, specific tool calls based on the question
- Plan ALL the tool calls you think you'll need upfront. It is better to make 5 targeted calls in one batch than 1 call across 5 iterations.
- Output a JSON array of tool call objects: [{"name": "tool_name", "arguments": {...}}, ...]
- Keep batches focused (max 5-8 calls)
- These calls will be executed by code and evaluated by another model
- Output ONLY the JSON array, no other text`;

  if (hasConversation) {
    prompt += `

CONVERSATION CONTEXT:
The user may be asking a follow-up question. Conversation tools are available.
- If the question references something previously discussed (e.g., "what did you suggest", "the delay you mentioned", "show me how to implement that"), ALWAYS include get_conversation_history in your batch. This retrieves the full recent conversation so you can find the exact prior answer.
- search_conversation is useful for targeted keyword lookups, but get_conversation_history is more reliable for follow-up questions since it returns full messages rather than requiring exact keyword matches.
- You can combine conversation and codebase tool calls in the same batch.`;
  }

  return prompt;
}

/**
 * System prompt for the reasoning model's answering phase.
 * The model receives curated context and produces the final answer.
 *
 * @param relevantContext - curated context from tool results (may include conversation tool results)
 * @param strippedSummaries - summaries of stripped results
 * @param hasConversation - whether conversation tools were available
 */
export function buildAnsweringPrompt(
  relevantContext: string,
  strippedSummaries: ToolCallSummary[],
  hasConversation: boolean
): string {
  let prompt = `You are the ANSWERING model. You have been given curated context gathered by the planning and context evaluation pipeline. Answer the user's question based on this context.`;

  if (hasConversation) {
    prompt += `

NOTE: This is a conversation with history. The curated context may include results from conversation tools (get_conversation_history, search_conversation) alongside codebase results. If the user's question refers to something from a previous answer (e.g., "the solution you proposed", "what delay did you suggest"), use the conversation context to answer. You do NOT need to search the codebase for answers that were already given.`;
  }

  prompt += `\n\n## Curated Context\n${relevantContext}`;

  if (strippedSummaries.length > 0) {
    const summaries = strippedSummaries
      .map((s) => `  - ${s.toolName}: ${s.resultSummary} (stripped: ${s.reason})`)
      .join('\n');
    prompt += `\n\n## Also Retrieved but Deemed Not Relevant\nThe following was also retrieved but deemed not relevant to the question:\n${summaries}\n\nIf you believe any of this information IS relevant, mention it in your answer.`;
  }

  prompt += `\n\nGuidelines:
- Reference specific file paths and line numbers when possible
- Be concrete and specific -- cite actual code
- If the question refers to a previous answer in conversation history, reference that answer directly
- If the context is insufficient, say so clearly
- Do NOT make up code that isn't in the context`;

  return prompt;
}

// ============================================================================
// Context Model Prompts
// ============================================================================

/**
 * System prompt for the context model's evaluation phase.
 * The model evaluates tool call results and decides what's relevant.
 */
export function buildContextEvaluationPrompt(
  userQuery: string,
  results: ToolCallResult[],
  previousCallKeys: string[],
  iteration: number,
  maxIterations: number
): string {
  const resultsFormatted = results
    .map((r, i) => {
      const data = r.data ? r.data.slice(0, 2000) : '(empty)';
      return `### Result ${i}: ${r.spec.name}(${JSON.stringify(r.spec.arguments)})
${r.success ? data : `ERROR: ${r.error}`}`;
    })
    .join('\n\n');

  const previousCallsList =
    previousCallKeys.length > 0
      ? `\nDo NOT repeat these previous calls:\n${previousCallKeys.map((k) => `  - ${k}`).join('\n')}`
      : '';

  return `You are the CONTEXT EVALUATION model. The planning model requested tool calls and here are the results. Your job is to:

1. Decide which results are RELEVANT to the user's question
2. Which results should be STRIPPED (not relevant)
3. Whether you need MORE context (additional tool calls)

User's question: "${userQuery}"

## Tool Call Results
${resultsFormatted}

## Constraints
- Iteration ${iteration} of max ${maxIterations}
- You CANNOT repeat previous tool calls${previousCallsList}
- Keep only what directly helps answer the question
- For each stripped result, explain briefly why

## Batching & Efficiency
- If you need more context, batch ALL needed tool calls together in newToolCalls (prefer 3-5 calls per batch, NOT 1 at a time)
- Only request more context if the existing results are clearly insufficient to answer the question
- Prefer marking sufficient=true with partial context over requesting many follow-up iterations
- Each iteration costs tokens and time. Be decisive about what's needed.
- If conversation tool results answer the user's question, mark sufficient=true immediately.

## Output Format
Respond with a JSON object:
{
  "sufficient": true/false,
  "relevantIndices": [0, 2, ...],
  "strippedIndices": [{"index": 1, "reason": "not related to auth"}],
  "newToolCalls": [{"name": "tool_name", "arguments": {...}}]
}

If sufficient=true, newToolCalls should be empty.
Output ONLY the JSON object, no other text.`;
}

// ============================================================================
// Utility
// ============================================================================

/**
 * Format tool call results into a readable context string
 */
export function formatResultsAsContext(results: ToolCallResult[]): string {
  return results
    .filter((r) => r.success && r.data)
    .map((r) => {
      return `### ${r.spec.name}(${JSON.stringify(r.spec.arguments)})\n${r.data}`;
    })
    .join('\n\n---\n\n');
}
