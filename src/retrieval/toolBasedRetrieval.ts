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
  ConversationContext,
} from './types';
import {
  SymbolRecord,
  ContentBlock,
  FileRecord,
  Relation,
  RetrievalQuery,
  BlockKind,
  ChatMessage as BrainChatMessage,
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
// Token Limits for Conversation Tools
// ============================================================================

export const CONVERSATION_TOOL_LIMITS = {
  /** Max tokens for previous answer */
  get_previous_answer: 1500,
  /** Max tokens per message for recent messages */
  get_recent_messages: 500,
  /** Max total tokens for conversation search results */
  search_conversation: 2000,
  /** Max tokens per session for cross-session search */
  search_sessions: 1000,
  /** Max sessions to return in cross-session search */
  max_sessions: 3,
  /** Max tokens for direct mode history */
  direct_history: 1500,
};

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
      'Search for symbols and code content. By default searches code blocks only. Add kinds=["code","comment"] to include comments.',
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
        kinds: {
          type: 'array',
          description:
            'Optional: block kinds to search (default: ["code"]). Options: code, comment, docstring, import, export',
          items: { type: 'string' },
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
      'Get full code for a symbol. By default returns only the symbol code, not nearby comments.',
    parameters: {
      type: 'object',
      properties: {
        symbolId: {
          type: 'string',
          description: 'ID of the symbol',
        },
        includeNearbyComments: {
          type: 'boolean',
          description:
            'Optional: include nearby comments/docstrings (default: false)',
        },
      },
      required: ['symbolId'],
    },
  },
  {
    name: 'get_file_content',
    description: 'Get all symbols and code blocks from a specific file. By default returns code blocks only.',
    parameters: {
      type: 'object',
      properties: {
        filePath: {
          type: 'string',
          description: 'Path to the file (can be partial match)',
        },
        kinds: {
          type: 'array',
          description:
            'Optional: block kinds to include (default: ["code"]). Options: code, comment, docstring, import, export',
          items: { type: 'string' },
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

// Conversation tools - added dynamically when historyMode is 'tools'
export const CONVERSATION_TOOLS: ToolDefinition[] = [
  {
    name: 'get_previous_answer',
    description:
      'Get your previous response in this conversation. Use when user asks "why did you say that?" or references your prior answer.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'get_recent_messages',
    description:
      'Get recent messages from the current conversation. Use to understand conversation context.',
    parameters: {
      type: 'object',
      properties: {
        count: {
          type: 'number',
          description: 'Number of recent messages to retrieve (default: 4)',
        },
      },
      required: [],
    },
  },
  {
    name: 'search_conversation',
    description:
      'Search the current conversation for specific topics or terms.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find in conversation history',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_sessions',
    description:
      'List all available chat sessions. Use when user references previous conversations.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'search_sessions',
    description:
      'Search across all sessions for relevant conversations. Use when user asks about something discussed previously.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find across all sessions',
        },
      },
      required: ['query'],
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
  /** History access mode: 'direct' includes history in prompt, 'tools' provides on-demand access */
  historyMode?: 'direct' | 'tools';
  /** For direct mode: how many messages to include */
  historyLimit?: number;
}

export class ToolBasedRetrieval implements RetrievalStrategy {
  private config: RetrievalConfig;
  private budget: TokenBudgetManager;
  private runtime: ToolCapableRuntime;
  private verbose: boolean;
  private historyMode: 'direct' | 'tools';
  private historyLimit: number;

  readonly tools: ToolDefinition[];

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
    this.historyMode = options?.historyMode ?? 'tools';
    this.historyLimit = options?.historyLimit ?? 6;

    // Build tools list - include conversation tools if historyMode is 'tools'
    this.tools =
      this.historyMode === 'tools'
        ? [...RETRIEVAL_TOOLS, ...CONVERSATION_TOOLS]
        : RETRIEVAL_TOOLS;

    // Debug: log constructor options
    if (this.verbose) {
      console.log(`[ToolBasedRetrieval] historyMode=${this.historyMode}, tools=${this.tools.length} (conversation tools: ${this.historyMode === 'tools' ? 'included' : 'excluded'})`);
    }
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
   * Detect if a question is likely about the conversation (not codebase)
   */
  private isConversationQuestion(question: string): boolean {
    const lowerQ = question.toLowerCase();
    // Patterns that indicate asking about previous conversation
    const conversationPatterns = [
      // "what did you suggest" variants
      /what did you (say|suggest|recommend|mention)/,
      /what .{0,30} did you (say|suggest|recommend|mention)/,  // "what X did you suggest"
      /how did you (suggest|say|recommend)/,
      // "your suggestion" variants
      /can you (explain|clarify) (that|what you said|your (answer|suggestion))/,
      /what (was|were) (that|your) (suggestion|approach|fix|solution)/,
      /what .{0,30} (suggestion|approach|fix|solution)/,  // "what scroll suggestion"
      // Reference to previous answer
      /tell me (more )?about what you (said|suggested)/,
      /remind me what you/,
      /what do you mean by/,
      /elaborate on (that|your)/,
      // Direct references
      /you (said|suggested|mentioned|recommended)/,
      /your (answer|response|suggestion|recommendation|fix|solution|approach)/,
      // Follow-up patterns
      /explain (that|this|your|the) (fix|solution|approach|suggestion)/,
      /(that|the) (fix|solution|approach) you/,
    ];
    return conversationPatterns.some((p) => p.test(lowerQ));
  }

  /**
   * Main retrieval method - runs agentic tool-calling loop
   * Tools-only mode: Model must explore to find code
   */
  async retrieve(
    query: RetrievalQuery,
    graph: ProjectGraph
  ): Promise<RetrievalResult> {
    // Direct mode optimization: skip exploration for conversation questions
    if (
      this.historyMode === 'direct' &&
      query.conversationHistory &&
      query.conversationHistory.length > 0 &&
      this.isConversationQuestion(query.question)
    ) {
      this.log(
        'Detected conversation question in direct mode - skipping codebase exploration'
      );
      // Return empty result - conversation context will be added by assembler
      const historyToInclude = query.conversationHistory.slice(
        -this.historyLimit
      );
      return {
        symbols: [],
        blocks: [],
        files: [],
        relations: [],
        strategy: 'tools',
        tokenEstimate: 0,
        conversationContext: {
          messages: historyToInclude,
          summary: this.formatHistoryForDirectMode(historyToInclude),
        },
      };
    }

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

    // Check if conversation history is available - only true if there are actual messages
    // We check for at least one assistant message to ensure it's not just the current user message
    const hasConversationHistory = !!(
      query.conversationHistory && 
      query.conversationHistory.length > 0 &&
      query.conversationHistory.some(m => m.role === 'assistant')
    );

    // In both modes, detect conversation follow-up questions and handle appropriately
    if (hasConversationHistory && this.isConversationQuestion(query.question)) {
      this.log('Detected conversation follow-up question');
      const historyToInclude = query.conversationHistory!.slice(-this.historyLimit);
      
      if (this.historyMode === 'direct') {
        // Direct mode: skip exploration entirely
        this.log('Direct mode: skipping exploration, returning conversation context');
        return {
          ...accumulated,
          strategy: 'tools',
          tokenEstimate: 0,
          toolCalls: [],
          conversationContext: {
            messages: historyToInclude,
            summary: this.formatHistoryForDirectMode(historyToInclude),
          },
        };
      }
      // Tools mode: continue but model should use conversation tools
    }

    // Build initial system message based on mode
    const systemPrompt = this.buildSystemPrompt(
      mode,
      context,
      hasConversationHistory
    );

    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
    ];

    // Direct mode: include conversation history context
    let questionWithContext = query.question;
    if (
      this.historyMode === 'direct' &&
      query.conversationHistory &&
      query.conversationHistory.length > 0
    ) {
      const historyToInclude = query.conversationHistory.slice(
        -this.historyLimit
      );
      const formattedHistory = this.formatHistoryForDirectMode(historyToInclude);
      if (formattedHistory) {
        // Inject conversation context into the question itself
        // Put the decision instruction FIRST so the model sees it before the context
        questionWithContext = `FIRST DECIDE: Is my question about your PREVIOUS RESPONSE or about ACTUAL CODE?
- If about your previous response → call done() immediately (you have the context below)
- If about actual code → explore the codebase

[PREVIOUS CONVERSATION:
${formattedHistory}
]

My question: ${query.question}`;
      }
    }

    messages.push({ role: 'user', content: questionWithContext });

    let iteration = 0;
    let done = false;

    if (this.verbose) {
      verboseUI.header('TOOL-BASED RETRIEVAL');
    }
    this.log('Starting agentic exploration...');

    // Log initial messages sent to model
    const allSystemContent = messages
      .filter((m) => m.role === 'system')
      .map((m) => m.content)
      .join('\n\n---\n\n');
    this.logVerbose(
      'INITIAL PROMPT TO MODEL',
      `System:\n${allSystemContent}\n\nUser:\n${questionWithContext}\n\nTools available: ${this.tools.map((t) => t.name).join(', ')}`
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
        // Check if we have conversation context - if so, we might not need codebase exploration
        const hasConversationContext = accumulated.conversationContext && 
          accumulated.conversationContext.messages.length > 0;
        
        // If we haven't found any actual code AND no conversation context, prompt model to continue
        if (
          accumulated.symbols.length === 0 &&
          accumulated.blocks.length === 0 &&
          !hasConversationContext &&
          iteration < 5
        ) {
          this.log(
            'Model stopped early with no code or conversation context found - prompting to continue...'
          );

          // Add a nudge message - include conversation tools if available
          const nudgeContent = hasConversationHistory
            ? `You haven't gathered enough context yet. Consider:
- If this is a question about previous discussion: use get_previous_answer() or get_recent_messages()
- If this is a question about actual code: use search("query") or get_file_content("path")
- Call done() when you have the relevant context.`
            : `You haven't found any actual code yet. Please continue exploring:
- Use get_file_content("path") to read files you found
- Use search("query") to find specific code
- Keep going until you find the implementation code that answers the question.`;

          messages.push({
            role: 'user',
            content: nudgeContent,
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
          result = await this.executeTool(toolCall, graph, query);
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
          if (data.conversationMessages?.length)
            counts.push(`${data.conversationMessages.length} messages`);
          if (counts.length > 0) {
            this.logToolResult(
              `${wasCached ? '[CACHED] ' : ''}Found: ${counts.join(', ')}`
            );
          } else if (data.message) {
            // Conversation tools return a message instead of counts
            this.logToolResult(`${wasCached ? '[CACHED] ' : ''}OK`);
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

        // If a conversation tool returned results, STRONGLY instruct to call done()
        const isConversationTool = [
          'get_previous_answer',
          'get_recent_messages',
          'search_conversation',
        ].includes(toolCall.name);
        if (isConversationTool && result.success) {
          toolResultContent += `\n\n>>> STOP: You now have conversation context. Call done() IMMEDIATELY. Do NOT search the codebase - the user is asking about YOUR previous response, not about code.`;
        }

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

    // Build conversation context for the answer model
    // Always include conversation history so the answer model can reference previous discussion
    let conversationContext: ConversationContext | undefined = accumulated.conversationContext;

    // If no conversation context was accumulated from tools, but we have history, include it
    // This ensures the answer model always has access to previous conversation
    if (query.conversationHistory && query.conversationHistory.length > 0) {
      const historyToInclude = query.conversationHistory.slice(-this.historyLimit);
      if (!conversationContext || conversationContext.messages.length === 0) {
        // No conversation context from tools - use the session history
        conversationContext = {
          messages: historyToInclude,
          summary: this.formatHistoryForDirectMode(historyToInclude),
        };
      }
      // If conversation context exists from tools, it already has relevant messages
    }

    return {
      ...accumulated,
      strategy: 'tools',
      tokenEstimate: this.estimateTokens(accumulated.blocks),
      toolCalls: toolCallRecords,
      conversationContext,
    };
  }

  private buildSystemPrompt(
    mode: 'tools' | 'hybrid',
    context?: string,
    hasConversationHistory?: boolean
  ): string {
    const codeToolsList = `Available tools:
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

    // Add conversation tools ONLY if there's actual conversation history
    const conversationToolsList =
      this.historyMode === 'tools' && hasConversationHistory
        ? `

CONVERSATION TOOLS (for questions about previous discussion):
- get_previous_answer: Get your last response (CALL THIS FIRST for follow-ups)
- get_recent_messages(count): Get recent messages
- search_conversation(query): Search conversation

CRITICAL DECISION (make this FIRST before any tool call):
A) Is user asking about YOUR previous response/suggestion/answer?
   → Call get_previous_answer(), then IMMEDIATELY call done()
   → Do NOT search the codebase
   
B) Is user asking about actual code in the project?
   → Use codebase tools (search, get_file_content, etc.)
   → Do NOT use conversation tools

NEVER mix both paths. If you called a conversation tool, call done() next.`
        : '';

    const toolsList = codeToolsList + conversationToolsList;

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
      const conversationGuidance = hasConversationHistory
        ? `
PREVIOUS CONVERSATION EXISTS. First decide:
- Is user asking about what YOU said/suggested? → Use conversation tools ONLY, then done()
- Is user asking about actual CODE? → Use codebase tools ONLY`
        : '';

      let prompt = `You are a code exploration assistant. Your job is to find relevant code to answer the user's question.

${toolsList}
${conversationGuidance}

HOW TO CALL TOOLS:
Use the tool calling format provided. Do NOT write shell commands.

EXPLORATION STRATEGY:
1. Start with list_packages() to see project structure
2. Use list_files("path") to browse a directory  
3. Use search("query") to find code - filter with search("query", "path") if needed
4. Use get_file_content("path") to see full file contents
5. Use get_symbol_context(symbolId) for specific symbols (use IDs from search)
6. Call done("summary") when you have found the relevant code
${conversationGuidance}`;

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

    // Handle message-only responses (conversation tools, etc.)
    if (data.message && parts.length === 0) {
      parts.push(data.message);
    }

    return parts.length > 0 ? parts.join('\n') : 'No results found';
  }

  // ============================================================================
  // Tool Execution
  // ============================================================================

  private async executeTool(
    call: ToolCallRequest,
    graph: ProjectGraph,
    query: RetrievalQuery
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

        // Conversation tools
        case 'get_previous_answer':
          return this.handleGetPreviousAnswer(query);

        case 'get_recent_messages':
          return this.handleGetRecentMessages(call.arguments, query);

        case 'search_conversation':
          return this.handleSearchConversation(call.arguments, query);

        case 'list_sessions':
          return this.handleListSessions(query);

        case 'search_sessions':
          return this.handleSearchSessions(call.arguments, query);

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
   * Supports optional kinds filter (defaults to ['code'] to prioritize implementation code)
   */
  private handleSearch(
    args: Record<string, unknown>,
    graph: ProjectGraph
  ): ToolExecutionResult {
    const query = args.query as string;
    const pathFilter = args.path as string | undefined;
    // Default to code-only search to prioritize implementation over comments
    const kinds = (args.kinds as BlockKind[] | undefined) || ['code'];
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

    // Maximum block size - prefer focused blocks over huge function bodies
    const MAX_BLOCK_LINES = 150;
    const isBlockSizeOk = (b: ContentBlock) => (b.endLine - b.startLine + 1) <= MAX_BLOCK_LINES;

    // Add symbol matches (these are prioritized)
    for (const symbol of symbolMatches.slice(0, 10)) {
      if (!seenSymbolIds.has(symbol.id)) {
        allSymbols.push(symbol);
        seenSymbolIds.add(symbol.id);

        // Get blocks for this symbol (only code blocks, not comments, and not too large)
        const symbolBlocks = graph.getBlocksForSymbol(symbol.id);
        for (const block of symbolBlocks.filter((b) => !b.isChunk && b.kind === 'code' && isBlockSizeOk(b))) {
          if (!seenBlockIds.has(block.id)) {
            allBlocks.push(block);
            seenBlockIds.add(block.id);
          }
        }
      }
    }

    // 2. Then, search by content (full-text search) using specified kinds
    let contentBlocks = graph.searchBlocks(query, kinds);

    // Filter by path if specified
    if (allowedFileIds) {
      contentBlocks = contentBlocks.filter((b) =>
        allowedFileIds!.has(b.fileId)
      );
    }

    // Filter out huge blocks - prefer focused, relevant blocks
    contentBlocks = contentBlocks.filter(isBlockSizeOk);

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
    const includeNearbyComments = args.includeNearbyComments as boolean | undefined;

    const symbol = graph.getSymbol(symbolId);
    if (!symbol) {
      return { success: false, error: `Symbol not found: ${symbolId}` };
    }

    const blocks = graph.getBlocksForSymbol(symbolId);
    const file = graph.getFile(symbol.fileId);

    let allBlocks = [...blocks];

    // Only include nearby comments if explicitly requested
    if (includeNearbyComments) {
      const fileBlocks = graph.getBlocksForFile(symbol.fileId);
      const nearbyComments = fileBlocks.filter(
        (b) =>
          (b.kind === 'comment' || b.kind === 'docstring') &&
          b.endLine >= symbol.startLine - 10 &&
          b.startLine <= symbol.startLine
      );
      allBlocks = [...blocks, ...nearbyComments];
    }

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
    // Default to code-only to prioritize implementation over comments/imports
    const kinds = (args.kinds as BlockKind[] | undefined) || ['code'];
    const kindsSet = new Set(kinds);

    const files = graph.findFiles({ pathPattern: `*${filePath}*` });
    if (files.length === 0) {
      return { success: false, error: `File not found: ${filePath}` };
    }

    const file = files[0];
    const symbols = graph.getSymbolsForFile(file.id);
    const blocks = graph.getBlocksForFile(file.id);

    // Filter blocks by requested kinds AND limit size
    // Prefer focused blocks (< 150 lines) over huge function bodies
    const MAX_BLOCK_LINES = 150;
    const filteredBlocks = blocks.filter((b) => {
      if (b.isChunk) return false;
      if (!kindsSet.has(b.kind)) return false;
      const lineCount = b.endLine - b.startLine + 1;
      // Include smaller focused blocks, exclude huge ones
      return lineCount <= MAX_BLOCK_LINES;
    });

    return {
      success: true,
      data: {
        symbols,
        blocks: filteredBlocks,
        files: [file],
        relations: [],
      },
    };
  }

  // =========================================================================
  // Conversation Tool Handlers
  // =========================================================================

  /**
   * Get the previous assistant response
   * Note: We summarize the response to avoid model confusing suggestions with actual code
   */
  private handleGetPreviousAnswer(
    query: RetrievalQuery
  ): ToolExecutionResult {
    const history = query.conversationHistory || [];
    const assistantMessages = history.filter((m) => m.role === 'assistant');

    if (assistantMessages.length === 0) {
      return {
        success: true,
        data: {
          message: 'No previous answer found. This is the first message.',
        },
      };
    }

    const lastAnswer = assistantMessages[assistantMessages.length - 1];
    // Summarize to avoid confusing suggestions with actual code
    const summary = this.summarizeAssistantMessage(lastAnswer.content);

    // Also find the user message that preceded this answer
    const lastUserIdx = history.findIndex((m) => m === lastAnswer) - 1;
    const precedingUser = lastUserIdx >= 0 ? history[lastUserIdx] : null;
    const messagesToInclude = precedingUser
      ? [precedingUser, lastAnswer]
      : [lastAnswer];

    return {
      success: true,
      data: {
        message: `Your previous response:\n${summary}\n\n(This is what you suggested, not implemented code)`,
        conversationMessages: messagesToInclude,
      },
    };
  }

  /**
   * Get recent messages from conversation
   */
  private handleGetRecentMessages(
    args: Record<string, unknown>,
    query: RetrievalQuery
  ): ToolExecutionResult {
    const count = (args.count as number) || 4;
    const history = query.conversationHistory || [];

    if (history.length === 0) {
      return {
        success: true,
        data: {
          message: 'No conversation history available.',
        },
      };
    }

    const recentMessages = history.slice(-count);
    const formatted = recentMessages
      .map((msg) =>
        this.formatMessageForTool(msg, CONVERSATION_TOOL_LIMITS.get_recent_messages)
      )
      .join('\n\n');

    return {
      success: true,
      data: {
        message: `Recent conversation (${recentMessages.length} messages):\n\n${formatted}`,
        conversationMessages: recentMessages,
      },
    };
  }

  /**
   * Search current conversation for a query
   */
  private handleSearchConversation(
    args: Record<string, unknown>,
    query: RetrievalQuery
  ): ToolExecutionResult {
    const searchQuery = (args.query as string || '').toLowerCase();
    const history = query.conversationHistory || [];

    if (!searchQuery) {
      return { success: false, error: 'Search query required' };
    }

    if (history.length === 0) {
      return {
        success: true,
        data: {
          message: 'No conversation history to search.',
        },
      };
    }

    // Find matching messages
    const matches = history.filter((msg) =>
      msg.content.toLowerCase().includes(searchQuery)
    );

    if (matches.length === 0) {
      return {
        success: true,
        data: {
          message: `No messages found matching "${searchQuery}"`,
        },
      };
    }

    // Format matches with token limit
    let totalTokens = 0;
    const formattedMatches: string[] = [];
    const includedMessages: BrainChatMessage[] = [];

    for (const msg of matches) {
      const formatted = this.formatMessageForTool(msg, 300);
      const tokens = this.budget.estimate(formatted);

      if (totalTokens + tokens > CONVERSATION_TOOL_LIMITS.search_conversation) {
        break;
      }

      formattedMatches.push(formatted);
      includedMessages.push(msg);
      totalTokens += tokens;
    }

    return {
      success: true,
      data: {
        message: `Found ${matches.length} message(s) matching "${searchQuery}":\n\n${formattedMatches.join('\n\n---\n\n')}`,
        conversationMessages: includedMessages,
      },
    };
  }

  /**
   * List all available sessions
   */
  private handleListSessions(
    query: RetrievalQuery
  ): ToolExecutionResult {
    if (!query.listSessions) {
      return {
        success: true,
        data: {
          message: 'Cross-session search not available.',
        },
      };
    }

    const sessions = query.listSessions();

    if (sessions.length === 0) {
      return {
        success: true,
        data: {
          message: 'No other sessions found.',
        },
      };
    }

    const formatted = sessions
      .slice(0, 10)
      .map((s) => {
        const date = new Date(s.updatedAt).toLocaleDateString();
        return `- ${s.name} (${date}) [id: ${s.id}]`;
      })
      .join('\n');

    return {
      success: true,
      data: {
        message: `Available sessions (${sessions.length}):\n${formatted}`,
      },
    };
  }

  /**
   * Search across all sessions for a query
   */
  private handleSearchSessions(
    args: Record<string, unknown>,
    query: RetrievalQuery
  ): ToolExecutionResult {
    const searchQuery = (args.query as string || '').toLowerCase();

    if (!searchQuery) {
      return { success: false, error: 'Search query required' };
    }

    if (!query.listSessions || !query.loadSessionHistory) {
      return {
        success: true,
        data: {
          message: 'Cross-session search not available.',
        },
      };
    }

    const sessions = query.listSessions();
    const results: Array<{
      sessionName: string;
      sessionId: string;
      matches: string[];
    }> = [];

    let sessionsSearched = 0;
    let totalTokens = 0;

    // Search through sessions
    for (const session of sessions) {
      if (sessionsSearched >= CONVERSATION_TOOL_LIMITS.max_sessions) {
        break;
      }

      const history = query.loadSessionHistory(session.id);
      if (!history) continue;

      // Find matching messages in this session
      const matches = history.filter((msg) =>
        msg.content.toLowerCase().includes(searchQuery)
      );

      if (matches.length > 0) {
        const formattedMatches: string[] = [];
        let sessionTokens = 0;

        for (const msg of matches.slice(0, 3)) {
          const formatted = this.formatMessageForTool(msg, 200);
          const tokens = this.budget.estimate(formatted);

          if (sessionTokens + tokens > CONVERSATION_TOOL_LIMITS.search_sessions) {
            break;
          }

          formattedMatches.push(formatted);
          sessionTokens += tokens;
        }

        if (formattedMatches.length > 0) {
          results.push({
            sessionName: session.name,
            sessionId: session.id,
            matches: formattedMatches,
          });
          totalTokens += sessionTokens;
        }

        sessionsSearched++;
      }
    }

    if (results.length === 0) {
      return {
        success: true,
        data: {
          message: `No matches found for "${searchQuery}" across sessions.`,
        },
      };
    }

    // Format results
    const formatted = results
      .map((r) => {
        return `**${r.sessionName}** (${r.sessionId}):\n${r.matches.join('\n---\n')}`;
      })
      .join('\n\n');

    return {
      success: true,
      data: {
        message: `Found matches in ${results.length} session(s):\n\n${formatted}`,
      },
    };
  }

  // =========================================================================
  // Conversation History Helpers
  // =========================================================================

  /**
   * Format conversation history for direct mode (included in prompt)
   * Note: We include user messages for context but summarize assistant responses
   * to avoid the model confusing its suggestions with actual codebase content.
   */
  private formatHistoryForDirectMode(history: ChatMessage[]): string {
    const parts: string[] = [];
    let totalTokens = 0;

    for (const msg of history) {
      let content: string;
      let prefix: string;

      if (msg.role === 'user') {
        prefix = 'User asked';
        content = this.budget.truncate(msg.content, 400);
      } else {
        // For assistant messages, summarize to avoid confusion with actual code
        prefix = 'You responded with suggestions about';
        // Extract just the topic/summary, not the full code suggestions
        const firstLine = msg.content.split('\n')[0];
        const summary = firstLine.length > 200 ? firstLine.slice(0, 200) + '...' : firstLine;
        content = summary;
      }

      const tokens = this.budget.estimate(content);

      if (totalTokens + tokens > CONVERSATION_TOOL_LIMITS.direct_history) {
        break;
      }

      parts.push(`${prefix}: ${content}`);
      totalTokens += tokens;
    }

    return parts.join('\n\n');
  }

  /**
   * Format a single message for tool output
   * For assistant messages, summarizes to avoid confusion with actual code
   */
  private formatMessageForTool(msg: ChatMessage, maxTokens: number): string {
    if (msg.role === 'user') {
      const content = this.budget.truncate(msg.content, maxTokens);
      return `User asked: ${content}`;
    } else {
      // Summarize assistant messages to avoid confusion
      const summary = this.summarizeAssistantMessage(msg.content);
      return `You suggested: ${summary}`;
    }
  }

  /**
   * Summarize an assistant message to avoid model confusing suggestions with actual code
   * Extracts the main topic/approach without including full code blocks
   */
  private summarizeAssistantMessage(content: string): string {
    // Remove code blocks to avoid confusion
    const withoutCode = content.replace(/```[\s\S]*?```/g, '[code suggestion]');
    
    // Take first few sentences or lines
    const lines = withoutCode.split('\n').filter((l) => l.trim());
    const summary = lines.slice(0, 3).join(' ').slice(0, 300);
    
    return summary + (content.length > 300 ? '...' : '');
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

    // Merge conversation context if provided
    if (data.conversationMessages && data.conversationMessages.length > 0) {
      if (!accumulated.conversationContext) {
        accumulated.conversationContext = { messages: [] };
      }
      // Add messages that aren't already included
      const existingContent = new Set(accumulated.conversationContext.messages.map(m => m.content));
      for (const msg of data.conversationMessages) {
        if (!existingContent.has(msg.content)) {
          accumulated.conversationContext.messages.push(msg);
          existingContent.add(msg.content);
        }
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
  /** Conversation context collected from conversation tools */
  conversationContext?: ConversationContext;
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
  // For conversation tools - messages to include in conversation context
  conversationMessages?: BrainChatMessage[];
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
