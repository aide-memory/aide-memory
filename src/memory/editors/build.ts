/**
 * Shared hook-config construction helpers. Every adapter's buildHookConfig
 * calls into `translateEvents()` here to convert the canonical HOOK_EVENTS
 * manifest into a list of translated (editor-specific event name, matcher,
 * command, timeout) tuples.
 *
 * Adapters then decide how to group + shape that tuple list into their own
 * config file structure — Claude Code groups under a top-level `hooks: {}`
 * key; Cursor wraps with `{ version: 1, hooks: {} }`; etc.
 *
 * Keeping translation centralized means adapters cannot diverge on how null
 * event-name or null matcher entries get filtered out — the filter runs in
 * one place.
 */

import * as path from 'path';
import { HOOK_EVENTS, expandEvents } from '../hooks/events';
import { EditorAdapter, HookConfigArgs } from './types';

/**
 * One entry after adapter translation. `eventName` + `matcher` are already in
 * the editor's vocabulary. Adapters build their config shape from these.
 */
export interface TranslatedHookEntry {
  eventName: string;
  /** Null means event has no matcher (e.g. session-start). */
  matcher: string | null;
  command: string;
  timeout: number;
}

/**
 * Expand HOOK_EVENTS into translated entries for the given adapter. Entries
 * whose event or matcher map to null are dropped silently (editor doesn't
 * support that event/matcher). Order preserves HOOK_EVENTS + matcher-array
 * order so the output is deterministic.
 *
 * Deduplication: if TWO canonical matchers translate to the same editor
 * matcher AND point at the same script (same event), we emit ONE entry.
 * Concrete case: Cursor's `matcherMap.edit = 'Write'` + `matcherMap.write =
 * 'Write'` means the `pre-edit` event (canonical matchers `['edit','write']`)
 * would otherwise produce two identical `{matcher:'Write', command:'...pre-
 * edit-recall.sh'}` entries. Cursor's "only first hook per event runs" quirk
 * (#141996) makes duplicates actively harmful — the second wouldn't fire and
 * could confuse other tools. Dedupe key: eventName + matcher + command.
 */
export function translateEvents(
  adapter: EditorAdapter,
  args: HookConfigArgs,
): TranslatedHookEntry[] {
  const out: TranslatedHookEntry[] = [];
  const seen = new Set<string>();
  for (const { event, matcher } of expandEvents(HOOK_EVENTS)) {
    const eventName = adapter.eventNameMap[event.id];
    if (eventName === null) continue;

    let translatedMatcher: string | null = null;
    if (matcher !== null) {
      const mapped = adapter.matcherMap[matcher];
      if (mapped === null) continue;
      translatedMatcher = mapped;
    }

    const command = buildCommand(args.packageRoot, event.script);
    const dedupeKey = `${eventName}|${translatedMatcher ?? ''}|${command}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      eventName,
      matcher: translatedMatcher,
      command,
      timeout: event.timeout,
    });
  }
  return out;
}

/**
 * Build a `bash /absolute/path/script.sh` invocation. Matches the exact shape
 * emitted by the pre-refactor generateHookConfig() helper in init.ts so
 * post-refactor output stays byte-identical.
 */
export function buildCommand(packageRoot: string, script: string): string {
  return `bash ${path.join(packageRoot, 'scripts', 'hooks', script)}`;
}

/**
 * Group translated entries by their `eventName` — the common pattern used by
 * most adapters' buildHookConfig() implementations. Returns a Map keyed by
 * eventName, values are arrays of entries in the order they appeared.
 *
 * Map preserves insertion order in JavaScript, so when serialized to JSON
 * via a plain-object conversion the top-level keys appear in the HOOK_EVENTS
 * order.
 */
export function groupByEvent(
  entries: TranslatedHookEntry[],
): Map<string, TranslatedHookEntry[]> {
  const out = new Map<string, TranslatedHookEntry[]>();
  for (const entry of entries) {
    const list = out.get(entry.eventName) ?? [];
    list.push(entry);
    out.set(entry.eventName, list);
  }
  return out;
}
