/**
 * Shared settings resolver used from TypeScript code paths (recall, server, etc).
 *
 * The 18 configurable knobs live in `scripts/hooks/defaults.json` alongside
 * shell/JS hooks. User overrides sit in `<project>/.aide/config.json` as
 * nested JSON (e.g. `{"recall":{"limit":10}}`). This module mirrors the
 * lookup semantics of `scripts/hooks/read-config.sh` and `read-config.js`
 * so every entry point resolves settings the same way.
 *
 * Resolution order:
 *   1. Key missing from defaults.json        → undefined
 *   2. defaults[key].public === false        → defaults[key].value
 *   3. user override present (nested path)   → user value
 *   4. otherwise                             → defaults[key].value
 *
 * Per Phase 1 product decision (2026-04-20), the `pro` flag on each default
 * is reserved for future gating but is NOT enforced — every setting is free.
 */

import fs from 'fs';
import path from 'path';
// Inlined at bundle time by esbuild (resolveJsonModule=true). Previously
// loadDefaults() read defaults.json from disk at runtime, but 0.4.x no longer
// ships that file — hook logic is bundled, so shipping the source JSON would
// be redundant. Inline is the runtime source of truth now.
import defaultsJson from '../../scripts/hooks/defaults.json';

export interface DefaultEntry {
  value: unknown;
  public: boolean;
  pro: boolean;
  /** User-facing description surfaced by `aide-memory config list` and the
   * auto-generated `.aide/config-reference.md` at init time. Present on every
   * entry in `scripts/hooks/defaults.json` per memory #313 checklist. */
  description?: string;
}

let _defaultsCache: Record<string, DefaultEntry> =
  defaultsJson as unknown as Record<string, DefaultEntry>;

/** Returns the raw defaults. Exposed so tests and other callers can enumerate keys. */
export function loadDefaults(): Record<string, DefaultEntry> {
  return _defaultsCache;
}

/** For tests: drop the in-memory defaults cache so the next read goes to disk. */
export function _resetDefaultsCache(): void {
  _defaultsCache = defaultsJson as unknown as Record<string, DefaultEntry>;
}

function hasNestedPath(obj: unknown, parts: string[]): boolean {
  let cur: unknown = obj;
  for (const p of parts) {
    if (
      cur === null ||
      cur === undefined ||
      typeof cur !== 'object' ||
      Array.isArray(cur) ||
      !Object.prototype.hasOwnProperty.call(cur as object, p)
    ) {
      return false;
    }
    cur = (cur as Record<string, unknown>)[p];
  }
  return true;
}

function getNestedPath(obj: unknown, parts: string[]): unknown {
  let cur: unknown = obj;
  for (const p of parts) {
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
}

/**
 * Resolve one setting for `projectRoot`. Returns `undefined` when the key is
 * not declared in defaults.json.
 */
export function getSetting<T = unknown>(projectRoot: string | null | undefined, key: string): T | undefined {
  const defaults = loadDefaults();
  const entry = defaults[key];
  if (!entry) return undefined;

  const defaultValue = entry.value as T;
  if (entry.public !== true) return defaultValue;
  if (!projectRoot) return defaultValue;

  const userConfigPath = path.join(projectRoot, '.aide', 'config.json');
  if (!fs.existsSync(userConfigPath)) return defaultValue;

  let userConfig: unknown;
  try {
    userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
  } catch {
    return defaultValue;
  }

  const parts = key.split('.');
  if (!hasNestedPath(userConfig, parts)) return defaultValue;
  return getNestedPath(userConfig, parts) as T;
}

/**
 * Return an object of { key → resolved value } for every public setting.
 * Used by `aide-memory init` to seed `.aide/config.json` with the full
 * set of knobs so users can discover what's configurable.
 */
export function listPublicDefaults(): Record<string, unknown> {
  const defaults = loadDefaults();
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(defaults)) {
    if (entry.public === true) {
      out[key] = entry.value;
    }
  }
  return out;
}

/**
 * Convert a flat-key map (e.g. {"hooks.read.maxBlocks": 1}) into a nested
 * object (e.g. {hooks: {read: {maxBlocks: 1}}}) matching the shape stored
 * in `.aide/config.json`.
 */
export function flatMapToNested(flat: Record<string, unknown>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(flat)) {
    const parts = key.split('.');
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      const existing = cur[p];
      if (!existing || typeof existing !== 'object' || Array.isArray(existing)) {
        cur[p] = {};
      }
      cur = cur[p] as Record<string, unknown>;
    }
    cur[parts[parts.length - 1]] = value;
  }
  return root;
}

/**
 * Validate that a dot-notation key is a recognized setting.
 *
 * Returns:
 *   - { ok: true }                                         key exists
 *   - { ok: false, validKeys }                             key doesn't exist
 *
 * Used by `aide-memory config KEY VALUE` to reject typos and unknown keys.
 */
export function validateKey(key: string): { ok: true } | { ok: false; validKeys: string[] } {
  const defaults = loadDefaults();
  if (Object.prototype.hasOwnProperty.call(defaults, key)) {
    return { ok: true };
  }
  return { ok: false, validKeys: Object.keys(defaults).sort() };
}
