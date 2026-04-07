import type { Memory, MemoryLayer, RecallQuery, RecallResult } from './types';
import type { MemoryStore } from './store';

const LAYER_ORDER: MemoryLayer[] = ['area_context', 'technical', 'preferences', 'guidelines'];
const DEFAULT_LIMIT = 20;

/**
 * Check if a memory's scope matches a given file/directory path.
 *
 * Matching rules:
 * - 'project' scope matches everything
 * - null scope matches everything (treated as project-wide)
 * - Glob patterns: 'src/components/**' matches 'src/components/dashboard/Sidebar.tsx'
 * - Exact directory prefix: 'src/components/' matches 'src/components/Button.tsx'
 * - Parent scope inheritance: 'src/**' matches work in 'src/components/dashboard/'
 */
export function scopeMatchesPath(scope: string | null, filePath: string): boolean {
  if (!scope || scope === 'project') return true;

  const normalizedScope = scope.replace(/\\/g, '/');
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Strip trailing glob patterns for prefix matching
  const scopeBase = normalizedScope
    .replace(/\/?\*\*\/?$/, '')  // remove trailing /** or **
    .replace(/\/?\*$/, '');       // remove trailing /*

  if (!scopeBase) return true; // scope was just '**' or '*'

  // Check if the path starts with the scope base directory
  if (normalizedPath.startsWith(scopeBase + '/') || normalizedPath === scopeBase) {
    return true;
  }

  // Check parent scope: if scope is 'src/components/dashboard/**',
  // and we're querying 'src/components/', the scope is WITHIN the query path
  // (i.e., the query is a parent of the scope)
  if (scopeBase.startsWith(normalizedPath.replace(/\/$/, '') + '/')) {
    return true;
  }

  return false;
}

/**
 * Simple keyword relevance scoring.
 * Returns 0-1 based on how many query words appear in the memory text.
 */
function keywordScore(memory: Memory, query: string): number {
  if (!query) return 0;

  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  if (words.length === 0) return 0;

  const text = [memory.what, memory.context_label, memory.why]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  let matches = 0;
  for (const word of words) {
    if (text.includes(word)) matches++;
  }

  return matches / words.length;
}

/**
 * Recall memories relevant to given paths and/or query.
 *
 * Retrieval strategy:
 * 1. Get all memories from the store (no status filter — file exists = active)
 * 2. Filter by scope matching against provided paths
 * 3. If query provided, boost matches via keyword scoring
 * 4. Sort by layer priority, then by keyword relevance
 * 5. Cap at limit
 */
export function recall(store: MemoryStore, query: RecallQuery): RecallResult {
  const limit = query.limit ?? DEFAULT_LIMIT;

  // No status filter — all memories in the store are active
  const listOptions: { contributor?: string } = {};
  if (query.contributor) {
    listOptions.contributor = query.contributor;
  }
  const allMemories = store.list(listOptions);

  // Filter by layer if specified
  let candidates = query.layers
    ? allMemories.filter(m => query.layers!.includes(m.layer))
    : allMemories;

  // Filter by path scope matching
  const matchedScopes = new Set<string>();

  if (query.paths && query.paths.length > 0) {
    candidates = candidates.filter(m => {
      for (const p of query.paths!) {
        if (scopeMatchesPath(m.scope, p)) {
          if (m.scope) matchedScopes.add(m.scope);
          return true;
        }
      }
      return false;
    });
  }

  // Score and sort
  const scored = candidates.map(m => ({
    memory: m,
    layerRank: LAYER_ORDER.indexOf(m.layer),
    relevance: query.query ? keywordScore(m, query.query) : 0,
    scopeSpecificity: m.scope && m.scope !== 'project' ? m.scope.split('/').length : 0,
  }));

  // Sort: layer priority first, then keyword relevance, then scope specificity (more specific = better)
  scored.sort((a, b) => {
    if (a.layerRank !== b.layerRank) return a.layerRank - b.layerRank;
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    return b.scopeSpecificity - a.scopeSpecificity;
  });

  const results = scored.slice(0, limit).map(s => s.memory);

  // Record that these memories were recalled
  const ids = results.map(m => m.id);
  if (ids.length > 0) {
    store.recordRecall(ids);
  }

  return {
    memories: results,
    matched_scopes: Array.from(matchedScopes),
  };
}
