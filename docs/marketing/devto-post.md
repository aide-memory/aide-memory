---
title: Why Your AI Agent Forgets Everything (And How to Fix It)
published: true
tags: ai, coding, productivity, opensource
cover_image:
---

# Why Your AI Agent Forgets Everything (And How to Fix It)

You correct your AI agent three times in one session. Shorter files. Composition over inheritance. Use the existing utility. The agent adjusts. Good.

Next session, it generates a 400-line component with five levels of ternaries and reimplements a function that already exists in your utils folder.

This is how every AI coding agent works. Sessions are disposable. Context dies when you close the tab.

## The numbers are not great

Google tested AI coding assistance with 96 engineers in a controlled study. The AI-assisted group was 21% faster on individual tasks.

Then METR ran a study with 16 experienced developers on their own real codebases. They were 19% slower.

The individual speed gains get eaten by coordination overhead. Before AI agents, teams coordinated through Slack threads, pairing sessions, PR reviews. Knowledge flowed between people as a side effect of working together. AI agents replace this with solo sessions where none of that context is visible to anyone else.

## The memory tool landscape (honest take)

30+ memory tools launched in March 2026. Most have zero real users. The ones with traction have two problems:

### The dump approach

claude-mem (44K GitHub stars) injects all memories into the system prompt. Every interaction loads every memory, relevant or not. That is ~2,000 tokens of context window burned before the agent starts thinking about your task. Their issue tracker shows a 72% summary failure rate, CLAUDE.md file pollution as the top complaint, and worker processes consuming GBs of RAM.

### The voluntary approach

engram (2K stars) provides memory tools and waits for the agent to use them. We tested this: zero out of ten prompts resulted in voluntary memory saves. Claude Code diagnosed it in engram's own issue tracker:

> "The tools are deferred... my trained behavior overrides the instruction... there's nothing in the tool flow that forces a pause."

Agents do not voluntarily save context. Period.

## A different approach: hooks

AIDE Memory uses hooks that fire at the right moments instead of hoping agents cooperate.

### Install

```bash
npx aide-memory init
```

Two minutes. Creates the directory structure, installs hooks, writes editor rules, configures the MCP server. Zero config.

### Four hooks, 100% adoption

```
PreToolUse  --> Before file reads: "8 memories exist for this path"  (~20 tokens)
Stop        --> On task completion: "Anything worth remembering?"     (hidden prompt)
Correction  --> Detects "no, don't use that": stores correction       (auto-scoped)
PreCompact  --> Before compaction: "Extract decisions before they're lost"
```

All four work via `additionalContext` -- invisible to you. You see only the agent's actual work.

### Nudge, not dump

When you open a file, the agent gets a one-line nudge:

```
8 memories exist for src/checkout/**. Call aide_recall if relevant.
```

About 20 tokens. The agent decides relevance. If yes, it pulls structured memories. If no, it moves on.

Compare to injecting everything into the system prompt:

| Approach | Tokens per file read | Coverage |
|----------|---------------------|----------|
| Voluntary tools | 0 | ~0% (tested) |
| **Nudge (AIDE)** | **~20** | **~100%** |
| Dump (claude-mem) | ~2,000 | 100% |

### File-per-memory storage

Each memory is a JSON file:

```json
{
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "layer": "guidelines",
  "what": "Use composition over inheritance in React components",
  "why": "Corrected during DataTable refactor -- deep inheritance caused prop drilling",
  "scope": "src/components/**",
  "contributor": "ahmed",
  "tags": ["architecture", "react"],
  "created_at": "2026-04-01T10:30:00Z"
}
```

Stored in `.aide/memories/<layer>/`. Committed to git. Git is the sync mechanism.

SQLite is a local cache. Delete it and it rebuilds from the JSON files. No Docker. No Chroma. No API keys.

### Path-scoped recall

Memories use glob patterns:

- `src/components/**` -- surfaces only in component files
- `src/**` -- surfaces everywhere under src (parent inheritance)
- `src/checkout/**` -- only in checkout code

A memory about test utilities does not surface when you are writing database migrations.

### Four structured layers

```
preferences    "Keep files under 150 lines"
technical      "Apollo needs useGraphQLGateway: true"
area_context   "Skeleton loading replaces all legacy loaders in checkout"
guidelines     "Composition over inheritance for React components"
```

Recalled in priority order: area context first (most specific), then technical, then preferences, then guidelines.

## CLI commands

```bash
aide-memory init                    # Setup
aide-memory recall <path>           # Recall memories for a file path
aide-memory remember <what>         # Store a memory
aide-memory update <uuid>           # Edit an existing memory
aide-memory forget <uuid>           # Delete a memory
aide-memory search <query>          # FTS5 keyword search
aide-memory list                    # List all memories
aide-memory stats                   # Analytics: counts, most recalled, stale candidates
aide-memory config <key> [value]    # Configuration
aide-memory sync import             # Rebuild cache from JSON files
aide-memory sync export             # Ensure all memories have files
```

Every CLI command has an MCP tool equivalent. The agent uses MCP tools. You use the CLI for debugging and inspection.

## MCP tools

Seven tools, ~1,400 tokens to load (for comparison, GitHub MCP is 54K tokens):

| Tool | What it does |
|------|-------------|
| `aide_recall` | Path-scoped memory retrieval |
| `aide_remember` | Store a new memory |
| `aide_update` | Edit an existing memory |
| `aide_forget` | Delete a memory |
| `aide_search` | FTS5 keyword search |
| `aide_memories` | List with filters |
| `aide_import` | Import from markdown |

## Search pipeline

Three-tier retrieval:

1. **Direct path match** -- SQL lookup on glob patterns, sub-millisecond
2. **FTS5 BM25** -- keyword search across all memories
3. **Local embeddings** -- Transformers.js or Ollama, cosine similarity, no API calls

The hot path (recall on file read) bypasses MCP entirely -- the PreToolUse hook queries SQLite directly.

## What it is not

- Not a RAG tool
- Not cloud-dependent
- Not another vector database wrapper
- Not a system prompt injector

It is a file-based memory layer that lives in your repo. Human-readable JSON. Diffable in PRs. Browsable in any editor.

## Quick start

```bash
# Install and setup
npx aide-memory init

# Start working normally -- hooks capture context as you go
# Next session, your agent remembers
```

Works with Claude Code and Cursor today. Same memories, same hooks, same MCP server across both.

## The numbers

- 544 tests passing (4 failures are external service comparisons, expected)
- 7 MCP tools
- 11 CLI commands
- 4 hooks
- TypeScript, SQLite WAL mode, FTS5
- Zero type errors

## What is next

This is Phase 1: individual memory. Your agent remembers what you taught it.

The harder problem -- and the reason this project exists -- is team context. Making one developer's context available to another developer's agent before damage is done. Not reactively in PR comments. Proactively, scoped to the code being touched, at the moment the agent reaches for the file.

That is coming. Individual memory is the infrastructure.

---

GitHub: [aide-memory/aide-memory](https://github.com/aide-memory/aide-memory)

Install: `npx aide-memory init`
