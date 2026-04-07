import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

// Mock https before importing the module
vi.mock('https', () => ({
  default: {
    get: vi.fn(),
  },
}));

import { checkForUpdates, printUpdateNotice } from '../updater';
import https from 'https';

const CACHE_PATH = path.join(os.homedir(), '.aide', 'update-check.json');

describe('updater', () => {
  let originalCache: string | null = null;

  beforeEach(() => {
    // Preserve existing cache
    try {
      originalCache = fs.readFileSync(CACHE_PATH, 'utf-8');
    } catch {
      originalCache = null;
    }
    // Clear cache for each test
    try { fs.unlinkSync(CACHE_PATH); } catch { /* ignore */ }
  });

  afterEach(() => {
    // Restore original cache
    if (originalCache) {
      fs.writeFileSync(CACHE_PATH, originalCache, 'utf-8');
    } else {
      try { fs.unlinkSync(CACHE_PATH); } catch { /* ignore */ }
    }
    vi.restoreAllMocks();
  });

  it('returns null when registry returns same version', async () => {
    const mockResponse = {
      statusCode: 200,
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify({ version: '0.2.0' })));
        if (event === 'end') handler();
        return mockResponse;
      }),
      resume: vi.fn(),
    };
    (https.get as any).mockImplementation((_url: string, _opts: any, cb: Function) => {
      cb(mockResponse);
      return { on: vi.fn(), destroy: vi.fn() };
    });

    const result = await checkForUpdates('0.2.0');
    expect(result).toBeNull();
  });

  it('returns newer version when registry has update', async () => {
    const mockResponse = {
      statusCode: 200,
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify({ version: '0.3.0' })));
        if (event === 'end') handler();
        return mockResponse;
      }),
      resume: vi.fn(),
    };
    (https.get as any).mockImplementation((_url: string, _opts: any, cb: Function) => {
      cb(mockResponse);
      return { on: vi.fn(), destroy: vi.fn() };
    });

    const result = await checkForUpdates('0.2.0');
    expect(result).toBe('0.3.0');
  });

  it('returns null on network error', async () => {
    (https.get as any).mockImplementation((_url: string, _opts: any, _cb: Function) => {
      const req = {
        on: vi.fn((event: string, handler: Function) => {
          if (event === 'error') handler(new Error('ECONNREFUSED'));
          return req;
        }),
        destroy: vi.fn(),
      };
      return req;
    });

    const result = await checkForUpdates('0.2.0');
    expect(result).toBeNull();
  });

  it('uses cache within 24 hours', async () => {
    // Seed cache with a recent check
    const cache = { lastCheck: Date.now(), latestVersion: '0.5.0' };
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');

    // Should return 0.5.0 from cache without calling https.get
    const result = await checkForUpdates('0.2.0');
    expect(result).toBe('0.5.0');
    expect(https.get).not.toHaveBeenCalled();
  });

  it('re-fetches when cache is stale', async () => {
    // Seed cache with an old check (>24h ago)
    const cache = { lastCheck: Date.now() - 25 * 60 * 60 * 1000, latestVersion: '0.2.0' };
    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf-8');

    const mockResponse = {
      statusCode: 200,
      on: vi.fn((event: string, handler: Function) => {
        if (event === 'data') handler(Buffer.from(JSON.stringify({ version: '0.4.0' })));
        if (event === 'end') handler();
        return mockResponse;
      }),
      resume: vi.fn(),
    };
    (https.get as any).mockImplementation((_url: string, _opts: any, cb: Function) => {
      cb(mockResponse);
      return { on: vi.fn(), destroy: vi.fn() };
    });

    const result = await checkForUpdates('0.2.0');
    expect(result).toBe('0.4.0');
    expect(https.get).toHaveBeenCalled();
  });

  it('printUpdateNotice outputs to stderr', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    printUpdateNotice('0.2.0', '0.3.0');
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('v0.3.0 available'));
    expect(spy).toHaveBeenCalledWith(expect.stringContaining('npm update -g aide-memory'));
    spy.mockRestore();
  });
});
