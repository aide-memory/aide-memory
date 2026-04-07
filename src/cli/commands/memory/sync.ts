/**
 * aide-memory sync import — Rebuild SQLite cache from JSON files.
 * aide-memory sync export — Ensure all memories have JSON files.
 *
 * Note: The file-per-memory architecture is a Phase 1 target. For now
 * these commands work with the SQLite store directly. When JSON file
 * support lands, these will bridge the two formats.
 */

import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { MemoryStore } from '../../../memory/store';
import { requireProjectRoot } from './utils';

export function runSyncImport(): void {
  const projectRoot = requireProjectRoot();
  const store = new MemoryStore(projectRoot);

  try {
    const memoriesDir = path.join(projectRoot, '.aide', 'memories');
    if (!fs.existsSync(memoriesDir)) {
      console.log(chalk.gray('No .aide/memories/ directory found. Nothing to import.'));
      return;
    }

    const files = fs.readdirSync(memoriesDir).filter(f => f.endsWith('.json'));
    if (files.length === 0) {
      console.log(chalk.gray('No JSON memory files found.'));
      return;
    }

    let imported = 0;
    let skipped = 0;

    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(memoriesDir, file), 'utf-8');
        const data = JSON.parse(raw);

        // Check if memory with same content already exists to avoid duplicates
        const existing = store.search(data.what, { limit: 1 });
        if (existing.length > 0 && existing[0].what === data.what && existing[0].layer === data.layer) {
          skipped++;
          continue;
        }

        store.add({
          layer: data.layer,
          what: data.what,
          why: data.why,
          scope: data.scope,
          context_label: data.context_label,
          contributor: data.contributor,
          source: data.source ?? 'import',
        });
        imported++;
      } catch {
        console.error(chalk.yellow(`  Skipped invalid file: ${file}`));
        skipped++;
      }
    }

    console.log(chalk.green(`Import complete: ${imported} imported, ${skipped} skipped.`));
  } finally {
    store.close();
  }
}

export function runSyncExport(): void {
  const projectRoot = requireProjectRoot();
  const store = new MemoryStore(projectRoot);

  try {
    const memoriesDir = path.join(projectRoot, '.aide', 'memories');
    if (!fs.existsSync(memoriesDir)) {
      fs.mkdirSync(memoriesDir, { recursive: true });
    }

    const memories = store.list();
    let exported = 0;
    let skipped = 0;

    for (const m of memories) {
      const filename = `${m.id}.json`;
      const filepath = path.join(memoriesDir, filename);

      if (fs.existsSync(filepath)) {
        skipped++;
        continue;
      }

      const data = {
        id: m.id,
        layer: m.layer,
        what: m.what,
        why: m.why,
        scope: m.scope,
        context_label: m.context_label,
        contributor: m.contributor,
        status: m.status,
        source: m.source,
        created_at: m.created_at,
      };

      fs.writeFileSync(filepath, JSON.stringify(data, null, 2) + '\n');
      exported++;
    }

    console.log(chalk.green(`Export complete: ${exported} exported, ${skipped} already existed.`));
  } finally {
    store.close();
  }
}
