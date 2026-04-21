/**
 * Tests for init seeding every public setting into .aide/config.json so
 * users can `cat .aide/config.json` and see all 18 knobs. Fresh inits,
 * repeat inits, upgraded inits (autoUpdateIfNeeded), and user overrides
 * are all covered.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initProject, autoUpdateIfNeeded } from '../init';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { loadDefaults, listPublicDefaults } from '../settings';

function createTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-seed-'));
  const { execSync } = require('child_process');
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function readConfig(projectRoot: string): Record<string, any> {
  const p = path.join(projectRoot, '.aide', 'config.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getNested(obj: any, dotKey: string): unknown {
  const parts = dotKey.split('.');
  let cur = obj;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined;
    cur = cur[p];
  }
  return cur;
}

describe('init seeds public settings into .aide/config.json', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProject();
  });

  afterEach(() => {
    cleanupDir(projectRoot);
  });

  it('writes every public defaults.json key on a fresh init', async () => {
    await initProject(projectRoot);

    const config = readConfig(projectRoot);
    const publicDefaults = listPublicDefaults();

    // Every public key (dot-path) must resolve to a value in the written
    // config matching the default.
    for (const [key, expected] of Object.entries(publicDefaults)) {
      const actual = getNested(config, key);
      expect(actual, `key ${key}`).toEqual(expected);
    }
  });

  it('includes all 18 defaults.json settings as public', () => {
    const defaults = loadDefaults();
    const keys = Object.keys(defaults);
    expect(keys.length).toBe(18);
    // Every setting must be flagged public per Phase 1 decision.
    for (const key of keys) {
      expect(defaults[key].public, `key ${key}`).toBe(true);
    }
  });

  it('preserves user overrides across a second init', async () => {
    await initProject(projectRoot);

    // Mutate a knob
    const configPath = path.join(projectRoot, '.aide', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    cfg.hooks = cfg.hooks || {};
    cfg.hooks.read = cfg.hooks.read || {};
    cfg.hooks.read.maxBlocks = 0;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');

    // Re-init (idempotent, no --force)
    await initProject(projectRoot);

    const after = readConfig(projectRoot);
    expect(after.hooks.read.maxBlocks).toBe(0);
  });

  it('preserves non-aide keys the user added', async () => {
    await initProject(projectRoot);

    const configPath = path.join(projectRoot, '.aide', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    cfg.myOwnKey = { foo: 'bar' };
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');

    await initProject(projectRoot);

    const after = readConfig(projectRoot);
    expect(after.myOwnKey).toEqual({ foo: 'bar' });
  });

  it('seeds a new knob on upgrade (simulated via autoUpdateIfNeeded)', async () => {
    await initProject(projectRoot);

    // Simulate an older install: drop one of the new knobs from config,
    // and stamp an older package version so autoUpdate fires.
    const configPath = path.join(projectRoot, '.aide', 'config.json');
    const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Pretend hooks.precompact.mode wasn't seeded before
    if (cfg.hooks?.precompact) delete cfg.hooks.precompact;
    fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2) + '\n');

    // Bump settings.json version stamp down to force auto-update
    const settingsPath = path.join(projectRoot, '.claude', 'settings.json');
    const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    settings._aideMemoryVersion = '0.0.0';
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

    autoUpdateIfNeeded(projectRoot, '99.0.0');

    const after = readConfig(projectRoot);
    // The knob should be back, seeded from defaults.json.
    expect(after.hooks.precompact.mode).toBe('cleanup');
  });
});
