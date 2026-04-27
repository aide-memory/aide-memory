import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MemoryStore } from '../../../memory/store';
import { searchMemories } from '../search';
import fs from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-search-cmd-test-'));
  return path.join(dir, 'memory.db');
}

describe('aide search command', () => {
  let store: MemoryStore;
  let dbPath: string;
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    dbPath = tempDbPath();
    store = new MemoryStore({ dbPath });
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    store.add({ layer: 'preferences', what: 'Use vitest for all tests', why: 'Team standard' });
    store.add({ layer: 'technical', what: 'WAL mode for SQLite', scope: 'src/memory/**' });
    store.add({ layer: 'guidelines', what: 'Keep components under 150 lines' });
    store.add({ layer: 'area_context', what: 'Dashboard uses skeleton loading', scope: 'src/components/dashboard/**' });
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    store.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('prints matching memories', () => {
    searchMemories(store, 'vitest');

    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('vitest');
    expect(output).toContain('Found 1');
    expect(output).not.toContain('WAL mode');
  });

  it('prints no-match message when nothing found', () => {
    searchMemories(store, 'nonexistent-xyz');

    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('No memories found');
  });

  it('filters by layer', () => {
    searchMemories(store, 'vitest', { layer: 'technical' });

    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('No memories found');
  });

  it('displays scope when present', () => {
    searchMemories(store, 'WAL');

    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('src/memory/**');
  });

  it('displays why when present', () => {
    searchMemories(store, 'vitest');

    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('Team standard');
  });

  it('groups results by layer', () => {
    // Search for a broad term that matches multiple layers
    searchMemories(store, 'e');

    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    // Should have at least one layer heading
    expect(output).toMatch(/Preferences|Technical Context|Guidelines|Area Context/);
  });

  it('respects limit option', () => {
    searchMemories(store, 'e', { limit: 1 });

    const output = consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
    expect(output).toContain('Found 1');
  });
});
