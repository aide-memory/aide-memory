# AIDE Memory — Implementation Progress

> Tracking what's built, what's tested, and real findings as we go.
> Updated: Feb 28, 2026

---

## Build Status

| Component | Status | Tests | Notes |
|-----------|--------|-------|-------|
| SQLite schema + store | Done | 20/20 | `src/memory/store.ts` — CRUD, WAL mode, migrations |
| Recall engine | Done | 18/18 | `src/memory/recall.ts` — path scoping, glob inheritance, keyword boost, layer ordering |
| MCP server (5 tools) | Done | 9/9 | `src/memory/server.ts` — aide_recall, aide_remember, aide_forget, aide_memories, aide_import |
| CLI entry point | Done | manual | `src/memory/cli.ts` — stdio verified working |
| E2E comparison | Done | programmatic | AIDE 4/4, ConPort functional but no path filter, mcp-memory-service broken on macOS |

**Total: 47 tests passing. Zero type errors.**

---

## Architecture

```
src/memory/
├── types.ts        # MemoryLayer, RecallQuery, Memory, etc.
├── store.ts        # SQLite CRUD — MemoryStore class
├── recall.ts       # Path-scoped matching + scoring
├── server.ts       # MCP server with 5 tools + markdown import
├── cli.ts          # Stdio entry point
├── index.ts        # Public exports
└── __tests__/
    ├── store.test.ts    # 20 tests
    ├── recall.test.ts   # 18 tests
    └── server.test.ts   # 9 tests
```

No dependencies on old AIDE modules (brain, analysis, orchestration, etc.). Clean module with its own types, store, and server.

---

## How to Run

### As MCP server (for Claude Code, Cursor, etc.)

Add to your MCP config:
```json
{
  "mcpServers": {
    "aide-memory": {
      "command": "npx",
      "args": ["ts-node", "/path/to/aide-v0/src/memory/cli.ts", "/path/to/your/project"]
    }
  }
}
```

### Tools available to agents

| Tool | Purpose |
|------|---------|
| `aide_recall` | Get context for a code area (paths, query, layers) |
| `aide_remember` | Store a decision, preference, or fact |
| `aide_forget` | Archive or delete a memory |
| `aide_memories` | List what's stored |
| `aide_import` | Seed from markdown docs |

---

## Key Design Decisions

1. **Path-scoped recall is the core retrieval model.** Agent provides file paths → gets everything relevant to that subtree. No manual tagging needed.

2. **Layer ordering on output.** area_context first (most specific), then technical, then preferences, then guidelines. Agent gets the most relevant context at the top.

3. **Parent scope inheritance.** Memory scoped to `src/components/dashboard/**` also shows up when querying `src/components/` — because the dashboard is within components.

4. **Keyword boosting, not semantic search.** v1 uses simple word matching. Embeddings can be added later without schema changes (just add a column).

5. **47 tests > 0 tests.** Unlike ConPort and mcp-memory-service, which we'll compare against, every layer of our stack is tested with vitest.

---

## E2E Comparison

**Ran: Feb 28, 2026** — Programmatic comparison using MCP Client SDK.

Same 10 memories seeded into all 3 tools. Same queries issued. Raw output captured.

### Test Data (10 memories)

| # | Layer | What | Scope |
|---|-------|------|-------|
| 1 | preferences | Keep files under 150 lines — split even if used once | src/components/** |
| 2 | preferences | Composition over conditionals for component variants | src/components/** |
| 3 | area_context | Skeleton loading replaces ALL legacy loaders | src/components/dashboard/** |
| 4 | area_context | DashboardSkeleton is its own file even though used in one place | src/components/dashboard/** |
| 5 | technical | better-sqlite3 is synchronous — do not use await with db calls | src/memory/** |
| 6 | technical | SQLite uses WAL mode — never switch to DELETE journal mode | src/memory/** |
| 7 | technical | Vitest not Jest — use describe/it from vitest, not @jest globals | project |
| 8 | guidelines | Separate component variants into their own files | project |
| 9 | area_context | Each CLI command gets its own file in src/cli/commands/ | src/cli/commands/** |
| 10 | area_context | MCP tools registered with server.tool() not server.setRequestHandler() | src/memory/server.ts |

---

### AIDE Memory Results

**Seeding**: 10/10 memories stored. Zero errors.

**Query 1: `aide_recall({ paths: ["src/components/NewComponent.tsx"] })`**
```
## Technical Context
- Vitest not Jest — use describe/it from vitest, not @jest globals

## Preferences
- Composition over conditionals for component variants (from meky) [src/components/**]
- Keep files under 150 lines — split even if used once (from meky) [src/components/**]

## Guidelines
- Separate component variants into their own files — do not use if/else
```

**Verdict**: Correct. Returns component preferences + project-wide guidelines. Does NOT return dashboard-specific, memory-area, or CLI-area memories. Clean layer-organized output.

**Query 2: `aide_recall({ paths: ["src/components/dashboard/Widget.tsx"] })`**
```
## Area Context
- DashboardSkeleton is its own file even though used in one place [src/components/dashboard/**]
- Skeleton loading replaces ALL legacy loaders — no disabled toggle fallback [src/components/dashboard/**]

## Technical Context
- Vitest not Jest — use describe/it from vitest, not @jest globals

## Preferences
- Composition over conditionals for component variants (from meky) [src/components/**]
- Keep files under 150 lines — split even if used once (from meky) [src/components/**]

## Guidelines
- Separate component variants into their own files — do not use if/else
```

**Verdict**: Correct. Dashboard child scope inherits parent component preferences. Area context appears first (most specific). Does NOT return memory-area or CLI-area memories.

**Query 3: `aide_recall({ paths: ["src/memory/newfile.ts"] })`**
```
## Technical Context
- SQLite uses WAL mode — never switch to DELETE journal mode [src/memory/**]
- better-sqlite3 is synchronous — do not use await with db calls [src/memory/**]
- Vitest not Jest — use describe/it from vitest, not @jest globals

## Guidelines
- Separate component variants into their own files — do not use if/else
```

**Verdict**: Correct. Returns memory-area technical facts + project-wide guidelines. Does NOT return component preferences or dashboard area context. Perfect isolation.

**Query 4: `aide_recall({ paths: ["src/cli/commands/prune.ts"] })`**
```
## Area Context
- Each CLI command gets its own file in src/cli/commands/ [src/cli/commands/**]

## Technical Context
- Vitest not Jest — use describe/it from vitest, not @jest globals

## Guidelines
- Separate component variants into their own files — do not use if/else
```

**Verdict**: Correct. Returns CLI-specific area context + project-wide guidelines. Does NOT return component, dashboard, or memory-area items. Perfect isolation.

**AIDE Score: 4/4 queries correct. Path scoping + layer ordering works exactly as designed.**

---

### ConPort Results

**Seeding**: 10/10 items stored across decisions, system_patterns, and custom_data. Took ~2 seconds due to embedding model loading (103 weights materialized on startup). Every tool call requires a `workspace_id` parameter.

**Query 1: `get_decisions` (all — no path filter available)**
```json
[
  {"id":1, "summary":"Skeleton loading replaces ALL legacy loaders — no disabled toggle fallback",
   "rationale":"Scope: src/components/dashboard/**"},
  {"id":2, "summary":"DashboardSkeleton is its own file even though used in one place",
   "rationale":"Scope: src/components/dashboard/**"},
  {"id":3, "summary":"Each CLI command gets its own file in src/cli/commands/",
   "rationale":"Scope: src/cli/commands/**"},
  {"id":4, "summary":"MCP tools registered with server.tool() not server.setRequestHandler()",
   "rationale":"Scope: src/memory/server.ts"}
]
```

**Verdict**: Returns ALL decisions project-wide. No way to filter by file path. If an agent is working on `src/memory/`, it gets dashboard and CLI decisions it doesn't need.

**Query 2: `search_custom_data_value_fts` for "components"**
```json
[
  {"category":"preferences", "key":"Composition over conditionals for component variants",
   "value":{"scope":"src/components/**","contributor":"meky"}},
  {"category":"preferences", "key":"Keep files under 150 lines — split even if used once",
   "value":{"scope":"src/components/**","contributor":"meky"}}
]
```

**Verdict**: FTS keyword match found the right items. But the agent has to know to search for "components" as a keyword — if the agent searches for "style guidelines" or "file splitting", it gets nothing.

**Query 3: `semantic_search_conport` for "component preferences style 150 lines"**
```json
[
  {"distance":0.474, "key":"Keep files under 150 lines — split even if used once"},
  {"distance":0.643, "key":"Composition over conditionals for component variants"},
  {"distance":0.695, "name":"Separate component variants into their own files"},
  {"distance":0.845, "summary":"Skeleton loading replaces ALL legacy loaders"},
  {"distance":0.887, "summary":"DashboardSkeleton is its own file even though used in one place"},
  {"distance":0.907, "key":"Vitest not Jest — use describe/it from vitest, not @jest globals"},
  {"distance":0.915, "summary":"Each CLI command gets its own file in src/cli/commands/"},
  {"distance":0.937, "key":"better-sqlite3 is synchronous — do not use await with db calls"},
  {"distance":0.940, "key":"SQLite uses WAL mode — never switch to DELETE journal mode"},
  {"distance":1.001, "summary":"MCP tools registered with server.tool()"}
]
```

**Verdict**: Semantic search returns ALL 10 items ranked by distance. Top 3 are relevant but the rest is noise. No way to say "only things relevant to the files I'm editing." The agent would need to mentally filter.

**Query 4: `search_custom_data_value_fts` for "sqlite"**
```json
[
  {"category":"technical", "key":"SQLite uses WAL mode — never switch to DELETE journal mode",
   "value":{"scope":"src/memory/**"}}
]

```

**Verdict**: Found 1 of 2 SQLite-related items. Missed "better-sqlite3 is synchronous" because FTS matched on "SQLite" in the value but "better-sqlite3" is hyphenated and didn't match. Brittle.

**ConPort Score: Functional but no path filtering. Returns everything or requires the agent to craft the right keyword/semantic query.**

---

### mcp-memory-service Results

**Seeding**: 0/10 items stored. Complete failure.

```
ERROR: SQLite extension loading not supported
Platform: Darwin 25.2.0
Python Version: 3.11.5

SOLUTIONS:
  • Install Python via Homebrew: brew install python
  • Use pyenv with extension support:
    PYTHON_CONFIGURE_OPTS='--enable-loadable-sqlite-extensions' pyenv install 3.12.0
  • Consider using Cloudflare backend: export MCP_MEMORY_STORAGE_BACKEND=cloudflare
```

The sqlite-vec extension (required for vector search) cannot be loaded on macOS system Python. The error repeats 10+ times as each seed attempt fails independently. Both eager and lazy initialization fail. The tool literally cannot start.

**mcp-memory-service Score: 0/4 queries. Completely broken on macOS with system Python. Cannot store or retrieve anything.**

---

### Summary Scores

| Tool | Seeding | Path Scoping | Isolation | Output Quality | Setup |
|------|---------|-------------|-----------|---------------|-------|
| **AIDE Memory** | 10/10 | 4/4 | Perfect | Clean markdown, layer-grouped | `npx ts-node cli.ts` — works immediately |
| **ConPort** | 10/10 | 0/4 (N/A) | None | Raw JSON, no organization | `pip install`, loads 103-weight embedding model on start |
| **mcp-memory-service** | 0/10 | N/A | N/A | N/A | Broken on macOS system Python |

---

## Diagnostic Report

### What went well

1. **Path-scoped recall works exactly as designed.** The core thesis — "give me file paths, get relevant context" — produces clean, accurate results on every query. No false positives, no missed memories within scope.

2. **Layer ordering makes the output immediately useful.** Area context first, then technical, then preferences, then guidelines. An agent reading the output top-to-bottom gets the most specific information first. This is not something either competitor does.

3. **Zero-config path matching.** Agent doesn't need to craft queries, pick keywords, or know what categories exist. Just pass `paths: ["src/components/dashboard/Widget.tsx"]` and get everything relevant. ConPort requires the agent to choose between `get_decisions`, `get_system_patterns`, `search_custom_data_value_fts`, or `semantic_search_conport` — and none of them filter by path.

4. **Parent scope inheritance is a genuine UX win.** Memory scoped to `src/components/**` automatically applies when working in `src/components/dashboard/`. The agent doesn't need to know the scope hierarchy. ConPort has no equivalent — scope is stored as free text in the rationale field.

5. **47 tests, clean build, works on first `npx ts-node`.** ConPort loads a 103-weight embedding model on startup. mcp-memory-service can't even start on standard macOS Python.

### What's a game changer from UX perspective

**Path scoping is the game changer.** This is the only insight that matters from the comparison:

When an agent starts working on a file, the question is: "What do I need to know about this area of the code?" With AIDE, the agent calls `aide_recall({ paths })` with whatever files it's touching and gets a clean, organized answer. With ConPort, the agent has to:
1. Decide which of 30 tools to call
2. Craft a keyword or semantic query
3. Mentally filter results that aren't relevant to the current area
4. Repeat across multiple entity types (decisions, patterns, custom data)

That's 4 steps of cognitive overhead vs 1 tool call. For an AI agent that gets ~200K context tokens per session, reducing noise is everything.

### What's NOT that big a deal

1. **Contributor tracking.** We track who stored what. Nice metadata but agents don't really use it. It shows up in output as "(from meky)" but an agent doesn't change behavior based on who said something.

2. **Context labels.** The `context_label` field exists but doesn't add much over the scope + what fields. Could be removed without loss.

3. **Layer filtering on recall.** The `layers` parameter lets you request only specific layers. In practice, agents want everything — the layer ordering on output handles prioritization.

4. **aide_import from markdown.** Useful for initial seeding but not a differentiator. Any tool can be seeded programmatically.

### Issues that came up

1. **mcp-memory-service is broken on macOS.** sqlite-vec requires `--enable-loadable-sqlite-extensions` at Python compile time. System Python 3.11.5 doesn't have this. This is a real adoption blocker — developers on macOS who `pip install mcp-memory-service` will get a broken tool. The suggested Cloudflare backend alternative requires an external service.

2. **ConPort's 30 tools are a UX problem.** The agent has to choose between `log_decision`, `log_system_pattern`, `log_custom_data`, `log_active_context`, `get_decisions`, `get_system_patterns`, `search_custom_data_value_fts`, `semantic_search_conport`, etc. Every tool requires `workspace_id`. There's no single "give me context for this file" operation.

3. **ConPort semantic search returns everything ranked by distance.** Query "component preferences style 150 lines" returns all 10 items. The top hits are relevant (distance 0.47) but the bottom hits (distance 1.0) are noise. No way to set a threshold or combine with path filtering.

4. **ConPort FTS is brittle.** Searching "sqlite" found 1 of 2 SQLite-related items because "better-sqlite3" is hyphenated. Simple keyword matching breaks on compound words.

5. **AIDE keyword boosting is basic.** Our word-match scoring works but won't find semantically related concepts ("file splitting" won't match "keep under 150 lines"). This is a real gap.

### Should we add semantic search?

**Yes, but not as the primary retrieval method.**

The comparison revealed that semantic search as a standalone retrieval mechanism (ConPort's approach) produces noisy results — all 10 items came back ranked by distance with no structural filtering. But semantic search as a **secondary signal within an already-scoped result set** would be genuinely useful.

**Recommended approach:**
1. Path scoping remains the primary filter (narrows 10,000 memories → 50 relevant ones)
2. Semantic similarity re-ranks within the scoped set (50 → top 10 by relevance to current task)
3. Optionally, semantic search across scopes for "related work in other areas" queries

This gives us something neither competitor offers: structured path-based filtering + semantic ranking. ConPort has semantic without structure. mcp-memory-service has semantic but can't even start.

**Implementation cost:** Add an optional `sqlite-vec` or `chromadb` column alongside the existing schema. The recall engine already returns scored results — semantic similarity becomes another scoring factor.

### Should we continue pursuing this?

**Yes.** Here's the honest assessment:

**The space is wide open.** ConPort has 56 downloads/day. mcp-memory-service has 600/day. Neither is an industry standard. Both have real usability problems (30 tools, broken on macOS). The total addressable market is every developer using an AI coding agent — and nobody has solved persistent memory well.

**Path scoping is a real differentiator, not just a feature.** After running the comparison, the gap between "give me file paths, get context" and "choose from 30 tools, craft a query, filter mentally" is bigger than expected. It's the difference between an agent that automatically knows the right context and one that has to work for it.

**What would make us quit:**
- If Claude Code / Cursor ship built-in memory (they will eventually — but that's 6-12 months away at minimum)
- If ConPort adds path-based scoping (possible but their architecture is entity-type-oriented, not path-oriented — it's a significant redesign)
- If the memory problem turns out to be already solved by longer context windows (it's not — even 200K tokens flush between sessions)

**What would make us win:**
- Ship a tool that works with `npx` in 10 seconds, no Python, no model loading
- Path scoping + semantic re-ranking within scopes
- Self-hosting: use aide-memory while building aide-memory, proving the value loop
- Integration with codebase analysis (tree-sitter) to auto-discover scopes and relations

### General thoughts

The competitive landscape is weaker than expected. Both competitors have fundamental UX problems that aren't easily fixed:

- **ConPort** is built around entity types (decisions, patterns, progress), not code areas. Adding path-based filtering would require rethinking their entire data model. Their 30-tool surface area is a liability — agents waste tokens deciding which tool to call.

- **mcp-memory-service** is conceptually simpler (store/search/recall) but depends on sqlite-vec which is fragile. Being Python-only means every Node.js/TypeScript project needs a Python runtime just for memory.

- **AIDE Memory** is the only one built from the premise that code location is the primary organizing principle. This matches how developers actually think: "What do I need to know when working in this directory?" not "Show me all decisions tagged as architecture."

The risk is over-engineering. Right now we have a clean 47-test module that does one thing well. The temptation is to add semantic search, auto-discovery, contributor analytics, memory decay, conflict detection... The right move is to self-host on this codebase, use it in real sessions, and let real friction guide what to build next.

---

## What's Next

1. Self-host aide-memory on this codebase — use it while building it
2. Add semantic re-ranking within scoped results (sqlite-vec or simple embedding)
3. Manual Cursor + Claude Code comparison (setups A-H from the test matrix)
4. Ship as standalone npm package (zero Python dependency is the positioning)
