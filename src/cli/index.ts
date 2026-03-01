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
import { loadOrCreateProjectConfig, updateProjectConfig, AIDE_DEFAULTS } from '../core/config';
import { logInfo, logError } from '../core/logger';
import { initProject } from './commands/init';
import { reindexProject } from './commands/reindex';
import { watchProject } from './commands/watch';
import { askQuestion } from './commands/ask';
import { searchMemories } from './commands/search';
import { startRepl } from './repl';
import { startWebServer } from '../web/server';

const program = new Command();

program
  .name('aide')
  .description('AIDE V0 - Local project-aware AI coding assistant')
  .version('0.2.0')
  .enablePositionalOptions()
  .passThroughOptions();

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
  .option('--reasoning <model>', 'Override reasoning model for this run')
  .option('--context <model>', 'Override context model for this run')
  .option('-d, --depth <depth>', 'Graph traversal depth', '2')
  .option('-f, --fanout <fanout>', 'Max symbols per relation', '5')
  .option(
    '-t, --tokens <tokens>',
    'Token budget for context (legacy alias)',
    String(AIDE_DEFAULTS.tokenBudget)
  )
  .option(
    '--token-budget <budget>',
    'Token budget for context',
    String(AIDE_DEFAULTS.tokenBudget)
  )
  .option('--max-blocks <blocks>', 'Max code blocks to include', '10')
  .option(
    '-s, --strategy <strategy>',
    'Retrieval strategy: auto, semanticandgraph, simple, tools, hybrid'
  )
  .option('--no-graph', 'Force filesystem fallbacks even when graph is available')
  .option(
    '--hybrid-mode <mode>',
    'Hybrid mode: code (full code upfront) or hints (entry points only)'
  )
  .option(
    '-H, --history-mode <mode>',
    'History access: direct (in prompt) or tools (on-demand)'
  )
  .option('--debug', 'Print debug information (includes verbose logging)')
  .option('-v, --verbose', 'Alias for --debug')
  .action(
    async (
      question: string,
      options: {
        path?: string;
        reasoning?: string;
        context?: string;
        depth?: string;
        fanout?: string;
        tokens?: string;
        tokenBudget?: string;
        maxBlocks?: string;
        strategy?: string;
        graph?: boolean;
        hybridMode?: string;
        historyMode?: string;
        debug?: boolean;
        verbose?: boolean;
      }
    ) => {
      try {
        const rootPath = path.resolve(options.path || process.cwd());
        const config = await loadOrCreateProjectConfig(rootPath);

        // --verbose is alias for --debug
        if (options.verbose) options.debug = true;

        // Apply runtime model overrides (don't persist to config file)
        if (options.reasoning) {
          config.models = { ...config.models, reasoning: options.reasoning };
        }
        if (options.context) {
          config.models = { ...config.models, context: options.context };
        }

        // Use tokenBudget if specified, fall back to tokens (legacy), then default
        const tokenBudget = parseInt(
          options.tokenBudget ||
            options.tokens ||
            String(AIDE_DEFAULTS.tokenBudget),
          10
        );
        const maxBlocks = parseInt(
          options.maxBlocks || String(AIDE_DEFAULTS.maxBlocks),
          10
        );

        await askQuestion(config, question, {
          depth: parseInt(options.depth || '2', 10),
          fanout: parseInt(options.fanout || '5', 10),
          tokenBudget,
          maxBlocks,
          strategy: options.strategy as 'simple' | 'tools' | 'hybrid' | 'graph' | 'semantic' | 'semanticandgraph' | 'auto',
          hybridMode: options.hybridMode as 'code' | 'hints',
          historyMode: options.historyMode as 'direct' | 'tools',
          debug: options.debug,
          noGraph: options.graph === false,
        });
      } catch (err) {
        logError('Ask failed', err);
        process.exit(1);
      }
    }
  );

// aide search <keyword> - Search memories
program
  .command('search')
  .description('Search memories by keyword')
  .argument('<keyword>', 'Text to search for in memory content')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('-l, --layer <layer>', 'Filter by layer (preferences, technical, area_context, guidelines)')
  .option('--limit <limit>', 'Max results (default 50)')
  .action(
    async (
      keyword: string,
      options: { path?: string; layer?: string; limit?: string }
    ) => {
      try {
        const rootPath = path.resolve(options.path || process.cwd());
        const { MemoryStore } = await import('../memory/store');
        const store = new MemoryStore(rootPath);
        try {
          searchMemories(store, keyword, {
            layer: options.layer,
            limit: options.limit ? parseInt(options.limit, 10) : undefined,
          });
        } finally {
          store.close();
        }
      } catch (err) {
        logError('Search failed', err);
        process.exit(1);
      }
    }
  );

// aide web [path] - Start web interface
program
  .command('web')
  .description('Start web interface with markdown rendering')
  .argument('[path]', 'Project root path', process.cwd())
  .option('-p, --port <port>', 'Server port', '3000')
  .option('-o, --open', 'Open browser automatically')
  .action(
    async (
      projectPath: string,
      options: {
        port?: string;
        open?: boolean;
      }
    ) => {
      try {
        const rootPath = path.resolve(projectPath);
        logInfo(`Starting AIDE Web for: ${rootPath}`);

        const config = await loadOrCreateProjectConfig(rootPath);

        // Check if init is needed
        const fs = await import('fs');
        const { getProjectDbPath } = await import('../storage/paths');
        const dbPath = getProjectDbPath(config.id);

        if (!fs.existsSync(dbPath)) {
          logInfo('Project not indexed. Running init...');
          await initProject(config);
        }

        await startWebServer(config, {
          port: parseInt(options.port || '3000', 10),
          open: options.open,
        });
      } catch (err) {
        logError('Web server failed', err);
        process.exit(1);
      }
    }
  );

// aide config - View or update project configuration
program
  .command('config')
  .description('View or update project configuration (models, strategy, etc.)')
  .option('-p, --path <path>', 'Project root path', process.cwd())
  .option('--reasoning <model>', 'Set reasoning model')
  .option('--context <model>', 'Set context model')
  .option('--embedding <model>', 'Set embedding model')
  .option('--reset', 'Reset models to AIDE_DEFAULTS (clears user override)')
  .action(
    async (options: {
      path?: string;
      reasoning?: string;
      context?: string;
      embedding?: string;
      reset?: boolean;
    }) => {
      try {
        const rootPath = path.resolve(options.path || process.cwd());
        let config = await loadOrCreateProjectConfig(rootPath);

        if (options.reset) {
          // Reset to defaults and clear the user override flag
          config = updateProjectConfig(config, {
            models: { ...AIDE_DEFAULTS.models },
            modelsSetByUser: false,
          });
          console.log('Models reset to defaults.');
        } else if (options.reasoning || options.context || options.embedding) {
          // Update specified models and mark as user-set
          const models = { ...config.models };
          if (options.reasoning) models.reasoning = options.reasoning;
          if (options.context) models.context = options.context;
          if (options.embedding) models.embedding = options.embedding;
          config = updateProjectConfig(config, {
            models,
            modelsSetByUser: true,
          });
          console.log('Config updated.');
        }

        // Always show current config
        console.log(`\nProject: ${config.rootPath}`);
        console.log(`Config:  ~/.aide/projects/${config.id}/config.json`);
        console.log(`\nModels:`);
        console.log(`  reasoning: ${config.models.reasoning}`);
        console.log(`  context:   ${config.models.context}`);
        console.log(`  embedding: ${config.models.embedding}`);
        console.log(`  (${config.modelsSetByUser ? 'user-set — will NOT auto-sync from defaults' : 'default — will auto-sync when AIDE_DEFAULTS change'})`);
        if (config.strategy) {
          console.log(`\nStrategy: ${config.strategy}`);
        }
      } catch (err) {
        logError('Config command failed', err);
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
  .option('--reasoning <model>', 'Override reasoning model for this session')
  .option('--context <model>', 'Override context model for this session')
  .option(
    '--strategy <strategy>',
    'Retrieval strategy: auto, semanticandgraph, simple, tools, hybrid'
  )
  .option('--no-graph', 'Force filesystem fallbacks even when graph is available')
  .option(
    '--hybrid-mode <mode>',
    'Hybrid mode: code (full code upfront) or hints (entry points only)'
  )
  .option(
    '--history-mode <mode>',
    'History access: direct (in prompt) or tools (on-demand)'
  )
  .option(
    '--token-budget <budget>',
    'Token budget for context',
    String(AIDE_DEFAULTS.tokenBudget)
  )
  .option('--max-blocks <blocks>', 'Max code blocks to include', '10')
  .option('-v, --verbose', 'Log full context sent to model')
  .action(
    async (
      projectPath: string,
      options: {
        init?: boolean;
        new?: boolean;
        clearHistory?: boolean;
        reasoning?: string;
        context?: string;
        strategy?: string;
        graph?: boolean;
        hybridMode?: string;
        historyMode?: string;
        tokenBudget?: string;
        maxBlocks?: string;
        verbose?: boolean;
      }
    ) => {
      try {
        const rootPath = path.resolve(projectPath);
        logInfo(`Starting AIDE for: ${rootPath}`);

        const config = await loadOrCreateProjectConfig(rootPath);

        // Apply runtime model overrides (don't persist to config file)
        if (options.reasoning) {
          config.models = { ...config.models, reasoning: options.reasoning };
        }
        if (options.context) {
          config.models = { ...config.models, context: options.context };
        }

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
          strategy: options.strategy as 'simple' | 'tools' | 'hybrid' | 'graph' | 'semantic' | 'semanticandgraph' | 'auto',
          hybridMode: options.hybridMode as 'code' | 'hints',
          historyMode: options.historyMode as 'direct' | 'tools',
          tokenBudget: options.tokenBudget
            ? parseInt(options.tokenBudget, 10)
            : undefined,
          maxBlocks: options.maxBlocks
            ? parseInt(options.maxBlocks, 10)
            : undefined,
          verbose: options.verbose,
          noGraph: options.graph === false,
        });
      } catch (err) {
        logError('Startup failed', err);
        process.exit(1);
      }
    }
  );

program.parse();
