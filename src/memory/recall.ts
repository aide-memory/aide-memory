import type { Memory, MemoryLayer, RecallQuery, RecallResult } from './types';
import type { MemoryStore } from './store';
import fs from 'fs';
import path from 'path';
import { getSetting } from './settings';

const LAYER_ORDER: MemoryLayer[] = ['area_context', 'technical', 'preferences', 'guidelines'];
const DEFAULT_LIMIT = 20;

/**
 * Result of computeScopedForPath — the single source of truth for "what
 * counts as scoped-for-blocking" at a given path. Hooks derive every
 * count-related field (integer count, layer breakdown, topics) from this.
 */
export interface ScopedForPath {
  /** The matching memories — EXCLUDES project-wide (null/'project') and grandparent scopes. */
  memories: Memory[];
  /** IDs in the same order as `memories`. Used for ID-based recall blocking. */
  ids: number[];
  /** Count per layer derived from the same filtered set as `memories`. */
  layers: Partial<Record<MemoryLayer, number>>;
  /** Total number of scoped memories (always === memories.length). */
  count: number;
}

/**
 * Single source of truth for the focused-scope filter used by hooks.
 *
 * Returns memories matching the given path under the "focused" rule
 * (immediate parent + same level + deeper — no grandparent scopes) AND
 * excluding project-wide memories (null / "project" scope). Project-wide
 * memories are handled by SessionStart injection, not path-based blocking.
 *
 * All count-related hook fields — the integer "N memories" nudge, the
 * layer breakdown, the topic keywords — MUST be derived from this single
 * filtered set so they cannot disagree.
 *
 * @param memories - Candidate memories (typically store.list() result).
 * @param filePath - Query path (relative to project root preferred).
 */
export function computeScopedForPath(
  memories: Memory[],
  filePath: string,
  projectRoot?: string,
): ScopedForPath {
  const minScopeDepth = projectRoot
    ? Number(getSetting(projectRoot, 'recall.minScopeDepth') ?? 2)
    : 2;
  const matching = memories.filter(m => {
    // Project-wide memories are NEVER scoped-for-blocking.
    if (!m.scope || m.scope === 'project') return false;
    // Use focused matcher with min-scope-depth to exclude overly-broad scopes.
    return scopeMatchesPath(m.scope, filePath, { focused: true, minScopeDepth });
  });

  const layers: Partial<Record<MemoryLayer, number>> = {};
  const ids: number[] = [];
  for (const m of matching) {
    layers[m.layer] = (layers[m.layer] || 0) + 1;
    ids.push(m.id);
  }

  return {
    memories: matching,
    ids,
    layers,
    count: matching.length,
  };
}

/**
 * Append a recall event to .aide/recall-log.jsonl for observability.
 * Each line records: timestamp, query params, and every memory returned.
 * Non-fatal — if logging fails, recall still works.
 */
function logRecallEvent(
  logDir: string | null,
  query: RecallQuery,
  results: Memory[],
  matchedScopes: string[],
  normalizedPaths?: string[] | undefined,
): void {
  if (!logDir) return;
  try {
    const logPath = path.join(logDir, 'recall-log.jsonl');
    const entry = {
      timestamp: new Date().toISOString(),
      query: {
        // Log normalized (relative) paths when available so recall-log.jsonl
        // is consistent with how scopes are stored. Falls back to raw query
        // paths when normalization isn't applicable (e.g., ids-only recall).
        paths: normalizedPaths ?? query.paths ?? [],
        text: query.query ?? null,
        layers: query.layers ?? null,
        limit: query.limit ?? DEFAULT_LIMIT,
      },
      matched_scopes: matchedScopes,
      memories_returned: results.map(m => ({
        id: m.id,
        uuid: m.uuid,
        layer: m.layer,
        what: m.what,
        scope: m.scope,
        tags: m.tags,
        recalled_count: m.recalled_count + 1, // +1 because recordRecall just incremented
      })),
      count: results.length,
    };
    fs.appendFileSync(logPath, JSON.stringify(entry) + '\n');
  } catch {
    // Non-fatal — don't break recall if logging fails
  }
}

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
/**
 * Check if a memory scope matches a file/directory path.
 * @param scope - Memory scope (e.g., "src/api/**", "src/api/routes.ts", null)
 * @param filePath - Query path (e.g., "src/api/routes.ts" or "src/api/")
 * @param options.focused - If true, exclude grandparent scopes. Only match:
 *   - Exact file scope
 *   - Immediate parent directory scope
 *   - Child scopes (for directory queries)
 *   - Project-wide (null scope)
 *   Excludes ancestor scopes above the immediate parent (e.g., src/** for src/api/routes.ts)
 */
export function scopeMatchesPath(
  scope: string | null,
  filePath: string,
  options?: { focused?: boolean; minScopeDepth?: number },
): boolean {
  if (!scope || scope === 'project') return true;

  const normalizedScope = scope.replace(/\\/g, '/');
  const normalizedPath = filePath.replace(/\\/g, '/');

  // Strip trailing glob patterns and trailing slashes for prefix matching
  // "src/memory/**" → "src/memory", "src/memory/" → "src/memory"
  const scopeBase = normalizedScope
    .replace(/\/?\*\*\/?$/, '')  // remove trailing /** or **
    .replace(/\/?\*$/, '')       // remove trailing /*
    .replace(/\/$/, '');         // remove trailing slash (treat "src/memory/" like "src/memory/**")

  if (!scopeBase) return true; // scope was just '**' or '*'

  // Check if the path starts with the scope base directory
  const isDescendant = normalizedPath.startsWith(scopeBase + '/') || normalizedPath === scopeBase;

  // Check parent scope: if scope is 'src/components/dashboard/**',
  // and we're querying 'src/components/', the scope is WITHIN the query path
  // (i.e., the query is a parent of the scope — for directory queries)
  const isChildScope = scopeBase.startsWith(normalizedPath.replace(/\/$/, '') + '/');

  if (!isDescendant && !isChildScope) return false;

  // Focused mode: filter scopes by fixed-prefix depth.
  //
  // The previous "grandparent exclusion" rule (`scopeDepth < parentDepth` →
  // drop) was overly strict — it meant `src/api/**`-scoped memories didn't
  // surface for files like `src/api/routes/routeA.ts` because the scope's
  // depth (2) was less than the file's parent depth (3). Real-world
  // mid-depth scopes like `src/api/**` or `src/auth/**` should reach deeper
  // descendants at any depth.
  //
  // New rule (0.4.3+): a scope is "specific enough" when its fixed-prefix
  // segment count meets `minScopeDepth` (default 2). Single-segment scopes
  // (e.g. `src/**`) are always filtered out of focused mode — too broad to
  // be actionable at the path-hook level, handled via SessionStart instead.
  //
  // Examples with minScopeDepth=2 for query `src/api/routes/routeA.ts`:
  //   `src/api/routes/routeA.ts` (depth 4, exact file)    → INCLUDE
  //   `src/api/routes/**`        (depth 3, narrow)        → INCLUDE
  //   `src/api/**`               (depth 2, mid-scope)     → INCLUDE (new)
  //   `src/**`                   (depth 1, broad)         → EXCLUDE
  //
  // Setting `minScopeDepth=1` restores the pre-0.4.3 behavior where
  // single-segment scopes also matched; setting to 3+ enforces stricter
  // scoping.
  if (options?.focused && isDescendant) {
    const minDepth = options.minScopeDepth ?? 2;
    const scopeDepth = scopeBase.split('/').length;
    if (scopeDepth < minDepth) {
      return false;
    }
  }

  return true;
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
export function recall(store: MemoryStore, query: RecallQuery, logDir?: string | null): RecallResult {
  // Resolve recall settings from user config (falls back to defaults.json).
  // Per-call `query.limit` still wins so MCP callers can override ad hoc.
  const projectRoot = store.getProjectRoot();
  const configuredLimit = projectRoot ? getSetting<number>(projectRoot, 'recall.limit') : null;
  const ensureLayerDiversity = projectRoot
    ? (getSetting<boolean>(projectRoot, 'recall.ensureLayerDiversity') ?? true)
    : true;
  const layerDiversityMinLimit = projectRoot
    ? (getSetting<number>(projectRoot, 'recall.layerDiversityMinLimit') ?? 5)
    : 5;
  const limit = query.limit ?? configuredLimit ?? DEFAULT_LIMIT;
  const minScopeDepth = projectRoot
    ? Number(getSetting(projectRoot, 'recall.minScopeDepth') ?? 2)
    : 2;

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

  // Normalize query paths: convert absolute paths to relative for scope matching
  // Scopes are stored as relative (e.g., "src/memory/**") but callers may pass absolute paths
  const normalizedPaths = query.paths?.map(p => {
    if (path.isAbsolute(p) && store.getProjectRoot()) {
      const rel = path.relative(store.getProjectRoot()!, p);
      // path.relative() strips trailing slashes — preserve them for directory query detection
      const hadTrailingSlash = p.endsWith('/');
      // path.relative() returns "" when query equals project root — use "." not the absolute path
      const result = rel !== '' ? rel : '.';
      return hadTrailingSlash && !result.endsWith('/') ? result + '/' : result;
    }
    return p;
  });

  // If specific IDs requested, return those directly (gap-filling)
  if (query.ids && query.ids.length > 0) {
    const results = query.ids.map(id => store.get(id)).filter(Boolean) as import('./types').Memory[];
    const ids = results.map(m => m.id);
    if (ids.length > 0) {
      store.recordRecall(ids);
    }
    logRecallEvent(logDir ?? null, query, results, [], normalizedPaths);
    return { memories: results, matched_scopes: [] };
  }

  if (normalizedPaths && normalizedPaths.length > 0) {
    candidates = candidates.filter(m => {
      for (const p of normalizedPaths) {
        if (scopeMatchesPath(m.scope, p, { focused: true, minScopeDepth })) {
          if (m.scope) matchedScopes.add(m.scope);
          return true;
        }
      }
      return false;
    });
  }

  // Determine if any query path is a directory query (ends with '/')
  const isDirectoryQuery = normalizedPaths?.some(p => p.endsWith('/')) ?? false;

  // Score and sort
  const scored = candidates.map(m => {
    const scopeDepth = m.scope && m.scope !== 'project' ? m.scope.split('/').length : 0;
    // isScoped: 1 if memory has a specific scope (not project-wide), 0 if project-wide
    // This is the primary signal — scoped memories always rank above project-wide
    const isScoped = scopeDepth > 0 ? 1 : 0;
    return {
      memory: m,
      isScoped,
      layerRank: LAYER_ORDER.indexOf(m.layer),
      relevance: query.query ? keywordScore(m, query.query) : 0,
      scopeSpecificity: scopeDepth,
    };
  });

  // Sort: scope match first (scoped > project-wide), then layer priority,
  // then keyword relevance, then scope specificity as tiebreaker.
  // For directory queries (path ends with '/'), broader scopes rank higher within scoped group.
  // For file queries, more specific scopes rank higher within scoped group.
  scored.sort((a, b) => {
    // Primary: scoped memories always beat project-wide
    if (a.isScoped !== b.isScoped) return b.isScoped - a.isScoped;
    // Secondary: layer priority (area_context > technical > preferences > guidelines)
    if (a.layerRank !== b.layerRank) return a.layerRank - b.layerRank;
    // Tertiary: keyword relevance
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    // Quaternary: scope specificity
    if (isDirectoryQuery) {
      return a.scopeSpecificity - b.scopeSpecificity; // broader first
    }
    return b.scopeSpecificity - a.scopeSpecificity; // more specific first
  });

  // Select top N with round-robin layer representation.
  // Total never exceeds limit. If limit >= layerDiversityMinLimit AND
  // ensureLayerDiversity is true, swap lowest-ranked entries with 1 from
  // each unrepresented layer to ensure diversity.
  let results: Memory[];
  if (limit) {
    const topN = scored.slice(0, limit);

    if (ensureLayerDiversity && limit >= layerDiversityMinLimit) {
      const representedLayers = new Set(topN.map(s => s.memory.layer));
      const remaining = scored.slice(limit);

      // For each missing layer, swap in 1 from remaining.
      // Only replace entries from OVER-represented layers (>1 entry) to avoid
      // swapping out the only entry from a represented layer.
      for (const layer of LAYER_ORDER) {
        if (!representedLayers.has(layer)) {
          const fromLayer = remaining.filter(s => s.memory.layer === layer);
          if (fromLayer.length > 0) {
            // Find last entry from an over-represented layer to swap out
            const layerCounts = new Map<string, number>();
            for (const s of topN) layerCounts.set(s.memory.layer, (layerCounts.get(s.memory.layer) || 0) + 1);

            let swapped = false;
            for (let i = topN.length - 1; i >= 0; i--) {
              const entryLayer = topN[i].memory.layer;
              if ((layerCounts.get(entryLayer) || 0) > 1) {
                topN[i] = fromLayer[0];
                layerCounts.set(entryLayer, (layerCounts.get(entryLayer) || 0) - 1);
                representedLayers.add(layer);
                swapped = true;
                break;
              }
            }
            // If no over-represented layer found, swap last entry as fallback
            if (!swapped) {
              topN[topN.length - 1] = fromLayer[0];
              representedLayers.add(layer);
            }
          }
        }
      }
    }

    results = topN.map(s => s.memory);
  } else {
    results = scored.map(s => s.memory);
  }

  // Record that these memories were recalled
  const ids = results.map(m => m.id);
  if (ids.length > 0) {
    store.recordRecall(ids);
  }

  // Write detailed recall log for observability
  logRecallEvent(logDir ?? null, query, results, Array.from(matchedScopes), normalizedPaths);

  return {
    memories: results,
    matched_scopes: Array.from(matchedScopes),
  };
}
