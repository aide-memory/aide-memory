/**
 * Models Module
 *
 * Provider-agnostic model runtime abstractions.
 * Supports both local (Ollama) and cloud (OpenAI, Anthropic, Google) providers.
 *
 * Usage:
 *   import { createRuntime } from './models';
 *   const runtime = createRuntime('gpt-4o');  // Auto-detects OpenAI
 *   const runtime = createRuntime('qwen3-coder:30b');  // Auto-detects Ollama
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
  ModelRole,
  ModelRoleConfig,
  ModelRuntimes,
} from './types';

// Runtimes (prefer using createRuntime instead of direct instantiation)
export { OllamaRuntime } from './localModelClient';
export type { OllamaConfig, Embedding } from './localModelClient';
export { OpenAIRuntime, AnthropicRuntime, GoogleRuntime } from './cloudModelClient';
export type { CloudConfig } from './cloudModelClient';

// Factory - the main way to create runtimes
export {
  createRuntime,
  createRuntimeFromProjectConfig,
  createRuntimes,
  detectProvider,
  isCloudProvider,
  validateModel,
} from './modelFactory';
export type { ModelProvider } from './modelFactory';
