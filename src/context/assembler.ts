/**
 * Context Assembler
 *
 * Builds LLM prompts from code slices, session state, and notes.
 */

import fs from 'fs';
import path from 'path';
import {
  CodeSlice,
  SymbolRecord,
  FileRecord,
  Note,
  ChatMessage,
  SessionState,
} from '../brain/types';

export interface ContextAssemblerConfig {
  /** Project root path for reading file contents */
  projectRoot: string;

  /** Maximum tokens for the context section */
  maxContextTokens: number;

  /** Include doc comments in context */
  includeDocComments: boolean;

  /** Include notes in context */
  includeNotes: boolean;
}

const DEFAULT_CONFIG: ContextAssemblerConfig = {
  projectRoot: '',
  maxContextTokens: 4000,
  includeDocComments: true,
  includeNotes: true,
};

export interface AssembledContext {
  systemMessage: ChatMessage;
  contextSummary: string;
  symbolCount: number;
  fileCount: number;
  estimatedTokens: number;
}

export class ContextAssembler {
  private config: ContextAssemblerConfig;

  constructor(config: Partial<ContextAssemblerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Assemble a complete LLM context from a code slice
   */
  assemble(
    question: string,
    slice: CodeSlice,
    session?: Readonly<SessionState>
  ): AssembledContext {
    const sections: string[] = [];
    let totalTokens = 0;

    // Build the context sections
    const centralSection = this.buildSymbolSection(
      'Central Symbols',
      slice.central,
      slice.files
    );
    const callersSection = this.buildCallersSection(
      'Callers (symbols that call central)',
      slice.callers,
      slice.central,
      slice.files
    );
    const calleesSection = this.buildSymbolSection(
      'Callees (symbols called by central)',
      slice.callees,
      slice.files
    );
    const testsSection = this.buildSymbolSection(
      'Related Tests',
      slice.tests,
      slice.files
    );
    const configsSection = this.buildConfigSection(slice.configs);
    const notesSection = this.config.includeNotes
      ? this.buildNotesSection(slice.notes)
      : '';

    // Add sections in priority order
    if (centralSection) {
      sections.push(centralSection);
      totalTokens += this.estimateTokens(centralSection);
    }

    if (callersSection && totalTokens < this.config.maxContextTokens) {
      sections.push(callersSection);
      totalTokens += this.estimateTokens(callersSection);
    }

    if (calleesSection && totalTokens < this.config.maxContextTokens) {
      sections.push(calleesSection);
      totalTokens += this.estimateTokens(calleesSection);
    }

    if (testsSection && totalTokens < this.config.maxContextTokens) {
      sections.push(testsSection);
      totalTokens += this.estimateTokens(testsSection);
    }

    if (configsSection && totalTokens < this.config.maxContextTokens) {
      sections.push(configsSection);
      totalTokens += this.estimateTokens(configsSection);
    }

    if (notesSection && totalTokens < this.config.maxContextTokens) {
      sections.push(notesSection);
      totalTokens += this.estimateTokens(notesSection);
    }

    // Build session context if available
    let sessionContext = '';
    if (session) {
      sessionContext = this.buildSessionContext(session);
      if (sessionContext) {
        sections.push(sessionContext);
        totalTokens += this.estimateTokens(sessionContext);
      }
    }

    const contextText = sections.join('\n\n---\n\n');

    const systemContent = this.buildSystemMessage(contextText, question);

    return {
      systemMessage: {
        role: 'system',
        content: systemContent,
      },
      contextSummary: this.buildContextSummary(slice),
      symbolCount:
        slice.central.length +
        slice.callers.length +
        slice.callees.length +
        slice.tests.length,
      fileCount: slice.files.size,
      estimatedTokens: totalTokens + this.estimateTokens(systemContent),
    };
  }

  /**
   * Build a section for a list of symbols with their code
   */
  private buildSymbolSection(
    title: string,
    symbols: SymbolRecord[],
    files?: Map<string, FileRecord>
  ): string {
    if (symbols.length === 0) return '';

    const parts: string[] = [`## ${title}`];

    // Track which files we've shown imports for
    const shownImportsFor = new Set<string>();

    for (const sym of symbols) {
      const file = files?.get(sym.fileId);
      const filePath = file?.path ?? sym.fileId;
      const code = this.getSymbolCode(sym, file);
      const header = `${sym.kind} \`${sym.name}\` (${filePath}:${sym.startLine}-${sym.endLine})`;

      parts.push(`### ${header}`);

      // Show file imports once per file to clarify actual dependencies
      if (file && !shownImportsFor.has(sym.fileId)) {
        const imports = this.getFileImports(file);
        if (imports) {
          parts.push(`*Imports: ${imports}*`);
        }
        shownImportsFor.add(sym.fileId);
      }

      if (sym.docComment && this.config.includeDocComments) {
        parts.push(`/**\n${sym.docComment}\n*/`);
      }
      if (code) {
        parts.push('```' + (file?.language ?? 'typescript'));
        parts.push(code);
        parts.push('```');
      } else if (sym.signature) {
        parts.push(`\`${sym.signature}\``);
      }
    }

    return parts.join('\n');
  }

  /**
   * Build a section for callers, showing the specific usage location
   */
  private buildCallersSection(
    title: string,
    callers: SymbolRecord[],
    centralSymbols: SymbolRecord[],
    files?: Map<string, FileRecord>
  ): string {
    if (callers.length === 0) return '';

    const parts: string[] = [
      `## ${title}`,
      '*Note: Verify actual usage by checking if the file imports the target module.*',
      '',
    ];

    // Get central symbol names to search for
    const centralNames = new Set(
      centralSymbols.map((s) => {
        // Handle class.method names - search for both full name and just method
        const nameParts = s.name.split('.');
        return nameParts[nameParts.length - 1]; // Just the method/function name
      })
    );

    // Also get the module names that central symbols come from
    const centralModules = new Set<string>();
    for (const sym of centralSymbols) {
      const file = files?.get(sym.fileId);
      if (file) {
        // Get module name from file path (e.g., "assembler" from "context/assembler.ts")
        const moduleName = file.path
          .split('/')
          .pop()
          ?.replace(/\.[^.]+$/, '');
        if (moduleName) centralModules.add(moduleName);
      }
    }

    let validCallerCount = 0;

    for (const caller of callers) {
      const file = files?.get(caller.fileId);
      const filePath = file?.path ?? caller.fileId;

      // Check if this file actually imports the central modules
      let actuallyImports = false;
      let imports: string | null = null;

      if (file) {
        imports = this.getFileImports(file);
        if (imports) {
          const importsArray = imports.split(', ');
          actuallyImports = importsArray.some((imp) =>
            [...centralModules].some((mod) =>
              imp.toLowerCase().includes(mod.toLowerCase())
            )
          );
        }
      }

      // SKIP callers that don't actually import the central modules - these are false positives
      if (!actuallyImports) {
        continue;
      }

      validCallerCount++;
      const header = `${caller.kind} \`${caller.name}\` (${filePath}:${caller.startLine}-${caller.endLine})`;

      parts.push(`### ${header}`);
      parts.push(`**Imports:** ${imports} ✓`);

      // Find and show the specific usage location
      const usageSnippet = this.findUsageInSymbol(caller, centralNames, file);
      if (usageSnippet) {
        parts.push('```' + (file?.language ?? 'typescript'));
        parts.push(usageSnippet);
        parts.push('```');
      } else if (caller.signature) {
        parts.push(`\`${caller.signature}\``);
      }
    }

    // If no valid callers after filtering, return empty
    if (validCallerCount === 0) {
      return '';
    }

    return parts.join('\n');
  }

  /**
   * Find where central symbols are used within a caller's code
   */
  private findUsageInSymbol(
    caller: SymbolRecord,
    targetNames: Set<string>,
    file?: FileRecord
  ): string | null {
    if (!file || !this.config.projectRoot) return null;

    try {
      const fullPath = path.join(this.config.projectRoot, file.path);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      const startIdx = Math.max(0, caller.startLine - 1);
      const endIdx = Math.min(lines.length, caller.endLine);
      const symbolLines = lines.slice(startIdx, endIdx);

      // Find lines that contain any target name
      const usageLines: { lineNum: number; content: string }[] = [];
      for (let i = 0; i < symbolLines.length; i++) {
        const line = symbolLines[i];
        for (const name of targetNames) {
          // Look for actual usage (not just in comments)
          if (line.includes(name) && !line.trim().startsWith('//')) {
            usageLines.push({
              lineNum: caller.startLine + i,
              content: line,
            });
            break;
          }
        }
      }

      if (usageLines.length === 0) return null;

      // Build snippet with context around usage lines
      const snippetParts: string[] = [];

      // Show function signature first (first 2-3 lines)
      const sigLines = symbolLines.slice(0, Math.min(3, symbolLines.length));
      snippetParts.push(...sigLines);

      // If usage is not in the first few lines, add indicator
      const firstUsage = usageLines[0];
      const firstUsageLocalIdx = firstUsage.lineNum - caller.startLine;
      if (firstUsageLocalIdx > 3) {
        snippetParts.push('  // ...');
      }

      // Show each usage with 1 line of context
      for (const usage of usageLines.slice(0, 3)) {
        // max 3 usages
        const localIdx = usage.lineNum - caller.startLine;

        // Add context line before if not already shown
        if (localIdx > 0 && localIdx > 4) {
          const prevLine = symbolLines[localIdx - 1];
          if (prevLine && !snippetParts.includes(prevLine)) {
            snippetParts.push(prevLine);
          }
        }

        // Add the usage line with line number annotation
        if (!snippetParts.includes(usage.content)) {
          snippetParts.push(usage.content + ` // <- line ${usage.lineNum}`);
        }
      }

      // Add closing indicator if function is long
      if (caller.endLine - caller.startLine > 10) {
        snippetParts.push('  // ...');
        snippetParts.push('}');
      }

      return snippetParts.join('\n');
    } catch {
      return null;
    }
  }

  /**
   * Extract import statements from a file for context clarity
   */
  private getFileImports(file: FileRecord): string | null {
    if (!this.config.projectRoot) return null;

    try {
      const fullPath = path.join(this.config.projectRoot, file.path);
      const content = fs.readFileSync(fullPath, 'utf8');

      // Get the first ~50 lines (import section)
      const importSection = content.split('\n').slice(0, 50).join('\n');

      // Find all "from 'module'" patterns (handles multi-line imports)
      const imports: string[] = [];
      const fromPattern = /from\s+['"]([^'"]+)['"]/g;
      let match;

      while ((match = fromPattern.exec(importSection)) !== null) {
        const modulePath = match[1];
        // Simplify path to just the module name
        const moduleName = modulePath.split('/').pop() || modulePath;
        if (!imports.includes(moduleName)) {
          imports.push(moduleName);
        }
      }

      if (imports.length === 0) return null;
      return imports.join(', ');
    } catch {
      return null;
    }
  }

  /**
   * Build a section for config files
   */
  private buildConfigSection(configs: FileRecord[]): string {
    if (configs.length === 0) return '';

    const parts: string[] = ['## Configuration Files'];

    for (const config of configs) {
      parts.push(`### ${config.path}`);
      const content = this.getFileContent(config);
      if (content) {
        // Truncate large config files
        const truncated =
          content.length > 1000
            ? content.slice(0, 1000) + '\n... (truncated)'
            : content;
        parts.push('```' + config.language);
        parts.push(truncated);
        parts.push('```');
      }
    }

    return parts.join('\n');
  }

  /**
   * Build a section for notes
   */
  private buildNotesSection(notes: Note[]): string {
    if (notes.length === 0) return '';

    const parts: string[] = ['## Notes'];

    for (const note of notes) {
      const source = note.source.toUpperCase();
      parts.push(`- [${source}] ${note.content}`);
    }

    return parts.join('\n');
  }

  /**
   * Build session context (last Q/A, focus info)
   */
  private buildSessionContext(session: Readonly<SessionState>): string {
    const parts: string[] = [];

    if (session.lastQuestion) {
      parts.push('## Conversation Context');
      parts.push('');
      parts.push(
        'IMPORTANT: If the current question uses pronouns like "it", "this", "that", "they", ' +
          'or refers to something mentioned before, resolve them using this context:'
      );
      parts.push('');
      parts.push(`**Previous Question:** "${session.lastQuestion}"`);

      if (session.lastAnswerSummary) {
        parts.push(`**Previous Answer Summary:** ${session.lastAnswerSummary}`);
      }
      parts.push('');
    }

    if (session.focusSymbolIds.length > 0) {
      parts.push(
        `**Current Topic:** The conversation is focused on ${session.focusSymbolIds.length} symbol(s) from the previous discussion.`
      );
    }

    return parts.join('\n');
  }

  /**
   * Build the complete system message
   */
  private buildSystemMessage(contextText: string, question: string): string {
    return [
      'You are AIDE, a local code assistant with deep understanding of the project.',
      '',
      'IMPORTANT RULES:',
      '1. Use ONLY the project code and information provided inside <CONTEXT>...</CONTEXT>.',
      '2. If the question uses pronouns like "it", "this", "that", check the "Conversation Context" section to understand what they refer to.',
      '3. If the answer is not in the context, say "I don\'t see that in the project context."',
      '4. CRITICAL: Only report actual usage if a file\'s "Imports:" line includes the target module. Comments containing similar words are NOT real usage.',
      '',
      'When referencing code:',
      '- Cite specific file paths and line numbers when relevant',
      '- Check the "Imports:" line to verify actual dependencies before claiming usage',
      '- Explain how pieces connect (calls, imports, tests)',
      '- Suggest related symbols the user might want to explore',
      '',
      '<CONTEXT>',
      contextText || '[No relevant context found]',
      '</CONTEXT>',
    ].join('\n');
  }

  /**
   * Build a human-readable summary of the context
   */
  private buildContextSummary(slice: CodeSlice): string {
    const parts: string[] = [];

    if (slice.central.length > 0) {
      parts.push(`${slice.central.length} central symbol(s)`);
    }
    if (slice.callers.length > 0) {
      parts.push(`${slice.callers.length} caller(s)`);
    }
    if (slice.callees.length > 0) {
      parts.push(`${slice.callees.length} callee(s)`);
    }
    if (slice.tests.length > 0) {
      parts.push(`${slice.tests.length} test(s)`);
    }
    if (slice.notes.length > 0) {
      parts.push(`${slice.notes.length} note(s)`);
    }

    return parts.length > 0 ? parts.join(', ') : 'No context found';
  }

  /**
   * Get the actual code content for a symbol
   */
  private getSymbolCode(sym: SymbolRecord, file?: FileRecord): string | null {
    if (!this.config.projectRoot || !file) return null;

    try {
      const fullPath = path.join(this.config.projectRoot, file.path);
      const content = fs.readFileSync(fullPath, 'utf8');
      const lines = content.split('\n');

      // Include a few lines before the symbol to capture comments, TODOs, decorators
      const contextLinesBefore = 5;
      const contextStartIdx = Math.max(
        0,
        sym.startLine - 1 - contextLinesBefore
      );
      const startIdx = Math.max(0, sym.startLine - 1);
      const endIdx = Math.min(lines.length, sym.endLine);

      // Get preceding context (comments, TODOs, decorators)
      const precedingLines = lines.slice(contextStartIdx, startIdx);
      const symbolLines = lines.slice(startIdx, endIdx);

      // Filter preceding lines to only include relevant context
      // (comments, TODOs, decorators, docstrings)
      const relevantPreceding = precedingLines.filter((line) => {
        const trimmed = line.trim();
        return (
          trimmed.startsWith('#') || // Python/shell comments
          trimmed.startsWith('//') || // JS/TS comments
          trimmed.startsWith('/*') || // Block comments
          trimmed.startsWith('*') || // Block comment continuation
          trimmed.startsWith('@') || // Decorators
          trimmed.startsWith('"""') || // Python docstrings
          trimmed.startsWith("'''") || // Python docstrings
          trimmed.includes('TODO') || // TODO markers
          trimmed.includes('FIXME') || // FIXME markers
          trimmed === '' // Empty lines between comment and function
        );
      });

      // Combine preceding context with symbol code
      const allLines = [...relevantPreceding, ...symbolLines];

      // Limit to reasonable size (max 60 lines per symbol including context)
      if (allLines.length > 60) {
        return (
          allLines.slice(0, 30).join('\n') +
          '\n// ... truncated ...\n' +
          allLines.slice(-10).join('\n')
        );
      }

      return allLines.join('\n');
    } catch {
      return sym.signature || null;
    }
  }

  /**
   * Get the content of a file
   */
  private getFileContent(file: FileRecord): string | null {
    if (!this.config.projectRoot) return null;

    try {
      const fullPath = path.join(this.config.projectRoot, file.path);
      return fs.readFileSync(fullPath, 'utf8');
    } catch {
      return null;
    }
  }

  /**
   * Estimate token count for a string
   */
  private estimateTokens(text: string): number {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }
}

/**
 * Parse suggested notes from model response
 *
 * The model can suggest notes using the format:
 * SUGGESTED_NOTES:
 * - [symbol_name] Note content here
 * - [file_path] Note about file
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
