/**
 * Tool Executor
 *
 * Standalone tool execution engine. Executes tool call specs against
 * the project graph, semantic search engine, and/or filesystem.
 * Pure code, no model calls.
 *
 * Tool sets:
 * - SHARED_TOOLS: always available (semantic_search, read_lines, etc.)
 * - ADVANCED_TOOLS: always available; use graph when present, filesystem fallbacks otherwise
 * - CONVERSATION_TOOLS: available when session has conversation history
 */

import crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';
import { ProjectGraph } from '../brain/projectGraph';
import { SQLiteBrainStore } from '../brain/sqliteStore';
import { SemanticSearchEngine } from '../retrieval/semanticSearch';
import { ToolDefinition, EmbeddingRuntime } from '../models/types';
import { ToolCallSpec, ToolCallResult } from './types';
import { BlockKind, ChatMessage } from '../brain/types';
import { TreeSitterAnalyzer, ExtractedSymbol } from '../analysis/treeSitterAnalyzer';

// ============================================================================
// File Discovery Constants (reused from indexer for fallback tools)
// ============================================================================

const SOURCE_FILE_PATTERNS = [
  '**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx',
  '**/*.py', '**/*.go', '**/*.rs', '**/*.java',
  '**/*.rb', '**/*.c', '**/*.cpp', '**/*.h', '**/*.hpp',
];

const FALLBACK_IGNORE_PATTERNS = [
  '**/node_modules/**', '**/package-lock.json', '**/pnpm-lock.yaml', '**/yarn.lock',
  '**/.git/**', '**/dist/**', '**/build/**', '**/out/**',
  '**/.turbo/**', '**/.next/**', '**/__pycache__/**',
  '**/.venv/**', '**/venv/**', '**/*.pyc', '**/*.egg-info/**',
  '**/vendor/**', '**/target/**', '**/*.class', '**/*.lock',
  '**/*.log', '**/*.min.js', '**/*.min.css',
  '**/coverage/**', '**/tmp/**', '**/.cache/**',
  '**/orchestration/prompts.ts',
];

// ============================================================================
// Tool Definitions
// ============================================================================

/** Shared tools -- always available */
export const SHARED_TOOLS: ToolDefinition[] = [
  {
    name: 'semantic_search',
    description:
      'Search the codebase by meaning using natural language. Returns file paths, line ranges, code snippets, and similarity scores. Use this FIRST to find entry points. topK guidance: 4-6 for focused queries, 6-8 for broader questions, 8-12 for surveys.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Natural language search query (e.g., "authentication handler", "scroll behavior in verbose log")',
        },
        topK: {
          type: 'number',
          description:
            'Number of results to return (default 8). Use 4-6 for focused, 6-8 for broader, 8-12 for surveys.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_file_outline',
    description:
      'See a file\'s structure without reading full content. Returns symbols (functions, classes, interfaces, types) with their kind, name, and line range. Low token cost. Use this to understand file structure before drilling into specific sections with read_lines.',
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
    name: 'read_lines',
    description:
      'Read specific line range from a file. Primary drill-down tool after finding entry points with semantic_search. Use line ranges from search results directly. Prefer this over read_file when you know the location.',
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
    name: 'read_file',
    description:
      'Read full file content. Use for small files or when full context is necessary. For large files, prefer read_file_outline first, then read_lines for specific sections.',
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
    name: 'list_files',
    description: 'List files in a directory.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path to list (relative to project root)',
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

/** Advanced tools -- always exposed; use graph when available, filesystem fallbacks otherwise */
export const ADVANCED_TOOLS: ToolDefinition[] = [
  {
    name: 'find_symbol',
    description:
      'Find symbols by name pattern. Searches symbol names with pattern matching (partial match) and also searches code content via full-text search. Use when you know a specific symbol name or keyword to look up.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Symbol name or code keyword to search for (e.g., "toggleLogExpand", "scrollIntoView")',
        },
        kinds: {
          type: 'string',
          description:
            'Comma-separated symbol kinds to filter: function, class, interface, type, variable, method, property',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_symbol_detail',
    description:
      'Get the full code and context for a specific symbol by its ID. Use after find_symbol to get implementation details.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'The symbol ID (from find_symbol results)',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_references',
    description:
      'Find what calls/references/imports/extends/tests a given symbol. Navigate the code graph to understand usage.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'The symbol ID to find references for',
        },
        relationKind: {
          type: 'string',
          description:
            'Filter by relation type: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, TESTS. Default: all kinds.',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_dependencies',
    description:
      'Find what a symbol calls/references/imports/extends. Navigate the code graph to understand what a symbol depends on.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'The symbol ID to find dependencies for',
        },
        relationKind: {
          type: 'string',
          description:
            'Filter by relation type: CALLS, IMPORTS, EXTENDS, IMPLEMENTS, TESTS. Default: all kinds.',
        },
      },
      required: ['symbolId'],
    },
  },
];

/** Conversation tools (available when session has conversation history) */
export const CONVERSATION_TOOLS: ToolDefinition[] = [
  {
    name: 'search_conversation',
    description:
      'Semantic search over conversation history. Returns matching exchanges with preview. Use to find relevant prior discussion when user asks a follow-up (e.g., "what fix did you propose?", "the delay you mentioned").',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'Search query -- what you want to find in the conversation (e.g., "proposed fix for scroll", "delay value")',
        },
        maxResults: {
          type: 'number',
          description: 'Maximum results to return (default 5)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_conversation',
    description:
      'Read a range of conversation exchanges by index. Like read_lines for conversations. Use after search_conversation to get full exchange content.',
    parameters: {
      type: 'object',
      properties: {
        startExchange: {
          type: 'number',
          description: 'Start exchange index (0-based)',
        },
        endExchange: {
          type: 'number',
          description: 'End exchange index (0-based, inclusive)',
        },
      },
      required: ['startExchange', 'endExchange'],
    },
  },
  {
    name: 'get_full_conversation',
    description:
      'Get the entire conversation history (all exchanges). Higher token cost -- prefer search_conversation + read_conversation when you only need specific parts.',
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
  private conversationHistory: ChatMessage[];
  private projectRoot: string;
  private treeSitterAnalyzer: TreeSitterAnalyzer | null = null;
  private embeddingRuntime: EmbeddingRuntime | null;
  private sqliteStore: SQLiteBrainStore | null;
  private sessionId: string | null;

  constructor(
    graph: ProjectGraph | null,
    searchEngine: SemanticSearchEngine | null,
    projectRoot: string,
    conversationHistory?: ChatMessage[],
    embeddingRuntime?: EmbeddingRuntime | null,
    sqliteStore?: SQLiteBrainStore | null,
    sessionId?: string | null
  ) {
    this.graph = graph;
    this.searchEngine = searchEngine;
    this.projectRoot = projectRoot;
    this.conversationHistory = conversationHistory ?? [];
    this.embeddingRuntime = embeddingRuntime ?? null;
    this.sqliteStore = sqliteStore ?? null;
    this.sessionId = sessionId ?? null;
  }

  /**
   * Whether conversation history is available (has at least one assistant message)
   */
  hasConversationHistory(): boolean {
    return (
      this.conversationHistory.length > 0 &&
      this.conversationHistory.some((m) => m.role === 'assistant')
    );
  }

  /**
   * Get available tools. All tools (shared + advanced) are always exposed.
   * Advanced tools use graph when available, filesystem fallbacks otherwise.
   * Conversation tools are appended when session has conversation history.
   */
  getAvailableTools(hasEmbeddings: boolean): ToolDefinition[] {
    let tools = [...SHARED_TOOLS, ...ADVANCED_TOOLS];

    if (!hasEmbeddings) {
      tools = tools.filter((t) => t.name !== 'semantic_search');
    }

    if (this.hasConversationHistory()) {
      tools = [...tools, ...CONVERSATION_TOOLS];
    }

    return tools;
  }

  /**
   * Execute a batch of tool calls in parallel. Returns results.
   * Pure code -- no model involved.
   */
  async executeBatch(
    calls: ToolCallSpec[],
    previousCalls?: Map<string, ToolCallResult>
  ): Promise<ToolCallResult[]> {
    const promises = calls.map(async (spec): Promise<ToolCallResult | null> => {
      const callKey = this.generateCallKey(spec);

      // Skip duplicates entirely -- don't re-execute, don't add duplicate results.
      // The model is told not to repeat calls; if it disobeys, we just ignore them.
      if (previousCalls?.has(callKey)) {
        return null;
      }

      // Execute the tool
      const result = await this.executeSingle(spec);
      return {
        spec,
        success: result.success,
        data: result.data,
        error: result.error,
        callKey,
      };
    });

    const results = await Promise.all(promises);
    return results.filter((r): r is ToolCallResult => r !== null);
  }

  /**
   * Execute a single tool call
   */
  private async executeSingle(
    spec: ToolCallSpec
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    try {
      switch (spec.name) {
        // Shared tools
        case 'semantic_search':
          return this.handleSemanticSearch(spec.arguments);
        case 'read_file_outline':
          return this.handleReadFileOutline(spec.arguments);
        case 'read_lines':
          return this.handleReadLines(spec.arguments);
        case 'read_file':
          return this.handleReadFile(spec.arguments);
        case 'list_files':
          return this.handleListFiles(spec.arguments);
        case 'done':
          return { success: true, data: 'done' };

        // Advanced tools (graph or fallback)
        case 'find_symbol':
          return this.handleFindSymbol(spec.arguments);
        case 'get_symbol_detail':
          return this.handleGetSymbolDetail(spec.arguments);
        case 'get_references':
          return this.handleGetReferences(spec.arguments);
        case 'get_dependencies':
          return this.handleGetDependencies(spec.arguments);

        // Conversation tools
        case 'search_conversation':
          return this.handleSearchConversation(spec.arguments);
        case 'read_conversation':
          return this.handleReadConversation(spec.arguments);
        case 'get_full_conversation':
          return this.handleGetFullConversation();

        // Legacy tool names (backwards compat during transition)
        case 'search':
          return this.handleFindSymbol(spec.arguments);
        case 'get_symbol_context':
          return this.handleGetSymbolDetail(spec.arguments);
        case 'get_callers':
          return this.handleGetReferences(spec.arguments);
        case 'get_callees':
          return this.handleGetDependencies(spec.arguments);
        case 'get_file_content':
          return this.handleReadFile(spec.arguments);
        case 'get_file_chunk':
          return this.handleReadLines(spec.arguments);
        case 'get_conversation_history':
          return this.handleGetFullConversation();

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
  // Shared Tool Handlers
  // =========================================================================

  private async handleSemanticSearch(
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    if (!this.searchEngine) {
      return {
        success: false,
        error: 'Semantic search not available (no embeddings)',
      };
    }

    const query = args.query as string;
    const topK = (args.topK as number) ?? 8;

    const results = await this.searchEngine.search(query, { topK });

    if (results.length === 0) {
      return { success: true, data: 'No results found.' };
    }

    // Deduplicate overlapping results from the same file
    const deduped = this.deduplicateSearchResults(results);

    // Drop noise tail: relative cutoff + gap detection
    const filtered = this.applyAdaptiveThreshold(deduped);

    const formatted = filtered
      .map((r) => {
        const preview =
          r.content.length > 500
            ? r.content.slice(0, 500) + '...'
            : r.content;
        return `- ${r.filePath}:${r.startLine}-${r.endLine} (score: ${r.score.toFixed(3)})\n${preview}`;
      })
      .join('\n\n');

    return { success: true, data: formatted };
  }

  private async handleReadFileOutline(
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const filePath = args.filePath as string;

    // Graph mode: use graph.getSymbolsForFile()
    if (this.graph) {
      const files = this.graph.findFiles();
      const file = files.find(
        (f) => f.path === filePath || f.path.endsWith(filePath)
      );

      if (file) {
        const symbols = this.graph.getSymbolsForFile(file.id);
        if (symbols.length > 0) {
          const outline = symbols
            .map(
              (s) => `  ${s.kind} ${s.name} :${s.startLine}-${s.endLine}`
            )
            .join('\n');
          return {
            success: true,
            data: `File: ${file.path}\nOutline (${symbols.length} symbols):\n${outline}`,
          };
        }
      }
    }

    // No-graph / fallback: use Tree-sitter
    const absPath = this.resolveFilePath(filePath);
    if (!absPath || !fs.existsSync(absPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    try {
      const content = fs.readFileSync(absPath, 'utf8');
      const language = this.detectLanguage(filePath);

      if (language) {
        const analyzer = await this.getTreeSitterAnalyzer();
        if (analyzer) {
          const result = await analyzer.analyze(content, language, filePath);
          if (result.symbols.length > 0) {
            const outline = result.symbols
              .map(
                (s: ExtractedSymbol) =>
                  `  ${s.kind} ${s.name} :${s.startLine}-${s.endLine}`
              )
              .join('\n');
            return {
              success: true,
              data: `File: ${filePath}\nOutline (${result.symbols.length} symbols):\n${outline}`,
            };
          }
        }
      }

      // Final fallback: show basic file info
      const lines = content.split('\n');
      return {
        success: true,
        data: `File: ${filePath} (${lines.length} lines)\nNo symbols extracted. Use read_lines to view specific sections.`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private handleReadLines(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    const filePath = args.filePath as string;
    const startLine = (args.startLine as number) ?? 1;
    const endLine = args.endLine as number;

    const absPath = this.resolveFilePath(filePath);
    if (!absPath || !fs.existsSync(absPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    try {
      const content = fs.readFileSync(absPath, 'utf8');
      const allLines = content.split('\n');
      const start = Math.max(1, startLine);
      const end = Math.min(allLines.length, endLine ?? allLines.length);

      const selectedLines = allLines.slice(start - 1, end);
      const numbered = selectedLines
        .map((line, i) => `${start + i}| ${line}`)
        .join('\n');

      return {
        success: true,
        data: `${filePath}:${start}-${end}:\n${numbered}`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private handleReadFile(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    const filePath = args.filePath as string;

    // Graph mode: enrich with symbol info
    if (this.graph) {
      const files = this.graph.findFiles();
      const file = files.find(
        (f) => f.path === filePath || f.path.endsWith(filePath)
      );

      if (file) {
        const blocks = this.graph.getBlocksForFile(file.id);
        const symbols = this.graph.getSymbolsForFile(file.id);

        const parts = [`File: ${file.path}`, `Language: ${file.language}`];

        if (symbols.length > 0) {
          const symList = symbols.map(
            (s) =>
              `  ${s.kind} ${s.name} :${s.startLine}-${s.endLine} (ID: ${s.id})`
          );
          parts.push(
            `\nSymbols (${symbols.length}):\n${symList.join('\n')}`
          );
        }

        if (blocks.length > 0) {
          const content = blocks
            .filter((b) => !b.isChunk)
            .map((b) => b.content)
            .join('\n');
          parts.push(`\nContent:\n${content}`);
        }

        return { success: true, data: parts.join('\n') };
      }
    }

    // Filesystem fallback
    const absPath = this.resolveFilePath(filePath);
    if (!absPath || !fs.existsSync(absPath)) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    try {
      const content = fs.readFileSync(absPath, 'utf8');
      return {
        success: true,
        data: `File: ${filePath}\n\n${content}`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Error reading file: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  private handleListFiles(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    const dirPath = args.path as string;

    // Graph mode: use graph.findFiles()
    if (this.graph) {
      const files = this.graph.findFiles();
      const dirFiles = files
        .filter((f) => f.path.startsWith(dirPath))
        .map((f) => f.path)
        .slice(0, 50);

      if (dirFiles.length > 0) {
        return {
          success: true,
          data: `Files in ${dirPath} (${dirFiles.length}):\n${dirFiles.join('\n')}`,
        };
      }
    }

    // Filesystem fallback
    const absDir = this.resolveFilePath(dirPath);
    if (!absDir || !fs.existsSync(absDir)) {
      return { success: true, data: `No files found in ${dirPath}` };
    }

    try {
      const entries = this.listFilesRecursive(absDir, 3);
      const relativeEntries = entries.map((e) =>
        path.relative(this.projectRoot, e)
      );

      if (relativeEntries.length === 0) {
        return { success: true, data: `No files found in ${dirPath}` };
      }

      return {
        success: true,
        data: `Files in ${dirPath} (${relativeEntries.length}):\n${relativeEntries.slice(0, 50).join('\n')}`,
      };
    } catch (err) {
      return {
        success: false,
        error: `Error listing directory: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // =========================================================================
  // Advanced Tool Handlers (graph when available, filesystem fallback otherwise)
  // =========================================================================

  private async handleFindSymbol(
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const query = args.query as string;
    const kindsStr = args.kinds as string | undefined;
    const kinds = kindsStr
      ?.split(',')
      .map((k) => k.trim())
      .filter(Boolean);

    if (this.graph) {
      return this.handleFindSymbolGraph(query, kinds);
    }
    return this.handleFindSymbolFallback(query, kinds);
  }

  private handleFindSymbolGraph(
    query: string,
    kinds?: string[]
  ): { success: boolean; data?: string; error?: string } {
    const symbols = this.graph!.findSymbols({ namePattern: query });
    const filteredSymbols = kinds
      ? symbols.filter((s) =>
          kinds.some((k) => s.kind.toLowerCase() === k.toLowerCase())
        )
      : symbols;

    const blocks = this.graph!.searchBlocks(query);
    const parts: string[] = [];

    if (filteredSymbols.length > 0) {
      const symbolList = filteredSymbols.slice(0, 15).map((s) => {
        const file = this.graph!.getFile(s.fileId);
        return `  ${s.kind} ${s.name} @ ${file?.path ?? s.fileId}:${s.startLine}-${s.endLine}${s.signature ? `\n    ${s.signature}` : ''}\n    ID: ${s.id}`;
      });
      parts.push(
        `Symbols matching "${query}" (${filteredSymbols.length}):\n${symbolList.join('\n')}`
      );
    }

    if (blocks.length > 0) {
      const deduped = this.deduplicateBlocks(blocks);
      const blockList = deduped.slice(0, 15).map((b) => {
        const file = this.graph!.getFile(b.fileId);
        const maxPreview = b.content.length <= 1500 ? b.content.length : 800;
        const preview =
          b.content.length > maxPreview
            ? b.content.slice(0, maxPreview) + `... (${b.content.length} chars total)`
            : b.content;
        return `  ${file?.path ?? b.fileId}:${b.startLine}-${b.endLine} [${b.kind}]\n${preview}`;
      });
      parts.push(
        `Content matches (${blocks.length} total, showing ${deduped.slice(0, 15).length} deduplicated):\n${blockList.join('\n')}`
      );
    }

    if (parts.length === 0) {
      return { success: true, data: `No results found for "${query}".` };
    }

    return { success: true, data: parts.join('\n\n') };
  }

  private async handleFindSymbolFallback(
    query: string,
    kinds?: string[]
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const matchingFiles = await this.findProjectFiles(query);
    const capped = matchingFiles.slice(0, 20);

    const analyzer = await this.getTreeSitterAnalyzer();
    const parts: string[] = [];

    interface FoundSymbol {
      name: string;
      kind: string;
      file: string;
      startLine: number;
      endLine: number;
      signature?: string;
    }
    const foundSymbols: FoundSymbol[] = [];

    interface ContentMatch {
      file: string;
      startLine: number;
      endLine: number;
      content: string;
    }
    const contentMatches: ContentMatch[] = [];

    const queryLower = query.toLowerCase();

    for (const filePath of capped) {
      const relPath = path.relative(this.projectRoot, filePath);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      if (analyzer) {
        const ext = path.extname(filePath).slice(1);
        const langMap: Record<string, string> = {
          ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
          py: 'python', go: 'go', rs: 'rust', java: 'java',
          rb: 'ruby', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
        };
        const lang = langMap[ext];
        if (lang) {
          try {
            const result = await analyzer.analyze(content, lang, relPath);
            for (const sym of result.symbols) {
              if (sym.name.toLowerCase().includes(queryLower)) {
                if (kinds && !kinds.some((k) => sym.kind.toLowerCase() === k.toLowerCase())) {
                  continue;
                }
                foundSymbols.push({
                  name: sym.name,
                  kind: sym.kind,
                  file: relPath,
                  startLine: sym.startLine,
                  endLine: sym.endLine,
                  signature: sym.signature,
                });
              }
            }
          } catch {
            // tree-sitter parse failure, fall through to content match
          }
        }
      }

      // Content matching: find lines containing the query
      if (foundSymbols.filter((s) => s.file === relPath).length === 0) {
        const lines = content.split('\n');
        const matchLineNums: number[] = [];
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].toLowerCase().includes(queryLower)) {
            matchLineNums.push(i);
          }
        }

        // Merge nearby matches into ranges with context
        const ranges: Array<{ start: number; end: number }> = [];
        for (const lineNum of matchLineNums) {
          const start = Math.max(0, lineNum - 3);
          const end = Math.min(lines.length - 1, lineNum + 3);
          if (ranges.length > 0 && start <= ranges[ranges.length - 1].end + 1) {
            ranges[ranges.length - 1].end = end;
          } else {
            ranges.push({ start, end });
          }
        }

        for (const range of ranges.slice(0, 3)) {
          const snippet = lines.slice(range.start, range.end + 1).join('\n');
          contentMatches.push({
            file: relPath,
            startLine: range.start + 1,
            endLine: range.end + 1,
            content: snippet,
          });
        }
      }
    }

    if (foundSymbols.length > 0) {
      const symbolList = foundSymbols.slice(0, 15).map((s) => {
        const syntheticId = `fs:${s.file}:${s.startLine}:${s.endLine}`;
        return `  ${s.kind} ${s.name} @ ${s.file}:${s.startLine}-${s.endLine}${s.signature ? `\n    ${s.signature}` : ''}\n    ID: ${syntheticId}`;
      });
      parts.push(
        `Symbols matching "${query}" (${foundSymbols.length}):\n${symbolList.join('\n')}`
      );
    }

    if (contentMatches.length > 0) {
      const dedupedContent = this.deduplicateContentMatches(contentMatches);
      const blockList = dedupedContent.slice(0, 15).map((m) => {
        const maxPreview = m.content.length <= 1500 ? m.content.length : 800;
        const preview =
          m.content.length > maxPreview
            ? m.content.slice(0, maxPreview) + `... (${m.content.length} chars total)`
            : m.content;
        return `  ${m.file}:${m.startLine}-${m.endLine} [code]\n${preview}`;
      });
      parts.push(
        `Content matches (${contentMatches.length} total, showing ${dedupedContent.slice(0, 15).length} deduplicated):\n${blockList.join('\n')}`
      );
    }

    if (parts.length === 0) {
      return { success: true, data: `No results found for "${query}".` };
    }

    return { success: true, data: parts.join('\n\n') };
  }

  private async handleGetSymbolDetail(
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const symbolId = args.symbolId as string;

    if (this.graph) {
      return this.handleGetSymbolDetailGraph(symbolId);
    }
    return this.handleGetSymbolDetailFallback(symbolId);
  }

  private handleGetSymbolDetailGraph(
    symbolId: string
  ): { success: boolean; data?: string; error?: string } {
    const symbol = this.graph!.getSymbol(symbolId);

    if (!symbol) {
      return { success: false, error: `Symbol not found: ${symbolId}` };
    }

    const file = this.graph!.getFile(symbol.fileId);
    const blocks = this.graph!.getBlocksForSymbol(symbolId);
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

  private async handleGetSymbolDetailFallback(
    symbolId: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    // Parse synthetic ID: fs:relativePath:startLine:endLine
    if (!symbolId.startsWith('fs:')) {
      return {
        success: false,
        error: `Symbol ID "${symbolId}" looks like a graph ID but no project graph is available. Use find_symbol first to get a valid ID.`,
      };
    }

    const parts = symbolId.split(':');
    if (parts.length < 4) {
      return { success: false, error: `Invalid synthetic symbol ID: ${symbolId}` };
    }

    const relPath = parts.slice(1, -2).join(':');
    const startLine = parseInt(parts[parts.length - 2], 10);
    const endLine = parseInt(parts[parts.length - 1], 10);

    if (isNaN(startLine) || isNaN(endLine)) {
      return { success: false, error: `Invalid line numbers in symbol ID: ${symbolId}` };
    }

    const absPath = path.resolve(this.projectRoot, relPath);
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      return { success: false, error: `File not found: ${relPath}` };
    }

    const lines = content.split('\n');
    const start = Math.max(0, startLine - 1);
    const end = Math.min(lines.length, endLine);

    // Try tree-sitter for richer symbol info
    const analyzer = await this.getTreeSitterAnalyzer();
    if (analyzer) {
      const ext = path.extname(absPath).slice(1);
      const langMap: Record<string, string> = {
        ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
        py: 'python', go: 'go', rs: 'rust', java: 'java',
        rb: 'ruby', c: 'c', cpp: 'cpp', h: 'c', hpp: 'cpp',
      };
      const lang = langMap[ext];
      if (lang) {
        try {
          const result = await analyzer.analyze(content, lang, relPath);
          const sym = result.symbols.find(
            (s) => s.startLine >= startLine && s.startLine <= endLine
          );
          if (sym) {
            const symEnd = Math.min(lines.length, sym.endLine);
            const code = lines.slice(Math.max(0, sym.startLine - 1), symEnd).join('\n');
            const output = [
              `Symbol: ${sym.kind} ${sym.name}`,
              `File: ${relPath}:${sym.startLine}-${sym.endLine}`,
            ];
            if (sym.signature) output.push(`Signature: ${sym.signature}`);
            if (sym.docComment) output.push(`Doc: ${sym.docComment}`);
            if (code) output.push(`\nCode:\n${code}`);
            return { success: true, data: output.join('\n') };
          }
        } catch {
          // fall through to raw line extraction
        }
      }
    }

    const code = lines.slice(start, end).join('\n');
    const output = [
      `Symbol: unknown`,
      `File: ${relPath}:${startLine}-${endLine}`,
      `\nCode:\n${code}`,
    ];
    return { success: true, data: output.join('\n') };
  }

  private async handleGetReferences(
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const symbolId = args.symbolId as string;
    const relationKind = args.relationKind as string | undefined;

    if (this.graph) {
      return this.handleGetReferencesGraph(symbolId, relationKind);
    }
    return this.handleGetReferencesFallback(symbolId);
  }

  private handleGetReferencesGraph(
    symbolId: string,
    relationKind?: string
  ): { success: boolean; data?: string; error?: string } {
    let incomingRelations = this.graph!.getIncomingRelations(symbolId);

    if (relationKind) {
      incomingRelations = incomingRelations.filter(
        (rel) => rel.kind.toUpperCase() === relationKind.toUpperCase()
      );
    }

    if (incomingRelations.length === 0) {
      const kindNote = relationKind ? ` (kind: ${relationKind})` : '';
      return {
        success: true,
        data: `No references found${kindNote}.`,
      };
    }

    const refs = incomingRelations.slice(0, 15).map((rel) => {
      const source = this.graph!.getSymbol(rel.sourceSymbolId);
      if (!source) return `  Unknown (${rel.sourceSymbolId}) [${rel.kind}]`;
      const file = this.graph!.getFile(source.fileId);
      return `  ${source.kind} ${source.name} @ ${file?.path ?? source.fileId}:${source.startLine} [${rel.kind}]\n    ID: ${source.id}`;
    });

    return {
      success: true,
      data: `References (${incomingRelations.length}):\n${refs.join('\n')}`,
    };
  }

  private async handleGetReferencesFallback(
    symbolId: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    // Extract symbol name from synthetic ID or use as raw name
    let symbolName: string;
    if (symbolId.startsWith('fs:')) {
      const parts = symbolId.split(':');
      const relPath = parts.slice(1, -2).join(':');
      const startLine = parseInt(parts[parts.length - 2], 10);
      const absPath = path.resolve(this.projectRoot, relPath);

      // Try to extract the symbol name from the file at the given line
      try {
        const content = fs.readFileSync(absPath, 'utf8');
        const lines = content.split('\n');
        const line = lines[Math.max(0, startLine - 1)] || '';
        // Handle `export function X`, `export class X`, `export default X`, etc.
        const match = line.match(
          /(?:export\s+(?:default\s+)?)?(?:function|class|interface|type|const|let|var|def|fn|func)\s+(\w+)/
        );
        symbolName = match ? match[1] : line.trim().split(/[\s(:{<]/)[0];
      } catch {
        return { success: false, error: `Cannot read file for symbol: ${symbolId}` };
      }
    } else {
      symbolName = symbolId;
    }

    if (!symbolName || symbolName.length < 2) {
      return { success: true, data: 'No references found.' };
    }

    const matchingFiles = await this.findProjectFiles(symbolName);

    interface RefMatch {
      file: string;
      line: number;
      context: string;
    }
    const refs: RefMatch[] = [];

    for (const filePath of matchingFiles.slice(0, 30)) {
      const relPath = path.relative(this.projectRoot, filePath);
      let content: string;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(symbolName)) {
          const ctxStart = Math.max(0, i - 1);
          const ctxEnd = Math.min(lines.length - 1, i + 1);
          const context = lines.slice(ctxStart, ctxEnd + 1).join('\n');
          refs.push({ file: relPath, line: i + 1, context });
          if (refs.length >= 15) break;
        }
      }
      if (refs.length >= 15) break;
    }

    if (refs.length === 0) {
      return { success: true, data: 'No references found.' };
    }

    const refList = refs.map(
      (r) => `  ${r.file}:${r.line} [MENTION]\n    ${r.context.split('\n').join('\n    ')}`
    );

    return {
      success: true,
      data: `References (${refs.length}):\n${refList.join('\n')}`,
    };
  }

  private async handleGetDependencies(
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const symbolId = args.symbolId as string;
    const relationKind = args.relationKind as string | undefined;

    if (this.graph) {
      return this.handleGetDependenciesGraph(symbolId, relationKind);
    }
    return this.handleGetDependenciesFallback(symbolId);
  }

  private handleGetDependenciesGraph(
    symbolId: string,
    relationKind?: string
  ): { success: boolean; data?: string; error?: string } {
    let outgoingRelations = this.graph!.getOutgoingRelations(symbolId);

    if (relationKind) {
      outgoingRelations = outgoingRelations.filter(
        (rel) => rel.kind.toUpperCase() === relationKind.toUpperCase()
      );
    }

    if (outgoingRelations.length === 0) {
      const kindNote = relationKind ? ` (kind: ${relationKind})` : '';
      return {
        success: true,
        data: `No dependencies found${kindNote}.`,
      };
    }

    const deps = outgoingRelations.slice(0, 15).map((rel) => {
      const target = this.graph!.getSymbol(rel.targetSymbolId);
      if (!target) return `  Unknown (${rel.targetSymbolId}) [${rel.kind}]`;
      const file = this.graph!.getFile(target.fileId);
      return `  ${target.kind} ${target.name} @ ${file?.path ?? target.fileId}:${target.startLine} [${rel.kind}]\n    ID: ${target.id}`;
    });

    return {
      success: true,
      data: `Dependencies (${outgoingRelations.length}):\n${deps.join('\n')}`,
    };
  }

  private async handleGetDependenciesFallback(
    symbolId: string
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    let filePath: string;
    if (symbolId.startsWith('fs:')) {
      const parts = symbolId.split(':');
      filePath = parts.slice(1, -2).join(':');
    } else {
      return {
        success: false,
        error: `Symbol ID "${symbolId}" looks like a graph ID but no project graph is available. Use find_symbol first to get a valid ID.`,
      };
    }

    const absPath = path.resolve(this.projectRoot, filePath);
    let content: string;
    try {
      content = fs.readFileSync(absPath, 'utf8');
    } catch {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const importLines: string[] = [];
    const lines = content.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (
        trimmed.startsWith('import ') ||
        trimmed.startsWith('from ') ||
        trimmed.includes('require(') ||
        trimmed.startsWith('import(')
      ) {
        importLines.push(trimmed);
      }
    }

    if (importLines.length === 0) {
      return { success: true, data: 'No dependencies found.' };
    }

    const deps = importLines.slice(0, 15).map((line) => `  ${line} [IMPORTS]`);
    const output = `Dependencies (${importLines.length}):\n${deps.join('\n')}\n\nNote: showing file-level imports only. Build project graph (\`aide reindex\`) for function-level call dependencies.`;
    return { success: true, data: output };
  }

  // =========================================================================
  // Conversation Tool Handlers
  // =========================================================================

  private async handleSearchConversation(
    args: Record<string, unknown>
  ): Promise<{ success: boolean; data?: string; error?: string }> {
    const query = args.query as string;
    const maxResults = (args.maxResults as number) ?? 5;
    const history = this.conversationHistory;

    if (history.length === 0) {
      return { success: true, data: 'No conversation history to search.' };
    }

    // Build exchanges for display/fallback
    const exchanges = this.buildExchanges();

    // Semantic search path: embed query + cosine similarity against stored embeddings
    if (this.embeddingRuntime && this.sqliteStore && this.sessionId) {
      try {
        // Embed the query
        const [queryEmbedding] = await this.embeddingRuntime.embed([query]);
        if (!queryEmbedding || queryEmbedding.length === 0) {
          // Fall through to keyword search
          return this.keywordSearchConversation(query, exchanges, maxResults);
        }

        // Get all stored conversation embeddings for this session
        const storedEmbeddings = this.sqliteStore.getConversationEmbeddings(this.sessionId);
        if (storedEmbeddings.length === 0) {
          // No embeddings yet, fall through to keyword search
          return this.keywordSearchConversation(query, exchanges, maxResults);
        }

        // Compute cosine similarity for each stored embedding
        const scored: Array<{
          exchangeIndex: number;
          role: 'user' | 'assistant';
          score: number;
        }> = [];

        for (const stored of storedEmbeddings) {
          const score = this.cosineSimilarity(queryEmbedding, stored.embedding);
          scored.push({
            exchangeIndex: stored.exchangeIndex,
            role: stored.role,
            score,
          });
        }

        // Deduplicate by exchange index: keep the best score per exchange
        const bestPerExchange = new Map<number, { role: 'user' | 'assistant'; score: number }>();
        for (const item of scored) {
          const existing = bestPerExchange.get(item.exchangeIndex);
          if (!existing || item.score > existing.score) {
            bestPerExchange.set(item.exchangeIndex, { role: item.role, score: item.score });
          }
        }

        // Sort by score descending, then recency as tiebreaker
        const sortedMatches = Array.from(bestPerExchange.entries())
          .map(([exchangeIndex, { role, score }]) => ({ exchangeIndex, matchedRole: role, score }))
          .sort((a, b) => {
            const scoreDiff = b.score - a.score;
            if (Math.abs(scoreDiff) > 0.001) return scoreDiff;
            return b.exchangeIndex - a.exchangeIndex; // Recency tiebreaker
          })
          .slice(0, maxResults);

        // Format results with previews from actual exchanges
        const formatted = sortedMatches
          .map((m) => {
            const exchange = exchanges.find((e) => e.index === m.exchangeIndex);
            const matchedContent = exchange
              ? (m.matchedRole === 'user' ? exchange.user : exchange.assistant)
              : '';
            const preview = matchedContent.length > 200
              ? matchedContent.slice(0, 200) + '...'
              : matchedContent;
            return `Exchange ${m.exchangeIndex} (score: ${m.score.toFixed(3)}, matched: ${m.matchedRole}): ${preview}`;
          })
          .join('\n\n');

        return {
          success: true,
          data: `Found ${bestPerExchange.size} relevant exchanges (showing top ${sortedMatches.length}):\n\n${formatted}`,
        };
      } catch (err) {
        // If semantic search fails, fall through to keyword search
        console.warn(`[search_conversation] Semantic search failed, falling back to keyword: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Fallback: keyword search
    return this.keywordSearchConversation(query, exchanges, maxResults);
  }

  /**
   * Cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Keyword-based conversation search (fallback when embeddings are unavailable)
   */
  private keywordSearchConversation(
    query: string,
    exchanges: Array<{ index: number; user: string; assistant: string }>,
    maxResults: number
  ): { success: boolean; data?: string; error?: string } {
    const lowerQuery = query.toLowerCase();
    const matches: Array<{
      exchangeIndex: number;
      score: number;
      preview: string;
    }> = [];

    for (const exchange of exchanges) {
      const userMatch = exchange.user.toLowerCase().includes(lowerQuery);
      const assistantMatch = exchange.assistant
        .toLowerCase()
        .includes(lowerQuery);

      if (userMatch || assistantMatch) {
        const matchedContent = userMatch ? exchange.user : exchange.assistant;
        const matchedRole = userMatch ? 'user' : 'assistant';
        const preview =
          matchedContent.length > 200
            ? matchedContent.slice(0, 200) + '...'
            : matchedContent;

        matches.push({
          exchangeIndex: exchange.index,
          score: 1.0,
          preview: `[${matchedRole}] ${preview}`,
        });
      }
    }

    if (matches.length === 0) {
      return {
        success: true,
        data: `No conversation matches found for "${query}".`,
      };
    }

    // Return most recent matches first
    const topMatches = matches.slice(-maxResults).reverse();
    const formatted = topMatches
      .map(
        (m) =>
          `Exchange ${m.exchangeIndex}: ${m.preview}`
      )
      .join('\n\n');

    return {
      success: true,
      data: `Found ${matches.length} matching exchanges (showing ${topMatches.length}):\n\n${formatted}`,
    };
  }

  private handleReadConversation(
    args: Record<string, unknown>
  ): { success: boolean; data?: string; error?: string } {
    const startExchange = (args.startExchange as number) ?? 0;
    const endExchange = args.endExchange as number;

    const exchanges = this.buildExchanges();

    if (exchanges.length === 0) {
      return { success: true, data: 'No conversation exchanges available.' };
    }

    const start = Math.max(0, startExchange);
    const end = Math.min(
      exchanges.length - 1,
      endExchange ?? exchanges.length - 1
    );

    const selected = exchanges.filter(
      (e) => e.index >= start && e.index <= end
    );

    if (selected.length === 0) {
      return {
        success: true,
        data: `No exchanges found in range ${start}-${end} (${exchanges.length} total exchanges).`,
      };
    }

    const formatted = selected
      .map((e) => {
        let entry = `--- Exchange ${e.index} ---\nUser: ${e.user}`;
        if (e.assistant) {
          entry += `\n\nAssistant: ${e.assistant}`;
        }
        return entry;
      })
      .join('\n\n');

    return {
      success: true,
      data: `Exchanges ${start}-${end}:\n\n${formatted}`,
    };
  }

  private handleGetFullConversation(): {
    success: boolean;
    data?: string;
    error?: string;
  } {
    const exchanges = this.buildExchanges();

    if (exchanges.length === 0) {
      return { success: true, data: 'No conversation history available.' };
    }

    const formatted = exchanges
      .map((e) => {
        let entry = `--- Exchange ${e.index} ---\nUser: ${e.user}`;
        if (e.assistant) {
          entry += `\n\nAssistant: ${e.assistant}`;
        }
        return entry;
      })
      .join('\n\n');

    return {
      success: true,
      data: `Full conversation (${exchanges.length} exchanges):\n\n${formatted}`,
    };
  }

  // =========================================================================
  // Utility Methods
  // =========================================================================

  /**
   * Build exchange pairs from conversation history.
   * Each exchange = one user message + one assistant response.
   */
  private buildExchanges(): Array<{
    index: number;
    user: string;
    assistant: string;
  }> {
    const exchanges: Array<{
      index: number;
      user: string;
      assistant: string;
    }> = [];
    const history = this.conversationHistory;

    let exchangeIndex = 0;
    for (let i = 0; i < history.length; i++) {
      if (history[i].role === 'user') {
        const user = history[i].content;
        let assistant = '';

        // Look for the next assistant message
        if (i + 1 < history.length && history[i + 1].role === 'assistant') {
          assistant = history[i + 1].content;
          i++; // Skip the assistant message in the next iteration
        }

        exchanges.push({ index: exchangeIndex, user, assistant });
        exchangeIndex++;
      }
    }

    return exchanges;
  }

  /**
   * Adaptive thresholding: drop low-score noise from search results.
   * Uses two filters (whichever is more aggressive wins):
   *  1. Relative cutoff: keep results >= topScore * 0.80
   *  2. Gap detection: truncate at the first consecutive gap > 0.05
   * Results must already be sorted by score descending.
   */
  private applyAdaptiveThreshold<
    T extends { score: number },
  >(results: T[]): T[] {
    if (results.length <= 1) return results;

    const topScore = results[0].score;
    const relativeCutoff = topScore * 0.80;

    let relativeEnd = results.length;
    for (let i = 0; i < results.length; i++) {
      if (results[i].score < relativeCutoff) {
        relativeEnd = i;
        break;
      }
    }

    let gapEnd = results.length;
    for (let i = 1; i < results.length; i++) {
      if (results[i - 1].score - results[i].score > 0.05) {
        gapEnd = i;
        break;
      }
    }

    const keepCount = Math.max(1, Math.min(relativeEnd, gapEnd));
    return results.slice(0, keepCount);
  }

  /**
   * Merge overlapping search results from the same file.
   */
  private deduplicateSearchResults(
    results: Array<{
      filePath: string;
      startLine: number;
      endLine: number;
      content: string;
      score: number;
      chunkId: string;
    }>
  ): Array<{
    filePath: string;
    startLine: number;
    endLine: number;
    content: string;
    score: number;
    chunkId: string;
  }> {
    if (results.length <= 1) return results;

    const sorted = [...results].sort((a, b) => {
      const fileCmp = a.filePath.localeCompare(b.filePath);
      if (fileCmp !== 0) return fileCmp;
      return a.startLine - b.startLine;
    });

    const merged: typeof sorted = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const current = sorted[i];
      const last = merged[merged.length - 1];

      if (
        current.filePath === last.filePath &&
        current.startLine <= last.endLine + 1
      ) {
        const newEndLine = Math.max(last.endLine, current.endLine);
        const overlapLines = last.endLine - current.startLine + 1;
        let mergedContent = last.content;
        if (overlapLines >= 0) {
          const currentLines = current.content.split('\n');
          const newLines = currentLines.slice(Math.max(0, overlapLines));
          if (newLines.length > 0) {
            mergedContent = last.content + '\n' + newLines.join('\n');
          }
        }

        merged[merged.length - 1] = {
          ...last,
          endLine: newEndLine,
          content: mergedContent,
          score: Math.max(last.score, current.score),
        };
      } else {
        merged.push(current);
      }
    }

    return merged;
  }

  /**
   * Resolve a relative file path against the project root.
   * Returns absolute path or null if it doesn't exist.
   */
  private resolveFilePath(filePath: string): string | null {
    // Try as-is (might already be absolute)
    if (path.isAbsolute(filePath) && fs.existsSync(filePath)) {
      return filePath;
    }

    // Resolve relative to project root
    const resolved = path.resolve(this.projectRoot, filePath);
    if (fs.existsSync(resolved)) {
      return resolved;
    }

    // Try finding in graph files if path is partial
    if (this.graph) {
      const files = this.graph.findFiles();
      const match = files.find(
        (f) => f.path === filePath || f.path.endsWith(filePath)
      );
      if (match) {
        const fromGraph = path.resolve(this.projectRoot, match.path);
        if (fs.existsSync(fromGraph)) {
          return fromGraph;
        }
      }
    }

    return null;
  }

  /**
   * Detect language from file extension for Tree-sitter
   */
  private detectLanguage(filePath: string): string | null {
    const ext = path.extname(filePath).toLowerCase();
    const mapping: Record<string, string> = {
      '.ts': 'typescript',
      '.tsx': 'tsx',
      '.js': 'javascript',
      '.jsx': 'jsx',
      '.py': 'python',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.rb': 'ruby',
      '.c': 'c',
      '.cpp': 'cpp',
      '.h': 'c',
      '.hpp': 'cpp',
    };
    return mapping[ext] ?? null;
  }

  /**
   * Get or create Tree-sitter analyzer (lazy initialization)
   */
  private async getTreeSitterAnalyzer(): Promise<TreeSitterAnalyzer | null> {
    if (this.treeSitterAnalyzer) {
      return this.treeSitterAnalyzer;
    }

    try {
      const analyzer = new TreeSitterAnalyzer();
      await analyzer.initialize();
      this.treeSitterAnalyzer = analyzer;
      return analyzer;
    } catch {
      // Tree-sitter not available (e.g., WASM files missing)
      return null;
    }
  }

  /**
   * Discover project source files using fast-glob with proper ignore patterns.
   * Optionally filter to files whose content includes a given string.
   */
  private async findProjectFiles(contentFilter?: string): Promise<string[]> {
    const files = await fg(SOURCE_FILE_PATTERNS, {
      cwd: this.projectRoot,
      ignore: FALLBACK_IGNORE_PATTERNS,
      absolute: true,
    });
    if (!contentFilter) return files;
    return files.filter((f) => {
      try {
        const content = fs.readFileSync(f, 'utf8');
        return content.includes(contentFilter);
      } catch {
        return false;
      }
    });
  }

  /**
   * List files recursively up to a max depth
   */
  private listFilesRecursive(dir: string, maxDepth: number): string[] {
    const results: string[] = [];

    const walk = (currentDir: string, depth: number) => {
      if (depth > maxDepth || results.length >= 100) return;

      try {
        const entries = fs.readdirSync(currentDir, { withFileTypes: true });
        for (const entry of entries) {
          // Skip hidden files and common non-code directories
          if (entry.name.startsWith('.') || entry.name === 'node_modules') {
            continue;
          }

          const fullPath = path.join(currentDir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath, depth + 1);
          } else {
            results.push(fullPath);
          }
        }
      } catch {
        // Permission denied or other error, skip
      }
    };

    walk(dir, 0);
    return results;
  }

  /**
   * Deduplicate overlapping blocks from graph search.
   * If a small block is fully contained within a larger block in the same file,
   * drop the larger one because the specific match is more useful.
   */
  private deduplicateBlocks<T extends { fileId: string; startLine: number; endLine: number; content: string }>(
    blocks: T[]
  ): T[] {
    const deduped: T[] = [];
    for (const b of blocks) {
      const dominated = deduped.some(
        (existing) =>
          existing.fileId === b.fileId &&
          existing.startLine >= b.startLine &&
          existing.endLine <= b.endLine &&
          existing.content.length < b.content.length
      );
      if (dominated) continue;

      for (let i = deduped.length - 1; i >= 0; i--) {
        const existing = deduped[i];
        if (
          existing.fileId === b.fileId &&
          b.startLine >= existing.startLine &&
          b.endLine <= existing.endLine &&
          b.content.length < existing.content.length
        ) {
          deduped.splice(i, 1);
        }
      }
      deduped.push(b);
    }
    return deduped;
  }

  /**
   * Deduplicate overlapping content matches from fallback search.
   */
  private deduplicateContentMatches(
    matches: Array<{ file: string; startLine: number; endLine: number; content: string }>
  ): Array<{ file: string; startLine: number; endLine: number; content: string }> {
    const deduped: typeof matches = [];
    for (const m of matches) {
      const dominated = deduped.some(
        (existing) =>
          existing.file === m.file &&
          existing.startLine <= m.startLine &&
          existing.endLine >= m.endLine
      );
      if (dominated) continue;

      for (let i = deduped.length - 1; i >= 0; i--) {
        if (
          deduped[i].file === m.file &&
          m.startLine <= deduped[i].startLine &&
          m.endLine >= deduped[i].endLine
        ) {
          deduped.splice(i, 1);
        }
      }
      deduped.push(m);
    }
    return deduped;
  }

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
