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
 */
export function buildPlanningPrompt(
  availableTools: ToolDefinition[],
  conversationContext?: string
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
- Output a JSON array of tool call objects: [{"name": "tool_name", "arguments": {...}}, ...]
- Keep batches small and focused (max 5-8 calls)
- These calls will be executed by code and evaluated by another model
- Output ONLY the JSON array, no other text`;

  if (conversationContext) {
    prompt += `\n\nConversation context (for follow-up questions):\n${conversationContext}`;
  }

  return prompt;
}

/**
 * System prompt for the reasoning model's answering phase.
 * The model receives curated context and produces the final answer.
 */
export function buildAnsweringPrompt(
  relevantContext: string,
  strippedSummaries: ToolCallSummary[]
): string {
  let prompt = `You are the ANSWERING model. You have been given curated context gathered by the planning and context evaluation pipeline. Answer the user's question based on this context.

## Curated Context
${relevantContext}`;

  if (strippedSummaries.length > 0) {
    const summaries = strippedSummaries
      .map((s) => `  - ${s.toolName}: ${s.resultSummary} (stripped: ${s.reason})`)
      .join('\n');
    prompt += `\n\n## Also Retrieved but Deemed Not Relevant\nThe following was also retrieved but deemed not relevant to the question:\n${summaries}\n\nIf you believe any of this information IS relevant, mention it in your answer.`;
  }

  prompt += `\n\nGuidelines:
- Reference specific file paths and line numbers when possible
- Be concrete and specific -- cite actual code
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
