import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AideConfig } from '../config';
import fs from 'fs';
import path from 'path';
import os from 'os';

function tempProjectDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aide-config-test-'));
}

function rmrf(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('AideConfig', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = tempProjectDir();
  });

  afterEach(() => {
    rmrf(projectRoot);
  });

  // ---- Test 1: Load default config when no file exists ----
  describe('default config', () => {
    it('loads defaults when no config file exists', () => {
      const config = new AideConfig(projectRoot);
      const full = config.list() as any;

      expect(full.version).toBe(1);
      expect(full.capture.enabled).toBe(true);
      expect(full.capture.hooks.preToolUse).toBe(true);
      expect(full.capture.hooks.stop).toBe(true);
      expect(full.capture.hooks.userPromptSubmit).toBe(true);
      expect(full.capture.hooks.preCompact).toBe(true);
      expect(full.nudge.visible).toBe(false);
      expect(full.tags.presets).toEqual([
        'architecture', 'testing', 'security', 'style',
        'integration', 'config', 'migration', 'performance', 'api-contract',
      ]);
      expect(full.telemetry.enabled).toBe(true);
      expect(full.contributor).toBe('auto');
      expect(full.embeddings.model).toBe('bge-small-en-v1.5');
      expect(full.embeddings.backend).toBe('transformers');
      expect(full.updates.check).toBe(true);
    });

    it('static defaults() returns the default config object', () => {
      const defaults = AideConfig.defaults() as any;
      expect(defaults.version).toBe(1);
      expect(defaults.capture.enabled).toBe(true);
      expect(defaults.tags.presets).toContain('architecture');
    });

    it('static defaults() returns a fresh copy each time', () => {
      const d1 = AideConfig.defaults() as any;
      const d2 = AideConfig.defaults() as any;
      d1.version = 999;
      expect(d2.version).toBe(1);
    });
  });

  // ---- Test 2: Load config from .aide/config.json ----
  describe('loading from file', () => {
    it('loads config from existing .aide/config.json', () => {
      const aideDir = path.join(projectRoot, '.aide');
      fs.mkdirSync(aideDir, { recursive: true });
      const customConfig = {
        version: 1,
        capture: {
          enabled: false,
          hooks: {
            preToolUse: false,
            stop: true,
            userPromptSubmit: true,
            preCompact: true,
          },
        },
        nudge: { visible: true },
        tags: { presets: ['custom-tag'] },
        telemetry: { enabled: false },
        contributor: 'meky',
        embeddings: { model: 'custom-model', backend: 'onnx' },
        updates: { check: false },
      };
      fs.writeFileSync(
        path.join(aideDir, 'config.json'),
        JSON.stringify(customConfig, null, 2),
        'utf-8'
      );

      const config = new AideConfig(projectRoot);
      expect(config.get('capture.enabled')).toBe(false);
      expect(config.get('capture.hooks.preToolUse')).toBe(false);
      expect(config.get('nudge.visible')).toBe(true);
      expect(config.get('tags.presets')).toEqual(['custom-tag']);
      expect(config.get('telemetry.enabled')).toBe(false);
      expect(config.get('contributor')).toBe('meky');
      expect(config.get('embeddings.model')).toBe('custom-model');
      expect(config.get('updates.check')).toBe(false);
    });

    it('fills missing keys from defaults when loading partial config', () => {
      const aideDir = path.join(projectRoot, '.aide');
      fs.mkdirSync(aideDir, { recursive: true });
      // Only override capture.enabled, everything else should come from defaults
      const partialConfig = {
        capture: { enabled: false },
      };
      fs.writeFileSync(
        path.join(aideDir, 'config.json'),
        JSON.stringify(partialConfig, null, 2),
        'utf-8'
      );

      const config = new AideConfig(projectRoot);
      expect(config.get('capture.enabled')).toBe(false);
      // These should come from defaults
      expect(config.get('capture.hooks.preToolUse')).toBe(true);
      expect(config.get('nudge.visible')).toBe(false);
      expect(config.get('telemetry.enabled')).toBe(true);
      expect(config.get('contributor')).toBe('auto');
    });
  });

  // ---- Test 3: Set nested value via dot notation ----
  describe('set()', () => {
    it('sets a nested boolean value via dot notation', () => {
      const config = new AideConfig(projectRoot);
      config.set('capture.enabled', false);
      expect(config.get('capture.enabled')).toBe(false);
    });

    it('sets a deeply nested value via dot notation', () => {
      const config = new AideConfig(projectRoot);
      config.set('capture.hooks.preToolUse', false);
      expect(config.get('capture.hooks.preToolUse')).toBe(false);
      // Other hooks should be unaffected
      expect(config.get('capture.hooks.stop')).toBe(true);
    });

    it('sets a top-level string value via dot notation', () => {
      const config = new AideConfig(projectRoot);
      config.set('contributor', 'ahmed');
      expect(config.get('contributor')).toBe('ahmed');
    });

    it('sets a nested string value via dot notation', () => {
      const config = new AideConfig(projectRoot);
      config.set('embeddings.model', 'all-MiniLM-L6-v2');
      expect(config.get('embeddings.model')).toBe('all-MiniLM-L6-v2');
    });

    it('persists set value to disk', () => {
      const config = new AideConfig(projectRoot);
      config.set('capture.enabled', false);

      // Read from disk directly
      const filePath = path.join(projectRoot, '.aide', 'config.json');
      const raw = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.capture.enabled).toBe(false);
    });
  });

  // ---- Test 4: Get nested value via dot notation ----
  describe('get()', () => {
    it('gets a top-level value', () => {
      const config = new AideConfig(projectRoot);
      expect(config.get('version')).toBe(1);
    });

    it('gets a nested boolean', () => {
      const config = new AideConfig(projectRoot);
      expect(config.get('capture.enabled')).toBe(true);
    });

    it('gets a deeply nested boolean', () => {
      const config = new AideConfig(projectRoot);
      expect(config.get('capture.hooks.preCompact')).toBe(true);
    });

    it('gets a string value', () => {
      const config = new AideConfig(projectRoot);
      expect(config.get('embeddings.backend')).toBe('transformers');
    });

    it('gets an array value', () => {
      const config = new AideConfig(projectRoot);
      const presets = config.get('tags.presets');
      expect(Array.isArray(presets)).toBe(true);
      expect(presets).toContain('architecture');
    });

    it('gets an object value', () => {
      const config = new AideConfig(projectRoot);
      const hooks = config.get('capture.hooks');
      expect(typeof hooks).toBe('object');
      expect(hooks.preToolUse).toBe(true);
    });

    it('returns undefined for non-existent path', () => {
      const config = new AideConfig(projectRoot);
      expect(config.get('this.does.not.exist')).toBeUndefined();
    });
  });

  // ---- Test 5: Add tag to presets ----
  describe('addTag()', () => {
    it('adds a new tag to presets', () => {
      const config = new AideConfig(projectRoot);
      config.addTag('deployment');
      expect(config.get('tags.presets')).toContain('deployment');
    });

    it('does not add a duplicate tag', () => {
      const config = new AideConfig(projectRoot);
      const originalLength = (config.get('tags.presets') as string[]).length;
      config.addTag('architecture'); // already in defaults
      expect((config.get('tags.presets') as string[]).length).toBe(originalLength);
    });

    it('persists added tag to disk', () => {
      const config = new AideConfig(projectRoot);
      config.addTag('deployment');

      const config2 = new AideConfig(projectRoot);
      expect(config2.get('tags.presets')).toContain('deployment');
    });
  });

  // ---- Test 6: Remove tag from presets ----
  describe('removeTag()', () => {
    it('removes an existing tag', () => {
      const config = new AideConfig(projectRoot);
      config.removeTag('architecture');
      expect(config.get('tags.presets')).not.toContain('architecture');
    });

    it('does nothing when removing non-existent tag', () => {
      const config = new AideConfig(projectRoot);
      const before = (config.get('tags.presets') as string[]).length;
      config.removeTag('nonexistent');
      expect((config.get('tags.presets') as string[]).length).toBe(before);
    });

    it('persists removed tag to disk', () => {
      const config = new AideConfig(projectRoot);
      config.removeTag('security');

      const config2 = new AideConfig(projectRoot);
      expect(config2.get('tags.presets')).not.toContain('security');
    });
  });

  // ---- Test 7: Reset to defaults ----
  describe('reset()', () => {
    it('restores all defaults', () => {
      const config = new AideConfig(projectRoot);
      config.set('capture.enabled', false);
      config.set('contributor', 'someone');
      config.addTag('custom-tag');

      config.reset();

      expect(config.get('capture.enabled')).toBe(true);
      expect(config.get('contributor')).toBe('auto');
      expect(config.get('tags.presets')).not.toContain('custom-tag');
      expect(config.get('tags.presets')).toContain('architecture');
    });

    it('persists reset to disk', () => {
      const config = new AideConfig(projectRoot);
      config.set('capture.enabled', false);
      config.reset();

      const config2 = new AideConfig(projectRoot);
      expect(config2.get('capture.enabled')).toBe(true);
    });
  });

  // ---- Test 8: Invalid key rejected with error ----
  describe('key validation', () => {
    it('rejects unknown top-level key', () => {
      const config = new AideConfig(projectRoot);
      expect(() => config.set('nonexistent', true)).toThrow(/Unknown config key/);
    });

    it('rejects unknown nested key', () => {
      const config = new AideConfig(projectRoot);
      expect(() => config.set('capture.bogus', true)).toThrow(/Unknown config key/);
    });

    it('rejects deeply unknown nested key', () => {
      const config = new AideConfig(projectRoot);
      expect(() => config.set('capture.hooks.onSave', true)).toThrow(/Unknown config key/);
    });

    it('error message lists valid keys', () => {
      const config = new AideConfig(projectRoot);
      try {
        config.set('bad.key', true);
      } catch (e: any) {
        expect(e.message).toContain('capture.enabled');
        expect(e.message).toContain('contributor');
      }
    });
  });

  // ---- Test 9: Invalid value type rejected with error ----
  describe('value type validation', () => {
    it('rejects string where boolean expected', () => {
      const config = new AideConfig(projectRoot);
      expect(() => config.set('capture.enabled', 'yes')).toThrow(/expected boolean, got string/);
    });

    it('rejects number where boolean expected', () => {
      const config = new AideConfig(projectRoot);
      expect(() => config.set('telemetry.enabled', 1)).toThrow(/expected boolean, got number/);
    });

    it('rejects boolean where string expected', () => {
      const config = new AideConfig(projectRoot);
      expect(() => config.set('contributor', true)).toThrow(/expected string, got boolean/);
    });

    it('rejects string where array expected', () => {
      const config = new AideConfig(projectRoot);
      expect(() => config.set('tags.presets', 'not-an-array')).toThrow(/expected array, got string/);
    });

    it('accepts correct types without error', () => {
      const config = new AideConfig(projectRoot);
      expect(() => config.set('capture.enabled', false)).not.toThrow();
      expect(() => config.set('contributor', 'meky')).not.toThrow();
      expect(() => config.set('tags.presets', ['a', 'b'])).not.toThrow();
    });
  });

  // ---- Test 10: Config survives malformed JSON ----
  describe('malformed JSON handling', () => {
    it('uses defaults when config file contains invalid JSON', () => {
      const aideDir = path.join(projectRoot, '.aide');
      fs.mkdirSync(aideDir, { recursive: true });
      fs.writeFileSync(
        path.join(aideDir, 'config.json'),
        '{ broken json here',
        'utf-8'
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = new AideConfig(projectRoot);

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Malformed JSON')
      );
      expect(config.get('capture.enabled')).toBe(true);
      expect(config.get('version')).toBe(1);

      warnSpy.mockRestore();
    });

    it('uses defaults when config file is empty', () => {
      const aideDir = path.join(projectRoot, '.aide');
      fs.mkdirSync(aideDir, { recursive: true });
      fs.writeFileSync(
        path.join(aideDir, 'config.json'),
        '',
        'utf-8'
      );

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const config = new AideConfig(projectRoot);

      expect(config.get('capture.enabled')).toBe(true);
      warnSpy.mockRestore();
    });
  });

  // ---- Test 11: Config file created on first set() if it doesn't exist ----
  describe('file creation', () => {
    it('creates .aide/config.json on first set() when file does not exist', () => {
      const configPath = path.join(projectRoot, '.aide', 'config.json');
      expect(fs.existsSync(configPath)).toBe(false);

      const config = new AideConfig(projectRoot);
      config.set('capture.enabled', false);

      expect(fs.existsSync(configPath)).toBe(true);
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.capture.enabled).toBe(false);
    });

    it('creates .aide directory if it does not exist', () => {
      const aideDir = path.join(projectRoot, '.aide');
      expect(fs.existsSync(aideDir)).toBe(false);

      const config = new AideConfig(projectRoot);
      config.set('version', 1);

      expect(fs.existsSync(aideDir)).toBe(true);
    });
  });

  // ---- Test 12: Multiple set() calls don't corrupt file ----
  describe('multiple operations', () => {
    it('multiple set() calls produce valid JSON each time', () => {
      const config = new AideConfig(projectRoot);
      const configPath = path.join(projectRoot, '.aide', 'config.json');

      config.set('capture.enabled', false);
      config.set('telemetry.enabled', false);
      config.set('contributor', 'meky');
      config.set('embeddings.model', 'custom-model');
      config.set('capture.hooks.preToolUse', false);

      // Read and validate the final file
      const raw = fs.readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw); // would throw if corrupted

      expect(parsed.capture.enabled).toBe(false);
      expect(parsed.telemetry.enabled).toBe(false);
      expect(parsed.contributor).toBe('meky');
      expect(parsed.embeddings.model).toBe('custom-model');
      expect(parsed.capture.hooks.preToolUse).toBe(false);
      // Unchanged values should still be present
      expect(parsed.capture.hooks.stop).toBe(true);
      expect(parsed.nudge.visible).toBe(false);
    });

    it('interleaved add/remove tags produce correct result', () => {
      const config = new AideConfig(projectRoot);

      config.addTag('deploy');
      config.addTag('monitoring');
      config.removeTag('architecture');
      config.addTag('logging');
      config.removeTag('deploy');

      const presets = config.get('tags.presets') as string[];
      expect(presets).toContain('monitoring');
      expect(presets).toContain('logging');
      expect(presets).not.toContain('architecture');
      expect(presets).not.toContain('deploy');

      // Verify on disk
      const config2 = new AideConfig(projectRoot);
      const presets2 = config2.get('tags.presets') as string[];
      expect(presets2).toEqual(presets);
    });

    it('set() followed by reset() followed by set() works correctly', () => {
      const config = new AideConfig(projectRoot);

      config.set('capture.enabled', false);
      expect(config.get('capture.enabled')).toBe(false);

      config.reset();
      expect(config.get('capture.enabled')).toBe(true);

      config.set('capture.enabled', false);
      expect(config.get('capture.enabled')).toBe(false);

      // Verify on disk
      const config2 = new AideConfig(projectRoot);
      expect(config2.get('capture.enabled')).toBe(false);
    });
  });

  // ---- list() returns a copy ----
  describe('list()', () => {
    it('returns the full config object', () => {
      const config = new AideConfig(projectRoot);
      const full = config.list() as any;

      expect(full.version).toBe(1);
      expect(full.capture).toBeDefined();
      expect(full.nudge).toBeDefined();
      expect(full.tags).toBeDefined();
      expect(full.telemetry).toBeDefined();
      expect(full.contributor).toBeDefined();
      expect(full.embeddings).toBeDefined();
      expect(full.updates).toBeDefined();
    });

    it('returns a copy — mutations do not affect internal state', () => {
      const config = new AideConfig(projectRoot);
      const full = config.list() as any;
      full.capture.enabled = false;
      full.contributor = 'hacked';

      // Internal state should be unchanged
      expect(config.get('capture.enabled')).toBe(true);
      expect(config.get('contributor')).toBe('auto');
    });
  });
});
