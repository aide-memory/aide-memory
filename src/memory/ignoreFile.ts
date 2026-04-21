/**
 * Manage the project `.ignore` file (read by ripgrep / grep-like tools).
 *
 * aide-memory uses a marker-comment convention so we only touch our own
 * section and never disturb user-added entries:
 *
 *   # BEGIN aide-memory-managed
 *   .aide/memories/
 *   # END aide-memory-managed
 *
 * This module is the single source of truth for reading/writing that section.
 * Both `aide-memory init` and `aide-memory config memories.hideFromGrep <val>`
 * call through here so the on-disk state always matches the current config.
 */

import fs from 'fs';
import path from 'path';

export const IGNORE_BEGIN_MARKER = '# BEGIN aide-memory-managed';
export const IGNORE_END_MARKER = '# END aide-memory-managed';
export const MEMORIES_IGNORE_ENTRY = '.aide/memories/';

export interface SyncIgnoreResult {
  /** Path to the .ignore file (whether or not it was changed). */
  ignorePath: string;
  /** True if the file was written (created, modified, or removed). */
  changed: boolean;
  /** Human-readable description of what happened (for reporter output). */
  message?: string;
}

/**
 * Sync the aide-memory-managed section of `.ignore` to the desired state.
 *
 * - `hideFromGrep === true` → ensure the managed section contains
 *   `.aide/memories/` (adding markers + entry if missing, migrating a legacy
 *   pre-marker entry if found).
 * - `hideFromGrep === false` → strip the managed section entirely (but keep
 *   any other user-added lines intact).
 *
 * Only the text between `BEGIN aide-memory-managed` and `END aide-memory-managed`
 * is ever touched. Lines outside those markers are preserved verbatim.
 */
export function syncIgnoreFile(
  projectRoot: string,
  hideFromGrep: boolean
): SyncIgnoreResult {
  const ignorePath = path.join(projectRoot, '.ignore');
  const existed = fs.existsSync(ignorePath);
  const original = existed ? fs.readFileSync(ignorePath, 'utf8') : '';

  // Strip any legacy (pre-marker) ".aide/memories/" entry that isn't inside
  // a managed block. This prevents duplicate entries after migration and
  // lets us treat the markers as the single source of truth going forward.
  const { withoutManaged, withoutLegacy } = extractSections(original);

  let next: string;
  if (hideFromGrep) {
    const managedBlock = buildManagedBlock();
    next = joinSections(withoutLegacy, managedBlock);
  } else {
    // Disabled: no managed block; also ensure no legacy entry lingers.
    next = withoutManaged === withoutLegacy ? withoutManaged : withoutLegacy;
  }

  if (next === original) {
    return { ignorePath, changed: false };
  }

  // If the file would become empty (or whitespace-only) and we're disabling,
  // remove it rather than leaving behind an empty file.
  if (!hideFromGrep && next.trim().length === 0) {
    if (existed) {
      fs.unlinkSync(ignorePath);
      return {
        ignorePath,
        changed: true,
        message: '.ignore removed (memories.hideFromGrep disabled, no other entries)',
      };
    }
    return { ignorePath, changed: false };
  }

  fs.writeFileSync(ignorePath, next, 'utf8');
  return {
    ignorePath,
    changed: true,
    message: hideFromGrep
      ? (existed ? '.ignore (aide-memory section updated)' : '.ignore (created with .aide/memories/ hidden from grep)')
      : '.ignore (aide-memory section removed)',
  };
}

/**
 * Read the current `memories.hideFromGrep` setting.
 * Defaults to `true` if the config file is missing or unreadable.
 */
export function readHideFromGrep(projectRoot: string): boolean {
  const configPath = path.join(projectRoot, '.aide', 'config.json');
  if (!fs.existsSync(configPath)) return true;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    if (config?.memories?.hideFromGrep === false) return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Build the managed block (markers + entry + trailing newline).
 */
function buildManagedBlock(): string {
  return `${IGNORE_BEGIN_MARKER}\n${MEMORIES_IGNORE_ENTRY}\n${IGNORE_END_MARKER}\n`;
}

/**
 * Split a `.ignore` file into the user-controlled portion (with and without
 * any pre-marker legacy `.aide/memories/` line) and drop any existing managed
 * block. This is what lets us idempotently rewrite just our section.
 *
 * Returns:
 *   - `withoutManaged`: original minus the managed block only (legacy line kept)
 *   - `withoutLegacy`: original minus both the managed block AND any
 *     orphan `.aide/memories/` line (used when we're about to re-emit our own block)
 */
function extractSections(content: string): { withoutManaged: string; withoutLegacy: string } {
  // Strip the managed block first. Match markers on their own lines,
  // consuming any leading blank line to avoid piling up blank lines on resync.
  const managedRegex = new RegExp(
    `(?:^|\\n)[ \\t]*${escapeRegex(IGNORE_BEGIN_MARKER)}[^\\n]*\\n[\\s\\S]*?${escapeRegex(IGNORE_END_MARKER)}[^\\n]*(?:\\n|$)`,
    'g'
  );
  const withoutManaged = content.replace(managedRegex, (match) => {
    // Preserve a single newline if one bounded the block (keeps trailing newline invariants tidy).
    return match.startsWith('\n') ? '\n' : '';
  });

  // Strip a stand-alone legacy `.aide/memories/` entry (not inside a managed block —
  // the managed block is already gone). This handles .ignore files written by older
  // `aide-memory init` versions that didn't yet include the marker convention.
  const withoutLegacy = withoutManaged
    .split('\n')
    .filter((line) => line.trim() !== MEMORIES_IGNORE_ENTRY)
    .join('\n');

  return { withoutManaged, withoutLegacy };
}

/**
 * Append the managed block to user content with exactly one blank line
 * separating them if user content is non-empty. Ensures a trailing newline.
 */
function joinSections(userContent: string, managedBlock: string): string {
  if (userContent.length === 0) {
    return managedBlock;
  }
  const trimmed = userContent.replace(/\n+$/, '');
  if (trimmed.length === 0) {
    return managedBlock;
  }
  return `${trimmed}\n\n${managedBlock}`;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
