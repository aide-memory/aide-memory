/**
 * Model Factory - Creates appropriate runtime based on model name
 *
 * This is the single source of truth for:
 * - Provider detection from model name (gpt-* → OpenAI, claude-* → Anthropic, else → Ollama)
 * - API key resolution from environment variables
 * - Runtime instantiation
 */

import { ToolCapableRuntime } from './types';
import { OllamaRuntime } from './localModelClient';
import {
  OpenAIRuntime,
  AnthropicRuntime,
  GoogleRuntime,
  CloudProvider,
} from './cloudModelClient';
import { ProjectConfig } from '../brain/types';

// ============================================================================
// Provider Detection
// ============================================================================

export type ModelProvider = 'ollama' | CloudProvider;

/**
 * Detect provider from model name
 *
 * Pattern matching:
 * - gpt-*, o1-*, o3-*, chatgpt-* → openai
 * - claude-* → anthropic
 * - gemini-*, palm-* → google
 * - Everything else → ollama (local)
 */
export function detectProvider(model: string): ModelProvider {
  const lowerModel = model.toLowerCase();

  // OpenAI models
  if (
    lowerModel.startsWith('gpt-') ||
    lowerModel.startsWith('o1-') ||
    lowerModel.startsWith('o3-') ||
    lowerModel.startsWith('chatgpt-')
  ) {
    return 'openai';
  }

  // Anthropic models
  if (lowerModel.startsWith('claude-')) {
    return 'anthropic';
  }

  // Google models
  if (lowerModel.startsWith('gemini-') || lowerModel.startsWith('palm-')) {
    return 'google';
  }

  // Default to Ollama (local)
  return 'ollama';
}

/**
 * Check if a provider is a cloud provider (requires API key)
 */
export function isCloudProvider(provider: ModelProvider): boolean {
  return provider !== 'ollama';
}

/**
 * Get API key from environment for a provider
 */
function getApiKeyFromEnv(provider: ModelProvider): string | undefined {
  switch (provider) {
    case 'openai':
      return process.env.OPENAI_API_KEY;
    case 'anthropic':
      return process.env.ANTHROPIC_API_KEY;
    case 'google':
      return process.env.GOOGLE_API_KEY;
    default:
      return undefined;
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

export interface CreateRuntimeOptions {
  ollamaBaseUrl?: string;
  embeddingModel?: string;
}

/**
 * Create a model runtime from a model name
 *
 * @param model - Model name (e.g., "gpt-4o", "claude-3-opus", "qwen3-coder:30b")
 * @param options - Optional settings (ollamaBaseUrl, embeddingModel)
 * @returns A runtime that implements ToolCapableRuntime
 */
export function createRuntime(
  model: string,
  options: CreateRuntimeOptions = {}
): ToolCapableRuntime {
  const ollamaBaseUrl = options.ollamaBaseUrl ?? 'http://127.0.0.1:11434/api';
  const embeddingModel = options.embeddingModel ?? 'all-minilm:latest';
  const provider = detectProvider(model);
  const apiKey = getApiKeyFromEnv(provider);

  if (process.env.AIDE_DEBUG) {
    console.log('[modelFactory] Creating runtime:', {
      model,
      provider,
      hasApiKey: !!apiKey,
    });
  }

  switch (provider) {
    case 'openai':
      if (!apiKey) {
        throw new Error(
          'OpenAI API key required. Set OPENAI_API_KEY environment variable.'
        );
      }
      return new OpenAIRuntime({
        provider: 'openai',
        apiKey,
        model,
      });

    case 'anthropic':
      if (!apiKey) {
        throw new Error(
          'Anthropic API key required. Set ANTHROPIC_API_KEY environment variable.'
        );
      }
      return new AnthropicRuntime({
        provider: 'anthropic',
        apiKey,
        model,
      });

    case 'google':
      if (!apiKey) {
        throw new Error(
          'Google API key required. Set GOOGLE_API_KEY environment variable.'
        );
      }
      return new GoogleRuntime({
        provider: 'google',
        apiKey,
        model,
      });

    case 'ollama':
    default:
      return new OllamaRuntime({
        model,
        baseUrl: ollamaBaseUrl,
        embeddingModel,
      });
  }
}

/**
 * Create a runtime from ProjectConfig
 */
export function createRuntimeFromProjectConfig(
  projectConfig: ProjectConfig
): ToolCapableRuntime {
  return createRuntime(projectConfig.model, {
    ollamaBaseUrl: projectConfig.ollamaBaseUrl,
    embeddingModel: projectConfig.embeddingModel,
  });
}

/**
 * Validate that a runtime can be created with the given model
 * Returns error message if invalid, undefined if valid
 */
export function validateModel(model: string): string | undefined {
  const provider = detectProvider(model);

  if (isCloudProvider(provider)) {
    const apiKey = getApiKeyFromEnv(provider);
    if (!apiKey) {
      const envVarMap: Record<CloudProvider, string> = {
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        google: 'GOOGLE_API_KEY',
      };
      const envVar = envVarMap[provider as CloudProvider];
      return `${provider} requires an API key. Set ${envVar} environment variable.`;
    }
  }

  return undefined;
}
