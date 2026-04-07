#!/usr/bin/env node

/**
 * Sync runner — invoked by the post-checkout git hook.
 * Runs MemorySync.syncFromGit() and prints a summary.
 *
 * Usage: node dist/memory/sync-runner.js <project-root>
 */

import { MemoryStore } from './store';
import { MemorySync } from './sync';

const projectRoot = process.argv[2];
if (!projectRoot) {
  process.exit(0);
}

try {
  const store = new MemoryStore({ projectRoot });
  const sync = new MemorySync(store);
  const result = sync.syncFromGit();

  const total = result.imported + result.updated + result.removed;
  if (total > 0) {
    const parts: string[] = [];
    if (result.imported > 0) parts.push(`${result.imported} new`);
    if (result.updated > 0) parts.push(`${result.updated} updated`);
    if (result.removed > 0) parts.push(`${result.removed} removed`);
    console.error(`[aide-memory] Synced memories: ${parts.join(', ')}.`);
  }

  if (result.conflicts.length > 0) {
    for (const c of result.conflicts) {
      console.error(`[aide-memory] Conflict: memory ${c.uuid} has local edits newer than incoming file. Keeping newer version.`);
    }
  }

  store.close();
} catch {
  // Never block git — exit silently on any error
  process.exit(0);
}
