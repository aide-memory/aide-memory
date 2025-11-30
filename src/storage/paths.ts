/**
 * Storage paths for AIDE data
 */

import path from 'path';
import os from 'os';
import fs from 'fs';

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

export function getProjectDbPath(projectId: string): string {
  return path.join(getProjectDir(projectId), 'brain.db');
}

export function getSessionsDir(projectId: string): string {
  return path.join(getProjectDir(projectId), 'sessions');
}

/**
 * @deprecated Use getProjectDbPath instead
 */
export function getProjectIndexPath(projectId: string): string {
  return path.join(getProjectDir(projectId), 'index.json');
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Ensure the project directory structure exists
 */
export function ensureProjectDirs(projectId: string): void {
  ensureDir(getProjectDir(projectId));
  ensureDir(getSessionsDir(projectId));
}
