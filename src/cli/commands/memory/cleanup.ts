/**
 * aide-memory cleanup — Remove stale session tracking files.
 *
 * Tracking files (.aide/cache/recalled-paths-*.txt, searched-queries-*.txt,
 * correction-pending-*.txt) accumulate from dead sessions. Each session's
 * files are kept during that session and cleared by PreCompact/SessionStart,
 * but if a session crashes or exits without cleanup, its files remain.
 *
 * This command removes files older than the TTL (default 7 days).
 */

import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { requireProjectRoot, brand } from './utils';

interface CleanupOptions {
  olderThan?: string; // e.g. "7d", "1h"
  all?: boolean; // remove all stale files regardless of age
  dryRun?: boolean;
}

function parseDuration(s: string): number {
  const match = s.match(/^(\d+)\s*([smhd])$/);
  if (!match) throw new Error(`Invalid duration: ${s}. Use formats like "7d", "24h", "30m".`);
  const n = parseInt(match[1], 10);
  const unit = match[2];
  const ms: Record<string, number> = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * ms[unit];
}

export function runCleanup(options: CleanupOptions = {}): void {
  const projectRoot = requireProjectRoot();
  const cacheDir = path.join(projectRoot, '.aide', 'cache');

  if (!fs.existsSync(cacheDir)) {
    console.log(chalk.gray('No cache directory — nothing to clean.'));
    return;
  }

  const ttlMs = options.all ? 0 : parseDuration(options.olderThan || '7d');
  const cutoff = Date.now() - ttlMs;

  const patterns = ['recalled-paths-', 'searched-queries-', 'correction-pending-', 'recalled-ids-'];
  const files = fs.readdirSync(cacheDir);
  const toDelete: string[] = [];

  for (const f of files) {
    if (!patterns.some(p => f.startsWith(p))) continue;
    const fp = path.join(cacheDir, f);
    const stat = fs.statSync(fp);
    if (stat.mtimeMs < cutoff) {
      toDelete.push(fp);
    }
  }

  if (toDelete.length === 0) {
    console.log(chalk.gray('No stale tracking files found.'));
    return;
  }

  if (options.dryRun) {
    console.log(brand(`Would delete ${toDelete.length} stale file(s):`));
    for (const f of toDelete) {
      const stat = fs.statSync(f);
      const ageHours = Math.floor((Date.now() - stat.mtimeMs) / 3600000);
      console.log(chalk.gray(`  ${path.basename(f)} (${ageHours}h old)`));
    }
    return;
  }

  for (const f of toDelete) {
    fs.unlinkSync(f);
  }

  console.log(brand(`Cleaned up ${toDelete.length} stale tracking file(s).`));
}
