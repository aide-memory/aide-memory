# AIDE Memory — Implementation Progress

Tracking what's built, what's tested, and real findings as we go.
> Updated: Feb 28, 2026

---

## Build Status


| Component             | Status | Tests        | Notes                                                                                        |
| --------------------- | ------ | ------------ | -------------------------------------------------------------------------------------------- |
| SQLite schema + store | Done   | 20/20        | `src/memory/store.ts` — CRUD, WAL mode, migrations                                           |
| Recall engine         | Done   | 18/18        | `src/memory/recall.ts` — path scoping, glob inheritance, keyword boost, layer ordering       |
| MCP server (5 tools)  | Done   | 9/9          | `src/memory/server.ts` — aide_recall, aide_remember, aide_forget, aide_memories, aide_import |
| CLI entry point       | Done   | manual       | `src/memory/cli.ts` — stdio verified working                                                 |
| E2E comparison        | Done   | programmatic | AIDE 4/4, ConPort no path filter, mcp-memory no path filter + tags broken                    |


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

## Setup & Operations

### Prerequisites

- Node.js >= 18
- `npm install` in the aide-v0 repo (installs `ts-node`, `better-sqlite3`, `@modelcontextprotocol/sdk`, `zod`)

### How the MCP server works

aide-memory runs as a **stdio MCP server** — the host application (Claude Code, Cursor) spawns it as a child process and communicates over stdin/stdout using JSON-RPC. You don't run it manually in a terminal. The host manages the process lifecycle.

```
Host (Claude Code / Cursor)
  └── spawns: npx ts-node src/memory/cli.ts <project-path>
        └── opens SQLite DB at ~/.aide/projects/<hash>/memory.db
        └── listens on stdin for JSON-RPC tool calls
        └── responds on stdout with results
```

The `<project-path>` argument determines which SQLite database to use. Each project gets its own DB, keyed by a SHA-1 hash of the absolute path:

```
~/.aide/projects/<sha1-hash-first-12-chars>/memory.db
```

For this repo: `~/.aide/projects/f126df15177d/memory.db`

### Setup for Claude Code

Add a `.mcp.json` file at the project root (already done for this repo):

```json
{
  "mcpServers": {
    "aide-memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["ts-node", "/Users/meky/code/aide-v0/src/memory/cli.ts", "/Users/meky/code/aide-v0"]
    }
  }
}
```

When Claude Code opens a session in this directory, it reads `.mcp.json` and auto-starts the MCP server. The agent then sees 5 new tools: `aide_recall`, `aide_remember`, `aide_forget`, `aide_memories`, `aide_import`.

**To verify it's running:** Start a new Claude Code session in this repo and ask "what tools do you have?" — you should see the aide-memory tools listed.

**To remove it:** Delete `.mcp.json` or remove the `aide-memory` key from `mcpServers`.

### Setup for Cursor

Add a `.cursor/mcp.json` file at the project root (already done for this repo):

```json
{
  "mcpServers": {
    "aide-memory": {
      "command": "npx",
      "args": ["ts-node", "/Users/meky/code/aide-v0/src/memory/cli.ts", "/Users/meky/code/aide-v0"]
    }
  }
}
```

After adding this file, restart Cursor or open the MCP settings panel (Settings > MCP) to see the server. Cursor manages startup/shutdown automatically.

**To remove it:** Delete `.cursor/mcp.json` or remove the `aide-memory` key from `mcpServers`.

### Starting, stopping, restarting

You **do not** start or stop the server manually. The host manages it:


| Action                  | Claude Code                                                  | Cursor                              |
| ----------------------- | ------------------------------------------------------------ | ----------------------------------- |
| **Start**               | Automatic when session opens in project dir                  | Automatic when project opens        |
| **Stop**                | Automatic when session ends / Claude Code exits              | Automatic when Cursor closes        |
| **Restart**             | Start a new Claude Code session (`claude` in terminal)       | Settings > MCP > click restart icon |
| **Disable temporarily** | Rename `.mcp.json` → `.mcp.json.bak` | Toggle off in Settings > MCP        |


If you need to test the server manually (e.g., to debug startup):

```bash
# Starts the server on stdio — type JSON-RPC messages to test
npx ts-node src/memory/cli.ts /Users/meky/code/aide-v0

# Ctrl+C to stop (sends SIGINT, server closes DB cleanly)
```

### Seeding memories

The seed script populates the DB with project knowledge before using aide-memory in sessions:

```bash
npx ts-node src/memory/__tests__/seed-project.ts
```

This writes 27 memories covering technical facts, preferences, area context, and guidelines. It's idempotent-ish — running it again adds duplicates. To start fresh:

```bash
# Delete the DB and re-seed
rm ~/.aide/projects/f126df15177d/memory.db
npx ts-node src/memory/__tests__/seed-project.ts
```

### Database management

The SQLite database lives at `~/.aide/projects/<hash>/memory.db`. You can inspect it directly:

```bash
# Count memories
sqlite3 ~/.aide/projects/f126df15177d/memory.db "SELECT count(*) FROM memories WHERE status='active'"

# List all memories
sqlite3 ~/.aide/projects/f126df15177d/memory.db "SELECT id, layer, scope, substr(what,1,80) FROM memories WHERE status='active'"

# Delete everything (nuclear option)
rm ~/.aide/projects/f126df15177d/memory.db
```

The DB uses WAL mode. It's safe to read while the MCP server is running. Don't write to it directly while the server is running — use the MCP tools instead.

### Using a different project

To use aide-memory on a different codebase, change the project path argument:

```json
{
  "mcpServers": {
    "aide-memory": {
      "command": "npx",
      "args": ["ts-node", "/Users/meky/code/aide-v0/src/memory/cli.ts", "/path/to/other/project"]
    }
  }
}
```

Each project gets its own DB automatically. No config beyond the path.

---

## Tool Reference

### `aide_recall` — Get context for a code area

The primary tool. Agent calls this when starting work on files to get everything relevant.


| Parameter | Type       | Required | Description                                                                                  |
| --------- | ---------- | -------- | -------------------------------------------------------------------------------------------- |
| `paths`   | `string[]` | No       | File/directory paths being worked on. Returns memories scoped to these areas + project-wide. |
| `query`   | `string`   | No       | Text to boost relevant results (e.g. "skeleton loading").                                    |
| `layers`  | `string[]` | No       | Filter to specific layers: `preferences`, `technical`, `area_context`, `guidelines`.         |
| `limit`   | `number`   | No       | Max memories to return (default 20).                                                         |


**Example call:**

```json
{ "paths": ["src/memory/store.ts", "src/memory/recall.ts"], "query": "SQLite" }
```

**Example output:**

```markdown
## Area Context
- aide-memory is a standalone module — no dependencies on old AIDE modules [src/memory/**]
- Path-scoped recall is the core retrieval model [src/memory/**]

## Technical Context
- SQLite uses WAL mode — never switch to DELETE journal mode [src/memory/**]
- better-sqlite3 is synchronous — do not use await with db calls [src/memory/**]
- Vitest not Jest — use describe/it from vitest, not @jest globals

## Guidelines
- Separate variants into their own files
```

**How scoping works:** A query for `src/memory/store.ts` matches:

- Memories scoped to `src/memory/store.ts` (exact match)
- Memories scoped to `src/memory/`** (parent glob match)
- Memories scoped to `project` (project-wide)
- Does NOT match `src/components/**` or `src/cli/**`

### `aide_remember` — Store knowledge

Agent calls this when the developer corrects its approach, makes a decision, or teaches something.


| Parameter       | Type     | Required | Description                                                                       |
| --------------- | -------- | -------- | --------------------------------------------------------------------------------- |
| `what`          | `string` | **Yes**  | The specific knowledge to store.                                                  |
| `layer`         | `string` | **Yes**  | One of: `preferences`, `technical`, `area_context`, `guidelines`.                 |
| `scope`         | `string` | No       | Glob pattern for the code area (e.g. `src/components/`**). Omit for project-wide. |
| `why`           | `string` | No       | Context for why this matters.                                                     |
| `context_label` | `string` | No       | Feature grouping (e.g. "dashboard skeleton loading").                             |
| `contributor`   | `string` | No       | Who this came from (for preferences).                                             |
| `source`        | `string` | No       | `conversation` (default), `import`, `agent_discovery`, `elevated`.                |


**Example call:**

```json
{
  "what": "Use zod schemas for all MCP tool parameter validation",
  "layer": "technical",
  "scope": "src/memory/server.ts",
  "why": "MCP SDK requires zod schemas for tool registration"
}
```

### `aide_forget` — Remove or archive a memory


| Parameter | Type     | Required | Description                                                          |
| --------- | -------- | -------- | -------------------------------------------------------------------- |
| `id`      | `number` | **Yes**  | The memory ID to forget.                                             |
| `mode`    | `string` | No       | `archive` (default) hides from recall. `delete` removes permanently. |


### `aide_memories` — List what's stored


| Parameter | Type     | Required | Description                                  |
| --------- | -------- | -------- | -------------------------------------------- |
| `layer`   | `string` | No       | Filter by layer.                             |
| `status`  | `string` | No       | `active` (default), `completed`, `archived`. |
| `scope`   | `string` | No       | Filter by exact scope.                       |
| `limit`   | `number` | No       | Max results (default 50).                    |


### `aide_import` — Seed from markdown

Parses markdown content into individual memories. Each bullet point, numbered item, or paragraph becomes a separate memory.


| Parameter       | Type     | Required | Description                            |
| --------------- | -------- | -------- | -------------------------------------- |
| `content`       | `string` | **Yes**  | The markdown text to parse and import. |
| `layer`         | `string` | **Yes**  | Which layer to import into.            |
| `scope`         | `string` | No       | Scope for all imported memories.       |
| `context_label` | `string` | No       | Label for the import batch.            |


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


| Tool                   | Seeding | Path Scoping | Isolation | Output Quality                | Setup Friction                                           |
| ---------------------- | ------- | ------------ | --------- | ----------------------------- | -------------------------------------------------------- |
| **AIDE Memory**        | 10/10   | 4/4          | Perfect   | Clean markdown, layer-grouped | `npx ts-node cli.ts` — works immediately                 |
| **ConPort**            | 10/10   | 0/4 (N/A)    | None      | Raw JSON, no organization     | `pip install`, loads embedding model, needs workspace_id |
| **mcp-memory-service** | 10/10*  | 0/4 (N/A)    | None      | Flat list, semantic ranked    | Broken on system Python, needs venv + pinned deps        |


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

## Cursor E2E Test Plan (Manual)

> For executing later. Each scenario runs 4 ways in Cursor. Score each on a 1-5 scale.

### Setups


| Setup                      | Config                                                          | What to do                            |
| -------------------------- | --------------------------------------------------------------- | ------------------------------------- |
| **B** — Bare Cursor        | No MCP servers, just default Cursor Memories + `.cursor/rules/` | Delete or rename `.cursor/mcp.json`   |
| **D** — ConPort            | `.cursor/mcp.json` pointing to ConPort server                   | `pip install conport`, add MCP config |
| **F** — mcp-memory-service | `.cursor/mcp.json` pointing to mcp-memory-service               | Python venv setup (see notes below)   |
| **H** — AIDE Memory        | `.cursor/mcp.json` pointing to aide-memory (already committed)  | Use existing `.cursor/mcp.json`       |


### Pre-test: Seed each tool

Before running scenarios on D/F/H, seed with the same 10 memories from the programmatic comparison (see E2E Comparison section above). For B, do nothing — let bare Cursor work from code alone.

### Scenario 1: Style Continuity

**Session 1:** Open `src/memory/` in Cursor. Chat: "I want to add a new module `src/memory/stats.ts` for tracking memory usage statistics. Keep it under 150 lines, split into separate files if it grows, use composition over conditionals." Correct the agent 2x if it doesn't follow the style.

**Session 2 (new chat, no prior context):** "Add a `getPopularScopes()` function to the memory stats module."

**Score:** Does the agent match the 150-line / split / composition style without being re-told?

### Scenario 2: Planning Details Survive

**Session 1:** Chat: "Let's plan a refactor of `src/analysis/treeSitterAnalyzer.ts`. Split into 3 files: parser, relation-extractor, symbol-analyzer. Keep TreeSitterAnalyzer as a facade. Don't change public API signatures."

**Session 2 (new chat):** "Continue the treeSitterAnalyzer refactor we planned."

**Score:** Does the agent know the 3-file split, facade pattern, and API constraint?

### Scenario 3: Technical Knowledge

**Session 1:** Work in `src/memory/`. Mention: "SQLite uses WAL mode — never switch. better-sqlite3 is synchronous — no await. Vitest not Jest."

**Session 2 (new chat):** "Add a migration to the memory store for a `tags` column."

**Score:** Does it use sync API? Respect WAL mode? Write vitest tests?

### Scenario 4: Proactive Discovery

**Session 1:** Seed the fact: "MCP tools registered with server.tool() not server.setRequestHandler()."

**Session 2 (new chat):** "Add a new MCP tool called `aide_stats` that returns memory count per layer."

**Score:** Does the agent recall the pattern before coding? Does it use `server.tool()`?

### Scenario 5: New Contributor Simulation

**Setup:** Use the seeded memories. Open a fresh Cursor window (no prior chats).

**Prompt:** "Add a new CLI command `aide prune` that removes memories older than 30 days."

**Score:** Does it follow file-per-command pattern? Match the option definition style?

### Scoring Rubric


| Dimension           | 1 (Bad)          | 3 (OK)              | 5 (Good)                   |
| ------------------- | ---------------- | ------------------- | -------------------------- |
| Corrections needed  | 5+ corrections   | 1-2 corrections     | 0 corrections              |
| Context retained    | No prior context | Partial recall      | All decisions/prefs        |
| Style match         | Generic/wrong    | Mostly right        | Exact match                |
| Proactive surfacing | Waits to be told | Partially proactive | Flags relevant discoveries |


### Results Template — Recall Tests (pre-seeded)

| Scenario               | B (Bare) | D (ConPort) | F (mcp-memory) | H (AIDE) |
| ---------------------- | -------- | ----------- | -------------- | -------- |
| 1. Style Continuity    | /5       | /5          | /5             | /5       |
| 2. Planning Survival   | /5       | /5          | /5             | /5       |
| 3. Technical Knowledge | /5       | /5          | /5             | /5       |
| 4. Proactive Discovery | /5       | /5          | /5             | /5       |
| 5. New Contributor     | /5       | /5          | /5             | /5       |
| **Total**              | /25      | /25         | /25            | /25      |
| **Tokens (per prompt)**| —        | —           | —              | —        |

### Fill Tests (empty DB — measure what agents store)

> Start with empty memory. Run a coding session. Measure what each tool captured and how useful it is for a follow-up session.

**Setup:** Empty DB for each tool. For bare Cursor, clear `.cursor/rules/` and Cursor Memories.

**Fill Session (same prompt for all setups):**

```
I'm working on src/memory/store.ts and src/memory/recall.ts. Here are some things to know:
- better-sqlite3 is synchronous — never use await with db calls
- SQLite uses WAL mode — never switch to DELETE journal mode
- Keep files under 150 lines, split even if used once
- Recall engine uses parent scope inheritance — memory scoped to src/components/** matches src/components/dashboard/**
- We use vitest not jest

Now add a new method `pruneOld(days: number)` to MemoryStore that deletes memories older than N days. Write a test too.
```

During the session, correct the agent once: "No, don't use `new Date()` for SQLite comparison — use `datetime('now', '-N days')` in the SQL query."

**After the fill session, inspect what was stored:**

| What to measure | B (Bare) | D (ConPort) | F (mcp-memory) | H (AIDE) |
|-----------------|----------|-------------|-----------------|----------|
| Memories/items stored | count | count | count | count |
| Stored the sync API fact? | y/n | y/n | y/n | y/n |
| Stored the WAL mode fact? | y/n | y/n | y/n | y/n |
| Stored the 150-line preference? | y/n | y/n | y/n | y/n |
| Stored the datetime correction? | y/n | y/n | y/n | y/n |
| Stored with correct scope? | n/a | n/a (no scopes) | n/a (no scopes) | y/n |
| Stored unprompted (agent initiative)? | n/a | y/n | y/n | y/n |
| Tokens used (per prompt) | — | — | — | — |

**Recall Session (follow-up, new chat):**

```
I need to add a `archiveOld(days: number)` method to MemoryStore — similar to pruneOld but sets status to 'archived' instead of deleting. Write a test too.
```

**Score the follow-up:**

| Dimension | B (Bare) | D (ConPort) | F (mcp-memory) | H (AIDE) |
|-----------|----------|-------------|-----------------|----------|
| Used sync API (no await)? | y/n | y/n | y/n | y/n |
| Used `datetime()` SQL pattern? | y/n | y/n | y/n | y/n |
| Used vitest (not jest)? | y/n | y/n | y/n | y/n |
| Corrections needed | count | count | count | count |
| Tokens used (per prompt) | — | — | — | — |

**What this tells us:**
- If bare Cursor/Claude gets it right by reading code → memory tools don't help for code-inferable facts
- If AIDE stores with scopes but ConPort/mcp-memory don't → scoping is our real differentiator
- If agents don't call `aide_remember` unprompted → we have a tool adoption problem
- If the datetime correction isn't stored by anyone → agents don't capture corrections (the hardest, most valuable case)


### ConPort setup for Cursor

```bash
pip install conport
```

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "conport": {
      "command": "python",
      "args": ["-m", "conport.mcp_server"]
    }
  }
}
```

### mcp-memory-service setup for Cursor

Requires Homebrew Python 3.12 on macOS (system Python 3.11 breaks sqlite-vec):

```bash
brew install python@3.12
python3.12 -m venv ~/.venvs/mcp-memory
source ~/.venvs/mcp-memory/bin/activate
pip install mcp-memory-service 'transformers<5.0' 'sentence-transformers<4.0'
```

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "mcp-memory-service": {
      "command": "/Users/meky/.venvs/mcp-memory/bin/python",
      "args": ["-m", "mcp_memory_service"]
    }
  }
}
```

---

## Claude Code E2E Test Script

> Run these in a fresh `claude` session in the aide-v0 directory. The `.mcp.json` MCP config auto-loads aide-memory.
> **Pre-flight check:** Start a session and ask "what MCP tools do you have?" — you should see aide_recall, aide_remember, aide_forget, aide_memories, aide_import.

### Test A: Recall works (warm-up)

**Prompt:**

```
I'm about to work on src/memory/store.ts. Before I start, call aide_recall with that path to get any relevant context.
```

**What to check:**

- Agent calls `aide_recall` with `paths: ["src/memory/store.ts"]`
- Output includes: "better-sqlite3 is synchronous", "WAL mode", "Vitest not Jest"
- Output does NOT include CLI or analysis context
- Agent acknowledges the context before proceeding

### Test B: Technical knowledge retention (Scenario 3)

**Prompt:**

```
Add a new method to the MemoryStore class in src/memory/store.ts called `getStats()` that returns { totalActive, totalArchived, memoriesByLayer, memoriesByScope }. Write a vitest test for it too.
```

**What to check:**

- Agent calls `aide_recall` for `src/memory/store.ts` before writing code (or uses context from Test A)
- Uses synchronous `this.db.prepare(...).get()` — NOT `await`
- Test file uses `describe`/`it`/`expect` from vitest, NOT jest
- Does NOT accidentally switch journal mode
- Keeps implementation reasonable (no over-engineering)

### Test C: Style continuity (Scenario 1)

**Prompt:**

```
I want to add a new module src/memory/tags.ts for tagging memories with user-defined labels. Include a TagStore class with add, remove, list, and getByMemoryId methods.
```

**What to check:**

- Keeps file under 150 lines (preference memory is seeded)
- If it grows, splits into separate files (seeded preference)
- Follows composition pattern, not conditionals (seeded preference)
- Doesn't tie into old AIDE terminology (seeded preference)

### Test D: Proactive discovery (Scenario 4)

**Prompt:**

```
Add a new MCP tool called aide_stats that returns memory statistics (count per layer, most recalled, least recently used).
```

**What to check:**

- Agent calls `aide_recall` for `src/memory/server.ts` area
- Gets context: "MCP tools registered with server.tool() not server.setRequestHandler()"
- Uses `server.tool()` pattern (not raw handler)
- Uses zod schemas for parameter validation (matching existing pattern)

### Test E: Remember works (store + recall loop)

**Prompt:**

```
Remember this for future sessions: "The tags module uses a separate SQLite table joined to memories via memory_id. Never store tags inline as JSON in the memories table." Scope it to src/memory/tags.ts.
```

Then in the same session:

```
I'm about to work on src/memory/tags.ts. Call aide_recall for that path.
```

**What to check:**

- Agent calls `aide_remember` with the fact
- `aide_recall` for `src/memory/tags.ts` returns the just-stored memory
- Also returns parent-scope memories for `src/memory/`**

### Test F: Cross-area isolation (critical)

**Prompt:**

```
I want to add a new CLI command `aide stats`. Call aide_recall for src/cli/commands/stats.ts to get context.
```

**What to check:**

- Returns: "Each CLI command gets its own file in src/cli/commands/"
- Returns: Commander.js technical context
- Does NOT return: SQLite WAL mode, better-sqlite3, MCP server.tool() pattern
- Agent follows the file-per-command pattern

### Results — Recall Tests (pre-seeded, with aide-memory)

**Session:** Claude Code 2.1.63, Feb 28 2026, feature/agent-memory branch, 27 memories seeded.

| Test                    | Pass/Fail | Notes |
| ----------------------- | --------- | ----- |
| A: Recall works         | PASS | Called `aide_recall({ paths: ["src/memory/store.ts"] })` when asked. Returned WAL mode, sync API, standalone module, 150-line pref, composition. No CLI/analysis noise. Clean summary. |
| B: Technical knowledge  | PASS | Used context from Test A (didn't re-call). `getStats()` uses sync `db.prepare().get()` — no await. Tests use vitest. 24/24 pass. |
| C: Style continuity     | PASS* | `tags.ts` = 60 lines. Composition pattern. No old terminology. *But agent entered PlanMode + Explore agent instead of calling aide_recall. Asked valid design question (shared vs own DB) our memories didn't cover. Preferences were in context from Test A. |
| D: Proactive discovery  | MIXED | Did NOT call `aide_recall` for server.ts. Read code directly instead. DID use correct `server.tool()` + zod pattern — but from reading code, not memory. 12/12 tests pass. |
| E: Remember loop        | PASS | Called `aide_remember` when told. Stored as memory #30 with correct scope (`src/memory/tags.ts`), layer (`technical`), and added a useful `why` field unprompted. |
| F: Cross-area isolation | PASS | Called `aide_recall({ paths: [...cli paths...], query: "CLI command structure" })`. Returned CLI context + Commander.js. Did NOT return WAL mode, better-sqlite3, or server.tool(). Perfect isolation. `stats.ts` = 73 lines, own file, follows pattern. 46/46 tests pass. |

### MCP Tool Call Summary

| Call # | Tool | Trigger | Proactive? |
|--------|------|---------|------------|
| 1 | `aide_recall` | Test A: user said "call aide_recall" | No |
| 2 | `aide_remember` | Test E: user said "remember this" | No |
| 3 | `aide_recall` | Test F: user said "call aide_recall" | No |

**Total MCP calls: 3. Proactive calls: 0.**

### Observations

**What's going well:**
- Recall output is clean, scoped, and accurate every time it's called
- Path isolation works perfectly — CLI recall has zero memory-area noise, and vice versa
- Agent follows recalled context throughout the session — sync API, vitest, 150-line pref, file-per-command pattern all respected
- Code quality is high — 60-line tags.ts, 73-line stats.ts, proper zod schemas, all tests pass
- `aide_remember` stores with correct layer, scope, and even adds a useful `why` field unprompted
- Agent expanded recall paths intelligently in Test F (added parent dirs + query keyword)
- Plan mode question (shared DB?) was a valid architectural gap — shows where memory can grow

**What's mid:**
- Agent only called tools when explicitly told to (Tests A, E, F) — never proactively
- For Tests B, C, D, it relied on context already in the conversation window from the first recall
- The recalled preferences DID influence behavior — but we can't separate "agent followed memory" from "agent would have done this anyway from reading code"
- Agent never stored decisions it made during the session (shared-DB pattern, getStats shape, tags schema) — these would be valuable for future sessions

**What's bad:**
- **Zero proactive tool calls.** Agent treats aide-memory as a tool it uses when told, not something it reaches for on its own. This is the critical adoption problem.
- **Zero unprompted aide_remember calls.** Agent made several decisions worth storing but stored none of them.
- Test D: agent read `server.ts` directly and got the same `server.tool()` pattern without memory. Code-readable knowledge has low memory value.
- Single-session testing is insufficient — Tests B-D got correct results partly because Test A's recall was still in the conversation context.

### Key Takeaways

1. **The recall engine works.** When called, it returns exactly the right context, properly scoped, cleanly formatted. The implementation is solid.
2. **The adoption problem is the bottleneck.** The agent will use tools when told but never reaches for them on its own. This isn't AIDE-specific — it's a fundamental MCP tool adoption problem.
3. **Single-session testing masks the real value.** Tests B-D succeeded partly because Test A's context was still in the window. The real test is a NEW session with no prior context.
4. **Code-readable knowledge has low memory value.** Patterns like `server.tool()` are discoverable by reading code. Memory adds most value for non-obvious constraints (WAL mode, 150-line preference) that can't be inferred from code alone.
5. **The agent needs to be told to remember.** Even after corrections, the agent doesn't store them. The "learning from corrections" use case requires explicit prompting or auto-hooks.

### Token Usage (Test Session)

From `/context` at 35% usage (70k/200k tokens, after 6 test prompts + responses):

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | 3.4k | 1.7% |
| System tools (built-in) | 17.4k | 8.7% |
| **MCP tools (aide-memory, 5 tools)** | **1.2k** | **0.6%** |
| Memory files (MEMORY.md) | 727 | 0.4% |
| Skills | 164 | 0.1% |
| Messages (conversation) | 49.2k | 24.6% |
| Free space | 95k | 47.4% |
| Autocompact buffer | 33k | 16.5% |

**MCP tool overhead is negligible** — 1.2k tokens (0.6%) for 5 tool definitions at ~242 tokens each. That's 14x less than built-in tools (17.4k). Adding aide-memory tools costs virtually nothing in context budget.

### Adoption Fix: Recommended Mitigations

The core problem: agent has the tools but doesn't use them unless told. Here are mitigations ranked by practicality:

**Tier 1 — Do now (no code changes)**

1. **Add CLAUDE.md rules** — Create `.claude/rules/aide-memory.md` with glob frontmatter scoping to all files. Instructions like:
   - "When starting work on files you haven't touched yet in this session, call `aide_recall` with those file paths first"
   - "When the user corrects your approach or teaches you something about the codebase, call `aide_remember` to store it"
   - "Don't call aide_recall for files you've already recalled context for in this session"
   This uses the platform's own rule injection — the agent sees it in its system prompt every turn. Low overhead, no code changes.

2. **Better tool descriptions** — Current description says "Call this when starting work in a codebase area." Change to something more directive: "IMPORTANT: Call this tool before reading or modifying files in a new area. Returns critical constraints and preferences that affect how code should be written." Test if stronger language changes behavior.

**Tier 2 — Build soon (light code changes)**

3. **Claude Code hooks** — Use the `PreToolUse` hook to auto-inject `aide_recall` results when the agent calls `Read` or `Edit` on a file. The agent never needs to call the tool — context arrives automatically. This is the most seamless UX but requires hook implementation.

4. **Session-start auto-recall** — Add a startup hook that calls `aide_recall` with the current working directory and injects project-wide context at session start. Agent gets preferences/guidelines without asking.

**Tier 3 — Explore later (bigger changes)**

5. **Correction detection** — Monitor user messages for correction patterns ("no, don't...", "actually...", "use X instead of Y") and auto-call `aide_remember`. This is the hardest to build reliably but the most valuable — it captures the knowledge the user is teaching without them having to say "remember this."

6. **Wrapper/proxy approach** — Instead of an MCP server the agent calls, build a transparent proxy that intercepts the agent's file reads and injects memory context as comments or annotations. Agent never knows memory exists — it just sees better file contents.

### Adoption Fixes Applied (Feb 28 2026)

**1. CLAUDE.md rules (`.claude/rules/aide-memory.md`)** — Added project rule with `globs: "**/*"` that tells the agent:
- Call `aide_recall` before working on files in a new area (not every file, not trivially)
- Call `aide_remember` when user corrects approach, decisions are made, or non-obvious constraints discovered
- Don't over-use: skip for already-recalled areas, trivial changes, or obvious-from-code facts

**2. Stronger tool descriptions** — Updated `aide_recall` from passive ("Call this when starting work...") to directive ("IMPORTANT: Call this before reading or modifying files... Failing to check may cause you to violate established patterns"). Updated `aide_remember` with explicit numbered trigger list.

**Next test:** Run same-style scenarios in a fresh session with these rules active. Measure if proactive tool call count increases from 0.

---

### Round 2 — Guided Test Runbook

**What we're comparing:** Bare Claude Code (no memory tools) vs AIDE + rules (MCP tools + system prompt nudge).

**Why new prompts:** Round 1 prompts created code that now exists (getStats, TagStore, aide_stats, etc.). We use equivalent new prompts that test the same skills on different features.

**Why not clear auto-memory:** Claude's MEMORY.md is project-scoped and shared across ALL sessions — there's no per-session clear. Using new prompts avoids cross-session knowledge contamination.

**What's already done:** Round 1 tested AIDE without rules (S3) and found 0 proactive tool calls. Round 2 tests bare (Run A) and AIDE with rules (Run B) to measure if rules fix the adoption problem.

---

#### Run A: Bare Claude Code

> No memory tools. No rules. Baseline for what the agent does on its own.

**Setup (do all of these before starting the session):**

```bash
# 1. Disable aide-memory MCP server
mv .mcp.json .mcp.json.bak

# 2. Disable aide-memory rules
mv .claude/rules/aide-memory.md .claude/rules/aide-memory.md.bak

# 3. Start a fresh Claude Code session
claude
```

**Pre-flight check:** Ask "what MCP tools do you have?" — it should say **none** (or not mention aide-memory).

---

**Prompt A-1: Technical knowledge**

Paste this:

```
Add a new method `pruneOld(days: number)` to MemoryStore in src/memory/store.ts that deletes memories older than N days. Write a vitest test for it too.
```

Fill this after:

| Dimension | Result |
|-----------|--------|
| Used sync API (no `await`)? | |
| Used `datetime()` SQL (not JS Date)? | |
| Test uses vitest (not jest)? | |
| Respected WAL mode? | |
| Corrections needed | |
| Notes | |

---

**Prompt A-2: Style continuity**

Paste this:

```
Add a new module src/memory/scopes.ts — a ScopeResolver class that resolves glob patterns to concrete file paths. Include resolve, validate, and expand methods. Write vitest tests.
```

Fill this after:

| Dimension | Result |
|-----------|--------|
| File under 150 lines? | |
| Used composition (not conditionals)? | |
| Split if too large? | |
| Test uses vitest? | |
| Corrections needed | |
| Notes | |

---

**Prompt A-3: Proactive discovery**

Paste this:

```
Add a new MCP tool called aide_search to src/memory/server.ts that searches memory content by keyword substring match, with an optional layer filter. Return matching memories as markdown.
```

Fill this after:

| Dimension | Result |
|-----------|--------|
| Used `server.tool()` pattern? | |
| Used zod schemas for params? | |
| Followed existing tool style? | |
| Test uses vitest? | |
| Corrections needed | |
| Notes | |

---

**Prompt A-4: Cross-area isolation**

Paste this:

```
Add a new CLI command `aide search` in src/cli/commands/search.ts that searches memories by keyword and prints results. Follow the existing command patterns.
```

Fill this after:

| Dimension | Result |
|-----------|--------|
| Own file in src/cli/commands/? | |
| Followed Commander.js pattern? | |
| Didn't reference memory internals? | |
| Test uses vitest? | |
| Corrections needed | |
| Notes | |

---

**After Run A — record token usage:**

Run `/context` and fill:

| Category | Tokens | % |
|----------|--------|---|
| System prompt | | |
| System tools | | |
| MCP tools | | |
| Messages | | |
| Free space | | |

**Reset for Run B:**

```bash
# Undo code changes from Run A
git checkout -- .

# Restore aide-memory
mv .mcp.json.bak .mcp.json
mv .claude/rules/aide-memory.md.bak .claude/rules/aide-memory.md
```

---

#### Run B: AIDE + Rules

> Full aide-memory: MCP tools active, rules file active, 27+ memories seeded.

**Setup (do all of these before starting the session):**

```bash
# 1. Verify .mcp.json exists (restored above)
cat .mcp.json  # should show aide-memory config

# 2. Verify rules file exists
cat .claude/rules/aide-memory.md  # should show aide-memory rules

# 3. Verify memories are seeded
sqlite3 ~/.aide/projects/f126df15177d/memory.db "SELECT count(*) FROM memories WHERE status='active'"
# Should be >= 27. If 0, re-seed:
# npx ts-node src/memory/__tests__/seed-project.ts

# 4. Start a fresh Claude Code session
claude
```

**Pre-flight check:** Ask "what MCP tools do you have?" — should list aide_recall, aide_remember, aide_forget, aide_memories, aide_import.

---

**Prompt B-1: Technical knowledge**

Paste this (same as A-1):

```
Add a new method `pruneOld(days: number)` to MemoryStore in src/memory/store.ts that deletes memories older than N days. Write a vitest test for it too.
```

Results:

| Dimension | Result |
|-----------|--------|
| Called `aide_recall` before coding? | **YES** — `aide_recall({ paths: ["src/memory/store.ts", "src/memory/__tests__/store.test.ts"], query: "MemoryStore methods delete" })` |
| Called it proactively (not told to)? | **YES** — prompt never mentioned aide_recall. Agent called it on its own before reading any code. |
| Used sync API (no `await`)? | **YES** — `this.db.prepare('DELETE FROM memories WHERE created_at < ?').run(cutoff)` — pure sync. |
| Used `datetime()` SQL (not JS Date)? | **NO** — Used `new Date(Date.now() - days * 86_400_000).toISOString()` (JS Date, not SQL `datetime()`). Functionally correct but not the SQL-native pattern. |
| Test uses vitest (not jest)? | **YES** — `describe`/`it`/`expect` from vitest. |
| Respected WAL mode? | **YES** — no journal mode changes. |
| Called `aide_remember` for anything? | **NO** — made decisions (ISO timestamp approach, edge case handling) but didn't store any. |
| Corrections needed | **0** from user. Agent self-corrected a `days=0` edge case (test assumed freshly created memories would have `created_at < now` but ISO string comparison made them equal). Fixed by using backdated timestamps in test. |
| Notes | 27 tests pass (24 existing + 3 new). Recall returned full scoped context: area_context (standalone module, test counts, layer ordering), technical (WAL mode, sync API, vitest), preferences (150-line, composition, no old terminology), guidelines (separate variants). Agent's first action was aide_recall — **this is the first proactive MCP call across all testing.** |

**aide_recall output received by agent:**
```
## Area Context
- 47 tests across store (20), recall (18), server (9) — all passing [src/memory/__tests__/**]
- Layer ordering on output: area_context first, then technical, then preferences, then guidelines [src/memory/**]
- Path-scoped recall is the core retrieval model [src/memory/**]
- aide-memory is a standalone module — no dependencies on old AIDE modules [src/memory/**]

## Technical Context
- SQLite uses WAL mode — never switch to DELETE journal mode [src/memory/**]
- better-sqlite3 is synchronous — do not use await with db calls [src/memory/**]
- Build with tsc -> dist/, dev with npm run dev -- [args]
- Vitest not Jest — use describe/it from vitest, not @jest globals

## Preferences
- New code should not be tied to old AIDE terminology (from meky)
- User prefers autonomous long-running work (from meky)
- Composition over conditionals for component/module variants (from meky)
- Keep files under 150 lines — split even if used once (from meky)

## Guidelines
- All subagents must use opus model
- Create new branches per phase to preserve stable points
- Separate variants into their own files
```

**Code produced:**
```ts
// src/memory/store.ts — pruneOld method (4 lines)
pruneOld(days: number): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = this.db.prepare('DELETE FROM memories WHERE created_at < ?').run(cutoff);
  return result.changes;
}
```

---

**Prompt B-2: Style continuity**

Paste this (same as A-2):

```
Add a new module src/memory/scopes.ts — a ScopeResolver class that resolves glob patterns to concrete file paths. Include resolve, validate, and expand methods. Write vitest tests.
```

Results:

| Dimension | Result |
|-----------|--------|
| Called `aide_recall` before coding? | **NO** — entered PlanMode + 2 subagents (Explore, Plan) instead. Read all src/memory/ files directly. |
| Called it proactively (not told to)? | **NO** — skipped aide_recall entirely. |
| File under 150 lines? | **YES** — `scopes.ts` = 57 lines. Well within the 150-line preference. |
| Used composition (not conditionals)? | **YES** — three focused methods (`validate`, `resolve`, `expand`), no conditional branching between variants. |
| Split if too large? | **N/A** — file stayed small (57 lines). |
| Test uses vitest? | **YES** — `describe`/`it`/`expect` from vitest. 24 tests, all passing. |
| Called `aide_remember` for anything? | **NO** — made decisions (fast-glob over hand-rolled matching, validation rules, ValidationResult interface) but stored none. |
| Corrections needed | **0** — 24/24 tests pass on first run. Pre-existing type error in e2e-comparison.test.ts (unrelated). |
| Notes | Agent entered PlanMode, spawned Explore agent (68K tokens, 27 tool uses, 118s) to read all memory module files + test patterns + glob usage across codebase. Then spawned Plan agent (49K tokens, 25 tool uses, 125s) to design the API. Approved plan, then wrote code in 2 files + barrel export update. Test file is 155 lines (above 150-line pref, but it's a test file). Used `fast-glob` (existing dependency, unused in memory module until now). `validate()` checks: non-empty, relative path, no `..`, no `!` negation, max 500 chars. |

**Code produced:**
```ts
// src/memory/scopes.ts — ScopeResolver class (57 lines)
export class ScopeResolver {
  readonly rootDir: string;
  constructor(rootDir: string) { this.rootDir = path.resolve(rootDir); }
  validate(pattern: string): ValidationResult { /* syntax checks */ }
  resolve(pattern: string): string[] { /* single glob → relative file paths via fast-glob sync */ }
  expand(patterns: string[]): string[] { /* multi-pattern → deduped results */ }
}
```

---

**Prompt B-3: Proactive discovery**

Paste this (same as A-3):

```
Add a new MCP tool called aide_search to src/memory/server.ts that searches memory content by keyword substring match, with an optional layer filter. Return matching memories as markdown.
```

Results:

| Dimension | Result |
|-----------|--------|
| Called `aide_recall` before coding? | **YES** — `aide_recall({ paths: ["src/memory/server.ts"], query: "MCP tool registration pattern" })` |
| Called it proactively (not told to)? | **YES** — first action, unprompted. Second consecutive proactive call (B-1 also). |
| Used `server.tool()` pattern? | **YES** — followed exact `server.tool(name, description, schema, handler)` pattern. |
| Used zod schemas for params? | **YES** — `z.string()`, `z.enum(LAYER_VALUES).optional()`, `z.number().optional()`. |
| Followed existing tool style? | **YES** — markdown output grouped by layer, same `groupByLayer` + `formatLayerName` helpers, matching description style. |
| Test uses vitest? | **YES** — 12 new tests (7 store + 5 server), all passing. 51 total (34 store + 17 server). |
| Called `aide_remember` for anything? | **NO** — added `search()` method to store, new MCP tool, new test patterns, but stored none. |
| Corrections needed | **0** — all 51 tests pass on first run. Clean implementation. |
| Notes | Recall returned `"MCP tools registered with server.tool() not server.setRequestHandler()"` — the exact memory seeded for this scenario. Agent also got `"MCP SDK v1.27.1 — use McpServer class"`, sync API constraint, vitest preference. Unlike B-2, agent did NOT enter PlanMode — went straight to recall → read → implement. Direct tasks → aide_recall works. Complex tasks (B-2) → PlanMode bypasses it. |

**aide_recall output received by agent:**
```
## Area Context
- MCP tools registered with server.tool() not server.setRequestHandler() [src/memory/server.ts]
- Layer ordering on output: area_context first, then technical, then preferences, then guidelines [src/memory/**]
- Path-scoped recall is the core retrieval model [src/memory/**]
- aide-memory is a standalone module [src/memory/**]

## Technical Context
- MCP SDK v1.27.1 — use McpServer class, not low-level Server [src/memory/server.ts]
- SQLite uses WAL mode — never switch to DELETE journal mode [src/memory/**]
- better-sqlite3 is synchronous — do not use await with db calls [src/memory/**]
- Vitest not Jest
...
```

**Code produced:**
```ts
// store.ts — search method (~15 lines)
search(keyword: string, options?: { layer?: MemoryLayer; limit?: number }): Memory[] {
  // SQL LIKE on both what and why, case-insensitive, optional layer filter
}

// server.ts — aide_search tool
server.tool('aide_search', description, { keyword, layer?, limit? }, handler)
// Returns markdown grouped by layer, same format as aide_recall
```

---

**Prompt B-4: Cross-area isolation**

Paste this (same as A-4):

```
Add a new CLI command `aide search` in src/cli/commands/search.ts that searches memories by keyword and prints results. Follow the existing command patterns.
```

Results:

| Dimension | Result |
|-----------|--------|
| Called `aide_recall` before coding? | **YES** — `aide_recall({ paths: ["src/cli/commands/", "src/cli/index.ts"], query: "CLI command registration pattern" })` |
| Called it proactively (not told to)? | **YES** — first action, unprompted. Third proactive call across 4 prompts. |
| Recall returned CLI context (not memory-area)? | **YES** — returned "Each CLI command gets its own file", "Commander.js for CLI", "Available commands: scan, rules, check". Did NOT return WAL mode, better-sqlite3, or MCP server.tool(). **Perfect cross-area isolation.** |
| Own file in src/cli/commands/? | **YES** — `src/cli/commands/search.ts` (52 lines). |
| Followed Commander.js pattern? | **YES** — `.command('search').description().argument().option().action()` matching existing pattern. Registered in `src/cli/index.ts`. |
| Test uses vitest? | **NO TESTS WRITTEN** — agent did CLI smoke test (`aide search --help`, `aide search SQLite`) but no vitest test file. |
| Called `aide_remember` for anything? | **NO** — 0/4 across entire run. |
| Corrections needed | **0** — `aide search SQLite` returned 3 correct results on first try. Type-check clean (only pre-existing e2e error). |
| Notes | Recall returned 4 layers of context (area, technical, preferences, guidelines) all scoped to CLI area. Agent read `stats.ts` as the closest example and matched its pattern exactly: imports MemoryStore, try/finally with store.close(), logInfo output. 52-line file well under 150-line preference. CLI help and live search both work. Only gap: no vitest test file created despite prompt saying "Write vitest tests" — agent used smoke testing instead. |

**aide_recall output received by agent:**
```
## Area Context
- Each CLI command gets its own file in src/cli/commands/ [src/cli/commands/**]
- Available commands: scan (31/100 score), rules, check — registered in src/cli/index.ts [src/cli/**]

## Technical Context
- Commander.js for CLI — commands registered in src/cli/index.ts [src/cli/**]
- Build with tsc -> dist/, dev with npm run dev -- [args]
- Vitest not Jest

## Preferences
- New code should not be tied to old AIDE terminology (from meky)
- Composition over conditionals (from meky)
- Keep files under 150 lines (from meky)

## Guidelines
- All subagents must use opus model
- Create new branches per phase to preserve stable points
- Separate variants into their own files
```

**Code produced:**
```ts
// src/cli/commands/search.ts (52 lines)
export function searchMemories(projectPath: string, keyword: string, options: SearchOptions = {}): void {
  const store = new MemoryStore(projectPath);
  try {
    const results = store.search(keyword, { layer, limit });
    // Output: [id] Layer | what [scope] + optional Why: line
  } finally {
    store.close();
  }
}
```

**Live smoke test output:**
```
$ aide search SQLite
Found 3 memories matching "SQLite":
  [30] Technical | The tags module uses a separate SQLite table... [src/memory/tags.ts]
  [2] Technical | SQLite uses WAL mode — never switch to DELETE journal mode [src/memory/**]
  [1] Technical | better-sqlite3 is synchronous — do not use await with db calls [src/memory/**]
```

---

**After Run B — record token usage:**

Run `/context` and fill:

| Category | Tokens | % |
|----------|--------|---|
| System prompt | | |
| System tools | | |
| MCP tools | | |
| Messages | | |
| Free space | | |

---

#### Side-by-Side Comparison

Fill this after both runs:

| Dimension | Run A (Bare) | Run B (AIDE + Rules) | Round 1 S3 (AIDE no rules) |
|-----------|-------------|---------------------|---------------------------|
| Total corrections needed | | | 0 |
| Used sync API correctly | /4 | /4 | 4/4 (from Test A recall) |
| Used vitest correctly | /4 | /4 | 4/4 |
| Proactive aide_recall calls | n/a | /4 | 0/4 |
| Proactive aide_remember calls | n/a | count | 0 |
| Code quality (1-5 avg) | | | |
| Token usage (total) | | | 70k |

#### Decision Criteria

After filling the comparison:

- **Rules fix adoption?** → Run B has >0 proactive `aide_recall` calls (vs 0 in round 1 S3)
- **Adoption still broken?** → Run B still has 0 proactive calls → need hooks/wrapper approach (Tier 2)
- **Memory tools add value?** → Run B produces measurably fewer corrections or better code than Run A
- **Memory tools don't matter?** → Run A and Run B have similar quality → code-reading is enough, reconsider product
- **Go/no-go:** If Run B is clearly better than Run A AND rules drive proactive usage, aide-memory justifies itself. Otherwise, pivot to hooks or stop.

**What are hooks?** Claude Code hooks are shell commands that fire on events like `PreToolUse` (before agent calls Read/Edit), `PostToolUse`, or `UserPromptSubmit`. Configured in `.claude/settings.json`. If rules don't fix adoption, hooks could auto-inject `aide_recall` results before every file read — the agent gets context without having to call anything. That's a Tier 2 fix if rules aren't enough.

#### Round 2 — Observations

> Run B (AIDE + Rules) complete. Run A (Bare) not yet tested.

**MCP Tool Call Summary (Run B so far):**

| Call # | Tool | Prompt | Proactive? |
|--------|------|--------|------------|
| 1 | `aide_recall` | B-1: pruneOld | **YES** — `paths: [store.ts, store.test.ts], query: "MemoryStore methods delete"` |
| — | (none) | B-2: ScopeResolver | **SKIPPED** — entered PlanMode + Explore/Plan subagents |
| 2 | `aide_recall` | B-3: aide_search tool | **YES** — `paths: [server.ts], query: "MCP tool registration pattern"` |
| 3 | `aide_recall` | B-4: aide search CLI | **YES** — `paths: [src/cli/commands/, src/cli/index.ts], query: "CLI command registration pattern"` |

**Proactive aide_recall: 3/4.** (Round 1 without rules: 0/6.)
**Proactive aide_remember: 0/4.** (Round 1: 0/6. No change.)

**What's going well:**
- **Rules fix adoption.** 3/4 prompts got proactive `aide_recall` as the first action — vs 0/6 in round 1 without rules. The `.claude/rules/aide-memory.md` file works.
- **Intelligent query boosting every time.** B-1: `"MemoryStore methods delete"`. B-3: `"MCP tool registration pattern"`. B-4: `"CLI command registration pattern"`. Agent tailors the query to surface relevant memories.
- **Recalled memory directly influenced code.** B-3: `"MCP tools registered with server.tool()"` → agent used `server.tool()`. B-4: `"Each CLI command gets its own file"` → agent created own file. Not just correlation — the recalled facts were actionable.
- **Perfect cross-area isolation (B-4).** CLI recall returned CLI context only. No WAL mode, no better-sqlite3, no MCP server.tool(). Path scoping works exactly as designed.
- **Consistent quality.** All 4 prompts: sync API, vitest (except B-4 skip), correct patterns. Zero corrections from user. Clean code.
- **Pattern: direct tasks → aide_recall, complex tasks → PlanMode.** B-1/B-3/B-4 (direct) → aide_recall. B-2 (add module) → PlanMode. Agent self-selects.

**What's mid:**
- **PlanMode bypassed aide_recall (B-2).** Explore subagents burned 118K tokens and ~4 minutes reading code. aide_recall would have returned context in 15ms / 1.2K tokens. But code quality was still excellent — PlanMode isn't bad, just expensive.
- **B-4 skipped vitest tests.** Prompt said "follow existing command patterns" and agent interpreted that as CLI smoke testing (`aide search --help`, `aide search SQLite`) rather than vitest tests. The recalled context said "Vitest not Jest" but agent chose a different test approach for CLI commands. This is defensible but notable.
- **JS Date vs SQL datetime() (B-1).** Correct but not SQL-native. A memory about preferring SQL datetime() functions would have helped.

**What's bad:**
- **Zero aide_remember calls across all 4 prompts.** Agent made decisions (JS Date approach, fast-glob, ValidationResult, SQL LIKE pattern, CLI output format) and discovered constraints (ISO string edge case) but stored nothing. The "learning from work" loop is completely broken.
- **PlanMode bypasses memory for complex tasks.** 1/4 prompts got PlanMode instead of aide_recall. Subagents don't call MCP tools.

**Run B Final Summary:**
1. **aide_recall adoption: 3/4 proactive** (75%). Rules are the fix. Round 1 was 0/6 (0%).
2. **aide_remember adoption: 0/4** (0%). Rules are not enough. Needs hooks or auto-detection.
3. **Cross-area isolation: confirmed.** B-4 proved CLI recall doesn't leak memory-area context.
4. **Recalled context → code quality: confirmed.** B-3 (`server.tool()`) and B-4 (file-per-command, Commander.js) both used recalled patterns.
5. **PlanMode competes with aide_recall.** Complex tasks bypass memory. This limits aide_recall to direct tasks (the majority, but not all).
6. **No test file for B-4.** Agent used smoke testing instead of vitest for CLI command. Minor gap.

#### Recommendations — Fixing the Remaining Issues

**Issue 1: PlanMode bypasses aide_recall (B-2)**

The agent enters PlanMode → spawns Explore/Plan subagents → subagents read code directly → aide_recall never called. This is a structural problem: subagents don't inherit MCP tool access or see `.claude/rules/`.

| Fix | Effort | Impact | Notes |
|-----|--------|--------|-------|
| **A. Rules language: "Even when planning, call aide_recall first"** | Low | Uncertain | The main agent sees the rule but chose PlanMode anyway. Adding "before entering plan mode" language might help since the main agent makes the PlanMode decision. Worth trying first. |
| **B. PreToolUse hook on EnterPlanMode** | Medium | High | A Claude Code hook that fires when `EnterPlanMode` is called, auto-injects aide_recall results into the conversation. Agent gets memory context before the plan starts, and subagents inherit it as conversation history. |
| **C. PreToolUse hook on Read/Edit** | Medium | Highest | Instead of relying on the agent to call aide_recall, inject scoped memory context whenever ANY file is read. Works for both main agent and subagents. The agent never needs to call aide_recall — context arrives automatically as file annotations. This is the most seamless fix and makes PlanMode vs direct irrelevant. |
| **D. Make subagents MCP-aware** | Hard | Depends on Claude Code | Would require Claude Code to pass MCP tools to spawned subagents. Not something we control — would need to be a feature request. |

**Recommended path:** Try A first (cheapest). If PlanMode still skips recall, implement C (PreToolUse hook on Read). Hook C is the long-term answer regardless because it eliminates the adoption question entirely — the agent gets memory context without having to ask for it.

**Issue 2: aide_remember never called (0/4)**

The agent makes decisions and discovers constraints during coding but never stores them. The rules say "call aide_remember when you discover a non-obvious constraint" but the agent doesn't comply.

| Fix | Effort | Impact | Notes |
|-----|--------|--------|-------|
| **A. Stronger rules language** | Low | Low | Rules already say when to remember. Adding more emphasis ("You MUST call aide_remember...") might help marginally but agents tend to ignore tool instructions they don't see as essential to completing the task. |
| **B. PostToolUse hook on Edit** | Medium | Medium | After every file edit, a hook prompts: "Did you learn something non-obvious? If so, call aide_remember." This is a nudge at the moment of action. Downside: annoying if triggered too often. |
| **C. UserPromptSubmit hook for correction detection** | Medium | High | When the user sends a message, a hook scans for correction patterns ("no, don't...", "actually...", "use X instead of Y") and auto-calls aide_remember with the correction. Captures the highest-value knowledge (user corrections) without agent involvement. |
| **D. End-of-task reflection** | Medium | Medium | After the agent completes a task, auto-inject: "Before finishing, review what you learned during this task and call aide_remember for any non-obvious insights." This is a prompt-based approach at the natural pause point. |
| **E. Sidecar agent** | Hard | Highest | A separate background process monitors the conversation and independently decides what to store. The coding agent never needs to call aide_remember — the sidecar does it. Most robust but most complex. |

**Recommended path:** Try D first (end-of-task reflection prompt via rules). If that's not enough, implement C (correction detection hook) — it targets the highest-value case. Long-term, E (sidecar) is the dream but requires significant infrastructure.

**Issue 3: B-4 skipped vitest tests**

Agent used CLI smoke testing instead of creating a vitest test file. Minor but shows that recalled "Vitest not Jest" preference didn't translate to "write vitest tests for everything."

| Fix | Effort | Impact |
|-----|--------|--------|
| **Seed a memory:** "Every new module gets a vitest test file, including CLI commands" | Low | Should work — agent follows explicit area_context memories well |
| **Update rules:** Add "always create vitest tests for new code" to aide-memory rules | Low | More universal but may over-trigger |

---

#### Run A Strategy — Stash, Compare, Commit

**Should we keep Run B's code changes?** Yes — the code is good (zero corrections, all tests pass, follows patterns). It improves the codebase.

**How to run the bare comparison:**

```bash
# 1. Commit Run B changes on a branch
git checkout -b round2-run-b
git add -A
git commit -m "Round 2 Run B: pruneOld, ScopeResolver, aide_search tool + CLI"

# 2. Go back to pre-test state for Run A
git checkout feature/agent-memory
# Code is now clean — no Run B changes

# 3. Disable aide-memory for bare test
mv .mcp.json .mcp.json.bak
mv .claude/rules/aide-memory.md .claude/rules/aide-memory.md.bak

# 4. Run bare session with same 4 prompts
claude

# 5. After Run A, commit those changes too
git checkout -b round2-run-a
git add -A
git commit -m "Round 2 Run A: same prompts, bare Claude Code (no memory tools)"

# 6. Compare the two branches
git diff round2-run-a..round2-run-b -- src/
```

**What this gives us:**
- **Code quality diff** — concrete artifact showing what aide-memory changed. Did Run B's code follow more patterns? Fewer anti-patterns? Better file structure?
- **Both branches preserved** — can go back to either.
- **feature/agent-memory stays clean** — both test branches are off it.

**Additional comparison metric: `git diff` analysis**

After both runs, compare:
- Lines of code per file (did both stay under 150?)
- Test coverage (did both write tests? vitest?)
- Pattern adherence (sync API, Commander.js, server.tool())
- File structure (own files vs inline?)

This is a stronger signal than pass/fail scorecards because it shows the actual code difference.

### Fill Test — Claude Code (empty DB, measure what agent stores)

> This tests whether the agent stores knowledge during a coding session, not just recalls it.

**Setup:**
```bash
rm ~/.aide/projects/f126df15177d/memory.db   # empty DB
# Keep .mcp.json and .claude/rules/aide-memory.md active
```

Start a fresh session.

**Fill prompt:**
```
I'm working on src/memory/store.ts and src/memory/recall.ts. Here are some things to know:
- better-sqlite3 is synchronous — never use await with db calls
- SQLite uses WAL mode — never switch to DELETE journal mode
- Keep files under 150 lines, split even if used once
- Recall engine uses parent scope inheritance — memory scoped to src/components/** matches src/components/dashboard/**
- We use vitest not jest

Now add a new method `pruneOld(days: number)` to MemoryStore that deletes memories older than N days. Write a test too.
```

During the session, correct the agent: "No, don't use `new Date()` for SQLite comparison — use `datetime('now', '-N days')` in the SQL query."

**After the fill session, check what was stored:**
```bash
sqlite3 ~/.aide/projects/f126df15177d/memory.db "SELECT id, layer, scope, substr(what,1,80) FROM memories WHERE status='active'"
```

| What to measure | With AIDE | Without AIDE (auto-memory only) |
|-----------------|-----------|-------------------------------|
| Items stored | count | check MEMORY.md |
| Stored sync API fact? | y/n | y/n |
| Stored WAL mode fact? | y/n | y/n |
| Stored 150-line pref? | y/n | y/n |
| Stored datetime correction? | y/n | y/n |
| Correct scopes? | y/n | n/a |
| Agent called aide_remember unprompted? | y/n | n/a |
| Token usage (`/context`) | — | — |

**Follow-up recall prompt (new session):**
```
I need to add a `archiveOld(days: number)` method to MemoryStore — similar to pruneOld but sets status to 'archived' instead of deleting. Write a test too.
```

| Dimension | With AIDE | Without AIDE |
|-----------|-----------|-------------|
| Used sync API (no await)? | y/n | y/n |
| Used `datetime()` SQL pattern? | y/n | y/n |
| Used vitest? | y/n | y/n |
| Corrections needed | count | count |
| Token usage (`/context`) | — | — |

**Key questions after all testing:**

1. Did the agent call `aide_recall` / `aide_remember` proactively, or only when told?
2. Did the recalled context visibly change the agent's code output?
3. Would the agent have gotten the same result by just reading existing code?
4. Did the agent store corrections (datetime pattern) — the hardest, most valuable case?
5. Token overhead: how much more did aide-memory sessions cost vs bare sessions?

---

## MCP Smoke Tests

**55 tests passing** (47 original + 8 new smoke tests against seeded DB).

```
src/memory/__tests__/
├── store.test.ts        # 20 tests — CRUD, migrations, WAL mode
├── recall.test.ts       # 18 tests — path scoping, glob inheritance, keyword boost
├── server.test.ts       # 9 tests  — tool registration, input validation
└── mcp-smoke.test.ts    # 8 tests  — full stack against real seeded DB (27 memories)
```

Run: `npm test -- --run src/memory/__tests__/`

---

## What's Next

1. ~~Self-host aide-memory on this codebase~~ — Done (`.mcp.json`, `.cursor/mcp.json`, 27+ memories seeded)
2. ~~MCP smoke tests~~ — Done (8 tests, full stack verified against seeded DB)
3. ~~Real agent testing round 1 (Claude Code)~~ — Done. 5 PASS / 1 MIXED. Core finding: zero proactive tool calls.
4. ~~Adoption fix~~ — Done. Added `.claude/rules/aide-memory.md` + stronger tool descriptions.
5. **Round 2 testing (Claude Code)** — Follow the "Round 2 — Guided Test Runbook" above. Run A (bare) then Run B (AIDE+rules). Fill the result tables after each prompt. Fill the side-by-side comparison at the end.
6. **Fill test (Claude Code)** — Empty DB session to test whether agent stores knowledge during work. See "Fill Test" section above.
7. **Real agent testing (Cursor)** — Execute the "Cursor E2E Test Plan" section above manually.
8. **Decision point** — After round 2 + fill testing, decide go/no-go based on the decision criteria in the runbook.
9. **If go:** Semantic discovery (cross-scope search), hooks integration, npm packaging.

