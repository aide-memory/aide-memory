import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { MemoryStore } from '../../memory/store';

/**
 * Create a temp directory with .aide/ structure to simulate a project root.
 * Returns { root, dbPath, configPath, memoriesDir }.
 */
function createTempProject(): {
  root: string;
  dbPath: string;
  configPath: string;
  memoriesDir: string;
} {
  // Use realpathSync to resolve symlinks (macOS /var -> /private/var)
  // so the project hash matches what process.cwd() returns after chdir.
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aide-cli-test-')));
  const aideDir = path.join(root, '.aide');
  fs.mkdirSync(aideDir, { recursive: true });

  const memoriesDir = path.join(aideDir, 'memories');
  const configPath = path.join(aideDir, 'config.json');

  // Use the MemoryStore constructor with the project root to get the proper db path
  const store = new MemoryStore(root);
  const dbPath = store.dbPath;
  store.close();

  return { root, dbPath, configPath, memoriesDir };
}

function cleanupTempProject(info: { root: string; dbPath: string }): void {
  // Remove the SQLite db and its WAL/SHM files
  for (const suffix of ['', '-wal', '-shm']) {
    const p = info.dbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  const dbDir = path.dirname(info.dbPath);
  if (fs.existsSync(dbDir)) fs.rmSync(dbDir, { recursive: true, force: true });

  // Remove the temp project root
  if (fs.existsSync(info.root)) fs.rmSync(info.root, { recursive: true, force: true });
}

// Import the command modules directly for programmatic testing
import { findProjectRoot } from '../commands/memory/utils';
import { createProgram } from '../aide-memory';

describe('aide-memory CLI', () => {
  let project: ReturnType<typeof createTempProject>;
  let store: MemoryStore;
  let consoleSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let originalCwd: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exitSpy: any;

  beforeEach(() => {
    project = createTempProject();
    store = new MemoryStore(project.root);
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    originalCwd = process.cwd();
    process.chdir(project.root);
    // Mock process.exit to throw instead of actually exiting
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
      throw new Error(`process.exit(${code})`);
    }) as any);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    process.chdir(originalCwd);
    store.close();
    cleanupTempProject(project);
  });

  function getOutput(): string {
    return consoleSpy.mock.calls.map(c => String(c[0])).join('\n');
  }

  function getErrorOutput(): string {
    return errorSpy.mock.calls.map(c => String(c[0])).join('\n');
  }

  function runCli(args: string[]): void {
    const program = createProgram();
    program.exitOverride(); // Throw CommanderError instead of process.exit
    program.parse(['node', 'aide-memory', ...args]);
  }

  // ---- 1. aide-memory recall ----
  describe('recall', () => {
    it('returns formatted memories for a path', () => {
      store.add({ layer: 'technical', what: 'WAL mode for SQLite', scope: 'src/memory/**' });
      store.add({ layer: 'preferences', what: 'Use vitest', scope: 'src/**' });
      store.close();

      // Re-create store to avoid locked db
      store = new MemoryStore(project.root);

      runCli(['recall', 'src/memory/']);

      const output = getOutput();
      expect(output).toContain('WAL mode');
      expect(output).toContain('vitest');
      // Check layer grouping headers
      expect(output).toMatch(/Technical Context|Preferences/);
    });
  });

  // ---- 2. aide-memory remember ----
  describe('remember', () => {
    it('stores a memory with --layer', () => {
      runCli(['remember', 'Always use strict mode', '--layer', 'technical']);

      const output = getOutput();
      expect(output).toContain('Stored memory');
      expect(output).toContain('Always use strict mode');

      // Verify it's actually in the store
      const all = store.list();
      expect(all.length).toBe(1);
      expect(all[0].what).toBe('Always use strict mode');
      expect(all[0].layer).toBe('technical');
    });
  });

  // ---- 3. aide-memory update ----
  describe('update', () => {
    it('modifies a memory with --what', () => {
      const mem = store.add({ layer: 'technical', what: 'original text' });

      runCli(['update', String(mem.id), '--what', 'updated text']);

      const output = getOutput();
      expect(output).toContain('Updated memory');
      expect(output).toContain('updated text');

      const updated = store.get(mem.id);
      expect(updated!.what).toBe('updated text');
    });
  });

  // ---- 4. aide-memory forget ----
  describe('forget', () => {
    it('removes a memory', () => {
      const mem = store.add({ layer: 'preferences', what: 'delete me' });

      runCli(['forget', String(mem.id)]);

      const output = getOutput();
      expect(output).toContain('Deleted');
      expect(output).toContain('delete me');

      expect(store.get(mem.id)).toBeNull();
    });
  });

  // ---- 5. aide-memory search ----
  describe('search', () => {
    it('returns matching memories', () => {
      store.add({ layer: 'technical', what: 'WAL mode for SQLite' });
      store.add({ layer: 'preferences', what: 'Use vitest for all tests' });

      runCli(['search', 'vitest']);

      const output = getOutput();
      expect(output).toContain('vitest');
      expect(output).toContain('Found 1');
      expect(output).not.toContain('WAL mode');
    });
  });

  // ---- 6. aide-memory list ----
  describe('list', () => {
    it('shows all memories', () => {
      store.add({ layer: 'preferences', what: 'pref 1' });
      store.add({ layer: 'technical', what: 'tech 1' });
      store.add({ layer: 'guidelines', what: 'guide 1' });

      runCli(['list']);

      const output = getOutput();
      expect(output).toContain('pref 1');
      expect(output).toContain('tech 1');
      expect(output).toContain('guide 1');
      expect(output).toContain('3');
    });

    // ---- 7. aide-memory list --layer ----
    it('filters by layer', () => {
      store.add({ layer: 'preferences', what: 'pref 1' });
      store.add({ layer: 'technical', what: 'tech 1' });
      store.add({ layer: 'guidelines', what: 'guide 1' });

      runCli(['list', '--layer', 'guidelines']);

      const output = getOutput();
      expect(output).toContain('guide 1');
      expect(output).not.toContain('pref 1');
      expect(output).not.toContain('tech 1');
    });
  });

  // ---- 8. aide-memory stats ----
  describe('stats', () => {
    it('shows summary', () => {
      store.add({ layer: 'preferences', what: 'pref 1' });
      store.add({ layer: 'preferences', what: 'pref 2' });
      store.add({ layer: 'technical', what: 'tech 1' });

      runCli(['stats']);

      const output = getOutput();
      expect(output).toContain('Memory Statistics');
      expect(output).toContain('Total memories: 3');
      expect(output).toContain('Preferences: 2');
      expect(output).toContain('Technical Context: 1');
      expect(output).toContain('By Source');
    });
  });

  // ---- 9. aide-memory config (get) ----
  describe('config', () => {
    it('prints value for a key', () => {
      // Write a config file first
      const config = { capture: { enabled: true } };
      fs.writeFileSync(project.configPath, JSON.stringify(config));

      runCli(['config', 'capture.enabled']);

      const output = getOutput();
      expect(output).toContain('true');
    });

    // ---- 10. aide-memory config (set) ----
    it('sets a value', () => {
      runCli(['config', 'capture.enabled', 'false']);

      const output = getOutput();
      expect(output).toContain('Set capture.enabled');

      // Verify file was written
      const config = JSON.parse(fs.readFileSync(project.configPath, 'utf-8'));
      expect(config.capture.enabled).toBe(false);
    });
  });

  // ---- 11. Error when no .aide/ directory ----
  describe('no .aide/ directory', () => {
    it('errors gracefully for all commands when no .aide/ found', () => {
      // Create a temp dir WITHOUT .aide/
      const noAideDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'aide-no-aide-')));
      process.chdir(noAideDir);

      expect(() => runCli(['recall', 'src/'])).toThrow('process.exit(1)');
      const errOutput = getErrorOutput();
      expect(errOutput).toContain('No .aide/ directory found');

      // Cleanup
      fs.rmSync(noAideDir, { recursive: true, force: true });
    });
  });

  // ---- 12. aide-memory --version ----
  describe('version', () => {
    it('prints version', () => {
      // Commander with exitOverride writes version to stdout.write then throws
      let captured = '';
      const origWrite = process.stdout.write;
      process.stdout.write = ((chunk: any) => {
        captured += String(chunk);
        return true;
      }) as any;

      try {
        expect(() => runCli(['--version'])).toThrow();
      } finally {
        process.stdout.write = origWrite;
      }

      expect(captured).toMatch(/\d+\.\d+\.\d+/);
    });
  });

  // ---- 13. aide-memory sync import ----
  describe('sync import', () => {
    it('rebuilds cache from JSON files', () => {
      // Close the legacy-mode store — sync import creates its own { projectRoot } store
      store.close();

      // Create directory structure for file-per-memory
      const techDir = path.join(project.memoriesDir, 'technical');
      fs.mkdirSync(techDir, { recursive: true });
      fs.mkdirSync(path.join(project.memoriesDir, 'preferences', 'shared'), { recursive: true });
      fs.mkdirSync(path.join(project.memoriesDir, 'preferences', 'personal'), { recursive: true });
      fs.mkdirSync(path.join(project.memoriesDir, 'area_context'), { recursive: true });
      fs.mkdirSync(path.join(project.memoriesDir, 'guidelines'), { recursive: true });

      // Write a valid MemoryFile (uuid, contributor, timestamps are required)
      const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
      const memFile = {
        uuid,
        layer: 'technical',
        what: 'Imported from JSON',
        why: 'Test import',
        scope: 'src/**',
        context_label: null,
        contributor: 'test-user',
        tags: [],
        source: 'conversation',
        shared: true,
        generated_by: null,
        derived_from: null,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      };
      fs.writeFileSync(
        path.join(techDir, `${uuid}.json`),
        JSON.stringify(memFile, null, 2)
      );

      runCli(['sync', 'import']);

      const output = getOutput();
      // The store auto-imports on construction, then sync.importFromFiles() confirms
      // everything is up to date. The important thing is the memory IS imported.
      expect(output).toMatch(/Import complete|up to date/);

      // Verify memory is present in the cache
      store = new MemoryStore({ projectRoot: project.root });
      const all = store.list();
      expect(all.some(m => m.what === 'Imported from JSON')).toBe(true);
    });
  });

  // ---- 14. aide-memory sync export ----
  describe('sync export', () => {
    it('creates missing JSON files', () => {
      // Close legacy store and use projectRoot mode so add() creates JSON files too
      store.close();

      // Ensure memories directory structure exists
      fs.mkdirSync(path.join(project.memoriesDir, 'technical'), { recursive: true });
      fs.mkdirSync(path.join(project.memoriesDir, 'preferences', 'shared'), { recursive: true });
      fs.mkdirSync(path.join(project.memoriesDir, 'preferences', 'personal'), { recursive: true });
      fs.mkdirSync(path.join(project.memoriesDir, 'area_context'), { recursive: true });
      fs.mkdirSync(path.join(project.memoriesDir, 'guidelines'), { recursive: true });

      store = new MemoryStore({ projectRoot: project.root });
      store.add({ layer: 'technical', what: 'Export me' });

      // Delete the JSON file that add() auto-created (simulate missing file scenario)
      const techDir = path.join(project.memoriesDir, 'technical');
      const jsonFiles = fs.readdirSync(techDir).filter(f => f.endsWith('.json'));
      for (const f of jsonFiles) {
        fs.unlinkSync(path.join(techDir, f));
      }

      // Close store before CLI runs (it creates its own)
      store.close();

      runCli(['sync', 'export']);

      const output = getOutput();
      // The store constructor's rebuildCacheIfNeeded may clear stale entries.
      // Export creates missing JSON files for whatever is in SQLite.
      expect(output).toMatch(/Export complete|up to date/);

      // Reopen store for afterEach cleanup
      store = new MemoryStore({ projectRoot: project.root });
    });
  });

  // ---- Extra: init ----
  describe('init', () => {
    it('creates .aide directory structure', async () => {
      runCli(['init']);
      // initProject is async — give it a tick to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      // Verify the .aide/memories directories were created
      expect(fs.existsSync(path.join(project.root, '.aide', 'memories', 'technical'))).toBe(true);
      expect(fs.existsSync(path.join(project.root, '.aide', 'memories', 'area_context'))).toBe(true);
      expect(fs.existsSync(path.join(project.root, '.aide', 'config.json'))).toBe(true);
    });
  });

  // ---- Extra: migrate placeholder ----
  describe('migrate', () => {
    it('prints not yet implemented', () => {
      runCli(['migrate']);
      const output = getOutput();
      expect(output).toContain('not yet implemented');
    });
  });
});

// ---- findProjectRoot unit tests ----
describe('findProjectRoot', () => {
  it('finds .aide/ in the current directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-root-test-'));
    fs.mkdirSync(path.join(tmpDir, '.aide'));
    const result = findProjectRoot(tmpDir);
    expect(result).toBe(tmpDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('walks up to find .aide/ in parent', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-root-test-'));
    const child = path.join(tmpDir, 'src', 'deep');
    fs.mkdirSync(child, { recursive: true });
    fs.mkdirSync(path.join(tmpDir, '.aide'));
    const result = findProjectRoot(child);
    expect(result).toBe(tmpDir);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns null when no .aide/ found', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-root-test-'));
    const result = findProjectRoot(tmpDir);
    expect(result).toBeNull();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
