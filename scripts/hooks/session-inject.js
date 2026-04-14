#!/usr/bin/env node
// SessionStart injection — load preferences, guidelines, and always-priority
// memories to inject as context at session start.
// Returns concise text to stdout, capped at ~300 tokens.
// Requires: npm run build (needs dist/ compiled output)

const path = require('path');
const fs = require('fs');

try {
  // Determine project root — walk up from the script location
  // packageRoot = where aide-memory is installed (has dist/)
  const packageRoot = path.resolve(__dirname, '..', '..');
  // projectRoot = the actual project (has .aide/), passed as argv[2] or fallback
  const projectRootArg = process.argv[2];
  const projectRoot = projectRootArg || packageRoot;

  // Check if .aide/ directory exists — if not, no memories to inject
  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) {
    process.exit(0);
  }

  // Load MemoryStore from the package's compiled dist
  const distPath = path.join(packageRoot, 'dist', 'memory');
  const { MemoryStore } = require(path.join(distPath, 'store'));

  // Open store using projectRoot (constructor accepts string project path)
  const store = new MemoryStore({ projectRoot });

  // Load preferences — sorted by updated_at desc, limit 15
  const allPreferences = store.list({ layer: 'preferences' });
  allPreferences.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  const preferences = allPreferences.slice(0, 15);

  // Load all guidelines (no limit)
  const guidelines = store.list({ layer: 'guidelines' });

  // Load any memory with priority="always" from any layer (SQL-level filter)
  const alwaysPriority = store.list({ priority: 'always' });

  store.close();

  // Deduplicate — collect unique UUIDs
  const seen = new Set();
  const deduped = { preferences: [], guidelines: [], always: [] };

  for (const m of preferences) {
    if (!seen.has(m.uuid)) {
      seen.add(m.uuid);
      deduped.preferences.push(m);
    }
  }

  for (const m of guidelines) {
    if (!seen.has(m.uuid)) {
      seen.add(m.uuid);
      deduped.guidelines.push(m);
    }
  }

  for (const m of alwaysPriority) {
    if (!seen.has(m.uuid)) {
      seen.add(m.uuid);
      deduped.always.push(m);
    }
  }

  // Check if we have anything to inject
  const totalCount = deduped.preferences.length + deduped.guidelines.length + deduped.always.length;
  if (totalCount === 0) {
    process.exit(0);
  }

  // Format as concise text — cap at ~300 tokens (~1200 chars)
  const MAX_CHARS = 1200;
  const lines = [];

  if (deduped.preferences.length > 0) {
    lines.push('## Session Preferences');
    for (const m of deduped.preferences) {
      lines.push(`- ${m.what}`);
    }
  }

  if (deduped.guidelines.length > 0) {
    lines.push('## Guidelines');
    for (const m of deduped.guidelines) {
      lines.push(`- ${m.what}`);
    }
  }

  if (deduped.always.length > 0) {
    lines.push('## Always');
    for (const m of deduped.always) {
      lines.push(`- ${m.what}`);
    }
  }

  // Join and truncate
  let output = lines.join('\n');
  if (output.length > MAX_CHARS) {
    output = output.slice(0, MAX_CHARS) + '\n...truncated';
  }

  process.stdout.write(output);
} catch (err) {
  // Silently exit — don't break the agent if DB doesn't exist or build is stale
  process.exit(0);
}
