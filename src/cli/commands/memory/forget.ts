/**
 * aide-memory forget <id> — Delete a memory.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import { requireProjectRoot, brand } from './utils';
import { shouldRegenForMemory, triggerRulesRegen } from '../../../memory/rulesGen';
import { adaptersWithRules } from '../../../memory/editors';

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

    // Phase C4 regen trigger. Use pre-delete `existing` to decide since
    // the memory no longer exists post-remove.
    if (shouldRegenForMemory(existing)) {
      try {
        triggerRulesRegen(adaptersWithRules(), projectRoot);
      } catch {
        /* rules regen is convenience — never fail a CLI write because of it */
      }
    }
  } finally {
    store.close();
  }
}
