/**
 * aide-memory recall-log — Show detailed recall history from .aide/recall-log.jsonl.
 *
 * Each entry shows: timestamp, query paths, and every memory that was returned.
 * Use during validation to verify which memories were recalled and when.
 */

import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { requireProjectRoot, LAYER_LABELS } from './utils';

interface RecallLogEntry {
  timestamp: string;
  event?: string; // 'memory_stored' | 'memory_updated' | 'memory_deleted' — absent for recall entries
  query?: {
    paths: string[];
    text: string | null;
    layers: string[] | null;
    limit: number;
  };
  matched_scopes?: string[];
  memories_returned?: Array<{
    id: number;
    uuid: string;
    layer: string;
    what: string;
    scope: string | null;
    tags: string[];
    recalled_count: number;
  }>;
  count?: number;
  memory?: {
    id: number;
    uuid: string;
    layer: string;
    what: string;
    why: string | null;
    scope: string | null;
    tags: string[];
  };
}

export function runRecallLog(options: { last?: string; clear?: boolean }): void {
  const projectRoot = requireProjectRoot();
  const logPath = path.join(projectRoot, '.aide', 'recall-log.jsonl');

  if (options.clear) {
    if (fs.existsSync(logPath)) {
      fs.unlinkSync(logPath);
      console.log(chalk.green('Recall log cleared.'));
    } else {
      console.log(chalk.yellow('No recall log to clear.'));
    }
    return;
  }

  if (!fs.existsSync(logPath)) {
    console.log(chalk.yellow('No recall log found. Recalls will be logged after the next aide_recall call.'));
    console.log(chalk.gray(`  Expected at: ${logPath}`));
    return;
  }

  const content = fs.readFileSync(logPath, 'utf-8').trim();
  if (!content) {
    console.log(chalk.yellow('Recall log is empty.'));
    return;
  }

  const lines = content.split('\n');
  const limit = options.last ? parseInt(options.last, 10) : lines.length;
  const entries: RecallLogEntry[] = lines
    .slice(-limit)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);

  if (entries.length === 0) {
    console.log(chalk.yellow('No valid recall log entries found.'));
    return;
  }

  const recallEntries = entries.filter(e => !e.event);
  const storeEntries = entries.filter(e => e.event);

  console.log(chalk.white.bold(`Event Log — ${entries.length} event(s)\n`));

  let recallNum = 0;
  let storeNum = 0;

  for (const entry of entries) {
    const time = new Date(entry.timestamp).toLocaleString();

    if (entry.event && entry.memory) {
      // Store event (memory_stored, memory_updated, memory_deleted)
      storeNum++;
      const eventLabel = entry.event === 'memory_stored' ? chalk.green('STORED')
        : entry.event === 'memory_updated' ? chalk.yellow('UPDATED')
        : chalk.red('DELETED');

      console.log(`${eventLabel} ${chalk.gray(`(${time})`)}`);
      console.log(`   [${entry.memory.id}] ${chalk.white(entry.memory.what)}`);
      const layerLabel = LAYER_LABELS[entry.memory.layer] ?? entry.memory.layer;
      console.log(chalk.gray(`   Layer: ${layerLabel} | Scope: ${entry.memory.scope ?? 'project-wide'}`));
      if (entry.memory.why) {
        console.log(chalk.gray(`   Why: ${entry.memory.why}`));
      }
    } else if (entry.query && entry.memories_returned) {
      // Recall event
      recallNum++;
      console.log(chalk.cyan.bold(`── Recall #${recallNum} `) + chalk.gray(`(${time})`));
      console.log(chalk.gray(`   Query paths: ${entry.query.paths.length > 0 ? entry.query.paths.join(', ') : '(none)'}`));
      if (entry.query.text) {
        console.log(chalk.gray(`   Query text:  ${entry.query.text}`));
      }
      if (entry.query.layers) {
        console.log(chalk.gray(`   Layers:      ${entry.query.layers.join(', ')}`));
      }
      console.log(chalk.gray(`   Matched scopes: ${entry.matched_scopes && entry.matched_scopes.length > 0 ? entry.matched_scopes.join(', ') : '(none)'}`));
      console.log();

      if (entry.memories_returned.length === 0) {
        console.log(chalk.yellow('   No memories returned.'));
      } else {
        console.log(chalk.white(`   ${entry.memories_returned.length} memor${entry.memories_returned.length === 1 ? 'y' : 'ies'} returned:`));
        console.log();
        for (const m of entry.memories_returned) {
          const layerLabel = LAYER_LABELS[m.layer] ?? m.layer;
          console.log(`   ${chalk.green('✓')} [${m.id}] ${chalk.white(m.what)}`);
          console.log(chalk.gray(`     Layer: ${layerLabel} | Scope: ${m.scope ?? 'project-wide'} | Recalled: ${m.recalled_count}x`));
          if (m.tags.length > 0) {
            console.log(chalk.gray(`     Tags: ${m.tags.join(', ')}`));
          }
        }
      }
    }
    console.log();
  }

  // Summary
  const totalRecalls = recallEntries.length;
  const totalMemoriesReturned = recallEntries.reduce((sum, e) => sum + (e.count ?? 0), 0);
  const emptyRecalls = recallEntries.filter(e => (e.count ?? 0) === 0).length;
  const stored = storeEntries.filter(e => e.event === 'memory_stored').length;
  const updated = storeEntries.filter(e => e.event === 'memory_updated').length;
  const deleted = storeEntries.filter(e => e.event === 'memory_deleted').length;

  console.log(chalk.white.bold('Summary'));
  console.log(`  Recall events:            ${totalRecalls}`);
  console.log(`  Total memories returned:   ${totalMemoriesReturned}`);
  console.log(`  Empty recalls (0 results): ${emptyRecalls}`);
  if (totalRecalls > 0) {
    console.log(`  Avg memories per recall:   ${(totalMemoriesReturned / totalRecalls).toFixed(1)}`);
  }
  console.log(`  Memories stored:           ${stored}`);
  console.log(`  Memories updated:          ${updated}`);
  console.log(`  Memories deleted:           ${deleted}`);
}
