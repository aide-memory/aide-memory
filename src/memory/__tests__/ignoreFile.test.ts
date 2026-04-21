/**
 * Unit tests for the shared `.ignore` syncer used by
 * `aide-memory init` and `aide-memory config memories.hideFromGrep`.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import {
  syncIgnoreFile,
  readHideFromGrep,
  IGNORE_BEGIN_MARKER,
  IGNORE_END_MARKER,
  MEMORIES_IGNORE_ENTRY,
} from '../ignoreFile';

function mkTmp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aide-ignore-test-'));
}

function rm(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

describe('syncIgnoreFile', () => {
  let root: string;

  beforeEach(() => { root = mkTmp(); });
  afterEach(() => { rm(root); });

  it('creates .ignore with markers when hide=true and no file exists', () => {
    const result = syncIgnoreFile(root, true);
    expect(result.changed).toBe(true);
    const content = fs.readFileSync(result.ignorePath, 'utf8');
    expect(content).toMatch(new RegExp(`${IGNORE_BEGIN_MARKER}\\n${MEMORIES_IGNORE_ENTRY.replace(/\//g, '\\/')}\\n${IGNORE_END_MARKER}`));
  });

  it('is idempotent when hide=true and the managed block already exists', () => {
    syncIgnoreFile(root, true);
    const snapshot = fs.readFileSync(path.join(root, '.ignore'), 'utf8');
    const result = syncIgnoreFile(root, true);
    expect(result.changed).toBe(false);
    expect(fs.readFileSync(path.join(root, '.ignore'), 'utf8')).toBe(snapshot);
  });

  it('removes the managed block when hide=false (no other content → file deleted)', () => {
    syncIgnoreFile(root, true);
    const result = syncIgnoreFile(root, false);
    expect(result.changed).toBe(true);
    expect(fs.existsSync(path.join(root, '.ignore'))).toBe(false);
  });

  it('preserves user entries when toggling', () => {
    const ignorePath = path.join(root, '.ignore');
    fs.writeFileSync(ignorePath, 'dist/\n# mine\nvendor/\n', 'utf8');

    syncIgnoreFile(root, true);
    let content = fs.readFileSync(ignorePath, 'utf8');
    expect(content).toContain('dist/');
    expect(content).toContain('# mine');
    expect(content).toContain('vendor/');
    expect(content).toContain(IGNORE_BEGIN_MARKER);

    syncIgnoreFile(root, false);
    content = fs.readFileSync(ignorePath, 'utf8');
    expect(content).toContain('dist/');
    expect(content).toContain('# mine');
    expect(content).toContain('vendor/');
    expect(content).not.toContain(IGNORE_BEGIN_MARKER);
    expect(content).not.toContain(MEMORIES_IGNORE_ENTRY);
  });

  it('migrates a legacy bare `.aide/memories/` entry into the managed block', () => {
    const ignorePath = path.join(root, '.ignore');
    fs.writeFileSync(ignorePath, 'dist/\n.aide/memories/\ncoverage/\n', 'utf8');

    const result = syncIgnoreFile(root, true);
    expect(result.changed).toBe(true);
    const content = fs.readFileSync(ignorePath, 'utf8');

    // Single entry, inside markers.
    expect((content.match(/\.aide\/memories\//g) || []).length).toBe(1);
    const begin = content.indexOf(IGNORE_BEGIN_MARKER);
    const entry = content.indexOf(MEMORIES_IGNORE_ENTRY);
    const end = content.indexOf(IGNORE_END_MARKER);
    expect(begin).toBeGreaterThanOrEqual(0);
    expect(begin).toBeLessThan(entry);
    expect(entry).toBeLessThan(end);
    // User entries preserved.
    expect(content).toContain('dist/');
    expect(content).toContain('coverage/');
  });

  it('strips a legacy bare entry when disabling', () => {
    const ignorePath = path.join(root, '.ignore');
    fs.writeFileSync(ignorePath, 'dist/\n.aide/memories/\n', 'utf8');
    syncIgnoreFile(root, false);
    const content = fs.readFileSync(ignorePath, 'utf8');
    expect(content).toContain('dist/');
    expect(content).not.toContain(MEMORIES_IGNORE_ENTRY);
  });

  it('does not pile up blank lines on repeated toggles', () => {
    const ignorePath = path.join(root, '.ignore');
    fs.writeFileSync(ignorePath, 'dist/\n', 'utf8');

    for (let i = 0; i < 5; i++) {
      syncIgnoreFile(root, true);
      syncIgnoreFile(root, false);
    }
    syncIgnoreFile(root, true);

    const content = fs.readFileSync(ignorePath, 'utf8');
    // Shouldn't have more than one blank line run anywhere.
    expect(content).not.toMatch(/\n\n\n/);
  });
});

describe('readHideFromGrep', () => {
  let root: string;

  beforeEach(() => { root = mkTmp(); });
  afterEach(() => { rm(root); });

  it('defaults to true when config.json is missing', () => {
    expect(readHideFromGrep(root)).toBe(true);
  });

  it('returns true when memories.hideFromGrep is unset', () => {
    fs.mkdirSync(path.join(root, '.aide'));
    fs.writeFileSync(path.join(root, '.aide', 'config.json'), '{}', 'utf8');
    expect(readHideFromGrep(root)).toBe(true);
  });

  it('returns false only when memories.hideFromGrep === false', () => {
    fs.mkdirSync(path.join(root, '.aide'));
    fs.writeFileSync(
      path.join(root, '.aide', 'config.json'),
      JSON.stringify({ memories: { hideFromGrep: false } }),
      'utf8'
    );
    expect(readHideFromGrep(root)).toBe(false);
  });

  it('falls back to true on malformed JSON', () => {
    fs.mkdirSync(path.join(root, '.aide'));
    fs.writeFileSync(path.join(root, '.aide', 'config.json'), '{not json', 'utf8');
    expect(readHideFromGrep(root)).toBe(true);
  });
});
