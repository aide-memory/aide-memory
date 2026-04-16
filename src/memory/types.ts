export type MemoryLayer = 'preferences' | 'technical' | 'area_context' | 'guidelines';
export type MemorySource = 'conversation' | 'import' | 'agent_discovery' | 'elevated' | 'hook';

export interface GeneratedBy {
  tool: string | null;
  model: string | null;
  author_type: 'human' | 'ai';
}

/**
 * Full memory as returned from the store (includes SQLite-only cache fields).
 */
export interface Memory {
  id: number;               // SQLite row ID (cache-only, not stable across rebuilds)
  uuid: string;             // UUIDv4, primary identifier
  layer: MemoryLayer;
  what: string;
  why: string | null;
  scope: string | null;
  context_label: string | null;
  contributor: string;       // required, not nullable
  tags: string[];
  source: MemorySource;
  shared: boolean;
  priority?: 'always' | 'normal';
  generated_by: GeneratedBy | null;
  derived_from: string[] | null;  // UUIDs, not numbers
  created_at: string;
  updated_at: string;
  // SQLite-only cache fields (not persisted in JSON files)
  recalled_count: number;
  last_recalled_at: string | null;
}

/**
 * JSON file content — excludes SQLite-only cache fields (id, recalled_count, last_recalled_at).
 */
export interface MemoryFile {
  uuid: string;
  layer: MemoryLayer;
  what: string;
  why: string | null;
  scope: string | null;
  context_label: string | null;
  contributor: string;
  tags: string[];
  source: MemorySource;
  shared: boolean;
  priority?: 'always' | 'normal';
  generated_by: GeneratedBy | null;
  derived_from: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface CreateMemory {
  layer: MemoryLayer;
  what: string;
  why?: string;
  scope?: string;
  context_label?: string;
  contributor?: string;
  tags?: string[];
  source?: MemorySource;
  shared?: boolean;
  priority?: 'always' | 'normal';
  generated_by?: GeneratedBy;
  derived_from?: string[];   // UUIDs
}

export interface RecallQuery {
  paths?: string[];
  ids?: number[];
  query?: string;
  layers?: MemoryLayer[];
  contributor?: string;
  limit?: number;
}

export interface RecallResult {
  memories: Memory[];
  matched_scopes: string[];
}
