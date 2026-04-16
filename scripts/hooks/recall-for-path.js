#!/usr/bin/env node
// Direct store access for memory COUNT — no MCP, just SQLite.
// Used by pre-read-recall.sh hook to count memories matching a file path.
// Returns ONLY the count (a single integer), never memory content.
// Requires: npm run build (needs dist/ compiled output)

const path = require('path');
const fs = require('fs');

const filePath = process.argv[2];
const projectRootArg = process.argv[3]; // optional: passed by hook scripts

if (!filePath) {
  process.exit(0);
}

try {
  // packageRoot = where aide-memory is installed (has dist/ and scripts/)
  const packageRoot = path.resolve(__dirname, '..', '..');
  // projectRoot = the actual project being worked on (has .aide/)
  const projectRoot = projectRootArg || packageRoot;

  // Check if .aide/ directory exists — if not, no memories to count
  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) {
    process.exit(0);
  }

  // Load MemoryStore from the package's compiled dist
  const distPath = path.join(packageRoot, 'dist', 'memory');
  const { MemoryStore } = require(path.join(distPath, 'store'));
  const { scopeMatchesPath } = require(path.join(distPath, 'recall'));

  // Convert absolute path to relative for scope matching
  // Scopes are stored as relative (e.g. "src/memory/**") but Claude Code
  // passes absolute paths (e.g. "/Users/.../src/memory/store.ts")
  // Resolve symlinks first — macOS /tmp → /private/tmp causes mismatches
  let resolvedProject = projectRoot;
  let resolvedFile = filePath;
  try { resolvedProject = fs.realpathSync(projectRoot); } catch {}
  try { resolvedFile = fs.realpathSync(filePath); } catch {}

  let relativePath = filePath;
  if (path.isAbsolute(resolvedFile) && resolvedFile.startsWith(resolvedProject)) {
    relativePath = path.relative(resolvedProject, resolvedFile);
  }

  // Open store using projectRoot (constructor accepts string project path)
  const store = new MemoryStore({ projectRoot });

  // Get all active memories matching the path scope
  const allMemories = store.list();
  const matching = [];
  for (const m of allMemories) {
    if (scopeMatchesPath(m.scope, relativePath)) {
      matching.push(m);
    }
  }

  store.close();

  if (matching.length === 0) {
    process.stdout.write('0');
    process.exit(0);
  }

  // Count per layer
  const layers = {};
  for (const m of matching) {
    layers[m.layer] = (layers[m.layer] || 0) + 1;
  }

  // Classify memories: file-specific vs directory-scoped vs project-wide
  // For blocking decisions, only count scopes with depth >= minScopeDepth path segments.
  // Broad scopes like src/** (depth 1) are too generic to justify blocking —
  // they match every file in the project. Specific scopes like src/api/**
  // (depth 2) are worth blocking for.
  // Read minScopeDepth from defaults.json
  let MIN_SCOPE_DEPTH = 2;
  try {
    const defaults = JSON.parse(fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8'));
    MIN_SCOPE_DEPTH = defaults['recall.minScopeDepth']?.value ?? 2;
  } catch (e) {
    // Fall back to hardcoded default
  }
  let file_count = 0;
  let dir_count = 0;
  let project_count = 0;
  let scoped_count = 0; // only specific-enough scopes — used for blocking
  const scoped_ids = []; // IDs of scoped memories — used for ID-based recall check
  for (const m of matching) {
    const s = m.scope;
    if (!s || s === 'project') {
      project_count++;
    } else if (s.endsWith('/') || s.endsWith('/**') || s.endsWith('/*')) {
      dir_count++;
      const scopeBase = s.replace(/\/?\*\*\/?$/, '').replace(/\/?\*$/, '').replace(/\/$/, '');
      const depth = scopeBase ? scopeBase.split('/').length : 0;
      if (depth >= MIN_SCOPE_DEPTH) {
        scoped_count++;
        scoped_ids.push(m.id);
      }
    } else {
      file_count++;
      scoped_count++; // exact file scope — always specific enough
      scoped_ids.push(m.id);
    }
  }

  // Total memories in the store (for new-project < 10 threshold)
  const total_memories = allMemories.length;

  // Extract topic keywords from all matching memories
  // Grab: capitalized words (not sentence starters), hyphenated compounds, path-like strings
  const stopWords = new Set([
    'the', 'this', 'that', 'from', 'with', 'into', 'for', 'and', 'but', 'not',
    'all', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will', 'can',
    'should', 'would', 'could', 'may', 'must', 'use', 'used', 'using', 'also',
    'when', 'what', 'how', 'why', 'who', 'which', 'where', 'then', 'than',
    'each', 'every', 'some', 'any', 'does', 'done', 'only', 'just', 'more',
    'most', 'very', 'same', 'other', 'after', 'before', 'about', 'between',
    'IMPORTANT', 'COMPLETE', 'DONE', 'TODO', 'NOTE', 'PENDING', 'NEW', 'OLD',
    'TRUE', 'FALSE', 'YES', 'NO', 'NEVER', 'ALWAYS',
  ]);

  // Extract topics per layer AND overall
  function extractTopics(text) {
    const counts = {};

    // Hyphenated compounds (aide-memory, npm-publish, etc.)
    const hyphenated = text.match(/[a-zA-Z]+-[a-zA-Z]+(?:-[a-zA-Z]+)*/g) || [];
    for (const h of hyphenated) {
      const lower = h.toLowerCase();
      if (!stopWords.has(lower)) {
        counts[lower] = (counts[lower] || 0) + 1;
      }
    }

    // Capitalized words not at sentence start (skip first word after . or newline)
    const sentences = text.split(/[.\n]+/);
    for (const sentence of sentences) {
      const words = sentence.trim().split(/\s+/).slice(1); // skip first word
      for (const word of words) {
        if (/^[A-Z][a-z]{2,}/.test(word)) {
          const clean = word.replace(/[^a-zA-Z]/g, '');
          if (clean.length > 2 && !stopWords.has(clean) && !stopWords.has(clean.toUpperCase())) {
            counts[clean] = (counts[clean] || 0) + 1;
          }
        }
      }
    }

    return counts;
  }

  // Build overall topic counts and per-layer topic counts
  const overallCounts = {};
  const layerTexts = {}; // layer -> concatenated text

  for (const m of matching) {
    const text = [m.what, m.why || '', m.context_label || ''].join(' ');
    const counts = extractTopics(text);
    for (const [t, c] of Object.entries(counts)) {
      overallCounts[t] = (overallCounts[t] || 0) + c;
    }
    // Accumulate text per layer for per-layer topic extraction
    if (!layerTexts[m.layer]) layerTexts[m.layer] = '';
    layerTexts[m.layer] += ' ' + text;
  }

  // Sort by frequency, take top 8 overall
  const top8 = Object.entries(overallCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);
  const top8Set = new Set(top8);

  // Per-layer: top 2 topics per layer
  const per_layer_topics = {};
  for (const [layer, text] of Object.entries(layerTexts)) {
    const counts = extractTopics(text);
    per_layer_topics[layer] = Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2)
      .map(([t]) => t);
  }

  // Add 1-2 extras from layers with zero representation in top 8
  const extras = [];
  for (const [layer, layerTopics] of Object.entries(per_layer_topics)) {
    const hasRepresentation = layerTopics.some(t => top8Set.has(t));
    if (!hasRepresentation && layerTopics.length > 0) {
      // Add up to 2 topics from this underrepresented layer
      for (const t of layerTopics) {
        if (!top8Set.has(t) && extras.length < 2) {
          extras.push(t);
        }
      }
    }
  }
  const topics = [...top8, ...extras];

  // Compute suggested_path: parent directory if query is a file
  let suggested_path = null;
  if (relativePath && !relativePath.endsWith('/') && relativePath.includes('/')) {
    const parentDir = path.dirname(relativePath);
    if (parentDir && parentDir !== '.') {
      suggested_path = parentDir + '/';
    }
  }

  // Output as JSON — the hook script handles formatting
  const result = {
    count: matching.length,
    scoped_count,
    scoped_ids,
    project_count,
    total_memories,
    layers,
    file_count,
    dir_count,
    topics,
    per_layer_topics,
    suggested_path,
  };
  process.stdout.write(JSON.stringify(result));
} catch (err) {
  // Silently exit — don't break the agent if DB doesn't exist or build is stale
  process.exit(0);
}
