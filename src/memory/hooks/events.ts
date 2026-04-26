/**
 * HOOK_EVENTS — single source of truth for aide-memory's hook surface.
 *
 * Each entry defines ONE logical hook event that aide-memory registers with
 * the host editor. Editor adapters translate these canonical identifiers into
 * editor-specific event names + matcher tokens (see src/memory/editors/*).
 *
 * Adding a new hook:
 *   1. Append an entry to HOOK_EVENTS with the new `id`, `script`, etc.
 *   2. (If new `id`) update the HookName union in src/memory/hooks/index.ts +
 *      HANDLERS map to wire the handler.
 *   3. Each adapter's `eventNameMap` gets the new id mapped to its editor
 *      event name (or `null` if unsupported). Same for `matcherMap` if the
 *      event has matchers.
 *
 * This single-source design replaces the previous hardcoded per-editor event
 * lists (see memory #329 directive #2). Adding a hook used to mean editing N
 * adapters; now it's one append here + translation-map additions in adapters.
 *
 * The `id` field MUST match a key in src/memory/hooks/index.ts HANDLERS — the
 * dispatcher receives the id as its subcommand arg (`aide-memory hook <id>`).
 */

/**
 * Canonical matcher tokens. Each maps to an editor-specific matcher in an
 * adapter's `matcherMap`. Keeping the set closed (vs. free-form strings) makes
 * it a compile-time contract: if an adapter forgets to map one, TypeScript
 * catches it.
 */
export type HookMatcher =
  | 'read'
  | 'edit'
  | 'write'
  | 'search'
  | 'glob'
  | 'mcp-aide-recall'
  | 'mcp-aide-remember'
  | 'mcp-aide-update'
  | 'mcp-aide-forget'
  | 'mcp-aide-search';

/**
 * Canonical hook event ids. MUST match the HookName union in
 * src/memory/hooks/index.ts — the dispatcher receives this as its argument.
 */
export type HookEventId =
  | 'session-start'
  | 'pre-compact'
  | 'stop'
  | 'pre-prompt'
  | 'pre-read'
  | 'pre-edit'
  | 'pre-search'
  | 'pre-recall'
  | 'post-tool-use-recall'
  | 'post-remember'
  | 'post-search';

export interface HookEvent {
  /** aide-memory's internal name. Matches the dispatcher subcommand. */
  id: HookEventId;

  /** Shim script filename under scripts/hooks/ (e.g. 'pre-read-recall.sh'). */
  script: string;

  /** One-line summary of what this hook does. */
  purpose: string;

  /** Timeout in seconds (value written into hook config output). */
  timeout: number;

  /** True if this event expects matcher entries in the host editor's config. */
  hasMatcher: boolean;

  /**
   * Canonical matchers this event should wire up. Only meaningful when
   * hasMatcher is true. Adapters translate each canonical matcher to an
   * editor-specific token; null in the adapter's matcherMap means "editor
   * doesn't support this matcher — skip silently".
   */
  matchers?: HookMatcher[];
}

/**
 * The canonical list. Ordered to match the order in which adapters emit events
 * so the `.claude/settings.json` output preserves byte-identical structure
 * with the pre-refactor hardcoded list (see src/memory/init.ts historical
 * `generateHookConfig`).
 */
export const HOOK_EVENTS: readonly HookEvent[] = [
  {
    id: 'session-start',
    script: 'session-start-clear.sh',
    purpose: 'Inject top-N preferences + guidelines + priority:always at session start',
    timeout: 10,
    hasMatcher: false,
  },
  {
    id: 'pre-compact',
    script: 'pre-compact-save.sh',
    purpose: 'Clear session tracking before compaction',
    timeout: 30,
    hasMatcher: false,
  },
  {
    id: 'stop',
    script: 'stop-remember.sh',
    purpose: 'Reflection nudge on schedule + correction-pending flag',
    timeout: 30,
    hasMatcher: false,
  },
  {
    id: 'pre-prompt',
    script: 'detect-correction.sh',
    purpose: 'Detect correction/decision/preference in user prompt',
    timeout: 5,
    hasMatcher: false,
  },
  {
    id: 'pre-read',
    script: 'pre-read-recall.sh',
    purpose: 'Block/soft on file read with scoped memories',
    timeout: 10,
    hasMatcher: true,
    matchers: ['read'],
  },
  {
    id: 'pre-edit',
    script: 'pre-edit-recall.sh',
    purpose: 'Block/soft on file edit with scoped memories',
    timeout: 10,
    hasMatcher: true,
    matchers: ['edit', 'write'],
  },
  {
    id: 'pre-search',
    script: 'pre-search-nudge.sh',
    purpose: 'Nudge aide_search when matching memories exist',
    timeout: 10,
    hasMatcher: true,
    matchers: ['search', 'glob'],
  },
  {
    id: 'pre-recall',
    script: 'track-recall.sh',
    purpose: 'Track paths on aide_recall pre-tool-use',
    timeout: 5,
    hasMatcher: true,
    matchers: ['mcp-aide-recall'],
  },
  {
    id: 'post-tool-use-recall',
    script: 'track-recall-post.sh',
    purpose: 'Record recalled ids post-tool-use',
    timeout: 5,
    hasMatcher: true,
    matchers: ['mcp-aide-recall'],
  },
  {
    id: 'post-remember',
    script: 'track-remember.sh',
    purpose: 'Clear correction-pending flag on aide_remember/update/forget',
    timeout: 5,
    hasMatcher: true,
    matchers: ['mcp-aide-remember', 'mcp-aide-update', 'mcp-aide-forget'],
  },
  {
    id: 'post-search',
    script: 'track-search.sh',
    purpose: 'Mark query as searched post aide_search',
    timeout: 5,
    hasMatcher: true,
    matchers: ['mcp-aide-search'],
  },
];

/**
 * One entry per (event, matcher) pair after expansion. Canonical matcher names
 * preserved — the adapter translates to editor-specific tokens and decides on
 * structure (e.g. Claude Code groups by top-level event name; Cursor uses
 * lowercase names + different matcher rules).
 */
export interface ResolvedHookEntry {
  event: HookEvent;
  /** Canonical matcher token, or null if the event has no matcher. */
  matcher: HookMatcher | null;
}

/**
 * Expand HOOK_EVENTS into a flat (event, matcher) list. Events without
 * matchers contribute one entry; events with N matchers contribute N entries.
 * The order of HOOK_EVENTS + the order of their `matchers` array is preserved
 * so byte-identical output is reproducible.
 */
export function expandEvents(events: readonly HookEvent[] = HOOK_EVENTS): ResolvedHookEntry[] {
  const out: ResolvedHookEntry[] = [];
  for (const event of events) {
    if (!event.hasMatcher || !event.matchers || event.matchers.length === 0) {
      out.push({ event, matcher: null });
      continue;
    }
    for (const matcher of event.matchers) {
      out.push({ event, matcher });
    }
  }
  return out;
}
