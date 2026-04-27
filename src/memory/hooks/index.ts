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
import { debug, isDebugEnabled, loudError } from '../internal/debug';
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
    // Unknown hook event id. We exit 0 (never break the agent) but loudly
    // surface this — silent no-ops on a wrong event name look identical to
    // hooks not firing at all, which has historically caused hours of
    // misdiagnosis (see memory #348).
    loudError(`aide-memory hook: unknown event "${name}"`, 'check .claude/settings.json or .cursor/hooks.json command lines');
    return;
  }
  const t0 = performance.now();
  try {
    const raw = await readJsonStdin();
    const adapter = detectActiveAdapter();
    const input = adapter.translateInput(raw) as typeof raw;
    maybeTriggerDriftResync(input);

    debug(
      'hooks',
      `enter hook=${name} adapter=${adapter.id} cwd=${input.cwd ?? ''} session=${input.session_id ?? ''} file=${(input as any).tool_input?.file_path ?? ''}`,
    );

    // When AIDE_DEBUG=hooks (or legacy AIDE_DEBUG_HOOK=1), wrap stdout so we
    // can report what the handler tried to write. Critical for diagnosing
    // cases where the host editor reports empty OUTPUT but we believe we
    // emitted a response — surfaces our intent independent of whether the
    // host actually consumed stdout.
    if (isDebugEnabled('hooks')) {
      const origWrite = process.stdout.write.bind(process.stdout);
      let captured = '';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (process.stdout.write as any) = (chunk: any, ...args: any[]) => {
        try { captured += typeof chunk === 'string' ? chunk : String(chunk); } catch { /* ignore */ }
        return origWrite(chunk, ...args);
      };
      try {
        await handler(input);
      } finally {
        process.stdout.write = origWrite;
        debug(
          'hooks',
          `exit  hook=${name} duration=${(performance.now() - t0).toFixed(1)}ms stdout-len=${captured.length} stdout-head=${JSON.stringify(captured.slice(0, 200))}`,
        );
      }
    } else {
      await handler(input);
      debug('hooks', `exit  hook=${name} duration=${(performance.now() - t0).toFixed(1)}ms`);
    }
  } catch (err) {
    // Hooks must never break the agent — top-level catch absorbs all throws
    // (per memory #352 calibration). But silent absorption is what made the
    // 0.5.0 binding bug invisible for hours, so EVERY swallowed throw now
    // gets one [AIDE_ERROR] stderr line identifying the failure class. The
    // hook still exits 0; the agent continues.
    const e = err as Error;
    const msg = e?.message ?? String(err);
    if (/NODE_MODULE_VERSION|node-loader|wrong ELF class|invalid ELF header|dlopen/i.test(msg)) {
      loudError(
        `aide-memory hook=${name}: native binding load failed (${msg})`,
        'reinstall aide-memory or run `npm rebuild libsql` in the install dir',
      );
    } else if (/ENOENT|MODULE_NOT_FOUND/i.test(msg)) {
      loudError(
        `aide-memory hook=${name}: missing file/module (${msg})`,
        'reinstall aide-memory — dist/ may be incomplete',
      );
    } else {
      loudError(`aide-memory hook=${name} threw: ${msg}`);
    }
    debug('hooks', `error hook=${name} duration=${(performance.now() - t0).toFixed(1)}ms class=${(e?.name ?? 'Error')}`);
  }
}

export { HANDLERS };
