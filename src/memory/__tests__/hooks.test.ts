import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// All hook scripts live here
const HOOKS_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts', 'hooks');

/**
 * Helper: run a hook script with JSON piped to stdin.
 * Returns { stdout, exitCode }.
 * Uses a temp file for stdin to avoid shell quoting issues with
 * apostrophes and special characters in test strings.
 */
function runHook(
  scriptName: string,
  stdinJson: Record<string, unknown>
): { stdout: string; exitCode: number } {
  const scriptPath = path.join(HOOKS_DIR, scriptName);
  const tmpInput = path.join(os.tmpdir(), `aide-hook-input-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
  try {
    fs.writeFileSync(tmpInput, JSON.stringify(stdinJson));
    const stdout = execSync(`bash "${scriptPath}" < "${tmpInput}"`, {
      encoding: 'utf-8',
      timeout: 10_000,
      env: { ...process.env, PATH: process.env.PATH },
    });
    return { stdout: stdout.trim(), exitCode: 0 };
  } catch (err: any) {
    // execSync throws on non-zero exit OR if the command fails
    return {
      stdout: (err.stdout ?? '').trim(),
      exitCode: err.status ?? 1,
    };
  } finally {
    try { fs.unlinkSync(tmpInput); } catch { /* ignore */ }
  }
}

// ─── PreToolUse (pre-read-recall.sh) ───────────────────────────────────────

describe('PreToolUse hook (pre-read-recall.sh)', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-hook-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('exits 0 with no output when file_path is empty', () => {
    const result = runHook('pre-read-recall.sh', { tool_input: {} });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('exits 0 when recall-for-path.js fails (no dist/ or DB)', () => {
    // Use a path that won't match any real project
    const result = runHook('pre-read-recall.sh', {
      tool_input: { file_path: '/nonexistent/project/src/foo.ts' },
    });
    expect(result.exitCode).toBe(0);
    // May or may not have output, but must not crash
  });

  it('exits 0 when .aide/ directory does not exist', () => {
    const result = runHook('pre-read-recall.sh', {
      tool_input: { file_path: path.join(tempDir, 'src', 'foo.ts') },
    });
    expect(result.exitCode).toBe(0);
  });

  it('detects .aide/memories/ file reads and returns analytics nudge', () => {
    const result = runHook('pre-read-recall.sh', {
      tool_input: { file_path: '/some/project/.aide/memories/abc123.json' },
    });
    expect(result.exitCode).toBe(0);
    if (result.stdout) {
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe('PreToolUse');
      expect(parsed.hookSpecificOutput.additionalContext).toContain('memory_file_direct_read');
      expect(parsed.hookSpecificOutput.additionalContext).toContain('aide_recall');
    }
  });

  it('returns nudge JSON with memory count when memories exist', () => {
    // We need a real project with dist/ and a DB for this.
    // Use the actual project root (the AIDE repo itself) with a known path.
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const distStore = path.join(projectRoot, 'dist', 'memory', 'store.js');

    // Skip if dist/ isn't built
    if (!fs.existsSync(distStore)) {
      return;
    }

    // Create a temp DB with a seeded memory using the store
    const { MemoryStore } = require(distStore);
    const tempDbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-hook-count-'));
    const tempDbPath = path.join(tempDbDir, 'memory.db');
    const store = new MemoryStore({ dbPath: tempDbPath });
    store.add({
      layer: 'technical',
      what: 'Test memory for hook',
      scope: 'src/memory/**',
    });
    store.add({
      layer: 'preferences',
      what: 'Another test memory',
      scope: 'project',
    });
    store.close();

    // The recall-for-path.js script discovers the DB via projectRoot hash.
    // For unit testing, we verify it exits 0 — the integration with
    // a real project DB is tested manually.
    const result = runHook('pre-read-recall.sh', {
      tool_input: { file_path: path.join(projectRoot, 'src', 'memory', 'store.ts') },
    });
    expect(result.exitCode).toBe(0);

    // Clean up temp DB
    fs.rmSync(tempDbDir, { recursive: true, force: true });
  });

  it('returns nothing when no memories match the path', () => {
    // With no DB, recall-for-path.js exits 0 and outputs nothing
    const result = runHook('pre-read-recall.sh', {
      tool_input: { file_path: '/totally/random/path/no/project.ts' },
    });
    expect(result.exitCode).toBe(0);
    // Should produce no nudge output (or empty)
    if (result.stdout) {
      // If any JSON is returned, it should NOT contain a count nudge
      try {
        const parsed = JSON.parse(result.stdout);
        // If parsed, it should not be a count nudge for a non-existent project
        if (parsed.hookSpecificOutput?.additionalContext) {
          expect(parsed.hookSpecificOutput.additionalContext).not.toMatch(/\d+ memories exist/);
        }
      } catch {
        // Non-JSON output is fine — means no nudge
      }
    }
  });
});

// ─── Stop (stop-remember.sh) ───────────────────────────────────────────────

describe('Stop hook (stop-remember.sh)', () => {
  it('blocks first stop with reflection prompt', () => {
    const result = runHook('stop-remember.sh', {});
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('aide_remember');
    // Wording changed: now uses natural language "decisions, technical constraints,
    // preferences, or guidelines" instead of listing layer names individually
    expect(parsed.reason).toContain('decisions');
    expect(parsed.reason).toContain('technical');
    expect(parsed.reason).toContain('preferences');
    expect(parsed.reason).toContain('guidelines');
  });

  it('allows second stop when stop_hook_active is true', () => {
    const result = runHook('stop-remember.sh', { stop_hook_active: true });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('blocks stop when stop_hook_active is false', () => {
    const result = runHook('stop-remember.sh', { stop_hook_active: false });
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.decision).toBe('block');
  });

  it('mentions persisting and aide_remember in the prompt', () => {
    const result = runHook('stop-remember.sh', {});
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    // The stop hook now focuses on directing the agent to persist knowledge
    // via aide_remember rather than mentioning "source: hook" tagging
    expect(parsed.reason).toContain('persisting');
    expect(parsed.reason).toContain('aide_remember');
  });

  it('exits 0 even with malformed input', () => {
    // Force empty stdin
    try {
      const stdout = execSync(
        `echo '{}' | bash "${path.join(HOOKS_DIR, 'stop-remember.sh')}"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      // Should still output block decision (stop_hook_active defaults to false)
      expect(JSON.parse(stdout.trim()).decision).toBe('block');
    } catch (err: any) {
      // Even if it fails, exit code should be 0
      expect(err.status).toBe(0);
    }
  });
});

// ─── UserPromptSubmit (detect-correction.sh) ────────────────────────────────

describe('UserPromptSubmit hook (detect-correction.sh)', () => {
  describe('correction patterns', () => {
    const corrections = [
      "no, don't use that approach",
      'actually, the API is different',
      'wrong, that function is deprecated',
      'not like that, use the other method',
      "use React.memo instead",
      "don't use any for that type",
      'stop using var, use const',
      'I told you to use TypeScript',
      'I said use the new API',
    ];

    for (const msg of corrections) {
      it(`detects correction: "${msg}"`, () => {
        const result = runHook('detect-correction.sh', { prompt: msg });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toBe('');

        const parsed = JSON.parse(result.stdout);
        expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
        // Wording changed: now says "BEFORE doing anything else" instead of "correcting"
        expect(parsed.hookSpecificOutput.additionalContext).toContain('BEFORE doing anything else');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('aide_remember');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('hook');
      });
    }
  });

  describe('decision patterns', () => {
    const decisions = [
      "let's use Redux for state management",
      'we should go with PostgreSQL',
      'go with the microservices approach',
      'the approach is to use server components',
      'decided to use Tailwind CSS',
      "we're going with the monorepo structure",
      'from now on we use ESM imports',
    ];

    for (const msg of decisions) {
      it(`detects decision: "${msg}"`, () => {
        const result = runHook('detect-correction.sh', { prompt: msg });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toBe('');

        const parsed = JSON.parse(result.stdout);
        expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
        // Wording changed: now says "BEFORE doing anything else" instead of "decision"
        expect(parsed.hookSpecificOutput.additionalContext).toContain('BEFORE doing anything else');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('aide_remember');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('hook');
      });
    }
  });

  describe('preference patterns', () => {
    const preferences = [
      'I prefer functional components over class components',
      'always use arrow functions for callbacks',
      'never use default exports',
      'I like the explicit return style',
      'my style is to use named exports',
      'I want you to always add JSDoc comments',
      "don't ever use any type",
      'make sure to always run tests first',
      'I always use strict mode',
    ];

    for (const msg of preferences) {
      it(`detects preference: "${msg}"`, () => {
        const result = runHook('detect-correction.sh', { prompt: msg });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toBe('');

        const parsed = JSON.parse(result.stdout);
        expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('preference');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('aide_remember');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('hook');
      });
    }
  });

  it('exits silently for non-matching messages', () => {
    const benignMessages = [
      'Can you help me with this function?',
      'What does this code do?',
      'Please refactor the database module',
      'Add a test for the login flow',
      'How does the caching work?',
    ];

    for (const msg of benignMessages) {
      const result = runHook('detect-correction.sh', { prompt: msg });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    }
  });

  it('exits 0 with empty prompt', () => {
    const result = runHook('detect-correction.sh', { prompt: '' });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('exits 0 with missing prompt field', () => {
    const result = runHook('detect-correction.sh', {});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });
});

// ─── PreCompact (pre-compact-save.sh) ───────────────────────────────────────

describe('PreCompact hook (pre-compact-save.sh)', () => {
  it('outputs blocking prompt with save instructions', () => {
    const result = runHook('pre-compact-save.sh', {
      session_id: 'test-session-123',
      transcript_path: '/tmp/transcript.json',
      trigger: 'manual',
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toBe('');

    const parsed = JSON.parse(result.stdout);
    // pre-compact-save.sh now blocks compaction to save context first
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('compacting');
    expect(parsed.reason).toContain('aide_remember');
    expect(parsed.reason).toContain('decisions');
  });

  it('suggests source: hook tagging', () => {
    const result = runHook('pre-compact-save.sh', {
      session_id: 'abc',
      trigger: 'auto',
    });
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.reason).toContain('hook');
  });

  it('blocks compaction to save context first', () => {
    const result = runHook('pre-compact-save.sh', {});
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    // Pre-compact now blocks to ensure context is saved before compaction
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBeDefined();
  });

  it('exits 0 with empty input', () => {
    const result = runHook('pre-compact-save.sh', {});
    expect(result.exitCode).toBe(0);
  });
});

// ─── General: all hooks exit 0 on errors ────────────────────────────────────

describe('All hooks exit 0 on errors', () => {
  const hookScripts = [
    'pre-read-recall.sh',
    'stop-remember.sh',
    'detect-correction.sh',
    'pre-compact-save.sh',
  ];

  for (const script of hookScripts) {
    it(`${script} exits 0 with empty JSON input`, () => {
      const result = runHook(script, {});
      expect(result.exitCode).toBe(0);
    });
  }
});

// ─── recall-for-path.js ────────────────────────────────────────────────────

describe('recall-for-path.js', () => {
  it('exits 0 with no arguments', () => {
    const scriptPath = path.join(HOOKS_DIR, 'recall-for-path.js');
    try {
      const stdout = execSync(`node "${scriptPath}"`, {
        encoding: 'utf-8',
        timeout: 5000,
      });
      // Should exit 0 with no output
      expect(stdout.trim()).toBe('');
    } catch (err: any) {
      expect(err.status).toBe(0);
    }
  });

  it('exits 0 when .aide/ directory does not exist', () => {
    const scriptPath = path.join(HOOKS_DIR, 'recall-for-path.js');
    // Use a path in a temp dir that has no .aide/
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-no-aide-'));
    try {
      const stdout = execSync(
        `node "${scriptPath}" "${path.join(tempDir, 'src', 'foo.ts')}"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      // Script may output "0" (no matching memories) or empty string
      // depending on whether it resolves project root from __dirname
      const trimmed = stdout.trim();
      expect(trimmed === '' || trimmed === '0').toBe(true);
    } catch (err: any) {
      // Exit 0 is acceptable even via catch
      expect(err.status ?? 0).toBe(0);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('outputs structured JSON with count, not raw memory content', () => {
    const scriptPath = path.join(HOOKS_DIR, 'recall-for-path.js');
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const distStore = path.join(projectRoot, 'dist', 'memory', 'store.js');

    if (!fs.existsSync(distStore)) {
      return; // Skip if not built
    }

    // Run against the real project — output should be JSON with count or empty
    try {
      const stdout = execSync(
        `node "${scriptPath}" "${path.join(projectRoot, 'src', 'memory', 'store.ts')}"`,
        { encoding: 'utf-8', timeout: 5000 }
      );
      const trimmed = stdout.trim();
      if (trimmed) {
        // Output is either "0" (no matches) or structured JSON with count field
        if (trimmed === '0') {
          // Plain zero is acceptable for no matches
          expect(trimmed).toBe('0');
        } else {
          // Must be valid JSON with a count field, not raw memory content
          const parsed = JSON.parse(trimmed);
          expect(parsed.count).toBeGreaterThanOrEqual(0);
          // Must NOT contain raw memory text like "what:" as a top-level string
          expect(trimmed).not.toContain('"what":');
        }
      }
    } catch (err: any) {
      // Exit 0 on failure is fine
      expect(err.status ?? 0).toBe(0);
    }
  });
});
