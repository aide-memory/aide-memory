/**
 * Context module - exports context assembly functionality
 */

// Types
export {
  AssembledContext,
  ContextMetadata,
  ContextAssemblerConfig,
  DEFAULT_ASSEMBLER_CONFIG,
  SYSTEM_PROMPTS,
} from './types';

// Context assembler
export {
  ContextAssembler,
  extractAnswerSummary,
  parseSuggestedNotes,
} from './assembler';
