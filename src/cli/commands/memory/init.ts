/**
 * aide-memory init — Initialize a new .aide/ project.
 */

import chalk from 'chalk';
import { initProject, type InitOptions } from '../../../memory/init';

export function runInit(options: { scan?: boolean; updateRules?: boolean; force?: boolean }): void {
  const projectRoot = process.cwd();

  const initOptions: InitOptions = {
    scan: options.scan,
    updateRules: options.updateRules,
    force: options.force,
  };

  initProject(projectRoot, initOptions)
    .then((result) => {
      if (options.updateRules) {
        console.log(chalk.green('Rules files updated.'));
      } else {
        console.log(chalk.green('Project initialized for aide-memory.'));
      }

      if (result.created.length > 0) {
        console.log(chalk.white('\nCreated:'));
        for (const item of result.created) {
          console.log(chalk.green(`  + ${item}`));
        }
      }

      if (result.skipped.length > 0) {
        console.log(chalk.gray('\nSkipped (already exists):'));
        for (const item of result.skipped) {
          console.log(chalk.gray(`  - ${item}`));
        }
      }

      if (result.warnings.length > 0) {
        console.log(chalk.yellow('\nWarnings:'));
        for (const item of result.warnings) {
          console.log(chalk.yellow(`  ! ${item}`));
        }
      }

      if (result.memoriesGenerated !== undefined) {
        console.log(chalk.cyan(`\nGenerated ${result.memoriesGenerated} memories from pre-train scan.`));
      }
    })
    .catch((err) => {
      console.error(chalk.red(`Init failed: ${err.message}`));
      process.exit(1);
    });
}
