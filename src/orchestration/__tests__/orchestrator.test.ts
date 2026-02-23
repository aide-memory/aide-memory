import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../orchestrator';
import { ToolCallSpec, ToolCallResult, ContextEvaluation } from '../types';

// Create a minimal orchestrator instance for testing private methods.
// We only need the utility methods, not the full runtime.
function createTestOrchestrator(): any {
  const mockRuntimes = {
    reasoning: { supportsNativeTools: () => true, supportsTools: () => true, chat: async () => ({ content: '' }), chatWithTools: async () => ({ content: '' }) },
    context: { supportsNativeTools: () => true, supportsTools: () => true, chat: async () => ({ content: '' }), chatWithTools: async () => ({ content: '' }) },
    embedding: { embed: async () => [[]] },
  };
  const mockExecutor = { hasConversationHistory: () => false } as any;
  const mockTracker = { record: () => {} } as any;
  return new Orchestrator(mockRuntimes as any, mockExecutor, mockTracker);
}

// ============================================================================
// computeQuerySimilarity
// ============================================================================

describe('computeQuerySimilarity', () => {
  const orch = createTestOrchestrator();

  it('returns 1.0 for identical queries', () => {
    const sim = orch.computeQuerySimilarity('verbose log click scroll', 'verbose log click scroll');
    expect(sim).toBe(1);
  });

  it('returns high similarity for near-identical queries', () => {
    const sim = orch.computeQuerySimilarity(
      'verbose log click scrolls to bottom of list',
      'verbose log click scrolls to bottom',
    );
    expect(sim).toBeGreaterThan(0.7);
  });

  it('returns moderate similarity for partially overlapping queries', () => {
    const sim = orch.computeQuerySimilarity(
      'scrollIntoView verbose log item click',
      'verbose log click scrolls to bottom of list',
    );
    expect(sim).toBeGreaterThanOrEqual(0.3);
  });

  it('returns high similarity for context model repeat-search pattern', () => {
    // Context model typically appends words to the same base query
    const sim = orch.computeQuerySimilarity(
      'verbose log click scrolls to bottom of list unexpected scroll',
      'verbose log click scrolls to bottom of list unexpectedly scrollIntoView',
    );
    expect(sim).toBeGreaterThan(0.6);
  });

  it('returns low similarity for genuinely different queries', () => {
    const sim = orch.computeQuerySimilarity(
      'verbose log click scroll',
      'authentication middleware handler',
    );
    expect(sim).toBeLessThan(0.15);
  });

  it('returns 0 for completely disjoint queries', () => {
    const sim = orch.computeQuerySimilarity(
      'database connection pooling',
      'authentication middleware',
    );
    expect(sim).toBe(0);
  });

  it('handles empty strings', () => {
    expect(orch.computeQuerySimilarity('', '')).toBe(1);
    expect(orch.computeQuerySimilarity('hello', '')).toBe(0);
    expect(orch.computeQuerySimilarity('', 'world')).toBe(0);
  });
});

// ============================================================================
// filterSimilarSearchCalls
// ============================================================================

describe('filterSimilarSearchCalls', () => {
  const orch = createTestOrchestrator();

  function makeSearch(query: string): ToolCallSpec {
    return { name: 'semantic_search', arguments: { query } };
  }

  function makeResult(query: string, callKey: string): ToolCallResult {
    return {
      spec: { name: 'semantic_search', arguments: { query } },
      success: true,
      data: 'some result',
      callKey,
    };
  }

  it('passes through non-semantic-search calls unchanged', () => {
    const calls: ToolCallSpec[] = [
      { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
      { name: 'find_symbol', arguments: { query: 'foo' } },
    ];
    const result = orch.filterSimilarSearchCalls(calls, new Map());
    expect(result).toHaveLength(2);
  });

  it('keeps diverse semantic_search queries', () => {
    const calls = [
      makeSearch('authentication middleware'),
      makeSearch('database connection pooling'),
    ];
    const result = orch.filterSimilarSearchCalls(calls, new Map());
    expect(result).toHaveLength(2);
  });

  it('filters similar queries within a batch (context model repeat-search pattern)', () => {
    // Context model repeat-search pattern: appending words to same base query
    const calls = [
      makeSearch('verbose log click scrolls to bottom of list'),
      makeSearch('verbose log click scrolls to bottom of list unexpected scroll to bottom on click'),
      makeSearch('verbose log click scrolls to bottom of list unexpectedly scrollIntoView'),
    ];
    const result = orch.filterSimilarSearchCalls(calls, new Map());
    expect(result.length).toBeLessThan(3);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('keeps lexically diverse queries even if semantically related', () => {
    // Different vocabulary = low Jaccard overlap, even if semantically similar.
    // The prompt changes handle this case; the guard catches literal repetition.
    const calls = [
      makeSearch('verbose log click scrolls to bottom of list'),
      makeSearch('scrollIntoView verbose log item click'),
    ];
    const result = orch.filterSimilarSearchCalls(calls, new Map());
    expect(result).toHaveLength(2);
  });

  it('filters against previously executed queries', () => {
    const calls = [
      makeSearch('verbose log click scrolls to bottom'),
    ];
    const previousCalls = new Map<string, ToolCallResult>();
    previousCalls.set('semantic_search:abc', makeResult('verbose log click scrolls to bottom of list', 'semantic_search:abc'));
    const result = orch.filterSimilarSearchCalls(calls, previousCalls);
    expect(result).toHaveLength(0);
  });

  it('allows queries dissimilar to previous ones', () => {
    const calls = [
      makeSearch('authentication middleware handler'),
    ];
    const previousCalls = new Map<string, ToolCallResult>();
    previousCalls.set('semantic_search:abc', makeResult('verbose log click scroll', 'semantic_search:abc'));
    const result = orch.filterSimilarSearchCalls(calls, previousCalls);
    expect(result).toHaveLength(1);
  });

  it('preserves non-search calls alongside filtered searches', () => {
    const calls: ToolCallSpec[] = [
      makeSearch('verbose log click scrolls to bottom'),
      makeSearch('verbose log scrolls to bottom of list unexpectedly'),
      { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
    ];
    const result = orch.filterSimilarSearchCalls(calls, new Map());
    const readLinesCalls = result.filter((c: ToolCallSpec) => c.name === 'read_lines');
    const searchCalls = result.filter((c: ToolCallSpec) => c.name === 'semantic_search');
    expect(readLinesCalls).toHaveLength(1);
    expect(searchCalls.length).toBeLessThanOrEqual(2);
    expect(searchCalls.length).toBeGreaterThanOrEqual(1);
  });
});

// consolidateResults — REMOVED (Issue 1: caused out-of-bounds indices)

// ============================================================================
// safetyNetDedup (existing but verify still works)
// ============================================================================

describe('safetyNetDedup', () => {
  const orch = createTestOrchestrator();

  it('returns single result unchanged', () => {
    const results: ToolCallResult[] = [{
      spec: { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
      success: true,
      data: 'code',
      callKey: 'a',
    }];
    expect(orch.safetyNetDedup(results)).toHaveLength(1);
  });

  it('merges overlapping read_lines from the same file', () => {
    const results: ToolCallResult[] = [
      {
        spec: { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
        success: true,
        data: 'code1',
        callKey: 'a',
      },
      {
        spec: { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 5, endLine: 20 } },
        success: true,
        data: 'code2 (larger range)',
        callKey: 'b',
      },
    ];
    const deduped = orch.safetyNetDedup(results);
    expect(deduped).toHaveLength(1);
  });

  it('keeps non-overlapping results from different files', () => {
    const results: ToolCallResult[] = [
      {
        spec: { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
        success: true,
        data: 'code1',
        callKey: 'a',
      },
      {
        spec: { name: 'read_lines', arguments: { filePath: 'b.ts', startLine: 1, endLine: 10 } },
        success: true,
        data: 'code2',
        callKey: 'b',
      },
    ];
    const deduped = orch.safetyNetDedup(results);
    expect(deduped).toHaveLength(2);
  });
});

// ============================================================================
// isLikelyFollowUp
// ============================================================================

describe('isLikelyFollowUp', () => {
  const orch = createTestOrchestrator();

  it('detects short queries as follow-ups', () => {
    expect(orch.isLikelyFollowUp('fix it')).toBe(true);
    expect(orch.isLikelyFollowUp('show me')).toBe(true);
    expect(orch.isLikelyFollowUp('okay how do I fix it')).toBe(true);
    expect(orch.isLikelyFollowUp('what about the error')).toBe(true);
  });

  it('detects pronoun-heavy queries as follow-ups', () => {
    expect(orch.isLikelyFollowUp('can you show me how to implement that change in the codebase')).toBe(true);
    expect(orch.isLikelyFollowUp('how do I apply the fix you proposed for the scrolling issue')).toBe(true);
  });

  it('detects references to prior discussion', () => {
    expect(orch.isLikelyFollowUp('you mentioned a solution earlier for the authentication problem')).toBe(true);
    expect(orch.isLikelyFollowUp('can you expand on what you said about the middleware configuration')).toBe(true);
  });

  it('does not flag standalone questions without references', () => {
    expect(orch.isLikelyFollowUp('How does the retrieval strategy system work in this codebase and what are the main components involved')).toBe(false);
    expect(orch.isLikelyFollowUp('Explain the database connection pooling architecture and configuration options available')).toBe(false);
  });

  it('handles edge cases', () => {
    expect(orch.isLikelyFollowUp('')).toBe(true); // empty = very short
    expect(orch.isLikelyFollowUp('  ')).toBe(true); // whitespace only
    expect(orch.isLikelyFollowUp('yes')).toBe(true); // single word
  });
});

// ============================================================================
// parseNativeEvaluation (via parseNativeEvaluation)
// ============================================================================

describe('parseNativeEvaluation', () => {
  const orch = createTestOrchestrator();

  it('extracts follow-ups from nested followUpCalls parameter', () => {
    const response = {
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'report_evaluation',
          arguments: {
            sufficient: false,
            relevantIndices: [0, 1],
            strippedIndices: [],
            followUpCalls: [
              { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 10, endLine: 50 } },
              { name: 'find_symbol', arguments: { query: 'handleClick' } },
            ],
          },
        },
      ],
    };
    const result: ContextEvaluation = orch.parseNativeEvaluation(response, 2);
    expect(result).not.toBeNull();
    expect(result!.sufficient).toBe(false);
    expect(result!.newToolCalls).toHaveLength(2);
    expect(result!.newToolCalls[0].name).toBe('read_lines');
    expect(result!.newToolCalls[1].name).toBe('find_symbol');
  });

  it('extracts follow-ups from parallel tool calls', () => {
    const response = {
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'report_evaluation',
          arguments: { sufficient: false, relevantIndices: [0], strippedIndices: [] },
        },
        {
          id: 'call_2',
          name: 'read_lines',
          arguments: { filePath: 'b.ts', startLine: 1, endLine: 20 },
        },
      ],
    };
    const result = orch.parseNativeEvaluation(response, 1);
    expect(result).not.toBeNull();
    expect(result!.newToolCalls).toHaveLength(1);
    expect(result!.newToolCalls[0].name).toBe('read_lines');
  });

  it('merges and deduplicates follow-ups from both sources', () => {
    const response = {
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'report_evaluation',
          arguments: {
            sufficient: false,
            relevantIndices: [0],
            strippedIndices: [],
            followUpCalls: [
              { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 10, endLine: 50 } },
              { name: 'find_symbol', arguments: { query: 'handleScroll' } },
            ],
          },
        },
        {
          id: 'call_2',
          name: 'read_lines',
          arguments: { filePath: 'a.ts', startLine: 10, endLine: 50 },
        },
        {
          id: 'call_3',
          name: 'semantic_search',
          arguments: { query: 'scroll behavior' },
        },
      ],
    };
    const result = orch.parseNativeEvaluation(response, 1);
    expect(result).not.toBeNull();
    // read_lines(a.ts:10-50) appears in both sources but should be deduped
    expect(result!.newToolCalls).toHaveLength(3);
    const readCalls = result!.newToolCalls.filter((c: ToolCallSpec) => c.name === 'read_lines');
    expect(readCalls).toHaveLength(1);
  });

  it('handles malformed nested followUpCalls gracefully', () => {
    const response = {
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'report_evaluation',
          arguments: {
            sufficient: false,
            relevantIndices: [0],
            strippedIndices: [],
            followUpCalls: [
              { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
              { name: '', arguments: {} }, // empty name
              null, // null entry
              'not an object', // string instead of object
              { arguments: { query: 'test' } }, // missing name
              { name: 'find_symbol' }, // missing arguments (should still work)
            ],
          },
        },
      ],
    };
    const result = orch.parseNativeEvaluation(response, 1);
    expect(result).not.toBeNull();
    // Only read_lines and find_symbol should survive (find_symbol has name but no arguments -> gets empty {})
    expect(result!.newToolCalls).toHaveLength(2);
    expect(result!.newToolCalls[0].name).toBe('read_lines');
    expect(result!.newToolCalls[1].name).toBe('find_symbol');
  });

  it('handles followUpCalls as non-array gracefully', () => {
    const response = {
      content: '',
      toolCalls: [
        {
          id: 'call_1',
          name: 'report_evaluation',
          arguments: {
            sufficient: true,
            relevantIndices: [0, 1],
            strippedIndices: [],
            followUpCalls: 'not an array',
          },
        },
      ],
    };
    const result = orch.parseNativeEvaluation(response, 2);
    expect(result).not.toBeNull();
    expect(result!.sufficient).toBe(true);
    expect(result!.newToolCalls).toHaveLength(0);
  });

  it('returns null when no tool calls at all', () => {
    const response = { content: 'just text', toolCalls: [] };
    const result = orch.parseNativeEvaluation(response, 0);
    expect(result).toBeNull();
  });

  it('handles model calling only action tools without report_evaluation', () => {
    const response = {
      content: '',
      toolCalls: [
        { id: 'call_1', name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
        { id: 'call_2', name: 'find_symbol', arguments: { query: 'foo' } },
      ],
    };
    const result = orch.parseNativeEvaluation(response, 3);
    expect(result).not.toBeNull();
    expect(result!.sufficient).toBe(false);
    expect(result!.relevantIndices).toHaveLength(3); // preserves accumulated
    expect(result!.newToolCalls).toHaveLength(2);
  });
});

// ============================================================================
// parseNestedFollowUps
// ============================================================================

describe('parseNestedFollowUps', () => {
  const orch = createTestOrchestrator();

  it('parses valid follow-up calls', () => {
    const raw = [
      { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
      { name: 'find_symbol', arguments: { query: 'foo' } },
    ];
    const result = orch.parseNestedFollowUps(raw);
    expect(result).toHaveLength(2);
  });

  it('handles arguments as JSON string', () => {
    const raw = [
      { name: 'read_lines', arguments: '{"filePath": "a.ts", "startLine": 1}' },
    ];
    const result = orch.parseNestedFollowUps(raw);
    expect(result).toHaveLength(1);
    expect(result[0].arguments).toEqual({ filePath: 'a.ts', startLine: 1 });
  });

  it('returns empty array for non-array input', () => {
    expect(orch.parseNestedFollowUps(undefined)).toHaveLength(0);
    expect(orch.parseNestedFollowUps(null)).toHaveLength(0);
    expect(orch.parseNestedFollowUps('string')).toHaveLength(0);
    expect(orch.parseNestedFollowUps(42)).toHaveLength(0);
  });

  it('skips entries with missing or empty name', () => {
    const raw = [
      { name: '', arguments: {} },
      { arguments: { query: 'test' } },
      { name: 'valid', arguments: {} },
    ];
    const result = orch.parseNestedFollowUps(raw);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('valid');
  });

  it('skips non-object entries', () => {
    const raw = [null, 'string', 42, { name: 'valid', arguments: {} }];
    const result = orch.parseNestedFollowUps(raw);
    expect(result).toHaveLength(1);
  });
});

// ============================================================================
// deduplicateFollowUps
// ============================================================================

describe('deduplicateFollowUps', () => {
  const orch = createTestOrchestrator();

  it('removes exact duplicates', () => {
    const calls: ToolCallSpec[] = [
      { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
      { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
    ];
    expect(orch.deduplicateFollowUps(calls)).toHaveLength(1);
  });

  it('keeps calls with different arguments', () => {
    const calls: ToolCallSpec[] = [
      { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 1, endLine: 10 } },
      { name: 'read_lines', arguments: { filePath: 'a.ts', startLine: 20, endLine: 30 } },
    ];
    expect(orch.deduplicateFollowUps(calls)).toHaveLength(2);
  });

  it('keeps calls with different names', () => {
    const calls: ToolCallSpec[] = [
      { name: 'read_lines', arguments: { filePath: 'a.ts' } },
      { name: 'find_symbol', arguments: { filePath: 'a.ts' } },
    ];
    expect(orch.deduplicateFollowUps(calls)).toHaveLength(2);
  });
});
