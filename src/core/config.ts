/**
 * Project configuration management
 *
 * Config is minimal - just stores what the user specified.
 * The model factory (src/models/modelFactory.ts) handles provider detection and defaults.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProjectConfig } from '../brain/types';
import { getProjectConfigPath, ensureProjectDirs } from '../storage/paths';

// ============================================================================
// Global Defaults - Single source of truth for all configurable values
// ============================================================================

export const AIDE_DEFAULTS = {
  // === Model Roles (all 3 required) ===
  models: {
    reasoning: 'gpt-5.2', // High-level planning + answering
    context: 'gpt-5.2', // Context gathering, iteration, relevance eval
    embedding: 'mxbai-embed-large', // Vector embeddings (Ollama, 1024-dim, SOTA for BERT-large). Cloud alternative: 'text-embedding-3-small' (OpenAI, 1536-dim, $0.02/1M tokens)
  },

  // === Ollama (for local models) ===
  ollamaBaseUrl: 'http://127.0.0.1:11434/api',

  // === Token Limits ===
  tokens: {
    globalBudget: 16000, // Total token budget for assembled context
    maxModelInput: 128000, // Max tokens to send to any model
    reservedForResponse: 4000, // Reserved for model response generation
  },

  /** Token budget (alias for tokens.globalBudget, used throughout codebase) */
  tokenBudget: 16000,

  // === Retrieval Strategy ===
  strategy: 'auto' as
    | 'simple'
    | 'tools'
    | 'hybrid'
    | 'graph'
    | 'semantic'
    | 'semanticandgraph'
    | 'auto',
  maxBlocks: 10,
  maxDepth: 2,
  maxFanout: 5,
  hybridMode: 'code' as 'code' | 'hints',
  historyMode: 'tools' as 'direct' | 'tools',
  historyLimit: 6,

  // === Orchestration ===
  orchestration: {
    maxIterations: 5, // Max context-model loops
    maxToolCallsPerBatch: 10, // Max tool calls per batch
    enableContextStripping: true, // Context model strips irrelevant results
  },

  // === Embedding ===
  embedding: {
    batchSize: 50, // Chunks per embedding API call
    chunkMaxTokens: 256, // Max tokens per chunk
    chunkOverlapLines: 2, // Lines of overlap between chunks
    minScore: 0.3, // Minimum similarity score threshold
    topK: 10, // Default top-K search results
  },
} as const;

/**
 * Generate a unique project ID from the root path
 */
export function projectIdFromPath(rootPath: string): string {
  const normalized = path.resolve(rootPath);
  return crypto
    .createHash('sha1')
    .update(normalized)
    .digest('hex')
    .slice(0, 12);
}

/**
 * Load existing project config or create a new one
 *
 * Config only stores what's explicitly set. Provider detection happens
 * in the model factory when creating a runtime.
 */
export async function loadOrCreateProjectConfig(
  rootPath: string,
  overrides?: { model?: string },
): Promise<ProjectConfig> {
  const id = projectIdFromPath(rootPath);
  ensureProjectDirs(id);

  const configPath = getProjectConfigPath(id);

  // Load existing config if present
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw) as Record<string, unknown>;

    // Migrate legacy config: if old `model` field exists but no `models`, convert
    if (cfg.model && !cfg.models) {
      cfg.models = {
        reasoning: cfg.model as string,
        context: cfg.model as string,
        embedding:
          (cfg.embeddingModel as string) ?? AIDE_DEFAULTS.models.embedding,
      };
      delete cfg.model;
      delete cfg.embeddingModel;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    }

    const result = cfg as unknown as ProjectConfig;

    // Ensure rootPath is up to date (in case project was moved)
    if (result.rootPath !== rootPath) {
      result.rootPath = rootPath;
      fs.writeFileSync(configPath, JSON.stringify(result, null, 2), 'utf8');
    }

    // Ensure models field exists with defaults
    if (!result.models) {
      result.models = { ...AIDE_DEFAULTS.models };
    }

    // Auto-sync models from AIDE_DEFAULTS when not explicitly set by user
    if (!result.modelsSetByUser) {
      const defaults = AIDE_DEFAULTS.models;
      const needsSync =
        result.models.reasoning !== defaults.reasoning ||
        result.models.context !== defaults.context ||
        result.models.embedding !== defaults.embedding;
      if (needsSync) {
        result.models = { ...defaults };
        fs.writeFileSync(configPath, JSON.stringify(result, null, 2), 'utf8');
      }
    }

    // Apply runtime model override (don't persist) - overrides reasoning model
    if (overrides?.model) {
      result.models = { ...result.models, reasoning: overrides.model };
    }

    return result;
  }

  // Create new config with minimal defaults
  const config: ProjectConfig = {
    id,
    rootPath: path.resolve(rootPath),
    models: { ...AIDE_DEFAULTS.models },
    ollamaBaseUrl: AIDE_DEFAULTS.ollamaBaseUrl,
  };

  // Apply runtime model override
  if (overrides?.model) {
    config.models.reasoning = overrides.model;
  }

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return config;
}

/**
 * Update project config
 */
export function updateProjectConfig(
  config: ProjectConfig,
  updates: Partial<
    Pick<
      ProjectConfig,
      | 'models'
      | 'modelsSetByUser'
      | 'ollamaBaseUrl'
      | 'tokenBudget'
      | 'maxBlocks'
      | 'strategy'
      | 'hybridMode'
    >
  >,
): ProjectConfig {
  const updated = { ...config, ...updates };
  const configPath = getProjectConfigPath(config.id);
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}

// ============================================================================
// Effective Settings - Merges project config with defaults and runtime options
// ============================================================================

export interface RetrievalSettings {
  tokenBudget: number;
  maxBlocks: number;
  maxDepth: number;
  maxFanout: number;
  strategy:
    | 'simple'
    | 'tools'
    | 'hybrid'
    | 'graph'
    | 'semantic'
    | 'semanticandgraph'
    | 'auto';
  hybridMode: 'code' | 'hints';
  historyMode: 'direct' | 'tools';
  historyLimit: number;
}

/**
 * Get effective retrieval settings.
 * Priority: runtime options > project config > AIDE_DEFAULTS
 */
export function getEffectiveSettings(
  projectConfig?: ProjectConfig,
  runtimeOptions?: Partial<RetrievalSettings>,
): RetrievalSettings {
  return {
    tokenBudget:
      runtimeOptions?.tokenBudget ??
      projectConfig?.tokenBudget ??
      AIDE_DEFAULTS.tokenBudget,
    maxBlocks:
      runtimeOptions?.maxBlocks ??
      projectConfig?.maxBlocks ??
      AIDE_DEFAULTS.maxBlocks,
    maxDepth: runtimeOptions?.maxDepth ?? AIDE_DEFAULTS.maxDepth,
    maxFanout: runtimeOptions?.maxFanout ?? AIDE_DEFAULTS.maxFanout,
    strategy:
      runtimeOptions?.strategy ??
      projectConfig?.strategy ??
      AIDE_DEFAULTS.strategy,
    hybridMode:
      runtimeOptions?.hybridMode ??
      projectConfig?.hybridMode ??
      AIDE_DEFAULTS.hybridMode,
    historyMode:
      runtimeOptions?.historyMode ??
      projectConfig?.historyMode ??
      AIDE_DEFAULTS.historyMode,
    historyLimit:
      runtimeOptions?.historyLimit ??
      projectConfig?.historyLimit ??
      AIDE_DEFAULTS.historyLimit,
  };
}
