/**
 * Project configuration management
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
  /** Token budget for both retrieval and context assembly */
  tokenBudget: 16000,
  /** Maximum code blocks to return from retrieval */
  maxBlocks: 10,
  /** Maximum graph traversal depth */
  maxDepth: 2,
  /** Maximum fanout per node during graph traversal */
  maxFanout: 5,
  /** Default retrieval strategy */
  strategy: 'tools' as const,
  /** Default hybrid mode */
  hybridMode: 'code' as const,
  /** History access mode for retrieval model: 'direct' includes last N messages, 'tools' uses on-demand tools */
  historyMode: 'tools' as 'direct' | 'tools',
  /** For direct mode: how many recent messages to include */
  historyLimit: 6,
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
 */
export async function loadOrCreateProjectConfig(
  rootPath: string,
  overrides?: Partial<
    Pick<ProjectConfig, 'model' | 'embeddingModel' | 'ollamaBaseUrl'>
  >
): Promise<ProjectConfig> {
  const id = projectIdFromPath(rootPath);
  ensureProjectDirs(id);

  const configPath = getProjectConfigPath(id);

  // Load existing config if present
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw) as ProjectConfig;

    // Ensure rootPath is up to date (in case project was moved)
    if (cfg.rootPath !== rootPath) {
      cfg.rootPath = rootPath;
      fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), 'utf8');
    }

    return cfg;
  }

  // Create new config with defaults
  const config: ProjectConfig = {
    id,
    rootPath: path.resolve(rootPath),
    model: overrides?.model ?? 'qwen3-coder:30b',
    embeddingModel: overrides?.embeddingModel ?? 'all-minilm:latest',
    ollamaBaseUrl: overrides?.ollamaBaseUrl ?? 'http://127.0.0.1:11434/api',
  };

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
      | 'model'
      | 'embeddingModel'
      | 'ollamaBaseUrl'
      | 'tokenBudget'
      | 'maxBlocks'
      | 'strategy'
      | 'hybridMode'
    >
  >
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
  strategy: 'simple' | 'tools' | 'hybrid';
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
  runtimeOptions?: Partial<RetrievalSettings>
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
