/**
 * aide-memory remember <what> — Store a new memory.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import type { MemoryLayer } from '../../../memory/types';
import { VALID_LAYERS, requireProjectRoot, brand } from './utils';

export interface RememberOptions {
  layer: string;
  scope?: string;
  tags?: string;
  why?: string;
  contributor?: string;
}

export function runRemember(what: string, options: RememberOptions): void {
  if (!VALID_LAYERS.includes(options.layer)) {
    console.error(chalk.red(`Invalid layer "${options.layer}". Must be one of: ${VALID_LAYERS.join(', ')}`));
    process.exit(1);
  }

  const projectRoot = requireProjectRoot();
  const store = new MemoryStore({ projectRoot });

  try {
    const memory = store.add({
      layer: options.layer as MemoryLayer,
      what,
      why: options.why,
      scope: options.scope,
      context_label: options.tags,
      contributor: options.contributor,
    });

    console.log(brand(`Stored memory (id: ${memory.id}):`));
    console.log(`  Layer: ${memory.layer}`);
    console.log(`  What:  ${memory.what}`);
    if (memory.scope) console.log(`  Scope: ${memory.scope}`);
    if (memory.why) console.log(`  Why:   ${memory.why}`);
    if (memory.contributor) console.log(`  From:  ${memory.contributor}`);
    if (memory.context_label) console.log(`  Tags:  ${memory.context_label}`);
  } finally {
    store.close();
  }
}
