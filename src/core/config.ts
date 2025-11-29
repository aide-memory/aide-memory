import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ProjectConfig } from './types';
import { getProjectConfigPath, getProjectDir } from '../storage/paths';

export function projectIdFromPath(rootPath: string): string {
  const normalized = path.resolve(rootPath);
  return crypto
    .createHash('sha1')
    .update(normalized)
    .digest('hex')
    .slice(0, 12);
}

export function ensureDirExists(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export async function loadOrCreateProjectConfig(
  rootPath: string,
  overrides?: Partial<
    Pick<ProjectConfig, 'model' | 'embeddingModel' | 'ollamaBaseUrl'>
  >
): Promise<ProjectConfig> {
  const id = projectIdFromPath(rootPath);
  const dir = getProjectDir(id);
  ensureDirExists(dir);

  const configPath = getProjectConfigPath(id);

  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath, 'utf8');
    const cfg = JSON.parse(raw) as ProjectConfig;
    return cfg;
  }

  const config: ProjectConfig = {
    id,
    rootPath,
    model: overrides?.model ?? 'qwen3-coder:30b',
    embeddingModel: overrides?.embeddingModel ?? 'all-minilm:latest',
    ollamaBaseUrl: overrides?.ollamaBaseUrl ?? 'http://localhost:11434/api',
  };

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return config;
}
