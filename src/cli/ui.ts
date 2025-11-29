import chalk from 'chalk';

export const ui = {
  prompt: chalk.cyan('aide> '),
  file: (p: string) => chalk.green(p),
  heading: (t: string) => chalk.magenta.bold(t),
  error: (t: string) => chalk.red(t),
  info: (t: string) => chalk.gray(t),
};
