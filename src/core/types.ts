export type Embedding = number[];

export interface FileChunk {
  id: string;
  projectId: string;
  filePath: string; // relative to project root
  startLine: number;
  endLine: number;
  content: string;
  embedding?: Embedding;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
}

export interface VectorStore {
  upsert(chunks: FileChunk[]): Promise<void>;
  query(embedding: Embedding, k: number): Promise<FileChunk[]>;
}

export interface ModelRuntime {
  embed(texts: string[]): Promise<Embedding[]>;
  chat(messages: ChatMessage[]): Promise<ChatResponse>;
}

export interface ProjectConfig {
  id: string;
  rootPath: string;
  model: string; // main chat model (e.g. "llama3.2:3b")
  embeddingModel: string; // embedding model (e.g. "nomic-embed-text")
  ollamaBaseUrl: string; // e.g. "http://localhost:11434"
}
