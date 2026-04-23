/**
 * Session-scoped tracking cache file helpers.
 *
 * Tracking files live at `$PROJECT_ROOT/.aide/cache/<file>-<sessionId>.txt`
 * and are used by the hooks to deduplicate blocking nudges across a session.
 *
 * File contents:
 *   - recalled-paths-<sid>.txt: mixed lines of `file|<abs-path>`, `dir|<abs-path>/`,
 *     `scope|<glob>` (scope-level "encountered" for cross-file soft routing
 *     after aide_recall({ids:[...]}) — each memory's scope is recorded so
 *     sibling files under the same scope are also treated as encountered),
 *     and a single `ids|<id1>,<id2>,...` line tracking which memory IDs have
 *     been recalled this session.
 *   - searched-queries-<sid>.txt: one normalized keyword per line.
 *   - correction-pending-<sid>.txt: one line ("correction" / "decision" /
 *     "preference") indicating a UserPromptSubmit detected something the
 *     Stop hook should nudge about next turn.
 *   - stop-count-<sid>.txt: integer turn count for dynamic stop interval.
 */

import * as fs from 'fs';
import * as path from 'path';

export function cacheDir(projectRoot: string): string {
  return path.join(projectRoot, '.aide', 'cache');
}

export function ensureCacheDir(projectRoot: string): string {
  const dir = cacheDir(projectRoot);
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch {
    // best-effort
  }
  return dir;
}

export function recalledPathsFile(projectRoot: string, sessionId: string): string {
  return path.join(cacheDir(projectRoot), `recalled-paths-${sessionId}.txt`);
}

export function searchedQueriesFile(projectRoot: string, sessionId: string): string {
  return path.join(cacheDir(projectRoot), `searched-queries-${sessionId}.txt`);
}

export function correctionPendingFile(projectRoot: string, sessionId: string): string {
  return path.join(cacheDir(projectRoot), `correction-pending-${sessionId}.txt`);
}

export function stopCountFile(projectRoot: string, sessionId: string): string {
  return path.join(cacheDir(projectRoot), `stop-count-${sessionId}.txt`);
}

/**
 * Read the `ids|<csv>` line from the recalled-paths tracking file.
 * Returns an array of string IDs (to match bash equality semantics).
 */
export function readRecalledIds(projectRoot: string, sessionId: string): string[] {
  const p = recalledPathsFile(projectRoot, sessionId);
  if (!fs.existsSync(p)) return [];
  try {
    const content = fs.readFileSync(p, 'utf8');
    const idsLines = content.split('\n').filter((l) => l.startsWith('ids|'));
    if (idsLines.length === 0) return [];
    const last = idsLines[idsLines.length - 1];
    return last
      .slice(4)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Check whether the given file path was already recalled this session
 * (recorded as `file|<abs-path>` in the tracking file).
 */
/**
 * Match a project-relative path against a glob-ish scope pattern (same rule
 * aide-memory uses everywhere):
 *   - `foo/**` → matches `foo` and any descendant (foo/X, foo/X/Y)
 *   - `foo/*`  → matches immediate children only (foo/X, not foo/X/Y)
 *   - exact   → matches the literal path
 *
 * Null / 'project' scope is intentionally NOT matched here because a
 * project-wide recall should not flip every file to encountered (that would
 * effectively disable the first-touch hard block after any aide_recall).
 * Callers should filter those out before calling.
 */
function matchesScope(relPath: string, scope: string): boolean {
  if (!scope || scope === 'project') return false;
  if (scope.endsWith('/**')) {
    const base = scope.slice(0, -3);
    return relPath === base || relPath.startsWith(base + '/');
  }
  if (scope.endsWith('/*')) {
    const base = scope.slice(0, -2);
    const slash = relPath.lastIndexOf('/');
    const parent = slash >= 0 ? relPath.slice(0, slash) : '';
    return parent === base;
  }
  return relPath === scope;
}

export function hasRecalledFile(
  projectRoot: string,
  sessionId: string,
  absFilePath: string,
): boolean {
  const p = recalledPathsFile(projectRoot, sessionId);
  if (!fs.existsSync(p)) return false;
  try {
    const content = fs.readFileSync(p, 'utf8');
    const lines = content.split('\n');
    // Exact file match
    if (lines.some((l) => l === `file|${absFilePath}`)) return true;
    // Scope match — a scope tracked via aide_recall({ids}) or other
    // scope-producing events covers all files that fall under that glob.
    // This is how cross-file "encountered" works: if you recalled memories
    // scoped `src/api/**` and later touch `src/api/orders.ts` (never read
    // directly), hasRecalledFile returns true → soft path.
    const relPath = path.relative(projectRoot, absFilePath);
    for (const line of lines) {
      if (!line.startsWith('scope|')) continue;
      const scope = line.slice(6);
      if (matchesScope(relPath, scope)) return true;
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Append a `file|<abs>` or `dir|<abs>/` line to tracking, creating the file if needed.
 */
export function appendRecalledPath(
  projectRoot: string,
  sessionId: string,
  kind: 'file' | 'dir',
  absPath: string,
): void {
  ensureCacheDir(projectRoot);
  const p = recalledPathsFile(projectRoot, sessionId);
  try {
    fs.appendFileSync(p, `${kind}|${absPath}\n`);
  } catch {
    // best-effort
  }
}

/**
 * Append a `scope|<glob>` line for a scope whose memories were just recalled
 * (via aide_recall({ids:[…]}) or similar). Files falling under this scope
 * will be treated as "encountered" by hasRecalledFile — enabling cross-file
 * soft routing in the same scope after a scope-level recall.
 *
 * Skips null / 'project' scopes because project-wide recalls shouldn't
 * flip every file to encountered (would disable first-touch hard-block
 * project-wide).
 */
export function appendRecalledScope(
  projectRoot: string,
  sessionId: string,
  scope: string | null | undefined,
): void {
  if (!scope || scope === 'project') return;
  ensureCacheDir(projectRoot);
  const p = recalledPathsFile(projectRoot, sessionId);
  try {
    // Avoid duplicate scope lines — small perf + cleaner tracking file.
    if (fs.existsSync(p)) {
      const content = fs.readFileSync(p, 'utf8');
      if (content.split('\n').some((l) => l === `scope|${scope}`)) return;
    }
    fs.appendFileSync(p, `scope|${scope}\n`);
  } catch {
    // best-effort
  }
}

/**
 * Merge new IDs into the `ids|` line in the tracking file. Preserves all other lines
 * and deduplicates IDs. Sorted numerically ascending (consistent with bash `sort -un`).
 */
export function mergeTrackedIds(
  projectRoot: string,
  sessionId: string,
  newIds: string[],
): void {
  ensureCacheDir(projectRoot);
  const p = recalledPathsFile(projectRoot, sessionId);
  let nonIdLines: string[] = [];
  let existingIds: string[] = [];
  if (fs.existsSync(p)) {
    try {
      const content = fs.readFileSync(p, 'utf8');
      for (const line of content.split('\n')) {
        if (line.startsWith('ids|')) {
          existingIds = line.slice(4).split(',').map((s) => s.trim()).filter(Boolean);
        } else if (line.length > 0) {
          nonIdLines.push(line);
        }
      }
    } catch {
      // best-effort
    }
  }
  const all = new Set<string>([...existingIds, ...newIds.map((s) => s.trim()).filter(Boolean)]);
  const sorted = Array.from(all).sort((a, b) => Number(a) - Number(b));
  const out = nonIdLines.join('\n') + (nonIdLines.length > 0 ? '\n' : '') + `ids|${sorted.join(',')}\n`;
  try {
    fs.writeFileSync(p, out);
  } catch {
    // best-effort
  }
}

/**
 * True if the normalized keyword has been searched this session.
 */
export function hasSearchedQuery(
  projectRoot: string,
  sessionId: string,
  normalizedQuery: string,
): boolean {
  const p = searchedQueriesFile(projectRoot, sessionId);
  if (!fs.existsSync(p)) return false;
  try {
    const content = fs.readFileSync(p, 'utf8');
    return content.split('\n').some((l) => l === normalizedQuery);
  } catch {
    return false;
  }
}

export function appendSearchedQuery(
  projectRoot: string,
  sessionId: string,
  normalizedQuery: string,
): void {
  ensureCacheDir(projectRoot);
  const p = searchedQueriesFile(projectRoot, sessionId);
  try {
    fs.appendFileSync(p, `${normalizedQuery}\n`);
  } catch {
    // best-effort
  }
}

/**
 * Match the bash clear_session_tracking() behavior — remove all known
 * per-session files. Silent on missing files.
 */
export function clearSessionTracking(projectRoot: string, sessionId: string): void {
  const dir = cacheDir(projectRoot);
  const files = [
    `recalled-paths-${sessionId}.txt`,
    `searched-queries-${sessionId}.txt`,
    `correction-pending-${sessionId}.txt`,
    `compact-pending-${sessionId}.txt`,
    `stop-count-${sessionId}.txt`,
  ];
  for (const name of files) {
    try {
      fs.unlinkSync(path.join(dir, name));
    } catch {
      // missing is fine
    }
  }
}

export function readStopCount(projectRoot: string, sessionId: string): number {
  const p = stopCountFile(projectRoot, sessionId);
  if (!fs.existsSync(p)) return 0;
  try {
    const content = fs.readFileSync(p, 'utf8').trim();
    const n = parseInt(content, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function writeStopCount(projectRoot: string, sessionId: string, count: number): void {
  ensureCacheDir(projectRoot);
  try {
    fs.writeFileSync(stopCountFile(projectRoot, sessionId), String(count));
  } catch {
    // best-effort
  }
}

export function hasCorrectionPending(projectRoot: string, sessionId: string): boolean {
  return fs.existsSync(correctionPendingFile(projectRoot, sessionId));
}

export function writeCorrectionPending(
  projectRoot: string,
  sessionId: string,
  kind: 'correction' | 'decision' | 'preference',
): void {
  ensureCacheDir(projectRoot);
  try {
    fs.writeFileSync(correctionPendingFile(projectRoot, sessionId), kind);
  } catch {
    // best-effort
  }
}

export function clearCorrectionPending(projectRoot: string, sessionId: string): void {
  try {
    fs.unlinkSync(correctionPendingFile(projectRoot, sessionId));
  } catch {
    // missing is fine
  }
}

/**
 * Normalize a search keyword the same way pre-search-nudge.sh does:
 * lowercase + trim.
 */
export function normalizeQuery(q: string): string {
  return (q || '').toLowerCase().trim();
}
