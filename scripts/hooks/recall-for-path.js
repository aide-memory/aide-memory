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

  const topicCounts = {};
  for (const m of matching) {
    const text = [m.what, m.why || '', m.context_label || ''].join(' ');

    // Hyphenated compounds (aide-memory, npm-publish, etc.)
    const hyphenated = text.match(/[a-zA-Z]+-[a-zA-Z]+(?:-[a-zA-Z]+)*/g) || [];
    for (const h of hyphenated) {
      const lower = h.toLowerCase();
      if (!stopWords.has(lower)) {
        topicCounts[lower] = (topicCounts[lower] || 0) + 1;
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
            topicCounts[clean] = (topicCounts[clean] || 0) + 1;
          }
        }
      }
    }
  }

  // Sort by frequency, take top 8
  const topics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  // Output as JSON — the hook script handles formatting
  const result = {
    count: matching.length,
    layers,
    topics,
  };
  process.stdout.write(JSON.stringify(result));
} catch (err) {
  // Silently exit — don't break the agent if DB doesn't exist or build is stale
  process.exit(0);
}
