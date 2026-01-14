/**
 * Context Assembler
 *
 * Assembles context for LLM consumption.
 * Takes RetrievalResult and outputs AssembledContext.
 *
 * Features:
 * - Works with unified RetrievalResult from any strategy
 * - Minimal formatting - just structure the data
 * - Strategy-aware system prompts
 * - Token budget enforcement
 */

import {
  SessionState,
  ChatMessage,
  ContentBlock,
  SymbolRecord,
  FileRecord,
  Relation,
} from '../brain/types';
import { RetrievalResult } from '../retrieval/types';
import { TokenBudgetManager } from '../core/tokenBudget';
import {
  AssembledContext,
  ContextMetadata,
  ContextAssemblerConfig,
  DEFAULT_ASSEMBLER_CONFIG,
  SYSTEM_PROMPTS,
} from './types';

// ============================================================================
// ContextAssembler
// ============================================================================

export class ContextAssembler {
  private config: ContextAssemblerConfig;
  private budget: TokenBudgetManager;

  constructor(
    config: Partial<ContextAssemblerConfig> = {},
    budget?: TokenBudgetManager
  ) {
    this.config = { ...DEFAULT_ASSEMBLER_CONFIG, ...config };
    this.budget =
      budget || new TokenBudgetManager(this.config.maxContextTokens);
  }

  /**
   * Assemble context from retrieval result
   *
   * This is the main entry point. Takes:
   * - question: The user's question
   * - result: RetrievalResult from any strategy (simple/tools/hybrid)
   * - session: Optional session state for history
   *
   * Returns AssembledContext, which is the ONLY thing sent to the model.
   */
  assemble(
    question: string,
    result: RetrievalResult,
    session?: Readonly<SessionState>
  ): AssembledContext {
    // 1. Get system prompt based on strategy
    const systemPrompt = this.getSystemPrompt(result.strategy);
    let usedTokens = this.budget.estimate(systemPrompt);

    // 2. Format history (if available)
    const historyBudget = Math.floor(this.budget.available(usedTokens) * 0.3);
    const historyMessages = session
      ? this.formatHistory(session, historyBudget)
      : [];
    for (const msg of historyMessages) {
      usedTokens += this.budget.estimate(msg.content);
    }

    // 3. Format context from retrieval result
    const contextBudget = Math.floor(this.budget.available(usedTokens) * 0.9);
    const { contextContent, wasTruncated } = this.formatContext(
      result,
      contextBudget
    );
    usedTokens += this.budget.estimate(contextContent);

    // 4. Build final messages array
    const messages: ChatMessage[] = [
      { role: 'system', content: systemPrompt },
      ...historyMessages,
      {
        role: 'user',
        content: this.formatUserMessage(question, contextContent),
      },
    ];

    return {
      systemPrompt,
      messages,
      tokenEstimate: usedTokens + this.budget.estimate(question),
      metadata: {
        strategy: result.strategy,
        symbolCount: result.symbols.length,
        blockCount: result.blocks.length,
        fileCount: result.files.length,
        relationCount: result.relations.length,
        wasTruncated,
      },
    };
  }

  /**
   * Get system prompt based on strategy
   */
  private getSystemPrompt(strategy: 'simple' | 'tools' | 'hybrid'): string {
    return SYSTEM_PROMPTS[strategy];
  }

  /**
   * Format chat history
   */
  private formatHistory(
    session: Readonly<SessionState>,
    budget: number
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Add last few messages from history
    const history = session.chatHistory.slice(-6); // Last 3 exchanges
    let usedTokens = 0;

    for (const msg of history) {
      const tokens = this.budget.estimate(msg.content);
      if (usedTokens + tokens > budget) break;
      messages.push(msg);
      usedTokens += tokens;
    }

    return messages;
  }

  /**
   * Format retrieval result into context content
   */
  private formatContext(
    result: RetrievalResult,
    budget: number
  ): { contextContent: string; wasTruncated: boolean } {
    const sections: string[] = [];
    let usedTokens = 0;
    let wasTruncated = false;

    // Group blocks by file for better readability
    const blocksByFile = this.groupBlocksByFile(result.blocks, result.files);

    // Format each file's content
    for (const [fileId, fileData] of blocksByFile) {
      const fileSection = this.formatFileSection(
        fileData.file,
        fileData.blocks
      );
      const sectionTokens = this.budget.estimate(fileSection);

      if (usedTokens + sectionTokens > budget) {
        wasTruncated = true;
        // Try to fit a truncated version
        const truncated = this.budget.truncate(
          fileSection,
          budget - usedTokens
        );
        if (truncated.length > 100) {
          sections.push(truncated);
        }
        break;
      }

      sections.push(fileSection);
      usedTokens += sectionTokens;
    }

    // Add relations section if space allows
    if (result.relations.length > 0 && usedTokens < budget * 0.9) {
      const relationsSection = this.formatRelationsSection(
        result.relations,
        result.symbols
      );
      const relTokens = this.budget.estimate(relationsSection);
      if (usedTokens + relTokens <= budget) {
        sections.push(relationsSection);
      }
    }

    return {
      contextContent: sections.join('\n\n---\n\n'),
      wasTruncated,
    };
  }

  /**
   * Group blocks by file
   */
  private groupBlocksByFile(
    blocks: ContentBlock[],
    files: FileRecord[]
  ): Map<string, { file: FileRecord; blocks: ContentBlock[] }> {
    const fileMap = new Map<string, FileRecord>();
    for (const file of files) {
      fileMap.set(file.id, file);
    }

    const grouped = new Map<
      string,
      { file: FileRecord; blocks: ContentBlock[] }
    >();

    for (const block of blocks) {
      const file = fileMap.get(block.fileId);
      if (!file) continue;

      if (!grouped.has(block.fileId)) {
        grouped.set(block.fileId, { file, blocks: [] });
      }
      grouped.get(block.fileId)!.blocks.push(block);
    }

    // Sort blocks within each file by line number
    for (const data of grouped.values()) {
      data.blocks.sort((a, b) => a.startLine - b.startLine);
    }

    return grouped;
  }

  /**
   * Format a file section with its blocks
   */
  private formatFileSection(file: FileRecord, blocks: ContentBlock[]): string {
    const lines: string[] = [];

    lines.push(`## ${file.path}`);
    lines.push('');

    for (const block of blocks) {
      // Skip chunks - only show full blocks
      if (block.isChunk) continue;

      const header = this.formatBlockHeader(block);
      lines.push(header);

      // Add code fence with content
      lines.push('```' + (file.language || ''));
      lines.push(block.content);
      lines.push('```');
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format a block header
   */
  private formatBlockHeader(block: ContentBlock): string {
    const kindLabel = block.kind.charAt(0).toUpperCase() + block.kind.slice(1);
    const lineRange = `L${block.startLine}-${block.endLine}`;

    if (block.signature) {
      return `### ${kindLabel}: \`${block.signature}\` (${lineRange})`;
    }

    return `### ${kindLabel} (${lineRange})`;
  }

  /**
   * Format relations section
   */
  private formatRelationsSection(
    relations: Relation[],
    symbols: SymbolRecord[]
  ): string {
    const lines: string[] = [];
    const symbolMap = new Map<string, SymbolRecord>();
    for (const sym of symbols) {
      symbolMap.set(sym.id, sym);
    }

    lines.push('## Relationships');
    lines.push('');

    // Group by relation type
    const byKind = new Map<string, Relation[]>();
    for (const rel of relations) {
      if (!byKind.has(rel.kind)) {
        byKind.set(rel.kind, []);
      }
      byKind.get(rel.kind)!.push(rel);
    }

    for (const [kind, rels] of byKind) {
      lines.push(`### ${kind}`);
      for (const rel of rels.slice(0, 10)) {
        const source = symbolMap.get(rel.sourceSymbolId);
        const target = symbolMap.get(rel.targetSymbolId);
        if (source && target) {
          lines.push(`- \`${source.name}\` → \`${target.name}\``);
        }
      }
      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Format the user message with context
   */
  private formatUserMessage(question: string, contextContent: string): string {
    if (!contextContent) {
      return question;
    }

    return `<CONTEXT>
${contextContent}
</CONTEXT>

${question}`;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Extract a brief summary from a model response
 */
export function extractAnswerSummary(
  response: string,
  maxLength: number = 200
): string {
  // Take the first paragraph or sentence
  const firstParagraph = response.split(/\n\n/)[0];
  const firstSentence = firstParagraph.split(/[.!?]/)[0];

  let summary = firstSentence.length < 100 ? firstParagraph : firstSentence;

  if (summary.length > maxLength) {
    summary = summary.slice(0, maxLength - 3) + '...';
  }

  return summary.trim();
}

/**
 * Parse suggested notes from model response
 */
export function parseSuggestedNotes(
  response: string
): Array<{ target: string; content: string }> {
  const notes: Array<{ target: string; content: string }> = [];

  const notesMatch = response.match(/SUGGESTED_NOTES:\s*([\s\S]*?)(?:\n\n|$)/);
  if (!notesMatch) return notes;

  const notesSection = notesMatch[1];
  const notePattern = /^-\s*\[([^\]]+)\]\s*(.+)$/gm;

  let match;
  while ((match = notePattern.exec(notesSection)) !== null) {
    notes.push({
      target: match[1].trim(),
      content: match[2].trim(),
    });
  }

  return notes;
}
