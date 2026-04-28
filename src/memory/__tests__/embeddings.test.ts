import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  cosineSimilarity,
  vectorToBuffer,
  bufferToVector,
  ensureEmbeddingsTable,
  EmbeddingService,
  TransformersBackend,
  OllamaBackend,
  type EmbeddingBackend,
} from '../embeddings';
import Database from 'libsql';
import fs from 'fs';
import path from 'path';
import os from 'os';

function tempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-embed-test-'));
  return path.join(dir, 'memory.db');
}

// --- Mock backend for tests (no real model download) ---

class MockBackend implements EmbeddingBackend {
  private ready = false;
  private vectors: Map<string, Float32Array> = new Map();

  constructor(private shouldInitialize: boolean = true) {}

  async initialize(): Promise<boolean> {
    this.ready = this.shouldInitialize;
    return this.ready;
  }

  isReady(): boolean {
    return this.ready;
  }

  /** Register a pre-computed vector for a given input text. */
  setVector(text: string, vector: Float32Array): void {
    this.vectors.set(text, vector);
  }

  async generateEmbedding(text: string): Promise<Float32Array | null> {
    if (!this.ready) return null;
    const preset = this.vectors.get(text);
    if (preset) return preset;
    // Generate a deterministic pseudo-embedding from the text
    const arr = new Float32Array(4);
    for (let i = 0; i < text.length && i < 4; i++) {
      arr[i] = text.charCodeAt(i) / 255;
    }
    // Normalize
    let norm = 0;
    for (let i = 0; i < arr.length; i++) norm += arr[i] * arr[i];
    norm = Math.sqrt(norm);
    if (norm > 0) for (let i = 0; i < arr.length; i++) arr[i] /= norm;
    return arr;
  }
}

// --- Tests ---

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const v = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0, 5);
  });

  it('returns -1 for opposite vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([-1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0, 5);
  });

  it('returns 0 for orthogonal vectors', () => {
    const a = new Float32Array([1, 0, 0]);
    const b = new Float32Array([0, 1, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0, 5);
  });

  it('handles normalized vectors correctly', () => {
    const a = new Float32Array([0.6, 0.8]);
    const b = new Float32Array([0.8, 0.6]);
    // dot = 0.48 + 0.48 = 0.96, both are unit vectors
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.96, 4);
  });

  it('returns 0 for empty vectors', () => {
    const a = new Float32Array([]);
    const b = new Float32Array([]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for mismatched lengths', () => {
    const a = new Float32Array([1, 2]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('returns 0 for zero vectors', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 2, 3]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it('is commutative', () => {
    const a = new Float32Array([1, 3, 5, 7]);
    const b = new Float32Array([2, 4, 6, 8]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(cosineSimilarity(b, a), 10);
  });

  it('works with higher-dimensional vectors', () => {
    // Simulate 384-dim vectors (bge-small-en-v1.5 output size)
    const a = new Float32Array(384);
    const b = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      a[i] = Math.sin(i);
      b[i] = Math.cos(i);
    }
    const sim = cosineSimilarity(a, b);
    // sin and cos are orthogonal-ish over many samples, should be near 0
    expect(Math.abs(sim)).toBeLessThan(0.1);
  });
});

describe('vectorToBuffer / bufferToVector', () => {
  it('roundtrips a vector through Buffer', () => {
    const original = new Float32Array([1.5, -2.3, 0.0, 42.0]);
    const buf = vectorToBuffer(original);
    const restored = bufferToVector(buf);
    expect(restored.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(restored[i]).toBeCloseTo(original[i], 5);
    }
  });

  it('roundtrips an empty vector', () => {
    const original = new Float32Array([]);
    const buf = vectorToBuffer(original);
    const restored = bufferToVector(buf);
    expect(restored.length).toBe(0);
  });

  it('preserves buffer byte length', () => {
    const vec = new Float32Array([1, 2, 3]);
    const buf = vectorToBuffer(vec);
    // Float32 = 4 bytes per element
    expect(buf.byteLength).toBe(12);
  });
});

describe('ensureEmbeddingsTable', () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = tempDbPath();
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    const dir = path.dirname(dbPath);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates the embeddings table', () => {
    ensureEmbeddingsTable(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'")
      .all() as { name: string }[];
    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('embeddings');
  });

  it('is idempotent', () => {
    ensureEmbeddingsTable(db);
    ensureEmbeddingsTable(db);
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='embeddings'")
      .all() as { name: string }[];
    expect(tables).toHaveLength(1);
  });

  it('creates table with correct columns', () => {
    ensureEmbeddingsTable(db);
    const info = db.prepare('PRAGMA table_info(embeddings)').all() as {
      name: string;
      type: string;
    }[];
    const columns = info.map((c) => c.name);
    expect(columns).toContain('uuid');
    expect(columns).toContain('vector');
    expect(columns).toContain('dimensions');
  });
});

describe('EmbeddingService', () => {
  describe('initialization', () => {
    it('isReady returns false before initialization', () => {
      const service = new EmbeddingService();
      expect(service.isReady()).toBe(false);
    });

    it('initializes successfully with a working backend', async () => {
      const backend = new MockBackend(true);
      const service = new EmbeddingService(backend);
      const ok = await service.initialize();
      expect(ok).toBe(true);
      expect(service.isReady()).toBe(true);
    });

    it('returns false when backend fails to initialize', async () => {
      const backend = new MockBackend(false);
      const service = new EmbeddingService(backend);
      // Mock fallback backends so they also fail — otherwise the service
      // may successfully initialize via Transformers.js or Ollama.
      const transformersSpy = vi.spyOn(TransformersBackend.prototype, 'initialize').mockResolvedValue(false);
      const ollamaSpy = vi.spyOn(OllamaBackend.prototype, 'initialize').mockResolvedValue(false);
      try {
        const ok = await service.initialize();
        expect(ok).toBe(false);
        expect(service.isReady()).toBe(false);
      } finally {
        transformersSpy.mockRestore();
        ollamaSpy.mockRestore();
      }
    });

    it('generateEmbedding returns null when not initialized', async () => {
      const service = new EmbeddingService();
      const result = await service.generateEmbedding('test');
      expect(result).toBeNull();
    });
  });

  describe('storeEmbedding / getEmbedding', () => {
    let db: Database.Database;
    let dbPath: string;
    let service: EmbeddingService;

    beforeEach(async () => {
      dbPath = tempDbPath();
      db = new Database(dbPath);
      const backend = new MockBackend(true);
      service = new EmbeddingService(backend);
      await service.initialize();
    });

    afterEach(() => {
      db.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const dir = path.dirname(dbPath);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('stores and retrieves a vector', () => {
      const vec = new Float32Array([0.1, 0.2, 0.3, 0.4]);
      service.storeEmbedding(db, 'mem-1', vec);

      const retrieved = service.getEmbedding(db, 'mem-1');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.length).toBe(4);
      for (let i = 0; i < vec.length; i++) {
        expect(retrieved![i]).toBeCloseTo(vec[i], 5);
      }
    });

    it('overwrites existing embedding with same uuid', () => {
      const vec1 = new Float32Array([1, 0, 0, 0]);
      const vec2 = new Float32Array([0, 0, 0, 1]);
      service.storeEmbedding(db, 'mem-1', vec1);
      service.storeEmbedding(db, 'mem-1', vec2);

      const retrieved = service.getEmbedding(db, 'mem-1');
      expect(retrieved![0]).toBeCloseTo(0, 5);
      expect(retrieved![3]).toBeCloseTo(1, 5);
    });

    it('returns null for non-existent uuid', () => {
      const retrieved = service.getEmbedding(db, 'nonexistent');
      expect(retrieved).toBeNull();
    });

    it('stores correct dimensions metadata', () => {
      const vec = new Float32Array([1, 2, 3, 4, 5]);
      service.storeEmbedding(db, 'mem-dims', vec);

      ensureEmbeddingsTable(db);
      const row = db.prepare('SELECT dimensions FROM embeddings WHERE uuid = ?').get('mem-dims') as {
        dimensions: number;
      };
      expect(row.dimensions).toBe(5);
    });
  });

  describe('removeEmbedding', () => {
    let db: Database.Database;
    let dbPath: string;
    let service: EmbeddingService;

    beforeEach(async () => {
      dbPath = tempDbPath();
      db = new Database(dbPath);
      const backend = new MockBackend(true);
      service = new EmbeddingService(backend);
      await service.initialize();
    });

    afterEach(() => {
      db.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const dir = path.dirname(dbPath);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('removes an existing embedding', () => {
      service.storeEmbedding(db, 'mem-1', new Float32Array([1, 2, 3]));
      expect(service.removeEmbedding(db, 'mem-1')).toBe(true);
      expect(service.getEmbedding(db, 'mem-1')).toBeNull();
    });

    it('returns false for non-existent uuid', () => {
      expect(service.removeEmbedding(db, 'nonexistent')).toBe(false);
    });
  });

  describe('semanticSearch ranking', () => {
    let db: Database.Database;
    let dbPath: string;
    let service: EmbeddingService;

    beforeEach(async () => {
      dbPath = tempDbPath();
      db = new Database(dbPath);
      const backend = new MockBackend(true);
      service = new EmbeddingService(backend);
      await service.initialize();
    });

    afterEach(() => {
      db.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const dir = path.dirname(dbPath);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('returns results sorted by similarity score (highest first)', () => {
      // Store vectors that are at known distances from our query
      const query = new Float32Array([1, 0, 0, 0]);

      // Very similar to query
      const close = new Float32Array([0.95, 0.1, 0.05, 0.0]);
      // Somewhat similar
      const medium = new Float32Array([0.5, 0.5, 0.5, 0.5]);
      // Opposite direction
      const far = new Float32Array([-1, 0, 0, 0]);

      service.storeEmbedding(db, 'close', close);
      service.storeEmbedding(db, 'medium', medium);
      service.storeEmbedding(db, 'far', far);

      const results = service.semanticSearchWithVector(db, query, 10);

      expect(results.length).toBe(3);
      expect(results[0].uuid).toBe('close');
      expect(results[1].uuid).toBe('medium');
      expect(results[2].uuid).toBe('far');

      // Scores should be in descending order
      expect(results[0].score).toBeGreaterThan(results[1].score);
      expect(results[1].score).toBeGreaterThan(results[2].score);
    });

    it('respects the limit parameter', () => {
      const query = new Float32Array([1, 0, 0, 0]);
      service.storeEmbedding(db, 'a', new Float32Array([1, 0, 0, 0]));
      service.storeEmbedding(db, 'b', new Float32Array([0, 1, 0, 0]));
      service.storeEmbedding(db, 'c', new Float32Array([0, 0, 1, 0]));

      const results = service.semanticSearchWithVector(db, query, 2);
      expect(results.length).toBe(2);
    });

    it('returns empty array when no embeddings stored', () => {
      const query = new Float32Array([1, 0, 0, 0]);
      const results = service.semanticSearchWithVector(db, query, 10);
      expect(results.length).toBe(0);
    });

    it('skips embeddings with mismatched dimensions', () => {
      const query = new Float32Array([1, 0, 0, 0]); // 4 dims

      // Store a 3-dim vector (mismatch)
      service.storeEmbedding(db, 'mismatch', new Float32Array([1, 0, 0]));
      // Store a 4-dim vector (match)
      service.storeEmbedding(db, 'match', new Float32Array([0.9, 0.1, 0, 0]));

      const results = service.semanticSearchWithVector(db, query, 10);
      expect(results.length).toBe(1);
      expect(results[0].uuid).toBe('match');
    });

    it('returns correct scores for known vectors', () => {
      const query = new Float32Array([1, 0]);

      // Identical direction
      service.storeEmbedding(db, 'identical', new Float32Array([1, 0]));
      // 45 degrees
      const sqrt2 = Math.SQRT1_2;
      service.storeEmbedding(db, 'diagonal', new Float32Array([sqrt2, sqrt2]));
      // Orthogonal
      service.storeEmbedding(db, 'orthogonal', new Float32Array([0, 1]));

      const results = service.semanticSearchWithVector(db, query, 10);

      expect(results[0].uuid).toBe('identical');
      expect(results[0].score).toBeCloseTo(1.0, 5);

      expect(results[1].uuid).toBe('diagonal');
      expect(results[1].score).toBeCloseTo(sqrt2, 4);

      expect(results[2].uuid).toBe('orthogonal');
      expect(results[2].score).toBeCloseTo(0.0, 5);
    });
  });

  describe('semanticSearch with mock backend', () => {
    let db: Database.Database;
    let dbPath: string;
    let service: EmbeddingService;
    let backend: MockBackend;

    beforeEach(async () => {
      dbPath = tempDbPath();
      db = new Database(dbPath);
      backend = new MockBackend(true);
      service = new EmbeddingService(backend);
      await service.initialize();
    });

    afterEach(() => {
      db.close();
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      const dir = path.dirname(dbPath);
      if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('generates embedding from text and searches', async () => {
      // Set up a known mapping
      const queryVec = new Float32Array([1, 0, 0, 0]);
      const storedVec = new Float32Array([0.9, 0.1, 0, 0]);
      backend.setVector('find something', queryVec);

      service.storeEmbedding(db, 'result-1', storedVec);

      const results = await service.semanticSearch(db, 'find something', 10);
      expect(results.length).toBe(1);
      expect(results[0].uuid).toBe('result-1');
      expect(results[0].score).toBeGreaterThan(0.9);
    });

    it('returns empty when service is not ready', async () => {
      const failBackend = new MockBackend(false);
      const failService = new EmbeddingService(failBackend);
      // Don't initialize — stays not ready

      const results = await failService.semanticSearch(db, 'test', 10);
      expect(results).toEqual([]);
    });
  });

  describe('graceful degradation', () => {
    it('EmbeddingService works when no backend available', async () => {
      const failing = new MockBackend(false);
      const service = new EmbeddingService(failing);

      // Mock fallback backends so they also fail — otherwise the service
      // may successfully initialize via Transformers.js or Ollama.
      const transformersSpy = vi.spyOn(TransformersBackend.prototype, 'initialize').mockResolvedValue(false);
      const ollamaSpy = vi.spyOn(OllamaBackend.prototype, 'initialize').mockResolvedValue(false);
      try {
        const ok = await service.initialize();
        expect(ok).toBe(false);
        expect(service.isReady()).toBe(false);

        // generateEmbedding returns null safely
        const vec = await service.generateEmbedding('test');
        expect(vec).toBeNull();
      } finally {
        transformersSpy.mockRestore();
        ollamaSpy.mockRestore();
      }
    });

    it('storeEmbedding and getEmbedding work independently of backend readiness', async () => {
      // Even with a failing backend, DB operations should work
      const backend = new MockBackend(true);
      const service = new EmbeddingService(backend);
      await service.initialize();

      const dbPath = tempDbPath();
      const db = new Database(dbPath);

      try {
        const vec = new Float32Array([1, 2, 3]);
        service.storeEmbedding(db, 'test-id', vec);
        const retrieved = service.getEmbedding(db, 'test-id');
        expect(retrieved).not.toBeNull();
        expect(retrieved!.length).toBe(3);
      } finally {
        db.close();
        if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
        fs.rmdirSync(path.dirname(dbPath));
      }
    });
  });
});

// ---------------------------------------------------------------------------
// Store-level backend selection via config.embeddings.* (0.4.3+)
// ---------------------------------------------------------------------------
//
// These tests verify that `.aide/config.json` settings for embeddings.backend
// and embeddings.model actually drive which backend the MemoryStore constructs,
// not just that the config round-trips through `aide-memory config`. Closes
// the gap from all-configs-behavior.test.sh which only verifies roundtrip.
// ---------------------------------------------------------------------------

describe('MemoryStore — embeddings backend selection via config', () => {
  const tmpProjectRoot = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-backend-config-'));
    fs.mkdirSync(path.join(dir, '.aide'), { recursive: true });
    fs.mkdirSync(path.join(dir, '.aide', 'memories'), { recursive: true });
    return dir;
  };

  const writeConfig = (root: string, config: Record<string, unknown>): void => {
    fs.writeFileSync(path.join(root, '.aide', 'config.json'), JSON.stringify(config, null, 2));
  };

  const cleanup = (root: string): void => {
    // Also clean up ~/.aide/projects/<hash>/ side-effect
    try {
      fs.rmSync(root, { recursive: true, force: true });
    } catch {
      // best effort
    }
  };

  it('embeddings.backend="none" → embeddingService is null', async () => {
    // Lazy-require to avoid circular import at the top of the file.
    const { MemoryStore } = await import('../store');
    const root = tmpProjectRoot();
    writeConfig(root, { embeddings: { backend: 'none' } });

    const store = new MemoryStore({ projectRoot: root });
    try {
      // Backend is null when user explicitly disables — keyword/FTS5 only.
      expect((store as any).embeddingService).toBeNull();
    } finally {
      store.close();
      cleanup(root);
    }
  });

  it('embeddings.backend="transformers" → constructs TransformersBackend (not Ollama)', async () => {
    const { MemoryStore } = await import('../store');

    // Spy on both backend initializers so we can tell which one got
    // constructed + initialized. We don't run real init (optional dep may
    // not be installed) — just prove the RIGHT class was instantiated.
    const transformersInit = vi.spyOn(TransformersBackend.prototype, 'initialize').mockResolvedValue(false);
    const ollamaInit = vi.spyOn(OllamaBackend.prototype, 'initialize').mockResolvedValue(false);

    const root = tmpProjectRoot();
    writeConfig(root, { embeddings: { backend: 'transformers', model: 'my-custom-model' } });

    const store = new MemoryStore({ projectRoot: root });
    try {
      // embeddingService exists with a preferred backend set to Transformers.
      const svc = (store as any).embeddingService;
      expect(svc).not.toBeNull();
      const preferred = (svc as any).preferredBackend;
      expect(preferred).toBeInstanceOf(TransformersBackend);
      // Model override propagated into the backend constructor.
      expect((preferred as any).modelName).toBe('my-custom-model');

      // Now trigger the service init so the spy runs.
      await svc.initialize();
      expect(transformersInit).toHaveBeenCalled();
      // Ollama should NOT be tried when user forced transformers.
      // (It only falls through to ollama if no preferredBackend was passed.)
      expect(ollamaInit).not.toHaveBeenCalled();
    } finally {
      store.close();
      cleanup(root);
      transformersInit.mockRestore();
      ollamaInit.mockRestore();
    }
  });

  it('embeddings.backend="ollama" → constructs OllamaBackend (not Transformers)', async () => {
    const { MemoryStore } = await import('../store');

    const transformersInit = vi.spyOn(TransformersBackend.prototype, 'initialize').mockResolvedValue(false);
    const ollamaInit = vi.spyOn(OllamaBackend.prototype, 'initialize').mockResolvedValue(false);

    const root = tmpProjectRoot();
    writeConfig(root, { embeddings: { backend: 'ollama', model: 'nomic-embed-text' } });

    const store = new MemoryStore({ projectRoot: root });
    try {
      const svc = (store as any).embeddingService;
      expect(svc).not.toBeNull();
      const preferred = (svc as any).preferredBackend;
      expect(preferred).toBeInstanceOf(OllamaBackend);
      expect((preferred as any).model).toBe('nomic-embed-text');

      await svc.initialize();
      expect(ollamaInit).toHaveBeenCalled();
      expect(transformersInit).not.toHaveBeenCalled();
    } finally {
      store.close();
      cleanup(root);
      transformersInit.mockRestore();
      ollamaInit.mockRestore();
    }
  });

  it('embeddings.backend="auto" → store leaves embeddingService null (MCP server attaches later)', async () => {
    const { MemoryStore } = await import('../store');

    const root = tmpProjectRoot();
    writeConfig(root, { embeddings: { backend: 'auto' } });

    const store = new MemoryStore({ projectRoot: root });
    try {
      // 'auto' mode: constructor doesn't attach a preferred backend.
      // server.ts's startServer() calls `new EmbeddingService()` + setEmbeddingService()
      // later so the fallback chain (transformers → ollama → keyword-only) runs
      // at MCP startup. This separation keeps optional-dep init out of the
      // sync constructor.
      expect((store as any).embeddingService).toBeNull();

      // Verify setEmbeddingService is the attachment point downstream callers use.
      const { EmbeddingService } = await import('../embeddings');
      const attached = new EmbeddingService();
      store.setEmbeddingService(attached);
      expect((store as any).embeddingService).toBe(attached);
    } finally {
      store.close();
      cleanup(root);
    }
  });

  it('missing embeddings config → same as explicit auto (null at construction)', async () => {
    const { MemoryStore } = await import('../store');

    const root = tmpProjectRoot();
    writeConfig(root, { telemetry: { enabled: true } });  // no embeddings block at all

    const store = new MemoryStore({ projectRoot: root });
    try {
      expect((store as any).embeddingService).toBeNull();
    } finally {
      store.close();
      cleanup(root);
    }
  });
});

describe('MemoryStore — embedding key (regression: must be uuid, not String(id))', () => {
  // Bug found 2026-04-28: store.add was calling
  //   embeddingService.storeEmbedding(this.db, String(memory.id), vec)
  // but searchWithEmbeddings later does
  //   getByUuid(hit.uuid)
  // which queries the memories table by the actual UUID hash. Storing
  // under integer-as-string meant the lookup never resolved and semantic
  // search returned empty. Fixed by passing memory.uuid as the key.
  // This regression test pins the contract.

  function tmpRoot(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'aide-embed-key-'));
  }
  function rm(p: string): void {
    if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
  }

  it('store.add → storeEmbedding key is memory.uuid (not String(memory.id))', async () => {
    const { MemoryStore } = await import('../store');

    const root = tmpRoot();
    fs.mkdirSync(path.join(root, '.aide'), { recursive: true });
    const store = new MemoryStore({ projectRoot: root });

    // Use a deterministic mock backend that stores per-text vectors so we
    // can verify the storeEmbedding call ran AND used the right key.
    const backend = new MockBackend(true);
    backend.setVector('Test memory text', new Float32Array([1, 0, 0]));
    const svc = new EmbeddingService(backend);
    await svc.initialize();
    store.setEmbeddingService(svc);

    const memory = store.add({
      layer: 'technical',
      what: 'Test memory text',
      scope: 'src/**',
    });

    // Wait for fire-and-forget embedding generation + storage.
    await new Promise((r) => setTimeout(r, 50));

    const db = (store as any).db;
    const rows = db.prepare('SELECT uuid FROM embeddings').all() as { uuid: string }[];

    // Key must be the actual UUID, not the integer id stringified.
    expect(rows).toHaveLength(1);
    expect(rows[0].uuid).toBe(memory.uuid);
    expect(rows[0].uuid).not.toBe(String(memory.id));
    expect(rows[0].uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);

    store.close();
    rm(root);
  });

  it('store.update → storeEmbedding regenerates under memory.uuid', async () => {
    const { MemoryStore } = await import('../store');

    const root = tmpRoot();
    fs.mkdirSync(path.join(root, '.aide'), { recursive: true });
    const store = new MemoryStore({ projectRoot: root });

    const backend = new MockBackend(true);
    backend.setVector('Original text', new Float32Array([1, 0, 0]));
    backend.setVector('Updated text', new Float32Array([0, 1, 0]));
    const svc = new EmbeddingService(backend);
    await svc.initialize();
    store.setEmbeddingService(svc);

    const memory = store.add({ layer: 'technical', what: 'Original text', scope: 'src/**' });
    await new Promise((r) => setTimeout(r, 50));

    store.update(memory.id, { what: 'Updated text' });
    await new Promise((r) => setTimeout(r, 50));

    const db = (store as any).db;
    const rows = db.prepare('SELECT uuid FROM embeddings').all() as { uuid: string }[];
    expect(rows.find((r) => r.uuid === memory.uuid)).toBeDefined();
    expect(rows.find((r) => r.uuid === String(memory.id))).toBeUndefined();

    store.close();
    rm(root);
  });

  it('store.remove → removeEmbedding deletes under memory.uuid', async () => {
    const { MemoryStore } = await import('../store');

    const root = tmpRoot();
    fs.mkdirSync(path.join(root, '.aide'), { recursive: true });
    const store = new MemoryStore({ projectRoot: root });

    const backend = new MockBackend(true);
    backend.setVector('Doomed memory', new Float32Array([1, 0, 0]));
    const svc = new EmbeddingService(backend);
    await svc.initialize();
    store.setEmbeddingService(svc);

    const memory = store.add({ layer: 'technical', what: 'Doomed memory', scope: 'src/**' });
    await new Promise((r) => setTimeout(r, 50));

    const db = (store as any).db;
    const before = db.prepare('SELECT COUNT(*) as n FROM embeddings WHERE uuid = ?').get(memory.uuid) as { n: number };
    expect(before.n).toBe(1);

    store.remove(memory.id);

    const after = db.prepare('SELECT COUNT(*) as n FROM embeddings WHERE uuid = ?').get(memory.uuid) as { n: number };
    expect(after.n).toBe(0);

    store.close();
    rm(root);
  });

  it('semantic search via searchWithEmbeddings actually returns the matching memory (end-to-end)', async () => {
    // Pins the full lookup chain: store.add → embedding stored under uuid →
    // searchWithEmbeddings → semanticSearch returns hit.uuid → getByUuid
    // resolves to the memory. Pre-fix, this returned [].
    const { MemoryStore } = await import('../store');

    const root = tmpRoot();
    fs.mkdirSync(path.join(root, '.aide'), { recursive: true });
    const store = new MemoryStore({ projectRoot: root });

    const backend = new MockBackend(true);
    // Register identical vectors for both the store-time embedding text
    // (memory.what with no why → just 'Rate limit middleware') and the
    // query-time text. Cosine of identical vectors = 1.0, well over the
    // 0.3 threshold in searchWithEmbeddings.
    backend.setVector('Rate limit middleware', new Float32Array([1, 0, 0]));
    backend.setVector('throttle policy', new Float32Array([1, 0, 0]));
    const svc = new EmbeddingService(backend);
    await svc.initialize();
    store.setEmbeddingService(svc);

    const memory = store.add({ layer: 'technical', what: 'Rate limit middleware', scope: 'src/api/**' });
    await new Promise((r) => setTimeout(r, 50));

    const results = await store.searchWithEmbeddings('throttle policy', { mode: 'semantic', limit: 5 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe(memory.id);
    expect(results[0].what).toBe('Rate limit middleware');

    store.close();
    rm(root);
  });
});
