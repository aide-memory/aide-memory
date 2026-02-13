/**
 * Orchestration Types
 *
 * Types for the multi-model orchestration loop.
 */

import { ToolDefinition, ToolCallRequest } from '../models/types';

// ============================================================================
// Tool Call Plan & Spec
// ============================================================================

/** A single tool call specification from a model */
export interface ToolCallSpec {
  /** Tool name */
  name: string;
  /** Tool arguments */
  arguments: Record<string, unknown>;
}

/** Result of executing a tool call */
export interface ToolCallResult {
  /** The original spec */
  spec: ToolCallSpec;
  /** Whether execution succeeded */
  success: boolean;
  /** Result data (string representation) */
  data?: string;
  /** Error message if failed */
  error?: string;
  /** Unique key for deduplication (tool name + args hash) */
  callKey: string;
}

/** Summary of a tool call that was stripped (deemed not relevant) */
export interface ToolCallSummary {
  callKey: string;
  toolName: string;
  /** Brief description of what the call returned */
  resultSummary: string;
  /** Why it was stripped */
  reason: string;
}

// ============================================================================
// Iteration State
// ============================================================================

/** State tracked across iterations of the orchestration loop */
export interface IterationState {
  /** All previous tool call results keyed by callKey */
  previousCalls: Map<string, ToolCallResult>;
  /** Calls deemed relevant by the context model */
  relevantResults: ToolCallResult[];
  /** Calls stripped and summarized */
  strippedSummaries: ToolCallSummary[];
  /** Current iteration number */
  iteration: number;
}

// ============================================================================
// Orchestrator Config & Context
// ============================================================================

export interface OrchestratorConfig {
  /** Max context-model loops (default 5) */
  maxIterations: number;
  /** Max tool calls per batch (default 10) */
  maxToolCallsPerBatch: number;
  /** Whether context model strips irrelevant results (default true) */
  enableContextStripping: boolean;
  /** Max times the reasoning model can loop back for more context (default 2) */
  maxReasoningLoops: number;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxIterations: 5,
  maxToolCallsPerBatch: 10,
  enableContextStripping: true,
  maxReasoningLoops: 2,
};

/** Context provided to the orchestrator for a single query */
export interface OrchestratorContext {
  /** Available tool definitions */
  availableTools: ToolDefinition[];
}

/** Result of the orchestration loop */
export interface OrchestratorResult {
  /** Final answer content */
  answer: string;
  /** All relevant context gathered */
  relevantResults: ToolCallResult[];
  /** Summaries of stripped context */
  strippedSummaries: ToolCallSummary[];
  /** Total iterations performed */
  iterations: number;
  /** Total tool calls made */
  totalToolCalls: number;
}

// ============================================================================
// Context Model Output
// ============================================================================

/** Output format from the context model's evaluation */
export interface ContextEvaluation {
  /** Whether enough context has been gathered */
  sufficient: boolean;
  /** Indices of results deemed relevant (from the current batch) */
  relevantIndices: number[];
  /** Indices of results to strip */
  strippedIndices: number[];
  /** New tool calls to make (if not sufficient) */
  newToolCalls: ToolCallSpec[];
}
