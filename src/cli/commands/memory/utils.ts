/**
 * Shared utilities for aide-memory CLI commands.
 */

import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import type { Memory } from '../../../memory/types';

/** Brand color from docs/branding — used for success/accent output */
export const brand = chalk.hex('#00c2cb');

export const LAYER_LABELS: Record<string, string> = {
  preferences: 'Preferences',
  technical: 'Technical Context',
  area_context: 'Area Context',
  guidelines: 'Guidelines',
};

export const VALID_LAYERS = ['preferences', 'technical', 'area_context', 'guidelines'];

/**
 * Walk up from `startDir` to find the nearest `.aide/` directory.
 * Returns the project root (parent of `.aide/`) or null if not found.
 */
export function findProjectRoot(startDir: string): string | null {
  let current = path.resolve(startDir);
  const root = path.parse(current).root;

  while (current !== root) {
    if (fs.existsSync(path.join(current, '.aide'))) {
      return current;
    }
    current = path.dirname(current);
  }

  // Check root itself
  if (fs.existsSync(path.join(root, '.aide'))) {
    return root;
  }

  return null;
}

/**
 * Find project root or exit with an error message.
 */
export function requireProjectRoot(): string {
  const root = findProjectRoot(process.cwd());
  if (!root) {
    console.error(chalk.red('No .aide/ directory found. Run `aide-memory init` first.'));
    process.exit(1);
  }
  return root;
}

/**
 * Group memories by layer, preserving encounter order.
 */
export function groupByLayer(memories: Memory[]): [string, Memory[]][] {
  const groups = new Map<string, Memory[]>();
  for (const m of memories) {
    if (!groups.has(m.layer)) groups.set(m.layer, []);
    groups.get(m.layer)!.push(m);
  }
  return Array.from(groups.entries());
}

/**
 * Format a single memory for display.
 */
export function formatMemoryLine(m: Memory): string {
  let line = `  [${m.id}] ${m.what}`;
  if (m.contributor) line += brand(` (from ${m.contributor})`);
  if (m.scope && m.scope !== 'project') line += chalk.gray(` [${m.scope}]`);
  return line;
}
