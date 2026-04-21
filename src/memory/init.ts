import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { AideConfig } from './config';
import { MemoryStore } from './store';
import { syncIgnoreFile, readHideFromGrep } from './ignoreFile';
import { listPublicDefaults, flatMapToNested } from './settings';

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
 * Generate the Claude Code hook configuration with absolute paths to hook scripts.
 */
function generateHookConfig(packageRoot: string): object {
  const h = (script: string) => `bash ${path.join(packageRoot, 'scripts', 'hooks', script)}`;
  return {
    hooks: {
      SessionStart: [{ hooks: [{ type: 'command', command: h('session-start-clear.sh'), timeout: 10 }] }],
      PreCompact: [{ hooks: [{ type: 'command', command: h('pre-compact-save.sh'), timeout: 30 }] }],
      Stop: [{ hooks: [{ type: 'command', command: h('stop-remember.sh'), timeout: 30 }] }],
      UserPromptSubmit: [{ hooks: [{ type: 'command', command: h('detect-correction.sh'), timeout: 5 }] }],
      PreToolUse: [
        { matcher: 'Read', hooks: [{ type: 'command', command: h('pre-read-recall.sh'), timeout: 10 }] },
        { matcher: 'Edit', hooks: [{ type: 'command', command: h('pre-edit-recall.sh'), timeout: 10 }] },
        { matcher: 'Write', hooks: [{ type: 'command', command: h('pre-edit-recall.sh'), timeout: 10 }] },
        { matcher: 'Grep', hooks: [{ type: 'command', command: h('pre-search-nudge.sh'), timeout: 10 }] },
        { matcher: 'Glob', hooks: [{ type: 'command', command: h('pre-search-nudge.sh'), timeout: 10 }] },
        { matcher: 'mcp__aide-memory__aide_recall', hooks: [{ type: 'command', command: h('track-recall.sh'), timeout: 5 }] },
      ],
      PostToolUse: [
        { matcher: 'mcp__aide-memory__aide_recall', hooks: [{ type: 'command', command: h('track-recall-post.sh'), timeout: 5 }] },
        { matcher: 'mcp__aide-memory__aide_remember', hooks: [{ type: 'command', command: h('track-remember.sh'), timeout: 5 }] },
        { matcher: 'mcp__aide-memory__aide_update', hooks: [{ type: 'command', command: h('track-remember.sh'), timeout: 5 }] },
        { matcher: 'mcp__aide-memory__aide_forget', hooks: [{ type: 'command', command: h('track-remember.sh'), timeout: 5 }] },
        { matcher: 'mcp__aide-memory__aide_search', hooks: [{ type: 'command', command: h('track-search.sh'), timeout: 5 }] },
      ],
    },
  };
}

/**
 * Write .claude/settings.json with hook configuration.
 * If the file already exists and has hooks, merge (don't overwrite user's other settings).
 */
function writeHookConfig(
  projectRoot: string,
  force: boolean,
  stampVersion?: string
): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
  const settingsDir = path.dirname(settingsPath);

  if (!fs.existsSync(settingsDir)) {
    fs.mkdirSync(settingsDir, { recursive: true });
  }

  const packageRoot = getPackageRoot();
  const hookConfig = generateHookConfig(packageRoot);

  if (fs.existsSync(settingsPath) && !force) {
    // Merge: read existing, add hooks if not present
    try {
      const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      if (existing.hooks) {
        skipped.push('.claude/settings.json (hooks already configured)');
        return { created, skipped };
      }
      // No hooks yet — add them
      const merged = { ...existing, ...hookConfig, ...(stampVersion ? { _aideMemoryVersion: stampVersion } : {}) };
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      created.push('.claude/settings.json (hooks added)');
    } catch {
      // Malformed JSON — overwrite
      const stamped = { ...hookConfig, ...(stampVersion ? { _aideMemoryVersion: stampVersion } : {}) };
      fs.writeFileSync(settingsPath, JSON.stringify(stamped, null, 2) + '\n', 'utf8');
      created.push('.claude/settings.json');
    }
  } else if (force && fs.existsSync(settingsPath)) {
    // Force: merge hooks into existing settings, preserving user's other keys
    try {
      const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      const merged = { ...existing, ...hookConfig, ...(stampVersion ? { _aideMemoryVersion: stampVersion } : {}) };
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      created.push('.claude/settings.json (hooks force-updated)');
    } catch {
      const stamped = { ...hookConfig, ...(stampVersion ? { _aideMemoryVersion: stampVersion } : {}) };
      fs.writeFileSync(settingsPath, JSON.stringify(stamped, null, 2) + '\n', 'utf8');
      created.push('.claude/settings.json');
    }
  } else {
    const stamped = { ...hookConfig, ...(stampVersion ? { _aideMemoryVersion: stampVersion } : {}) };
    fs.writeFileSync(settingsPath, JSON.stringify(stamped, null, 2) + '\n', 'utf8');
    created.push('.claude/settings.json');
  }

  return { created, skipped };
}

/**
 * Write .mcp.json with MCP server configuration.
 * This enables aide_recall, aide_remember, etc. tools in Claude Code sessions.
 */
function writeMcpConfig(
  projectRoot: string,
  force: boolean
): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  const mcpPath = path.join(projectRoot, '.mcp.json');
  const packageRoot = getPackageRoot();
  const serverScript = path.join(packageRoot, 'dist', 'memory', 'cli.js');

  const mcpConfig = {
    mcpServers: {
      'aide-memory': {
        command: 'node',
        args: [serverScript, projectRoot],
      },
    },
  };

  if (fs.existsSync(mcpPath) && !force) {
    try {
      const existing = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      if (existing.mcpServers?.['aide-memory']) {
        skipped.push('.mcp.json (aide-memory already configured)');
        return { created, skipped };
      }
      // Merge: add aide-memory to existing servers
      existing.mcpServers = existing.mcpServers || {};
      existing.mcpServers['aide-memory'] = mcpConfig.mcpServers['aide-memory'];
      fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
      created.push('.mcp.json (aide-memory server added)');
    } catch {
      fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
      created.push('.mcp.json');
    }
  } else if (force && fs.existsSync(mcpPath)) {
    // Force: merge aide-memory into existing MCP config, preserving other servers
    try {
      const existing = JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
      existing.mcpServers = existing.mcpServers || {};
      existing.mcpServers['aide-memory'] = mcpConfig.mcpServers['aide-memory'];
      fs.writeFileSync(mcpPath, JSON.stringify(existing, null, 2) + '\n', 'utf8');
      created.push('.mcp.json (aide-memory force-updated)');
    } catch {
      fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
      created.push('.mcp.json');
    }
  } else {
    fs.writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf8');
    created.push('.mcp.json');
  }

  return { created, skipped };
}

const MCP_TOOLS_LIST = `- \`aide_recall\` — retrieve stored context for file paths you're about to work on
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

/**
 * Get the path to the templates directory.
 * Supports both dev (src/) and built (dist/) layouts.
 */
function getTemplatesDir(): string {
  // Try relative to this file: src/memory/init.ts -> src/templates/rules/
  const fromSrc = path.resolve(__dirname, '..', 'templates', 'rules');
  if (fs.existsSync(fromSrc)) return fromSrc;

  // Try dist layout
  const fromDist = path.resolve(__dirname, '..', '..', 'src', 'templates', 'rules');
  if (fs.existsSync(fromDist)) return fromDist;

  throw new Error('Cannot find templates directory');
}

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
 * Write rules files from templates.
 */
function writeRulesFiles(
  projectRoot: string,
  contributor: string,
  force: boolean
): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];
  const templatesDir = getTemplatesDir();

  const vars: Record<string, string> = {
    contributor,
    tools_list: MCP_TOOLS_LIST,
  };

  const rules: Array<{ template: string; dest: string }> = [
    { template: 'claude-code.md', dest: '.claude/rules/aide-memory.md' },
    { template: 'cursor.mdc', dest: '.cursor/rules/aide-memory.mdc' },
  ];

  for (const rule of rules) {
    const destPath = path.join(projectRoot, rule.dest);

    if (fs.existsSync(destPath) && !force) {
      skipped.push(rule.dest);
      continue;
    }

    const templatePath = path.join(templatesDir, rule.template);
    if (!fs.existsSync(templatePath)) {
      continue;
    }

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }

    const content = renderTemplate(templatePath, vars);
    fs.writeFileSync(destPath, content, 'utf8');
    created.push(rule.dest);
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

  const gitDir = path.join(projectRoot, '.git');
  if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
    warnings.push('Not a git repository — skipping post-checkout hook');
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

  // --update-rules mode: only refresh rules files
  if (options?.updateRules) {
    const contributor = detectContributor(resolvedRoot);
    const rules = writeRulesFiles(resolvedRoot, contributor, true); // always overwrite in update-rules mode
    result.created.push(...rules.created);
    result.skipped.push(...rules.skipped);
    return result;
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

  // 2.5. Install hook configuration (.claude/settings.json) with version stamp
  const packageRoot = getPackageRoot();
  let pkgVersion: string | undefined;
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
    pkgVersion = pkg.version;
  } catch { /* non-fatal */ }
  const hooks = writeHookConfig(resolvedRoot, force, pkgVersion);
  result.created.push(...hooks.created);
  result.skipped.push(...hooks.skipped);

  // 2.6. Install MCP server configuration (.mcp.json)
  const mcp = writeMcpConfig(resolvedRoot, force);
  result.created.push(...mcp.created);
  result.skipped.push(...mcp.skipped);

  // 3. Write config
  const config = writeConfig(resolvedRoot, contributor, force);
  result.created.push(...config.created);
  result.skipped.push(...config.skipped);

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

  return result;
}

/**
 * Auto-update hooks, MCP config, and rules files on MCP server start.
 * Checks _aideMemoryVersion in .claude/settings.json — if missing or older
 * than current package version, merges new config preserving user settings.
 * Called from startServer() so updates happen seamlessly without manual init.
 */
export function autoUpdateIfNeeded(projectRoot: string, currentVersion: string): string[] {
  const updated: string[] = [];

  try {
    const settingsPath = path.join(projectRoot, '.claude', 'settings.json');

    // Check version stamp
    let needsUpdate = false;
    if (fs.existsSync(settingsPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const installedVersion = existing._aideMemoryVersion;
        if (!installedVersion || isOlderVersion(installedVersion, currentVersion)) {
          needsUpdate = true;
        }
      } catch {
        needsUpdate = true; // Malformed JSON
      }
    } else {
      needsUpdate = true; // No settings file at all
    }

    if (!needsUpdate) return updated;

    // Update hooks (merge, don't overwrite)
    const packageRoot = getPackageRoot();
    const hookConfig = generateHookConfig(packageRoot);

    if (fs.existsSync(settingsPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        const merged = { ...existing, ...hookConfig, _aideMemoryVersion: currentVersion };
        fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        updated.push('.claude/settings.json (hooks auto-updated)');
      } catch {
        const stamped = { ...hookConfig, _aideMemoryVersion: currentVersion };
        fs.writeFileSync(settingsPath, JSON.stringify(stamped, null, 2) + '\n', 'utf8');
        updated.push('.claude/settings.json (created)');
      }
    } else {
      const settingsDir = path.dirname(settingsPath);
      if (!fs.existsSync(settingsDir)) fs.mkdirSync(settingsDir, { recursive: true });
      const stamped = { ...hookConfig, _aideMemoryVersion: currentVersion };
      fs.writeFileSync(settingsPath, JSON.stringify(stamped, null, 2) + '\n', 'utf8');
      updated.push('.claude/settings.json (created)');
    }

    // Update MCP config (merge, don't overwrite)
    const mcpResult = writeMcpConfig(projectRoot, true);
    updated.push(...mcpResult.created);

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

    // Update .ignore file (hide memories from grep based on config)
    const ignoreResult = updateIgnoreFile(projectRoot);
    updated.push(...ignoreResult.created);

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
