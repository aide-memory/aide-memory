/**
 * Models Module
 *
 * Provider-agnostic model runtime abstractions.
 */

// Types
export type {
  ChatMessage,
  ChatResponse,
  ModelRuntime,
  ToolCapableRuntime,
  EmbeddingRuntime,
  ToolDefinition,
  ToolParameters,
  ToolParameterProperty,
  ToolCallRequest,
  ToolCallResult,
  ProviderConfig,
} from './types';

// Implementations
export { OllamaRuntime } from './localModelClient';
export type { Embedding } from './localModelClient';
