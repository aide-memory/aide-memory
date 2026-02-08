/**
 * Cloud Model Client - OpenAI and future cloud provider integrations
 *
 * Implements ToolCapableRuntime for cloud-hosted models.
 * Currently supports: OpenAI (gpt-4o, gpt-4-turbo, o1-*, text-embedding-*)
 * Future: Anthropic (claude-*), Google (gemini-*)
 */

import axios from 'axios';
import {
  ChatMessage,
  ChatResponse,
  ToolCapableRuntime,
  EmbeddingRuntime,
  ToolDefinition,
  ToolCallRequest,
} from './types';

export type Embedding = number[];

// ============================================================================
// Provider Types
// ============================================================================

export type CloudProvider = 'openai' | 'anthropic' | 'google';

export interface CloudConfig {
  provider: CloudProvider;
  apiKey: string;
  model: string;
  embeddingModel?: string;
  baseUrl?: string; // Custom endpoint (optional)
}

// ============================================================================
// OpenAI-Specific Types (internal)
// ============================================================================

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OpenAIToolCall[];
  tool_call_id?: string;
}

interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

interface OpenAITool {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: {
      type: 'object';
      properties: Record<
        string,
        {
          type: string;
          description: string;
          enum?: string[];
          items?: { type: string };
        }
      >;
      required?: string[];
    };
  };
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OpenAIToolCall[];
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

// ============================================================================
// OpenAIRuntime
// ============================================================================

export class OpenAIRuntime implements ToolCapableRuntime, EmbeddingRuntime {
  private apiKey: string;
  private model: string;
  private embeddingModel: string;
  private baseUrl: string;

  constructor(config: CloudConfig) {
    if (!config.apiKey) {
      throw new Error(
        'OpenAI API key is required. Set OPENAI_API_KEY environment variable or provide apiKey in config.'
      );
    }

    this.apiKey = config.apiKey;
    this.model = config.model;
    this.embeddingModel = config.embeddingModel ?? 'text-embedding-3-small';
    this.baseUrl = config.baseUrl ?? 'https://api.openai.com/v1';
  }

  /**
   * Check if this runtime supports tool calling
   */
  supportsTools(): boolean {
    // All GPT-4 and GPT-3.5-turbo models support tools
    // o1 models have limited tool support
    const model = this.model.toLowerCase();
    if (model.startsWith('o1-')) {
      // o1 models don't support tools in the same way
      return false;
    }
    return true;
  }

  /**
   * Generate embeddings for texts
   */
  async embed(texts: string[]): Promise<Embedding[]> {
    const url = `${this.baseUrl}/embeddings`;

    try {
      const resp = await axios.post<OpenAIEmbeddingResponse>(
        url,
        {
          model: this.embeddingModel,
          input: texts,
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Sort by index to ensure correct order
      const sorted = resp.data.data.sort((a, b) => a.index - b.index);
      return sorted.map((item) => item.embedding);
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 401) {
        throw new Error('Invalid OpenAI API key. Check your OPENAI_API_KEY.');
      }

      if (status === 429) {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }

      console.error(
        '[aide:embed] OpenAI error:',
        status,
        JSON.stringify(data)
      );
      throw err;
    }
  }

  /**
   * Simple chat without tools
   */
  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    return this.chatWithTools(messages);
  }

  /**
   * Chat with optional tool support
   */
  async chatWithTools(
    messages: ChatMessage[],
    tools?: ToolDefinition[]
  ): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat/completions`;

    try {
      const openaiMessages = this.toOpenAIMessages(messages);
      const openaiTools = tools ? this.toOpenAITools(tools) : undefined;

      const payload: Record<string, unknown> = {
        model: this.model,
        messages: openaiMessages,
      };

      if (openaiTools && openaiTools.length > 0 && this.supportsTools()) {
        payload.tools = openaiTools;
        payload.tool_choice = 'auto';
      }

      if (process.env.AIDE_DEBUG) {
        console.log('[openai:debug] Request payload:', {
          model: this.model,
          messageCount: openaiMessages.length,
          toolCount: openaiTools?.length ?? 0,
        });
      }

      const resp = await axios.post<OpenAIChatResponse>(url, payload, {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      const choice = resp.data.choices[0];
      const message = choice?.message;
      const content = message?.content ?? '';

      if (process.env.AIDE_DEBUG) {
        console.log('[openai:debug] Response:', {
          finishReason: choice?.finish_reason,
          contentLength: content?.length,
          hasToolCalls: !!message?.tool_calls,
          toolCallsCount: message?.tool_calls?.length ?? 0,
          usage: resp.data.usage,
        });
      }

      const toolCalls = this.parseToolCalls(message?.tool_calls);

      // Extract token usage from API response
      const apiUsage = resp.data.usage;
      const usage = apiUsage
        ? {
            inputTokens: apiUsage.prompt_tokens,
            outputTokens: apiUsage.completion_tokens,
          }
        : undefined;

      return { content, toolCalls, usage };
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 401) {
        throw new Error('Invalid OpenAI API key. Check your OPENAI_API_KEY.');
      }

      if (status === 429) {
        throw new Error('OpenAI rate limit exceeded. Please try again later.');
      }

      if (status === 404) {
        throw new Error(
          `Model '${this.model}' not found. Check your OpenAI model name.`
        );
      }

      console.error(
        '[aide:chat] OpenAI error:',
        status,
        JSON.stringify(data)
      );
      throw err;
    }
  }

  // ============================================================================
  // Format Conversion (Internal)
  // ============================================================================

  /**
   * Convert our generic messages to OpenAI format
   *
   * OpenAI requires:
   * - Assistant messages with tool calls must have `tool_calls` array
   * - Tool result messages must have `tool_call_id` matching a previous tool call
   * - Tool calls arguments must be JSON strings (not objects)
   */
  private toOpenAIMessages(messages: ChatMessage[]): OpenAIMessage[] {
    return messages.map((msg) => {
      const openaiMsg: OpenAIMessage = {
        role: msg.role,
        content: msg.content,
      };

      // Handle assistant messages with tool calls
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        openaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: {
            name: tc.name,
            // OpenAI requires arguments as JSON string
            arguments: JSON.stringify(tc.arguments),
          },
        }));
      }

      // Handle tool result messages
      if (msg.role === 'tool' && msg.toolCallId) {
        openaiMsg.tool_call_id = msg.toolCallId;
      }

      return openaiMsg;
    });
  }

  /**
   * Convert our generic tool definitions to OpenAI format
   */
  private toOpenAITools(tools: ToolDefinition[]): OpenAITool[] {
    return tools.map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object' as const,
          properties: Object.fromEntries(
            Object.entries(tool.parameters.properties).map(([key, prop]) => [
              key,
              {
                type: prop.type,
                description: prop.description,
                ...(prop.enum && { enum: prop.enum }),
                ...(prop.items && { items: prop.items }),
              },
            ])
          ),
          required: tool.parameters.required,
        },
      },
    }));
  }

  /**
   * Parse OpenAI tool calls into our generic format
   */
  private parseToolCalls(
    openaiCalls?: OpenAIToolCall[]
  ): ToolCallRequest[] | undefined {
    if (!openaiCalls || openaiCalls.length === 0) {
      return undefined;
    }

    return openaiCalls.map((call) => {
      let args: Record<string, unknown> = {};

      try {
        args = JSON.parse(call.function.arguments);
      } catch (err) {
        console.warn(
          `[openai] Failed to parse tool call arguments: ${call.function.arguments}`
        );
      }

      return {
        id: call.id,
        name: call.function.name,
        arguments: args,
      };
    });
  }
}

// ============================================================================
// Future Provider Stubs
// ============================================================================

/**
 * Anthropic Runtime (placeholder for future implementation)
 */
export class AnthropicRuntime implements ToolCapableRuntime, EmbeddingRuntime {
  constructor(_config: CloudConfig) {
    throw new Error(
      'Anthropic provider is not yet implemented. Coming soon!'
    );
  }

  supportsTools(): boolean {
    return true;
  }

  async embed(_texts: string[]): Promise<Embedding[]> {
    throw new Error('Anthropic provider is not yet implemented.');
  }

  async chat(_messages: ChatMessage[]): Promise<ChatResponse> {
    throw new Error('Anthropic provider is not yet implemented.');
  }

  async chatWithTools(
    _messages: ChatMessage[],
    _tools?: ToolDefinition[]
  ): Promise<ChatResponse> {
    throw new Error('Anthropic provider is not yet implemented.');
  }
}

/**
 * Google Runtime (placeholder for future implementation)
 */
export class GoogleRuntime implements ToolCapableRuntime, EmbeddingRuntime {
  constructor(_config: CloudConfig) {
    throw new Error('Google provider is not yet implemented. Coming soon!');
  }

  supportsTools(): boolean {
    return true;
  }

  async embed(_texts: string[]): Promise<Embedding[]> {
    throw new Error('Google provider is not yet implemented.');
  }

  async chat(_messages: ChatMessage[]): Promise<ChatResponse> {
    throw new Error('Google provider is not yet implemented.');
  }

  async chatWithTools(
    _messages: ChatMessage[],
    _tools?: ToolDefinition[]
  ): Promise<ChatResponse> {
    throw new Error('Google provider is not yet implemented.');
  }
}
