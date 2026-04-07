#!/usr/bin/env node

/**
 * aide-memory CLI
 *
 * Standalone CLI for the AIDE memory layer.
 * Provides full MCP parity for managing persistent project memories.
 *
 * Commands:
 *   aide-memory recall <path>          Recall memories for a file/directory path
 *   aide-memory remember <what>        Store a memory
 *   aide-memory update <id>            Update a memory
 *   aide-memory forget <id>            Delete a memory
 *   aide-memory search <query>         Search memories by keyword
 *   aide-memory list                   List memories
 *   aide-memory stats                  Show memory analytics summary
 *   aide-memory config <key> [value]   Get or set configuration
 *   aide-memory sync import            Rebuild SQLite cache from JSON files
 *   aide-memory sync export            Ensure all memories have JSON files
 *   aide-memory migrate                Migrate from legacy memory.db format
 *   aide-memory init                   Initialize a new project (coming soon)
 */

import { Command } from 'commander';
import { runRecall } from './commands/memory/recall';
import { runRemember } from './commands/memory/remember';
import { runUpdate } from './commands/memory/update';
import { runForget } from './commands/memory/forget';
import { runSearch } from './commands/memory/search';
import { runList } from './commands/memory/list';
import { runStats } from './commands/memory/stats';
import { runConfig } from './commands/memory/config';
import { runSyncImport, runSyncExport } from './commands/memory/sync';
import { runMigrate } from './commands/memory/migrate';
import { runInit } from './commands/memory/init';
import { checkForUpdates, printUpdateNotice } from '../memory/updater';
import { AideConfig } from '../memory/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json');

export function createProgram(): Command {
  const program = new Command();

  program
    .name('aide-memory')
    .description('AIDE Memory — persistent context for AI coding agents')
    .version(pkg.version);

  // aide-memory recall <path>
  program
    .command('recall')
    .description('Recall memories for a file/directory path')
    .argument('<path>', 'File or directory path to recall context for')
    .action((filePath: string) => {
      runRecall(filePath);
    });

  // aide-memory remember <what>
  program
    .command('remember')
    .description('Store a new memory')
    .argument('<what>', 'The knowledge to remember')
    .requiredOption('--layer <layer>', 'Memory layer: preferences, technical, area_context, guidelines')
    .option('--scope <scope>', 'Glob pattern for the code area (e.g. "src/components/**")')
    .option('--tags <tags>', 'Comma-separated tags / context label')
    .option('--why <why>', 'Context for why this is worth remembering')
    .option('--contributor <contributor>', 'Who this knowledge came from')
    .action((what: string, options: any) => {
      runRemember(what, options);
    });

  // aide-memory update <id>
  program
    .command('update')
    .description('Update an existing memory')
    .argument('<id>', 'Memory ID to update')
    .option('--what <what>', 'New content')
    .option('--why <why>', 'New reason')
    .option('--scope <scope>', 'New scope')
    .option('--tags <tags>', 'New tags / context label')
    .action((id: string, options: any) => {
      runUpdate(id, options);
    });

  // aide-memory forget <id>
  program
    .command('forget')
    .description('Delete a memory')
    .argument('<id>', 'Memory ID to delete')
    .action((id: string) => {
      runForget(id);
    });

  // aide-memory search <query>
  program
    .command('search')
    .description('Search memories by keyword')
    .argument('<query>', 'Text to search for')
    .option('--layer <layer>', 'Filter by layer')
    .option('--limit <limit>', 'Max results (default 50)')
    .action((query: string, options: any) => {
      runSearch(query, options);
    });

  // aide-memory list
  program
    .command('list')
    .description('List memories')
    .option('--layer <layer>', 'Filter by layer')
    .option('--scope <scope>', 'Filter by scope')
    .option('--contributor <contributor>', 'Filter by contributor')
    .option('--limit <limit>', 'Max results')
    .option('--tag <tag>', 'Filter by tag / context label')
    .action((options: any) => {
      runList(options);
    });

  // aide-memory stats
  program
    .command('stats')
    .description('Show memory analytics summary')
    .action(() => {
      runStats();
    });

  // aide-memory config <key> [value]
  program
    .command('config')
    .description('Get or set configuration (dot-notation keys)')
    .argument('<key>', 'Configuration key (e.g. capture.enabled)')
    .argument('[value]', 'Value to set (omit to read)')
    .action((key: string, value?: string) => {
      runConfig(key, value);
    });

  // aide-memory sync
  const syncCmd = program
    .command('sync')
    .description('Synchronize between JSON files and SQLite cache');

  syncCmd
    .command('import')
    .description('Rebuild SQLite cache from JSON memory files')
    .action(() => {
      runSyncImport();
    });

  syncCmd
    .command('export')
    .description('Export memories to JSON files')
    .action(() => {
      runSyncExport();
    });

  // aide-memory migrate
  program
    .command('migrate')
    .description('Migrate from legacy memory.db format')
    .action(() => {
      runMigrate();
    });

  // aide-memory init
  program
    .command('init')
    .description('Initialize a new .aide/ project')
    .option('--scan', 'Run pre-train scan to generate initial memories')
    .option('--update-rules', 'Only refresh rules files (idempotent)')
    .option('--force', 'Overwrite existing files')
    .action((options: { scan?: boolean; updateRules?: boolean; force?: boolean }) => {
      runInit(options);
    });

  return program;
}

// Only parse when run directly (not when imported for testing)
if (require.main === module) {
  const program = createProgram();
  program.parse(process.argv);

  // Non-blocking update check (fire-and-forget, after command runs)
  try {
    const cwd = process.cwd();
    const config = new AideConfig(cwd);
    if (config.get('updates.check')) {
      checkForUpdates(pkg.version).then((latest) => {
        if (latest) {
          printUpdateNotice(pkg.version, latest);
        }
      }).catch(() => {
        // Update check failure is non-fatal
      });
    }
  } catch {
    // Config load failure is non-fatal for update checks
  }
}
