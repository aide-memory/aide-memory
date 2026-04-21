/**
 * aide-memory init — Initialize a new .aide/ project.
 */

import chalk from 'chalk';
import { initProject, type InitOptions } from '../../../memory/init';
import { brand } from './utils';

export function runInit(options: { updateRules?: boolean; force?: boolean; reset?: boolean }): void {
  const projectRoot = process.cwd();

  // Handle --reset: reset config to factory defaults, then run normal init
  if (options.reset) {
    const configPath = require('path').join(projectRoot, '.aide', 'config.json');
    const fs = require('fs');
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
      console.log(brand('Config reset to factory defaults.'));
    }
    // Also reset hooks and rules by running with force
    options.force = true;
  }

  const initOptions: InitOptions = {
    updateRules: options.updateRules,
    force: options.force,
  };

  initProject(projectRoot, initOptions)
    .then((result) => {
      if (options.updateRules) {
        console.log(brand('Rules files updated.'));
      } else {
        console.log(brand('Project initialized for aide-memory.'));
      }

      if (result.created.length > 0) {
        console.log(chalk.white('\nCreated:'));
        for (const item of result.created) {
          console.log(brand(`  + ${item}`));
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
    })
    .catch((err) => {
      console.error(chalk.red(`Init failed: ${err.message}`));
      process.exit(1);
    });
}
