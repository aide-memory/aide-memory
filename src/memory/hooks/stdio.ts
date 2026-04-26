/**
 * Stdin/stdout helpers shared by all hook handlers.
 *
 * Claude Code hooks protocol: Claude Code pipes a JSON blob into the hook
 * process stdin, reads the hook process stdout to learn what additional
 * context to inject, and inspects exit code + stdout shape to decide between
 * "silent", "soft additional-context", and "block" outcomes.
 *
 * User-facing visibility (Apr 2026): hook JSON also supports a top-level
 * `systemMessage` field that Claude Code renders to the USER (not to the
 * model) as an informational line. We use it to surface aide-memory activity
 * that would otherwise be invisible (soft recalls, correction detection,
 * session-start injection, etc). The message is gated by the `hooks.visible`
 * setting — callers pass `userMessage: undefined` when the config says silent.
 *
 * NOTE: the PreToolUse "hook returned blocking error" label in the TUI is
 * hardcoded in Claude Code and cannot be customized by any JSON field we emit
 * (confirmed via binary decompile — see aide-memory mem #310). For hard-block
 * paths we still emit `systemMessage` as user-facing reassurance alongside
 * the platform-rendered label, without changing the `reason` text that the
 * model consumes.
 *
 * Phase C3 (2026-04-23): emit helpers now route through the active editor
 * adapter's `translateOutput()`. Claude Code is the canonical shape — its
 * adapter produces byte-identical output to the pre-C3 hardcoded JSON.
 * Cursor's adapter remaps block → `{permission: "deny", user_message}` and
 * silences additionalContext/systemMessage emits (no channel in Cursor).
 * Unsupported emits become no-ops rather than errors — aide-memory must
 * never break a hook execution because of output-shape differences.
 */

import { detectActiveAdapter } from '../editors';
import { HookEmit } from '../editors/types';

export async function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (data += chunk));
    process.stdin.on('end', () => resolve(data));
    // If stdin is a TTY (no input piped), resolve immediately with empty string.
    if (process.stdin.isTTY) resolve('');
  });
}

export async function readJsonStdin<T = any>(): Promise<T> {
  const raw = await readStdin();
  if (!raw || !raw.trim()) return {} as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return {} as T;
  }
}

type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'Stop'
  | 'PreCompact';

/**
 * Core emit — translates a canonical HookEmit descriptor through the active
 * adapter and writes the result to stdout. Returns nothing (handlers return
 * after calling an emit helper). Empty string from translateOutput → no
 * stdout write (silent).
 */
function emit(descriptor: HookEmit): void {
  const adapter = detectActiveAdapter();
  const out = adapter.translateOutput(descriptor);
  if (out) process.stdout.write(out);
}

/**
 * Emit an additionalContext (soft) output and exit 0.
 * Use for PreToolUse / UserPromptSubmit / SessionStart-style nudges.
 *
 * @param eventName - Claude Code hook event name (for the hookSpecificOutput
 *   wrapper; Cursor's adapter ignores this since it has no equivalent channel)
 * @param text - additionalContext payload (shown to the model, not the user)
 * @param userMessage - optional user-facing systemMessage line (caller gates
 *   on `hooks.visible` config; pass `undefined` when visibility is disabled)
 */
export function emitAdditionalContext(
  eventName: HookEventName,
  text: string,
  userMessage?: string,
): void {
  emit({ kind: 'additionalContext', event: eventName, context: text, systemMessage: userMessage });
}

/**
 * Emit a block decision (hard stop) and exit 0 — Claude Code reads the
 * JSON payload, not the process exit code, for block decisions. Cursor's
 * adapter translates this to different shapes depending on which hook
 * event fired the block:
 *   - preToolUse (default) → `{permission: "deny", user_message}`
 *   - stop                 → `{followup_message}` (Cursor reprompt channel)
 *   - userPromptSubmit     → `{continue: false, user_message}`
 *
 * @param reason - block reason (shown to the model AND the user — do NOT
 *   change wording for UX reasons; change userMessage instead)
 * @param userMessage - optional user-facing systemMessage line for
 *   reassurance alongside the platform-rendered "blocking error" label
 *   (caller gates on `hooks.visible` config; Cursor ignores this)
 * @param event - source hook type. Defaults to 'preToolUse' for back-compat
 *   with pre-C5 emit sites. Stop handler passes 'stop' so Cursor gets the
 *   followup_message reprompt shape instead of a preToolUse deny.
 */
export function emitBlockDecision(
  reason: string,
  userMessage?: string,
  event?: 'preToolUse' | 'stop' | 'userPromptSubmit',
): void {
  emit({ kind: 'block', reason, systemMessage: userMessage, event });
}

/**
 * Silent success — no stdout, no exit code change. Caller should just return.
 */
export function silent(): void {
  // no-op
}

/**
 * Swallow any handler error and exit 0 silently. Hooks must never break the
 * agent — if aide-memory's state is corrupt, the hook should no-op, not fail.
 */
export function safeExit(code = 0): never {
  process.exit(code);
}
