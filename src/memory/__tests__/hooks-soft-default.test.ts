/**
 * 0.5.17 hook-defaults unit tests.
 *
 * Covers the soft+visible default behavior + opt-in escalation paths added in
 * 0.5.17 per docs/specs/PHASE_1_HOOK_DEFAULTS_0_5_17.md §6.1. Calls handlers
 * directly (faster than spawning bash), asserts on captured stdout shape +
 * tracking-file side effects.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  detectCorrection,
  stop,
  sessionStart,
} from '../hooks/handlers';
import {
  correctionPendingFile,
  stopCountFile,
  writeStopCount,
  writeCorrectionPending,
} from '../hooks/tracking';

function captureStdout(fn: () => Promise<void> | void): Promise<string> {
  return new Promise(async (resolve) => {
    let buf = '';
    const orig = process.stdout.write;
    (process.stdout as any).write = (chunk: any) => {
      buf += typeof chunk === 'string' ? chunk : chunk.toString();
      return true;
    };
    try {
      await fn();
    } finally {
      process.stdout.write = orig;
    }
    resolve(buf);
  });
}

function makeProject(config: Record<string, unknown> = {}): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-hook-soft-'));
  fs.mkdirSync(path.join(dir, '.aide'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, '.aide', 'config.json'),
    JSON.stringify(config, null, 2),
  );
  return dir;
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    /* best-effort */
  }
}

// ─── UserPromptSubmit (detectCorrection) ────────────────────────────────────

describe('detectCorrection — soft+visible default (0.5.17)', () => {
  let project: string;
  const sid = 'test-correction-soft';

  beforeEach(() => {
    project = makeProject();
  });
  afterEach(() => cleanup(project));

  it('default config: emits soft additionalContext + chrome, NO flag', async () => {
    const out = await captureStdout(() =>
      detectCorrection({
        prompt: "no, don't use that approach — use the new API instead",
        cwd: project,
        session_id: sid,
      }),
    );

    expect(out).not.toBe('');
    const parsed = JSON.parse(out);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      'correction or convention',
    );
    expect(parsed.hookSpecificOutput.additionalContext).toContain(
      'aide_remember',
    );
    expect(parsed.hookSpecificOutput.additionalContext).not.toContain(
      'BEFORE doing anything else',
    );
    expect(parsed.systemMessage).toMatch(/possible correction detected/);
    // Default escalate=off → no flag
    expect(fs.existsSync(correctionPendingFile(project, sid))).toBe(false);
  });

  it('escalate=soft: emits soft + writes flag', async () => {
    fs.writeFileSync(
      path.join(project, '.aide', 'config.json'),
      JSON.stringify({ hooks: { correction: { escalate: 'soft' } } }, null, 2),
    );

    await captureStdout(() =>
      detectCorrection({
        prompt: "no, don't use that — use the new API instead",
        cwd: project,
        session_id: sid,
      }),
    );

    expect(fs.existsSync(correctionPendingFile(project, sid))).toBe(true);
  });

  it('escalate=block: emits soft + writes flag (escalate fires later in Stop)', async () => {
    fs.writeFileSync(
      path.join(project, '.aide', 'config.json'),
      JSON.stringify({ hooks: { correction: { escalate: 'block' } } }, null, 2),
    );

    await captureStdout(() =>
      detectCorrection({
        prompt: "no, don't use that — use the new API instead",
        cwd: project,
        session_id: sid,
      }),
    );

    expect(fs.existsSync(correctionPendingFile(project, sid))).toBe(true);
  });

  it('correction.enabled=false: silent (no emit, no flag)', async () => {
    fs.writeFileSync(
      path.join(project, '.aide', 'config.json'),
      JSON.stringify({ hooks: { correction: { enabled: false } } }, null, 2),
    );

    const out = await captureStdout(() =>
      detectCorrection({
        prompt: "no, don't use that — use the new API instead",
        cwd: project,
        session_id: sid,
      }),
    );

    expect(out).toBe('');
    expect(fs.existsSync(correctionPendingFile(project, sid))).toBe(false);
  });

  it('META_PATTERN: skips when discussing correction system itself', async () => {
    const messages = [
      'why does the correction prompt fire so often',
      'we tightened the correction regex in 0.5.17',
      'the correction-pending flag should not be written',
      'check hooks.correction.escalate config',
    ];
    for (const msg of messages) {
      const out = await captureStdout(() =>
        detectCorrection({ prompt: msg, cwd: project, session_id: sid }),
      );
      expect(out).toBe('');
    }
  });

  it('quoted content: lines starting with quote chars are stripped before match', async () => {
    const out = await captureStdout(() =>
      detectCorrection({
        prompt:
          'I was reading the docs and saw\n"no, don\'t use that approach"\nbut what does that mean?',
        cwd: project,
        session_id: sid,
      }),
    );
    expect(out).toBe('');
  });

  it('fenced code blocks: content inside ``` ... ``` is stripped', async () => {
    const out = await captureStdout(() =>
      detectCorrection({
        prompt:
          'the docs example shows:\n```\nno, don\'t use that approach\n```\njust documenting the example',
        cwd: project,
        session_id: sid,
      }),
    );
    expect(out).toBe('');
  });

  it('inline code: backtick-wrapped content is stripped', async () => {
    const out = await captureStdout(() =>
      detectCorrection({
        prompt:
          'when the docs say `no, don\'t use that approach` it just means a hint',
        cwd: project,
        session_id: sid,
      }),
    );
    expect(out).toBe('');
  });

  it('unquoted real correction still matches after stripping noise', async () => {
    const out = await captureStdout(() =>
      detectCorrection({
        prompt:
          'I was reading\n"some quoted line"\nbut actually, use Map instead of Object here',
        cwd: project,
        session_id: sid,
      }),
    );
    expect(out).not.toBe('');
    const parsed = JSON.parse(out);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
  });
});

// ─── Stop ────────────────────────────────────────────────────────────────────

describe('stop — mode-aware emit (0.5.17)', () => {
  let project: string;
  const sid = 'test-stop-soft';

  beforeEach(() => {
    project = makeProject();
  });
  afterEach(() => cleanup(project));

  // Default mode is now 'block' (Stop hook does not support soft additionalContext
  // per Claude Code platform — see claude-code-protocol.ts).
  it('default mode=block: scheduled fire emits decision:block + reason + chrome', async () => {
    writeStopCount(project, sid, 2); // turn 3 → first scheduled fire

    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );

    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('worth persisting');
    expect(parsed.systemMessage).toMatch(/checkpoint/);
    // Critical: Stop must not use hookSpecificOutput (platform forbids it)
    expect(parsed.hookSpecificOutput).toBeUndefined();
  });

  it('mode=off: scheduled fire emits nothing (silent)', async () => {
    fs.writeFileSync(
      path.join(project, '.aide', 'config.json'),
      JSON.stringify({ hooks: { stop: { mode: 'off' } } }, null, 2),
    );
    writeStopCount(project, sid, 2);

    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );

    expect(out).toBe('');
  });

  it('off-schedule turn: silent regardless of mode', async () => {
    writeStopCount(project, sid, 0); // turn 1 → not a scheduled fire
    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );
    expect(out).toBe('');
  });

  it('stop_hook_active: silent', async () => {
    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project, stop_hook_active: true }),
    );
    expect(out).toBe('');
  });
});

describe('stop — correction-pending precedence (0.5.17 §4.1)', () => {
  let project: string;
  const sid = 'test-stop-pending';

  beforeEach(() => {
    project = makeProject();
  });
  afterEach(() => cleanup(project));

  it('escalate=block + flag: emits decision:block + correction reminder', async () => {
    fs.writeFileSync(
      path.join(project, '.aide', 'config.json'),
      JSON.stringify(
        { hooks: { correction: { escalate: 'block' } } },
        null,
        2,
      ),
    );
    writeCorrectionPending(project, sid, 'correction');

    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );

    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('correction or convention');
    expect(parsed.hookSpecificOutput).toBeUndefined();
    expect(fs.existsSync(correctionPendingFile(project, sid))).toBe(false);
  });

  it('escalate=off + stale flag: clears silently and falls through to scheduled (block default)', async () => {
    // Default config (escalate=off, mode=block). Flag exists from before.
    writeCorrectionPending(project, sid, 'correction');
    writeStopCount(project, sid, 2); // turn 3 → in schedule

    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );

    // Flag cleared regardless of escalate value
    expect(fs.existsSync(correctionPendingFile(project, sid))).toBe(false);
    // Scheduled fire emits the regular checkpoint prompt (block, not correction-pending)
    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('worth persisting');
    expect(parsed.reason).not.toContain('correction or convention');
  });

  it('escalate=block + flag overrides stop.mode=off', async () => {
    fs.writeFileSync(
      path.join(project, '.aide', 'config.json'),
      JSON.stringify(
        { hooks: { correction: { escalate: 'block' }, stop: { mode: 'off' } } },
        null,
        2,
      ),
    );
    writeCorrectionPending(project, sid, 'correction');

    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );

    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe('block');
  });
});

// ─── SessionStart resume handling ───────────────────────────────────────────

describe('sessionStart — resume handling (0.5.17 §2.2)', () => {
  let project: string;
  const sid = 'test-session-resume';

  beforeEach(() => {
    project = makeProject();
  });
  afterEach(() => cleanup(project));

  it('source=resume: silent (no emit) + tracking preserved', async () => {
    // Seed tracking with a known recalled path
    const cacheDir = path.join(project, '.aide', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const pathsFile = path.join(cacheDir, `recalled-paths-${sid}.txt`);
    fs.writeFileSync(pathsFile, 'file|/some/path.ts\nids|1,2,3\n');

    const out = await captureStdout(() =>
      sessionStart({ session_id: sid, cwd: project, source: 'resume' }),
    );

    expect(out).toBe('');
    // Tracking NOT cleared on resume
    expect(fs.existsSync(pathsFile)).toBe(true);
    expect(fs.readFileSync(pathsFile, 'utf8')).toContain('file|/some/path.ts');
  });

  it('source=clear: clears tracking', async () => {
    const cacheDir = path.join(project, '.aide', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const pathsFile = path.join(cacheDir, `recalled-paths-${sid}.txt`);
    fs.writeFileSync(pathsFile, 'file|/some/path.ts\n');

    await captureStdout(() =>
      sessionStart({ session_id: sid, cwd: project, source: 'clear' }),
    );

    expect(fs.existsSync(pathsFile)).toBe(false);
  });

  it('source=compact: clears tracking', async () => {
    const cacheDir = path.join(project, '.aide', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const pathsFile = path.join(cacheDir, `recalled-paths-${sid}.txt`);
    fs.writeFileSync(pathsFile, 'file|/some/path.ts\n');

    await captureStdout(() =>
      sessionStart({ session_id: sid, cwd: project, source: 'compact' }),
    );

    expect(fs.existsSync(pathsFile)).toBe(false);
  });

  it('source=startup: tracking untouched (no clear), no early return', async () => {
    const cacheDir = path.join(project, '.aide', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });
    const pathsFile = path.join(cacheDir, `recalled-paths-${sid}.txt`);
    fs.writeFileSync(pathsFile, 'file|/some/path.ts\n');

    await captureStdout(() =>
      sessionStart({ session_id: sid, cwd: project, source: 'startup' }),
    );

    // startup is the "fresh session" path — no clear semantically needed,
    // and tracking is preserved (no-op on tracking, and any emit depends on
    // memories existing, which the empty test project has none of).
    expect(fs.existsSync(pathsFile)).toBe(true);
  });
});
