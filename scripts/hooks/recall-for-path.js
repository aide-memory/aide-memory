#!/usr/bin/env node
// Direct store access for memory COUNT — no MCP, just SQLite.
// Used by pre-read-recall.sh hook to count memories matching a file path.
// Returns ONLY the count (a single integer), never memory content.
// Requires: npm run build (needs dist/ compiled output)

const path = require('path');
const fs = require('fs');

const filePath = process.argv[2];

if (!filePath) {
  process.exit(0);
}

try {
  // Determine project root — walk up from the script location
  // Script is at <projectRoot>/scripts/hooks/recall-for-path.js
  const scriptDir = __dirname;
  const projectRoot = path.resolve(scriptDir, '..', '..');

  // Check if .aide/ directory exists — if not, no memories to count
  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) {
    process.exit(0);
  }

  const distPath = path.join(projectRoot, 'dist', 'memory');
  const { MemoryStore } = require(path.join(distPath, 'store'));
  const { scopeMatchesPath } = require(path.join(distPath, 'recall'));

  // Convert absolute path to relative for scope matching
  // Scopes are stored as relative (e.g. "src/memory/**") but Claude Code
  // passes absolute paths (e.g. "/Users/.../src/memory/store.ts")
  let relativePath = filePath;
  if (path.isAbsolute(filePath) && filePath.startsWith(projectRoot)) {
    relativePath = path.relative(projectRoot, filePath);
  }

  // Open store using projectRoot (constructor accepts string project path)
  const store = new MemoryStore(projectRoot);

  // Get all active memories and count those matching the path scope
  const allMemories = store.list({ status: 'active' });
  let count = 0;
  for (const m of allMemories) {
    if (scopeMatchesPath(m.scope, relativePath)) {
      count++;
    }
  }

  store.close();

  // Output only the count — the hook script handles formatting
  process.stdout.write(String(count));
} catch (err) {
  // Silently exit — don't break the agent if DB doesn't exist or build is stale
  process.exit(0);
}
