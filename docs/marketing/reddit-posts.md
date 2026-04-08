# Reddit Launch Posts

---

## r/ClaudeAI

**Title:** I built a memory layer for Claude Code that actually works (hooks-driven, not voluntary)

The core problem with every memory tool I tested: agents do not voluntarily save context. I tested 10 prompts with memory tools available -- zero voluntary aide_remember calls. Claude Code itself diagnosed this in an engram issue: "The tools are deferred... my trained behavior overrides the instruction."

So I built AIDE Memory with hooks instead of hoping. Four hooks fire automatically:

- **PreToolUse** -- before any file read, a ~20 token nudge: "8 memories exist for this path." The agent decides if they are relevant. Not a 2,000-token system prompt dump.
- **Stop** -- on task completion, prompts the agent to reflect. Hidden in additionalContext so you never see the memory management.
- **UserPromptSubmit** -- detects corrections ("no, don't use that pattern") and stores them scoped to the relevant path.
- **PreCompact** -- before context compaction, extracts planning decisions so they survive the context window squeeze.

Storage is one JSON file per memory in `.aide/memories/`, committed to your repo. Git syncs it. SQLite is just a local cache. No Docker, no API keys.

Install: `npx aide-memory init`. Sets up hooks, writes `.claude/rules/aide-memory.md`, configures the MCP server. Two minutes.

544 tests. Open source. Works with Cursor too.

GitHub: https://github.com/aide-memory/aide-memory

---

## r/cursor

**Title:** Persistent memory across Cursor sessions -- open source MCP tool

I kept re-teaching Cursor the same things every session. Style preferences, architecture decisions, project conventions -- all gone on restart.

Built an MCP server that persists memory across sessions. Install:

```bash
npx aide-memory init
```

This creates `.cursor/rules/aide-memory.mdc` (Cursor reads this automatically), sets up the MCP server config, and installs hooks.

How it works: memories are JSON files in `.aide/memories/` in your project. When you open a file, a hook nudges the agent: "8 memories exist for this path." The agent calls `aide_recall` if relevant, gets structured context (preferences, technical facts, guidelines), and uses it.

Four structured layers: preferences ("keep files under 150 lines"), technical ("Apollo needs useGraphQLGateway: true"), area context ("skeleton loading replaces all legacy loaders in checkout"), guidelines ("composition over inheritance").

Path-scoped -- a memory about test utilities surfaces in test files, not everywhere. Glob inheritance means parent scopes cascade down.

No cloud, no Docker, no API keys. JSON files + SQLite cache. 544 tests passing. Works with Claude Code too -- same memories across both tools.

GitHub: https://github.com/aide-memory/aide-memory

---

## r/programming

**Title:** Why AI coding agents forget everything and what I built to fix it

Google tested AI coding assistance with 96 engineers -- 21% faster on individual tasks. METR tested with 16 experienced developers on their own codebases -- 19% slower. The individual gains get eaten by coordination overhead.

Part of the problem: every AI coding session starts from zero. The agent has no memory of your corrections, decisions, or architectural reasoning. Context compaction silently kills planning details mid-session. And nothing flows between developers -- Dev A's agent learns something critical, Dev B's agent starts from scratch on the same code an hour later.

30+ memory tools launched in March 2026. Most share the same flaw: they either dump everything into the system prompt (expensive, noisy) or wait for the agent to voluntarily save (0% adoption rate, tested and confirmed).

I built a tool that takes a different approach:

**Hooks, not voluntary saving.** Four hooks fire at architectural chokepoints: before file reads (lightweight nudge, ~20 tokens), on task completion (reflection prompt), on user corrections (pattern detection), and before context compaction (extract decisions before they are lost).

**File-per-memory, git syncs.** Each memory is a JSON file in `.aide/memories/<layer>/`. Committed to the repo. Git is the sync mechanism. No separate server, no database service. Local SQLite is a cache that rebuilds from the JSON files.

**Path-scoped recall.** Memories use glob patterns. A memory scoped to `src/checkout/**` surfaces when the agent opens files in checkout, not when it opens database migrations. Parent scopes inherit down.

**Token-efficient.** Instead of injecting all memories into the system prompt (~2,000 tokens), the agent gets a one-line nudge ("8 memories exist for this path") and pulls what it needs. ~20 tokens per file read vs ~2,000.

The stack: TypeScript, SQLite (WAL mode, synchronous API), FTS5 for BM25 search, optional local embeddings. No Docker, no API keys, no cloud dependency. MCP protocol for editor integration (Claude Code, Cursor).

`npx aide-memory init` -- two minutes, zero config.

544 tests. Open source.

GitHub: https://github.com/aide-memory/aide-memory

---

## r/MachineLearning

**Title:** Local-first memory layer for AI coding agents: file-per-memory + FTS5 + embeddings

Built a persistent memory system for AI coding agents. The interesting architectural choices:

**Storage:** One JSON file per memory in `.aide/memories/<layer>/`. Four fixed layers (preferences, technical, area_context, guidelines). SQLite is a cached index, not the source of truth. Hash-based cache rebuild -- skips when nothing changed. Delete the database, it regenerates from files.

**Search pipeline (three tiers):**
1. Direct path match via SQL lookup on glob patterns -- deterministic, sub-millisecond
2. FTS5 with BM25 ranking for keyword search -- cross-cutting queries across all memories
3. Local embeddings via Transformers.js or Ollama for semantic fallback -- cosine similarity, no API calls

**Retrieval strategy:** Nudge, not dump. Instead of injecting all matching memories into the system prompt (~2,000 tokens), a hook outputs a one-line count ("8 memories exist for this path, ~20 tokens). The model decides relevance and pulls what it needs. Near-100% coverage at near-zero cost.

**Capture:** Four hooks at architectural chokepoints (PreToolUse, Stop, UserPromptSubmit, PreCompact) drive 100% adoption vs 0% voluntary tool usage (tested -- agents do not voluntarily call memory tools, confirmed across multiple tools and issue trackers).

**Path scoping:** Glob inheritance. Memory at `src/**` is available everywhere under src. Memory at `src/checkout/**` only surfaces in checkout code. Monorepo support via hierarchical `.aide/` directories, cascading like `.eslintrc`.

544 tests, TypeScript, SQLite WAL mode. No Docker, no external vector DB.

GitHub: https://github.com/aide-memory/aide-memory
