/**
 * Brain module - exports all brain functionality
 */

export * from './types';
export * from './projectGraph';
export * from './sqliteStore';

// Note: ProjectBrainStore is deprecated, use ProjectGraph
// This alias is kept for backwards compatibility
export { ProjectGraph as ProjectBrainStore } from './projectGraph';
