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

STEP 1 - Find entry points:
- Use semantic_search to identify relevant files and code locations
- Make each query target a DIFFERENT aspect or angle of the request
- Avoid making multiple queries that rephrase the same concept

STEP 2 - Gather context from entry points:
- read_lines: read specific code at line ranges found by semantic_search
- read_file_outline: understand file structure (functions, classes, exports)
- find_symbol: look up a specific function, class, or variable by name

STEP 3 - Explore relationships (when graph tools are available):
- get_references: find what calls or uses a symbol
- get_dependencies: find what a symbol depends on

BATCHING:
- Batch calls that are DIVERSE and independent (e.g., a semantic_search + a read_lines + a find_symbol)
- Do NOT batch multiple semantic_search calls with similar queries -- they return similar results
- topK guidance: 4-6 for focused queries, 6-8 for broader questions, 8-12 for surveys

The results will be evaluated by another model that decides what is relevant.`;

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
The user may be asking a follow-up question. Conversation tools are available:
- search_conversation: find relevant prior exchanges by meaning
- read_conversation: read full content of specific exchanges
- get_full_conversation: get the entire conversation history
If the question is short or references previous discussion, prioritize conversation tools.
You can combine conversation and codebase tool calls in the same batch.`;
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

IMPORTANT: If the curated context is missing critical information needed to fulfill the request (e.g., a function body is referenced but not shown, a key file is mentioned but not included), you can request more by calling tools directly:
- read_lines: see specific code in a file already referenced
- find_symbol: look up a specific function, class, or variable by name
- read_file_outline: understand a file's structure before drilling in
- semantic_search: find code in a different part of the codebase
Answer if the context is sufficient and you are confident in the response. Request more only when you can identify a specific gap in the context.`;
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
- When diagnosing a bug or issue, also provide a concrete fix or code change if the context contains enough information to do so. Show what to change and where.
- Do NOT make up code that isn't in the context.
- If you reference code that is already in your curated context, use it directly -- do not ask the user to paste or provide code you can already see.
- Present your final recommendation(s) directly. If there are multiple valid approaches, list them as clearly labeled options (e.g., "Option A", "Option B") with brief trade-offs. Do NOT narrate your reasoning process or show intermediate attempts -- jump straight to your conclusions.`;

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

## How to Respond

1. Call \`report_evaluation\` with:
   - \`sufficient\`: true/false (see Evaluating Sufficiency below)
   - \`relevantIndices\`: array of indices (0-${totalResults - 1}) to KEEP
   - \`strippedIndices\`: array of indices to DISCARD
   - \`followUpCalls\`: (when sufficient=false) array of tool calls needed, e.g.
     [{"name": "read_lines", "arguments": {"filePath": "src/foo.ts", "startLine": 10, "endLine": 50}}]

2. You may ALSO call follow-up tools directly in the same response alongside report_evaluation.
   Both methods work -- use whichever is natural. If you provide follow-ups in BOTH places, they will be merged.

Available follow-up tools (when sufficient=false):
- read_lines: expand or explore code around locations already found
- read_file_outline: understand the structure of files appearing in results
- find_symbol: look up specific names you see referenced in results
- semantic_search: ONLY if you need to explore a genuinely different part of the codebase
- get_references / get_dependencies: trace how symbols connect

## Evaluating Sufficiency

sufficient=true means: the kept results contain enough code snippets that the answering model could fulfill the user's request -- answer the question, diagnose the issue, or understand the relevant code. It does NOT require having every detail; the answering model can request targeted follow-ups if needed.

sufficient=false means: the kept results do not yet contain the code needed to address the request, AND you have a concrete idea of what to look for next. You MUST specify follow-up calls (via followUpCalls parameter or direct tool calls) so the system knows what to fetch.

The code you need may not match the user's exact words. Look at what the code DOES, not just what it's named.
${iteration >= maxIterations ? '\nThis is the LAST iteration. You MUST set sufficient=true and work with what you have.' : ''}`;

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
