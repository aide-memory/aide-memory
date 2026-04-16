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

  // Load per-layer injection settings from defaults.json
  const defaults = JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8'));

  const prefLimit = defaults['injection.preferences']?.value ?? 15;
  const techEnabled = defaults['injection.technical']?.value ?? false;
  const areaEnabled = defaults['injection.area_context']?.value ?? false;
  const guidelinesMode = defaults['injection.guidelines']?.value ?? 'all';
  const priorityOverride = defaults['injection.priorityAlwaysOverride']?.value ?? true;

  // Helper: load a layer with a configurable limit
  // setting: false → skip, "all" → no limit, number → top N
  function loadLayer(store, layer, setting) {
    if (setting === false) return [];
    const all = store.list({ layer });
    all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
    if (setting === 'all') return all;
    if (typeof setting === 'number' && setting > 0) return all.slice(0, setting);
    return all;
  }

  // Load MemoryStore from the package's compiled dist
  const distPath = path.join(packageRoot, 'dist', 'memory');
  const { MemoryStore } = require(path.join(distPath, 'store'));

  // Open store using projectRoot (constructor accepts string project path)
  const store = new MemoryStore({ projectRoot });

  // Load each layer based on per-layer settings
  const preferences = loadLayer(store, 'preferences', prefLimit);
  const technical = loadLayer(store, 'technical', techEnabled);
  const areaContext = loadLayer(store, 'area_context', areaEnabled);
  const guidelines = loadLayer(store, 'guidelines', guidelinesMode);

  // Load any memory with priority="always" from any layer (SQL-level filter)
  const alwaysPriority = priorityOverride ? store.list({ priority: 'always' }) : [];

  store.close();

  // Deduplicate — collect unique UUIDs
  const seen = new Set();
  const deduped = { preferences: [], technical: [], area_context: [], guidelines: [], always: [] };

  for (const m of preferences) {
    if (!seen.has(m.uuid)) {
      seen.add(m.uuid);
      deduped.preferences.push(m);
    }
  }

  for (const m of technical) {
    if (!seen.has(m.uuid)) {
      seen.add(m.uuid);
      deduped.technical.push(m);
    }
  }

  for (const m of areaContext) {
    if (!seen.has(m.uuid)) {
      seen.add(m.uuid);
      deduped.area_context.push(m);
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
  const totalCount = deduped.preferences.length + deduped.technical.length +
    deduped.area_context.length + deduped.guidelines.length + deduped.always.length;
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

  if (deduped.technical.length > 0) {
    lines.push('## Technical Context');
    for (const m of deduped.technical) {
      lines.push(`- ${m.what}`);
    }
  }

  if (deduped.area_context.length > 0) {
    lines.push('## Area Context');
    for (const m of deduped.area_context) {
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
