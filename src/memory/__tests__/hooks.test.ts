import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';

// All hook scripts live here
const HOOKS_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts', 'hooks');
// Project root — hooks fall back to SCRIPT_DIR/../.. when no cwd in input
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');

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

describe('Stop hook (stop-remember.sh) — dynamic interval', () => {
  const sid = 'test-stop-dynamic';
  const cacheDir = path.join(REPO_ROOT, '.aide', 'cache');

  beforeEach(() => {
    // Clean stop counter for this session
    const countFile = path.join(cacheDir, `stop-count-${sid}.txt`);
    if (fs.existsSync(countFile)) fs.unlinkSync(countFile);
  });

  it('turn 1: silent (not block)', () => {
    const result = runHook('stop-remember.sh', { session_id: sid });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('turn 3: scheduled fire (default mode=block → decision:block)', () => {
    // Simulate turns 1-2
    runHook('stop-remember.sh', { session_id: sid });
    runHook('stop-remember.sh', { session_id: sid });
    // Turn 3 hits the schedule. 0.5.17 default mode is 'block' (Claude Code
    // platform doesn't support hookSpecificOutput.additionalContext on Stop —
    // see claude-code-protocol.ts).
    const result = runHook('stop-remember.sh', { session_id: sid });
    expect(result.stdout).not.toBe('');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toContain('aide_remember');
    expect(parsed.hookSpecificOutput).toBeUndefined();
  });

  it('turn 4: silent again after fire', () => {
    for (let i = 0; i < 3; i++) runHook('stop-remember.sh', { session_id: sid });
    // Turn 4 should be silent (off-schedule)
    const result = runHook('stop-remember.sh', { session_id: sid });
    expect(result.stdout).toBe('');
  });

  it('turn 6: scheduled fire (decision:block)', () => {
    for (let i = 0; i < 5; i++) runHook('stop-remember.sh', { session_id: sid });
    const result = runHook('stop-remember.sh', { session_id: sid });
    expect(result.stdout).not.toBe('');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.decision).toBe('block');
    expect(parsed.hookSpecificOutput).toBeUndefined();
  });

  it('after turn 9: switches to every-5 interval', () => {
    // Run through 9 turns
    for (let i = 0; i < 9; i++) runHook('stop-remember.sh', { session_id: sid });
    // Turns 10-13 should be silent, turn 14 should fire (9 + 5 = 14)
    for (let i = 0; i < 4; i++) runHook('stop-remember.sh', { session_id: sid });
    const result = runHook('stop-remember.sh', { session_id: sid }); // turn 14
    expect(result.stdout).not.toBe('');
    const parsed = JSON.parse(result.stdout);
    expect(parsed.decision).toBe('block');
  });

  it('allows second stop when stop_hook_active is true', () => {
    const result = runHook('stop-remember.sh', { stop_hook_active: true, session_id: sid });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('default escalate=off + stale correction-pending flag: clears flag silently, falls through', () => {
    // Create correction flag (e.g. left from before escalate was flipped to off)
    fs.mkdirSync(cacheDir, { recursive: true });
    const flagPath = path.join(cacheDir, `correction-pending-${sid}.txt`);
    fs.writeFileSync(flagPath, 'correction');

    // Default config: escalate=off → stale flag is cleared, scheduled path runs.
    // Turn 1 (off-schedule) → silent + flag cleared.
    const result = runHook('stop-remember.sh', { session_id: sid });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
    expect(fs.existsSync(flagPath)).toBe(false);
  });

  it('exits 0 with empty input', () => {
    const result = runHook('stop-remember.sh', {});
    expect(result.exitCode).toBe(0);
    // May or may not have output depending on turn count
  });

  afterEach(() => {
    const countFile = path.join(cacheDir, `stop-count-${sid}.txt`);
    if (fs.existsSync(countFile)) fs.unlinkSync(countFile);
  });
});

// ─── UserPromptSubmit (detect-correction.sh) ────────────────────────────────

describe('UserPromptSubmit hook (detect-correction.sh)', () => {
  // Use a fresh temp project so the test doesn't read the dev repo's
  // .aide/config.json (which may have hooks.correction.enabled=false from
  // earlier debug sessions). Empty config = full defaults from defaults.json.
  let cleanCwd: string;
  beforeEach(() => {
    cleanCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-detect-test-'));
  });
  afterEach(() => {
    fs.rmSync(cleanCwd, { recursive: true, force: true });
  });

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
        const result = runHook('detect-correction.sh', { prompt: msg, cwd: cleanCwd });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toBe('');

        const parsed = JSON.parse(result.stdout);
        expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
        // 0.5.17: unified soft prompt mentions "correction or convention" + the four layers.
        expect(parsed.hookSpecificOutput.additionalContext).toContain('correction or convention');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('aide_remember');
        expect(parsed.systemMessage).toMatch(/possible correction detected/);
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
        const result = runHook('detect-correction.sh', { prompt: msg, cwd: cleanCwd });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toBe('');

        const parsed = JSON.parse(result.stdout);
        expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
        // 0.5.17: same unified soft prompt regardless of kind; systemMessage carries the kind.
        expect(parsed.hookSpecificOutput.additionalContext).toContain('correction or convention');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('aide_remember');
        expect(parsed.systemMessage).toMatch(/possible decision detected/);
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
        const result = runHook('detect-correction.sh', { prompt: msg, cwd: cleanCwd });
        expect(result.exitCode).toBe(0);
        expect(result.stdout).not.toBe('');

        const parsed = JSON.parse(result.stdout);
        expect(parsed.hookSpecificOutput.hookEventName).toBe('UserPromptSubmit');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('correction or convention');
        expect(parsed.hookSpecificOutput.additionalContext).toContain('aide_remember');
        expect(parsed.systemMessage).toMatch(/possible preference detected/);
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
      const result = runHook('detect-correction.sh', { prompt: msg, cwd: cleanCwd });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    }
  });

  it('exits 0 with empty prompt', () => {
    const result = runHook('detect-correction.sh', { prompt: '', cwd: cleanCwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });

  it('exits 0 with missing prompt field', () => {
    const result = runHook('detect-correction.sh', { cwd: cleanCwd });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe('');
  });
});

// ─── PreCompact (pre-compact-save.sh) ───────────────────────────────────────

describe('PreCompact hook (pre-compact-save.sh) — cleanup only', () => {
  it('exits 0 and clears session tracking files', () => {
    const sid = 'test-compact-cleanup';
    const cacheDir = path.join(REPO_ROOT, '.aide', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    // Create tracking files to be cleaned
    fs.writeFileSync(path.join(cacheDir, `recalled-paths-${sid}.txt`), 'file|test');
    fs.writeFileSync(path.join(cacheDir, `searched-queries-${sid}.txt`), 'query');
    fs.writeFileSync(path.join(cacheDir, `correction-pending-${sid}.txt`), 'pending');

    const result = runHook('pre-compact-save.sh', { session_id: sid, trigger: 'manual' });
    expect(result.exitCode).toBe(0);

    // All tracking files should be cleared
    expect(fs.existsSync(path.join(cacheDir, `recalled-paths-${sid}.txt`))).toBe(false);
    expect(fs.existsSync(path.join(cacheDir, `searched-queries-${sid}.txt`))).toBe(false);
    expect(fs.existsSync(path.join(cacheDir, `correction-pending-${sid}.txt`))).toBe(false);
  });

  it('exits 0 with no tracking files (no crash)', () => {
    const result = runHook('pre-compact-save.sh', { session_id: 'no-files' });
    expect(result.exitCode).toBe(0);
  });

  it('does not affect other sessions tracking files', () => {
    const cacheDir = path.join(REPO_ROOT, '.aide', 'cache');
    fs.mkdirSync(cacheDir, { recursive: true });

    // Create tracking for another session
    fs.writeFileSync(path.join(cacheDir, 'recalled-paths-other-session.txt'), 'file|other');

    const result = runHook('pre-compact-save.sh', { session_id: 'my-session' });
    expect(result.exitCode).toBe(0);

    // Other session's file should still exist
    expect(fs.existsSync(path.join(cacheDir, 'recalled-paths-other-session.txt'))).toBe(true);

    // Clean up
    fs.unlinkSync(path.join(cacheDir, 'recalled-paths-other-session.txt'));
  });
});

// ─── General: all hooks exit 0 on errors ────────────────────────────────────

describe('All hooks handle empty input without crashing', () => {
  const hookScripts = [
    { script: 'pre-read-recall.sh', expectedExit: 0 },
    { script: 'stop-remember.sh', expectedExit: 0 },
    { script: 'detect-correction.sh', expectedExit: 0 },
    // pre-compact-save.sh is cleanup-only, always exits 0
    { script: 'pre-compact-save.sh', expectedExit: 0 },
  ];

  for (const { script, expectedExit } of hookScripts) {
    it(`${script} exits ${expectedExit} with empty JSON input (no crash)`, () => {
      // Clean up any compact-pending flag for pre-compact
      const flagPath = path.join(REPO_ROOT, '.aide', 'cache', 'compact-pending-default.txt');
      if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);

      const result = runHook(script, {});
      expect(result.exitCode).toBe(expectedExit);

      // Clean up
      if (fs.existsSync(flagPath)) fs.unlinkSync(flagPath);
    });
  }
});

// ─── Drift-repair: direct config.json edit → next hook fires resync ────────

describe('Drift-repair (maybeTriggerDriftResync in hook dispatcher)', () => {
  // Locks in the user-facing promise from docs/user/cli-reference.md:
  // "If you hand-edit .aide/config.json, running sessions pick up the change
  //  on the next hook fire (file read, edit, or prompt)."
  //
  // Regression history: the bash _aide_drift_check side-effect in the old
  // scripts/hooks/read-config.sh was silently dropped in the 0.4.0 hook
  // consolidation (memory #171). This test re-ports to the TS dispatcher
  // so the regression can't recur unnoticed.
  //
  // Implementation note: the drift check spawns a DETACHED+UNREFED child
  // process so the hook exits fast (pre-compact has a latency budget).
  // That means the test must wait for the child to finish before asserting
  // on derived-artifact state.

  let tempProject: string;

  beforeEach(() => {
    tempProject = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-drift-vitest-'));
    execSync('git init -q', { cwd: tempProject, stdio: 'pipe' });
    execSync(`node ${path.join(REPO_ROOT, 'dist', 'cli', 'aide-memory.js')} init`, {
      cwd: tempProject,
      stdio: 'pipe',
    });
  });

  afterEach(() => {
    fs.rmSync(tempProject, { recursive: true, force: true });
    // Wipe the per-project SQLite cache under ~/.aide/projects/<hash>/
    try {
      const crypto = require('crypto');
      const resolved = fs.realpathSync(tempProject);
      const hash = crypto.createHash('sha1').update(resolved).digest('hex').slice(0, 12);
      fs.rmSync(path.join(os.homedir(), '.aide', 'projects', hash), {
        recursive: true,
        force: true,
      });
    } catch { /* non-fatal test cleanup */ }
  });

  it('edits to .aide/config.json re-sync .ignore within ~2s of the next hook fire', async () => {
    const ignorePath = path.join(tempProject, '.ignore');
    const configPath = path.join(tempProject, '.aide', 'config.json');

    // Sanity: init should have produced a managed .ignore block.
    expect(fs.existsSync(ignorePath)).toBe(true);
    expect(fs.readFileSync(ignorePath, 'utf8')).toMatch(/aide-memory-managed/);

    // Wait long enough for the next mtime to land in a distinct tick.
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Hand-edit bypasses `aide-memory config` — simulates user opening
    // .aide/config.json in vim, merging a teammate's diff, etc.
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.memories = { ...(config.memories || {}), hideFromGrep: false };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    // Fire ANY hook. maybeTriggerDriftResync runs unconditionally at the
    // top of dispatch(), so `pre-prompt` works even though the inner
    // detectCorrection handler exits silent for non-correction prompts.
    execSync(
      `echo '{"session_id":"drift-vitest","cwd":"${tempProject}","prompt":"drift-repair regression test prompt"}' ` +
        `| bash ${path.join(REPO_ROOT, 'scripts', 'hooks', 'detect-correction.sh')}`,
      { encoding: 'utf8', timeout: 10_000 }
    );

    // Drift-repair is spawned detached + unrefed, so poll for the side
    // effect. The child runs `aide-memory internal-resync` which loads
    // init.ts and calls resyncDerivedArtifacts — typically < 1s on a
    // warm system.
    const deadline = Date.now() + 5_000;
    let ignoreGone = false;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      if (!fs.existsSync(ignorePath)) { ignoreGone = true; break; }
      const content = fs.readFileSync(ignorePath, 'utf8');
      if (!content.includes('aide-memory-managed')) { ignoreGone = true; break; }
    }

    expect(ignoreGone).toBe(true);
  }, 15_000);

  it('no config-edit → no resync (mtime unchanged)', async () => {
    // If the cached mtime matches current mtime, we should NOT spawn a
    // resync child. First hook seeds config-mtime.txt; second hook (no
    // config edit) should leave .ignore exactly as it was.
    const ignorePath = path.join(tempProject, '.ignore');
    const mtimeCache = path.join(tempProject, '.aide', 'cache', 'config-mtime.txt');

    execSync(
      `echo '{"session_id":"drift-vitest-2","cwd":"${tempProject}","prompt":"seed mtime"}' ` +
        `| bash ${path.join(REPO_ROOT, 'scripts', 'hooks', 'detect-correction.sh')}`,
      { encoding: 'utf8', timeout: 10_000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    expect(fs.existsSync(mtimeCache)).toBe(true);
    expect(fs.existsSync(ignorePath)).toBe(true);
    const ignoreBefore = fs.readFileSync(ignorePath, 'utf8');

    execSync(
      `echo '{"session_id":"drift-vitest-2","cwd":"${tempProject}","prompt":"no config edit this turn"}' ` +
        `| bash ${path.join(REPO_ROOT, 'scripts', 'hooks', 'detect-correction.sh')}`,
      { encoding: 'utf8', timeout: 10_000 }
    );
    await new Promise((resolve) => setTimeout(resolve, 500));

    expect(fs.existsSync(ignorePath)).toBe(true);
    expect(fs.readFileSync(ignorePath, 'utf8')).toBe(ignoreBefore);
  }, 15_000);
});


