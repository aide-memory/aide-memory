/**
 * TokenBudgetManager
 *
 * Simple, unified token budget enforcement.
 * Applied to: system prompt, history, context, tool results.
 */

// ============================================================================
// TokenBudgetManager
// ============================================================================

export class TokenBudgetManager {
  private modelLimit: number;
  private reservedForResponse: number;

  constructor(modelLimit: number, reservedForResponse: number = 500) {
    this.modelLimit = modelLimit;
    this.reservedForResponse = reservedForResponse;
  }

  /**
   * Estimate token count for text (~4 chars per token)
   */
  estimate(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Get available tokens after current usage
   */
  available(usedTokens: number): number {
    return Math.max(0, this.modelLimit - usedTokens - this.reservedForResponse);
  }

  /**
   * Get the model's total limit
   */
  getLimit(): number {
    return this.modelLimit;
  }

  /**
   * Truncate content to fit within a token budget
   */
  truncate(content: string, maxTokens: number): string {
    const currentTokens = this.estimate(content);
    if (currentTokens <= maxTokens) {
      return content;
    }

    // Truncate to fit (rough: 4 chars per token)
    const maxChars = maxTokens * 4;
    const truncated = content.slice(0, maxChars);

    // Try to truncate at a line boundary
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.8) {
      return truncated.slice(0, lastNewline) + '\n[...truncated]';
    }

    return truncated + '\n[...truncated]';
  }

  /**
   * Split content into a portion that fits and overflow
   */
  split(content: string, maxTokens: number): { fits: string; overflow: string } {
    const currentTokens = this.estimate(content);
    if (currentTokens <= maxTokens) {
      return { fits: content, overflow: '' };
    }

    const maxChars = maxTokens * 4;
    const truncated = content.slice(0, maxChars);

    // Try to split at a line boundary
    const lastNewline = truncated.lastIndexOf('\n');
    if (lastNewline > maxChars * 0.5) {
      return {
        fits: truncated.slice(0, lastNewline),
        overflow: content.slice(lastNewline + 1),
      };
    }

    return {
      fits: truncated,
      overflow: content.slice(maxChars),
    };
  }

  /**
   * Check if content fits within budget
   */
  fits(content: string, maxTokens: number): boolean {
    return this.estimate(content) <= maxTokens;
  }

  /**
   * Calculate budget allocation for different components
   */
  allocate(usedTokens: number): BudgetAllocation {
    const available = this.available(usedTokens);

    return {
      total: this.modelLimit,
      used: usedTokens,
      available,
      // Suggested allocations
      history: Math.floor(available * 0.3), // 30% for history
      context: Math.floor(available * 0.65), // 65% for context
      question: Math.floor(available * 0.05), // 5% for question
    };
  }
}

// ============================================================================
// Types
// ============================================================================

export interface BudgetAllocation {
  total: number;
  used: number;
  available: number;
  history: number;
  context: number;
  question: number;
}

// ============================================================================
// Default Instances
// ============================================================================

/**
 * Common model context sizes
 */
export const MODEL_CONTEXT_SIZES: Record<string, number> = {
  // OpenAI
  'gpt-4': 8192,
  'gpt-4-turbo': 128000,
  'gpt-4o': 128000,
  'gpt-3.5-turbo': 16385,

  // Anthropic
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,

  // Ollama/Local
  'llama3': 8192,
  'llama3.1': 128000,
  'mistral': 32768,
  'codellama': 16384,
  'deepseek-coder': 16384,
  'qwen2.5-coder': 32768,

  // Default fallback
  default: 8192,
};

/**
 * Get context size for a model
 */
export function getModelContextSize(model: string): number {
  // Try exact match first
  if (MODEL_CONTEXT_SIZES[model]) {
    return MODEL_CONTEXT_SIZES[model];
  }

  // Try prefix match
  for (const [key, size] of Object.entries(MODEL_CONTEXT_SIZES)) {
    if (model.toLowerCase().startsWith(key.toLowerCase())) {
      return size;
    }
  }

  return MODEL_CONTEXT_SIZES.default;
}

/**
 * Create a budget manager for a specific model
 */
export function createBudgetManager(model: string): TokenBudgetManager {
  const contextSize = getModelContextSize(model);
  return new TokenBudgetManager(contextSize);
}

