/**
 * Context Types
 *
 * Defines the explicit contract for what gets sent to the model.
 */

import { ChatMessage } from '../brain/types';
import { AIDE_DEFAULTS } from '../core/config';

// ============================================================================
// AssembledContext - The ONLY thing sent to the model
// ============================================================================

export interface AssembledContext {
  /** System prompt (strategy-specific) */
  systemPrompt: string;

  /** Messages to send to the model */
  messages: ChatMessage[];

  /** Estimated token count for the entire context */
  tokenEstimate: number;

  /** Metadata about what was included */
  metadata: ContextMetadata;
}

export interface ContextMetadata {
  /** Which retrieval strategy was used */
  strategy: 'simple' | 'tools' | 'hybrid' | 'graph' | 'semantic';

  /** Number of symbols included */
  symbolCount: number;

  /** Number of blocks included */
  blockCount: number;

  /** Number of files referenced */
  fileCount: number;

  /** Number of relations included */
  relationCount: number;

  /** Whether context was truncated to fit budget */
  wasTruncated: boolean;
}

// ============================================================================
// System Prompts
// ============================================================================

export const SYSTEM_PROMPTS = {
  simple: `You are AIDE, a code assistant. You can ONLY see the code context provided below.

BEFORE ANSWERING - Think step by step:
1. First, list the FILES you see in <CONTEXT> (just the paths)
2. Then, list the SYMBOLS (functions, classes) you see
3. Check: Does any of this relate to the question?
4. If YES: Answer using ONLY what you listed above
5. If NO: Say "The context shows [X, Y, Z] but nothing about [question topic]"

STRICT RULES:
- ONLY mention files/symbols you listed in step 1-2
- NEVER invent names not in your list
- Always cite: file path + line numbers (e.g., src/foo.ts:42)
- If unsure, say what you DO see instead of guessing`,

  tools: `You are AIDE, a code assistant. You explored the codebase using tools.

BEFORE ANSWERING - Think step by step:
1. List what you actually found during exploration
2. Check if it answers the question
3. If YES: Answer with citations
4. If NO: Say what you found instead

STRICT RULES:
- ONLY report what you actually found
- NEVER invent names you didn't see
- Always cite exact file paths and line numbers`,

  hybrid: `You are AIDE, a code assistant. Context is provided below.

BEFORE ANSWERING - Think step by step:
1. List the files and symbols in the context
2. Check if they answer the question
3. Answer based ONLY on what you listed

STRICT RULES:
- ONLY use information from the context
- NEVER invent names not shown
- Always cite file paths and line numbers`,
} as const;

// ============================================================================
// Context Assembler Config
// ============================================================================

export interface ContextAssemblerConfig {
  /** Project root path for file references */
  projectRoot: string;

  /** Maximum tokens for context section */
  maxContextTokens: number;

  /** Include code content in context */
  includeCode: boolean;

  /** Include comments/docs in context */
  includeComments: boolean;

  /** Include relations in context */
  includeRelations: boolean;
}

export const DEFAULT_ASSEMBLER_CONFIG: ContextAssemblerConfig = {
  projectRoot: '',
  maxContextTokens: AIDE_DEFAULTS.tokenBudget,
  includeCode: true,
  includeComments: true,
  includeRelations: true,
};
