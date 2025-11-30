/**
 * Local Model Client - Ollama Integration
 */

import axios from 'axios';
import {
  ChatMessage,
  ChatResponse,
  ModelRuntime,
  ProjectConfig,
} from '../brain/types';

export type Embedding = number[];

export interface EmbeddingRuntime {
  embed(texts: string[]): Promise<Embedding[]>;
}

export class OllamaRuntime implements ModelRuntime, EmbeddingRuntime {
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;

  constructor(config: ProjectConfig) {
    this.baseUrl = config.ollamaBaseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.embeddingModel = config.embeddingModel;
  }

  /**
   * Generate embeddings for texts
   * @deprecated Embeddings are optional in V0, graph traversal is primary
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
   * Chat with the model
   */
  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat`;

    try {
      const resp = await axios.post(url, {
        model: this.model,
        messages,
        stream: false,
      });

      const content = resp.data?.message?.content ?? '(no content from model)';
      return { content };
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
}
