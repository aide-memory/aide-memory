/**
 * aide-memory search <query> — Search memories by keyword.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import type { MemoryLayer } from '../../../memory/types';
import { LAYER_LABELS, groupByLayer, formatMemoryLine, requireProjectRoot } from './utils';

export interface MemorySearchOptions {
  layer?: string;
  limit?: string;
}

export function runSearch(query: string, options: MemorySearchOptions): void {
  const projectRoot = requireProjectRoot();
  const store = new MemoryStore(projectRoot);

  try {
    const memories = store.search(query, {
      layer: options.layer as MemoryLayer | undefined,
      limit: options.limit ? parseInt(options.limit, 10) : 50,
    });

    if (memories.length === 0) {
      console.log(chalk.gray(`No memories found matching "${query}".`));
      return;
    }

    console.log(chalk.white(`Found ${memories.length} matching "${query}":\n`));

    const grouped = groupByLayer(memories);
    for (const [layer, mems] of grouped) {
      console.log(chalk.magenta.bold(`  ${LAYER_LABELS[layer] ?? layer}`));
      for (const m of mems) {
        console.log(formatMemoryLine(m));
        if (m.why) {
          console.log(chalk.gray(`      Why: ${m.why}`));
        }
      }
      console.log();
    }
  } finally {
    store.close();
  }
}
