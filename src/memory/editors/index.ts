/**
 * ADAPTERS registry — single source of truth for which editors aide-memory
 * supports. Init + rules-generation + future runtime-dispatcher code reads
 * from this list, never from per-editor if/else.
 *
 * Adding a new editor:
 *   1. Create `src/memory/editors/<editor>.ts` implementing EditorAdapter.
 *   2. Import + append to ADAPTERS here.
 *   3. Follow docs/specs/EDITOR_ONBOARDING_GUIDE.md §2 for the research +
 *      test + doc checklist.
 *
 * Order is not behaviorally significant today but is preserved for
 * deterministic test fixtures + debug logs.
 */

import { EditorAdapter, EditorId } from './types';
import { claudeCodeAdapter } from './claude-code';
import { cursorAdapter } from './cursor';
import { codexAdapter } from './codex';
import { copilotAdapter } from './copilot';
import { windsurfAdapter } from './windsurf';

export const ADAPTERS: readonly EditorAdapter[] = [
  claudeCodeAdapter,
  cursorAdapter,
  codexAdapter,
  copilotAdapter,
  windsurfAdapter,
];

/** Lookup helper. Throws if the id is unknown so callers can't silently skip. */
export function getAdapter(id: EditorId): EditorAdapter {
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter) {
    throw new Error(`Unknown editor id: ${id}`);
  }
  return adapter;
}

/** Return adapters whose supportsHooks flag is true. Used by init.ts. */
export function adaptersWithHooks(): EditorAdapter[] {
  return ADAPTERS.filter((a) => a.supportsHooks);
}

/** Return adapters whose supportsMcp flag is true. */
export function adaptersWithMcp(): EditorAdapter[] {
  return ADAPTERS.filter((a) => a.supportsMcp);
}

/** Return adapters whose supportsRules flag is true. */
export function adaptersWithRules(): EditorAdapter[] {
  return ADAPTERS.filter((a) => a.supportsRules);
}

/**
 * Determine which adapter is running the current hook invocation.
 *
 * Iterates ADAPTERS in registered order, calling each adapter's
 * `detectRuntime(env)` and returning the first match. Falls back to
 * `claudeCodeAdapter` when no adapter claims the runtime — preserves
 * historical behavior for environments without editor-specific env vars
 * (e.g. CI test runs, bash smoke scripts piping stdin directly to the
 * dispatcher).
 *
 * `env` defaults to `process.env`. Tests can pass explicit env objects to
 * exercise adapter-specific detection paths without mutating globals.
 */
export function detectActiveAdapter(env: NodeJS.ProcessEnv = process.env): EditorAdapter {
  for (const adapter of ADAPTERS) {
    if (adapter.detectRuntime(env)) return adapter;
  }
  return claudeCodeAdapter;
}

// Re-exports for external callers.
export { claudeCodeAdapter, cursorAdapter, codexAdapter, copilotAdapter, windsurfAdapter };
export type { EditorAdapter, EditorId, RuleSpec, McpConfigArgs, HookConfigArgs } from './types';
