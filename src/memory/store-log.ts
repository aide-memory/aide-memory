import fs from 'fs';
import path from 'path';
import type { Memory } from './types';

/**
 * Append a store event (memory_stored, memory_updated, memory_deleted)
 * to .aide/recall-log.jsonl alongside recall events.
 * Same file, different event type — one log for all observability.
 * Non-fatal: if logging fails, store operations still work.
 */
export function logStoreEvent(
  logDir: string | null,
  event: 'memory_stored' | 'memory_updated' | 'memory_deleted',
  memory: Memory,
): void {
  if (!logDir) return;
  try {
    const logPath = path.join(logDir, 'recall-log.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      event,
      memory: {
        id: memory.id,
        uuid: memory.uuid,
        layer: memory.layer,
        what: memory.what,
        why: memory.why ?? null,
        scope: memory.scope ?? null,
        tags: memory.tags,
      },
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Non-fatal
  }
}
