/**
 * Hook dispatcher — single entry point used by the `aide-memory hook <name>`
 * CLI subcommand. Reads stdin JSON, routes to the handler, swallows any
 * errors silently (hooks must never break the agent).
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { readJsonStdin } from './stdio';
import {
  detectCorrection,
  preCompact,
  preEdit,
  preRead,
  preSearch,
  sessionStart,
  stop,
  trackRecall,
  trackRecallPost,
  trackRemember,
  trackSearch,
} from './handlers';

/**
 * Mid-session drift check for derived artifacts (currently `.ignore` driven
 * by `memories.hideFromGrep`). If the user edits `.aide/config.json` directly
 * — bypassing the `aide-memory config` CLI — that write isn't seen by the
 * running MCP session. But every hook fire is a chance to compare the config
 * file's mtime against the last value we cached, and re-sync derived
 * artifacts if drift is detected. The resync call is fire-and-forget so the
 * hook exits fast.
 *
 * This is the TS port of the bash `_aide_drift_check` that lived in the
 * old `scripts/hooks/read-config.sh` before the minified-publish migration
 * collapsed the hooks into bundled CLI subcommands. The user-facing promise
 * in `docs/user/cli-reference.md` ("next hook fire picks it up") depends on
 * this running on every hook.
 */
function maybeTriggerDriftResync(input: { cwd?: string }): void {
  try {
    const projectRoot = input.cwd;
    if (!projectRoot) return;

    const configFile = path.join(projectRoot, '.aide', 'config.json');
    const mtimeCache = path.join(projectRoot, '.aide', 'cache', 'config-mtime.txt');
    if (!fs.existsSync(configFile)) return;

    const curMtime = String(fs.statSync(configFile).mtimeMs);
    let cachedMtime = '';
    try { cachedMtime = fs.readFileSync(mtimeCache, 'utf8').trim(); } catch { /* no cache yet */ }

    if (curMtime === cachedMtime) return;

    // Write the new mtime first so concurrent hook fires don't all spawn
    // parallel resyncs.
    fs.mkdirSync(path.dirname(mtimeCache), { recursive: true });
    fs.writeFileSync(mtimeCache, curMtime, 'utf8');

    // Spawn a DETACHED + UNREFED child to actually do the resync. An in-
    // process `import().then()` would keep the Node event loop alive until
    // the resync completed — blowing pre-compact / post-tool-use latency
    // budgets. Spawn + detach + unref + stdio:ignore is true fire-and-
    // forget: this hook process can exit immediately, the child keeps
    // running independently.
    try {
      const cliEntry = path.resolve(__dirname, '..', '..', 'cli', 'aide-memory.js');
      const child = spawn(process.execPath, [cliEntry, 'internal-resync', projectRoot], {
        detached: true,
        stdio: 'ignore',
        cwd: projectRoot,
      });
      child.unref();
    } catch {
      // Spawn failure is non-fatal — next hook fire will retry since we
      // already updated the mtime cache. Worst case: user runs `aide-memory
      // config` to trigger resync via the CLI path instead.
    }
  } catch {
    // Drift check must NEVER break a hook.
  }
}

export type HookName =
  | 'pre-read'
  | 'pre-edit'
  | 'pre-search'
  | 'pre-prompt'
  | 'post-tool-use-recall'
  | 'stop'
  | 'pre-compact'
  | 'session-start'
  | 'pre-recall'
  | 'post-remember'
  | 'post-search';

// Map of hook name → handler.
const HANDLERS: Record<HookName, (input: any) => Promise<void>> = {
  'pre-read': preRead,
  'pre-edit': preEdit,
  'pre-search': preSearch,
  'pre-prompt': detectCorrection,
  'post-tool-use-recall': trackRecallPost,
  'stop': stop,
  'pre-compact': preCompact,
  'session-start': sessionStart,
  'pre-recall': trackRecall,
  'post-remember': trackRemember,
  'post-search': trackSearch,
};

export async function dispatch(name: string): Promise<void> {
  const handler = (HANDLERS as any)[name];
  if (!handler) {
    // Unknown hook — silently exit 0 rather than crash the agent.
    return;
  }
  try {
    const input = await readJsonStdin();
    // Drift-repair runs on every hook fire (see maybeTriggerDriftResync
    // doc for why). It's fire-and-forget and catches its own errors.
    maybeTriggerDriftResync(input);
    await handler(input);
  } catch {
    // Never break the agent on hook errors.
  }
}

export { HANDLERS };
