/**
 * Tool Executor
 *
 * Standalone tool execution engine. Executes tool call specs against
 * the project graph and/or semantic search engine. Pure code, no model calls.
 *
 * Refactored from toolBasedRetrieval.ts to be reusable by the orchestrator.
 */

import crypto from 'crypto';
import { ProjectGraph } from '../brain/projectGraph';
import { SemanticSearchEngine } from '../retrieval/semanticSearch';
import { ToolDefinition } from '../models/types';
import { ToolCallSpec, ToolCallResult } from './types';
import { BlockKind, RetrievalQuery, ChatMessage } from '../brain/types';
import { logInfo } from '../core/logger';

// ============================================================================
// Tool Definitions
// ============================================================================

/** Graph tools (when project graph exists) */
export const GRAPH_TOOLS: ToolDefinition[] = [
  {
    name: 'semantic_search',
    description:
      'Search the codebase by meaning using natural language. Returns the most semantically similar code chunks. Use this FIRST to find entry points.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query (e.g., "authentication handler", "database connection")',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search',
    description: 'Search for symbols and content in the project graph by name or content text.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (symbol name, function name, or content text)',
        },
        path: {
          type: 'string',
          description: 'Optional file/directory path prefix to narrow search',
        },
        kinds: {
          type: 'string',
          description: 'Comma-separated symbol kinds to filter: function, class, interface, type, variable, method, property',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_symbol_context',
    description: 'Get the full code and context for a specific symbol by its ID.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'The symbol ID to look up',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_callers',
    description: 'Find all symbols that call/reference the given symbol.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'The symbol ID to find callers for',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_callees',
    description: 'Find all symbols that the given symbol calls/references.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'The symbol ID to find callees for',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_file_content',
    description: 'Get the full content and symbols of a specific file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative file path',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'done',
    description: 'Signal that you have gathered enough context.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

/** Semantic-only tools (when no graph, just embeddings) */
export const SEMANTIC_ONLY_TOOLS: ToolDefinition[] = [
  {
    name: 'semantic_search',
    description:
      'Search the codebase by meaning using natural language. Returns the most semantically similar code chunks.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Natural language search query',
        },
        topK: {
          type: 'number',
          description: 'Number of results to return (default 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_file_content',
    description: 'Read the content of a specific file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative file path',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'get_file_chunk',
    description: 'Read specific lines from a file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Relative file path',
        },
        startLine: {
          type: 'number',
          description: 'Start line number (1-indexed)',
        },
        endLine: {
          type: 'number',
          description: 'End line number (1-indexed)',
        },
      },
      required: ['filePath', 'startLine', 'endLine'],
    },
  },
  {
    name: 'list_files',
    description: 'List files in a directory.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'done',
    description: 'Signal that you have gathered enough context.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
];

// ============================================================================
// ToolExecutor
// ============================================================================

export class ToolExecutor {
  private graph: ProjectGraph | null;
  private searchEngine: SemanticSearchEngine | null;

  constructor(
    graph: ProjectGraph | null,
    searchEngine: SemanticSearchEngine | null
  ) {
    this.graph = graph;
    this.searchEngine = searchEngine;
  }

  /**
   * Get available tools based on what backends exist
   */
  getAvailableTools(hasGraph: boolean, hasEmbeddings: boolean): ToolDefinition[] {
    if (hasGraph && hasEmbeddings) {
      return GRAPH_TOOLS;
    }
    if (hasEmbeddings) {
      return SEMANTIC_ONLY_TOOLS;
    }
    if (hasGraph) {
      // Graph without embeddings: use graph tools but without semantic_search
      return GRAPH_TOOLS.filter((t) => t.name !== 'semantic_search');
    }
    return [];
  }

  /**
   * Execute a batch of tool calls. Returns results keyed by call.
   * Pure code -- no model involved.
   */
  async executeBatch(
    calls: ToolCallSpec[],
    previousCalls?: Map<string, ToolCallResult>
  ): Promise<ToolCallResult[]> {
    const results: ToolCallResult[] = [];

    for (const spec of calls) {
      const callKey = this.generateCallKey(spec);

      // Check for duplicate
      if (previousCalls?.has(callKey)) {
        const cached = previousCalls.get(callKey)!;
        results.push({
          ...cached,
          callKey,
        });
        continue;
      }

      // Execute the tool
      const result = await this.executeSingle(spec);
      results.push({
        spec,
        success: result.success,
        data: result.data,
        error: result.error,
        callKey,
      });
    }

    return results;
  }

  /**
   * Execute a single tool call
   */
  private async executeSingle(
    spec: ToolCallSpec
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      switch (spec.name) {
        case 'semantic_search':
          return this.handleSemanticSearch(spec.arguments);
        case 'search':
          return this.handleSearch(spec.arguments);
        case 'get_symbol_context':
          return this.handleGetSymbolContext(spec.arguments);
        case 'get_callers':
          return this.handleGetCallers(spec.arguments);
        case 'get_callees':
          return this.handleGetCallees(spec.arguments);
        case 'get_file_content':
          return this.handleGetFileContent(spec.arguments);
        case 'get_file_chunk':
          return this.handleGetFileChunk(spec.arguments);
        case 'list_files':
          return this.handleListFiles(spec.arguments);
        case 'done':
          return { success: true, data: 'done' };
        default:
          return { success: false, error: `Unknown tool: ${spec.name}` };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      };
    }
  }

  // =========================================================================
  // Tool Handlers
  // =========================================================================

  private async handleSemanticSearch(
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    if (!this.searchEngine) {
      return { success: false, error: 'Semantic search not available (no embeddings)' };
    }

    const query = args.query as string;
    const topK = (args.topK as number) ?? 10;

    const results = await this.searchEngine.search(query, { topK });

    if (results.length === 0) {
      return { success: true, data: 'No results found.' };
    }

    const formatted = results
      .map((r, i) => {
        const preview = r.content.length > 500 ? r.content.slice(0, 500) + '...' : r.content;
        return `[${i + 1}] ${r.filePath}:${r.startLine}-${r.endLine} (score: ${r.score.toFixed(3)})\n${preview}`;
      })
      .join('\n\n');

    return { success: true, data: formatted };
  }

  private handleSearch(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    if (!this.graph) {
      return { success: false, error: 'Project graph not available' };
    }

    const query = args.query as string;
    const pathPrefix = args.path as string | undefined;
    const kindsStr = args.kinds as string | undefined;
    const kinds = kindsStr?.split(',').map((k) => k.trim()) as BlockKind[] | undefined;

    // Search symbols
    const symbols = this.graph.findSymbols({ name: query });
    const filteredSymbols = pathPrefix
      ? symbols.filter((s) => {
          const file = this.graph!.getFile(s.fileId);
          return file && file.path.startsWith(pathPrefix);
        })
      : symbols;

    // Search content blocks
    const blocks = this.graph.searchBlocks(query, kinds);
    const filteredBlocks = pathPrefix
      ? blocks.filter((b) => {
          const file = this.graph!.getFile(b.fileId);
          return file && file.path.startsWith(pathPrefix);
        })
      : blocks;

    const parts: string[] = [];

    if (filteredSymbols.length > 0) {
      const symbolList = filteredSymbols.slice(0, 10).map((s) => {
        const file = this.graph!.getFile(s.fileId);
        return `  ${s.kind} ${s.name} @ ${file?.path ?? s.fileId}:${s.startLine}${s.signature ? `\n    ${s.signature}` : ''}\n    ID: ${s.id}`;
      });
      parts.push(`Symbols (${filteredSymbols.length}):\n${symbolList.join('\n')}`);
    }

    if (filteredBlocks.length > 0) {
      const blockList = filteredBlocks.slice(0, 5).map((b) => {
        const file = this.graph!.getFile(b.fileId);
        const preview = b.content.length > 300 ? b.content.slice(0, 300) + '...' : b.content;
        return `  ${file?.path ?? b.fileId}:${b.startLine}-${b.endLine}\n${preview}`;
      });
      parts.push(`Content matches (${filteredBlocks.length}):\n${blockList.join('\n')}`);
    }

    if (parts.length === 0) {
      return { success: true, data: `No results found for "${query}".` };
    }

    return { success: true, data: parts.join('\n\n') };
  }

  private handleGetSymbolContext(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    if (!this.graph) {
      return { success: false, error: 'Project graph not available' };
    }

    const symbolId = args.symbolId as string;
    const symbol = this.graph.getSymbol(symbolId);

    if (!symbol) {
      return { success: false, error: `Symbol not found: ${symbolId}` };
    }

    const file = this.graph.getFile(symbol.fileId);
    const blocks = this.graph.getBlocksForSymbol(symbolId);
    const code = blocks.map((b) => b.content).join('\n');

    const parts = [
      `Symbol: ${symbol.kind} ${symbol.name}`,
      `File: ${file?.path ?? symbol.fileId}:${symbol.startLine}-${symbol.endLine}`,
    ];

    if (symbol.signature) parts.push(`Signature: ${symbol.signature}`);
    if (symbol.docComment) parts.push(`Doc: ${symbol.docComment}`);
    if (code) parts.push(`\nCode:\n${code}`);

    return { success: true, data: parts.join('\n') };
  }

  private handleGetCallers(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    if (!this.graph) {
      return { success: false, error: 'Project graph not available' };
    }

    const symbolId = args.symbolId as string;
    const incomingRelations = this.graph.getIncomingRelations(symbolId);

    if (incomingRelations.length === 0) {
      return { success: true, data: 'No callers found.' };
    }

    const callers = incomingRelations.slice(0, 10).map((rel) => {
      const caller = this.graph!.getSymbol(rel.sourceSymbolId);
      if (!caller) return `  Unknown (${rel.sourceSymbolId})`;
      const file = this.graph!.getFile(caller.fileId);
      return `  ${caller.kind} ${caller.name} @ ${file?.path ?? caller.fileId}:${caller.startLine}\n    ID: ${caller.id}`;
    });

    return { success: true, data: `Callers (${incomingRelations.length}):\n${callers.join('\n')}` };
  }

  private handleGetCallees(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    if (!this.graph) {
      return { success: false, error: 'Project graph not available' };
    }

    const symbolId = args.symbolId as string;
    const outgoingRelations = this.graph.getOutgoingRelations(symbolId);

    if (outgoingRelations.length === 0) {
      return { success: true, data: 'No callees found.' };
    }

    const callees = outgoingRelations.slice(0, 10).map((rel) => {
      const callee = this.graph!.getSymbol(rel.targetSymbolId);
      if (!callee) return `  Unknown (${rel.targetSymbolId})`;
      const file = this.graph!.getFile(callee.fileId);
      return `  ${callee.kind} ${callee.name} @ ${file?.path ?? callee.fileId}:${callee.startLine}\n    ID: ${callee.id}`;
    });

    return { success: true, data: `Callees (${outgoingRelations.length}):\n${callees.join('\n')}` };
  }

  private handleGetFileContent(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    if (!this.graph) {
      return { success: false, error: 'Project graph not available' };
    }

    const filePath = args.filePath as string;
    const files = this.graph.findFiles();
    const file = files.find((f) => f.path === filePath || f.path.endsWith(filePath));

    if (!file) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const blocks = this.graph.getBlocksForFile(file.id);
    const symbols = this.graph.getSymbolsForFile(file.id);

    const parts = [`File: ${file.path}`, `Language: ${file.language}`];

    if (symbols.length > 0) {
      const symList = symbols.map(
        (s) => `  ${s.kind} ${s.name} :${s.startLine}-${s.endLine} (ID: ${s.id})`
      );
      parts.push(`\nSymbols (${symbols.length}):\n${symList.join('\n')}`);
    }

    if (blocks.length > 0) {
      const content = blocks
        .filter((b) => !b.isChunk)
        .map((b) => b.content)
        .join('\n');
      if (content.length > 5000) {
        parts.push(`\nContent (truncated):\n${content.slice(0, 5000)}...`);
      } else {
        parts.push(`\nContent:\n${content}`);
      }
    }

    return { success: true, data: parts.join('\n') };
  }

  private handleGetFileChunk(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    if (!this.graph) {
      return { success: false, error: 'Project graph not available' };
    }

    const filePath = args.filePath as string;
    const startLine = args.startLine as number;
    const endLine = args.endLine as number;

    const files = this.graph.findFiles();
    const file = files.find((f) => f.path === filePath || f.path.endsWith(filePath));

    if (!file) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const blocks = this.graph.getBlocksForFile(file.id);
    const relevantBlocks = blocks.filter(
      (b) => b.startLine <= endLine && b.endLine >= startLine
    );

    if (relevantBlocks.length === 0) {
      return { success: true, data: `No content found in ${filePath}:${startLine}-${endLine}` };
    }

    const content = relevantBlocks.map((b) => b.content).join('\n');
    return { success: true, data: `${filePath}:${startLine}-${endLine}:\n${content}` };
  }

  private handleListFiles(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    if (!this.graph) {
      return { success: false, error: 'Project graph not available' };
    }

    const dirPath = args.path as string;
    const files = this.graph.findFiles();

    const dirFiles = files
      .filter((f) => f.path.startsWith(dirPath))
      .map((f) => f.path)
      .slice(0, 30);

    if (dirFiles.length === 0) {
      return { success: true, data: `No files found in ${dirPath}` };
    }

    return { success: true, data: `Files in ${dirPath}:\n${dirFiles.join('\n')}` };
  }

  // =========================================================================
  // Utility
  // =========================================================================

  /**
   * Generate a unique, deterministic key for a tool call (for deduplication)
   */
  private generateCallKey(spec: ToolCallSpec): string {
    const argsHash = crypto
      .createHash('md5')
      .update(JSON.stringify(spec.arguments))
      .digest('hex')
      .slice(0, 8);
    return `${spec.name}:${argsHash}`;
  }
}
