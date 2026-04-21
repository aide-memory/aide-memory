/**
 * aide-memory config <key> [value] — Get or set configuration.
 *
 * Reads/writes `.aide/config.json` with dot-notation keys. Config is
 * per-project: the file lives next to the project (`.aide/config.json`).
 * A global `~/.aide/config.json` is planned for Phase 2.
 *
 * Keys are validated against two sources of truth:
 *   1. `scripts/hooks/defaults.json` — the 18 hook/recall/injection knobs
 *   2. `AideConfig.defaults()`       — legacy capture/telemetry/tags schema
 *
 * Unknown keys are rejected with a helpful error so users don't silently
 * write typos. Per Phase 1 (2026-04-20) there is NO pro gating — every
 * public setting is user-settable.
 *
 * Side effects: setting certain keys also resyncs on-disk artifacts that
 * live outside config.json. Currently:
 *   - `memories.hideFromGrep` → rewrites the aide-memory-managed section
 *     of the project `.ignore` file (see src/memory/ignoreFile.ts).
 */

import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { requireProjectRoot, brand } from './utils';
import { resyncDerivedArtifacts } from '../../../memory/init';
import { loadDefaults } from '../../../memory/settings';
import { AideConfig } from '../../../memory/config';

function getConfigPath(projectRoot: string): string {
  return path.join(projectRoot, '.aide', 'config.json');
}

function readConfig(configPath: string): Record<string, any> {
  if (!fs.existsSync(configPath)) {
    return {};
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(raw);
}

function writeConfig(configPath: string, config: Record<string, any>): void {
  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
}

/**
 * Get a value by dot-notation key from a nested object.
 */
function getNestedValue(obj: Record<string, any>, key: string): any {
  const parts = key.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Set a value by dot-notation key in a nested object.
 */
function setNestedValue(obj: Record<string, any>, key: string, value: any): void {
  const parts = key.split('.');
  let current: any = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined || typeof current[part] !== 'object') {
      current[part] = {};
    }
    current = current[part];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Try to parse a string value into a more appropriate type.
 *
 * Handles literal `true`/`false`/`null`, integers/floats, and JSON
 * objects/arrays so users can set complex settings from the CLI:
 *   aide-memory config hooks.stop.schedule '[{"every":1}]'
 *   aide-memory config hooks.stop.schedule '{"every":5}'
 * Falls back to the raw string for anything that doesn't parse (so
 * `mode "soft"` still stores `"soft"`, not an invalid JSON token).
 */
function parseValue(raw: string): any {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (raw === 'null') return null;
  const num = Number(raw);
  if (!isNaN(num) && raw.trim() !== '') return num;
  const trimmed = raw.trim();
  if (
    (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
    (trimmed.startsWith('{') && trimmed.endsWith('}'))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      // Fall through: treat as raw string so the user sees a readable
      // value in config.json rather than silently losing data.
    }
  }
  return raw;
}

/**
 * Build the flat-key schema by combining defaults.json keys and the
 * AideConfig schema (nested objects flattened). Exported so tests can
 * assert the contract.
 */
export function collectValidKeys(): string[] {
  const keys = new Set<string>();
  for (const k of Object.keys(loadDefaults())) {
    keys.add(k);
  }
  // Flatten AideConfig defaults into dot-keys (leaf only, skipping object nodes).
  const legacy = AideConfig.defaults() as Record<string, unknown>;
  const stack: Array<{ obj: unknown; prefix: string }> = [{ obj: legacy, prefix: '' }];
  while (stack.length > 0) {
    const { obj, prefix } = stack.pop()!;
    if (obj === null || obj === undefined || typeof obj !== 'object' || Array.isArray(obj)) {
      if (prefix) keys.add(prefix);
      continue;
    }
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      const nextPrefix = prefix ? `${prefix}.${k}` : k;
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        stack.push({ obj: v, prefix: nextPrefix });
      } else {
        keys.add(nextPrefix);
      }
    }
  }
  return Array.from(keys).sort();
}

/**
 * Validate that `key` is a recognized setting.
 *
 * Returns `{ ok: true }` or `{ ok: false, message }` where `message` is
 * a user-facing explanation that names near-matching valid keys and the
 * full list of recognized keys.
 */
export function validateConfigKey(key: string): { ok: true } | { ok: false; message: string } {
  const valid = collectValidKeys();
  if (valid.includes(key)) return { ok: true };

  // Suggest keys that share a prefix or substring. Helps typo recovery.
  const lowerKey = key.toLowerCase();
  const firstPart = lowerKey.split('.')[0];
  const prefixMatches = valid.filter(k => k.toLowerCase().startsWith(firstPart));
  const substrMatches = valid.filter(k => k.toLowerCase().includes(lowerKey));
  const hints = Array.from(new Set([...prefixMatches, ...substrMatches])).slice(0, 10);

  const lines: string[] = [];
  lines.push(`Unknown config key: "${key}".`);
  if (hints.length > 0) {
    lines.push(`Did you mean one of:`);
    for (const h of hints) lines.push(`  - ${h}`);
  }
  lines.push('');
  lines.push(`Valid keys: ${valid.join(', ')}`);
  return { ok: false, message: lines.join('\n') };
}

export function runConfig(key: string, value?: string): void {
  const projectRoot = requireProjectRoot();
  const configPath = getConfigPath(projectRoot);
  const config = readConfig(configPath);

  // Validate the key against defaults.json + AideConfig schema for both
  // get and set. Reading an undefined key is usually a typo too.
  const validation = validateConfigKey(key);
  if (!validation.ok) {
    console.error(chalk.red(validation.message));
    process.exitCode = 1;
    return;
  }

  if (value === undefined) {
    // GET mode
    const result = getNestedValue(config, key);
    if (result === undefined) {
      console.log(chalk.gray(`(not set)`));
    } else {
      console.log(typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result));
    }
  } else {
    // SET mode
    const parsed = parseValue(value);
    setNestedValue(config, key, parsed);
    writeConfig(configPath, config);
    console.log(brand(`Set ${key} = ${JSON.stringify(parsed)}`));

    // Resync side-effecting keys that also have on-disk artifacts.
    applySideEffects(projectRoot, key, parsed);
  }
}

/**
 * Some config keys have side effects beyond writing to config.json
 * (files on disk whose contents depend on the setting — currently only
 * `.ignore` is derived, via `memories.hideFromGrep`).
 *
 * Delegates to the single source of truth in `init.ts` so CLI writes
 * and MCP-startup drift-repair follow the same code path. Only fires
 * for keys that actually have derived artifacts — other settings are
 * read on-demand by hooks and don't need an eager sync.
 */
function applySideEffects(projectRoot: string, key: string, _value: any): void {
  const KEYS_WITH_DERIVED_ARTIFACTS = new Set(['memories.hideFromGrep']);
  if (!KEYS_WITH_DERIVED_ARTIFACTS.has(key)) return;

  // `resyncDerivedArtifacts` reads the current config from disk and
  // rewrites every derived file. We just wrote the new value above, so
  // this picks up the change.
  const changed = resyncDerivedArtifacts(projectRoot);
  for (const msg of changed) {
    console.log(brand(msg));
  }
}
