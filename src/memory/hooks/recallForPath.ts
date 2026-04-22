/**
 * Port of scripts/hooks/recall-for-path.js — the single source of truth for
 * what memories count as "scoped to this file path".
 *
 * Filter rules (see memory #95, #96):
 *   - Exact file scope → INCLUDED
 *   - Immediate parent scope → INCLUDED
 *   - Deeper/nested child scope → INCLUDED (for directory queries)
 *   - Grandparent scope → EXCLUDED
 *   - Project-wide (null / 'project') scope → EXCLUDED (handled by SessionStart)
 */

import * as fs from 'fs';
import * as path from 'path';
import { MemoryStore } from '../store';
import { computeScopedForPath } from '../recall';

export interface RecallForPathResult {
  count: number;
  scoped_count: number;
  scoped_ids: number[];
  project_count: number;
  total_memories: number;
  layers: Record<string, number>;
  file_count: number;
  dir_count: number;
  topics: string[];
  per_layer_topics: Record<string, string[]>;
  suggested_path: string | null;
}

const STOP_WORDS = new Set([
  'the', 'this', 'that', 'from', 'with', 'into', 'for', 'and', 'but', 'not',
  'all', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'will', 'can',
  'should', 'would', 'could', 'may', 'must', 'use', 'used', 'using', 'also',
  'when', 'what', 'how', 'why', 'who', 'which', 'where', 'then', 'than',
  'each', 'every', 'some', 'any', 'does', 'done', 'only', 'just', 'more',
  'most', 'very', 'same', 'other', 'after', 'before', 'about', 'between',
  'IMPORTANT', 'COMPLETE', 'DONE', 'TODO', 'NOTE', 'PENDING', 'NEW', 'OLD',
  'TRUE', 'FALSE', 'YES', 'NO', 'NEVER', 'ALWAYS',
]);

function extractTopics(text: string): Record<string, number> {
  const counts: Record<string, number> = {};

  // Hyphenated compounds
  const hyphenated = text.match(/[a-zA-Z]+-[a-zA-Z]+(?:-[a-zA-Z]+)*/g) || [];
  for (const h of hyphenated) {
    const lower = h.toLowerCase();
    if (!STOP_WORDS.has(lower)) counts[lower] = (counts[lower] || 0) + 1;
  }

  // Capitalized words (skip sentence starters)
  const sentences = text.split(/[.\n]+/);
  for (const sentence of sentences) {
    const words = sentence.trim().split(/\s+/).slice(1);
    for (const word of words) {
      if (/^[A-Z][a-z]{2,}/.test(word)) {
        const clean = word.replace(/[^a-zA-Z]/g, '');
        if (
          clean.length > 2 &&
          !STOP_WORDS.has(clean) &&
          !STOP_WORDS.has(clean.toUpperCase())
        ) {
          counts[clean] = (counts[clean] || 0) + 1;
        }
      }
    }
  }

  return counts;
}

/**
 * Compute the RecallForPathResult for the given project + file path.
 * Returns null when there are no matching memories (caller should emit "0"-equivalent).
 * Throws on store errors — caller should silently exit 0 per hook convention.
 */
export function computeRecallForPath(
  projectRoot: string,
  filePath: string,
): RecallForPathResult | null {
  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) return null;

  // Resolve symlinks + preserve trailing slash for directory queries.
  const hadTrailingSlash = filePath.endsWith('/');
  let resolvedProject = projectRoot;
  let resolvedFile = filePath;
  try {
    resolvedProject = fs.realpathSync(projectRoot);
  } catch {
    // keep fallback
  }
  try {
    resolvedFile = fs.realpathSync(filePath);
  } catch {
    // keep fallback
  }

  let relativePath = filePath;
  if (path.isAbsolute(resolvedFile) && resolvedFile.startsWith(resolvedProject)) {
    relativePath = path.relative(resolvedProject, resolvedFile);
  }
  if (hadTrailingSlash && !relativePath.endsWith('/')) {
    relativePath = relativePath + '/';
  }

  const store = new MemoryStore({ projectRoot });
  try {
    const allMemories = store.list();
    const scoped = computeScopedForPath(allMemories, relativePath, projectRoot);

    let project_count = 0;
    for (const m of allMemories) {
      if (!m.scope || m.scope === 'project') project_count++;
    }

    const matching = scoped.memories;
    if (matching.length === 0) return null;

    const layers = scoped.layers;
    const scoped_count = scoped.count;
    const scoped_ids = scoped.ids;

    let file_count = 0;
    let dir_count = 0;
    for (const m of matching) {
      const s = m.scope || '';
      if (s.endsWith('/') || s.endsWith('/**') || s.endsWith('/*')) dir_count++;
      else file_count++;
    }

    const total_memories = allMemories.length;

    const overallCounts: Record<string, number> = {};
    const layerTexts: Record<string, string> = {};
    for (const m of matching) {
      const text = [m.what, m.why || '', (m as any).context_label || ''].join(' ');
      const counts = extractTopics(text);
      for (const [t, c] of Object.entries(counts)) {
        overallCounts[t] = (overallCounts[t] || 0) + c;
      }
      if (!layerTexts[m.layer]) layerTexts[m.layer] = '';
      layerTexts[m.layer] += ' ' + text;
    }

    const top8 = Object.entries(overallCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t);
    const top8Set = new Set(top8);

    const per_layer_topics: Record<string, string[]> = {};
    for (const [layer, text] of Object.entries(layerTexts)) {
      const counts = extractTopics(text);
      per_layer_topics[layer] = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([t]) => t);
    }

    const extras: string[] = [];
    for (const [, layerTopics] of Object.entries(per_layer_topics)) {
      const hasRepresentation = layerTopics.some((t) => top8Set.has(t));
      if (!hasRepresentation && layerTopics.length > 0) {
        for (const t of layerTopics) {
          if (!top8Set.has(t) && extras.length < 2) extras.push(t);
        }
      }
    }
    const topics = [...top8, ...extras];

    let suggested_path: string | null = null;
    if (relativePath && !relativePath.endsWith('/') && relativePath.includes('/')) {
      const parentDir = path.dirname(relativePath);
      if (parentDir && parentDir !== '.') suggested_path = parentDir + '/';
    }

    return {
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
  } finally {
    store.close();
  }
}
