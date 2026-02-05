/**
 * Local Model Client - Ollama Integration
 *
 * Implements ToolCapableRuntime for Ollama models that support tool calling.
 * Models with tool support: llama3.1, llama3.2, qwen2.5, mistral, mixtral
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

export interface OllamaConfig {
  model: string;
  baseUrl: string;
  embeddingModel?: string;
}

// ============================================================================
// Ollama-Specific Types (internal)
// ============================================================================

interface OllamaMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaTool {
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
        }
      >;
      required?: string[];
    };
  };
}

interface OllamaChatResponse {
  message: {
    role: string;
    content: string;
    tool_calls?: OllamaToolCall[];
  };
}

// ============================================================================
// OllamaRuntime
// ============================================================================

export class OllamaRuntime implements ToolCapableRuntime, EmbeddingRuntime {
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;

  constructor(config: OllamaConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.embeddingModel = config.embeddingModel ?? 'all-minilm:latest';
  }

  /**
   * Check if this runtime supports tool calling
   */
  supportsTools(): boolean {
    // Most modern Ollama models support tools
    // This could be made configurable or auto-detected
    return true;
  }

  /**
   * Generate embeddings for texts
   */
  async embed(texts: string[]): Promise<Embedding[]> {
    const url = `${this.baseUrl}/embed`;

    const embeddings: Embedding[] = [];

    for (const text of texts) {
      try {
        const resp = await axios.post(url, {
          model: this.embeddingModel,
          input: text,
        });

        const vec = resp.data?.embeddings?.[0] as Embedding | undefined;

        if (!vec) {
          throw new Error('No embedding returned from Ollama');
        }

        embeddings.push(vec);
      } catch (err: any) {
        const status = err.response?.status;
        const data = err.response?.data;
        console.error(
          '[aide:embed] Ollama error:',
          status,
          JSON.stringify(data)
        );
        throw err;
      }
    }

    if (embeddings.length !== texts.length) {
      throw new Error(
        `Expected ${texts.length} embeddings, got ${embeddings.length}`
      );
    }

    return embeddings;
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
    const url = `${this.baseUrl}/chat`;

    try {
      const ollamaMessages = this.toOllamaMessages(messages);
      const ollamaTools = tools ? this.toOllamaTools(tools) : undefined;

      const payload: Record<string, unknown> = {
        model: this.model,
        messages: ollamaMessages,
        stream: false,
      };

      if (ollamaTools && ollamaTools.length > 0) {
        payload.tools = ollamaTools;
      }

      const resp = await axios.post<OllamaChatResponse>(url, payload);

      const message = resp.data?.message;
      const content = message?.content ?? '';

      // Debug: log raw Ollama response (enable with AIDE_DEBUG=1)
      if (process.env.AIDE_DEBUG) {
        console.log('[ollama:debug] Raw response message:', {
          role: message?.role,
          contentLength: content?.length,
          hasToolCalls: !!message?.tool_calls,
          toolCallsCount: message?.tool_calls?.length ?? 0,
          rawToolCalls: message?.tool_calls,
        });
      }

      // Try to get tool calls from structured response first
      let toolCalls = this.parseToolCalls(message?.tool_calls);

      // Fallback: parse tool calls from text content if model doesn't use native format
      if ((!toolCalls || toolCalls.length === 0) && content && tools) {
        const textParsed = this.parseToolCallsFromText(content);
        if (textParsed && textParsed.length > 0) {
          if (process.env.AIDE_DEBUG) {
            console.log(
              '[ollama:debug] Parsed tool calls from text:',
              textParsed.map((t) => t.name)
            );
          }
          toolCalls = textParsed;
        }
      }

      return { content, toolCalls };
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;

      if (status === 404) {
        throw new Error(
          `Model '${this.model}' not found. Run 'ollama pull ${this.model}' first.`
        );
      }

      console.error('[aide:chat] Ollama error:', status, JSON.stringify(data));
      throw err;
    }
  }

  // ============================================================================
  // Format Conversion (Internal)
  // ============================================================================

  /**
   * Convert our generic messages to Ollama format
   *
   * Ollama format is similar to OpenAI but:
   * - Arguments are objects (not JSON strings)
   * - Tool calls don't have IDs (uses function name/args for matching)
   */
  private toOllamaMessages(messages: ChatMessage[]): OllamaMessage[] {
    return messages.map((msg) => {
      const ollamaMsg: OllamaMessage = {
        role: msg.role,
        content: msg.content,
      };

      // Handle assistant messages with tool calls
      if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
        ollamaMsg.tool_calls = msg.toolCalls.map((tc) => ({
          function: {
            name: tc.name,
            arguments: tc.arguments,
          },
        }));
      }

      return ollamaMsg;
    });
  }

  /**
   * Convert our generic tool definitions to Ollama format
   */
  private toOllamaTools(tools: ToolDefinition[]): OllamaTool[] {
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
              },
            ])
          ),
          required: tool.parameters.required,
        },
      },
    }));
  }

  /**
   * Parse Ollama tool calls into our generic format
   */
  private parseToolCalls(
    ollamaCalls?: OllamaToolCall[]
  ): ToolCallRequest[] | undefined {
    if (!ollamaCalls || ollamaCalls.length === 0) {
      return undefined;
    }

    return ollamaCalls.map((call, index) => ({
      id: `call_${index}_${Date.now()}`,
      name: call.function.name,
      arguments: call.function.arguments,
    }));
  }

  /**
   * Parse tool calls from text content (fallback for models without native tool support)
   *
   * Handles various formats:
   * - <function=name><parameter=key>value</parameter></function>
   * - <tool_call>{"name": "...", "arguments": {...}}</tool_call>
   * - ```json\n{"name": "...", "arguments": {...}}\n```
   */
  private parseToolCallsFromText(
    content: string
  ): ToolCallRequest[] | undefined {
    const calls: ToolCallRequest[] = [];

    // Format 1: <function=name><parameter=key>value</parameter></function>
    const functionPattern = /<function=(\w+)>([\s\S]*?)<\/function>/g;
    let match;

    while ((match = functionPattern.exec(content)) !== null) {
      const name = match[1];
      const paramsContent = match[2];

      // Parse parameters
      const args: Record<string, unknown> = {};
      const paramPattern = /<parameter=(\w+)>\s*([\s\S]*?)\s*<\/parameter>/g;
      let paramMatch;

      while ((paramMatch = paramPattern.exec(paramsContent)) !== null) {
        const paramName = paramMatch[1];
        let paramValue: unknown = paramMatch[2].trim();

        // Try to parse as JSON if it looks like JSON
        if (
          (paramValue as string).startsWith('{') ||
          (paramValue as string).startsWith('[')
        ) {
          try {
            paramValue = JSON.parse(paramValue as string);
          } catch {
            // Keep as string
          }
        }

        args[paramName] = paramValue;
      }

      calls.push({
        id: `text_call_${calls.length}_${Date.now()}`,
        name,
        arguments: args,
      });
    }

    // Format 2: <tool_call>{"name": "...", "arguments": {...}}</tool_call>
    const toolCallPattern = /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g;
    while ((match = toolCallPattern.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.name) {
          calls.push({
            id: `text_call_${calls.length}_${Date.now()}`,
            name: parsed.name,
            arguments: parsed.arguments || {},
          });
        }
      } catch {
        // Skip malformed JSON
      }
    }

    // Format 3: JSON code block with tool call
    const jsonBlockPattern =
      /```(?:json)?\s*(\{[\s\S]*?"name"\s*:\s*"[\s\S]*?\})\s*```/g;
    while ((match = jsonBlockPattern.exec(content)) !== null) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed.name && !calls.some((c) => c.name === parsed.name)) {
          calls.push({
            id: `text_call_${calls.length}_${Date.now()}`,
            name: parsed.name,
            arguments: parsed.arguments || {},
          });
        }
      } catch {
        // Skip malformed JSON
      }
    }

    return calls.length > 0 ? calls : undefined;
  }
}
