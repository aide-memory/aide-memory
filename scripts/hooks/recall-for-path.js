#!/usr/bin/env node
// Direct store access for memory COUNT — no MCP, just SQLite.
// Used by pre-read-recall.sh and pre-edit-recall.sh hooks to count memories
// matching a file path. Returns a JSON payload (or "0" for the empty case).
//
// SINGLE SOURCE OF TRUTH: The `scoped_count`, `scoped_ids`, `layers`
// breakdown, and `topics` fields are ALL derived from the same filtered set
// produced by computeScopedForPath() in src/memory/recall.ts. This guarantees
// the nudge integer and the layer/topic preview cannot disagree.
//
// Focused-scope filter rules (memory #95, #96):
//   - Exact file scope → INCLUDED
//   - Immediate parent scope → INCLUDED
//   - Deeper/nested child scope → INCLUDED (for directory queries)
//   - Grandparent scope → EXCLUDED
//   - Project-wide (null / 'project') scope → EXCLUDED (handled by SessionStart)
//
// `project_count` / `total_memories` are informational only (softening
// threshold, total-memories preview) and are NOT used as block triggers.
//
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

  // Load MemoryStore + shared count helper from the package's compiled dist.
  // computeScopedForPath is the SINGLE source of truth for the focused-scope
  // filter used by ALL hook counts.
  const distPath = path.join(packageRoot, 'dist', 'memory');
  const { MemoryStore } = require(path.join(distPath, 'store'));
  const { computeScopedForPath } = require(path.join(distPath, 'recall'));

  // Convert absolute path to relative for scope matching
  // Scopes are stored as relative (e.g. "src/memory/**") but Claude Code
  // passes absolute paths (e.g. "/Users/.../src/memory/store.ts")
  // Resolve symlinks first — macOS /tmp → /private/tmp causes mismatches.
  // Preserve trailing slash so that directory queries stay directory queries —
  // the focused-scope rule treats them differently from file queries.
  const hadTrailingSlash = filePath.endsWith('/');
  let resolvedProject = projectRoot;
  let resolvedFile = filePath;
  try { resolvedProject = fs.realpathSync(projectRoot); } catch {}
  try { resolvedFile = fs.realpathSync(filePath); } catch {}

  let relativePath = filePath;
  if (path.isAbsolute(resolvedFile) && resolvedFile.startsWith(resolvedProject)) {
    relativePath = path.relative(resolvedProject, resolvedFile);
  }
  if (hadTrailingSlash && !relativePath.endsWith('/')) {
    relativePath = relativePath + '/';
  }

  // Open store using projectRoot (constructor accepts string project path)
  const store = new MemoryStore({ projectRoot });

  // Get all memories once; derive BOTH the focused-scope set (for blocking /
  // layers / topics) and the raw matching set (for the informational
  // total/project counts).
  const allMemories = store.list();

  // Focused-scope set — the single source of truth for all block-relevant counts.
  const scoped = computeScopedForPath(allMemories, relativePath);

  // Informational project-wide count (NOT used for blocking — SessionStart
  // handles project-wide injection). Kept for the preview + softening gate.
  let project_count = 0;
  for (const m of allMemories) {
    if (!m.scope || m.scope === 'project') project_count++;
  }

  store.close();

  // The "matching" set used for ALL preview/count derivation is the focused
  // scoped set. This is what guarantees integer == sum-of-layers.
  const matching = scoped.memories;

  if (matching.length === 0) {
    process.stdout.write('0');
    process.exit(0);
  }

  // Layers breakdown — derived from the focused set (parity with scoped_count).
  const layers = scoped.layers;

  const scoped_count = scoped.count;
  const scoped_ids = scoped.ids;
  // file_count / dir_count kept for backwards compatibility with any
  // consumer that read them, but they are now computed from the focused set.
  let file_count = 0;
  let dir_count = 0;
  for (const m of matching) {
    const s = m.scope || '';
    if (s.endsWith('/') || s.endsWith('/**') || s.endsWith('/*')) {
      dir_count++;
    } else {
      file_count++;
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
