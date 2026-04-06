#!/usr/bin/env node
// Direct store access for aide_recall — no MCP, just SQLite.
// Used by pre-read-recall.sh hook to inject memories before file reads.
// Requires: npm run build (needs dist/ compiled output)

const path = require('path');

const filePath = process.argv[2];
const projectPath = process.argv[3] || process.cwd();

if (!filePath) {
  process.exit(0);
}

try {
  const distPath = path.join(__dirname, '..', '..', 'dist', 'memory');
  const { MemoryStore } = require(path.join(distPath, 'store'));
  const { recall } = require(path.join(distPath, 'recall'));

  // Convert absolute path to relative for scope matching
  // Scopes are stored as relative (e.g. "src/memory/**") but Claude Code
  // passes absolute paths (e.g. "/Users/.../src/memory/store.ts")
  let relativePath = filePath;
  if (path.isAbsolute(filePath) && filePath.startsWith(projectPath)) {
    relativePath = path.relative(projectPath, filePath);
  }

  const store = new MemoryStore(projectPath);
  const result = recall(store, { paths: [relativePath], limit: 20 });
  store.close();

  if (result.memories.length > 0) {
    const lines = result.memories.map(m => {
      const scope = m.scope && m.scope !== 'project' ? ` (${m.scope})` : '';
      const why = m.why ? ` — ${m.why}` : '';
      return `- [${m.layer}]${scope} ${m.what}${why}`;
    });
    process.stdout.write(lines.join('\n'));
  }
} catch (err) {
  // Silently exit — don't break the agent if DB doesn't exist or build is stale
  process.exit(0);
}
