import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { ToolExecutor } from '../toolExecutor';
import { SQLiteBrainStore } from '../../brain/sqliteStore';
import { ProjectGraph } from '../../brain/projectGraph';
import { ProjectIndexer } from '../../project/indexer';

const FIXTURE_DIR = path.resolve(__dirname, 'fixtures/tool-test-project');
const PROJECT_ID = 'test-tool-executor';

let store: SQLiteBrainStore;
let graph: ProjectGraph;
let dbPath: string;

let graphExecutor: ToolExecutor;
let fallbackExecutor: ToolExecutor;

beforeAll(async () => {
  dbPath = path.join(os.tmpdir(), `aide-test-${Date.now()}.db`);
  store = new SQLiteBrainStore(dbPath);
  store.initialize();
  graph = store;

  const indexer = new ProjectIndexer(graph);
  const files = ['types.ts', 'utils.ts', 'service.ts', 'index.ts'];
  for (const file of files) {
    const absPath = path.join(FIXTURE_DIR, file);
    await indexer.indexFile(FIXTURE_DIR, absPath, PROJECT_ID);
  }

  graphExecutor = new ToolExecutor(graph, null, FIXTURE_DIR);
  fallbackExecutor = new ToolExecutor(null, null, FIXTURE_DIR);
}, 30000);

afterAll(() => {
  store?.close();
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
});

// ============================================================================
// find_symbol
// ============================================================================

describe('find_symbol', () => {
  it('finds symbol by exact name with graph', async () => {
    const result = await (graphExecutor as any).handleFindSymbol({ query: 'calculateTotal' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
    expect(result.data).toContain('Symbols matching');
  });

  it('finds symbol by exact name with fallback', async () => {
    const result = await (fallbackExecutor as any).handleFindSymbol({ query: 'calculateTotal' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
    expect(result.data).toContain('Symbols matching');
  });

  it('finds symbol with partial query via graph', async () => {
    const result = await (graphExecutor as any).handleFindSymbol({ query: 'calculate' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
  });

  it('finds symbol with partial query via fallback', async () => {
    const result = await (fallbackExecutor as any).handleFindSymbol({ query: 'calculate' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
  });

  it('returns no results for nonexistent symbol (graph)', async () => {
    const result = await (graphExecutor as any).handleFindSymbol({ query: 'zzznonexistent' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('No results found');
  });

  it('returns no results for nonexistent symbol (fallback)', async () => {
    const result = await (fallbackExecutor as any).handleFindSymbol({ query: 'zzznonexistent' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('No results found');
  });

  it('emits graph IDs with graph', async () => {
    const result = await (graphExecutor as any).handleFindSymbol({ query: 'OrderService' });
    expect(result.success).toBe(true);
    expect(result.data).toMatch(/ID: sym:/);
  });

  it('emits synthetic IDs with fallback', async () => {
    const result = await (fallbackExecutor as any).handleFindSymbol({ query: 'OrderService' });
    expect(result.success).toBe(true);
    expect(result.data).toMatch(/ID: fs:/);
  });

  it('fallback does not include node_modules decoy', async () => {
    const result = await (fallbackExecutor as any).handleFindSymbol({ query: 'calculateTotal' });
    expect(result.success).toBe(true);
    expect(result.data).not.toContain('node_modules');
  });

  it('finds content matches for string in file content (graph)', async () => {
    const result = await (graphExecutor as any).handleFindSymbol({ query: 'discountPercent' });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('finds content matches for string in file content (fallback)', async () => {
    const result = await (fallbackExecutor as any).handleFindSymbol({ query: 'discountPercent' });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });
});

// ============================================================================
// get_symbol_detail
// ============================================================================

describe('get_symbol_detail', () => {
  it('returns symbol detail with graph', async () => {
    const findResult = await (graphExecutor as any).handleFindSymbol({ query: 'calculateTotal' });
    const idMatch = findResult.data?.match(/ID: (sym:\S+)/);
    expect(idMatch).toBeTruthy();
    const symbolId = idMatch![1];

    const result = await (graphExecutor as any).handleGetSymbolDetail({ symbolId });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
    expect(result.data).toContain('Code:');
  });

  it('returns symbol detail with fallback', async () => {
    const findResult = await (fallbackExecutor as any).handleFindSymbol({ query: 'calculateTotal' });
    const idMatch = findResult.data?.match(/ID: (fs:\S+)/);
    expect(idMatch).toBeTruthy();
    const symbolId = idMatch![1];

    const result = await (fallbackExecutor as any).handleGetSymbolDetail({ symbolId });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
    expect(result.data).toContain('Code:');
  });

  it('fallback returns error for graph ID', async () => {
    const result = await (fallbackExecutor as any).handleGetSymbolDetail({ symbolId: 'sym:abc123' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Use find_symbol first');
  });

  it('fallback returns error for invalid synthetic ID', async () => {
    const result = await (fallbackExecutor as any).handleGetSymbolDetail({ symbolId: 'fs:bad' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid');
  });
});

// ============================================================================
// get_references
// ============================================================================

describe('get_references', () => {
  it('handles graph references for a known symbol', async () => {
    const findResult = await (graphExecutor as any).handleFindSymbol({ query: 'calculateTotal' });
    const idMatch = findResult.data?.match(/ID: (sym:\S+)/);
    expect(idMatch).toBeTruthy();
    const symbolId = idMatch![1];

    const result = await (graphExecutor as any).handleGetReferences({ symbolId });
    expect(result.success).toBe(true);
  });

  it('finds references with fallback using synthetic ID', async () => {
    const findResult = await (fallbackExecutor as any).handleFindSymbol({ query: 'calculateTotal' });
    const idMatch = findResult.data?.match(/ID: (fs:\S+)/);
    expect(idMatch).toBeTruthy();
    const symbolId = idMatch![1];

    const result = await (fallbackExecutor as any).handleGetReferences({ symbolId });
    expect(result.success).toBe(true);
    expect(result.data).toContain('References');
    expect(result.data).toContain('calculateTotal');
  });

  it('fallback finds references by raw symbol name', async () => {
    const result = await (fallbackExecutor as any).handleGetReferences({ symbolId: 'calculateTotal' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('References');
    expect(result.data).toContain('service.ts');
  });

  it('returns no references for unknown symbol (graph)', async () => {
    const result = await (graphExecutor as any).handleGetReferences({ symbolId: 'sym:nonexistent' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('No references found');
  });
});

// ============================================================================
// get_dependencies
// ============================================================================

describe('get_dependencies', () => {
  it('finds dependencies with graph', async () => {
    const findResult = await (graphExecutor as any).handleFindSymbol({ query: 'OrderService' });
    const idMatch = findResult.data?.match(/ID: (sym:\S+)/);
    expect(idMatch).toBeTruthy();
    const symbolId = idMatch![1];

    const result = await (graphExecutor as any).handleGetDependencies({ symbolId });
    expect(result.success).toBe(true);
  });

  it('finds dependencies with fallback', async () => {
    const findResult = await (fallbackExecutor as any).handleFindSymbol({ query: 'OrderService' });
    const idMatch = findResult.data?.match(/ID: (fs:\S+)/);
    expect(idMatch).toBeTruthy();
    const symbolId = idMatch![1];

    const result = await (fallbackExecutor as any).handleGetDependencies({ symbolId });
    expect(result.success).toBe(true);
    expect(result.data).toContain('Dependencies');
    expect(result.data).toContain('IMPORTS');
  });

  it('fallback returns error for graph ID', async () => {
    const result = await (fallbackExecutor as any).handleGetDependencies({ symbolId: 'sym:abc123' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Use find_symbol first');
  });

  it('fallback includes limitation note', async () => {
    const findResult = await (fallbackExecutor as any).handleFindSymbol({ query: 'OrderService' });
    const idMatch = findResult.data?.match(/ID: (fs:\S+)/);
    const symbolId = idMatch![1];

    const result = await (fallbackExecutor as any).handleGetDependencies({ symbolId });
    expect(result.data).toContain('aide reindex');
  });
});

// ============================================================================
// read_file_outline
// ============================================================================

describe('read_file_outline', () => {
  it('returns outline with graph', async () => {
    const result = await (graphExecutor as any).handleReadFileOutline({ filePath: 'utils.ts' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
    expect(result.data).toContain('formatPrice');
  });

  it('returns outline with fallback', async () => {
    const result = await (fallbackExecutor as any).handleReadFileOutline({ filePath: 'utils.ts' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
    expect(result.data).toContain('formatPrice');
  });
});

// ============================================================================
// read_file / read_lines
// ============================================================================

describe('read_file', () => {
  it('reads file content with graph executor', async () => {
    const result = await (graphExecutor as any).handleReadFile({ filePath: 'types.ts' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('interface Item');
  });

  it('reads file content with fallback executor', async () => {
    const result = await (fallbackExecutor as any).handleReadFile({ filePath: 'types.ts' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('interface Item');
  });
});

describe('read_lines', () => {
  it('reads specific lines with graph executor', async () => {
    const result = await (graphExecutor as any).handleReadLines({ filePath: 'utils.ts', startLine: 3, endLine: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
  });

  it('reads specific lines with fallback executor', async () => {
    const result = await (fallbackExecutor as any).handleReadLines({ filePath: 'utils.ts', startLine: 3, endLine: 5 });
    expect(result.success).toBe(true);
    expect(result.data).toContain('calculateTotal');
  });
});

// ============================================================================
// list_files
// ============================================================================

describe('list_files', () => {
  it('lists files with graph executor', async () => {
    const result = await (graphExecutor as any).handleListFiles({ path: '.' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('types.ts');
    expect(result.data).toContain('utils.ts');
  });

  it('lists files with fallback executor', async () => {
    const result = await (fallbackExecutor as any).handleListFiles({ path: '.' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('types.ts');
    expect(result.data).toContain('utils.ts');
  });
});

// ============================================================================
// getAvailableTools
// ============================================================================

describe('getAvailableTools', () => {
  it('always includes advanced tools regardless of graph presence', () => {
    const graphTools = graphExecutor.getAvailableTools(true);
    const fallbackTools = fallbackExecutor.getAvailableTools(true);

    const graphToolNames = graphTools.map((t) => t.name);
    const fallbackToolNames = fallbackTools.map((t) => t.name);

    expect(graphToolNames).toContain('find_symbol');
    expect(graphToolNames).toContain('get_symbol_detail');
    expect(graphToolNames).toContain('get_references');
    expect(graphToolNames).toContain('get_dependencies');

    expect(fallbackToolNames).toContain('find_symbol');
    expect(fallbackToolNames).toContain('get_symbol_detail');
    expect(fallbackToolNames).toContain('get_references');
    expect(fallbackToolNames).toContain('get_dependencies');
  });

  it('excludes semantic_search when no embeddings', () => {
    const tools = graphExecutor.getAvailableTools(false);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).not.toContain('semantic_search');
  });

  it('includes semantic_search when embeddings available', () => {
    const tools = graphExecutor.getAvailableTools(true);
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('semantic_search');
  });
});

// ============================================================================
// Output format consistency
// ============================================================================

describe('output format consistency', () => {
  it('find_symbol output has matching section headers', async () => {
    const graphResult = await (graphExecutor as any).handleFindSymbol({ query: 'formatPrice' });
    const fallbackResult = await (fallbackExecutor as any).handleFindSymbol({ query: 'formatPrice' });

    expect(graphResult.success).toBe(true);
    expect(fallbackResult.success).toBe(true);

    if (graphResult.data?.includes('Symbols matching')) {
      expect(fallbackResult.data).toContain('Symbols matching');
    }
  });

  it('get_symbol_detail output has File and Code sections', async () => {
    const graphFind = await (graphExecutor as any).handleFindSymbol({ query: 'formatPrice' });
    const graphId = graphFind.data?.match(/ID: (sym:\S+)/)?.[1];
    const fallbackFind = await (fallbackExecutor as any).handleFindSymbol({ query: 'formatPrice' });
    const fallbackId = fallbackFind.data?.match(/ID: (fs:\S+)/)?.[1];

    if (graphId) {
      const graphDetail = await (graphExecutor as any).handleGetSymbolDetail({ symbolId: graphId });
      expect(graphDetail.data).toContain('File:');
      expect(graphDetail.data).toContain('Code:');
    }

    if (fallbackId) {
      const fallbackDetail = await (fallbackExecutor as any).handleGetSymbolDetail({ symbolId: fallbackId });
      expect(fallbackDetail.data).toContain('File:');
      expect(fallbackDetail.data).toContain('Code:');
    }
  });
});
