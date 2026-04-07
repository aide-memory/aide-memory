/**
 * aide-memory recall <path> — Recall memories for a file/directory path.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import { recall } from '../../../memory/recall';
import { LAYER_LABELS, groupByLayer, formatMemoryLine, requireProjectRoot } from './utils';

export function runRecall(filePath: string): void {
  const projectRoot = requireProjectRoot();
  const store = new MemoryStore(projectRoot);

  try {
    const result = recall(store, { paths: [filePath] });

    if (result.memories.length === 0) {
      console.log(chalk.gray('No memories found for this area.'));
      return;
    }

    console.log(chalk.white(`Recalled ${result.memories.length} memories for "${filePath}":\n`));

    const grouped = groupByLayer(result.memories);
    for (const [layer, memories] of grouped) {
      console.log(chalk.magenta.bold(`## ${LAYER_LABELS[layer] ?? layer}`));
      for (const m of memories) {
        console.log(formatMemoryLine(m));
        if (m.why) {
          console.log(chalk.gray(`      Why: ${m.why}`));
        }
      }
      console.log();
    }
  } finally {
    store.close();
  }
}
