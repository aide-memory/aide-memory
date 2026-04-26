/**
 * Shared SessionStart content builder.
 *
 * Two callers need this identical layered-memory → markdown rendering:
 *
 *   1. `sessionStart` hook handler (src/memory/hooks/handlers.ts) — emits
 *      via additionalContext on Claude Code session start.
 *   2. `rulesGen` (src/memory/rulesGen.ts) — bakes the same content into
 *      `.cursor/rules/aide-memory.mdc` on init + memory/config writes, as
 *      the workaround for broken Cursor sessionStart.additional_context
 *      (forum #158452). Rules file is re-read every turn with
 *      `alwaysApply: true` so dynamic content surfaces on every Cursor
 *      prompt without needing the broken hook channel.
 *
 * Keeping one source of truth means Claude Code and Cursor always see
 * identical session-start content even though the delivery channel
 * differs. Extracted in Phase C4 (2026-04-23) from the
 * sessionStart handler which previously owned this logic inline.
 */

import { MemoryStore } from './store';
import type { Memory } from './types';
import { getSetting } from './settings';

/**
 * Load memories for a single layer with setting-driven cap + sorting.
 * Moved from handlers.ts in Phase C4 so rulesGen can share it.
 *
 * Setting values:
 *   - `false` or `0` → layer disabled, return []
 *   - `'all'` → return every memory (sorted)
 *   - number N > 0 → return top N (sorted)
 *   - `true` → return all (sorted)
 *
 * Sorting:
 *   - preferences: recalled_count DESC (most-used first), updated_at DESC
 *     tiebreaker. Also respects injection.excludeScopedPreferences.
 *   - all other layers: updated_at DESC.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadLayer(
  store: MemoryStore,
  layer: 'preferences' | 'technical' | 'area_context' | 'guidelines',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setting: any,
  projectRoot: string,
): Memory[] {
  if (setting === false || setting === 0) return [];
  let all = store.list({ layer });

  if (layer === 'preferences') {
    const excludeScoped = getSetting(projectRoot, 'injection.excludeScopedPreferences') === true;
    if (excludeScoped) {
      all = all.filter((m) => !m.scope || m.scope === 'project');
    }
    all.sort((a, b) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ra = (a as any).recalled_count ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rb = (b as any).recalled_count ?? 0;
      if (rb !== ra) return rb - ra;
      return (b.updated_at || '').localeCompare(a.updated_at || '');
    });
  } else {
    all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  }

  if (setting === 'all') return all;
  if (typeof setting === 'number' && setting > 0) return all.slice(0, setting);
  return all;
}

/**
 * Result of building SessionStart content.
 *   - `content`: rendered markdown with sections (## Always, ## Session
 *     Preferences, ## Technical Context, ## Area Context, ## Guidelines).
 *     Empty string when injection is disabled or the store has no
 *     eligible memories.
 *   - `injectedIds`: IDs of memories included in `content`. Callers use
 *     these to update the session's recalled-ids tracking file (so preRead
 *     hooks don't redundantly block on memories already shown).
 *   - `truncated`: true if content was chopped to fit `injection.maxChars`.
 */
export interface SessionStartContent {
  content: string;
  injectedIds: (string | number)[];
  truncated: boolean;
}

/**
 * Build the dynamic SessionStart content. Reads `injection.*` settings +
 * priority:always memories + per-layer loadLayer() calls, dedupes, renders.
 * Caller owns the MemoryStore lifecycle — we don't open or close it here.
 *
 * Returns empty content + [] + false when `injection.enabled: false` OR when
 * no eligible memories exist. Callers should guard on this (emit nothing,
 * don't write files for empty content, etc).
 */
export function buildSessionStartContent(
  projectRoot: string,
  store: MemoryStore,
): SessionStartContent {
  const injectionEnabled = getSetting(projectRoot, 'injection.enabled') ?? true;
  if (!injectionEnabled) {
    return { content: '', injectedIds: [], truncated: false };
  }

  const prefLimit = getSetting(projectRoot, 'injection.preferences') ?? 15;
  const techEnabled = getSetting(projectRoot, 'injection.technical') ?? false;
  const areaEnabled = getSetting(projectRoot, 'injection.area_context') ?? false;
  const guidelinesMode = getSetting(projectRoot, 'injection.guidelines') ?? 'all';
  const priorityOverride = getSetting(projectRoot, 'injection.priorityAlwaysOverride') ?? true;
  const maxInjectChars = Number(getSetting(projectRoot, 'injection.maxChars') ?? 1200);

  const preferences = loadLayer(store, 'preferences', prefLimit, projectRoot);
  const technical = loadLayer(store, 'technical', techEnabled, projectRoot);
  const areaContext = loadLayer(store, 'area_context', areaEnabled, projectRoot);
  const guidelines = loadLayer(store, 'guidelines', guidelinesMode, projectRoot);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const alwaysPriority: Memory[] = priorityOverride ? (store as any).list({ priority: 'always' }) : [];

  const injectedIds: (string | number)[] = [];
  const seen = new Set<string>();
  const add = (memories: Memory[], bucket: string[]) => {
    for (const m of memories) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const key = (m as any).uuid || String(m.id);
      if (seen.has(key)) continue;
      seen.add(key);
      bucket.push(m.what);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      injectedIds.push(m.id as any);
    }
  };

  const deduped = {
    preferences: [] as string[],
    technical: [] as string[],
    area_context: [] as string[],
    guidelines: [] as string[],
    always: [] as string[],
  };
  add(preferences, deduped.preferences);
  add(technical, deduped.technical);
  add(areaContext, deduped.area_context);
  add(guidelines, deduped.guidelines);
  add(alwaysPriority, deduped.always);

  const total =
    deduped.preferences.length +
    deduped.technical.length +
    deduped.area_context.length +
    deduped.guidelines.length +
    deduped.always.length;
  if (total === 0) {
    return { content: '', injectedIds: [], truncated: false };
  }

  const lines: string[] = [];
  // Always-priority section FIRST so user-marked priority memories survive
  // the char cap even when other layers consume the budget. (Reorder added
  // in 0.4.3 — was previously last, which meant priority memories got
  // truncated on large projects.)
  if (deduped.always.length > 0) {
    lines.push('## Always');
    for (const w of deduped.always) lines.push(`- ${w}`);
  }
  if (deduped.preferences.length > 0) {
    lines.push('## Session Preferences');
    for (const w of deduped.preferences) lines.push(`- ${w}`);
  }
  if (deduped.technical.length > 0) {
    lines.push('## Technical Context');
    for (const w of deduped.technical) lines.push(`- ${w}`);
  }
  if (deduped.area_context.length > 0) {
    lines.push('## Area Context');
    for (const w of deduped.area_context) lines.push(`- ${w}`);
  }
  if (deduped.guidelines.length > 0) {
    lines.push('## Guidelines');
    for (const w of deduped.guidelines) lines.push(`- ${w}`);
  }

  let content = lines.join('\n');
  let truncated = false;
  if (content.length > maxInjectChars) {
    content = content.slice(0, maxInjectChars) + '\n...truncated';
    truncated = true;
  }

  return { content, injectedIds, truncated };
}
