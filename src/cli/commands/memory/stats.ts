/**
 * aide-memory stats — Show memory analytics summary.
 */

import chalk from 'chalk';
import { MemoryStore } from '../../../memory/store';
import { LAYER_LABELS, VALID_LAYERS, requireProjectRoot } from './utils';

export function runStats(): void {
  const projectRoot = requireProjectRoot();
  const store = new MemoryStore(projectRoot);

  try {
    const total = store.count();
    const active = store.count({ status: 'active' });

    console.log(chalk.white.bold('Memory Statistics\n'));
    console.log(`  Total memories: ${total}`);
    console.log(`  Active: ${active}`);
    console.log();

    // Count by layer
    console.log(chalk.magenta.bold('  By Layer:'));
    for (const layer of VALID_LAYERS) {
      const count = store.count({ layer: layer as any });
      console.log(`    ${LAYER_LABELS[layer]}: ${count}`);
    }
    console.log();

    // Most recalled
    const all = store.list({ status: 'active' });
    const sorted = [...all].sort((a, b) => b.recalled_count - a.recalled_count);
    const topRecalled = sorted.filter(m => m.recalled_count > 0).slice(0, 5);

    if (topRecalled.length > 0) {
      console.log(chalk.magenta.bold('  Most Recalled:'));
      for (const m of topRecalled) {
        console.log(`    [${m.id}] ${m.what} (${m.recalled_count}x)`);
      }
      console.log();
    }

    // Source breakdown
    const sourceCounts = new Map<string, number>();
    for (const m of all) {
      sourceCounts.set(m.source, (sourceCounts.get(m.source) ?? 0) + 1);
    }

    if (sourceCounts.size > 0) {
      console.log(chalk.magenta.bold('  By Source:'));
      for (const [source, count] of sourceCounts) {
        console.log(`    ${source}: ${count}`);
      }
    }
  } finally {
    store.close();
  }
}
