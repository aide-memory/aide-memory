/**
 * Stdin/stdout helpers shared by all hook handlers.
 *
 * Claude Code hooks protocol: Claude Code pipes a JSON blob into the hook
 * process stdin, reads the hook process stdout to learn what additional
 * context to inject, and inspects exit code + stdout shape to decide between
 * "silent", "soft additional-context", and "block" outcomes.
 */

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

/**
 * Emit an additionalContext (soft) output and exit 0.
 * Use for PreToolUse / UserPromptSubmit / SessionStart-style nudges.
 */
export function emitAdditionalContext(
  eventName:
    | 'PreToolUse'
    | 'PostToolUse'
    | 'UserPromptSubmit'
    | 'SessionStart'
    | 'Stop'
    | 'PreCompact',
  text: string,
): void {
  const payload = {
    hookSpecificOutput: {
      hookEventName: eventName,
      additionalContext: text,
    },
  };
  process.stdout.write(JSON.stringify(payload, null, 2));
}

/**
 * Emit a block decision (hard stop) and exit 0 — Claude Code reads the
 * JSON payload, not the process exit code, for block decisions.
 */
export function emitBlockDecision(reason: string): void {
  const payload = { decision: 'block', reason };
  process.stdout.write(JSON.stringify(payload, null, 2));
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
