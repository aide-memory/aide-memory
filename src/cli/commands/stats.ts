/**
 * aide stats - Display memory analytics and usage statistics
 */

import chalk from 'chalk';
import { Analytics } from '../../memory/analytics';
import type { MemoryStats } from '../../memory/analytics';

const LAYER_LABELS: Record<string, string> = {
  preferences: 'preferences',
  technical: 'technical',
  area_context: 'area_context',
  guidelines: 'guidelines',
};

export function displayStats(analytics: Analytics): void {
  const stats = analytics.getStats();

  console.log(chalk.white.bold('\nAIDE Memory Stats'));
  console.log(chalk.gray('\u2500'.repeat(17)));

  // Total and by layer
  const layerParts = Object.entries(stats.byLayer)
    .map(([layer, count]) => `${count} ${LAYER_LABELS[layer] ?? layer}`)
    .join(', ');

  console.log(
    chalk.white(`Memories: ${stats.totalMemories} total`) +
    (layerParts ? chalk.gray(` (${layerParts})`) : '')
  );

  // Most recalled
  if (stats.mostRecalled.length > 0) {
    console.log(chalk.white('\nMost recalled:'));
    for (let i = 0; i < stats.mostRecalled.length; i++) {
      const m = stats.mostRecalled[i];
      const what = m.what.length > 50 ? m.what.slice(0, 47) + '...' : m.what;
      console.log(
        chalk.white(`  ${i + 1}. `) +
        chalk.cyan(`"${what}"`) +
        chalk.gray(` (${m.recalled_count}x)`) +
        chalk.magenta(` [${m.layer}]`)
      );
    }
  }

  // Capture source breakdown
  const sources = stats.captureSourceBreakdown;
  const sourceTotal = Object.values(sources).reduce((a, b) => a + b, 0);
  if (sourceTotal > 0) {
    console.log(chalk.white('\nCapture sources:'));
    for (const [source, count] of Object.entries(sources)) {
      const pct = Math.round((count / sourceTotal) * 100);
      console.log(chalk.white(`  ${source}: ${count}`) + chalk.gray(` (${pct}%)`));
    }
  }

  // Stale
  if (stats.staleCount > 0) {
    console.log(chalk.yellow(`\nStale: ${stats.staleCount} memories with 0 recalls after 30+ days`));
  }

  console.log();
}
