<!-- 9a999b7d-edba-4e1b-8907-31998f79d7cf e12f9379-a1e9-45cb-b6ee-ee7bba9dec77 -->
# aide V1 Technical Specification

## Executive Summary

aide V0 works well for exact symbol lookup but has grown complex. V1 simplifies by:

- **ProjectGraph interface** - All layers access the graph through a single interface
- **Tree-sitter** for unified parsing (vendored community queries)
- **ContentBlocks** with smart chunking (token-based thresholds)
- **Dual retrieval** with unified RetrievalResult
- **Minimal context assembly** with explicit AssembledContext contract

---

## 1. Core: ProjectGraph Interface

**All layers access the graph through this interface.** SQLite is just one implementation.

````typescript
// src/brain/projectGraph.ts
export interface ProjectGraph {
  // === Files ===
  upsertFile(file: FileRecord): void;
  getFile(id: string): FileRecord | undefined;
  findFiles(filter?: FileFilter): FileRecord[];
  deleteFile(id: string): void;
  
  // === Symbols ===
  upsertSymbol(symbol: SymbolRecord): void;
  getSymbol(id: string): SymbolRecord | undefined;
  findSymbols(filter?: SymbolFilter): SymbolRecord[];
  getSymbolsForFile(fileId: string): SymbolRecord[];
  
  // === Content Blocks ===
  upsertBlock(block: ContentBlock): void;
  getBlock(id: string): ContentBlock | undefined;
  getBlocksForSymbol(symbolId: string): ContentBlock[];
  getBlocksForFile(fileId: string): ContentBlock[];
  getChunksForBlock(fullBlockId: string): ContentBlock[];
  searchBlocks(query: string, kinds?: BlockKind[]): ContentBlock[];  // FTS
  
  // === Relations ===
  addRelation(relation: Relation): void;
  getOutgoingRelations(symbolId: string): Relation[];
  getIncomingRelations(symbolId: string): Relation[];
  findRelations(filter?: RelationFilter): Relation[];
  ```neighbors(id: string, opts?: { edgeKinds: EdgeKind[]; direction?: 'in' | 'out' | 'both'; }): NodeRecord[];```

  
  // === Notes & Tags ===
  addNote(note: Note): void;
  getNotesForSymbol(symbolId: string): Note[];
  addTag(tag: Tag): void;
  findSymbolsByTag(name: string, value?: string): SymbolRecord[];
  
  // === Lifecycle ===
  initialize(): void;
  close(): void;
  clearAll(): void;
  getStats(): GraphStats;
}

// Layers use ProjectGraph, not SQLite directly:
// - analysis/ writes via ProjectGraph
// - retrieval/ reads via ProjectGraph  
// - brain/sqliteStore.ts implements ProjectGraph
````

---

## 2. Analysis Layer: Tree-sitter with Vendored Queries Implemeting Analysis Interface



We are using tree-siiter, but should define an interface that does certain things that will eventually output a extraction result, so that if we would like to implement a different mechanism to construct the DB and extraction results we can.

### Vendored Queries (No Runtime Network Calls)

```
src/analysis/queries/
├── typescript/
│   ├── tags.scm       # Symbol extraction
│   └── highlights.scm # Comments, docstrings
├── python/
│   ├── tags.scm
│   └── highlights.scm
├── go/
│   └── ...
└── README.md          # Source: nvim-treesitter commit <hash>
```

**Build step:** Copy queries from nvim-treesitter into repo. Runtime never fetches from network.

### TreeSitterAnalyzer

```typescript
class TreeSitterAnalyzer {
  // Load vendored queries from disk
  private loadQuery(language: string, file: string): Query {
    const path = `./queries/${language}/${file}`;
    return this.parser.createQuery(fs.readFileSync(path, 'utf8'));
  }
  
  analyze(content: string, language: string): ExtractionResult {
    const tree = this.parse(content, language);
    return {
      symbols: this.extractSymbols(tree, language),
      blocks: this.extractBlocks(tree, language),  // Single array
      relations: this.inferRelations(tree),
    };
  }
}
```

### ExtractionResult (Simplified)

```typescript
interface ExtractionResult {
  symbols: ExtractedSymbol[];
  blocks: ContentBlock[];      // Single array, blockKind encodes type
  relations: Relation[];
}
```

---

## 3. Brain Layer: Symbols vs Blocks

### SymbolKind (Code Structures)

```typescript
export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'variable'
  | 'method'
  | 'module'
  | 'property';
```

### BlockKind (Content Types)

```typescript
export type BlockKind =
  // Code content
  | 'code_full'        // full body of a symbol
  | 'code_chunk'      // chunks of a large body
  | 'code_misc'      // top-level code not tied to a symbol
  
  
  // Structure
  | 'impot'
  | 'export'
  

  // Documentation
  | 'comment'     // Standalone comments
  | 'comment_group' 
  | 'docstring'   // JSDoc, docstring, rustdoc
  | 'todo'        // TODO/FIXME markers
  
  // Non-code
  | 'markdown'    // Markdown content
  | 'prose'       // Plain text
  | 'config'      // Config files (JSON, YAML)
  | 'data'        // Data structures
  
  // Notebook
  | 'cell'        // Notebook cell
  | 'output';     // Cell output
```

### ContentBlock Interface

```typescript
export interface ContentBlock {
  id: string;
  fileId: string;
  kind: BlockKind;
  startLine: number;
  endLine: number;
  content: string;
  
  // Linkage
  symbolId?: string;        // Associated symbol (if code block)
  parentBlockId?: string;   // Parent block (for nesting)
  
  // Chunking
  isChunk: boolean;
  chunkIndex?: number;
  fullBlockId?: string;     // Reference to full block
  
  // Quick reference
  signature?: string;
  
  metadata?: Record<string, unknown>;
}
```

### Chunking Strategy (Token-Based)

```typescript
// Token-based thresholds (easier to reason about)
const LARGE_BLOCK_TOKEN_THRESHOLD = 1500;  // Only chunk if > this
const CHUNK_TOKEN_BUDGET = 800;            // Per chunk
const CHUNK_OVERLAP_LINES = 20;            // Overlap for context

function storeBlocks(symbol: Symbol, content: string): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const tokenCount = estimateTokens(content);
  
  // 1. ALWAYS store full block
  const fullBlock: ContentBlock = {
    id: generateId('block'),
    kind: 'code',
    content: content,
    symbolId: symbol.id,
    isChunk: false,
    // ...
  };
  blocks.push(fullBlock);
  
  // 2. Add chunks ONLY if above token threshold
  if (tokenCount > LARGE_BLOCK_TOKEN_THRESHOLD) {
    const chunks = splitIntoChunks(content, CHUNK_TOKEN_BUDGET, CHUNK_OVERLAP_LINES);
    chunks.forEach((chunk, index) => {
      blocks.push({
        id: generateId('chunk'),
        kind: 'code',
        content: chunk.content,
        symbolId: symbol.id,
        isChunk: true,
        chunkIndex: index,
        fullBlockId: fullBlock.id,
        // ...
      });
    });
  }
  
  return blocks;
}
```

---

## 4. Retrieval Layer: Strategy Roles

### Unified RetrievalResult

```typescript
export interface RetrievalResult {
  symbols: SymbolRecord[];
  blocks: ContentBlock[];
  files: FileRecord[];
  relations: Relation[];
  strategy: 'simple' | 'tools' | 'hybrid';
  tokenEstimate: number;
  toolCalls?: ToolCallRecord[];
  priority?: number // used in context assembly ordering
}

export interface RetrievalStrategy {
  retrieve(query: RetrievalQuery, graph: ProjectGraph): Promise<RetrievalResult>;
}
```

### Strategy 1: SimpleGraphRetrieval

**Intent:**

- **Default strategy**
- BFS over graph with configurable depth/fanout
- BFS deafults:
    - maxDepth = 2 or 3
    - maxNodes = ~150
    - Potentially configurable
- No tool calls, no LLM planning
- Cheap, deterministic, always works
```typescript
class SimpleGraphRetrieval implements RetrievalStrategy {
  async retrieve(query: RetrievalQuery, graph: ProjectGraph): Promise<RetrievalResult> {
    const seeds = this.findSeeds(query.question, graph);
    const expanded = this.expandBFS(seeds, graph, this.config.maxDepth);
    const blocks = this.getBlocks(expanded, graph);
    return { symbols: expanded, blocks, strategy: 'simple', /* ... */ };
  }
}
```


### Strategy 2: ToolBasedRetrieval

**Intent:**

- **Only for models that support tools**
- "Explore as needed" flows (like Cursor deep dives)
- Model decides what to fetch
```typescript
class ToolBasedRetrieval implements RetrievalStrategy {
  readonly tools = [
    { name: 'search_symbols', /* ... */ },
    { name: 'get_callers', /* ... */ },
    { name: 'search_content', /* ... */ },
    // ...
  ];
  
  async retrieve(query: RetrievalQuery, graph: ProjectGraph): Promise<RetrievalResult> {
    // Model tool-calling loop
  }
}
```


### Strategy 3: HybridRetrieval

**Intent:**

- Start with simple (cheap, deterministic)
- Optionally let model call tools to refine if `supportsTools && questionIsComplex`
- Best of both worlds
```typescript
class HybridRetrieval implements RetrievalStrategy {
  async retrieve(query: RetrievalQuery, graph: ProjectGraph, model: ModelRuntime): Promise<RetrievalResult> {
    const hints = await this.simpleRetrieval.retrieve(query, graph);
    
    if (!model.supportsTools) return hints;
    
    // Give model hints + tools to refine
    return this.toolRetrieval.retrieveWithHints(query, hints, graph, model);
  }
}
```


**Key point:** All three strategies are optional implementations behind the same interface. The rest of the system does not care which one is used.

---

## 5. Context Layer: Explicit Contract

### AssembledContext Interface

```typescript
// The ONLY thing sent to the model
export interface AssembledContext {
  systemPrompt: string;
  messages: ChatMessage[];  // { role: 'user' | 'assistant' | 'system'; content: string }
  tokenEstimate: number;
}
```

### ContextAssembler

```typescript
class ContextAssembler {
  constructor(private budget: TokenBudgetManager) {}
  
  // Takes (question, RetrievalResult, sessionState) → AssembledContext
  assemble(
    question: string,
    result: RetrievalResult,
    session: SessionState
  ): AssembledContext {
    const systemPrompt = this.buildSystemPrompt(result.strategy);
    const history = this.budget.truncate(this.formatHistory(session), historyBudget);
    const context = this.budget.truncate(this.formatResult(result), contextBudget);
    
    return {
      systemPrompt,
      messages: [
        ...this.formatHistoryMessages(session),
        { role: 'user', content: `${context}\n\n${question}` }
      ],
      tokenEstimate: this.budget.estimate(systemPrompt + history + context + question),
    };
  }
}
```

**Explicit contract:** ContextAssembler takes `(question, RetrievalResult, sessionState)` and returns `AssembledContext`, which is the only thing sent to the model. This is where "prep stops" and "model starts".

May help to include a deterministic order that is configurable, for example:

1. Symbol signature
2. Symbol full block OR chunks
3. Doc comments
4. Related blocks (imports, tests, callers, callees)
5. Notes
6. Other misc blocks

---

## 6. TokenBudgetManager

```typescript
class TokenBudgetManager {
  constructor(private modelLimit: number) {}
  
  estimate(text: string): number { return Math.ceil(text.length / 4); }
  available(used: number): number { return this.modelLimit - used - 500; }
  truncate(content: string, maxTokens: number): string {
    if (this.estimate(content) <= maxTokens) return content;
    return content.slice(0, maxTokens * 4) + '\n[...truncated]';
  }
}
```

Applied uniformly to: system prompt, history, context, tool results.

---

## 7. Final Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           INDEXING FLOW                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────┐    ┌─────────────────────┐    ┌────────────────────────────┐ │
│  │ File │───▶│ TreeSitterAnalyzer  │───▶│ ExtractionResult           │ │
│  └──────┘    │ (vendored queries)  │    │ {symbols, blocks, relations}│ │
│              └─────────────────────┘    └─────────────┬──────────────┘ │
│                                                       │                 │
│                                                       ▼                 │
│                                          ┌────────────────────────┐    │
│                                          │    ProjectGraph        │    │
│                                          │    (interface)         │    │
│                                          └───────────┬────────────┘    │
│                                                      │                 │
│                                          ┌───────────▼────────────┐    │
│                                          │  SQLiteBrainStore      │    │
│                                          │  (implementation)      │    │
│                                          └────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                           QUERY FLOW                                     │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────┐    ┌─────────────────────┐                               │
│  │ Question │───▶│  RetrievalStrategy  │                               │
│  └──────────┘    │  (simple/tools/     │                               │
│                  │   hybrid)           │                               │
│                  └──────────┬──────────┘                               │
│                             │ reads via                                │
│                             ▼                                          │
│                  ┌─────────────────────┐    ┌─────────────────────┐   │
│                  │    ProjectGraph     │───▶│  RetrievalResult    │   │
│                  └─────────────────────┘    └──────────┬──────────┘   │
│                                                        │              │
│                                          ┌─────────────▼──────────┐   │
│                                          │   ContextAssembler     │   │
│                                          └─────────────┬──────────┘   │
│                                                        │              │
│                                          ┌─────────────▼──────────┐   │
│                                          │   AssembledContext     │   │
│                                          │   (sent to model)      │   │
│                                          └─────────────┬──────────┘   │
│                                                        │              │
│                                          ┌─────────────▼──────────┐   │
│                                          │       Model            │   │
│                                          └─────────────┬──────────┘   │
│                                                        │              │
│                                          ┌─────────────▼──────────┐   │
│                                          │      Answer            │   │
│                                          └────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 8. Implementation Phases

### Phase 1: ProjectGraph Interface + Tree-sitter (Week 1-2)

- [ ] Define ProjectGraph interface in `src/brain/projectGraph.ts`
- [ ] Update SQLiteBrainStore to implement ProjectGraph
- [ ] Set up web-tree-sitter with grammars
- [ ] Vendor queries from nvim-treesitter into `src/analysis/queries/`
- [ ] Create TreeSitterAnalyzer using vendored queries
- [ ] Verify extraction captures everything (code + comments + docs)

### Phase 2: ContentBlock Storage (Week 2)

- [ ] Add BlockKind (separate from SymbolKind)
- [ ] Add ContentBlock interface with chunking fields
- [ ] Add content_blocks table with FTS to SQLite
- [ ] Implement token-based chunking (LARGE_BLOCK_TOKEN_THRESHOLD)
- [ ] Add block operations to ProjectGraph

### Phase 3: Retrieval Strategies (Week 3)

- [ ] Define RetrievalResult interface
- [ ] Create TokenBudgetManager
- [ ] Implement SimpleGraphRetrieval (default, BFS, no LLM)
- [ ] Implement ToolBasedRetrieval (tools, model explores)
- [ ] Implement HybridRetrieval (simple + tools if capable)
- [ ] All strategies read via ProjectGraph interface

### Phase 4: Context Assembly (Week 4)

- [ ] Define AssembledContext interface
- [ ] Simplify ContextAssembler (RetrievalResult → AssembledContext)
- [ ] Apply budget enforcement uniformly
- [ ] Update REPL for tool-calling
- [ ] Remove legacy code (parser.ts, ctagsParser.ts, graphTraversal.ts)

---

## 9. Files to Create/Modify

| File | Action |

|------|--------|

| `brain/projectGraph.ts` | **Create** - Graph interface |

| `brain/sqliteStore.ts` | **Update** - Implement ProjectGraph |

| `analysis/treeSitterAnalyzer.ts` | **Create** |

| `analysis/queries/**/*.scm` | **Create** - Vendored from nvim-treesitter |

| `analysis/parser.ts` | **Delete** |

| `analysis/ctagsParser.ts` | **Delete** |

| `core/tokenBudget.ts` | **Create** |

| `brain/types.ts` | **Extend** - BlockKind, ContentBlock |

| `retrieval/types.ts` | **Create** - RetrievalResult |

| `retrieval/simpleGraphRetrieval.ts` | **Create** |

| `retrieval/toolBasedRetrieval.ts` | **Create** |

| `retrieval/hybridRetrieval.ts` | **Create** |

| `retrieval/graphTraversal.ts` | **Delete** |

| `context/types.ts` | **Create** - AssembledContext |

| `context/assembler.ts` | **Simplify** |

---

## 10. Success Metrics

- Single ProjectGraph interface for all layers
- Vendored queries (no runtime network)
- Clear SymbolKind vs BlockKind separation
- Token-based chunking thresholds
- Unified RetrievalResult from all strategies
- Explicit AssembledContext contract
- Model can explore when capable, fallback when not

### To-dos

- [ ] Define ProjectGraph interface, update SQLiteBrainStore
- [ ] Set up simple Tree-sitter with vendored queries from nvim-treesitter 
- [ ] Implement simple ContentBlock with token-based chunking
- [ ] Build retrieval strategies (simple/tools/hybrid) with RetrievalResult
- [ ] Define AssembledContext, simplify ContextAssembler
- [ ] Cross reference all requirements and points of the original spec were met (not just todos and success metrics)
- [ ] Simplify overalll