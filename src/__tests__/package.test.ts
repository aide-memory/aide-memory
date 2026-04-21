import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');

describe('package.aide-memory.json', () => {
  const pkgPath = path.join(ROOT, 'package.aide-memory.json');

  it('is valid JSON', () => {
    const raw = fs.readFileSync(pkgPath, 'utf-8');
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  it('has correct name', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.name).toBe('aide-memory');
  });

  it('has a valid semver version', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.version).toMatch(/^\d+\.\d+\.\d+(-[A-Za-z0-9.-]+)?$/);
  });

  it('has bin entries for aide and aide-memory', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.bin).toBeDefined();
    expect(pkg.bin.aide).toBe('dist/cli/aide-memory.js');
    expect(pkg.bin['aide-memory']).toBe('dist/cli/aide-memory.js');
  });

  it('has main pointing to memory index', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.main).toBe('dist/memory/index.js');
  });

  it('files array includes required paths (minified publish: bundled entries only)', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.files).toBeDefined();
    // Single bundled CLI entry (esbuild output)
    expect(pkg.files).toContain('dist/cli/aide-memory.js');
    // Single bundled library entry (esbuild output)
    expect(pkg.files).toContain('dist/memory/index.js');
    // MCP server entry (spawned via .mcp.json); bundled separately
    expect(pkg.files).toContain('dist/memory/cli.js');
    // Hook shims — 4-line bash files that `exec` into the bundled CLI's
    // `hook <name>` subcommand. Each hook's algorithmic logic lives inside
    // the bundle, not in the shim. Node helpers (.js) and defaults.json
    // are no longer shipped — their logic is inlined into the bundle.
    expect(pkg.files).toContain('scripts/hooks/*.sh');
    // Rule templates (no trailing slash in allowlist form)
    expect(pkg.files).toContain('src/templates/rules');
    expect(pkg.files).toContain('README.md');
    expect(pkg.files).toContain('LICENSE.md');
  });

  it('files array does NOT include per-command or tsc-output globs (would leak unbundled source)', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    // These were in 0.1.1 but would ship tsc output unbundled — source-leak risk.
    expect(pkg.files).not.toContain('dist/memory/*.js');
    expect(pkg.files).not.toContain('dist/cli/commands/memory/');
    expect(pkg.files).not.toContain('dist/');
    expect(pkg.files).not.toContain('src/');
    // Node hook helpers and defaults.json must NOT ship — they were shipped
    // pre-0.4.0 which leaked hook algorithm source readable on user disk.
    expect(pkg.files).not.toContain('scripts/hooks/*.js');
    expect(pkg.files).not.toContain('scripts/hooks/defaults.json');
  });

  it('has only native-dep runtime dependencies (everything else bundled at publish time)', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    // better-sqlite3 must remain external — it's a native N-API addon that
    // resolves a platform-specific .node file from the user's node_modules.
    expect(pkg.dependencies['better-sqlite3']).toBeDefined();
  });

  it('does NOT list pure-JS deps as runtime dependencies (they are bundled by esbuild)', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    // commander, zod, @modelcontextprotocol/sdk, chalk, fast-glob are all
    // bundled into dist/cli/aide-memory.js and dist/memory/index.js at
    // publish time. They should NOT appear as runtime dependencies,
    // otherwise npm will pull them in twice (bundled + installed).
    expect(pkg.dependencies.commander).toBeUndefined();
    expect(pkg.dependencies.zod).toBeUndefined();
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeUndefined();
    expect(pkg.dependencies.chalk).toBeUndefined();
    expect(pkg.dependencies['fast-glob']).toBeUndefined();
  });

  it('does not include old aide-v0 dependencies', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.dependencies.axios).toBeUndefined();
    expect(pkg.dependencies.express).toBeUndefined();
    expect(pkg.dependencies.chokidar).toBeUndefined();
    expect(pkg.dependencies.marked).toBeUndefined();
    expect(pkg.dependencies['ts-morph']).toBeUndefined();
    expect(pkg.dependencies['web-tree-sitter']).toBeUndefined();
    expect(pkg.dependencies.ws).toBeUndefined();
  });

  it('keeps @huggingface/transformers as optionalDependencies (external, dynamic-imported)', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.optionalDependencies).toBeDefined();
    expect(pkg.optionalDependencies['@huggingface/transformers']).toBeDefined();
  });

  it('requires node >= 18', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.engines.node).toBe('>=18.0.0');
  });

  it('has proper metadata fields', () => {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    expect(pkg.description).toBeTruthy();
    expect(pkg.keywords).toBeDefined();
    expect(pkg.keywords.length).toBeGreaterThan(0);
    expect(pkg.repository).toBeDefined();
    expect(pkg.homepage).toBeDefined();
  });
});

describe('build script', () => {
  it('scripts/build.sh exists', () => {
    const buildPath = path.join(ROOT, 'scripts', 'build.sh');
    expect(fs.existsSync(buildPath)).toBe(true);
  });

  it('scripts/build.sh is executable', () => {
    const buildPath = path.join(ROOT, 'scripts', 'build.sh');
    const stats = fs.statSync(buildPath);
    // Check that at least one execute bit is set (owner, group, or other)
    const isExecutable = (stats.mode & 0o111) !== 0;
    expect(isExecutable).toBe(true);
  });

  it('scripts/build.sh contains tsc command', () => {
    const buildPath = path.join(ROOT, 'scripts', 'build.sh');
    const content = fs.readFileSync(buildPath, 'utf-8');
    expect(content).toContain('tsc');
  });
});

describe('README.npm.md', () => {
  it('exists', () => {
    const readmePath = path.join(ROOT, 'README.npm.md');
    expect(fs.existsSync(readmePath)).toBe(true);
  });

  it('contains install command', () => {
    const readmePath = path.join(ROOT, 'README.npm.md');
    const content = fs.readFileSync(readmePath, 'utf-8');
    expect(content).toContain('npx aide-memory init');
  });

  it('contains aide-memory name', () => {
    const readmePath = path.join(ROOT, 'README.npm.md');
    const content = fs.readFileSync(readmePath, 'utf-8');
    expect(content).toContain('aide-memory');
  });
});

describe('.npmignore', () => {
  it('exists', () => {
    const ignorePath = path.join(ROOT, '.npmignore');
    expect(fs.existsSync(ignorePath)).toBe(true);
  });

  it('excludes src/, tests/, docs/, .claude/', () => {
    const ignorePath = path.join(ROOT, '.npmignore');
    const content = fs.readFileSync(ignorePath, 'utf-8');
    expect(content).toContain('src/');
    expect(content).toContain('tests/');
    expect(content).toContain('docs/');
    expect(content).toContain('.claude/');
  });

  it('excludes test files and source maps', () => {
    const ignorePath = path.join(ROOT, '.npmignore');
    const content = fs.readFileSync(ignorePath, 'utf-8');
    expect(content).toContain('*.test.ts');
    expect(content).toContain('*.test.js');
    expect(content).toContain('*.map');
  });
});

describe('current package.json', () => {
  it('includes @modelcontextprotocol/sdk dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.dependencies['@modelcontextprotocol/sdk']).toBeDefined();
  });

  it('includes zod dependency', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
    expect(pkg.dependencies.zod).toBeDefined();
  });
});
