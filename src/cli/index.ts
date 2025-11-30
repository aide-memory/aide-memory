#!/usr/bin/env node

/**
 * AIDE V0 CLI
 *
 * Commands:
 *   aide init [path]        - Initialize/index a project
 *   aide reindex [path]     - Incremental reindex
 *   aide watch [path]       - Watch for changes
 *   aide ask <question>     - Ask a single question
 *   aide [path]             - Start interactive REPL (default)
 */

import { Command } from 'commander';
import path from 'path';
import { loadOrCreateProjectConfig } from '../core/config';
import { logInfo, logError } from '../core/logger';
import { initProject } from './commands/init';
import { reindexProject } from './commands/reindex';
import { watchProject } from './commands/watch';
import { askQuestion } from './commands/ask';
import { startRepl } from './repl';

const program = new Command();

program
  .name('aide')
  .description('AIDE V0 - Local project-aware AI coding assistant')
  .version('0.2.0');

// aide init [path]
program
  .command('init')
  .description('Initialize and index a project')
  .argument('[path]', 'Project root path', process.cwd())
  .option('-f, --force', 'Force reindex from scratch')
  .option('--clear-sessions', 'Clear all session files')
  .action(
    async (
      projectPath: string,
      options: { force?: boolean; clearSessions?: boolean }
    ) => {
      try {
        const rootPath = path.resolve(projectPath);
        logInfo(`Initializing project at: ${rootPath}`);

        const config = await loadOrCreateProjectConfig(rootPath);
        await initProject(config, {
          force: options.force,
          clearSessions: options.clearSessions,
        });
      } catch (err) {
        logError('Init failed', err);
        process.exit(1);
      }
    }
  );

// aide reindex [path]
program
  .command('reindex')
  .description('Incrementally reindex changed files')
  .argument('[path]', 'Project root path', process.cwd())
  .option('-f, --files <files...>', 'Specific files to reindex')
  .action(async (projectPath: string, options: { files?: string[] }) => {
    try {
      const rootPath = path.resolve(projectPath);
      const config = await loadOrCreateProjectConfig(rootPath);
      await reindexProject(config, { files: options.files });
    } catch (err) {
      logError('Reindex failed', err);
      process.exit(1);
    }
  });

// aide watch [path]
program
  .command('watch')
  .description('Watch for file changes and auto-reindex')
  .argument('[path]', 'Project root path', process.cwd())
  .option('-d, --debounce <ms>', 'Debounce delay in ms', '1000')
  .action(async (projectPath: string, options: { debounce?: string }) => {
    try {
      const rootPath = path.resolve(projectPath);
      const config = await loadOrCreateProjectConfig(rootPath);
      await watchProject(config, {
        debounceMs: parseInt(options.debounce || '1000', 10),
      });
    } catch (err) {
      logError('Watch failed', err);
      process.exit(1);
    }
  });

// aide ask <question>
program
  .command('ask')
  .description('Ask a single question about the project')
  .argument('<question>', 'Your question')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('-d, --depth <depth>', 'Graph traversal depth', '2')
  .option('-f, --fanout <fanout>', 'Max symbols per relation', '5')
  .option('-t, --tokens <tokens>', 'Token budget for context', '4000')
  .option('--debug', 'Print debug information')
  .action(
    async (
      question: string,
      options: {
        path?: string;
        depth?: string;
        fanout?: string;
        tokens?: string;
        debug?: boolean;
      }
    ) => {
      try {
        const rootPath = path.resolve(options.path || process.cwd());
        const config = await loadOrCreateProjectConfig(rootPath);

        await askQuestion(config, question, {
          depth: parseInt(options.depth || '2', 10),
          fanout: parseInt(options.fanout || '5', 10),
          tokenBudget: parseInt(options.tokens || '4000', 10),
          debug: options.debug,
        });
      } catch (err) {
        logError('Ask failed', err);
        process.exit(1);
      }
    }
  );

// aide [path] - Default: start REPL
program
  .argument('[path]', 'Project root path', process.cwd())
  .option('--no-init', 'Skip auto-init if not indexed')
  .option('-n, --new', 'Start a new session instead of resuming')
  .option('--clear-history', 'Clear chat history before starting')
  .action(
    async (
      projectPath: string,
      options: { init?: boolean; new?: boolean; clearHistory?: boolean }
    ) => {
      try {
        const rootPath = path.resolve(projectPath);
        logInfo(`Starting AIDE for: ${rootPath}`);

        const config = await loadOrCreateProjectConfig(rootPath);

        // Check if init is needed
        const fs = await import('fs');
        const { getProjectDbPath } = await import('../storage/paths');
        const dbPath = getProjectDbPath(config.id);

        if (!fs.existsSync(dbPath)) {
          if (options.init !== false) {
            logInfo('Project not indexed. Running init...');
            await initProject(config);
          } else {
            logError('Project not indexed. Run `aide init` first.');
            process.exit(1);
          }
        }

        await startRepl(config, {
          newSession: options.new,
          clearHistory: options.clearHistory,
        });
      } catch (err) {
        logError('Startup failed', err);
        process.exit(1);
      }
    }
  );

program.parse();
