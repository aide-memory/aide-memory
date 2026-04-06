import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ScopeResolver } from '../scopes';
import fs from 'fs';
import path from 'path';
import os from 'os';

const FIXTURE_FILES = [
  'src/components/Button.tsx',
  'src/components/Input.tsx',
  'src/components/dashboard/Sidebar.tsx',
  'src/components/dashboard/Header.tsx',
  'src/memory/store.ts',
  'src/memory/recall.ts',
  'src/memory/__tests__/store.test.ts',
  'src/utils/helpers.ts',
  'README.md',
  'package.json',
];

function createTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-scope-test-'));
  for (const file of FIXTURE_FILES) {
    const fullPath = path.join(dir, file);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, `// ${file}`);
  }
  return dir;
}

describe('ScopeResolver', () => {
  let projectRoot: string;
  let resolver: ScopeResolver;

  beforeEach(() => {
    projectRoot = createTempProject();
    resolver = new ScopeResolver(projectRoot);
  });

  afterEach(() => {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  });

  describe('validate', () => {
    it('accepts a valid glob pattern', () => {
      expect(resolver.validate('src/components/**')).toEqual({ valid: true });
    });

    it('accepts "project" as a special scope', () => {
      expect(resolver.validate('project')).toEqual({ valid: true });
    });

    it('accepts exact directory paths', () => {
      expect(resolver.validate('src/memory')).toEqual({ valid: true });
    });

    it('accepts patterns with brace expansion', () => {
      expect(resolver.validate('src/**/*.{ts,tsx}')).toEqual({ valid: true });
    });

    it('rejects empty string', () => {
      const result = resolver.validate('');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/empty/i);
    });

    it('rejects whitespace-only string', () => {
      const result = resolver.validate('   ');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/empty/i);
    });

    it('rejects ../ escape attempts', () => {
      const result = resolver.validate('../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/escape/i);
    });

    it('rejects patterns with ../ in the middle', () => {
      const result = resolver.validate('src/../../etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/escape/i);
    });

    it('rejects absolute unix paths', () => {
      const result = resolver.validate('/etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/escape/i);
    });

    it('rejects absolute windows paths', () => {
      const result = resolver.validate('C:\\Users\\something');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/escape/i);
    });

    it('rejects null bytes', () => {
      const result = resolver.validate('src/\0components');
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/null/i);
    });

    it('rejects excessively long patterns', () => {
      const result = resolver.validate('a'.repeat(501));
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/length/i);
    });

    it('rejects non-string input', () => {
      const result = resolver.validate(42 as any);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/string/i);
    });
  });

  describe('resolve', () => {
    it('resolves a glob pattern to matching files', async () => {
      const files = await resolver.resolve('src/components/**');
      expect(files).toContain('src/components/Button.tsx');
      expect(files).toContain('src/components/Input.tsx');
      expect(files).toContain('src/components/dashboard/Sidebar.tsx');
      expect(files).toContain('src/components/dashboard/Header.tsx');
      expect(files).not.toContain('src/memory/store.ts');
    });

    it('resolves "project" to all files', async () => {
      const files = await resolver.resolve('project');
      expect(files).toHaveLength(FIXTURE_FILES.length);
      expect(files).toContain('src/components/Button.tsx');
      expect(files).toContain('src/memory/store.ts');
      expect(files).toContain('README.md');
    });

    it('treats falsy value as project-wide', async () => {
      const files = await resolver.resolve(null as any);
      expect(files).toHaveLength(FIXTURE_FILES.length);
    });

    it('returns relative paths, not absolute', async () => {
      const files = await resolver.resolve('src/components/**');
      for (const file of files) {
        expect(path.isAbsolute(file)).toBe(false);
      }
    });

    it('returns sorted results', async () => {
      const files = await resolver.resolve('src/components/**');
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });

    it('resolves a bare directory name with implicit /**', async () => {
      const files = await resolver.resolve('src/memory');
      expect(files).toContain('src/memory/store.ts');
      expect(files).toContain('src/memory/recall.ts');
      expect(files).toContain('src/memory/__tests__/store.test.ts');
    });

    it('resolves nested glob patterns', async () => {
      const files = await resolver.resolve('src/components/dashboard/**');
      expect(files).toEqual([
        'src/components/dashboard/Header.tsx',
        'src/components/dashboard/Sidebar.tsx',
      ]);
    });

    it('returns empty array for non-matching pattern', async () => {
      const files = await resolver.resolve('nonexistent/**');
      expect(files).toEqual([]);
    });

    it('returns empty array for pattern matching no files', async () => {
      const files = await resolver.resolve('src/**/*.go');
      expect(files).toEqual([]);
    });

    it('respects ignore patterns', async () => {
      const nmPath = path.join(projectRoot, 'node_modules', 'foo', 'index.js');
      fs.mkdirSync(path.dirname(nmPath), { recursive: true });
      fs.writeFileSync(nmPath, '// ignored');

      const files = await resolver.resolve('**/*.js');
      expect(files).not.toContain('node_modules/foo/index.js');
    });
  });

  describe('expand', () => {
    it('merges results from multiple patterns', async () => {
      const files = await resolver.expand([
        'src/components/**',
        'src/memory/**',
      ]);
      expect(files).toContain('src/components/Button.tsx');
      expect(files).toContain('src/memory/store.ts');
    });

    it('deduplicates overlapping patterns', async () => {
      const files = await resolver.expand([
        'src/components/**',
        'src/components/dashboard/**',
      ]);
      const counts = new Map<string, number>();
      for (const f of files) {
        counts.set(f, (counts.get(f) ?? 0) + 1);
      }
      for (const count of counts.values()) {
        expect(count).toBe(1);
      }
    });

    it('returns sorted results', async () => {
      const files = await resolver.expand([
        'src/memory/**',
        'src/components/**',
      ]);
      const sorted = [...files].sort();
      expect(files).toEqual(sorted);
    });

    it('returns empty array for empty input', async () => {
      const files = await resolver.expand([]);
      expect(files).toEqual([]);
    });

    it('handles mix of specific file and broad pattern', async () => {
      const files = await resolver.expand([
        'src/components/Button.tsx',
        'src/memory/**',
      ]);
      expect(files).toContain('src/components/Button.tsx');
      expect(files).toContain('src/memory/store.ts');
    });

    it('handles "project" in a list of patterns', async () => {
      const allFiles = await resolver.resolve('project');
      const expanded = await resolver.expand([
        'project',
        'src/components/**',
      ]);
      expect(expanded).toEqual(allFiles);
    });
  });
});
