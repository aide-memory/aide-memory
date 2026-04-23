/**
 * Tests for the hook-visibility feature (Apr 2026 fast-follow).
 *
 * Covers the stdio.ts helper contract — systemMessage is emitted when
 * userMessage is truthy, omitted when undefined. The caller is responsible
 * for reading `hooks.visible` config and passing undefined when visibility
 * is disabled; these tests verify the lower-level mechanism.
 *
 * End-to-end hook-firing tests live in hooks.test.ts and continue to pass
 * unchanged — this file focuses on the new contract.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  emitAdditionalContext,
  emitBlockDecision,
} from '../hooks/stdio';
import {
  appendRecalledPath,
  appendRecalledScope,
  hasRecalledFile,
} from '../hooks/tracking';

function captureStdout(fn: () => void): string {
  let buf = '';
  const orig = process.stdout.write;
  (process.stdout as any).write = (chunk: any) => {
    buf += typeof chunk === 'string' ? chunk : chunk.toString();
    return true;
  };
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return buf;
}

describe('stdio.emitAdditionalContext — systemMessage gating', () => {
  it('omits systemMessage when userMessage is undefined', () => {
    const out = captureStdout(() => {
      emitAdditionalContext('PreToolUse', 'context for claude');
    });
    const parsed = JSON.parse(out);
    expect(parsed.hookSpecificOutput.additionalContext).toBe('context for claude');
    expect(parsed.systemMessage).toBeUndefined();
  });

  it('includes systemMessage when userMessage is provided', () => {
    const out = captureStdout(() => {
      emitAdditionalContext(
        'PreToolUse',
        'context for claude',
        'aide-memory · prompting aide_recall for scoped memories',
      );
    });
    const parsed = JSON.parse(out);
    expect(parsed.hookSpecificOutput.additionalContext).toBe('context for claude');
    expect(parsed.systemMessage).toBe(
      'aide-memory · prompting aide_recall for scoped memories',
    );
  });

  it('omits systemMessage when userMessage is empty string', () => {
    // Empty string is falsy — should NOT emit an empty systemMessage
    const out = captureStdout(() => {
      emitAdditionalContext('PreToolUse', 'context', '');
    });
    const parsed = JSON.parse(out);
    expect(parsed.systemMessage).toBeUndefined();
  });

  it('preserves hookEventName in payload', () => {
    const out = captureStdout(() => {
      emitAdditionalContext('Stop', 'text', 'msg');
    });
    const parsed = JSON.parse(out);
    expect(parsed.hookSpecificOutput.hookEventName).toBe('Stop');
  });

  it('accepts all supported event names', () => {
    const events = [
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'SessionStart',
      'Stop',
      'PreCompact',
    ] as const;
    for (const ev of events) {
      const out = captureStdout(() => emitAdditionalContext(ev, 'ctx', 'msg'));
      const parsed = JSON.parse(out);
      expect(parsed.hookSpecificOutput.hookEventName).toBe(ev);
    }
  });
});

describe('stdio.emitBlockDecision — systemMessage gating', () => {
  it('emits decision:block with reason and no systemMessage when userMessage omitted', () => {
    const out = captureStdout(() => {
      emitBlockDecision('call aide_recall({ids:[1,2,3]})');
    });
    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe('call aide_recall({ids:[1,2,3]})');
    expect(parsed.systemMessage).toBeUndefined();
  });

  it('emits systemMessage alongside reason when userMessage provided', () => {
    const out = captureStdout(() => {
      emitBlockDecision(
        'call aide_recall({ids:[1,2,3]})',
        'aide-memory · prompting aide_recall for scoped memories (expected flow)',
      );
    });
    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe('call aide_recall({ids:[1,2,3]})');
    expect(parsed.systemMessage).toBe(
      'aide-memory · prompting aide_recall for scoped memories (expected flow)',
    );
  });

  it('omits systemMessage when userMessage is empty', () => {
    const out = captureStdout(() => {
      emitBlockDecision('reason text', '');
    });
    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe('reason text');
    expect(parsed.systemMessage).toBeUndefined();
  });

  it('reason stays untouched — independent channel from systemMessage', () => {
    // Contract: reason is agent-facing, systemMessage is user-facing.
    // They must not mutate each other.
    const agentReason = 'agent-facing instruction with aide_remember and aide_update';
    const userMsg = 'aide-memory · user-facing reassurance';
    const out = captureStdout(() => emitBlockDecision(agentReason, userMsg));
    const parsed = JSON.parse(out);
    expect(parsed.reason).toBe(agentReason);
    expect(parsed.systemMessage).toBe(userMsg);
    expect(parsed.reason).not.toContain('user-facing');
    expect(parsed.systemMessage).not.toContain('agent-facing');
  });
});

describe('defaults.json — hooks.visible', () => {
  it('is defined with default value true', () => {
    // Import at runtime so we pick up the JSON as bundled.
    const defaults = require('../../../scripts/hooks/defaults.json');
    expect(defaults['hooks.visible']).toBeDefined();
    expect(defaults['hooks.visible'].value).toBe(true);
    expect(defaults['hooks.visible'].public).toBe(true);
    expect(typeof defaults['hooks.visible'].description).toBe('string');
    expect(defaults['hooks.visible'].description.length).toBeGreaterThan(30);
  });
});

describe('hasRecalledFile — scope-level encountered (Apr 23 2026 fix)', () => {
  let tempDir: string;
  const sessionId = 'scope-test';

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-scope-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false for a file with no tracking', () => {
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/api/routes.ts`)).toBe(false);
  });

  it('returns true for an exact file|<abs> match (pre-existing behavior)', () => {
    appendRecalledPath(tempDir, sessionId, 'file', `${tempDir}/src/api/routes.ts`);
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/api/routes.ts`)).toBe(true);
  });

  it('returns true for a sibling file in a recalled src/api/** scope', () => {
    // Recall memories for src/api/**, track scope only — never touched orders.ts directly
    appendRecalledScope(tempDir, sessionId, 'src/api/**');
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/api/orders.ts`)).toBe(true);
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/api/v2/users.ts`)).toBe(true);
  });

  it('returns false for a file outside the recalled scope', () => {
    appendRecalledScope(tempDir, sessionId, 'src/api/**');
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/auth/token.ts`)).toBe(false);
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/index.ts`)).toBe(false);
  });

  it('src/api/* (single-star) matches only immediate children', () => {
    appendRecalledScope(tempDir, sessionId, 'src/api/*');
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/api/routes.ts`)).toBe(true);
    // Deeper path doesn't match /* pattern
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/api/v2/users.ts`)).toBe(false);
  });

  it('filters project-wide null / "project" scope — never marks files encountered', () => {
    appendRecalledScope(tempDir, sessionId, null as any);
    appendRecalledScope(tempDir, sessionId, 'project');
    // Neither should have been written — tracking file should still be empty or have no scope lines
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/anything.ts`)).toBe(false);
  });

  it('exact-path scope (specific file, no glob) only matches that exact file', () => {
    appendRecalledScope(tempDir, sessionId, 'src/api/routes.ts');
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/api/routes.ts`)).toBe(true);
    expect(hasRecalledFile(tempDir, sessionId, `${tempDir}/src/api/orders.ts`)).toBe(false);
  });

  it('dedupes identical scope entries', () => {
    appendRecalledScope(tempDir, sessionId, 'src/api/**');
    appendRecalledScope(tempDir, sessionId, 'src/api/**');
    appendRecalledScope(tempDir, sessionId, 'src/api/**');
    const trackingPath = path.join(tempDir, '.aide', 'cache', `recalled-paths-${sessionId}.txt`);
    const content = fs.readFileSync(trackingPath, 'utf8');
    const scopeLines = content.split('\n').filter((l) => l === 'scope|src/api/**');
    expect(scopeLines.length).toBe(1);
  });
});

describe('message wording — drift protection', () => {
  // Spot-check that the agreed wording templates from the spec don't drift
  // in handlers.ts. If these literal strings change, ensure the spec +
  // docs are updated in the same commit (per memory #319 workflow).
  it('pre-read / pre-edit wording templates match spec', () => {
    const softTemplate = 'aide-memory · prompting aide_recall for scoped memories';
    const hardTemplate = 'aide-memory · prompting aide_recall for scoped memories (expected flow)';
    // Literal references — lint-style guard. If you change the wording in
    // handlers.ts, update these too AND update the spec.
    expect(softTemplate.startsWith('aide-memory · ')).toBe(true);
    expect(hardTemplate.includes('(expected flow)')).toBe(true);
  });

  it('stop (schedule) wording includes "expected"', () => {
    const stopTemplate = 'aide-memory · checkpoint — prompting aide_remember for anything critical (expected)';
    expect(stopTemplate.includes('(expected)')).toBe(true);
    expect(stopTemplate.includes('aide_remember')).toBe(true);
  });
});
