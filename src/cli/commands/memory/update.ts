/**
 * aide-memory update <id> — Update an existing memory.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import { requireProjectRoot } from './utils';

export interface UpdateOptions {
  what?: string;
  why?: string;
  scope?: string;
  tags?: string;
}

export function runUpdate(idStr: string, options: UpdateOptions): void {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    console.error(chalk.red(`Invalid memory ID: "${idStr}". Must be a number.`));
    process.exit(1);
  }

  const projectRoot = requireProjectRoot();
  const store = new MemoryStore(projectRoot);

  try {
    const existing = store.get(id);
    if (!existing) {
      console.error(chalk.red(`Memory ${id} not found.`));
      process.exit(1);
    }

    const changes: Record<string, string> = {};
    if (options.what !== undefined) changes.what = options.what;
    if (options.why !== undefined) changes.why = options.why;
    if (options.scope !== undefined) changes.scope = options.scope;
    if (options.tags !== undefined) changes.context_label = options.tags;

    if (Object.keys(changes).length === 0) {
      console.error(chalk.yellow('No changes specified. Use --what, --why, --scope, or --tags.'));
      process.exit(1);
    }

    const updated = store.update(id, changes);
    if (!updated) {
      console.error(chalk.red(`Failed to update memory ${id}.`));
      process.exit(1);
    }

    console.log(chalk.green(`Updated memory (id: ${updated.id}):`));
    console.log(`  Layer: ${updated.layer}`);
    console.log(`  What:  ${updated.what}`);
    if (updated.scope) console.log(`  Scope: ${updated.scope}`);
    if (updated.why) console.log(`  Why:   ${updated.why}`);
  } finally {
    store.close();
  }
}
