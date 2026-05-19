/**
 * Claude Code hook output protocol conformance.
 *
 * Drives every handler with a representative input + every config combo
 * the handler branches on, captures stdout, parses JSON, and validates each
 * emit against the schema constants in src/memory/hooks/claude-code-protocol.ts.
 *
 * This is the test layer that catches "we emitted output Claude Code rejects"
 * BEFORE a user runs the candidate against `claude --debug`. Specifically
 * the class of bug 0.5.17's first attempt hit: emitting
 * `hookSpecificOutput.hookEventName: "Stop"` from the Stop handler, which
 * Claude Code's schema does not allow.
 *
 * If a handler's output fails any assertion here, fix the handler — do NOT
 * relax the schema constants without first reconciling with the official
 * docs (https://code.claude.com/docs/en/hooks) and bumping LAST_VERIFIED.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  detectCorrection,
  stop,
  sessionStart,
  preRead,
  preEdit,
} from '../hooks/handlers';
import {
  writeStopCount,
  writeCorrectionPending,
} from '../hooks/tracking';
import {
  HOOK_PROTOCOL,
  HookEventName,
  validateHookOutput,
} from '../hooks/claude-code-protocol';

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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-protocol-'));
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

function parseOutput(out: string): unknown {
  if (!out.trim()) return null;
  return JSON.parse(out);
}

function expectConformant(event: HookEventName, out: string): void {
  const parsed = parseOutput(out);
  const violations = validateHookOutput(event, parsed);
  if (violations.length > 0) {
    const detail = violations
      .map((v) => `  - ${v.field}: ${v.reason}`)
      .join('\n');
    throw new Error(
      `Protocol violation on ${event}:\n${detail}\n\nRaw output:\n${out}`,
    );
  }
  expect(violations).toEqual([]);
}

// ─── Stop ────────────────────────────────────────────────────────────────────

describe('protocol conformance: Stop handler', () => {
  let project: string;
  const sid = 'protocol-stop';

  afterEach(() => {
    if (project) cleanup(project);
  });

  it('default config (mode=block scheduled fire) emits Stop-conformant output', async () => {
    project = makeProject();
    writeStopCount(project, sid, 2); // turn 3 hits the schedule
    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );
    expectConformant('Stop', out);
    // Should be a block decision, not hookSpecificOutput
    const parsed = parseOutput(out) as Record<string, unknown>;
    expect(parsed.decision).toBe('block');
    expect(parsed.hookSpecificOutput).toBeUndefined();
  });

  it('stop.mode=off → silent (still conformant)', async () => {
    project = makeProject({ hooks: { stop: { mode: 'off' } } });
    writeStopCount(project, sid, 2);
    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );
    expect(out).toBe('');
    expectConformant('Stop', out);
  });

  it('escalate=block + correction-pending → Stop block emit conformant', async () => {
    project = makeProject({ hooks: { correction: { escalate: 'block' } } });
    writeCorrectionPending(project, sid, 'correction');
    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );
    expectConformant('Stop', out);
    const parsed = parseOutput(out) as Record<string, unknown>;
    expect(parsed.decision).toBe('block');
    expect(parsed.hookSpecificOutput).toBeUndefined();
  });

  it('off-schedule turn → silent (still conformant)', async () => {
    project = makeProject();
    writeStopCount(project, sid, 0); // turn 1, not in schedule
    const out = await captureStdout(() =>
      stop({ session_id: sid, cwd: project }),
    );
    expect(out).toBe('');
    expectConformant('Stop', out);
  });

  it('NEVER emits hookSpecificOutput on Stop (regression guard)', async () => {
    // Drive every reachable Stop emit path, assert none use hookSpecificOutput.
    const cases = [
      { config: {}, count: 2, flag: false, label: 'default scheduled' },
      {
        config: { hooks: { stop: { mode: 'off' } } },
        count: 2,
        flag: false,
        label: 'mode=off',
      },
      {
        config: { hooks: { correction: { escalate: 'block' } } },
        count: 0,
        flag: true,
        label: 'escalate=block + flag',
      },
    ];
    for (const c of cases) {
      project = makeProject(c.config as any);
      writeStopCount(project, sid, c.count);
      if (c.flag) writeCorrectionPending(project, sid, 'correction');
      const out = await captureStdout(() =>
        stop({ session_id: sid, cwd: project }),
      );
      const parsed = parseOutput(out);
      if (parsed && typeof parsed === 'object') {
        expect(
          (parsed as Record<string, unknown>).hookSpecificOutput,
          `case "${c.label}" emitted hookSpecificOutput on Stop`,
        ).toBeUndefined();
      }
      expectConformant('Stop', out);
      cleanup(project);
    }
  });
});

// ─── UserPromptSubmit ────────────────────────────────────────────────────────

describe('protocol conformance: UserPromptSubmit handler', () => {
  let project: string;
  const sid = 'protocol-prompt';

  beforeEach(() => {
    project = makeProject();
  });
  afterEach(() => cleanup(project));

  it('correction match → conformant additionalContext + UserPromptSubmit hookEventName', async () => {
    const out = await captureStdout(() =>
      detectCorrection({
        prompt: "no, don't use that approach — use the new API instead",
        cwd: project,
        session_id: sid,
      }),
    );
    expectConformant('UserPromptSubmit', out);
    const parsed = parseOutput(out) as Record<string, unknown>;
    const hso = parsed.hookSpecificOutput as Record<string, unknown>;
    expect(hso.hookEventName).toBe('UserPromptSubmit');
    expect(typeof hso.additionalContext).toBe('string');
  });

  it('non-match → silent (conformant)', async () => {
    const out = await captureStdout(() =>
      detectCorrection({
        prompt: 'help me write a function that does X',
        cwd: project,
        session_id: sid,
      }),
    );
    expect(out).toBe('');
    expectConformant('UserPromptSubmit', out);
  });
});

// ─── SessionStart ────────────────────────────────────────────────────────────

describe('protocol conformance: SessionStart handler', () => {
  let project: string;
  const sid = 'protocol-session';

  beforeEach(() => {
    project = makeProject();
  });
  afterEach(() => cleanup(project));

  it('source=resume → silent (conformant)', async () => {
    const out = await captureStdout(() =>
      sessionStart({ session_id: sid, cwd: project, source: 'resume' }),
    );
    expect(out).toBe('');
    expectConformant('SessionStart', out);
  });

  it('source=startup with no memories → silent or conformant additionalContext', async () => {
    const out = await captureStdout(() =>
      sessionStart({ session_id: sid, cwd: project, source: 'startup' }),
    );
    // Empty project may emit nothing or a version-update notice; either is fine
    // as long as the shape is correct.
    expectConformant('SessionStart', out);
    if (out.trim()) {
      const parsed = parseOutput(out) as Record<string, unknown>;
      const hso = parsed.hookSpecificOutput as Record<string, unknown>;
      expect(hso.hookEventName).toBe('SessionStart');
    }
  });
});

// ─── PreToolUse:Read / Edit ─────────────────────────────────────────────────

describe('protocol conformance: PreToolUse handlers', () => {
  let project: string;
  const sid = 'protocol-pretool';

  beforeEach(() => {
    project = makeProject();
  });
  afterEach(() => cleanup(project));

  it('preRead with no memories matched → silent (conformant)', async () => {
    const fakeFile = path.join(project, 'noop.ts');
    fs.writeFileSync(fakeFile, '// noop');
    const out = await captureStdout(() =>
      preRead({
        session_id: sid,
        cwd: project,
        tool_input: { file_path: fakeFile },
      }),
    );
    // Empty project, no memories → silent
    expect(out).toBe('');
    expectConformant('PreToolUse', out);
  });

  it('preEdit with no memories matched → silent (conformant)', async () => {
    const fakeFile = path.join(project, 'noop.ts');
    fs.writeFileSync(fakeFile, '// noop');
    const out = await captureStdout(() =>
      preEdit({
        session_id: sid,
        cwd: project,
        tool_input: { file_path: fakeFile },
      }),
    );
    expect(out).toBe('');
    expectConformant('PreToolUse', out);
  });
});

// ─── Schema sanity ───────────────────────────────────────────────────────────

describe('claude-code-protocol schema sanity', () => {
  it('every event in the type union has a protocol entry', () => {
    const events: HookEventName[] = [
      'PreToolUse',
      'PostToolUse',
      'PostToolBatch',
      'UserPromptSubmit',
      'SessionStart',
      'Stop',
      'PreCompact',
    ];
    for (const ev of events) {
      expect(HOOK_PROTOCOL[ev]).toBeDefined();
      expect(Array.isArray(HOOK_PROTOCOL[ev].allowedTopLevel)).toBe(true);
    }
  });

  it('Stop forbids hookSpecificOutput (regression guard for the 0.5.17-attempt-1 bug)', () => {
    expect(HOOK_PROTOCOL.Stop.forbiddenTopLevel).toContain('hookSpecificOutput');
    expect(HOOK_PROTOCOL.Stop.hookSpecificOutput).toBeUndefined();
  });

  it('UserPromptSubmit allows additionalContext under hookSpecificOutput', () => {
    expect(HOOK_PROTOCOL.UserPromptSubmit.hookSpecificOutput).toBeDefined();
    expect(
      HOOK_PROTOCOL.UserPromptSubmit.hookSpecificOutput?.allowedFields,
    ).toContain('additionalContext');
  });

  it('validateHookOutput catches the exact bug 0.5.17-attempt-1 shipped', () => {
    // The output handlers.ts produced before the platform-limit fix
    const buggy = {
      hookSpecificOutput: {
        hookEventName: 'Stop',
        additionalContext: 'Anything from this turn worth persisting?',
      },
      systemMessage: 'aide-memory · checkpoint',
    };
    const violations = validateHookOutput('Stop', buggy);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.field === 'hookSpecificOutput')).toBe(true);
  });
});
