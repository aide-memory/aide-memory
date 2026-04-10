#!/usr/bin/env node
// Direct store access for memory SEARCH preview — no MCP, just SQLite.
// Used by pre-search-nudge.sh hook to find memories matching a search query.
// Returns JSON: { count, topMatches } or "0" if no matches.
// Requires: npm run build (needs dist/ compiled output)

const path = require('path');
const fs = require('fs');

const query = process.argv[2];

if (!query) {
  process.exit(0);
}

try {
  // Determine project root — walk up from the script location
  // Script is at <projectRoot>/scripts/hooks/search-preview.js
  const scriptDir = __dirname;
  const projectRoot = path.resolve(scriptDir, '..', '..');

  // Check if .aide/ directory exists — if not, no memories to search
  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) {
    process.exit(0);
  }

  const distPath = path.join(projectRoot, 'dist', 'memory');
  const { MemoryStore } = require(path.join(distPath, 'store'));

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
