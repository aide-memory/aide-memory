import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../store';
import { recall, scopeMatchesPath } from '../recall';
import fs from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-recall-test-'));
  return path.join(dir, 'memory.db');
}

describe('scopeMatchesPath', () => {
  it('null scope matches everything', () => {
    expect(scopeMatchesPath(null, 'src/anything.ts')).toBe(true);
  });

  it('"project" scope matches everything', () => {
    expect(scopeMatchesPath('project', 'src/anything.ts')).toBe(true);
  });

  it('glob pattern matches files in subtree', () => {
    expect(scopeMatchesPath('src/components/**', 'src/components/Button.tsx')).toBe(true);
    expect(scopeMatchesPath('src/components/**', 'src/components/dashboard/Sidebar.tsx')).toBe(true);
  });

  it('glob pattern does not match sibling directories', () => {
    expect(scopeMatchesPath('src/components/**', 'src/utils/helper.ts')).toBe(false);
  });

  it('parent scope matches child queries', () => {
    // If memory is scoped to 'src/components/dashboard/**' and we query 'src/components/',
    // the memory is WITHIN the query area — it should match
    expect(scopeMatchesPath('src/components/dashboard/**', 'src/components/')).toBe(true);
  });

  it('exact directory match works', () => {
    expect(scopeMatchesPath('src/rules', 'src/rules/checker.ts')).toBe(true);
  });

  it('does not match unrelated paths', () => {
    expect(scopeMatchesPath('src/memory/**', 'src/rules/checker.ts')).toBe(false);
  });

  it('handles paths with backslashes (Windows)', () => {
    expect(scopeMatchesPath('src\\components\\**', 'src/components/Button.tsx')).toBe(true);
  });
});

describe('recall', () => {
  let store: MemoryStore;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });

    // Seed test memories
    store.add({
      layer: 'preferences',
      what: 'Keep components under 150 lines',
      scope: 'src/components/**',
      contributor: 'meky',
    });
    store.add({
      layer: 'area_context',
      what: 'Skeleton loading replaces ALL legacy loaders',
      scope: 'src/components/dashboard/**',
      context_label: 'dashboard skeleton loading',
    });
    store.add({
      layer: 'technical',
      what: 'better-sqlite3 is synchronous — do not use await',
      scope: 'src/memory/**',
    });
    store.add({
      layer: 'guidelines',
      what: 'Composition over conditionals for component variants',
      scope: 'project',
    });
    store.add({
      layer: 'area_context',
      what: 'Each CLI command gets its own file',
      scope: 'src/cli/commands/**',
    });
    store.add({
      layer: 'technical',
      what: 'Vitest not Jest — use describe/it from vitest',
      scope: 'project',
    });
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) fs.rmdirSync(dir);
  });

  it('returns all project-scoped memories when no paths given', () => {
    const result = recall(store, {});
    expect(result.memories.length).toBe(6);
  });

  it('filters by path — only returns matching scope', () => {
    const result = recall(store, {
      paths: ['src/components/dashboard/Sidebar.tsx'],
    });

    const whats = result.memories.map(m => m.what);

    // Should include: dashboard area_context, components preference, project guidelines, project technical
    expect(whats).toContain('Skeleton loading replaces ALL legacy loaders');
    expect(whats).toContain('Keep components under 150 lines');
    expect(whats).toContain('Composition over conditionals for component variants');
    expect(whats).toContain('Vitest not Jest — use describe/it from vitest');

    // Should NOT include: CLI commands or memory technical
    expect(whats).not.toContain('Each CLI command gets its own file');
    expect(whats).not.toContain('better-sqlite3 is synchronous — do not use await');
  });

  it('returns memories ordered by layer priority', () => {
    const result = recall(store, {
      paths: ['src/components/dashboard/Sidebar.tsx'],
    });

    const layers = result.memories.map(m => m.layer);

    // area_context should come before technical, preferences, guidelines
    const areaIdx = layers.indexOf('area_context');
    const prefIdx = layers.indexOf('preferences');
    const guideIdx = layers.indexOf('guidelines');

    expect(areaIdx).toBeLessThan(prefIdx);
    expect(prefIdx).toBeLessThan(guideIdx);
  });

  it('parent scope inheritance — querying a parent dir includes child-scoped memories', () => {
    const result = recall(store, {
      paths: ['src/components/'],
    });

    const whats = result.memories.map(m => m.what);
    // dashboard/** is inside components/ — should be included
    expect(whats).toContain('Skeleton loading replaces ALL legacy loaders');
    expect(whats).toContain('Keep components under 150 lines');
  });

  it('keyword query boosts relevant results', () => {
    const result = recall(store, {
      query: 'skeleton loading dashboard',
    });

    // The skeleton loading memory should be first (highest keyword relevance + area_context layer)
    expect(result.memories[0].what).toBe('Skeleton loading replaces ALL legacy loaders');
  });

  it('filters by layer', () => {
    const result = recall(store, {
      layers: ['technical'],
    });

    expect(result.memories.every(m => m.layer === 'technical')).toBe(true);
    expect(result.memories.length).toBe(2);
  });

  it('respects limit', () => {
    const result = recall(store, { limit: 2 });
    expect(result.memories.length).toBe(2);
  });

  it('records recall on returned memories', () => {
    const result = recall(store, {
      paths: ['src/memory/store.ts'],
    });

    // The sqlite memory should have been recalled
    const sqliteMem = result.memories.find(m => m.what.includes('better-sqlite3'));
    expect(sqliteMem).toBeTruthy();

    // Check the store — recalled_count should be 1
    const fresh = store.get(sqliteMem!.id)!;
    expect(fresh.recalled_count).toBe(1);
    expect(fresh.last_recalled_at).toBeTruthy();
  });

  it('returns matched scopes', () => {
    const result = recall(store, {
      paths: ['src/components/dashboard/Sidebar.tsx'],
    });

    expect(result.matched_scopes).toContain('src/components/dashboard/**');
    expect(result.matched_scopes).toContain('src/components/**');
  });

  it('does not return archived memories', () => {
    // Archive the skeleton loading memory
    const all = store.list();
    const skeleton = all.find(m => m.what.includes('Skeleton'));
    store.archive(skeleton!.id);

    const result = recall(store, {
      paths: ['src/components/dashboard/Sidebar.tsx'],
    });

    expect(result.memories.map(m => m.what)).not.toContain('Skeleton loading replaces ALL legacy loaders');
  });
});
