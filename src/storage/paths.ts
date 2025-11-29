import path from 'path';
import os from 'os';

export function getAideRoot(): string {
  return path.join(os.homedir(), '.aide');
}

export function getProjectsRoot(): string {
  return path.join(getAideRoot(), 'projects');
}

export function getProjectDir(projectId: string): string {
  return path.join(getProjectsRoot(), projectId);
}

export function getProjectConfigPath(projectId: string): string {
  return path.join(getProjectDir(projectId), 'config.json');
}

export function getProjectIndexPath(projectId: string): string {
  return path.join(getProjectDir(projectId), 'index.json');
}

export function getSessionsDir(projectId: string): string {
  return path.join(getProjectDir(projectId), 'sessions');
}
