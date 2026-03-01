/**
 * aide search - Search memories by keyword
 *
 * Searches memory content (what and why fields) by substring match.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../memory/store';
import type { MemoryLayer } from '../../memory/types';

export interface SearchOptions {
  path?: string;
  layer?: string;
  limit?: number;
}

const LAYER_LABELS: Record<string, string> = {
  preferences: 'Preferences',
  technical: 'Technical Context',
  area_context: 'Area Context',
  guidelines: 'Guidelines',
};

export function searchMemories(
  store: MemoryStore,
  keyword: string,
  options: SearchOptions = {}
): void {
  const memories = store.search(keyword, {
    layer: options.layer as MemoryLayer | undefined,
    limit: options.limit ?? 50,
  });

  if (memories.length === 0) {
    console.log(chalk.gray(`No memories found matching "${keyword}".`));
    return;
  }

  console.log(chalk.white(`Found ${memories.length} matching "${keyword}":\n`));

  // Group by layer
  const grouped = new Map<string, typeof memories>();
  for (const m of memories) {
    if (!grouped.has(m.layer)) grouped.set(m.layer, []);
    grouped.get(m.layer)!.push(m);
  }

  for (const [layer, mems] of grouped) {
    console.log(chalk.magenta.bold(`  ${LAYER_LABELS[layer] ?? layer}`));
    for (const m of mems) {
      let line = chalk.white(`    [${m.id}] ${m.what}`);
      if (m.scope && m.scope !== 'project') {
        line += chalk.gray(` [${m.scope}]`);
      }
      console.log(line);
      if (m.why) {
        console.log(chalk.gray(`         Why: ${m.why}`));
      }
    }
    console.log();
  }
}
