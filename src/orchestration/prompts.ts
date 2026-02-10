/**
 * Orchestration Prompts
 *
 * All prompt templates for model handoffs in the orchestration loop.
 * Each prompt clearly states: who the model is, what it received,
 * what to output, and what constraints apply.
 *
 * Prompts are parameterized for provider-aware operation:
 * - Cloud providers (OpenAI, Anthropic, Google): tools passed natively via chatWithTools(),
 *   prompts focus on behavioral guidance only.
 * - Ollama (local): tools described in prompt text, output format includes tool calls in JSON.
 */

import { ToolDefinition } from '../models/types';
import { ToolCallResult, ToolCallSummary } from './types';

// ============================================================================
// Utility: Format tool descriptions for text-based prompts (Ollama path)
// ============================================================================

function formatToolDescriptions(tools: ToolDefinition[]): string {
  return tools
    .map((t) => {
      const params = Object.entries(t.parameters.properties)
        .map(([name, prop]) => `    ${name} (${prop.type}): ${prop.description}`)
        .join('\n');
      const required = t.parameters.required?.join(', ') || 'none';
      return `  - ${t.name}: ${t.description}\n    Parameters:\n${params}\n    Required: ${required}`;
    })
    .join('\n\n');
}

// ============================================================================
// Reasoning Model Prompts
// ============================================================================

/**
 * System prompt for the reasoning model's planning phase.
 *
 * @param availableTools - tools the model can use (always passed for reference)
 * @param includeToolDescriptions - true for Ollama (text-based), false for cloud (native tools)
 * @param hasConversation - whether conversation tools are available (history exists)
 */
export function buildPlanningPrompt(
  availableTools: ToolDefinition[],
  includeToolDescriptions: boolean,
  hasConversation: boolean
): string {
  let prompt = `You are the PLANNING model. Your job is to call the available tools to gather the context needed to answer the user's question about their codebase.`;

  if (includeToolDescriptions) {
    // Ollama path: include full tool descriptions and JSON output format in text
    const toolDescriptions = formatToolDescriptions(availableTools);
    prompt += `

Available tools:
${toolDescriptions}`;
  }

  prompt += `

IMPORTANT GUIDELINES:
- Start with semantic_search to find relevant entry points -- do NOT start with list_packages or broad file listing
- Plan targeted, specific tool calls based on the question
- Call ALL the tools you need upfront in a single batch. It is better to make 5 targeted calls in one batch than 1 call across 5 iterations.
- Keep batches focused (max 5-8 calls)
- The results will be evaluated by another model that decides what is relevant
- Call the "done" tool when you have gathered enough context`;

  if (includeToolDescriptions) {
    // Ollama path: instruct JSON array output since there's no native tool calling
    prompt += `

OUTPUT FORMAT:
Respond with a JSON array of tool calls, each with "name" and "arguments":
[
  {"name": "semantic_search", "arguments": {"query": "..."}},
  {"name": "read_file", "arguments": {"filePath": "..."}}
]
Output ONLY the JSON array, no other text.`;
  }

  if (hasConversation) {
    prompt += `

CONVERSATION CONTEXT:
The user may be asking a follow-up question. Conversation tools are available.
- If the question references something previously discussed (e.g., "what did you suggest", "the delay you mentioned", "show me how to implement that"), ALWAYS include get_conversation_history in your batch.
- search_conversation is useful for targeted keyword lookups, but get_conversation_history is more reliable for follow-up questions.
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
 *
 * @param userQuery - the original user question
 * @param results - tool call results to evaluate
 * @param previousCallKeys - dedup keys for calls already made
 * @param iteration - current iteration number
 * @param maxIterations - max allowed iterations
 * @param includeNewToolCallsInJson - true for Ollama (newToolCalls in JSON), false for cloud (native tool calls)
 */
export function buildContextEvaluationPrompt(
  userQuery: string,
  results: ToolCallResult[],
  previousCallKeys: string[],
  iteration: number,
  maxIterations: number,
  includeNewToolCallsInJson: boolean
): string {
  // Full untruncated results so the context model can make informed relevance decisions
  const resultsFormatted = results
    .map((r, i) => {
      const data = r.data || '(empty)';
      return `### Result ${i}: ${r.spec.name}(${JSON.stringify(r.spec.arguments)})
${r.success ? data : `ERROR: ${r.error}`}`;
    })
    .join('\n\n');

  const previousCallsList =
    previousCallKeys.length > 0
      ? `\nDo NOT repeat these previous calls:\n${previousCallKeys.map((k) => `  - ${k}`).join('\n')}`
      : '';

  let prompt = `You are the CONTEXT EVALUATION model. The planning model requested tool calls and here are the results. Your job is to:

1. Decide which results are RELEVANT to the user's question
2. Which results should be STRIPPED (not relevant)
3. Whether you need MORE context (if so, request additional tool calls)

User's question: "${userQuery}"

## Tool Call Results
${resultsFormatted}

## Constraints
- Iteration ${iteration} of max ${maxIterations}
- You CANNOT repeat previous tool calls${previousCallsList}
- Keep only what directly helps answer the question
- For each stripped result, explain briefly why

## Efficiency
- Only request more context if the existing results are clearly insufficient to answer the question
- Prefer marking sufficient=true with partial context over requesting many follow-up iterations
- Each iteration costs tokens and time. Be decisive about what's needed.
- If conversation tool results answer the user's question, mark sufficient=true immediately.
- If you need more context, batch all needed calls together (prefer 3-5 calls, NOT 1 at a time).`;

  if (includeNewToolCallsInJson) {
    // Ollama path: newToolCalls in JSON output. No explicit tool descriptions —
    // the model infers available tools from the tool call results it's evaluating.
    prompt += `

## Output Format
Respond with a JSON object:
{
  "sufficient": true/false,
  "relevantIndices": [0, 2, ...],
  "strippedIndices": [{"index": 1, "reason": "not related to auth"}],
  "newToolCalls": [{"name": "tool_name", "arguments": {...}}]
}

If sufficient=true, newToolCalls should be empty.
If sufficient=false, include the tool calls you need in newToolCalls. Batch all needed calls (prefer 3-5, NOT 1 at a time).
Output ONLY the JSON object, no other text.`;
  } else {
    // Cloud path: simpler JSON format; follow-up tool calls go through native tool calling
    prompt += `

## Output Format
Respond with a JSON object:
{
  "sufficient": true/false,
  "relevantIndices": [0, 2, ...],
  "strippedIndices": [{"index": 1, "reason": "not related to auth"}]
}

If sufficient=false and you need more context, use the available tools to request it.
If sufficient=true, no additional tool calls are needed.
Output ONLY the JSON object, no other text.`;
  }

  return prompt;
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
