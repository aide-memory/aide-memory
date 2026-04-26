/**
 * buildRules — render an editor's rule file from the shared body + adapter
 * per-editor content.
 *
 * Architecture (post-C1.5c):
 *   - Canonical content lives in src/templates/rules/shared/body.md.
 *   - Each adapter carries ruleFrontmatter (string), ruleNotes (string), and
 *     ruleToolId (string) fields in src/memory/editors/<editor>.ts.
 *   - buildRules concatenates frontmatter + body, then substitutes
 *     {{contributor}}, {{tools_list}}, {{tool_id}}, and {{editor_notes}}.
 *
 * Prior architecture: 5 parallel `<editor>.md` / `<editor>.mdc` template
 * files with hand-written near-duplicate content. Collapsed to remove drift
 * risk (codex/copilot/windsurf.md previously had a wrong claim about
 * aide_forget supporting "archive" mode — the shared body fixes that for
 * free).
 *
 * Output change scope vs pre-C1.5c: claude-code.md rendered output is
 * byte-identical (shared body == prior claude-code.md verbatim +
 * {{tool_id}} parameterization). cursor.mdc's rendered output gets
 * longer — inherits the full body instead of its prior shorter hand-written
 * version. Benign: Cursor agents get more detail, no Cursor-specific
 * content is lost (frontmatter + agent_message note preserved via adapter
 * fields).
 */

import * as fs from 'fs';
import * as path from 'path';
import { EditorAdapter } from './types';

/**
 * Variables substituted into the rendered rule content. `tools_list` +
 * `contributor` are project-level (from init.ts). `tool_id` + `editor_notes`
 * come from the adapter. All use the existing {{var}} regex-replace pattern.
 */
export interface RuleRenderVars {
  contributor: string;
  tools_list: string;
}

/**
 * Locate src/templates/rules/ regardless of dev vs dist layout. Mirrors the
 * `getTemplatesDir()` logic in init.ts — kept duplicated here to avoid a
 * circular import between init.ts and editors/rules.ts.
 */
function resolveTemplatesDir(): string {
  const fromSrc = path.resolve(__dirname, '..', '..', 'templates', 'rules');
  if (fs.existsSync(fromSrc)) return fromSrc;
  const fromDist = path.resolve(__dirname, '..', '..', '..', 'src', 'templates', 'rules');
  if (fs.existsSync(fromDist)) return fromDist;
  throw new Error('Cannot find templates directory (looked at ' + fromSrc + ' and ' + fromDist + ')');
}

/**
 * Load the shared rule body. Cached across calls within a single process —
 * buildRules is called once per adapter per init.
 */
let cachedBody: string | null = null;
function loadSharedBody(): string {
  if (cachedBody !== null) return cachedBody;
  const bodyPath = path.join(resolveTemplatesDir(), 'shared', 'body.md');
  cachedBody = fs.readFileSync(bodyPath, 'utf8');
  return cachedBody;
}

/**
 * Expose a reset hook so tests that stub the filesystem can clear the cache
 * between cases. Not exported in production usage.
 */
export function _resetBodyCache(): void {
  cachedBody = null;
}

/**
 * Apply {{var}} substitutions. Matches the semantics of init.ts
 * renderTemplate() so outputs stay consistent across code paths.
 */
function substituteVars(content: string, vars: Record<string, string>): string {
  let result = content;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value);
  }
  return result;
}

/**
 * Render an adapter's rule file. Returns the full content as a string —
 * writing to disk is the caller's responsibility (init.ts handles that +
 * merging semantics).
 */
export function buildRules(adapter: EditorAdapter, vars: RuleRenderVars): string {
  const body = loadSharedBody();
  const composed = adapter.ruleFrontmatter + body;
  return substituteVars(composed, {
    contributor: vars.contributor,
    tools_list: vars.tools_list,
    tool_id: adapter.ruleToolId,
    editor_notes: adapter.ruleNotes,
  });
}
