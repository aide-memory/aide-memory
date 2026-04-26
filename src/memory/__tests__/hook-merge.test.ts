import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import { initProject } from '../init';

/**
 * Phase C6.1 tests — per-event hook-merge behavior.
 *
 * BEFORE C6: writing `.claude/settings.json` or `.cursor/hooks.json`
 * replaced the top-level `hooks` key wholesale, clobbering user's entries
 * from other tools (secret scanners, formatters, custom events).
 *
 * AFTER C6: per-event merge. For every event name in EITHER file:
 *   - aide-memory's OLD entries removed (detected via packageRoot path)
 *   - user's entries preserved verbatim
 *   - aide-memory's FRESH entries appended
 *
 * These tests exercise the integration-level behavior through initProject
 * rather than calling the private `mergeHooksByEvent` helper directly —
 * catches more real-world bugs (file I/O, JSON shape, force-vs-no-force
 * branches).
 */

const PKG_ROOT = path.resolve(__dirname, '..', '..', '..');

function makeProject(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-mergetest-'));
  execSync('git init -q', { cwd: root });
  execSync('git config user.name test', { cwd: root });
  execSync('git config user.email t@t.com', { cwd: root });
  return root;
}

function readSettings(root: string): any {
  const p = path.join(root, '.claude', 'settings.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function cleanup(root: string): void {
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best-effort */ }
}

describe('per-event hook merge — user hooks preserved', () => {
  let root: string;
  beforeEach(() => { root = makeProject(); });
  afterEach(() => cleanup(root));

  it('preserves user hooks under an event aide-memory also claims (PreToolUse)', async () => {
    // Pre-populate with a user's secret-scanner hook at PreToolUse:Read
    const settingsDir = path.join(root, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: 'Read', hooks: [{ type: 'command', command: 'bash /usr/local/bin/user-scanner.sh', timeout: 5 }] },
        ],
      },
      otherUserKey: 'should-be-preserved',
    }), 'utf8');

    await initProject(root, { force: true });

    const merged = readSettings(root);
    expect(merged.otherUserKey).toBe('should-be-preserved');
    expect(Array.isArray(merged.hooks.PreToolUse)).toBe(true);

    const commands = merged.hooks.PreToolUse.map((e: any) => e.hooks?.[0]?.command ?? '');
    // User's scanner present
    expect(commands.some((c: string) => c.includes('user-scanner.sh'))).toBe(true);
    // aide-memory's Read hook present
    expect(commands.some((c: string) => c.includes('pre-read-recall.sh'))).toBe(true);
  });

  it('preserves user hooks under events aide-memory does NOT claim', async () => {
    const settingsDir = path.join(root, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        CustomUserEvent: [
          { hooks: [{ type: 'command', command: 'bash /usr/local/bin/user-custom.sh' }] },
        ],
      },
    }), 'utf8');

    await initProject(root, { force: true });

    const merged = readSettings(root);
    expect(merged.hooks.CustomUserEvent).toBeDefined();
    expect(merged.hooks.CustomUserEvent[0].hooks[0].command).toContain('user-custom.sh');
  });

  it('is idempotent — repeat init --force does not duplicate aide-memory entries', async () => {
    await initProject(root, { force: true });
    const first = readSettings(root);
    const firstCount = first.hooks.PreToolUse.length;

    await initProject(root, { force: true });
    const second = readSettings(root);
    const secondCount = second.hooks.PreToolUse.length;

    expect(secondCount).toBe(firstCount);
  });

  it('idempotent + user-hook-preserving across 3 consecutive inits', async () => {
    const settingsDir = path.join(root, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        PreToolUse: [
          { matcher: 'Read', hooks: [{ type: 'command', command: 'bash /usr/local/bin/user-scanner.sh', timeout: 5 }] },
        ],
      },
    }), 'utf8');

    for (let i = 0; i < 3; i++) {
      await initProject(root, { force: true });
    }

    const merged = readSettings(root);
    const commands = merged.hooks.PreToolUse.map((e: any) => e.hooks?.[0]?.command ?? '');
    // User's scanner still exactly ONCE
    const scannerCount = commands.filter((c: string) => c.includes('user-scanner.sh')).length;
    expect(scannerCount).toBe(1);
    // Aide-memory's Read hook still exactly ONCE
    const aideReadCount = commands.filter((c: string) => c.includes('pre-read-recall.sh')).length;
    expect(aideReadCount).toBe(1);
  });

  it('removes old aide-memory entries from prior installs + adds fresh ones', async () => {
    // Simulate a prior aide-memory install pointing at a DIFFERENT packageRoot
    // (e.g. a global install vs. a local dev install). Old entries should be
    // stripped and replaced with fresh ones pointing at the current package.
    const settingsDir = path.join(root, '.claude');
    fs.mkdirSync(settingsDir, { recursive: true });
    const stalePackagePath = '/old/aide-memory/scripts/hooks';
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify({
      hooks: {
        PreToolUse: [
          // Old aide-memory entry (points at a different packageRoot; still
          // matches the `scripts/hooks` substring — that's our aide-memory
          // signature).
          { matcher: 'Read', hooks: [{ type: 'command', command: `bash ${stalePackagePath}/pre-read-recall.sh`, timeout: 10 }] },
        ],
      },
    }), 'utf8');

    await initProject(root, { force: true });

    const merged = readSettings(root);
    const commands = merged.hooks.PreToolUse.map((e: any) => e.hooks?.[0]?.command ?? '');
    // Stale path gone, fresh path added.
    expect(commands.some((c: string) => c.includes(stalePackagePath))).toBe(false);
    expect(commands.some((c: string) => c.includes(PKG_ROOT))).toBe(true);
  });
});
