import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { debug, loudError, isDebugEnabled } from '../internal/debug';

/**
 * Captures process.stderr.write so we can assert what the helper emits without
 * polluting test output. Uses spyOn to intercept; mockReturnValue(true) so
 * stderr.write's normal return value (a boolean) is preserved.
 */
function captureStderr() {
  const lines: string[] = [];
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: any) => {
    lines.push(typeof chunk === 'string' ? chunk : String(chunk));
    return true;
  }) as any);
  return {
    lines,
    output: () => lines.join(''),
    restore: () => spy.mockRestore(),
  };
}

describe('internal/debug — env-driven category gating', () => {
  beforeEach(() => {
    delete process.env.AIDE_DEBUG;
    delete process.env.AIDE_DEBUG_HOOK;
  });

  afterEach(() => {
    delete process.env.AIDE_DEBUG;
    delete process.env.AIDE_DEBUG_HOOK;
  });

  it('writes nothing when AIDE_DEBUG is unset', () => {
    const cap = captureStderr();
    try {
      debug('hooks', 'should be silent');
      debug('mcp', 'also silent');
      debug('binding', 'silent');
      debug('recall', 'silent');
      expect(cap.lines).toHaveLength(0);
    } finally {
      cap.restore();
    }
  });

  it('AIDE_DEBUG=hooks enables only the hooks category', () => {
    process.env.AIDE_DEBUG = 'hooks';
    const cap = captureStderr();
    try {
      debug('hooks', 'message-h');
      debug('mcp', 'message-m');
      debug('binding', 'message-b');
      debug('recall', 'message-r');
      expect(cap.output()).toContain('[AIDE_DEBUG/hooks] message-h');
      expect(cap.output()).not.toContain('message-m');
      expect(cap.output()).not.toContain('message-b');
      expect(cap.output()).not.toContain('message-r');
    } finally {
      cap.restore();
    }
  });

  it('AIDE_DEBUG=hooks,mcp enables both', () => {
    process.env.AIDE_DEBUG = 'hooks,mcp';
    const cap = captureStderr();
    try {
      debug('hooks', 'h-msg');
      debug('mcp', 'm-msg');
      debug('binding', 'b-msg');
      const out = cap.output();
      expect(out).toContain('[AIDE_DEBUG/hooks] h-msg');
      expect(out).toContain('[AIDE_DEBUG/mcp] m-msg');
      expect(out).not.toContain('b-msg');
    } finally {
      cap.restore();
    }
  });

  it('AIDE_DEBUG=all enables every category', () => {
    process.env.AIDE_DEBUG = 'all';
    const cap = captureStderr();
    try {
      debug('hooks', 'h');
      debug('mcp', 'm');
      debug('binding', 'b');
      debug('recall', 'r');
      const out = cap.output();
      expect(out).toContain('[AIDE_DEBUG/hooks] h');
      expect(out).toContain('[AIDE_DEBUG/mcp] m');
      expect(out).toContain('[AIDE_DEBUG/binding] b');
      expect(out).toContain('[AIDE_DEBUG/recall] r');
    } finally {
      cap.restore();
    }
  });

  it('AIDE_DEBUG=1 is a shorthand for "all"', () => {
    process.env.AIDE_DEBUG = '1';
    expect(isDebugEnabled('hooks')).toBe(true);
    expect(isDebugEnabled('mcp')).toBe(true);
    expect(isDebugEnabled('binding')).toBe(true);
    expect(isDebugEnabled('recall')).toBe(true);
  });

  it('legacy AIDE_DEBUG_HOOK=1 enables hooks (back-compat)', () => {
    process.env.AIDE_DEBUG_HOOK = '1';
    const cap = captureStderr();
    try {
      debug('hooks', 'still works');
      debug('mcp', 'silent');
      expect(cap.output()).toContain('[AIDE_DEBUG/hooks] still works');
      expect(cap.output()).not.toContain('silent');
    } finally {
      cap.restore();
    }
  });

  it('unknown category tokens are silently ignored (typo-tolerant, no startup chatter)', () => {
    process.env.AIDE_DEBUG = 'hooks,bogus,mcp';
    expect(isDebugEnabled('hooks')).toBe(true);
    expect(isDebugEnabled('mcp')).toBe(true);
    expect(isDebugEnabled('binding')).toBe(false);
    // No assertion that bogus produces output — by design we're silent on bad tokens
  });

  it('whitespace and empty tokens in AIDE_DEBUG are tolerated', () => {
    process.env.AIDE_DEBUG = ' hooks ,, mcp ';
    expect(isDebugEnabled('hooks')).toBe(true);
    expect(isDebugEnabled('mcp')).toBe(true);
    expect(isDebugEnabled('binding')).toBe(false);
  });

  it('env var changes mid-run take effect immediately (no cached state)', () => {
    expect(isDebugEnabled('hooks')).toBe(false);
    process.env.AIDE_DEBUG = 'hooks';
    expect(isDebugEnabled('hooks')).toBe(true);
    process.env.AIDE_DEBUG = 'mcp';
    expect(isDebugEnabled('hooks')).toBe(false);
    expect(isDebugEnabled('mcp')).toBe(true);
  });

  it('output uses [AIDE_DEBUG/<category>] prefix and ends with a newline', () => {
    process.env.AIDE_DEBUG = 'hooks';
    const cap = captureStderr();
    try {
      debug('hooks', 'check format');
      expect(cap.output()).toBe('[AIDE_DEBUG/hooks] check format\n');
    } finally {
      cap.restore();
    }
  });
});

describe('internal/debug — loudError (always-on)', () => {
  it('always emits regardless of AIDE_DEBUG state', () => {
    delete process.env.AIDE_DEBUG;
    const cap = captureStderr();
    try {
      loudError('something broke');
      expect(cap.output()).toContain('[AIDE_ERROR] something broke');
    } finally {
      cap.restore();
    }
  });

  it('appends hint with " — " separator when provided', () => {
    const cap = captureStderr();
    try {
      loudError('binding load failed', 'reinstall aide-memory');
      expect(cap.output()).toBe('[AIDE_ERROR] binding load failed — reinstall aide-memory\n');
    } finally {
      cap.restore();
    }
  });

  it('omits the separator when hint is undefined', () => {
    const cap = captureStderr();
    try {
      loudError('plain failure');
      expect(cap.output()).toBe('[AIDE_ERROR] plain failure\n');
    } finally {
      cap.restore();
    }
  });
});
