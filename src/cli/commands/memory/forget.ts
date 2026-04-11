/**
 * aide-memory forget <id> — Delete a memory.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import { requireProjectRoot, brand } from './utils';

export function runForget(idStr: string): void {
  const id = parseInt(idStr, 10);
  if (isNaN(id)) {
    console.error(chalk.red(`Invalid memory ID: "${idStr}". Must be a number.`));
    process.exit(1);
  }

  const projectRoot = requireProjectRoot();
  const store = new MemoryStore({ projectRoot });

  try {
    const existing = store.get(id);
    if (!existing) {
      console.error(chalk.red(`Memory ${id} not found.`));
      process.exit(1);
    }

    store.remove(id);
    console.log(brand(`Deleted memory ${id}: "${existing.what}"`));
  } finally {
    store.close();
  }
}
