import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { scanProject } from '../scan';
import fs from 'fs';
import path from 'path';
import os from 'os';

function createTempProject(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aide-scan-test-'));
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('scanProject', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProject();
  });

  afterEach(() => {
    cleanupDir(projectRoot);
  });

  it('detects Node.js project from package.json', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'my-app',
        type: 'module',
        dependencies: { express: '^4.0.0' },
      }),
      'utf8'
    );

    const memories = scanProject(projectRoot);

    expect(memories.some(m => m.what.includes('my-app'))).toBe(true);
    expect(memories.some(m => m.what.includes('ES modules'))).toBe(true);
    expect(memories.some(m => m.what.includes('Express'))).toBe(true);
    expect(memories.every(m => m.layer === 'technical')).toBe(true);
    expect(memories.every(m => m.source === 'agent_discovery')).toBe(true);
  });

  it('detects TypeScript from tsconfig.json', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, target: 'ES2020' },
      }),
      'utf8'
    );

    const memories = scanProject(projectRoot);

    expect(memories.some(m => m.what.includes('TypeScript'))).toBe(true);
    expect(memories.some(m => m.what.includes('strict mode'))).toBe(true);
    expect(memories.some(m => m.what.includes('ES2020'))).toBe(true);
  });

  it('detects React from dependencies', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'react-app',
        dependencies: {
          react: '^18.0.0',
          'react-dom': '^18.0.0',
          tailwindcss: '^3.0.0',
        },
      }),
      'utf8'
    );

    const memories = scanProject(projectRoot);

    expect(memories.some(m => m.what.includes('React'))).toBe(true);
    expect(memories.some(m => m.what.includes('Tailwind'))).toBe(true);
  });

  it('detects test framework from config', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'test-project',
        scripts: { test: 'vitest run' },
        devDependencies: { vitest: '^1.0.0' },
      }),
      'utf8'
    );

    const memories = scanProject(projectRoot);

    expect(memories.some(m => m.what.includes('Vitest'))).toBe(true);
  });

  it('generates memories with correct layers and tags', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({ name: 'tagged-project', dependencies: { react: '^18.0.0' } }),
      'utf8'
    );

    const memories = scanProject(projectRoot);

    for (const m of memories) {
      expect(m.layer).toBe('technical');
      expect(m.source).toBe('agent_discovery');
      expect(Array.isArray(m.tags)).toBe(true);
      expect(m.tags.length).toBeGreaterThan(0);
      expect(typeof m.what).toBe('string');
      expect(m.what.length).toBeGreaterThan(0);
    }
  });

  it('handles empty project with no recognizable files', () => {
    const memories = scanProject(projectRoot);
    expect(memories).toHaveLength(0);
  });

  it('generates 15-30 memories for a typical project', () => {
    // Set up a realistic project
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'full-project',
        type: 'module',
        scripts: {
          build: 'tsc',
          test: 'vitest run',
          lint: 'eslint .',
        },
        dependencies: {
          next: '^14.0.0',
          react: '^18.0.0',
          'react-dom': '^18.0.0',
          prisma: '^5.0.0',
          '@prisma/client': '^5.0.0',
          zod: '^3.0.0',
          express: '^4.0.0',
          tailwindcss: '^3.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
          vitest: '^1.0.0',
          eslint: '^8.0.0',
          prettier: '^3.0.0',
        },
      }),
      'utf8'
    );

    fs.writeFileSync(
      path.join(projectRoot, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, target: 'ES2022' },
      }),
      'utf8'
    );

    fs.writeFileSync(path.join(projectRoot, 'package-lock.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(projectRoot, '.eslintrc.json'), '{}', 'utf8');
    fs.writeFileSync(path.join(projectRoot, '.prettierrc'), '{}', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'README.md'), '# Project', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'CONTRIBUTING.md'), '# Contributing', 'utf8');
    fs.writeFileSync(path.join(projectRoot, 'Dockerfile'), 'FROM node', 'utf8');

    // Create directories
    fs.mkdirSync(path.join(projectRoot, 'src'));
    fs.mkdirSync(path.join(projectRoot, 'tests'));
    fs.mkdirSync(path.join(projectRoot, 'docs'));
    fs.mkdirSync(path.join(projectRoot, 'scripts'));
    fs.mkdirSync(path.join(projectRoot, '.github', 'workflows'), { recursive: true });

    const memories = scanProject(projectRoot);

    // Should be in the 15-30 range for a realistic project
    expect(memories.length).toBeGreaterThanOrEqual(15);
    expect(memories.length).toBeLessThanOrEqual(30);
  });

  it('does not produce duplicate memories', () => {
    fs.writeFileSync(
      path.join(projectRoot, 'package.json'),
      JSON.stringify({
        name: 'dedup-test',
        dependencies: { react: '^18.0.0' },
        devDependencies: { vitest: '^1.0.0' },
      }),
      'utf8'
    );

    const memories = scanProject(projectRoot);
    const whats = memories.map(m => m.what);
    const uniqueWhats = new Set(whats);
    expect(whats.length).toBe(uniqueWhats.size);
  });
});
