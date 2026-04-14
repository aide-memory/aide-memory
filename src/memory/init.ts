import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { AideConfig } from './config';
import { scanProject } from './scan';
import { MemoryStore } from './store';
import type { MemoryLayer } from './types';

export interface InitResult {
  created: string[];
  skipped: string[];
  warnings: string[];
  memoriesGenerated?: number;
}

export interface InitOptions {
  scan?: boolean;
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
  force: boolean
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
      const merged = { ...existing, ...hookConfig };
      fs.writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
      created.push('.claude/settings.json (hooks added)');
    } catch {
      // Malformed JSON — overwrite
      fs.writeFileSync(settingsPath, JSON.stringify(hookConfig, null, 2) + '\n', 'utf8');
      created.push('.claude/settings.json');
    }
  } else {
    fs.writeFileSync(settingsPath, JSON.stringify(hookConfig, null, 2) + '\n', 'utf8');
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
 * Create .aide/config.json with defaults.
 * Uses the existing AideConfig class which auto-loads defaults and saves via set().
 */
function writeConfig(
  projectRoot: string,
  contributor: string,
  force: boolean
): { created: string[]; skipped: string[] } {
  const configPath = path.join(projectRoot, '.aide', 'config.json');

  if (fs.existsSync(configPath) && !force) {
    return { created: [], skipped: ['.aide/config.json'] };
  }

  // AideConfig constructor loads from disk (merging with defaults).
  // When forcing, reset() first to clear any stale keys, then set contributor.
  const config = new AideConfig(projectRoot);
  if (force) {
    config.reset(); // resets to clean defaults and saves
  }
  config.set('contributor', contributor);
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

  // 2.5. Install hook configuration (.claude/settings.json)
  const hooks = writeHookConfig(resolvedRoot, force);
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

  // 5. Install post-checkout hook
  const hook = installPostCheckoutHook(resolvedRoot, force);
  result.created.push(...hook.created);
  result.skipped.push(...hook.skipped);
  result.warnings.push(...hook.warnings);

  // 6. Pre-train scan (optional)
  if (options?.scan) {
    const memories = scanProject(resolvedRoot);
    if (memories.length > 0) {
      const store = new MemoryStore({ projectRoot: resolvedRoot });
      try {
        for (const mem of memories) {
          store.add({
            layer: mem.layer as MemoryLayer,
            what: mem.what,
            scope: mem.scope,
            source: mem.source,
          });
        }
        result.memoriesGenerated = memories.length;
      } finally {
        store.close();
      }
    }
  }

  return result;
}
