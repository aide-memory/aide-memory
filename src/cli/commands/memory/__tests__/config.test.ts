/**
 * Tests for `aide-memory config memories.hideFromGrep` side effect:
 * setting the key must keep the on-disk `.ignore` file in sync with the
 * desired state, preserving user-added entries and migrating any legacy
 * (pre-marker) `.aide/memories/` line.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runConfig } from '../config';
import {
  IGNORE_BEGIN_MARKER,
  IGNORE_END_MARKER,
  MEMORIES_IGNORE_ENTRY,
} from '../../../../memory/ignoreFile';

function createTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-config-test-'));
  fs.mkdirSync(path.join(dir, '.aide'), { recursive: true });
  // Seed a minimal config.json so requireProjectRoot succeeds.
  fs.writeFileSync(
    path.join(dir, '.aide', 'config.json'),
    JSON.stringify({ version: 1 }, null, 2) + '\n',
    'utf8'
  );
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Run runConfig() with cwd pointed at the temp project. runConfig uses
 * requireProjectRoot() which walks up from process.cwd(), so chdir is the
 * cleanest way to isolate each test case.
 */
function runConfigIn(projectRoot: string, key: string, value?: string): void {
  const prevCwd = process.cwd();
  process.chdir(projectRoot);
  try {
    runConfig(key, value);
  } finally {
    process.chdir(prevCwd);
  }
}

describe('runConfig — memories.hideFromGrep side effect', () => {
  let projectRoot: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    projectRoot = createTempProject();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    cleanupDir(projectRoot);
  });

  it('creates .ignore with managed markers when set to true on a clean project', () => {
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');

    const ignorePath = path.join(projectRoot, '.ignore');
    expect(fs.existsSync(ignorePath)).toBe(true);
    const content = fs.readFileSync(ignorePath, 'utf8');
    expect(content).toContain(IGNORE_BEGIN_MARKER);
    expect(content).toContain(MEMORIES_IGNORE_ENTRY);
    expect(content).toContain(IGNORE_END_MARKER);
  });

  it('removes the managed section when set to false', () => {
    // First enable, then disable.
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');
    expect(fs.existsSync(path.join(projectRoot, '.ignore'))).toBe(true);

    runConfigIn(projectRoot, 'memories.hideFromGrep', 'false');

    const ignorePath = path.join(projectRoot, '.ignore');
    // With no user entries, the file should be removed entirely.
    expect(fs.existsSync(ignorePath)).toBe(false);
  });

  it('toggles true → false → true cleanly without duplicating the entry', () => {
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'false');
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');

    const content = fs.readFileSync(path.join(projectRoot, '.ignore'), 'utf8');
    const beginCount = (content.match(new RegExp(IGNORE_BEGIN_MARKER, 'g')) || []).length;
    const entryCount = (content.match(/\.aide\/memories\//g) || []).length;
    expect(beginCount).toBe(1);
    expect(entryCount).toBe(1);
  });

  it('preserves user-added entries when disabling', () => {
    const ignorePath = path.join(projectRoot, '.ignore');
    fs.writeFileSync(ignorePath, 'dist/\nbuild/artifacts/\n', 'utf8');

    // Enable (adds managed section alongside user entries).
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');
    let content = fs.readFileSync(ignorePath, 'utf8');
    expect(content).toContain('dist/');
    expect(content).toContain('build/artifacts/');
    expect(content).toContain(IGNORE_BEGIN_MARKER);

    // Disable — managed section goes away, user entries remain.
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'false');
    content = fs.readFileSync(ignorePath, 'utf8');
    expect(content).toContain('dist/');
    expect(content).toContain('build/artifacts/');
    expect(content).not.toContain(IGNORE_BEGIN_MARKER);
    expect(content).not.toContain(MEMORIES_IGNORE_ENTRY);
  });

  it('preserves user-added entries when re-enabling', () => {
    const ignorePath = path.join(projectRoot, '.ignore');
    fs.writeFileSync(ignorePath, '# my ignore\nnode_modules/\n.env.local\n', 'utf8');

    runConfigIn(projectRoot, 'memories.hideFromGrep', 'false');
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');

    const content = fs.readFileSync(ignorePath, 'utf8');
    expect(content).toContain('# my ignore');
    expect(content).toContain('node_modules/');
    expect(content).toContain('.env.local');
    expect(content).toContain(IGNORE_BEGIN_MARKER);
    expect(content).toContain(MEMORIES_IGNORE_ENTRY);
  });

  it('migrates a legacy .ignore (no markers, bare entry) into the managed form', () => {
    // Simulate a .ignore written by an older `aide-memory init` — no markers,
    // just the bare `.aide/memories/` line mixed with user entries.
    const ignorePath = path.join(projectRoot, '.ignore');
    fs.writeFileSync(ignorePath, 'dist/\n.aide/memories/\ncoverage/\n', 'utf8');

    // Re-apply hideFromGrep=true: the bare line should be moved inside markers,
    // not left in place as a duplicate.
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');

    const content = fs.readFileSync(ignorePath, 'utf8');
    const entryCount = (content.match(/\.aide\/memories\//g) || []).length;
    expect(entryCount).toBe(1);
    expect(content).toContain(IGNORE_BEGIN_MARKER);
    expect(content).toContain(IGNORE_END_MARKER);
    expect(content).toContain('dist/');
    expect(content).toContain('coverage/');

    // Verify the single remaining entry is inside the managed block.
    const begin = content.indexOf(IGNORE_BEGIN_MARKER);
    const end = content.indexOf(IGNORE_END_MARKER);
    const entryIdx = content.indexOf(MEMORIES_IGNORE_ENTRY);
    expect(begin).toBeLessThan(entryIdx);
    expect(entryIdx).toBeLessThan(end);
  });

  it('strips a legacy bare entry when disabling (even without markers)', () => {
    const ignorePath = path.join(projectRoot, '.ignore');
    fs.writeFileSync(ignorePath, 'dist/\n.aide/memories/\n', 'utf8');

    runConfigIn(projectRoot, 'memories.hideFromGrep', 'false');

    const content = fs.readFileSync(ignorePath, 'utf8');
    expect(content).toContain('dist/');
    expect(content).not.toContain(MEMORIES_IGNORE_ENTRY);
  });

  it('writes the config value and resync in the same invocation', () => {
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'false');

    const config = JSON.parse(
      fs.readFileSync(path.join(projectRoot, '.aide', 'config.json'), 'utf8')
    );
    expect(config.memories.hideFromGrep).toBe(false);
    expect(fs.existsSync(path.join(projectRoot, '.ignore'))).toBe(false);
  });

  it('does not touch .ignore when an unrelated config key is set', () => {
    const ignorePath = path.join(projectRoot, '.ignore');
    const before = 'user-entry/\n';
    fs.writeFileSync(ignorePath, before, 'utf8');

    runConfigIn(projectRoot, 'capture.enabled', 'false');

    const after = fs.readFileSync(ignorePath, 'utf8');
    expect(after).toBe(before);
  });

  it('smoke: user entries + comments around managed section survive a full toggle cycle', () => {
    const ignorePath = path.join(projectRoot, '.ignore');
    const original = [
      '# project ignores',
      'dist/',
      'coverage/',
      '',
      '# secrets',
      '.env',
      '.env.*.local',
      '',
    ].join('\n');
    fs.writeFileSync(ignorePath, original, 'utf8');

    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'false');
    runConfigIn(projectRoot, 'memories.hideFromGrep', 'true');

    const content = fs.readFileSync(ignorePath, 'utf8');
    const lines = content.split('\n');
    // Every user line appears exactly once as its own line (line-anchored check).
    for (const userLine of ['# project ignores', 'dist/', 'coverage/', '# secrets', '.env', '.env.*.local']) {
      const count = lines.filter((l) => l === userLine).length;
      expect({ userLine, count }).toEqual({ userLine, count: 1 });
    }
    expect((content.match(new RegExp(IGNORE_BEGIN_MARKER, 'g')) || []).length).toBe(1);
    expect((content.match(/\.aide\/memories\//g) || []).length).toBe(1);
  });
});
