export { MemoryStore } from './store';
export { Analytics } from './analytics';
export { recall, scopeMatchesPath } from './recall';
export { createServer, startServer } from './server';
export { ScopeResolver } from './scopes';
export { AideConfig } from './config';
export { initProject, detectContributor } from './init';
export { scanProject } from './scan';
export { MemorySync } from './sync';
export {
  EmbeddingService,
  TransformersBackend,
  OllamaBackend,
  cosineSimilarity,
  ensureEmbeddingsTable,
} from './embeddings';
export type { EmbeddingBackend } from './embeddings';
export type { AideConfigData } from './config';
export type { SyncResult, SyncConflict } from './sync';
export type { Memory, MemoryFile, CreateMemory, MemoryLayer, MemorySource, GeneratedBy, RecallQuery, RecallResult } from './types';
export type { AnalyticsEvent, MemoryStats } from './analytics';
export type { ScopeResolverOptions, ValidationResult } from './scopes';
export type { InitResult, InitOptions } from './init';
export type { ScannedMemory } from './scan';
