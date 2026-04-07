export { MemoryStore } from './store';
export { recall, scopeMatchesPath } from './recall';
export { createServer, startServer } from './server';
export { ScopeResolver } from './scopes';
export {
  EmbeddingService,
  TransformersBackend,
  OllamaBackend,
  cosineSimilarity,
  ensureEmbeddingsTable,
} from './embeddings';
export type { EmbeddingBackend } from './embeddings';
export type { Memory, CreateMemory, MemoryLayer, MemoryStatus, MemorySource, RecallQuery, RecallResult } from './types';
export type { ScopeResolverOptions, ValidationResult } from './scopes';
