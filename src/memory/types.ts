export type MemoryLayer = 'preferences' | 'technical' | 'area_context' | 'guidelines';
export type MemoryStatus = 'active' | 'completed' | 'archived';
export type MemorySource = 'conversation' | 'import' | 'agent_discovery' | 'elevated';

export interface Memory {
  id: number;
  layer: MemoryLayer;
  what: string;
  why: string | null;
  scope: string | null;
  context_label: string | null;
  contributor: string | null;
  status: MemoryStatus;
  source: MemorySource;
  derived_from: number[] | null;
  created_at: string;
  recalled_count: number;
  last_recalled_at: string | null;
}

export interface CreateMemory {
  layer: MemoryLayer;
  what: string;
  why?: string;
  scope?: string;
  context_label?: string;
  contributor?: string;
  source?: MemorySource;
  derived_from?: number[];
}

export interface RecallQuery {
  paths?: string[];
  query?: string;
  layers?: MemoryLayer[];
  limit?: number;
}

export interface RecallResult {
  memories: Memory[];
  matched_scopes: string[];
}
