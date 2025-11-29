import axios from 'axios';
import {
  ChatMessage,
  ChatResponse,
  Embedding,
  ModelRuntime,
  ProjectConfig,
} from '../core/types';

export class OllamaRuntime implements ModelRuntime {
  private baseUrl: string;
  private model: string;
  private embeddingModel: string;

  constructor(config: ProjectConfig) {
    this.baseUrl = config.ollamaBaseUrl.replace(/\/$/, '');
    this.model = config.model;
    this.embeddingModel = config.embeddingModel;
  }

  async embed(texts: string[]): Promise<Embedding[]> {
    const url = `${this.baseUrl}/embed`; // http://localhost:11434/api/embed

    const embeddings: Embedding[] = [];

    for (const text of texts) {
      try {
        const resp = await axios.post(url, {
          model: this.embeddingModel,
          input: text, // single string
        });

        const vec = resp.data?.embeddings?.[0] as Embedding | undefined;

        if (!vec) {
          throw new Error('No embedding returned from Ollama');
        }

        embeddings.push(vec);
      } catch (err: any) {
        // Log the actual Ollama error body so we can debug if needed
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

  async chat(messages: ChatMessage[]): Promise<ChatResponse> {
    const url = `${this.baseUrl}/chat`;

    const resp = await axios.post(url, {
      model: this.model,
      messages,
      stream: false, // disable streaming for simpler handling
    });

    const content = resp.data?.message?.content ?? '(no content from model)';
    return { content };
  }
}
