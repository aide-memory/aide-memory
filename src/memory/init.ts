import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { AideConfig } from './config';
import { MemoryStore } from './store';
import { syncIgnoreFile, readHideFromGrep } from './ignoreFile';
import { listPublicDefaults, flatMapToNested, loadDefaults } from './settings';
import { claudeCodeAdapter } from './editors/claude-code';
import { adaptersWithRules, adaptersWithHooks, adaptersWithMcp } from './editors';
import { buildRules } from './editors/rules';
import { EditorAdapter } from './editors/types';
import { regenerateAllRules, regenerateRulesForAdapter } from './rulesGen';
import { HOOK_EVENTS } from './hooks/events';

export interface InitResult {
  created: string[];
  skipped: string[];
  warnings: string[];
}

export interface InitOptions {
  updateRules?: boolean;
  force?: boolean;
}

const AIDE_DIRS = [
  '.aide',
  '.aide/memories',
  '.aide/memories/preferences',
  '.aide/memories/preferences/personal',
  '.aide/memories/preferences/shared',
  '.aide/memories/technical',
  '.aide/memories/area_context',
  '.aide/memories/guidelines',
  '.aide/cache',
];

const GITIGNORE_ENTRIES = [
  '.aide/memories/preferences/personal/',
  '.aide/cache/',
  '.aide/recall-log.jsonl',
  '.aide/pending-memories.jsonl',
  // Cursor rule file is a derived artifact. Static content today; Phase C4
  // will make it regenerate from the SQLite store + config on memory/config
  // writes (workaround for broken sessionStart.additional_context per
  // CURSOR_ONBOARDING.md §4). Marking it gitignored now means teammates
  // don't accidentally commit per-session state once C4 ships. Remove this
  // entry when Cursor bug #158452 is fixed and we narrow the rules file
  // back to static content.
  '.cursor/rules/aide-memory.mdc',
];

const HOOK_START_MARKER = '# >>> aide-memory post-checkout hook >>>';
const HOOK_END_MARKER = '# <<< aide-memory post-checkout hook <<<';

const HOOK_CONTENT = `
# Rebuild aide-memory SQLite index from .aide/memories/ files after checkout.
# This keeps the cached index in sync when switching branches.
if command -v aide >/dev/null 2>&1; then
  aide reindex --quiet &
fi
`;

/**
 * Get the root directory of the aide-memory package installation.
 * This is where scripts/hooks/ lives — needed for absolute hook paths in settings.json.
 */
function getPackageRoot(): string {
  // init.ts is at src/memory/init.ts or dist/memory/init.js
  // Package root is two levels up
  return path.resolve(__dirname, '..', '..');
}

/**
 * Detect if aide-memory is running from the npx cache (ephemeral).
 * npx downloads packages to ~/.npm/_npx/<hash>/node_modules/.
 * Paths generated from this location break if the cache is cleaned,
 * Node version changes, or aide-memory is upgraded.
 */
function isRunningFromNpxCache(): boolean {
  const root = getPackageRoot();
  return root.includes('/_npx/') || root.includes('\\_npx\\');
}

/**
 * Write an editor adapter's hook config file. Handles three scenarios:
 *   1. File doesn't exist → write fresh content with version stamp.
 *   2. File exists, no aide-memory hooks yet → merge (preserve user's other
 *      top-level settings, add our hooks + stamp).
 *   3. File exists with aide-memory hooks already → skip unless `force`, in
 *      which case merge/overwrite and re-stamp.
 *
 * Merge semantics: shallow-merge at top level. Our `hooks` key wins over any
 * existing `hooks` key — aide-memory's hook set is our contract. Users who
 * want to preserve other tools' hooks should configure them separately in
 * their own hook config file (Claude Code's settings.local.json or Cursor's
 * workspace-vs-project overrides).
 *
 * Collision warning for Cursor: if the existing file has hooks for events
 * aide-memory ALSO claims, and the merged output will drop the user's
 * (per Cursor forum #141996 "only first hook per event runs" quirk), we'd
 * ideally warn. Not wired yet — Phase C2 minimum scope, follow-up for C6.
 */
function writeHookConfigFor(
  adapter: EditorAdapter,
  projectRoot: string,
  force: boolean,
  stampVersion?: string,
): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];
  const relPath = adapter.hookConfigPath;

  const settingsPath = path.join(projectRoot, relPath);
  const settingsDir = path.dirname(settingsPath);
  if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });

  const packageRoot = getPackageRoot();
  const hookConfig = adapter.buildHookConfig({ packageRoot }) as Record<string, unknown>;
  const stamp = stampVersion ? { _aideMemoryVersion: stampVersion } : {};

  const writeFresh = (reason: string) => {
    fs.writeFileSync(settingsPath, JSON.stringify({ ...hookConfig, ...stamp }, null, 2) + '\n', 'utf8');
    created.push(`${relPath}${reason ? ` (${reason})` : ''}`);
  };

  if (!fs.existsSync(settingsPath)) {
    writeFresh('');
    return { created, skipped };
  }

  // File exists. Read + detect whether aide-memory's hooks are already wired.
  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  } catch {
    // Malformed JSON — overwrite rather than crash.
    writeFresh('');
    return { created, skipped };
  }

  const hasAideHooks = detectAideMemoryHooksInConfig(existing, packageRoot);
  if (hasAideHooks && !force) {
    skipped.push(`${relPath} (hooks already configured)`);
    return { created, skipped };
  }

  // Per-event merge (Phase C6 fix). BEFORE: we replaced the top-level `hooks`
  // key wholesale, clobbering any other tool's hook entries (e.g. a secret
  // scanner registered under `preToolUse` on Cursor, or a formatter on
  // Claude Code). NOW: filter OUR old entries out of each event array + add
  // our FRESH entries, preserving every non-aide-memory entry in place.
  //
  // This is especially important for Cursor given quirk #141996 ("only first
  // hook per event runs") — if we both claim preToolUse, clobbering drops
  // the user's scanner silently. With per-event merge, the user's entry is
  // preserved and Cursor's own "first hook" logic decides ordering.
  const mergedHooks = mergeHooksByEvent(
    (existing.hooks as Record<string, unknown[]> | undefined) ?? {},
    (hookConfig.hooks as Record<string, unknown[]> | undefined) ?? {},
    packageRoot,
  );
  const merged: Record<string, unknown> = { ...existing, ...hookConfig, hooks: mergedHooks, ...stamp };
  fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
  created.push(`${relPath} (hooks ${force ? 'force-updated' : 'added'})`);
  return { created, skipped };
}

/**
 * Per-event merge: for every event name in EITHER existing or our hooks,
 * concatenate (user's non-aide-memory entries) + (our fresh entries).
 *
 * `packageRoot` is used to identify aide-memory entries — an entry whose
 * command references the aide-memory package's `scripts/hooks/` directory
 * counts as ours and gets replaced with the fresh version. Any other entry
 * is preserved untouched.
 *
 * Why this matters:
 *   - Claude Code: user may have other tools' hooks in `.claude/settings.json`.
 *     Clobbering them silently breaks those tools.
 *   - Cursor: per forum quirk #141996 only the FIRST hook per event runs,
 *     but entries from multiple tools can coexist in the array. If we
 *     clobber, the user loses their hook. If we append after removing our
 *     OLD entries, their hook stays intact + the "first hook" ordering is
 *     up to them.
 */
function mergeHooksByEvent(
  existingHooks: Record<string, unknown>,
  ourHooks: Record<string, unknown>,
  packageRoot: string,
): Record<string, unknown[]> {
  // An entry counts as "ours" if it (a) points at the CURRENT packageRoot
  // OR (b) references any of our known script filenames from the
  // HOOK_EVENTS manifest. Combining both catches two scenarios:
  //   - Fresh re-init at same install location: packageRoot path matches.
  //   - User reinstalled aide-memory at a different location (e.g. global
  //     → local dev path): old entries still recognized via script-name
  //     signature + replaced with fresh ones. Without this, stale paths
  //     from prior installs would linger as dead "user entries."
  const packageRootNeedle = path.join(packageRoot, 'scripts', 'hooks');
  const aideScriptNames = new Set(HOOK_EVENTS.map((e) => e.script));
  const isAideEntry = (entry: unknown): boolean => {
    const visit = (obj: unknown): boolean => {
      if (typeof obj === 'string') {
        if (obj.includes(packageRootNeedle)) return true;
        // Script-name match: any command ending with /<known-script>.sh
        // or the bare script name. Using includes() is loose enough to
        // catch arbitrary paths.
        for (const name of aideScriptNames) {
          if (obj.includes(`/${name}`) || obj.endsWith(name)) return true;
        }
        return false;
      }
      if (Array.isArray(obj)) return obj.some(visit);
      if (obj && typeof obj === 'object') return Object.values(obj).some(visit);
      return false;
    };
    return visit(entry);
  };

  const out: Record<string, unknown[]> = {};
  const allEventNames = new Set<string>([
    ...Object.keys(existingHooks),
    ...Object.keys(ourHooks),
  ]);

  for (const eventName of allEventNames) {
    const existingArr = Array.isArray(existingHooks[eventName])
      ? (existingHooks[eventName] as unknown[])
      : [];
    const ourArr = Array.isArray(ourHooks[eventName])
      ? (ourHooks[eventName] as unknown[])
      : [];

    // Strip our OLD entries from existing (we'll re-add fresh copies from
    // ourArr). Any non-aide entry is preserved verbatim.
    const preserved = existingArr.filter((e) => !isAideEntry(e));

    // Concatenate: user's entries FIRST (so Cursor's "first hook wins"
    // quirk favors user's tools when they overlap with ours), then our
    // fresh entries. Users who want aide-memory to run first can reorder
    // the file manually post-init.
    const combined = [...preserved, ...ourArr];
    if (combined.length > 0) out[eventName] = combined;
  }

  return out;
}

/**
 * Inspect a hook config file to detect aide-memory's presence. We can't just
 * check `existing.hooks` because a user may have other hooks in there —
 * instead we look for any command referencing the aide-memory package's
 * scripts/hooks/ directory. If even one hook points at us, treat it as
 * "aide-memory already wired" to avoid duplicating on non-forced init.
 */
function detectAideMemoryHooksInConfig(cfg: Record<string, unknown>, packageRoot: string): boolean {
  const needle = path.join(packageRoot, 'scripts', 'hooks');
  const visit = (obj: unknown): boolean => {
    if (typeof obj === 'string') return obj.includes(needle);
    if (Array.isArray(obj)) return obj.some(visit);
    if (obj && typeof obj === 'object') return Object.values(obj).some(visit);
    return false;
  };
  return visit(cfg.hooks);
}


/**
 * Write an adapter's MCP config file. Same three-scenario logic as hooks:
 *   1. File doesn't exist → write fresh.
 *   2. File exists without `aide-memory` under `mcpServers` → merge (preserve
 *      user's other MCP servers, add ours).
 *   3. File exists WITH `aide-memory` → skip unless `force`.
 *
 * Unlike hook config which is shallow-merge at top level, MCP config is
 * merged inside `mcpServers` so other servers stay. Matches the old Claude-
 * Code-only logic behavior, now parametrized by adapter.
 */
function writeMcpConfigFor(
  adapter: EditorAdapter,
  projectRoot: string,
  force: boolean,
): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  const mcpPath = path.join(projectRoot, adapter.mcpConfigPath);
  const mcpDir = path.dirname(mcpPath);
  if (!fs.existsSync(mcpDir)) fs.mkdirSync(mcpDir, { recursive: true });

  const packageRoot = getPackageRoot();
  const serverScript = path.join(packageRoot, 'dist', 'memory', 'cli.js');

  const built = adapter.buildMcpConfig({
    serverEntry: serverScript,
    projectRoot,
  }) as { mcpServers: { 'aide-memory': object } };

  if (!fs.existsSync(mcpPath)) {
    fs.writeFileSync(mcpPath, JSON.stringify(built, null, 2) + '\n', 'utf8');
    created.push(adapter.mcpConfigPath);
    return { created, skipped };
  }

  try {
    const existing = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    const hasAide = Boolean(existing.mcpServers?.['aide-memory']);
    if (hasAide && !force) {
      skipped.push(`${adapter.mcpConfigPath} (aide-memory already configured)`);
      return { created, skipped };
    }
    existing.mcpServers = existing.mcpServers || {};
    existing.mcpServers['aide-memory'] = built.mcpServers['aide-memory'];
    fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
    created.push(`${adapter.mcpConfigPath} (aide-memory ${force ? 'force-updated' : 'server added'})`);
  } catch {
    // Malformed JSON — overwrite rather than leave broken state.
    fs.writeFileSync(mcpPath, JSON.stringify(built, null, 2) + '\n', 'utf8');
    created.push(adapter.mcpConfigPath);
  }
  return { created, skipped };
}


export const MCP_TOOLS_LIST = `- \`aide_recall\` — retrieve stored context for file paths you're about to work on
- \`aide_remember\` — store discoveries, decisions, corrections, and preferences
- \`aide_update\` — update an existing memory when information changes
- \`aide_forget\` — remove outdated memories
- \`aide_search\` — find memories by keyword
- \`aide_import\` — seed knowledge from existing markdown docs
- \`aide_memories\` — list all stored memories`;

/**
 * Detect the contributor name from git config.
 * Falls back to "unknown" if git is not available or user.name is not set.
 */
export function detectContributor(projectRoot: string): string {
  try {
    // First check if this is a git repo
    execSync('git rev-parse --git-dir', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    // Then get user.name from local or global config
    const name = execSync('git config user.name', {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return name || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Read a template file and replace placeholders.
 */
function renderTemplate(templatePath: string, vars: Record<string, string>): string {
  let content = fs.readFileSync(templatePath, 'utf8');
  for (const [key, value] of Object.entries(vars)) {
    content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return content;
}

// `getTemplatesDir()` lives in `./internal/paths.ts` — uses package.json
// walk-up to find <pkg>/src/templates/rules reliably across the tsc dist
// layout, the esbuild-bundled layout, and ts-node dev. The earlier inline
// implementation here used `__dirname/../...` math that broke in the
// bundled layout (esbuild rewrites the relative depth). Ship-blocker bug
// caught by the install-from-tarball smoke 2026-04-27 — see memory #361
// and the diagnostic surface for the rationale.

/**
 * Create directory structure under .aide/
 */
function createDirectories(projectRoot: string, force: boolean): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const dir of AIDE_DIRS) {
    const fullPath = path.join(projectRoot, dir);
    if (fs.existsSync(fullPath)) {
      if (!force) {
        skipped.push(dir);
        continue;
      }
    }
    fs.mkdirSync(fullPath, { recursive: true });
    created.push(dir);
  }

  return { created, skipped };
}

/**
 * Write rules files. Iterates ADAPTERS with supportsRules=true (C1 default:
 * claude-code + cursor), rendering each via buildRules() which composes the
 * shared body at src/templates/rules/shared/body.md with adapter-specific
 * frontmatter, notes, and tool_id.
 *
 * Adding a new editor's rule file: flip its supportsRules flag in
 * src/memory/editors/<editor>.ts. Editing tool-use guidance that should
 * apply to all editors: edit shared/body.md — all 5 (when wired) inherit
 * automatically. See docs/specs/CURSOR_ONBOARDING.md §3.5.
 */
function writeRulesFiles(
  projectRoot: string,
  contributor: string,
  force: boolean
): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const adapter of adaptersWithRules()) {
    // Each adapter currently declares exactly one rule spec (destination).
    // Multi-entry support is kept in the interface for future editors that
    // install more than one rule file.
    for (const rule of adapter.rules) {
      const destPath = path.join(projectRoot, rule.dest);

      if (fs.existsSync(destPath) && !force) {
        skipped.push(rule.dest);
        continue;
      }

      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }

      const content = buildRules(adapter, {
        contributor,
        tools_list: MCP_TOOLS_LIST,
      });
      fs.writeFileSync(destPath, content, 'utf8');
      created.push(rule.dest);
    }
  }

  return { created, skipped };
}

/**
 * Deep-merge helper used when seeding public settings into an existing
 * user config. Primitives and arrays replace wholesale; plain objects
 * recurse so we never stomp on user overrides.
 *
 * Only fills in keys that are *absent* in `target`. If the user has
 * explicitly set a value (including `false` or `0`), we leave it alone.
 */
function deepMergeKeepExisting(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  for (const [key, value] of Object.entries(source)) {
    const existing = target[key];
    if (
      existing !== undefined &&
      existing !== null &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      value !== null &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      deepMergeKeepExisting(existing as Record<string, unknown>, value as Record<string, unknown>);
    } else if (existing === undefined) {
      target[key] = value;
    }
  }
  return target;
}

/**
 * Seed `.aide/config.json` with every public setting from
 * `scripts/hooks/defaults.json` so users can see all knobs in one place
 * and edit them with their normal editor.
 *
 * Behavior:
 *   - Creates the file with the defaults if missing.
 *   - Merges into existing JSON, preserving every key the user has set
 *     (including non-aide keys) and every aide key that's already
 *     populated. Only absent keys get seeded.
 *
 * Returns whether the file changed so callers can report it.
 */
function writePublicSettings(projectRoot: string): { written: boolean } {
  const configPath = path.join(projectRoot, '.aide', 'config.json');
  const defaultsFlat = listPublicDefaults();
  const defaultsNested = flatMapToNested(defaultsFlat);

  let current: Record<string, unknown> = {};
  if (fs.existsSync(configPath)) {
    try {
      current = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
    } catch {
      current = {};
    }
  }

  const beforeJson = JSON.stringify(current);
  deepMergeKeepExisting(current, defaultsNested);
  const afterJson = JSON.stringify(current);
  if (beforeJson === afterJson) {
    return { written: false };
  }

  const dir = path.dirname(configPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(current, null, 2) + '\n', 'utf8');
  return { written: true };
}

/**
 * Generate `.aide/config-reference.md` — a human-readable reference listing
 * every public setting from `scripts/hooks/defaults.json` with its default
 * value and description. Regenerated on `aide init` / `aide init --force`
 * so users who upgraded aide-memory get fresh docs when new settings land.
 *
 * Format matches the table structure in `docs/user/configuration.md` for
 * consistency. Users can `cat .aide/config-reference.md` anytime.
 */
function writeConfigReference(
  projectRoot: string,
  force: boolean,
): { created: string[]; skipped: string[] } {
  const refPath = path.join(projectRoot, '.aide', 'config-reference.md');
  if (fs.existsSync(refPath) && !force) {
    return { created: [], skipped: ['.aide/config-reference.md'] };
  }

  const defaults = loadDefaults();
  const publicKeys = Object.keys(defaults)
    .filter((k) => defaults[k].public === true)
    .sort();

  const lines: string[] = [
    '# aide-memory configuration reference',
    '',
    'Auto-generated by `aide-memory init`. Every public setting from',
    '`scripts/hooks/defaults.json` with its default and description.',
    '',
    'Override any of these with:',
    '',
    '```bash',
    'aide-memory config <key> <value>',
    '```',
    '',
    'Or see the live list with current values:',
    '',
    '```bash',
    'aide-memory config list',
    '```',
    '',
    '## Settings',
    '',
  ];

  for (const key of publicKeys) {
    const entry = defaults[key];
    const defaultLabel =
      typeof entry.value === 'object'
        ? '`' + JSON.stringify(entry.value) + '`'
        : '`' + String(entry.value) + '`';
    lines.push('### `' + key + '`');
    lines.push('');
    lines.push('**Default:** ' + defaultLabel);
    lines.push('');
    if (entry.description) {
      lines.push(entry.description);
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push(
    '_Reference regenerated at init time. If this file drifts from your installed aide-memory, re-run `aide-memory init --force` to refresh._',
  );
  lines.push('');

  const dir = path.dirname(refPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(refPath, lines.join('\n'), 'utf8');
  return { created: ['.aide/config-reference.md'], skipped: [] };
}

/**
 * Create .aide/config.json with defaults.
 * Uses the existing AideConfig class which auto-loads defaults and saves via set().
 * Also seeds all public hook settings from scripts/hooks/defaults.json so
 * every configurable knob is visible to the user in one place.
 */
function writeConfig(
  projectRoot: string,
  contributor: string,
  force: boolean
): { created: string[]; skipped: string[] } {
  const configPath = path.join(projectRoot, '.aide', 'config.json');
  const alreadyExists = fs.existsSync(configPath);

  // If config already exists and we're not forcing, still merge in any
  // new public settings so upgraded installs gain visibility into knobs
  // that were added in a new release — never overwriting user values.
  if (alreadyExists && !force) {
    const { written } = writePublicSettings(projectRoot);
    if (written) {
      return { created: ['.aide/config.json (public settings seeded)'], skipped: [] };
    }
    return { created: [], skipped: ['.aide/config.json'] };
  }

  // AideConfig constructor loads from disk (merging with defaults).
  // When forcing, reset() first to clear any stale keys, then set contributor.
  const config = new AideConfig(projectRoot);
  if (force) {
    config.reset(); // resets to clean defaults and saves
  }
  config.set('contributor', contributor);
  // Seed public hook settings alongside AideConfig defaults.
  writePublicSettings(projectRoot);
  return { created: ['.aide/config.json'], skipped: [] };
}

/**
 * Update .gitignore with aide-specific entries.
 * Does not duplicate entries already present.
 */
function updateGitignore(projectRoot: string): { created: string[]; skipped: string[] } {
  const gitignorePath = path.join(projectRoot, '.gitignore');
  const created: string[] = [];
  const skipped: string[] = [];

  let content = '';
  if (fs.existsSync(gitignorePath)) {
    content = fs.readFileSync(gitignorePath, 'utf8');
  }

  const lines = content.split('\n');
  const toAdd: string[] = [];

  for (const entry of GITIGNORE_ENTRIES) {
    if (lines.some(line => line.trim() === entry)) {
      skipped.push(`.gitignore entry: ${entry}`);
    } else {
      toAdd.push(entry);
      created.push(`.gitignore entry: ${entry}`);
    }
  }

  if (toAdd.length > 0) {
    const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    const section = `${separator}\n# aide-memory\n${toAdd.join('\n')}\n`;
    fs.writeFileSync(gitignorePath, content + section, 'utf8');
  }

  return { created, skipped };
}

/**
 * Create/update .ignore file to hide memory files from grep (ripgrep).
 * Controlled by config `memories.hideFromGrep` (default: true).
 * .ignore is respected by ripgrep but does not affect git.
 *
 * Uses marker comments (BEGIN/END aide-memory-managed) so we only touch
 * our own section — any user-added entries outside the markers are preserved.
 * Legacy .ignore files (from older init versions that wrote the bare entry
 * without markers) are migrated on first sync.
 */
function updateIgnoreFile(projectRoot: string): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  const hideFromGrep = readHideFromGrep(projectRoot);
  const result = syncIgnoreFile(projectRoot, hideFromGrep);

  if (result.changed && result.message) {
    created.push(result.message);
  } else if (!result.changed && hideFromGrep) {
    skipped.push('.ignore (aide-memory section already present)');
  }

  return { created, skipped };
}

/**
 * Install post-checkout git hook.
 * If the hook file exists, append the aide section wrapped in markers.
 * If not, create it with the aide section.
 */
function installPostCheckoutHook(
  projectRoot: string,
  force: boolean
): { created: string[]; skipped: string[]; warnings: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];
  const warnings: string[] = [];

  // Walk up to find .git/ (handles monorepo subdirectories).
  // Stop at filesystem root or if we leave the project boundary
  // (a directory with its own .aide/ or package.json that isn't our project root).
  let gitDir = '';
  let searchDir = projectRoot;
  for (let i = 0; i < 20; i++) {
    const candidate = path.join(searchDir, '.git');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      gitDir = candidate;
      break;
    }
    const parent = path.dirname(searchDir);
    if (parent === searchDir) break;
    // Don't walk past a directory that looks like a different project root
    if (searchDir !== projectRoot) {
      const hasOwnAide = fs.existsSync(path.join(parent, '.aide'));
      if (hasOwnAide) break;
    }
    searchDir = parent;
  }
  if (!gitDir) {
    warnings.push('No git repository found — skipping post-checkout hook');
    return { created, skipped, warnings };
  }

  const hooksDir = path.join(gitDir, 'hooks');
  if (!fs.existsSync(hooksDir)) {
    fs.mkdirSync(hooksDir, { recursive: true });
  }

  const hookPath = path.join(hooksDir, 'post-checkout');
  const hookSection = `${HOOK_START_MARKER}\n${HOOK_CONTENT}\n${HOOK_END_MARKER}\n`;

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');

    if (existing.includes(HOOK_START_MARKER)) {
      if (!force) {
        skipped.push('.git/hooks/post-checkout (aide section already present)');
        return { created, skipped, warnings };
      }
      // Force: replace existing aide section
      const before = existing.substring(0, existing.indexOf(HOOK_START_MARKER));
      const afterMarkerEnd = existing.indexOf(HOOK_END_MARKER);
      const after = afterMarkerEnd >= 0
        ? existing.substring(afterMarkerEnd + HOOK_END_MARKER.length + 1)
        : '';
      fs.writeFileSync(hookPath, before + hookSection + after, 'utf8');
    } else {
      // Append aide section
      const separator = existing.endsWith('\n') ? '' : '\n';
      fs.writeFileSync(hookPath, existing + separator + '\n' + hookSection, 'utf8');
    }
  } else {
    fs.writeFileSync(hookPath, '#!/bin/bash\n\n' + hookSection, 'utf8');
  }

  // Make executable
  fs.chmodSync(hookPath, 0o755);
  created.push('.git/hooks/post-checkout');

  return { created, skipped, warnings };
}

/**
 * Initialize a project for aide-memory.
 *
 * Creates .aide/ directory structure, writes rules files, config, gitignore entries,
 * and installs git hooks. Optionally runs pre-train scan to generate initial memories.
 *
 * Idempotent by default — running twice skips existing files.
 * Use `force: true` to overwrite existing files.
 * Use `updateRules: true` to only refresh rules files.
 */
export async function initProject(
  projectRoot: string,
  options?: InitOptions
): Promise<InitResult> {
  const resolvedRoot = path.resolve(projectRoot);
  const force = options?.force ?? false;
  const result: InitResult = {
    created: [],
    skipped: [],
    warnings: [],
  };

  // --update-rules mode: refresh static rules content AND re-regenerate
  // dynamic section. Full init's step 7 regen call wouldn't run on this
  // early-return path, so we invoke it explicitly here.
  if (options?.updateRules) {
    const contributor = detectContributor(resolvedRoot);
    const rules = writeRulesFiles(resolvedRoot, contributor, true); // always overwrite in update-rules mode
    result.created.push(...rules.created);
    result.skipped.push(...rules.skipped);
    try {
      const regenResults = regenerateAllRules(adaptersWithRules(), resolvedRoot, {
        contributor,
        tools_list: MCP_TOOLS_LIST,
      });
      for (const r of regenResults) {
        if (r.written) result.created.push(`${r.dest} (dynamic content regenerated)`);
        if (r.budgetWarning) result.warnings.push(r.budgetWarning);
      }
    } catch (err) {
      result.warnings.push(`rulesGen: ${(err as Error).message}`);
    }
    return result;
  }

  // 0. Detect npx cache and warn
  if (isRunningFromNpxCache()) {
    result.warnings.push(
      'aide-memory is running from the npx cache. Hook and MCP paths may break if ' +
      'the cache is cleaned, Node version changes, or aide-memory is upgraded. ' +
      'For a stable install, run: npm install -g aide-memory && aide-memory init'
    );
  }

  // Detect contributor
  const contributor = detectContributor(resolvedRoot);

  // 1. Create directory structure
  const dirs = createDirectories(resolvedRoot, force);
  result.created.push(...dirs.created);
  result.skipped.push(...dirs.skipped);

  // 2. Write rules files
  const rules = writeRulesFiles(resolvedRoot, contributor, force);
  result.created.push(...rules.created);
  result.skipped.push(...rules.skipped);

  // 2.5. Install hook configurations for each editor adapter whose
  // supportsHooks flag is true. C1 default: claude-code only. C2 flip:
  // cursor joins (writes .cursor/hooks.json). Adding a new editor's hooks
  // = flip its supportsHooks flag in src/memory/editors/<editor>.ts.
  const packageRoot = getPackageRoot();
  let pkgVersion: string | undefined;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    pkgVersion = pkg.version;
  } catch { /* non-fatal */ }

  for (const adapter of adaptersWithHooks()) {
    const h = writeHookConfigFor(adapter, resolvedRoot, force, pkgVersion);
    result.created.push(...h.created);
    result.skipped.push(...h.skipped);
  }

  // 2.6. Install MCP server configurations for each editor with supportsMcp.
  for (const adapter of adaptersWithMcp()) {
    const m = writeMcpConfigFor(adapter, resolvedRoot, force);
    result.created.push(...m.created);
    result.skipped.push(...m.skipped);
  }

  // 3. Write config
  const config = writeConfig(resolvedRoot, contributor, force);
  result.created.push(...config.created);
  result.skipped.push(...config.skipped);

  // 3.5. Write .aide/config-reference.md so users can see every setting's
  // description without opening defaults.json. Regenerated on init / --force
  // so the reference stays in sync with the shipped defaults schema.
  const ref = writeConfigReference(resolvedRoot, force);
  result.created.push(...ref.created);
  result.skipped.push(...ref.skipped);

  // 4. Update .gitignore
  const gitignore = updateGitignore(resolvedRoot);
  result.created.push(...gitignore.created);
  result.skipped.push(...gitignore.skipped);

  // 5. Create/update .ignore file (hides memories from grep/ripgrep)
  const ignoreResult = updateIgnoreFile(resolvedRoot);
  result.created.push(...ignoreResult.created);
  result.skipped.push(...ignoreResult.skipped);

  // 6. Install post-checkout hook
  const hook = installPostCheckoutHook(resolvedRoot, force);
  result.created.push(...hook.created);
  result.skipped.push(...hook.skipped);
  result.warnings.push(...hook.warnings);

  // 7. Dynamic rules-file regeneration (Phase C4). For every adapter with
  // supportsRules + a rule already written in step 2, re-render the file
  // with shared body + current session-start content appended. Cursor's
  // adapter uses this as the staff-endorsed workaround for broken
  // sessionStart.additional_context (#158452); Claude Code benefits too
  // (the content is identical to what its SessionStart hook injects, just
  // delivered via rules file as a belt-and-suspenders channel).
  //
  // Runs LAST so memory store + config are finalized. Errors are swallowed
  // per-adapter inside regenerateAllRules — we don't want a regen failure
  // to mask the rest of init's successful work.
  try {
    const regenResults = regenerateAllRules(adaptersWithRules(), resolvedRoot, {
      contributor,
      tools_list: MCP_TOOLS_LIST,
    });
    for (const r of regenResults) {
      if (r.written) result.created.push(`${r.dest} (dynamic content regenerated)`);
      if (r.budgetWarning) result.warnings.push(r.budgetWarning);
    }
  } catch (err) {
    result.warnings.push(`rulesGen: ${(err as Error).message}`);
  }

  // 8. Restart reminder so MCP server registers.
  result.warnings.push(
    'Restart your editor (or start a fresh session) to ensure the MCP server is picked up.',
  );

  return result;
}

/**
 * Single source of truth for derived-artifact resync.
 *
 * Some settings produce files on disk whose content depends on the setting
 * value — currently only `memories.hideFromGrep` → `.ignore`, but the pattern
 * is extensible. This function is the ONE place that reads the current config
 * and rewrites every such artifact. Called from:
 *
 *   1. `aide-memory config KEY VALUE` CLI writes (via applySideEffects) for
 *      instant feedback.
 *   2. `autoUpdateIfNeeded()` on MCP server startup for drift-repair (catches
 *      direct edits to `.aide/config.json` that bypass the CLI).
 *
 * Returns a list of human-readable messages describing any files changed.
 * Returns empty array if everything was already in sync.
 */
export function resyncDerivedArtifacts(projectRoot: string): string[] {
  const changed: string[] = [];

  // .ignore — driven by memories.hideFromGrep
  try {
    const hideFromGrep = readHideFromGrep(projectRoot);
    const result = syncIgnoreFile(projectRoot, hideFromGrep);
    if (result.changed && result.message) {
      changed.push(result.message);
    }
  } catch {
    // Non-fatal — a failed .ignore sync shouldn't affect other artifacts.
  }

  // Future derived artifacts go here. Each should be in its own try/catch
  // so one failure doesn't cascade.

  return changed;
}

/**
 * Auto-update hooks, MCP config, and rules files on MCP server start.
 * Checks _aideMemoryVersion in .claude/settings.json — if missing or older
 * than current package version, merges new config preserving user settings.
 * Also unconditionally resyncs derived artifacts (like .ignore) so direct
 * edits to .aide/config.json get picked up without requiring a version bump.
 * Called from startServer() so updates happen seamlessly without manual init.
 */
export function autoUpdateIfNeeded(projectRoot: string, currentVersion: string): string[] {
  const updated: string[] = [];

  try {
    // Derived-artifact resync: ALWAYS run, independent of version stamp.
    // Settings read on-demand by hooks, but settings that produce files on
    // disk (like .ignore from memories.hideFromGrep) need an explicit sync
    // step. Run this every MCP startup so direct edits to .aide/config.json
    // get picked up without requiring a version bump. The CLI write path
    // also calls applySideEffects for instant feedback; this is the
    // drift-repair safety net.
    try {
      const resyncResult = resyncDerivedArtifacts(projectRoot);
      updated.push(...resyncResult);
    } catch {
      // Non-fatal — a failed resync shouldn't block MCP startup.
    }

    // Version-stamp check: scan every adapter's hook config file for a stale
    // or missing `_aideMemoryVersion`. If ANY adapter's file needs updating,
    // run the auto-update pass for all of them. (We could be smarter and
    // only update stale ones, but keeping all adapter files in version sync
    // is simpler and safer — prevents one editor being ahead of another.)
    let needsUpdate = false;
    for (const adapter of adaptersWithHooks()) {
      const hookPath = path.join(projectRoot, adapter.hookConfigPath);
      if (!fs.existsSync(hookPath)) {
        needsUpdate = true;
        break;
      }
      try {
        const existing = JSON.parse(fs.readFileSync(hookPath, 'utf8'));
        const installedVersion = existing._aideMemoryVersion;
        if (!installedVersion || isOlderVersion(installedVersion, currentVersion)) {
          needsUpdate = true;
          break;
        }
      } catch {
        needsUpdate = true; // Malformed JSON — re-write
        break;
      }
    }

    if (!needsUpdate) return updated;

    // Update every adapter's hook config + MCP config. Uses the same per-
    // adapter writers as initProject, with force=true so they overwrite
    // existing content while preserving user's other top-level keys.
    for (const adapter of adaptersWithHooks()) {
      const h = writeHookConfigFor(adapter, projectRoot, true, currentVersion);
      for (const msg of h.created) updated.push(`${msg} (auto-updated)`);
    }
    for (const adapter of adaptersWithMcp()) {
      const m = writeMcpConfigFor(adapter, projectRoot, true);
      updated.push(...m.created);
    }

    // Update rules files (only if they exist — don't create in projects that weren't init'd)
    const claudeRulesPath = path.join(projectRoot, '.claude', 'rules', 'aide-memory.md');
    if (fs.existsSync(claudeRulesPath)) {
      const rulesResult = writeRulesFiles(projectRoot, '', true);
      updated.push(...rulesResult.created);
    }

    // Ensure directory structure exists (new version may add new directories)
    for (const dir of AIDE_DIRS) {
      const fullPath = path.join(projectRoot, dir);
      if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
        updated.push(`${dir}/ (created)`);
      }
    }

    // Ensure .gitignore entries exist
    const gitignorePath = path.join(projectRoot, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      const content = fs.readFileSync(gitignorePath, 'utf8');
      const missing = GITIGNORE_ENTRIES.filter(e => !content.includes(e));
      if (missing.length > 0) {
        fs.appendFileSync(gitignorePath, '\n' + missing.join('\n') + '\n', 'utf8');
        updated.push(`.gitignore (${missing.length} entries added)`);
      }
    }

    // Note: .ignore is resynced unconditionally at the top of this function
    // via resyncDerivedArtifacts — no need to repeat here.

    // Update git post-checkout hook (merge, uses markers to replace aide section only)
    const hookResult = installPostCheckoutHook(projectRoot, true);
    if (hookResult.created.length > 0) updated.push(...hookResult.created);

    // Seed any new public settings into .aide/config.json so upgraded
    // installs gain visibility into knobs added in a new release. Never
    // overwrites user values — only fills in missing keys.
    const settingsResult = writePublicSettings(projectRoot);
    if (settingsResult.written) {
      updated.push('.aide/config.json (public settings seeded)');
    }
  } catch {
    // Auto-update failure is non-fatal — server continues normally
  }

  return updated;
}

/** Simple semver comparison: is `a` older than `b`? */
function isOlderVersion(a: string, b: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return true;
    if ((pa[i] || 0) > (pb[i] || 0)) return false;
  }
  return false; // equal
}

/**
 * Ingest memories from `.aide/pending-memories.jsonl` into the store.
 * Written by the correction-detection fallback when MCP was unavailable.
 * On success, the file is archived to `pending-memories.jsonl.imported-{ts}`
 * so users can audit what was imported. Malformed lines are kept in the
 * original file. Returns count of successfully imported memories.
 */
export function ingestPendingMemories(projectRoot: string, store: MemoryStore): number {
  const file = path.join(projectRoot, '.aide', 'pending-memories.jsonl');
  if (!fs.existsSync(file)) return 0;

  let raw: string;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    return 0; // unreadable — skip silently
  }

  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    // Empty file — just remove it
    try { fs.unlinkSync(file); } catch { /* non-fatal */ }
    return 0;
  }

  let imported = 0;
  const failed: string[] = [];

  for (const line of lines) {
    try {
      const p = JSON.parse(line);
      // Map the fallback-file shape (`content`) to CreateMemory (`what`).
      const what = p.what ?? p.content;
      if (!p.layer || !what) {
        failed.push(line);
        continue;
      }
      store.add({
        layer: p.layer,
        what,
        why: p.why,
        scope: p.scope ?? undefined,
        context_label: p.context_label,
        contributor: p.contributor,
        tags: Array.isArray(p.tags) ? p.tags : undefined,
        source: p.source ?? 'hook',
        shared: typeof p.shared === 'boolean' ? p.shared : undefined,
        priority: p.priority,
        generated_by: p.generated_by,
      });
      imported++;
    } catch {
      failed.push(line);
    }
  }

  // Archive the original file so we don't re-import it.
  if (imported > 0) {
    const archive = `${file}.imported-${Date.now()}`;
    try { fs.renameSync(file, archive); } catch { /* non-fatal */ }
  }

  // If any lines failed to parse/validate, keep them for the user to inspect.
  if (failed.length > 0) {
    try { fs.writeFileSync(file, failed.join('\n') + '\n', 'utf8'); } catch { /* non-fatal */ }
  } else if (imported === 0) {
    // Nothing imported and nothing failed — treat file as empty/garbage, remove.
    try { fs.unlinkSync(file); } catch { /* non-fatal */ }
  }

  return imported;
}
