# AIDE Memory — Implementation Progress

> Tracking what's built, what's tested, and real findings as we go.
> Updated: Feb 28, 2026

---

## Build Status


| Component             | Status | Tests        | Notes                                                                                        |
| --------------------- | ------ | ------------ | -------------------------------------------------------------------------------------------- |
| SQLite schema + store | Done   | 20/20        | `src/memory/store.ts` — CRUD, WAL mode, migrations                                           |
| Recall engine         | Done   | 18/18        | `src/memory/recall.ts` — path scoping, glob inheritance, keyword boost, layer ordering       |
| MCP server (5 tools)  | Done   | 9/9          | `src/memory/server.ts` — aide_recall, aide_remember, aide_forget, aide_memories, aide_import |
| CLI entry point       | Done   | manual       | `src/memory/cli.ts` — stdio verified working                                                 |
| E2E comparison        | Done   | programmatic | AIDE 4/4, ConPort no path filter, mcp-memory no path filter + tags broken          |


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


| Tool            | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `aide_recall`   | Get context for a code area (paths, query, layers) |
| `aide_remember` | Store a decision, preference, or fact              |
| `aide_forget`   | Archive or delete a memory                         |
| `aide_memories` | List what's stored                                 |
| `aide_import`   | Seed from markdown docs                            |


---

## Key Design Decisions

1. **Path-scoped recall is the core retrieval model.** Agent provides file paths → gets everything relevant to that subtree. No manual tagging needed.
2. **Layer ordering on output.** area_context first (most specific), then technical, then preferences, then guidelines. Agent gets the most relevant context at the top.
3. **Parent scope inheritance.** Memory scoped to `src/components/dashboard/`** also shows up when querying `src/components/` — because the dashboard is within components.
4. **Keyword boosting, not semantic search.** v1 uses simple word matching. Embeddings can be added later without schema changes (just add a column).
5. **47 tests > 0 tests.** Unlike ConPort and mcp-memory-service, which we'll compare against, every layer of our stack is tested with vitest.

---

## E2E Comparison

**Ran: Feb 28, 2026** — Programmatic comparison using MCP Client SDK.

Same 10 memories seeded into all 3 tools. Same queries issued. Raw output captured.

### Test Data (10 memories)


| #   | Layer        | What                                                                   | Scope                       |
| --- | ------------ | ---------------------------------------------------------------------- | --------------------------- |
| 1   | preferences  | Keep files under 150 lines — split even if used once                   | src/components/**           |
| 2   | preferences  | Composition over conditionals for component variants                   | src/components/**           |
| 3   | area_context | Skeleton loading replaces ALL legacy loaders                           | src/components/dashboard/** |
| 4   | area_context | DashboardSkeleton is its own file even though used in one place        | src/components/dashboard/** |
| 5   | technical    | better-sqlite3 is synchronous — do not use await with db calls         | src/memory/**               |
| 6   | technical    | SQLite uses WAL mode — never switch to DELETE journal mode             | src/memory/**               |
| 7   | technical    | Vitest not Jest — use describe/it from vitest, not @jest globals       | project                     |
| 8   | guidelines   | Separate component variants into their own files                       | project                     |
| 9   | area_context | Each CLI command gets its own file in src/cli/commands/                | src/cli/commands/**         |
| 10  | area_context | MCP tools registered with server.tool() not server.setRequestHandler() | src/memory/server.ts        |


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

**Setup note**: Broken on macOS system Python 3.11.5 (sqlite-vec can't load). Required Homebrew Python 3.12 in a venv, plus pinning `transformers<5.0` and `sentence-transformers<4.0` because PyTorch doesn't ship 2.4+ for macOS x86_64. This setup took ~10 minutes of debugging — a real adoption friction point.

**Seeding**: 10/10 items stored. However, **all tags were silently dropped** — every item shows as `[untagged]` despite being seeded with tags like `['src/components/**', 'preferences', 'meky']`.

**Query 1: `memory_search` for "component style preferences file splitting"**
```
Found 10 memories (mode: semantic)

1. Separate component variants into their own files — do not use if/else
2. Composition over conditionals for component variants
3. Keep files under 150 lines — split even if used once
4. Each CLI command gets its own file in src/cli/commands/
5. DashboardSkeleton is its own file even though used in one place
6. Skeleton loading replaces ALL legacy loaders — no disabled toggle fallback
7. Vitest not Jest — use describe/it from vitest, not @jest globals
8. SQLite uses WAL mode — never switch to DELETE journal mode
9. [leftover from earlier test] The AIDE project is pivoting...
10. MCP tools registered with server.tool() not server.setRequestHandler()
```

**Verdict**: Top 3 are relevant. Items 4-10 are noise. Returns ALL items ranked by embedding distance. No path filtering, no way to say "only things for src/components/". Semantic ranking is reasonable but the agent gets 7 irrelevant items.

**Query 2: `memory_search` with tag filter for "preferences"**
```
No memories found for query: 'component preferences'
```

**Verdict**: Tag-based filtering returned ZERO results despite tags being passed during `memory_store`. The tags were silently dropped during seeding. This is a bug or API mismatch — either way, tag filtering doesn't work.

**Query 3: `memory_search` for "SQLite WAL mode synchronous better-sqlite3"**
```
Found 10 memories (mode: semantic)

1. better-sqlite3 is synchronous — do not use await with db calls
2. SQLite uses WAL mode — never switch to DELETE journal mode
3. Skeleton loading replaces ALL legacy loaders — no disabled toggle fallback
4. Keep files under 150 lines — split even if used once
5. [leftover] Claude Code is Anthropic official CLI tool...
6-10. [remaining items ranked by distance]
```

**Verdict**: Top 2 are correct. Item 3 onward is noise. Same pattern: returns everything, no isolation. An agent working on `src/memory/` gets skeleton loading and component preferences it doesn't need.

**mcp-memory-service Score: Semantic ranking works (top results relevant) but no path filtering, no isolation, tags broken, and setup required custom Python venv.**

---

### Summary Scores


| Tool                   | Seeding | Path Scoping | Isolation | Output Quality                 | Setup Friction                                            |
| ---------------------- | ------- | ------------ | --------- | ------------------------------ | --------------------------------------------------------- |
| **AIDE Memory**        | 10/10   | 4/4          | Perfect   | Clean markdown, layer-grouped  | `npx ts-node cli.ts` — works immediately                  |
| **ConPort**            | 10/10   | 0/4 (N/A)    | None      | Raw JSON, no organization      | `pip install`, loads embedding model, needs workspace_id   |
| **mcp-memory-service** | 10/10*  | 0/4 (N/A)    | None      | Flat list, semantic ranked     | Broken on system Python, needs venv + pinned deps          |

*Tags silently dropped during seeding. Tag-based filtering returns zero results.


---

## Diagnostic Report

### What went well

1. **Path-scoped recall works exactly as designed.** The core thesis — "give me file paths, get relevant context" — produces clean, accurate results on every query. No false positives, no missed memories within scope.
2. **Layer ordering makes the output immediately useful.** Area context first, then technical, then preferences, then guidelines. An agent reading the output top-to-bottom gets the most specific information first. This is not something either competitor does.
3. **Zero-config path matching.** Agent doesn't need to craft queries, pick keywords, or know what categories exist. Just pass `paths: ["src/components/dashboard/Widget.tsx"]` and get everything relevant. ConPort requires the agent to choose between `get_decisions`, `get_system_patterns`, `search_custom_data_value_fts`, or `semantic_search_conport` — and none of them filter by path.
4. **Parent scope inheritance is a genuine UX win.** Memory scoped to `src/components/`** automatically applies when working in `src/components/dashboard/`. The agent doesn't need to know the scope hierarchy. ConPort has no equivalent — scope is stored as free text in the rationale field.
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

1. **mcp-memory-service setup is painful on macOS.** sqlite-vec requires `--enable-loadable-sqlite-extensions` at Python compile time. System Python 3.11.5 doesn't have this. Required Homebrew Python 3.12 in a venv, plus pinning PyTorch-compatible versions of transformers/sentence-transformers. ~10 minutes of debugging for anyone on macOS.
2. **mcp-memory-service silently drops tags.** Tags passed during `memory_store` don't persist — all items show as `[untagged]`. Tag-based filtering then returns zero results. This is a significant bug or API mismatch.
3. **ConPort's 30 tools are a UX problem.** The agent has to choose between `log_decision`, `log_system_pattern`, `log_custom_data`, `log_active_context`, `get_decisions`, `get_system_patterns`, `search_custom_data_value_fts`, `semantic_search_conport`, etc. Every tool requires `workspace_id`. There's no single "give me context for this file" operation.
4. **Both competitors return everything ranked by distance.** ConPort semantic search and mcp-memory-service both return ALL items for every query. Top 2-3 are relevant, rest is noise. No way to combine with path filtering. The agent has to mentally filter.
5. **ConPort FTS is brittle.** Searching "sqlite" found 1 of 2 SQLite-related items because "better-sqlite3" is hyphenated. Simple keyword matching breaks on compound words.
6. **AIDE keyword boosting is basic.** Our word-match scoring works but won't find semantically related concepts ("file splitting" won't match "keep under 150 lines"). This is a real gap.
7. **No tool was tested with a real AI agent in a real coding session.** All testing was programmatic API calls. We don't know how well any of these tools perform when an actual AI agent decides when/how to call them.

### Should we add semantic search?

**Yes, and for two distinct purposes:**

**Purpose 1: Re-ranking within scoped results.** The comparison showed that semantic search as standalone retrieval (what ConPort and mcp-memory-service do) produces noisy results — all items come back ranked by distance. But semantic as a secondary signal within an already path-scoped set would be useful: narrow 10,000 memories → 50 via path → top 10 by semantic relevance.

**Purpose 2: Entry point discovery across scopes.** This is the use case that path scoping alone can't handle. "What have we done before that's similar to what I'm about to build?" or "Are there patterns in other areas of the codebase that relate to this work?" These are cross-scope queries where semantic similarity is the primary signal and path scoping doesn't help. An agent starting a new feature should be able to ask "has anyone built something like this before?" and get memories from completely different code areas.

**Recommended approach:**
1. Path scoping remains the primary filter for area-specific recall
2. Semantic similarity re-ranks within the scoped set
3. A separate `aide_discover` or mode on `aide_recall` for cross-scope semantic search — "find related work anywhere in the project"
4. This gives us something genuinely different: structured path-based recall + semantic entry-point discovery. Neither competitor combines these.

**Implementation cost:** Add an embedding column to the existing schema (sqlite-vec or a simple embedding model). The recall engine already returns scored results — semantic becomes another scoring factor for scoped queries, and the primary factor for discovery queries.

### Should we continue pursuing this?

**Uncertain. Here's the brutally honest assessment:**

**The built-in memory landscape has changed.** Claude Code already ships Auto Memory (MEMORY.md — literally what this session is using), CLAUDE.md files with path-scoped rules (`.claude/rules/*.md` with glob frontmatter), and a Memory Tool API for custom agents. Cursor has built-in Memories since 0.51 (a sidecar model extracts preferences automatically) plus `.cursor/rules/`. The "6-12 months" estimate was wrong — it's already here.

**What the built-in tools do well:**
- CLAUDE.md: User-written instructions, path-scoped via glob frontmatter in `.claude/rules/`, persists in repo
- Auto Memory: Claude writes its own notes (build commands, debugging insights, preferences), persists per-project
- Cursor Memories: Background extraction of coding preferences, cloud-stored per account

**What the built-in tools DON'T do:**
- No structured layers (area_context vs technical vs preferences vs guidelines)
- No scope inheritance (parent/child path matching)
- No cross-scope discovery ("what similar work exists elsewhere?")
- No multi-contributor awareness
- No programmatic query API (you can't call `aide_recall({ paths })` against CLAUDE.md)
- CLAUDE.md is static text, not a queryable database — it grows unbounded and eventually hits context limits

**The honest gap:** Our differentiation is narrower than we thought. The broad problem ("AI agent doesn't remember across sessions") is being solved by the platforms themselves. But the specific problem ("give me structured, scoped, queryable context for the exact files I'm working on, organized by type, with cross-scope discovery") is not.

**What would make us quit:**
- If Claude Code adds structured path-scoped query to Auto Memory (possible but not on any announced roadmap)
- If the gap between "flat MEMORY.md" and "queryable scoped database" turns out not to matter in practice
- If real AI agent testing shows agents don't actually benefit from structured recall over flat notes

**What would make us win:**
- Ship a tool that works with `npx` in 10 seconds — no Python, no model loading, no cloud accounts
- Path scoping + semantic discovery (what neither platform nor competitor does)
- Self-hosting proof: demonstrate the value loop by using aide-memory while building aide-memory
- Prove via real agent testing that structured recall produces measurably better agent behavior than flat MEMORY.md
- Integration with codebase analysis to auto-discover scopes from actual code structure

**The decision point:** We need to self-host aide-memory on this codebase and run real coding sessions with it. If the agent produces measurably better output (fewer wrong assumptions, better style adherence, more relevant context) compared to bare CLAUDE.md, then we have a product. If the difference is marginal, we should stop.

### General thoughts

**The real competitor is CLAUDE.md, not ConPort or mcp-memory-service.**

ConPort (56 downloads/day) and mcp-memory-service (600/day) are niche side projects with real usability problems. But CLAUDE.md + Auto Memory ships with every Claude Code install. Cursor Memories ships with every Cursor install. These are the baselines users already have.

Our advantage over the built-in tools:
- **Queryable, not flat.** CLAUDE.md is a text file that grows until it hits context limits. aide-memory is a database that returns exactly what's relevant.
- **Scoped, not global.** CLAUDE.md rules can be path-scoped via `.claude/rules/` but there's no query interface — they're statically injected. aide-memory returns different context for different files dynamically.
- **Structured, not freeform.** Memories have layers, scopes, contributors, and can be searched semantically. MEMORY.md is just notes.

Our advantage over the MCP competitors:
- **Path scoping** — neither ConPort nor mcp-memory-service can answer "what's relevant to this specific file path"
- **Zero setup friction** — `npx ts-node` vs custom Python venvs and embedding model loading
- **Clean output** — layer-organized markdown vs raw JSON dumps

The risk is that the gap between "flat MEMORY.md" and "structured queryable database" isn't big enough to justify a separate tool. The only way to find out is to use it.

**What we haven't done that we should have:**
1. No real AI agent testing — all comparison was programmatic API calls, not actual coding sessions
2. No Cursor testing — we need manual testing with real prompts
3. No scenario testing from the original plan (style continuity, planning survival, etc.)
4. No comparison against bare CLAUDE.md (the real baseline, not "no memory tools")

---

## What's Next

1. **Self-host aide-memory on this codebase** — add to Claude Code MCP config, seed with real project knowledge, use it in coding sessions
2. **Real agent testing** — run the 5 original scenarios with aide-memory installed vs bare CLAUDE.md, document actual agent behavior differences
3. **Cursor testing** — set up MCP configs for Cursor, provide instructions for manual testing
4. **Semantic discovery** — add cross-scope semantic search for entry-point queries ("what similar work exists?")
5. **Decision point** — after real testing, decide go/no-go based on measurable agent behavior improvement

