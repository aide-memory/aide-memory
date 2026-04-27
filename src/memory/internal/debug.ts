/**
 * Diagnostic logging for aide-memory.
 *
 * Two functions, both stderr-only:
 *
 *   debug(category, message)   — opt-in verbose logging, gated by AIDE_DEBUG env var
 *   loudError(message, hint?)  — always-on failure surfacing, single-line + actionable
 *
 * # AIDE_DEBUG env var (opt-in only — default: silent)
 *
 *   AIDE_DEBUG=hooks                     hook dispatch entry/exit/duration/errors
 *   AIDE_DEBUG=mcp                       MCP tool calls (name, args summary, duration)
 *   AIDE_DEBUG=binding                   native binding load (lib, ABI, platform)
 *   AIDE_DEBUG=recall                    recall path (paths, matched scopes, returned count)
 *   AIDE_DEBUG=hooks,mcp                 multiple categories
 *   AIDE_DEBUG=all                       everything
 *   AIDE_DEBUG=1                         shorthand for "all"
 *
 *   AIDE_DEBUG_HOOK=1                    legacy alias for AIDE_DEBUG=hooks (kept for back-compat
 *                                        with the diagnostic that shipped briefly during the
 *                                        0.5.0 binding-bug investigation)
 *
 * Output shape:
 *   [AIDE_DEBUG/<category>] <message>
 *   [AIDE_ERROR] <message>[ — <hint>]
 *
 * One line per event. No multi-line dumps. Goes to stderr so it surfaces in
 * editor hook output panels (Cursor "Hooks", Claude Code --debug, etc.) and
 * terminal stderr for direct CLI use.
 *
 * Env vars are read on each call so tests can mutate process.env mid-run
 * without re-importing the module. Cost is a single env lookup + tiny string
 * parse per call — negligible compared to anything we'd be logging.
 *
 * NOTE: A future fast-follow may add `debug.categories` config support. Env
 * always wins over config in that design. Tracked separately — for 0.5.0 this
 * is env-only.
 */

export type DebugCategory = 'hooks' | 'mcp' | 'binding' | 'recall';

const ALL_CATEGORIES: readonly DebugCategory[] = ['hooks', 'mcp', 'binding', 'recall'];

/**
 * Read AIDE_DEBUG (and the legacy AIDE_DEBUG_HOOK alias) from process.env on
 * each call so tests can mutate env mid-run.
 */
function categoriesEnabled(): Set<DebugCategory> {
  const out = new Set<DebugCategory>();

  if (process.env.AIDE_DEBUG_HOOK === '1') {
    out.add('hooks');
  }

  const raw = process.env.AIDE_DEBUG;
  if (!raw) return out;

  const parts = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const p of parts) {
    if (p === 'all' || p === '1') {
      for (const c of ALL_CATEGORIES) out.add(c);
      return out;
    }
    if ((ALL_CATEGORIES as readonly string[]).includes(p)) {
      out.add(p as DebugCategory);
    }
    // Unknown tokens are silently ignored — typo-tolerant, no startup chatter.
  }
  return out;
}

/**
 * Emit an opt-in debug line to stderr if `category` is enabled via AIDE_DEBUG.
 * No-op (apart from a tiny env parse) when disabled.
 */
export function debug(category: DebugCategory, message: string): void {
  if (!categoriesEnabled().has(category)) return;
  process.stderr.write(`[AIDE_DEBUG/${category}] ${message}\n`);
}

/**
 * Emit an always-on error line to stderr. Used at failure points where the
 * user would otherwise see silence (silent hook exit, swallowed exception).
 *
 * Single line. No stack trace dumps. If `hint` is provided, separated by ` — `
 * so the user knows what to do next.
 */
export function loudError(message: string, hint?: string): void {
  const suffix = hint ? ` — ${hint}` : '';
  process.stderr.write(`[AIDE_ERROR] ${message}${suffix}\n`);
}

/**
 * Test helper: returns whether a given category is currently enabled.
 * Re-reads env on each call.
 */
export function isDebugEnabled(category: DebugCategory): boolean {
  return categoriesEnabled().has(category);
}
