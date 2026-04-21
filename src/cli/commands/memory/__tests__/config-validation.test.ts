/**
 * Tests for `aide-memory config <key>` key validation.
 *
 * Validation source: defaults.json (18 hook/recall/injection knobs) PLUS
 * AideConfig schema (capture/telemetry/tags). Anything outside both is
 * rejected with a clear error — prevents silent typos from writing
 * garbage into .aide/config.json.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runConfig, validateConfigKey, collectValidKeys } from '../config';

function createTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-config-valid-'));
  fs.mkdirSync(path.join(dir, '.aide'), { recursive: true });
  // requireProjectRoot() walks up looking for .aide/config.json — seed a minimal one.
  fs.writeFileSync(
    path.join(dir, '.aide', 'config.json'),
    JSON.stringify({ version: 1 }, null, 2) + '\n',
    'utf8'
  );
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

function withCwd<T>(dir: string, fn: () => T): T {
  const prev = process.cwd();
  process.chdir(dir);
  try {
    return fn();
  } finally {
    process.chdir(prev);
  }
}

describe('validateConfigKey', () => {
  it('accepts every key declared in defaults.json', () => {
    // Pull the defaults file directly so this test fails loudly if the
    // validator drifts from the declared set.
    const defaultsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'scripts', 'hooks', 'defaults.json');
    const defaults = JSON.parse(fs.readFileSync(defaultsPath, 'utf8')) as Record<string, unknown>;
    for (const key of Object.keys(defaults)) {
      const result = validateConfigKey(key);
      expect(result.ok).toBe(true);
    }
  });

  it('accepts legacy AideConfig keys like capture.enabled', () => {
    expect(validateConfigKey('capture.enabled').ok).toBe(true);
    expect(validateConfigKey('capture.hooks.preToolUse').ok).toBe(true);
    expect(validateConfigKey('telemetry.enabled').ok).toBe(true);
    expect(validateConfigKey('contributor').ok).toBe(true);
  });

  it('rejects unknown keys with a helpful message', () => {
    const result = validateConfigKey('hooks.read.maxBlokcs'); // typo
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Unknown config key');
      expect(result.message).toContain('hooks.read.maxBlocks'); // suggestion
    }
  });

  it('rejects completely bogus keys', () => {
    const result = validateConfigKey('lol.this.does.not.exist');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toContain('Unknown config key');
    }
  });

  it('lists recognized keys in the error message', () => {
    const result = validateConfigKey('nope');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // At least one defaults.json key should be listed.
      expect(result.message).toMatch(/hooks\.read\.maxBlocks/);
    }
  });
});

describe('collectValidKeys', () => {
  it('includes all 18 public defaults.json keys', () => {
    const keys = collectValidKeys();
    const expected = [
      'hooks.read.maxBlocks',
      'hooks.edit.maxBlocks',
      'hooks.directoryTrigger.maxBlocks',
      'hooks.stop.schedule',
      'hooks.search.mode',
      'hooks.correction.enabled',
      'hooks.precompact.mode',
      'recall.minScopeDepth',
      'recall.limit',
      'recall.ensureLayerDiversity',
      'recall.layerDiversityMinLimit',
      'injection.preferences',
      'injection.technical',
      'injection.area_context',
      'injection.guidelines',
      'injection.priorityAlwaysOverride',
      'memories.hideFromGrep',
      'memories.softening.threshold',
    ];
    for (const key of expected) {
      expect(keys).toContain(key);
    }
  });

  it('includes legacy AideConfig leaves', () => {
    const keys = collectValidKeys();
    expect(keys).toContain('capture.enabled');
    expect(keys).toContain('capture.hooks.stop');
    expect(keys).toContain('telemetry.enabled');
  });

  it('returns a sorted list', () => {
    const keys = collectValidKeys();
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
  });
});

describe('runConfig with validation', () => {
  let projectRoot: string;
  let originalExitCode: number | undefined;

  beforeEach(() => {
    projectRoot = createTempProject();
    originalExitCode = typeof process.exitCode === 'number' ? process.exitCode : undefined;
    process.exitCode = 0;
  });

  afterEach(() => {
    cleanupDir(projectRoot);
    process.exitCode = originalExitCode ?? 0;
  });

  it('sets a known defaults.json key', () => {
    withCwd(projectRoot, () => {
      runConfig('hooks.read.maxBlocks', '0');
    });
    const cfg = JSON.parse(fs.readFileSync(path.join(projectRoot, '.aide', 'config.json'), 'utf8'));
    expect(cfg.hooks.read.maxBlocks).toBe(0);
  });

  it('rejects an unknown key and does not write to config', () => {
    const before = fs.readFileSync(path.join(projectRoot, '.aide', 'config.json'), 'utf8');
    withCwd(projectRoot, () => {
      runConfig('totally.bogus.key', 'value');
    });
    expect(process.exitCode).toBe(1);
    const after = fs.readFileSync(path.join(projectRoot, '.aide', 'config.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('rejects a typo like hooks.read.maxBlokcs', () => {
    const before = fs.readFileSync(path.join(projectRoot, '.aide', 'config.json'), 'utf8');
    withCwd(projectRoot, () => {
      runConfig('hooks.read.maxBlokcs', '0'); // typo
    });
    expect(process.exitCode).toBe(1);
    const after = fs.readFileSync(path.join(projectRoot, '.aide', 'config.json'), 'utf8');
    expect(after).toBe(before);
  });

  it('allows reading a known key that is unset (prints "(not set)")', () => {
    withCwd(projectRoot, () => {
      // Reading an un-set-but-valid key should NOT fail the process.
      runConfig('hooks.read.maxBlocks');
    });
    // Exit code stays 0 (success).
    expect(process.exitCode || 0).toBe(0);
  });

  it('rejects reading an unknown key', () => {
    withCwd(projectRoot, () => {
      runConfig('nope.not.real');
    });
    expect(process.exitCode).toBe(1);
  });
});
