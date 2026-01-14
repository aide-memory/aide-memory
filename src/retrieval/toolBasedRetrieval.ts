/**
 * ToolBasedRetrieval
 *
 * True agentic retrieval strategy where the model decides which tools to call.
 * - Model is given tools to explore the codebase
 * - Model decides what to fetch based on the question
 * - Retrieval loop runs internally; returns standard RetrievalResult
 */

import {
  RetrievalStrategy,
  RetrievalResult,
  RetrievalConfig,
  DEFAULT_RETRIEVAL_CONFIG,
} from './types';
import {
  SymbolRecord,
  ContentBlock,
  FileRecord,
  Relation,
  RetrievalQuery,
  BlockKind,
} from '../brain/types';
import { ProjectGraph } from '../brain/projectGraph';
import { TokenBudgetManager } from '../core/tokenBudget';
import {
  ToolCapableRuntime,
  ToolDefinition,
  ToolCallRequest,
  ChatMessage,
} from '../models/types';
import { verbose as verboseUI } from '../cli/ui';

// ============================================================================
// Tool Definitions (Provider-Agnostic Format)
// ============================================================================

export const RETRIEVAL_TOOLS: ToolDefinition[] = [
  // EXPLORATION TOOLS - understand project structure first
  {
    name: 'list_packages',
    description:
      'List top-level directories in the project. Use this to understand project structure before searching.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'list_files',
    description:
      'List files in a directory. Use after list_packages to explore specific areas.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path, e.g., "web/src" or "src/retrieval"',
        },
      },
      required: ['path'],
    },
  },
  // PRIMARY SEARCH TOOL - combines symbol and content search
  {
    name: 'search',
    description:
      'Search for symbols and code content. Optionally filter by directory.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description:
            'What to search for (class name, function name, or keyword)',
        },
        path: {
          type: 'string',
          description:
            'Optional: limit search to this directory (e.g., "web/src")',
        },
      },
      required: ['query'],
    },
  },
  // Legacy tools - still available for specific use cases
  {
    name: 'search_symbols',
    description:
      'Search for code symbols (functions, classes, methods) by name only. Use "search" instead for general queries.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Symbol name or pattern to search',
        },
        kinds: {
          type: 'array',
          description: 'Symbol kinds to filter (function, class, method, etc.)',
          items: { type: 'string' },
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'search_content',
    description:
      'Full-text search in code content only. Use "search" instead for general queries.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Text to search for',
        },
        kinds: {
          type: 'array',
          description: 'Block kinds to filter (code, comment, docstring, etc.)',
          items: { type: 'string' },
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_callers',
    description: 'Get all symbols that call/use a given symbol.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'ID of the symbol to find callers for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of callers to return (default: 10)',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_callees',
    description: 'Get all symbols called/used by a given symbol.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'ID of the symbol to find callees for',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of callees to return (default: 10)',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_symbol_context',
    description:
      'Get full context for a symbol including its code, comments, and documentation.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'ID of the symbol',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_file_content',
    description: 'Get all symbols and blocks from a specific file.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file (can be partial match)',
        },
      },
      required: ['filePath'],
    },
  },
  {
    name: 'done',
    description:
      'Call this when you have gathered enough context to answer the question. Do NOT call any more tools after this.',
    parameters: {
      type: 'object',
      properties: {
        summary: {
          type: 'string',
          description: 'Brief summary of what you found',
        },
      },
      required: ['summary'],
    },
  },
];

// ============================================================================
// ToolBasedRetrieval
// ============================================================================

const MAX_TOOL_ITERATIONS = 10;

export interface ToolRetrievalOptions {
  /** Log tool calls as they happen */
  verbose?: boolean;
}

export class ToolBasedRetrieval implements RetrievalStrategy {
  private config: RetrievalConfig;
  private budget: TokenBudgetManager;
  private runtime: ToolCapableRuntime;
  private verbose: boolean;

  readonly tools = RETRIEVAL_TOOLS;

  constructor(
    runtime: ToolCapableRuntime,
    config: Partial<RetrievalConfig> = {},
    budget?: TokenBudgetManager,
    options?: ToolRetrievalOptions
  ) {
    this.runtime = runtime;
    this.config = { ...DEFAULT_RETRIEVAL_CONFIG, ...config };
    this.budget = budget || new TokenBudgetManager(this.config.tokenBudget);
    this.verbose = options?.verbose ?? false;
  }

  private log(message: string): void {
    if (this.verbose) {
      verboseUI.info(message);
    }
  }

  private logTool(name: string, args?: Record<string, unknown>): void {
    if (this.verbose) {
      verboseUI.tool(name, args);
    }
  }

  private logToolResult(result: string): void {
    if (this.verbose) {
      verboseUI.toolResult(result);
    }
  }

  private logVerbose(label: string, content: string): void {
    if (this.verbose) {
      // Console output
      console.log(`[tools:verbose] === ${label} ===`);
      console.log(
        content
          .split('\n')
          .map((line) => `  ${line}`)
          .join('\n')
      );
      console.log(`[tools:verbose] ===`);

      // Emit to web UI with full content
      verboseUI.content(`### ${label}\n\n\`\`\`\n${content}\n\`\`\``);
    }
  }

  /**
   * Execute a retrieval with hints (for hybrid strategy)
   * Model can explore beyond the hints.
   *
   * @param mode - 'code' shows full code blocks upfront, 'hints' shows entry points only
   */
  async retrieveWithHints(
    query: RetrievalQuery,
    hints: RetrievalResult,
    graph: ProjectGraph,
    mode: 'code' | 'hints' = 'code'
  ): Promise<RetrievalResult> {
    // Start with hints already in the accumulated results
    // (These will be included in final context since model sees them upfront)
    const accumulated: AccumulatedResults = {
      symbols: [...hints.symbols],
      blocks: [...hints.blocks],
      files: [...hints.files],
      relations: [...hints.relations],
    };

    // Format context based on mode
    let context: string;
    if (mode === 'code') {
      // Full code context - model sees actual code and can explore more if needed
      context = this.formatCodeContextForHybrid(hints);
    } else {
      // Entry points only - model must explore to get actual code
      context = this.formatEntryPointsForModel(hints);
    }

    return this.runAgenticLoop(query, graph, accumulated, 'hybrid', context);
  }

  /**
   * Main retrieval method - runs agentic tool-calling loop
   * Tools-only mode: Model must explore to find code
   */
  async retrieve(
    query: RetrievalQuery,
    graph: ProjectGraph
  ): Promise<RetrievalResult> {
    const accumulated: AccumulatedResults = {
      symbols: [],
      blocks: [],
      files: [],
      relations: [],
    };

    // Tools-only mode: no initial code, model must explore
    return this.runAgenticLoop(query, graph, accumulated, 'tools');
  }

  // ============================================================================
  // Agentic Loop
  // ============================================================================

  private async runAgenticLoop(
    query: RetrievalQuery,
    graph: ProjectGraph,
    accumulated: AccumulatedResults,
    mode: 'tools' | 'hybrid' = 'tools',
    context?: string
  ): Promise<RetrievalResult> {
    const toolCallRecords: ToolCallRecord[] = [];

    // Per-prompt cache to avoid duplicate tool calls
    const callCache = new Map<string, ToolExecutionResult>();
    const makeCallKey = (name: string, args: unknown): string =>
      `${name}:${JSON.stringify(args)}`;

    // Build initial system message based on mode
    const systemPrompt = this.buildSystemPrompt(mode, context);

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: query.question },
    ];

    let iteration = 0;
    let done = false;

    if (this.verbose) {
      verboseUI.header('TOOL-BASED RETRIEVAL');
    }
    this.log('Starting agentic exploration...');

    // Log initial messages sent to model
    this.logVerbose(
      'INITIAL PROMPT TO MODEL',
      `System:\n${systemPrompt}\n\nUser:\n${
        query.question
      }\n\nTools available: ${this.tools.map((t) => t.name).join(', ')}`
    );

    while (!done && iteration < MAX_TOOL_ITERATIONS) {
      iteration++;
      this.log(`Iteration ${iteration}: Asking model for tool calls...`);

      // Ask model what tools to call
      const response = await this.runtime.chatWithTools(messages, this.tools);

      // Log model's response
      if (this.verbose) {
        const toolNames =
          response.toolCalls?.map((t) => t.name).join(', ') || 'none';
        this.log(
          `Model response: content=${
            response.content ? 'yes' : 'no'
          }, tools=${toolNames}`
        );
        if (response.content) {
          this.logVerbose('MODEL THOUGHTS', response.content);
        }
      }

      // If model returns content without tool calls, check if we should nudge it to continue
      if (!response.toolCalls || response.toolCalls.length === 0) {
        // If we haven't found any actual code yet, prompt model to continue
        if (
          accumulated.symbols.length === 0 &&
          accumulated.blocks.length === 0 &&
          iteration < 5
        ) {
          this.log(
            'Model stopped early with no code found - prompting to continue...'
          );

          // Add a nudge message to continue exploration
          messages.push({
            role: 'user',
            content: `You haven't found any actual code yet. Please continue exploring:
- Use get_file_content("path") to read files you found
- Use search("query") to find specific code
- Keep going until you find the implementation code that answers the question.`,
          });

          // Don't finish yet, let the loop continue
          continue;
        }

        this.log('Model returned no tool calls - finishing');
        done = true;
        break;
      }

      this.log(`Model requested ${response.toolCalls.length} tool call(s)`);

      // Process each tool call
      for (const toolCall of response.toolCalls) {
        // Check for 'done' tool
        if (toolCall.name === 'done') {
          this.log('Model called done() - finishing');
          done = true;
          break;
        }

        this.logTool(
          toolCall.name,
          toolCall.arguments as Record<string, unknown>
        );

        // Check cache for duplicate calls
        const callKey = makeCallKey(toolCall.name, toolCall.arguments);
        const cachedResult = callCache.get(callKey);

        let result: ToolExecutionResult;
        let wasCached = false;

        if (cachedResult) {
          // Return cached result with guidance
          this.log(`[CACHED] Already called ${toolCall.name} with same args`);
          result = cachedResult;
          wasCached = true;
        } else {
          // Execute the tool
          result = await this.executeTool(toolCall, graph);
          // Cache the result
          callCache.set(callKey, result);
        }

        // Log result summary
        if (result.success && result.data) {
          const data = result.data;
          const counts = [];
          if (data.symbols?.length)
            counts.push(`${data.symbols.length} symbols`);
          if (data.blocks?.length) counts.push(`${data.blocks.length} blocks`);
          if (data.packages?.length)
            counts.push(`${data.packages.length} packages`);
          if (data.files?.length) counts.push(`${data.files.length} files`);
          if (data.dirFiles?.length)
            counts.push(`${data.dirFiles.length} files`);
          if (counts.length > 0) {
            this.logToolResult(
              `${wasCached ? '[CACHED] ' : ''}Found: ${counts.join(', ')}`
            );
          } else {
            this.logToolResult(`${wasCached ? '[CACHED] ' : ''}No results`);
          }
        } else if (!result.success) {
          this.logToolResult(`Error: ${result.error}`);
        }

        // Record the call
        toolCallRecords.push({
          call: {
            name: toolCall.name,
            arguments: toolCall.arguments,
          },
          result: {
            success: result.success,
            data: result.data,
            error: result.error,
          },
          timestamp: new Date().toISOString(),
        });

        // Merge results into accumulated (even for cached, to ensure consistency)
        if (result.success && result.data && !wasCached) {
          this.mergeResults(accumulated, result.data);
        }

        // Add tool result to messages for model context
        let toolResultContent = this.formatToolResult(toolCall.name, result);

        // Add guidance message for cached results
        if (wasCached) {
          const queryArg = (toolCall.arguments as Record<string, unknown>)
            .query;
          const queryInfo = queryArg ? ` for "${queryArg}"` : '';
          toolResultContent = `[CACHED] Already searched${queryInfo}. Results:\n${toolResultContent}\n\nIf you need more context, try a different search query or explore different directories.`;
        }

        messages.push({
          role: 'assistant',
          content: `Called ${toolCall.name}`,
        });
        messages.push({
          role: 'tool',
          content: toolResultContent,
          toolCallId: toolCall.id,
        });

        // Log the full tool result being sent back to model
        if (this.verbose && result.success) {
          this.logVerbose(
            `TOOL RESULT: ${toolCall.name}${wasCached ? ' [CACHED]' : ''}`,
            toolResultContent.slice(0, 500) +
              (toolResultContent.length > 500 ? '\n...[truncated]' : '')
          );
        }
      }

      // Check budget
      if (this.estimateTokens(accumulated.blocks) > this.config.tokenBudget) {
        this.log('Token budget exceeded - finishing');
        done = true;
      }
    }

    this.log(
      `Done! Found ${accumulated.symbols.length} symbols, ${accumulated.blocks.length} blocks in ${iteration} iteration(s)`
    );

    if (this.verbose) {
      verboseUI.footer();
    }

    return {
      ...accumulated,
      strategy: 'tools',
      tokenEstimate: this.estimateTokens(accumulated.blocks),
      toolCalls: toolCallRecords,
    };
  }

  private buildSystemPrompt(
    mode: 'tools' | 'hybrid',
    context?: string
  ): string {
    const toolsList = `Available tools:
- search: Search symbols and code content. Supports optional path filter.
- list_packages: See top-level directories (call first to understand project structure)
- list_files: List files in a directory (use to explore before searching)
- get_symbol_context: Get full code for a symbol
- get_callers / get_callees: Find relationships
- get_file_content: Get all code from a file
- done: Call when you have enough context

Advanced (rarely needed):
- search_symbols: Search symbol names only
- search_content: Search code content only`;

    if (mode === 'hybrid' && context) {
      // Hybrid mode: Code is already provided, tools are optional
      return `You are a code exploration assistant. I've already retrieved some code that may answer the user's question.

${context}

${toolsList}

INSTRUCTIONS:
1. Review the code context above
2. If it answers the question, call done() immediately with a summary
3. If you need MORE context (callers, callees, related code), use the tools
4. Do NOT re-fetch code that's already shown above
5. Be efficient - only explore if the existing context is insufficient`;
    } else {
      // Tools-only mode: Must explore to find code
      let prompt = `You are a code exploration assistant. Your job is to find relevant code to answer the user's question.

${toolsList}

HOW TO CALL TOOLS:
You MUST use the tool calling format - do NOT write shell commands or code.
Call tools by using the function calling interface provided.

EXPLORATION STRATEGY:
1. Start with list_packages() to see project structure
2. Use list_files("path") to browse a directory  
3. Use search("query") to find code - filter with search("query", "path") if needed
4. Use get_file_content("path") to see full file contents
5. Use get_symbol_context(symbolId) for specific symbols (use IDs from search)
6. Call done("summary") when you have found the relevant code

IMPORTANT:
- Keep exploring until you find the ACTUAL IMPLEMENTATION code
- If search returns only comments, use get_file_content() to see the real code
- Do NOT stop until you have found functions/classes that answer the question
- Do NOT make up file names - only reference files you've actually found`;

      if (context) {
        prompt += `\n\nSuggested entry points:\n${context}`;
      }

      return prompt;
    }
  }

  /**
   * Format entry points only (for Tools strategy - no code, just references)
   */
  private formatEntryPointsForModel(hints: RetrievalResult): string {
    const parts: string[] = [];

    if (hints.symbols.length > 0) {
      parts.push(
        `Entry points to explore:\n${hints.symbols
          .map((s) => `  - ${s.name} (${s.kind}) [id: ${s.id}]`)
          .join('\n')}`
      );
    }

    if (hints.files.length > 0) {
      parts.push(`In files: ${hints.files.map((f) => f.path).join(', ')}`);
    }

    parts.push('\nUse tools to get the code you need.');

    return parts.join('\n');
  }

  /**
   * Format full code context (for Hybrid strategy - includes actual code)
   */
  private formatCodeContextForHybrid(hints: RetrievalResult): string {
    const parts: string[] = [];

    // Show what files we have
    if (hints.files.length > 0) {
      parts.push(`Files: ${hints.files.map((f) => f.path).join(', ')}`);
    }

    // Include actual code blocks
    if (hints.blocks.length > 0) {
      parts.push('\n--- CODE CONTEXT (already retrieved) ---\n');

      // Group blocks by file for readability
      const blocksByFile = new Map<string, typeof hints.blocks>();
      for (const block of hints.blocks) {
        const file = hints.files.find((f) => f.id === block.fileId);
        const path = file?.path || block.fileId;
        if (!blocksByFile.has(path)) {
          blocksByFile.set(path, []);
        }
        blocksByFile.get(path)!.push(block);
      }

      for (const [path, blocks] of blocksByFile) {
        parts.push(`## ${path}`);
        for (const block of blocks.slice(0, 3)) {
          // Limit per file
          const sig =
            block.signature ||
            `${block.kind} (L${block.startLine}-${block.endLine})`;
          parts.push(`### ${sig}`);
          parts.push('```');
          // Truncate very long blocks
          const content =
            block.content.length > 800
              ? block.content.slice(0, 800) + '\n... [truncated]'
              : block.content;
          parts.push(content);
          parts.push('```\n');
        }
      }

      parts.push('--- END CODE CONTEXT ---');
    }

    // Show symbol IDs for further exploration
    if (hints.symbols.length > 0) {
      parts.push(
        `\nSymbol IDs for exploration: ${hints.symbols
          .slice(0, 5)
          .map((s) => `${s.name} (${s.id})`)
          .join(', ')}`
      );
    }

    return parts.join('\n');
  }

  private formatToolResult(
    toolName: string,
    result: ToolExecutionResult
  ): string {
    if (!result.success) {
      return `Error: ${result.error}`;
    }

    const data = result.data;
    if (!data) {
      return 'No results found';
    }

    const parts: string[] = [];

    // Handle list_packages output
    if (data.packages && data.packages.length > 0) {
      parts.push('Top-level directories:');
      for (const pkg of data.packages) {
        parts.push(`  - ${pkg}`);
      }
      if (data.message) {
        parts.push(`\n${data.message}`);
      }
    }

    // Handle list_files output (dirFiles with symbolCount)
    if (data.dirFiles && data.dirFiles.length > 0) {
      parts.push('Files in directory:');
      for (const f of data.dirFiles.slice(0, 20)) {
        parts.push(`  - ${f.path} (${f.symbolCount} symbols)`);
      }
      if (data.message) {
        parts.push(`\n${data.message}`);
      }
    }

    // Handle regular files (FileRecord[])
    if (data.files && data.files.length > 0) {
      parts.push(`Files: ${data.files.map((f) => f.path).join(', ')}`);
    }

    // Handle symbols
    if (data.symbols && data.symbols.length > 0) {
      parts.push('Symbols found:');
      for (const s of data.symbols.slice(0, 10)) {
        parts.push(`  - ${s.name} (${s.kind}) in ${s.fileId} [id: ${s.id}]`);
        if (s.signature) {
          parts.push(`    ${s.signature}`);
        }
      }
    }

    // Handle blocks
    if (data.blocks && data.blocks.length > 0) {
      parts.push('Code blocks:');
      for (const b of data.blocks.slice(0, 5)) {
        const preview = b.content.slice(0, 200).replace(/\n/g, ' ');
        parts.push(
          `  - ${b.kind} (lines ${b.startLine}-${b.endLine}): ${preview}...`
        );
      }

      // Hint if results are only comments - encourage getting actual code
      const allComments = data.blocks.every((b) => b.kind === 'comment');
      if (allComments && data.blocks.length > 0) {
        parts.push(
          '\n⚠️ Note: Only comments found. Use get_file_content() to see the actual implementation.'
        );
      }
    }

    if (data.relations && data.relations.length > 0) {
      parts.push(`Relations: ${data.relations.length} found`);
    }

    return parts.length > 0 ? parts.join('\n') : 'No results found';
  }

  // ============================================================================
  // Tool Execution
  // ============================================================================

  private async executeTool(
    call: ToolCallRequest,
    graph: ProjectGraph
  ): Promise<ToolExecutionResult> {
    try {
      switch (call.name) {
        case 'list_packages':
          return this.handleListPackages(graph);

        case 'list_files':
          return this.handleListFiles(call.arguments, graph);

        case 'search':
          return this.handleSearch(call.arguments, graph);

        case 'search_symbols':
          return this.handleSearchSymbols(call.arguments, graph);

        case 'search_content':
          return this.handleSearchContent(call.arguments, graph);

        case 'get_callers':
          return this.handleGetCallers(call.arguments, graph);

        case 'get_callees':
          return this.handleGetCallees(call.arguments, graph);

        case 'get_symbol_context':
          return this.handleGetSymbolContext(call.arguments, graph);

        case 'get_file_content':
          return this.handleGetFileContent(call.arguments, graph);

        case 'done':
          return { success: true };

        default:
          return { success: false, error: `Unknown tool: ${call.name}` };
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  // =========================================================================
  // Tool Handlers
  // =========================================================================

  /**
   * List top-level directories (packages) in the project
   */
  private handleListPackages(graph: ProjectGraph): ToolExecutionResult {
    const files = graph.findFiles();
    const topDirs = new Set<string>();

    for (const f of files) {
      const parts = f.path.split('/');
      if (parts.length > 1) {
        topDirs.add(parts[0] + '/');
      }
    }

    const packages = Array.from(topDirs).sort();
    this.log(`list_packages: found ${packages.length} top-level directories`);

    return {
      success: true,
      data: {
        packages,
        message: `Found ${
          packages.length
        } top-level directories: ${packages.join(', ')}`,
      },
    };
  }

  /**
   * List files in a specific directory
   */
  private handleListFiles(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const dirPath = args.path as string;
    const files = graph.findFiles();

    const dirFiles = files
      .filter((f) => f.path.startsWith(dirPath))
      .map((f) => ({
        path: f.path,
        symbolCount: graph.getSymbolsForFile(f.id).length,
      }))
      .slice(0, 20);

    this.log(`list_files("${dirPath}"): found ${dirFiles.length} files`);

    // Find the most relevant file (most symbols) to suggest
    const filesWithSymbols = dirFiles.filter((f) => f.symbolCount > 0);
    let hint = '';
    if (filesWithSymbols.length > 0) {
      const topFile = filesWithSymbols.sort(
        (a, b) => b.symbolCount - a.symbolCount
      )[0];
      hint = `\n\n→ Next: Use get_file_content("${topFile.path}") to see the code`;
    }

    return {
      success: true,
      data: {
        dirFiles,
        message: `Found ${dirFiles.length} files in ${dirPath}${hint}`,
      },
    };
  }

  /**
   * Combined search - searches symbols by name first, then content
   * Supports optional path filter to limit results to specific directory
   */
  private handleSearch(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const query = args.query as string;
    const pathFilter = args.path as string | undefined;
    const allSymbols: SymbolRecord[] = [];
    const allBlocks: ContentBlock[] = [];
    const seenSymbolIds = new Set<string>();
    const seenBlockIds = new Set<string>();

    // Build set of file IDs that match path filter
    let allowedFileIds: Set<string> | null = null;
    if (pathFilter) {
      const allFiles = graph.findFiles();
      allowedFileIds = new Set(
        allFiles.filter((f) => f.path.startsWith(pathFilter)).map((f) => f.id)
      );
      this.log(
        `Path filter "${pathFilter}": ${allowedFileIds.size} files match`
      );
    }

    // 1. First, search by symbol NAME (exact match, then pattern)
    let symbolMatches = graph.findSymbols({ name: query });
    if (symbolMatches.length === 0) {
      symbolMatches = graph.findSymbols({ namePattern: query });
    }

    // Filter by path if specified
    if (allowedFileIds) {
      symbolMatches = symbolMatches.filter((s) =>
        allowedFileIds!.has(s.fileId)
      );
    }

    // Add symbol matches (these are prioritized)
    for (const symbol of symbolMatches.slice(0, 10)) {
      if (!seenSymbolIds.has(symbol.id)) {
        allSymbols.push(symbol);
        seenSymbolIds.add(symbol.id);

        // Get blocks for this symbol
        const symbolBlocks = graph.getBlocksForSymbol(symbol.id);
        for (const block of symbolBlocks.filter((b) => !b.isChunk)) {
          if (!seenBlockIds.has(block.id)) {
            allBlocks.push(block);
            seenBlockIds.add(block.id);
          }
        }
      }
    }

    // 2. Then, search by content (full-text search)
    let contentBlocks = graph.searchBlocks(query, ['code', 'comment']);

    // Filter by path if specified
    if (allowedFileIds) {
      contentBlocks = contentBlocks.filter((b) =>
        allowedFileIds!.has(b.fileId)
      );
    }

    // Add content matches (lower priority, but fill in gaps)
    for (const block of contentBlocks.slice(0, 10)) {
      if (!seenBlockIds.has(block.id)) {
        allBlocks.push(block);
        seenBlockIds.add(block.id);

        // Get associated symbol if not already included
        if (block.symbolId && !seenSymbolIds.has(block.symbolId)) {
          const symbol = graph.getSymbol(block.symbolId);
          if (symbol) {
            allSymbols.push(symbol);
            seenSymbolIds.add(symbol.id);
          }
        }
      }
    }

    // Resolve files for all blocks
    const files = this.resolveFilesForBlocks(allBlocks, graph);

    // Log what we found for debugging
    const symbolMatchCount = symbolMatches.length;
    const contentMatchCount = contentBlocks.length;
    const pathInfo = pathFilter ? ` in "${pathFilter}"` : '';
    this.log(
      `search("${query}"${pathInfo}): ${symbolMatchCount} symbol matches, ${contentMatchCount} content matches`
    );

    return {
      success: true,
      data: {
        symbols: allSymbols.slice(0, 15),
        blocks: allBlocks.slice(0, 10),
        files,
        relations: [],
      },
    };
  }

  private handleSearchSymbols(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const query = args.query as string;
    const kinds = args.kinds as string[] | undefined;

    // Try exact match first
    let symbols = graph.findSymbols({ name: query });

    // Try pattern match if no exact match
    if (symbols.length === 0) {
      symbols = graph.findSymbols({ namePattern: query });
    }

    // Filter by kinds if specified
    if (kinds && kinds.length > 0) {
      const kindSet = new Set(kinds);
      symbols = symbols.filter((s) => kindSet.has(s.kind));
    }

    // Get blocks for found symbols
    const blocks: ContentBlock[] = [];
    for (const symbol of symbols.slice(0, 10)) {
      const symbolBlocks = graph.getBlocksForSymbol(symbol.id);
      blocks.push(...symbolBlocks.filter((b) => !b.isChunk));
    }

    // Resolve files
    const files = this.resolveFilesForSymbols(symbols, graph);

    return {
      success: true,
      data: { symbols: symbols.slice(0, 10), blocks, files, relations: [] },
    };
  }

  private handleSearchContent(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const query = args.query as string;
    const kinds = args.kinds as BlockKind[] | undefined;

    const blocks = graph.searchBlocks(query, kinds);

    // Get associated symbols
    const symbols: SymbolRecord[] = [];
    const seenSymbols = new Set<string>();
    for (const block of blocks) {
      if (block.symbolId && !seenSymbols.has(block.symbolId)) {
        const symbol = graph.getSymbol(block.symbolId);
        if (symbol) {
          symbols.push(symbol);
          seenSymbols.add(symbol.id);
        }
      }
    }

    // Resolve files
    const files = this.resolveFilesForBlocks(blocks, graph);

    return {
      success: true,
      data: { symbols, blocks: blocks.slice(0, 10), files, relations: [] },
    };
  }

  private handleGetCallers(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const symbolId = args.symbolId as string;
    const limit = (args.limit as number) || 10;

    const relations = graph.getIncomingRelations(symbolId);
    const callerRelations = relations.filter((r) => r.kind === 'CALLS');

    const symbols: SymbolRecord[] = [];
    for (const rel of callerRelations.slice(0, limit)) {
      const caller = graph.getSymbol(rel.sourceSymbolId);
      if (caller) {
        symbols.push(caller);
      }
    }

    const blocks = this.getBlocksForSymbols(symbols, graph);
    const files = this.resolveFilesForSymbols(symbols, graph);

    return {
      success: true,
      data: {
        symbols,
        blocks,
        files,
        relations: callerRelations.slice(0, limit),
      },
    };
  }

  private handleGetCallees(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const symbolId = args.symbolId as string;
    const limit = (args.limit as number) || 10;

    const relations = graph.getOutgoingRelations(symbolId);
    const calleeRelations = relations.filter((r) => r.kind === 'CALLS');

    const symbols: SymbolRecord[] = [];
    for (const rel of calleeRelations.slice(0, limit)) {
      const callee = graph.getSymbol(rel.targetSymbolId);
      if (callee) {
        symbols.push(callee);
      }
    }

    const blocks = this.getBlocksForSymbols(symbols, graph);
    const files = this.resolveFilesForSymbols(symbols, graph);

    return {
      success: true,
      data: {
        symbols,
        blocks,
        files,
        relations: calleeRelations.slice(0, limit),
      },
    };
  }

  private handleGetSymbolContext(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const symbolId = args.symbolId as string;

    const symbol = graph.getSymbol(symbolId);
    if (!symbol) {
      return { success: false, error: `Symbol not found: ${symbolId}` };
    }

    const blocks = graph.getBlocksForSymbol(symbolId);
    const file = graph.getFile(symbol.fileId);

    // Also get file-level comments near this symbol
    const fileBlocks = graph.getBlocksForFile(symbol.fileId);
    const nearbyComments = fileBlocks.filter(
      (b) =>
        (b.kind === 'comment' || b.kind === 'docstring') &&
        b.endLine >= symbol.startLine - 10 &&
        b.startLine <= symbol.startLine
    );

    const allBlocks = [...blocks, ...nearbyComments];

    return {
      success: true,
      data: {
        symbols: [symbol],
        blocks: allBlocks.filter((b) => !b.isChunk),
        files: file ? [file] : [],
        relations: [],
      },
    };
  }

  private handleGetFileContent(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const filePath = args.filePath as string;

    const files = graph.findFiles({ pathPattern: `*${filePath}*` });
    if (files.length === 0) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const file = files[0];
    const symbols = graph.getSymbolsForFile(file.id);
    const blocks = graph.getBlocksForFile(file.id);

    return {
      success: true,
      data: {
        symbols,
        blocks: blocks.filter((b) => !b.isChunk),
        files: [file],
        relations: [],
      },
    };
  }

  // =========================================================================
  // Helper Methods
  // =========================================================================

  private getBlocksForSymbols(
    symbols: SymbolRecord[],
    graph: ProjectGraph
  ): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const seenIds = new Set<string>();

    for (const symbol of symbols) {
      const symbolBlocks = graph.getBlocksForSymbol(symbol.id);
      for (const block of symbolBlocks) {
        if (!block.isChunk && !seenIds.has(block.id)) {
          blocks.push(block);
          seenIds.add(block.id);
        }
      }
    }

    return blocks;
  }

  private resolveFilesForSymbols(
    symbols: SymbolRecord[],
    graph: ProjectGraph
  ): FileRecord[] {
    const files = new Map<string, FileRecord>();

    for (const symbol of symbols) {
      if (!files.has(symbol.fileId)) {
        const file = graph.getFile(symbol.fileId);
        if (file) {
          files.set(file.id, file);
        }
      }
    }

    return Array.from(files.values());
  }

  private resolveFilesForBlocks(
    blocks: ContentBlock[],
    graph: ProjectGraph
  ): FileRecord[] {
    const files = new Map<string, FileRecord>();

    for (const block of blocks) {
      if (!files.has(block.fileId)) {
        const file = graph.getFile(block.fileId);
        if (file) {
          files.set(file.id, file);
        }
      }
    }

    return Array.from(files.values());
  }

  private mergeResults(
    accumulated: AccumulatedResults,
    data: ToolResultData
  ): void {
    const seenSymbols = new Set(accumulated.symbols.map((s) => s.id));
    const seenBlocks = new Set(accumulated.blocks.map((b) => b.id));
    const seenFiles = new Set(accumulated.files.map((f) => f.id));
    const seenRelations = new Set(accumulated.relations.map((r) => r.id));

    for (const symbol of data.symbols || []) {
      if (!seenSymbols.has(symbol.id)) {
        accumulated.symbols.push(symbol);
        seenSymbols.add(symbol.id);
      }
    }

    for (const block of data.blocks || []) {
      if (!seenBlocks.has(block.id)) {
        accumulated.blocks.push(block);
        seenBlocks.add(block.id);
      }
    }

    for (const file of data.files || []) {
      if (!seenFiles.has(file.id)) {
        accumulated.files.push(file);
        seenFiles.add(file.id);
      }
    }

    for (const relation of data.relations || []) {
      if (!seenRelations.has(relation.id)) {
        accumulated.relations.push(relation);
        seenRelations.add(relation.id);
      }
    }
  }

  private estimateTokens(blocks: ContentBlock[]): number {
    return blocks.reduce(
      (sum, block) => sum + this.budget.estimate(block.content),
      0
    );
  }
}

// ============================================================================
// Internal Types
// ============================================================================

interface AccumulatedResults {
  symbols: SymbolRecord[];
  blocks: ContentBlock[];
  files: FileRecord[];
  relations: Relation[];
}

interface ToolResultData {
  symbols?: SymbolRecord[];
  blocks?: ContentBlock[];
  files?: FileRecord[];
  relations?: Relation[];
  // For list_packages
  packages?: string[];
  // For list_files (simplified file info)
  dirFiles?: Array<{ path: string; symbolCount: number }>;
  // For descriptive messages
  message?: string;
}

interface ToolExecutionResult {
  success: boolean;
  data?: ToolResultData;
  error?: string;
}

interface ToolCallRecord {
  call: {
    name: string;
    arguments: Record<string, unknown>;
  };
  result: {
    success: boolean;
    data?: unknown;
    error?: string;
  };
  timestamp: string;
}
