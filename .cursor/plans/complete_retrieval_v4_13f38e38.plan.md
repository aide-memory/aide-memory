---
name: Complete Retrieval v4
overview: Improve all retrieval strategies with directory-aware exploration. Simple uses relevance scoring, tools use exploration functions, hybrid benefits from both.
todos:
  - id: simple-dir-scoring
    content: Add scoreDirectories() and getRelevantFiles() to SimpleGraphRetrieval
    status: completed
  - id: simple-findseeds
    content: Update findSeeds() to use directory relevance before symbol search
    status: completed
  - id: tools-list-packages
    content: Add list_packages tool and handler
    status: completed
  - id: tools-list-files
    content: Add list_files tool and handler
    status: completed
  - id: tools-search-path
    content: Add optional path parameter to search tool
    status: completed
  - id: tools-dedup-cache
    content: Add per-prompt cache that returns cached result + guidance to try different query
    status: completed
  - id: tools-prompt
    content: Add new tools to system prompt (minimal change to existing prompt)
    status: completed
  - id: config-budget
    content: Increase tokenBudget to 6000, maxBlocks to 10
    status: completed
  - id: cli-options
    content: Add --token-budget and --max-blocks CLI options
    status: completed
  - id: confidence-scoring
    content: 'OPTIONAL/LATER: Add confidence scoring before model finishes'
    status: cancelled
---

# Complete Retrieval Improvements v4

## Core Problem

All strategies jump straight to symbol search. When relevant code is in `web/src/App.tsx` but no symbol is named "tab" or "close", retrieval fails.

## Solution Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    DIRECTORY AWARENESS                          │
├─────────────────┬─────────────────┬─────────────────────────────┤
│     SIMPLE      │     TOOLS       │          HYBRID             │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ Deterministic   │ LLM-driven      │ Simple + Tools              │
│ directory       │ exploration     │                             │
│ relevance       │ tools           │                             │
│ scoring         │                 │                             │
├─────────────────┼─────────────────┼─────────────────────────────┤
│ 1. Score dirs   │ 1. list_packages│ Phase 1: Simple with        │
│    by keyword   │ 2. list_files   │   directory scoring         │
│    matches      │ 3. search(path) │ Phase 2: Tools can explore  │
│ 2. Prioritize   │ 4. Model decides│   more with new tools       │
│    seeds from   │    what's       │                             │
│    relevant     │    relevant     │                             │
│    directories  │                 │                             │
└─────────────────┴─────────────────┴─────────────────────────────┘
```

---

## 1. Simple Strategy: Directory Relevance Scoring

Add deterministic directory scoring BEFORE symbol search. No LLM, just keyword matching.

**File**: [`src/retrieval/simpleGraphRetrieval.ts`](src/retrieval/simpleGraphRetrieval.ts)

### New Method: Score Directories

```typescript
/**
 * Score directories by keyword relevance (no LLM, deterministic)
 */
private scoreDirectories(
  question: string,
  graph: ProjectGraph
): Map<string, number> {
  const keywords = this.extractSearchTerms(question);
  const dirScores = new Map<string, number>();

  const files = graph.findFiles();
  for (const file of files) {
    // Get directory path (e.g., "web/src" from "web/src/App.tsx")
    const parts = file.path.split('/');
    const dir = parts.slice(0, -1).join('/') || '.';

    let score = 0;

    // Score by file path containing keywords
    for (const kw of keywords) {
      if (file.path.toLowerCase().includes(kw.toLowerCase())) {
        score += 2;
      }
    }

    // Score by searching blocks in this file for keywords
    const blocks = graph.getBlocksForFile(file.id);
    for (const block of blocks) {
      for (const kw of keywords) {
        if (block.content.toLowerCase().includes(kw.toLowerCase())) {
          score += 1;
          break; // Count once per block
        }
      }
    }

    dirScores.set(dir, (dirScores.get(dir) || 0) + score);
  }

  return dirScores;
}

/**
 * Get files from highest-scoring directories
 */
private getRelevantFiles(
  dirScores: Map<string, number>,
  graph: ProjectGraph,
  limit: number = 10
): FileRecord[] {
  // Sort directories by score
  const sorted = [...dirScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);  // Top 5 directories

  const files: FileRecord[] = [];
  for (const [dir] of sorted) {
    const dirFiles = graph.findFiles()
      .filter(f => f.path.startsWith(dir + '/') || f.path.startsWith(dir));
    files.push(...dirFiles);
    if (files.length >= limit) break;
  }

  return files.slice(0, limit);
}
```

### Updated `findSeeds()` - Use Directory Relevance

```typescript
private findSeeds(query: RetrievalQuery, graph: ProjectGraph): SymbolRecord[] {
  const seeds: SymbolRecord[] = [];
  const seenIds = new Set<string>();

  // NEW: Score directories first
  const dirScores = this.scoreDirectories(query.question, graph);
  const relevantFiles = this.getRelevantFiles(dirScores, graph);

  this.log(`Top directories: ${[...dirScores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([d, s]) => `${d}(${s})`)
    .join(', ')}`);

  // Add symbols from relevant directories FIRST (before generic symbol search)
  for (const file of relevantFiles.slice(0, 5)) {
    const symbols = graph.getSymbolsForFile(file.id);
    for (const sym of symbols.slice(0, 3)) {
      if (!seenIds.has(sym.id)) {
        seeds.push(sym);
        seenIds.add(sym.id);
      }
    }
  }

  // Then continue with existing symbol name search...
  // (existing code for extractSymbolNames, exactMatches, etc.)
}
```

---

## 2. Tools Strategy: Exploration Functions

**File**: [`src/retrieval/toolBasedRetrieval.ts`](src/retrieval/toolBasedRetrieval.ts)

### New Tools

```typescript
// Add to RETRIEVAL_TOOLS array:

{
  name: 'list_packages',
  description: 'List top-level directories to understand project structure. Call this first to see what packages/modules exist.',
  parameters: { type: 'object', properties: {}, required: [] }
},

{
  name: 'list_files',
  description: 'List files in a directory. Use after list_packages to explore specific areas.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path, e.g., "web/src" or "src/retrieval"' }
    },
    required: ['path']
  }
},
```

### Update `search` Tool

```typescript
{
  name: 'search',
  description: 'Search for symbols and code content. Optionally filter by directory.',
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'What to search for' },
      path: { type: 'string', description: 'Optional: limit search to this directory' }
    },
    required: ['query']
  }
},
```

### Tool Handlers

```typescript
private handleListPackages(graph: ProjectGraph): string[] {
  const files = graph.findFiles();
  const topDirs = new Set<string>();

  for (const f of files) {
    const parts = f.path.split('/');
    if (parts.length > 1) {
      topDirs.add(parts[0] + '/');
    }
  }

  return Array.from(topDirs).sort();
}

private handleListFiles(
  graph: ProjectGraph,
  dirPath: string
): Array<{ path: string; symbolCount: number }> {
  const files = graph.findFiles();
  return files
    .filter(f => f.path.startsWith(dirPath))
    .map(f => ({
      path: f.path,
      symbolCount: graph.getSymbolsForFile(f.id).length
    }))
    .slice(0, 20); // Limit results
}

// Update handleSearch to support path filter
private handleSearch(
  graph: ProjectGraph,
  query: string,
  path?: string
): { symbols: SymbolRecord[]; blocks: ContentBlock[] } {
  let symbols = graph.searchSymbols(query);
  let blocks = graph.searchBlocks(query);

  if (path) {
    const filesInPath = new Set(
      graph.findFiles()
        .filter(f => f.path.startsWith(path))
        .map(f => f.id)
    );
    symbols = symbols.filter(s => filesInPath.has(s.fileId));
    blocks = blocks.filter(b => filesInPath.has(b.fileId));
  }

  return { symbols: symbols.slice(0, 10), blocks: blocks.slice(0, 10) };
}
```

### Per-Prompt Deduplication

Cache results per-prompt only. On duplicate call, return cached result AND guide model to try something different if needed:

```typescript
// In runAgenticLoop()
const callCache = new Map<string, ToolResult>();
const makeKey = (name: string, args: unknown) =>
  `${name}:${JSON.stringify(args)}`;

const key = makeKey(toolCall.name, toolCall.arguments);
if (callCache.has(key)) {
  const cached = callCache.get(key)!;

  // Return cached + guidance message
  messages.push({
    role: 'assistant',
    content: `Called ${toolCall.name}`,
  });
  messages.push({
    role: 'tool',
    content: `[CACHED] Already searched "${
      toolCall.arguments.query
    }". Results: ${formatResult(cached)}
    
If you need more context, try a different search query or explore different directories.`,
    toolCallId: toolCall.id,
  });
  continue; // Skip re-execution
}

// Execute and cache
const result = await this.executeTool(toolCall, graph);
callCache.set(key, result);
```

---

### Confidence Scoring (Optional/Later)

Only relevant when model is about to stop - ask it to rate confidence before finishing.

When model calls `done()` or returns no tool calls:

```typescript
if (toolCall.name === 'done' || response.toolCalls?.length === 0) {
  // Ask model to rate confidence
  messages.push({
    role: 'system',
    content: `Before finishing, rate your confidence (1-10) that you found the relevant code for: "${query.question}"
If below 7, consider exploring more directories with list_packages() or list_files().`,
  });

  // Get one more response
  const confidenceResponse = await this.runtime.chatWithTools(
    messages,
    this.tools
  );
  // If model decides to make more calls, continue loop
  // If model still says done, finish
}
```

This is optional/secondary - can implement later if needed.

### Updated Tool Prompt (Minimal Change)

Add new tools to the existing prompt without overhauling:

```typescript
const toolsList = `Available tools:
- search: Search symbols and code content. Supports optional path filter.
- list_packages: See top-level directories (call first to understand project structure)
- list_files: List files in a directory (use to explore before searching)
- get_symbol_context: Get full code for a symbol
- get_callers / get_callees: Find relationships
- get_file_content: Get all code from a file
- done: Call when you have enough context`;
```

---

## 3. Hybrid Strategy: Benefits from Both

Hybrid already chains simple -> tools. With these changes:

1. **Phase 1 (Simple)**: Now uses directory relevance scoring, finds better seeds
2. **Phase 2 (Tools)**: Can use list_packages, list_files, path filter to explore further

No code changes needed in [`src/retrieval/hybridRetrieval.ts`](src/retrieval/hybridRetrieval.ts) - it automatically benefits.

---

## 4. Token Budget & CLI

**File**: [`src/retrieval/types.ts`](src/retrieval/types.ts)

```typescript
tokenBudget: 6000,  // was 3000
maxBlocks: 10,      // was 5
```

**File**: [`src/cli/index.ts`](src/cli/index.ts)

```
--token-budget <n>  Token budget for context (default: 6000)
--max-blocks <n>    Max code blocks (default: 10)
```

---

## Summary: How Each Strategy Improves

| Strategy | Before | After |

| ---------- | --------------------------------------------- | --------------------------------------------------------- |

| **Simple** | Symbol name search only, misses UI code | Directory relevance scoring finds relevant files first |

| **Tools** | Model searches blindly | Model can explore structure: packages -> files -> symbols |

| **Hybrid** | Simple hints might miss, tools search blindly | Better hints from simple + exploration tools available |

---

## Files Changed

| File | Changes |

| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |

| [`src/retrieval/simpleGraphRetrieval.ts`](src/retrieval/simpleGraphRetrieval.ts) | Add `scoreDirectories()`, `getRelevantFiles()`, update `findSeeds()` |

| [`src/retrieval/toolBasedRetrieval.ts`](src/retrieval/toolBasedRetrieval.ts) | Add list_packages, list_files tools; path filter on search; per-prompt cache; updated prompt |

| [`src/retrieval/types.ts`](src/retrieval/types.ts) | tokenBudget=6000, maxBlocks=10 |

| [`src/cli/index.ts`](src/cli/index.ts) | --token-budget, --max-blocks options |
