/**
 * aide-memory sync import — Rebuild SQLite cache from JSON files.
 * aide-memory sync export — Ensure all memories have JSON files.
 *
 * Uses the MemorySync class which handles conflict detection, timestamp
 * comparison, and preferences/personal/ exclusion.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import { MemorySync } from '../../../memory/sync';
import type { SyncResult } from '../../../memory/sync';
import { requireProjectRoot } from './utils';

function printSyncResult(action: string, result: SyncResult, exportMode: boolean = false): void {
  const parts: string[] = [];
  if (result.imported > 0) parts.push(`${result.imported} ${exportMode ? 'exported' : 'imported'}`);
  if (result.updated > 0) parts.push(`${result.updated} updated`);
  if (result.removed > 0) parts.push(`${result.removed} removed`);

  if (parts.length > 0) {
    console.log(chalk.green(`${action} complete: ${parts.join(', ')}.`));
  } else {
    console.log(chalk.gray(`${action}: everything up to date.`));
  }

  for (const conflict of result.conflicts) {
    console.log(chalk.yellow(
      `  Conflict: memory ${conflict.uuid} has local edits newer than incoming file. Keeping newer version.`
    ));
  }

  for (const error of result.errors) {
    console.log(chalk.yellow(`  ${error}`));
  }
}

export function runSyncImport(): void {
  const projectRoot = requireProjectRoot();
  const store = new MemoryStore({ projectRoot });

  try {
    const sync = new MemorySync(store);
    const result = sync.importFromFiles();
    printSyncResult('Import', result);
  } finally {
    store.close();
  }
}

export function runSyncExport(): void {
  const projectRoot = requireProjectRoot();
  const store = new MemoryStore({ projectRoot });

  try {
    const sync = new MemorySync(store);
    const result = sync.exportToFiles();
    printSyncResult('Export', result, true);
  } finally {
    store.close();
  }
}
