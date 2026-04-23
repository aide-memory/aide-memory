import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../store';
import { recall, scopeMatchesPath, computeScopedForPath } from '../recall';
import type { Memory } from '../types';
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

  describe('focused mode — minScopeDepth rule (0.4.3+)', () => {
    it('focused: immediate parent scope matches', () => {
      // src/api/** for src/api/routes.ts → depth 2 ≥ default minScopeDepth=1 → INCLUDE
      expect(scopeMatchesPath('src/api/**', 'src/api/routes.ts', { focused: true })).toBe(true);
    });

    it('focused: exact file scope matches', () => {
      expect(scopeMatchesPath('src/api/routes.ts', 'src/api/routes.ts', { focused: true })).toBe(true);
    });

    it('focused: single-segment scope (src/**) INCLUDED at default minScopeDepth=1 (permissive)', () => {
      // src/** has depth 1 ≥ 1 → INCLUDE (default after memory #318 — flat-project compat)
      expect(scopeMatchesPath('src/**', 'src/api/routes.ts', { focused: true })).toBe(true);
    });

    it('focused: single-segment scope also INCLUDED for deeper paths at default', () => {
      expect(scopeMatchesPath('src/**', 'src/api/v2/routes.ts', { focused: true })).toBe(true);
    });

    it('focused: minScopeDepth=2 excludes single-segment scope (user opt-in strictness)', () => {
      // src/** has depth 1 < 2 → EXCLUDE (too broad when user bumps threshold)
      expect(scopeMatchesPath('src/**', 'src/api/routes.ts', { focused: true, minScopeDepth: 2 })).toBe(false);
      expect(scopeMatchesPath('src/**', 'src/api/v2/routes.ts', { focused: true, minScopeDepth: 2 })).toBe(false);
    });

    it('focused: mid-depth scope reaches deep descendants', () => {
      // src/components/** (depth 2) for src/components/dashboard/Widget.tsx → INCLUDE at any minScopeDepth ≤ 2
      expect(scopeMatchesPath('src/components/**', 'src/components/dashboard/Widget.tsx', { focused: true })).toBe(true);
    });

    it('focused: explicit minScopeDepth=1 (same as default, kept as regression guard)', () => {
      expect(scopeMatchesPath('src/**', 'src/api/routes.ts', { focused: true, minScopeDepth: 1 })).toBe(true);
    });

    it('focused: minScopeDepth=3 stricter — src/api/** (depth 2) excluded', () => {
      expect(scopeMatchesPath('src/api/**', 'src/api/routes.ts', { focused: true, minScopeDepth: 3 })).toBe(false);
    });

    it('focused: project scope ("project") still matches (filtered separately by computeScopedForPath)', () => {
      // scopeMatchesPath itself doesn't exclude project — that is the job of computeScopedForPath
      expect(scopeMatchesPath('project', 'src/api/routes.ts', { focused: true })).toBe(true);
      expect(scopeMatchesPath(null, 'src/api/routes.ts', { focused: true })).toBe(true);
    });

    it('focused: deeper/nested scope is included (child of query)', () => {
      // Directory query src/api/ + child scope src/api/v2/** → INCLUDE
      expect(scopeMatchesPath('src/api/v2/**', 'src/api/', { focused: true })).toBe(true);
    });

    it('focused: sibling scopes do not match', () => {
      expect(scopeMatchesPath('src/auth/**', 'src/api/routes.ts', { focused: true })).toBe(false);
    });
  });
});

describe('computeScopedForPath — focused-scope single source of truth', () => {
  function mem(partial: Partial<Memory>): Memory {
    return {
      id: partial.id ?? 0,
      uuid: partial.uuid ?? 'u',
      layer: partial.layer ?? 'technical',
      what: partial.what ?? 'x',
      why: null,
      scope: partial.scope ?? null,
      context_label: null,
      contributor: 'meky',
      tags: [],
      source: 'conversation',
      shared: true,
      generated_by: null,
      derived_from: null,
      created_at: '',
      updated_at: '',
      recalled_count: 0,
      last_recalled_at: null,
    };
  }

  // Seed mirrors the validation scenario from /tmp/aide-l-test:
  //   src/auth/**, src/api/**, src/**, exact src/api/routes.ts, no-scope project-wide
  const memories: Memory[] = [
    mem({ id: 1, layer: 'guidelines',   scope: 'src/auth/**',        what: 'auth rule' }),
    mem({ id: 2, layer: 'technical',    scope: 'src/api/**',         what: 'api tech' }),       // immediate parent
    mem({ id: 3, layer: 'preferences',  scope: 'src/**',             what: 'src pref' }),        // grandparent — exclude
    mem({ id: 4, layer: 'area_context', scope: 'src/api/routes.ts',  what: 'routes area' }),    // exact file
    mem({ id: 5, layer: 'guidelines',   scope: null,                 what: 'project-wide' }),   // project — exclude
    mem({ id: 6, layer: 'technical',    scope: 'src/api/v2/**',      what: 'deeper nested' }),  // deeper — N/A for file
  ];

  it('includes immediate parent + exact file + grandparent (default minScopeDepth=1), excludes project-wide', () => {
    // Default minScopeDepth=1 (permissive per memory #318) — src/** (depth 1) is INCLUDED.
    // Excludes: null / 'project' scope (always, for per-file recall).
    const out = computeScopedForPath(memories, 'src/api/routes.ts');
    expect(out.count).toBe(3);
    expect(out.ids.sort((a, b) => a - b)).toEqual([2, 3, 4]);
    expect(out.layers).toEqual({ technical: 1, area_context: 1, preferences: 1 });
  });

  it('integer count equals sum of layer breakdown values (parity guarantee)', () => {
    const out = computeScopedForPath(memories, 'src/api/routes.ts');
    const layerSum = Object.values(out.layers).reduce((a, b) => a + (b ?? 0), 0);
    expect(out.count).toBe(layerSum);
  });

  it('directory query includes child (deeper nested) scopes', () => {
    const out = computeScopedForPath(memories, 'src/api/');
    // At default minScopeDepth=1 (memory #318): src/api/**, exact file,
    // src/api/v2/**, AND src/** all IN; src/auth sibling OUT; project-wide OUT.
    const ids = out.ids.sort((a, b) => a - b);
    expect(ids).toEqual([2, 3, 4, 6]);
    expect(out.count).toBe(4);
  });

  it('project-wide memories NEVER appear in scoped set (handled by SessionStart)', () => {
    const onlyProjectWide = [mem({ id: 10, scope: null, what: 'p' }), mem({ id: 11, scope: 'project', what: 'q' })];
    const out = computeScopedForPath(onlyProjectWide, 'src/api/routes.ts');
    expect(out.count).toBe(0);
    expect(out.ids).toEqual([]);
    expect(out.layers).toEqual({});
  });

  it('unrelated path returns empty scoped set', () => {
    const out = computeScopedForPath(memories, 'docs/notes.md');
    expect(out.count).toBe(0);
    expect(out.ids).toEqual([]);
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

  it('filters by path — returns matching scopes at default minScopeDepth=1 (memory #318)', () => {
    const result = recall(store, {
      paths: ['src/components/dashboard/Sidebar.tsx'],
    });

    const whats = result.memories.map(m => m.what);

    // Should include: dashboard area_context (immediate parent),
    // src/components/** (depth 2), project-wide memories, and at default
    // minScopeDepth=1 any depth-1 scopes (e.g. src/**) if present.
    expect(whats).toContain('Skeleton loading replaces ALL legacy loaders');
    expect(whats).toContain('Composition over conditionals for component variants');
    expect(whats).toContain('Vitest not Jest — use describe/it from vitest');
    expect(whats).toContain('Keep components under 150 lines');

    // Should NOT include: sibling CLI commands or unrelated memory module
    expect(whats).not.toContain('Each CLI command gets its own file');
    expect(whats).not.toContain('better-sqlite3 is synchronous — do not use await');
  });

  it('returns memories ordered by layer priority', () => {
    // Use a path where all four layers can participate: files directly under
    // src/components/** include a preference (grandparent is excluded for deeper
    // queries, so query at that level).
    const result = recall(store, {
      paths: ['src/components/Button.tsx'],
    });

    const layers = result.memories.map(m => m.layer);

    // preferences (Keep components under 150 lines) should come before guidelines
    const prefIdx = layers.indexOf('preferences');
    const guideIdx = layers.indexOf('guidelines');

    expect(prefIdx).toBeGreaterThanOrEqual(0);
    expect(guideIdx).toBeGreaterThanOrEqual(0);
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

  it('respects limit with round-robin extras for underrepresented layers', () => {
    const result = recall(store, { limit: 2 });
    // Top 2 are selected, then round-robin appends 1-2 from each
    // underrepresented layer, so total exceeds the raw limit.
    // With 6 memories across 4 layers, top 2 covers at most 2 layers,
    // leaving 2 unrepresented layers that each contribute extras.
    expect(result.memories.length).toBeGreaterThanOrEqual(2);
    expect(result.memories.length).toBeLessThanOrEqual(6);
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

  it('returns matched scopes (focused mode, default minScopeDepth=1 per memory #318)', () => {
    const result = recall(store, {
      paths: ['src/components/dashboard/Sidebar.tsx'],
    });

    // Immediate parent scope is included.
    expect(result.matched_scopes).toContain('src/components/dashboard/**');
    // src/components/** (depth 2) is included — would be at any minScopeDepth ≤ 2.
    expect(result.matched_scopes).toContain('src/components/**');
  });

  it('deleted memories do not appear in recall', () => {
    // Delete the skeleton loading memory
    const all = store.list();
    const skeleton = all.find(m => m.what.includes('Skeleton'));
    store.remove(skeleton!.id);

    const result = recall(store, {
      paths: ['src/components/dashboard/Sidebar.tsx'],
    });

    expect(result.memories.map(m => m.what)).not.toContain('Skeleton loading replaces ALL legacy loaders');
  });

  it('filters by contributor', () => {
    const result = recall(store, {
      contributor: 'meky',
    });

    // Only the memory explicitly set as contributor: 'meky' should match
    expect(result.memories.length).toBe(1);
    expect(result.memories[0].what).toBe('Keep components under 150 lines');
  });

  it('returns memories with uuid field', () => {
    const result = recall(store, {});
    for (const m of result.memories) {
      expect(m.uuid).toBeTruthy();
      expect(m.uuid).toMatch(/^[0-9a-f]{8}-/);
    }
  });
});
