/**
 * aide-memory list — List memories with optional filters.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import type { MemoryLayer } from '../../../memory/types';
import { LAYER_LABELS, VALID_LAYERS, formatMemoryLine, requireProjectRoot } from './utils';

export interface ListOptions {
  layer?: string;
  scope?: string;
  contributor?: string;
  limit?: string;
  tag?: string;
}

export function runList(options: ListOptions): void {
  if (options.layer && !VALID_LAYERS.includes(options.layer)) {
    console.error(chalk.red(`Invalid layer "${options.layer}". Must be one of: ${VALID_LAYERS.join(', ')}`));
    process.exit(1);
  }

  const projectRoot = requireProjectRoot();
  const store = new MemoryStore({ projectRoot });

  try {
    let memories = store.list({
      layer: options.layer as MemoryLayer | undefined,
      scope: options.scope,
      limit: options.limit ? parseInt(options.limit, 10) : undefined,
    });

    // Post-filter by contributor (store.list doesn't support this natively)
    if (options.contributor) {
      memories = memories.filter(m => m.contributor === options.contributor);
    }

    // Post-filter by tag/context_label
    if (options.tag) {
      const tagLower = options.tag.toLowerCase();
      memories = memories.filter(m =>
        m.context_label?.toLowerCase().includes(tagLower)
      );
    }

    if (memories.length === 0) {
      console.log(chalk.gray('No memories found.'));
      return;
    }

    const total = store.count();
    console.log(chalk.white(`Showing ${memories.length} of ${total} memories:\n`));

    for (const m of memories) {
      let line = formatMemoryLine(m);
      line += chalk.gray(` | recalled ${m.recalled_count}x`);
      console.log(line);
    }
  } finally {
    store.close();
  }
}
