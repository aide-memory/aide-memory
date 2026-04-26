/**
 * Hook dispatcher — single entry point used by the `aide-memory hook <name>`
 * CLI subcommand. Reads stdin JSON, routes to the handler, swallows any
 * errors silently (hooks must never break the agent).
 */

import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { readJsonStdin } from './stdio';
import { detectActiveAdapter } from '../editors';
import type { HookEventId } from './events';
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
      // Resolve the CLI entry robustly in BOTH build outputs:
      //   - tsc output: handlers.js at dist/memory/hooks/ → __dirname/../../cli/aide-memory.js
      //   - bundled output: the caller IS dist/cli/aide-memory.js, so process.argv[1] points there
      // Prefer process.argv[1] when it looks like an aide-memory CLI entry;
      // fall back to the __dirname calculation for tsc-direct contexts.
      let cliEntry = process.argv[1] && /aide-memory(?:\.js)?$/.test(process.argv[1])
        ? process.argv[1]
        : path.resolve(__dirname, '..', '..', 'cli', 'aide-memory.js');
      if (!fs.existsSync(cliEntry)) {
        // Last-ditch fallback — try the other layout.
        const alt = path.resolve(__dirname, '..', '..', 'cli', 'aide-memory.js');
        if (fs.existsSync(alt)) cliEntry = alt;
      }
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

// HookName is now an alias for HookEventId — the two types enumerated the
// same 11 strings before Phase C6. Sourcing from the manifest file means
// adding a new hook event is a one-place change (events.ts HOOK_EVENTS +
// HookEventId union) and the dispatcher HANDLERS table below naturally
// requires the new key via the Record<HookEventId, ...> type constraint.
export type HookName = HookEventId;

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
    const raw = await readJsonStdin();
    // Phase C3: detect which editor fired the hook via env vars, then run
    // the raw stdin envelope through that adapter's translateInput. Claude
    // Code's adapter is identity, so pre-C3 behavior is preserved byte-for-
    // byte. Cursor's adapter remaps conversation_id → session_id etc. so
    // handlers can stay editor-agnostic.
    const adapter = detectActiveAdapter();
    const input = adapter.translateInput(raw) as typeof raw;
    // Drift-repair runs on every hook fire (see maybeTriggerDriftResync
    // doc for why). It's fire-and-forget and catches its own errors. Runs
    // against the TRANSLATED input so `cwd` is populated regardless of
    // editor envelope shape.
    maybeTriggerDriftResync(input);
    await handler(input);
  } catch {
    // Never break the agent on hook errors.
  }
}

export { HANDLERS };
