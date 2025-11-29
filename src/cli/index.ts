#!/usr/bin/env node

import path from 'path';
import { loadOrCreateProjectConfig } from '../core/config';
import { OllamaRuntime } from '../models/localModelClient';
import { buildProjectIndex } from '../project/indexer';
import { startRepl } from './repl';
import { logInfo, logError } from '../core/logger';
import { InMemoryVectorStore } from '../memory/vectorStore';
import { loadProjectIndex } from '../memory/projectStore';

async function main() {
  try {
    const args = process.argv.slice(2);
    const rootPath = path.resolve(args[0] ?? process.cwd());

    logInfo(`Using project root: ${rootPath}`);

    const config = await loadOrCreateProjectConfig(rootPath);
    const model = new OllamaRuntime(config);

    let store = new InMemoryVectorStore();
    const existing = await loadProjectIndex(config.id);

    if (existing && existing.length > 0) {
      logInfo(
        `Loaded existing index with ${existing.length} chunks for project ${config.id}.`
      );
      await store.upsert(existing);
    } else {
      logInfo(`No existing index found. Building new index...`);
      const result = await buildProjectIndex(config, model);
      store = result.store;
    }

    await startRepl({ config, model, store });
  } catch (err) {
    logError('Unexpected error in main()', err);
    process.exit(1);
  }
}

main();
