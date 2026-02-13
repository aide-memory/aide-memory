/**
 * Model Provider Types
 *
 * Provider-agnostic interfaces for model runtimes.
 * These types allow swapping providers (Ollama, OpenAI, Claude)
 * without changing retrieval or application logic.
 */

// ============================================================================
// Base Message Types
// ============================================================================

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  /** For tool role: the tool call ID this result corresponds to */
  toolCallId?: string;
  /** For assistant role: tool calls the model wants to make */
  toolCalls?: ToolCallRequest[];
}

export interface ChatResponse {
  content: string;
  /** Tool calls requested by the model (if any) */
  toolCalls?: ToolCallRequest[];
  /** Token usage from the API (if available) */
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ============================================================================
// Tool Definition (Provider-Agnostic)
// ============================================================================

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: { type: string };
}

// ============================================================================
// Tool Call Types
// ============================================================================

/** Tool call requested by the model */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Result of executing a tool */
export interface ToolCallResult {
  toolCallId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

// ============================================================================
// Runtime Interfaces
// ============================================================================

/**
 * Base model runtime - simple chat without tools
 */
export interface ModelRuntime {
  chat(messages: ChatMessage[]): Promise<ChatResponse>;
}

/**
 * Model runtime with tool calling support
 */
export interface ToolCapableRuntime extends ModelRuntime {
  /**
   * Chat with the model, optionally providing tools it can call
   *
   * @param messages - Chat history
   * @param tools - Available tools (if any)
   * @returns Response which may include tool calls
   */
  chatWithTools(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): Promise<ChatResponse>;

  /**
   * Check if this runtime supports tool calling
   */
  supportsTools(): boolean;

  /**
   * Whether this runtime reliably supports native tool calling via the API.
   * When true, the orchestrator uses chatWithTools() with structured tool_calls.
   * When false, the orchestrator uses chat() with text-based tool descriptions.
   */
  supportsNativeTools(): boolean;

}

/**
 * Embedding runtime for vector operations
 */
export interface EmbeddingRuntime {
  embed(texts: string[]): Promise<number[][]>;
}

// ============================================================================
// Model Roles
// ============================================================================

/** The three model roles in the system */
export type ModelRole = 'reasoning' | 'context' | 'embedding';

/** Configuration for which model to use for each role */
export interface ModelRoleConfig {
  /** High-level planning, answering, and decision-making */
  reasoning: string;
  /** Context gathering, tool call iteration, relevance evaluation */
  context: string;
  /** Vector embedding generation */
  embedding: string;
}

/** Runtime instances for all three model roles */
export interface ModelRuntimes {
  /** High-level planning + answering model */
  reasoning: ToolCapableRuntime;
  /** Context gathering + iteration model */
  context: ToolCapableRuntime;
  /** Embedding model for vector operations */
  embedding: EmbeddingRuntime;
}

// ============================================================================
// Provider Configuration
// ============================================================================

export interface ProviderConfig {
  /** Provider type */
  provider: 'ollama' | 'openai' | 'anthropic';

  /** Base URL for API calls */
  baseUrl: string;

  /** Model name */
  model: string;

  /** API key (for OpenAI/Anthropic) */
  apiKey?: string;

  /** Embedding model (if different from chat model) */
  embeddingModel?: string;
}

// ============================================================================
// Re-exports for backward compatibility
// ============================================================================

// Keep these available from brain/types.ts for existing code
export type { ProjectConfig, SessionState } from '../brain/types';

















