/**
 * TreeSitterAnalyzer
 *
 * Unified code analysis using Tree-sitter with query-driven extraction.
 * Uses vendored queries from nvim-treesitter/helix for symbol extraction.
 *
 * Key design:
 * - Queries drive extraction (not hardcoded per-language logic)
 * - Adding a new language = adding query files
 * - Falls back to generic heuristics for languages without queries
 */

import * as fs from 'fs';
import * as path from 'path';
import crypto from 'crypto';
import { SymbolKind, ContentBlock, BlockKind, Relation } from '../brain/types';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedSymbol {
  name: string;
  kind: SymbolKind;
  startLine: number;
  endLine: number;
  signature?: string;
  docComment?: string;
}

export interface ExtractionResult {
  symbols: ExtractedSymbol[];
  blocks: ContentBlock[];
  relations: Relation[];
}

// Token-based chunking thresholds
export const LARGE_BLOCK_TOKEN_THRESHOLD = 1500;
export const CHUNK_TOKEN_BUDGET = 800;
export const CHUNK_OVERLAP_LINES = 20;

// Tree-sitter types
interface TreeSitterParser {
  setLanguage(language: TreeSitterLanguage): void;
  parse(input: string): TreeSitterTree;
}

interface TreeSitterLanguage {
  query(source: string): TreeSitterQuery;
}

interface TreeSitterQuery {
  matches(node: TreeSitterNode): TreeSitterQueryMatch[];
  captures(node: TreeSitterNode): TreeSitterQueryCapture[];
}

interface TreeSitterQueryMatch {
  pattern: number;
  captures: TreeSitterQueryCapture[];
}

interface TreeSitterQueryCapture {
  name: string;
  node: TreeSitterNode;
}

interface TreeSitterTree {
  walk(): TreeSitterTreeCursor;
  rootNode: TreeSitterNode;
}

interface TreeSitterTreeCursor {
  currentNode: TreeSitterNode;
  gotoFirstChild(): boolean;
  gotoNextSibling(): boolean;
  gotoParent(): boolean;
}

interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  endPosition: { row: number; column: number };
  parent: TreeSitterNode | null;
  namedChildren: TreeSitterNode[];
  firstChild: TreeSitterNode | null;
  childForFieldName(fieldName: string): TreeSitterNode | null;
}

// ============================================================================
// Query Definition Mapping
// ============================================================================

/**
 * Maps query capture names to SymbolKind.
 * These follow the nvim-treesitter/helix naming conventions.
 */
const CAPTURE_TO_KIND: Record<string, SymbolKind> = {
  'definition.function': 'function',
  'definition.method': 'method',
  'definition.class': 'class',
  'definition.interface': 'interface',
  'definition.type': 'type',
  'definition.variable': 'variable',
  'definition.module': 'module',
  'definition.property': 'property',
};

// ============================================================================
// Parser Module Loading
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let ParserClass: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let LanguageClass: any = null;
let parserInitialized = false;

async function initTreeSitter(): Promise<void> {
  if (!parserInitialized) {
    const TreeSitter = await import('web-tree-sitter');
    // New API: { Parser, Language } exports
    ParserClass = TreeSitter.Parser;
    LanguageClass = TreeSitter.Language;
    await ParserClass.init();
    parserInitialized = true;
  }
}

async function getParserClass(): Promise<any> {
  await initTreeSitter();
  return ParserClass;
}

async function getLanguageClass(): Promise<any> {
  await initTreeSitter();
  return LanguageClass;
}

// ============================================================================
// TreeSitterAnalyzer
// ============================================================================

export class TreeSitterAnalyzer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private parser: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private languages: Map<string, any> = new Map();
  private queries: Map<string, TreeSitterQuery> = new Map();
  private queriesDir: string;
  private initialized = false;

  constructor(queriesDir?: string) {
    this.queriesDir = queriesDir || path.join(__dirname, 'queries');
  }

  /**
   * Initialize the parser and load WASM modules
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const Parser = await getParserClass();
    this.parser = new Parser();
    this.initialized = true;
  }

  /**
   * Load a language grammar
   */
  async loadLanguage(language: string): Promise<TreeSitterLanguage> {
    if (this.languages.has(language)) {
      return this.languages.get(language)!;
    }

    const Parser = await getParserClass();

    // Map language names to WASM file names
    const wasmMapping: Record<string, string> = {
      typescript: 'tree-sitter-typescript',
      javascript: 'tree-sitter-javascript',
      tsx: 'tree-sitter-tsx',
      python: 'tree-sitter-python',
      go: 'tree-sitter-go',
      rust: 'tree-sitter-rust',
      java: 'tree-sitter-java',
      ruby: 'tree-sitter-ruby',
      c: 'tree-sitter-c',
      cpp: 'tree-sitter-cpp',
    };

    const wasmName = wasmMapping[language];
    if (!wasmName) {
      throw new Error(`Unsupported language: ${language}`);
    }

    // Try to find the WASM file in node_modules
    // TypeScript package has nested structure with tsx separate
    const possiblePaths = [
      // Direct package path
      path.join(process.cwd(), 'node_modules', wasmName, `${wasmName}.wasm`),
      // From dist directory
      path.join(
        __dirname,
        '..',
        '..',
        'node_modules',
        wasmName,
        `${wasmName}.wasm`
      ),
      // TypeScript nested JS (tree-sitter-typescript contains tree-sitter-javascript)
      path.join(
        process.cwd(),
        'node_modules',
        'tree-sitter-typescript',
        'node_modules',
        wasmName,
        `${wasmName}.wasm`
      ),
    ];

    let wasmPath: string | null = null;
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        wasmPath = p;
        break;
      }
    }

    if (!wasmPath) {
      throw new Error(
        `Language WASM not found for ${language}. Install tree-sitter-${language} package.`
      );
    }

    const Language = await getLanguageClass();
    const lang = await Language.load(wasmPath);
    this.languages.set(language, lang);
    return lang;
  }

  /**
   * Load a query from vendored files
   */
  loadQuery(language: string, queryName: string): TreeSitterQuery | null {
    const cacheKey = `${language}:${queryName}`;
    if (this.queries.has(cacheKey)) {
      return this.queries.get(cacheKey)!;
    }

    // Map language to query directory (handle aliases)
    const queryLangMap: Record<string, string> = {
      typescript: 'typescript',
      tsx: 'typescript',
      javascript: 'javascript',
      python: 'python',
    };

    const queryLang = queryLangMap[language] || language;
    const queryPath = path.join(this.queriesDir, queryLang, `${queryName}.scm`);

    if (!fs.existsSync(queryPath)) {
      return null;
    }

    try {
      const querySource = fs.readFileSync(queryPath, 'utf8');
      const lang = this.languages.get(language);
      if (!lang) {
        return null;
      }

      const query = lang.query(querySource);
      this.queries.set(cacheKey, query);
      return query;
    } catch (err) {
      // Query parsing failed - log and fall back to heuristics
      console.warn(`Failed to load query ${queryPath}:`, err);
      return null;
    }
  }

  /**
   * Parse source code into a Tree-sitter tree
   */
  async parse(content: string, language: string): Promise<TreeSitterTree> {
    await this.initialize();
    const lang = await this.loadLanguage(language);
    this.parser!.setLanguage(lang);
    return this.parser!.parse(content);
  }

  /**
   * Main analysis entry point
   */
  async analyze(
    content: string,
    language: string,
    fileId: string
  ): Promise<ExtractionResult> {
    const tree = await this.parse(content, language);
    const lines = content.split('\n');

    // Try query-driven extraction first
    let symbols = this.extractSymbolsWithQuery(tree, language, lines);

    // Fall back to heuristic extraction if no query available
    if (symbols.length === 0) {
      symbols = this.extractSymbolsWithHeuristics(tree, language, lines);
    }

    const blocks = this.extractBlocks(tree, language, lines, fileId, symbols);
    const relations = this.inferRelations(tree, language, symbols, fileId);

    return { symbols, blocks, relations };
  }

  /**
   * Extract symbols using vendored queries (preferred)
   */
  private extractSymbolsWithQuery(
    tree: TreeSitterTree,
    language: string,
    lines: string[]
  ): ExtractedSymbol[] {
    const tagsQuery = this.loadQuery(language, 'tags');
    if (!tagsQuery) {
      return [];
    }

    const symbols: ExtractedSymbol[] = [];
    const seenLocations = new Set<string>();

    try {
      const matches = tagsQuery.matches(tree.rootNode);

      for (const match of matches) {
        // Find the @name capture and the @definition.* capture
        let nameNode: TreeSitterNode | null = null;
        let definitionCapture: string | null = null;
        let definitionNode: TreeSitterNode | null = null;

        for (const capture of match.captures) {
          if (capture.name === 'name') {
            nameNode = capture.node;
          } else if (capture.name.startsWith('definition.')) {
            definitionCapture = capture.name;
            definitionNode = capture.node;
          }
        }

        if (!nameNode || !definitionCapture || !definitionNode) {
          continue;
        }

        // Deduplicate by location
        const locationKey = `${definitionNode.startPosition.row}:${nameNode.text}`;
        if (seenLocations.has(locationKey)) {
          continue;
        }
        seenLocations.add(locationKey);

        const kind = CAPTURE_TO_KIND[definitionCapture] || 'function';

        symbols.push({
          name: nameNode.text,
          kind,
          startLine: definitionNode.startPosition.row + 1,
          endLine: definitionNode.endPosition.row + 1,
          signature: this.getSignature(definitionNode, lines),
          docComment: this.getPrecedingComment(definitionNode, lines),
        });
      }
    } catch (err) {
      // Query execution failed - fall back to heuristics
      console.warn(`Query execution failed for ${language}:`, err);
    }

    return symbols;
  }

  /**
   * Extract symbols using generic heuristics (fallback)
   */
  private extractSymbolsWithHeuristics(
    tree: TreeSitterTree,
    language: string,
    lines: string[]
  ): ExtractedSymbol[] {
    const symbols: ExtractedSymbol[] = [];
    const cursor = tree.walk();

    const visit = () => {
      const node = cursor.currentNode;
      const symbol = this.nodeToSymbolHeuristic(node, lines);
      if (symbol) {
        symbols.push(symbol);
      }

      if (cursor.gotoFirstChild()) {
        do {
          visit();
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visit();
    return symbols;
  }

  /**
   * Generic heuristic for extracting symbols from nodes
   * Works across languages by pattern matching on node type names
   */
  private nodeToSymbolHeuristic(
    node: TreeSitterNode,
    lines: string[]
  ): ExtractedSymbol | null {
    const type = node.type;

    // Function patterns (covers most languages)
    if (
      type === 'function_declaration' ||
      type === 'function_definition' ||
      type === 'method_definition' ||
      type === 'method_declaration' ||
      (type.includes('function') && type.includes('definition'))
    ) {
      const nameNode =
        node.childForFieldName('name') ||
        node.namedChildren.find(
          (c) => c.type === 'identifier' || c.type === 'property_identifier'
        );

      if (nameNode) {
        const isMethod = type.includes('method');
        return {
          name: nameNode.text,
          kind: isMethod ? 'method' : 'function',
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          signature: this.getSignature(node, lines),
          docComment: this.getPrecedingComment(node, lines),
        };
      }
    }

    // Class patterns
    if (
      type === 'class_declaration' ||
      type === 'class_definition' ||
      (type.includes('class') && type.includes('definition'))
    ) {
      const nameNode =
        node.childForFieldName('name') ||
        node.namedChildren.find(
          (c) => c.type === 'identifier' || c.type === 'type_identifier'
        );

      if (nameNode) {
        return {
          name: nameNode.text,
          kind: 'class',
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          signature: `class ${nameNode.text}`,
          docComment: this.getPrecedingComment(node, lines),
        };
      }
    }

    // Interface patterns (TypeScript, Go, Java)
    if (type === 'interface_declaration' || type === 'interface_definition') {
      const nameNode =
        node.childForFieldName('name') ||
        node.namedChildren.find(
          (c) => c.type === 'identifier' || c.type === 'type_identifier'
        );

      if (nameNode) {
        return {
          name: nameNode.text,
          kind: 'interface',
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          signature: `interface ${nameNode.text}`,
          docComment: this.getPrecedingComment(node, lines),
        };
      }
    }

    // Type alias patterns
    if (type === 'type_alias_declaration' || type === 'type_definition') {
      const nameNode =
        node.childForFieldName('name') ||
        node.namedChildren.find(
          (c) => c.type === 'identifier' || c.type === 'type_identifier'
        );

      if (nameNode) {
        return {
          name: nameNode.text,
          kind: 'type',
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          signature: `type ${nameNode.text}`,
          docComment: this.getPrecedingComment(node, lines),
        };
      }
    }

    // Arrow functions assigned to variables
    if (type === 'lexical_declaration' || type === 'variable_declaration') {
      const declarator = node.namedChildren.find(
        (c) => c.type === 'variable_declarator'
      );
      if (declarator) {
        const nameNode = declarator.childForFieldName('name');
        const value = declarator.childForFieldName('value');
        if (nameNode && value && value.type === 'arrow_function') {
          return {
            name: nameNode.text,
            kind: 'function',
            startLine: node.startPosition.row + 1,
            endLine: node.endPosition.row + 1,
            signature: this.getSignature(node, lines),
            docComment: this.getPrecedingComment(node, lines),
          };
        }
      }
    }

    return null;
  }

  /**
   * Extract content blocks from the tree
   */
  private extractBlocks(
    tree: TreeSitterTree,
    language: string,
    lines: string[],
    fileId: string,
    symbols: ExtractedSymbol[]
  ): ContentBlock[] {
    const blocks: ContentBlock[] = [];
    const cursor = tree.walk();
    const coveredLines = new Set<number>();

    // First pass: create blocks for symbols
    for (const symbol of symbols) {
      const content = lines
        .slice(symbol.startLine - 1, symbol.endLine)
        .join('\n');
      const tokenCount = this.estimateTokens(content);

      // Create full block
      const fullBlock: ContentBlock = {
        id: this.generateBlockId(fileId, symbol.startLine, 'code'),
        fileId,
        kind: 'code',
        startLine: symbol.startLine,
        endLine: symbol.endLine,
        content,
        isChunk: false,
        signature: symbol.signature,
      };
      blocks.push(fullBlock);

      // Mark lines as covered
      for (let i = symbol.startLine; i <= symbol.endLine; i++) {
        coveredLines.add(i);
      }

      // Create chunks if block is large
      if (tokenCount > LARGE_BLOCK_TOKEN_THRESHOLD) {
        const chunks = this.createChunks(
          content,
          symbol.startLine,
          fileId,
          fullBlock.id
        );
        blocks.push(...chunks);
      }
    }

    // Second pass: extract comments, imports, exports
    const visit = () => {
      const node = cursor.currentNode;
      const block = this.nodeToBlock(
        node,
        language,
        lines,
        fileId,
        coveredLines
      );
      if (block) {
        blocks.push(block);
      }

      if (cursor.gotoFirstChild()) {
        do {
          visit();
        } while (cursor.gotoNextSibling());
        cursor.gotoParent();
      }
    };

    visit();
    return blocks;
  }

  /**
   * Convert a node to a content block if applicable
   */
  private nodeToBlock(
    node: TreeSitterNode,
    language: string,
    lines: string[],
    fileId: string,
    coveredLines: Set<number>
  ): ContentBlock | null {
    const type = node.type;
    const startLine = node.startPosition.row + 1;
    const endLine = node.endPosition.row + 1;

    // Skip if already covered by a symbol block
    if (coveredLines.has(startLine)) {
      return null;
    }

    // Comments
    if (
      type === 'comment' ||
      type === 'line_comment' ||
      type === 'block_comment'
    ) {
      const content = node.text;
      const isTodo = /\b(TODO|FIXME|HACK|XXX|NOTE)\b/i.test(content);

      return {
        id: this.generateBlockId(
          fileId,
          startLine,
          isTodo ? 'todo' : 'comment'
        ),
        fileId,
        kind: isTodo ? 'todo' : 'comment',
        startLine,
        endLine,
        content,
        isChunk: false,
      };
    }

    // Import statements
    if (
      type === 'import_statement' ||
      type === 'import_declaration' ||
      type === 'import_from_statement'
    ) {
      return {
        id: this.generateBlockId(fileId, startLine, 'import'),
        fileId,
        kind: 'import',
        startLine,
        endLine,
        content: node.text,
        isChunk: false,
      };
    }

    // Export statements
    if (type === 'export_statement' || type === 'export_declaration') {
      return {
        id: this.generateBlockId(fileId, startLine, 'export'),
        fileId,
        kind: 'export',
        startLine,
        endLine,
        content: node.text,
        isChunk: false,
      };
    }

    return null;
  }

  /**
   * Create chunks for a large block
   */
  private createChunks(
    content: string,
    startLine: number,
    fileId: string,
    fullBlockId: string
  ): ContentBlock[] {
    const chunks: ContentBlock[] = [];
    const lines = content.split('\n');
    const chunkLines = Math.floor(CHUNK_TOKEN_BUDGET / 8); // ~8 tokens per line

    let offset = 0;
    let chunkIndex = 0;

    while (offset < lines.length) {
      const chunkEnd = Math.min(offset + chunkLines, lines.length);
      const chunkContent = lines.slice(offset, chunkEnd).join('\n');

      chunks.push({
        id: this.generateBlockId(
          fileId,
          startLine + offset,
          `chunk-${chunkIndex}`
        ),
        fileId,
        kind: 'code',
        startLine: startLine + offset,
        endLine: startLine + chunkEnd - 1,
        content: chunkContent,
        isChunk: true,
        chunkIndex,
        fullBlockId,
      });

      offset += chunkLines - CHUNK_OVERLAP_LINES;
      chunkIndex++;

      // Safety check to prevent infinite loop
      if (offset <= 0) break;
    }

    return chunks;
  }

  /**
   * Infer relations between symbols
   */
  private inferRelations(
    tree: TreeSitterTree,
    language: string,
    symbols: ExtractedSymbol[],
    fileId: string
  ): Relation[] {
    // Relations require cross-file analysis - handled by indexer
    return [];
  }

  /**
   * Get the signature of a node
   */
  private getSignature(node: TreeSitterNode, lines: string[]): string {
    const startLine = node.startPosition.row;
    const firstLine = lines[startLine];

    // For functions, try to get just the signature part
    const sigEnd = firstLine.indexOf('{');
    if (sigEnd !== -1) {
      return firstLine.slice(0, sigEnd).trim();
    }

    // For Python (colon instead of brace)
    const colonEnd = firstLine.indexOf(':');
    if (
      (colonEnd !== -1 && firstLine.includes('def ')) ||
      firstLine.includes('class ')
    ) {
      return firstLine.slice(0, colonEnd).trim();
    }

    return firstLine.trim();
  }

  /**
   * Get preceding comment (JSDoc, docstring style)
   */
  private getPrecedingComment(
    node: TreeSitterNode,
    lines: string[]
  ): string | undefined {
    const startLine = node.startPosition.row;
    if (startLine === 0) return undefined;

    const comments: string[] = [];
    for (let i = startLine - 1; i >= 0 && i >= startLine - 20; i--) {
      const line = lines[i].trim();
      if (
        line.startsWith('*') ||
        line.startsWith('/*') ||
        line.startsWith('//') ||
        line.startsWith('#') ||
        line.startsWith('"""') ||
        line.startsWith("'''")
      ) {
        comments.unshift(line);
      } else if (line === '') {
        continue;
      } else {
        break;
      }
    }

    if (comments.length === 0) return undefined;
    return comments.join('\n');
  }

  /**
   * Estimate token count for content
   */
  private estimateTokens(content: string): number {
    return Math.ceil(content.length / 4);
  }

  /**
   * Generate a unique block ID
   */
  private generateBlockId(fileId: string, line: number, kind: string): string {
    const hash = crypto
      .createHash('sha1')
      .update(`${fileId}:${line}:${kind}`)
      .digest('hex')
      .slice(0, 12);
    return `block:${hash}`;
  }

  /**
   * Generate a unique symbol ID
   */
  static generateSymbolId(
    fileId: string,
    name: string,
    kind: string,
    line: number
  ): string {
    const hash = crypto
      .createHash('sha1')
      .update(`${fileId}:${name}:${kind}:${line}`)
      .digest('hex')
      .slice(0, 12);
    return `sym:${hash}`;
  }
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Map file extension to language
 */
export function detectLanguage(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const langMap: Record<string, string> = {
    '.ts': 'typescript',
    '.tsx': 'tsx',
    '.js': 'javascript',
    '.jsx': 'javascript',
    '.mjs': 'javascript',
    '.cjs': 'javascript',
    '.py': 'python',
    '.go': 'go',
    '.rs': 'rust',
    '.java': 'java',
    '.rb': 'ruby',
    '.c': 'c',
    '.h': 'c',
    '.cpp': 'cpp',
    '.cc': 'cpp',
    '.hpp': 'cpp',
    '.cs': 'csharp',
    '.swift': 'swift',
    '.kt': 'kotlin',
    '.scala': 'scala',
    '.lua': 'lua',
    '.r': 'r',
    '.R': 'r',
    '.pl': 'perl',
    '.sh': 'shell',
    '.bash': 'shell',
    '.zsh': 'shell',
    '.md': 'markdown',
    '.json': 'json',
    '.yaml': 'yaml',
    '.yml': 'yaml',
    '.toml': 'toml',
    '.xml': 'xml',
  };
  return langMap[ext] || 'unknown';
}

/**
 * Check if a language is supported for Tree-sitter analysis
 */
export function isTreeSitterSupported(language: string): boolean {
  const supported = [
    'typescript',
    'tsx',
    'javascript',
    'python',
    'go',
    'rust',
    'java',
    'ruby',
    'c',
    'cpp',
  ];
  return supported.includes(language);
}
