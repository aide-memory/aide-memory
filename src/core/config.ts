/**
 * Project configuration management
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProjectConfig } from '../brain/types';
import { getProjectConfigPath, ensureProjectDirs } from '../storage/paths';

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
    Pick<ProjectConfig, 'model' | 'embeddingModel' | 'ollamaBaseUrl'>
  >
): ProjectConfig {
  const updated = { ...config, ...updates };
  const configPath = getProjectConfigPath(config.id);
  fs.writeFileSync(configPath, JSON.stringify(updated, null, 2), 'utf8');
  return updated;
}
