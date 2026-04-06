#!/usr/bin/env node

import { startServer } from './server';

const projectPath = process.argv[2] || process.cwd();

startServer(projectPath).catch((err) => {
  console.error('Failed to start aide-memory server:', err);
  process.exit(1);
});
