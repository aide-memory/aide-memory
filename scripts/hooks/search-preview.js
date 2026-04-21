#!/usr/bin/env node
// Direct store access for memory SEARCH preview — no MCP, just SQLite.
// Used by pre-search-nudge.sh hook to find memories matching a search query.
// Returns JSON: { count, topMatches } or "0" if no matches.
// Requires: npm run build (needs dist/ compiled output)

const path = require('path');
const fs = require('fs');

const query = process.argv[2];
const projectRootArg = process.argv[3]; // optional: passed by hook scripts

if (!query) {
  process.exit(0);
}

try {
  // packageRoot = where aide-memory is installed (has dist/)
  const packageRoot = path.resolve(__dirname, '..', '..');
  // projectRoot = the actual project being worked on (has .aide/)
  const projectRoot = projectRootArg || packageRoot;

  // Check if .aide/ directory exists — if not, no memories to search
  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) {
    process.exit(0);
  }

  // Load MemoryStore from the package's compiled dist (bundled index)
  const distPath = path.join(packageRoot, 'dist', 'memory');
  const { MemoryStore } = require(path.join(distPath, 'index'));

  // Open store using projectRoot (constructor accepts string project path)
  const store = new MemoryStore({ projectRoot });

  // Get all active memories and filter by query (case-insensitive substring)
  const allMemories = store.list();
  const queryLower = query.toLowerCase();
  const matching = [];
  for (const m of allMemories) {
    const what = (m.what || '').toLowerCase();
    const why = (m.why || '').toLowerCase();
    if (what.includes(queryLower) || why.includes(queryLower)) {
      matching.push(m);
    }
  }

  store.close();

  if (matching.length === 0) {
    process.stdout.write('0');
    process.exit(0);
  }

  // Count scoped vs project-wide matches
  let scoped_count = 0;
  for (const m of matching) {
    const s = m.scope;
    if (s && s !== 'project') scoped_count++;
  }

  // Build top 3 matches — truncate what field to 30 chars
  const topMatches = matching.slice(0, 3).map(m => {
    const what = m.what || '';
    return what.length > 30 ? what.slice(0, 30) + '...' : what;
  });

  const result = {
    count: matching.length,
    scoped_count,
    total_memories: allMemories.length,
    topMatches,
  };
  process.stdout.write(JSON.stringify(result));
} catch (err) {
  // Silently exit — don't break the agent if DB doesn't exist or build is stale
  process.exit(0);
}
