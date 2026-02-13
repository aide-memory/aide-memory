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
        .map(
          ([name, prop]) => `    ${name} (${prop.type}): ${prop.description}`,
        )
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
  hasConversation: boolean,
): string {
  let prompt = `You are the PLANNING model. Your job is to call the available tools to gather the context needed to address the user's request about their codebase.`;

  if (includeToolDescriptions) {
    // Ollama path: include full tool descriptions and JSON output format in text
    const toolDescriptions = formatToolDescriptions(availableTools);
    prompt += `

Available tools:
${toolDescriptions}`;
  }

  prompt += `

IMPORTANT GUIDELINES:
- Start with semantic_search to find relevant entry points
- Use read_lines to drill into specific line ranges from entry points (prefer over read_file when you know the location)
- Use read_file_outline to understand file structure before reading full files
- Use find_symbol when you know a specific symbol name to look up
- For follow-up questions, use search_conversation to find relevant prior discussion, then read_conversation to get the full exchange
- topK guidance: 4-6 for focused queries, 6-8 for broader questions, 8-12 for surveys
- Call ALL tools you need in a single batch (prefer 3-5 targeted calls)
- The results will be evaluated by another model that decides what is relevant`;

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
- If the question is short and vague (e.g., "fix it", "show me", "how?"), it is almost certainly a follow-up. Prioritize conversation history over broad codebase searches.
- Use search_conversation to find relevant prior exchanges, then read_conversation to get full content.
- Only search the codebase for specific files/symbols mentioned in the conversation.
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
 * @param canRequestMore - whether the model can request more context via tool calls
 */
export function buildAnsweringPrompt(
  relevantContext: string,
  strippedSummaries: ToolCallSummary[],
  hasConversation: boolean,
  canRequestMore: boolean = false,
): string {
  let prompt = `You are the ANSWERING model. You have been given curated context gathered by the planning and context evaluation pipeline. Address the user's request based on this context.`;

  if (hasConversation) {
    prompt += `

NOTE: This is a conversation with history. The curated context may include results from conversation tools (search_conversation, read_conversation, get_full_conversation) alongside codebase results. If the user's question refers to something from a previous answer (e.g., "the solution you proposed", "what delay did you suggest"), use the conversation context to answer. You do NOT need to search the codebase for answers that were already given.`;
  }

  if (canRequestMore) {
    prompt += `

IMPORTANT: If the curated context is clearly missing critical information needed to answer the question (e.g., a function implementation is referenced but not shown, a key file is mentioned but not included), you can request more context by calling the available tools (e.g., read_file, read_lines, semantic_search, find_symbol). Only do this if the context is genuinely insufficient -- prefer answering with what you have over requesting more rounds.`;
  }

  prompt += `\n\n## Curated Context\n${relevantContext}`;

  if (strippedSummaries.length > 0) {
    const summaries = strippedSummaries
      .map(
        (s) => `  - ${s.toolName}: ${s.resultSummary} (stripped: ${s.reason})`,
      )
      .join('\n');
    prompt += `\n\n## Also Retrieved but Deemed Not Relevant\nThe following was also retrieved but deemed not relevant to the question:\n${summaries}\n\nIf you believe any of this information IS relevant, mention it in your answer.`;
  }

  prompt += `\n\nGuidelines:
- Answer directly, concisely, and confidently as if you are an expert who has already studied the code.
- Do NOT hedge with phrases like "Based on the provided context", "I don't see", "The context doesn't show". You have been given curated, relevant context -- trust it.
- Do NOT claim code is missing without carefully reviewing ALL provided context including the "Also Retrieved" section.
- Reference specific file paths and line numbers when possible.
- Be concrete and specific -- cite actual code.
- If the request refers to a previous answer in conversation history, reference that answer directly.
- Do NOT make up code that isn't in the context.`;

  return prompt;
}

// ============================================================================
// Context Model Prompts
// ============================================================================

/**
 * System prompt for the context model's evaluation phase.
 * The model sees ALL accumulated results (previously kept + new) and evaluates everything.
 *
 * @param userQuery - the original user question
 * @param accumulatedResults - previously kept results (from prior iterations)
 * @param newResults - new tool call results from current iteration
 * @param previousCallKeys - dedup keys for calls already made
 * @param iteration - current iteration number
 * @param maxIterations - max allowed iterations
 * @param includeFollowUpCallsInJson - true for Ollama (followUpCalls in JSON), false for cloud (native tool calls)
 */
export function buildContextEvaluationPrompt(
  userQuery: string,
  accumulatedResults: ToolCallResult[],
  newResults: ToolCallResult[],
  previousCallKeys: string[],
  iteration: number,
  maxIterations: number,
): string {
  // Build a single continuous index across accumulated + new results
  let globalIndex = 0;
  let resultsFormatted = '';

  if (accumulatedResults.length > 0) {
    resultsFormatted += '### Previously Kept Context\n\n';
    for (const r of accumulatedResults) {
      const data = r.data || '(empty)';
      resultsFormatted += `[${globalIndex}] ${r.spec.name}(${JSON.stringify(r.spec.arguments)})\n${r.success ? data : `ERROR: ${r.error}`}\n\n`;
      globalIndex++;
    }
  }

  resultsFormatted += '### New This Iteration\n\n';
  for (const r of newResults) {
    const data = r.data || '(empty)';
    resultsFormatted += `[${globalIndex}] ${r.spec.name}(${JSON.stringify(r.spec.arguments)})\n${r.success ? data : `ERROR: ${r.error}`}\n\n`;
    globalIndex++;
  }

  const totalResults = globalIndex;

  const previousCallsList =
    previousCallKeys.length > 0
      ? `\nDo NOT repeat these previous calls:\n${previousCallKeys.map((k) => `  - ${k}`).join('\n')}`
      : '';

  const prompt = `You are the CONTEXT EVALUATION model. Your job is to evaluate ALL results below and decide:

1. Which results to KEEP (relevant to the user's request)
2. Which results to STRIP (not relevant) -- you can strip previously kept results if they are now superseded
3. Whether you need MORE context (if so, call the appropriate tools directly)

User's request: "${userQuery}"

## All Results to Evaluate (indices 0-${totalResults - 1})

${resultsFormatted}
## Constraints
- Iteration ${iteration} of max ${maxIterations}
- You CANNOT repeat previous tool calls${previousCallsList}
- Keep only what directly helps address the user's request
- You CAN strip previously kept results if they are now superseded by better new results

## Tool Usage Guide
You have access to all available tools. Use the right tool for the job:
- **semantic_search**: Find entry points by meaning. Use FIRST when you don't know where to look.
- **read_lines**: Read specific line ranges. Use to drill into code found by semantic_search or outlines.
- **read_file_outline**: Get file structure (functions, classes). Use before reading entire files.
- **find_symbol**: Look up specific symbol names (functions, classes, variables).
- **get_references / get_dependencies**: Find usage or dependencies of a symbol.
- **read_file**: Read a full file. Only use for small files.
- **search_conversation / read_conversation**: Access prior conversation history for follow-up questions.

## How to Respond
1. Call \`report_evaluation\` with your assessment:
   - \`sufficient\`: true if you can point to specific code that answers the request, false otherwise
   - \`relevantIndices\`: array of indices (0-${totalResults - 1}) to KEEP
   - \`strippedIndices\`: array of indices to DISCARD
2. If \`sufficient=false\`, also call the tools you need **directly** in the same response.
   - Batch 2-5 targeted tool calls together.
   - Use diverse tools (don't just repeat semantic_search).
   - If initial results are too vague, use read_lines/read_file_outline to drill down.

Additional guidance:
- The code you need may not match the user's exact words. For example, a useEffect with scrollIntoView IS "scrolling behavior".
- If follow-up searches keep returning no results, the answer is likely already in what you have -> sufficient=true.
${iteration >= maxIterations ? '- This is the LAST iteration. You MUST set sufficient=true and work with what you have.' : ''}`;

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
