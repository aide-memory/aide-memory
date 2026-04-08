# AIDE Memory Landing Page Content

> For aide-memory.dev. Generated from PRODUCT_VISION.md, PHASE_0_1_SPEC.md, VERIFICATION_REPORT.md, and launch-blog-post.md.

---

## Hero

### Headline

**Your AI agent forgets everything you teach it. AIDE Memory fixes that.**

### Subheadline

Persistent, path-scoped memory for AI coding agents -- captured automatically by hooks, recalled with a 20-token nudge, synced through git.

### Install

```bash
npx aide-memory init
```

### Badge

544 tests passing | Zero cloud dependencies | Works with Claude Code and Cursor

---

## Problem

**Every AI coding session starts from zero.**

- **Agents forget your corrections between sessions.** You teach your agent "shorter files, composition over inheritance, use the existing utility." Next session, it generates a 400-line component with five levels of ternaries and reimplements a function that already exists in your utils folder. Everything you taught it is gone.

- **Context vanishes during compaction.** You spend 45 minutes building a plan with your agent -- skeleton loading states, backward compatibility, progressive disclosure. The context window fills. Compaction kicks in. The agent drops skeleton loading for spinners and removes the backward compat shim. It did not disagree with the plan. It forgot the plan existed. This is documented across 350+ GitHub issues in existing memory tools.

- **Agents won't save memories on their own.** We tested this. When memory tools are simply available as MCP tools, agents use them in 0 out of 10 prompts. Claude Code itself diagnosed the problem: "The tools are deferred... my trained behavior overrides the instruction... there's nothing in the tool flow that forces a pause." Availability is not adoption.

---

## How It Works

### Step 1: Init (one command, two minutes)

```bash
npx aide-memory init
```

Creates the `.aide/` directory, installs four hooks, writes rules files for your editor, and configures the MCP server. Zero config required.

### Step 2: Work normally (hooks capture automatically)

Four hooks fire at the right moments -- invisible to you:

```
PreToolUse     → Before the agent reads any file
Stop           → When the agent finishes a task
UserPromptSubmit → When you correct the agent
PreCompact     → Before context compaction
```

When you say "No, don't use that pattern," the hook detects the correction and stores it as a memory. When compaction approaches, the hook extracts planning decisions before they are lost. You never interact with memory management directly.

### Step 3: Recall (nudge, not dump)

Next session, when your agent opens a file:

```
8 memories exist for src/checkout/**. Call aide_recall if relevant.
```

That is ~20 tokens. The agent decides whether those memories matter for the current task. If yes, it pulls them. If no, it moves on. Zero wasted context.

Compare this to injecting every memory into the system prompt on every interaction (~2,000 tokens). The difference compounds across a full day of work.

---

## Features

### 1. Hook-Driven Capture
**Icon:** hook / anchor

Four hooks drive 100% adoption -- not 0%. Corrections, decisions, and preferences are captured at the moment they happen, not when the agent feels like saving them.

### 2. Path-Scoped Recall
**Icon:** folder-tree / target

A memory about test utilities surfaces when you open test files, not when you open database migrations. Glob inheritance means `src/**` memories are available everywhere under `src/`, but `src/checkout/**` memories only surface in checkout code.

### 3. Nudge, Not Dump
**Icon:** feather / lightbulb

~20 tokens per nudge versus ~2,000 tokens dumped into the system prompt. The agent is told context exists and decides relevance. Over hundreds of file reads per day, this saves tens of thousands of tokens.

### 4. File-Per-Memory, Git Syncs
**Icon:** git-branch / file-json

Every memory is a single JSON file in `.aide/memories/<layer>/`. No separate sync mechanism. Memories are files. Files are committed. Git syncs them. Delete SQLite and it rebuilds from the JSON files.

### 5. Structured Memory Layers
**Icon:** layers / stack

Four layers keep memories organized: `preferences` (your coding style), `technical` (codebase facts), `area_context` (file and module notes), `guidelines` (team rules). Recall filters by layer and path.

### 6. Cross-Tool Portability
**Icon:** shuffle / arrows

Claude Code and Cursor supported out of the box. Same memories, same hooks, same MCP server. Switch tools mid-task and your context follows you.

### 7. Full-Text Search
**Icon:** search / magnifying-glass

BM25-ranked search via FTS5. Find any memory by keyword instantly. Falls back to LIKE-based search when FTS5 is unavailable.

### 8. No Cloud, No Docker, No API Keys
**Icon:** lock / shield

Everything runs locally. One npm package, SQLite for caching, JSON files for persistence. Your memories never leave your machine unless you commit them to your repo.

---

## Comparison Table

| Feature | AIDE Memory | claude-mem | engram |
|---------|-------------|------------|--------|
| **Adoption mechanism** | 4 hooks (100% automatic) | System prompt injection | None (0% voluntary -- [issue #87](https://github.com/Gentleman-Programming/engram/issues/87)) |
| **Token cost per recall** | ~20 tokens (nudge) | ~2,000 tokens (full dump) | Variable |
| **Path scoping** | Glob inheritance from day one | Folder Context Files (recent addition) | None |
| **Storage** | JSON files + SQLite cache | ChromaDB + SQLite | SQLite |
| **Infrastructure** | `npx`, nothing else | Docker + ChromaDB + HTTP server | Go binary |
| **Memory reliability** | 544 tests, 0 controllable failures | 72% summary failure rate ([issue #1546](https://github.com/thedotmack/claude-mem/issues/1546)) | Empty/ghost observations ([issue #132](https://github.com/Gentleman-Programming/engram/issues/132)) |
| **File pollution** | One directory: `.aide/` | Creates files in every directory ([issues #609, #632, #641](https://github.com/thedotmack/claude-mem/issues/609)) | Clean |
| **Security** | Local-only, no network | Unauthenticated HTTP API on port 37777 ([issue #1251](https://github.com/thedotmack/claude-mem/issues/1251)) | Windows Defender flags binary ([issue #93](https://github.com/Gentleman-Programming/engram/issues/93)) |
| **Git sync** | Native (memories are files) | No | No |
| **Compaction protection** | PreCompact hook saves decisions | No | No |
| **Structured layers** | 4 layers (preferences, technical, area_context, guidelines) | Flat | Flat |
| **License** | FSL (auto-converts Apache 2.0) | AGPL-3.0 | MIT |
| **Price** | Free | Free | Free |

---

## Architecture

```
You correct your agent
        │
        ▼
   ┌─────────┐     ┌──────────────────┐     ┌────────────┐
   │  Hooks   │────▶│  .aide/memories/  │────▶│  SQLite    │
   │ (capture)│     │  (JSON files)    │     │  (cache)   │
   └─────────┘     └──────────────────┘     └────────────┘
                          │                        │
                     git commit                    │
                     git push                      │
                          │                        ▼
                     Team gets              ┌────────────┐
                     memories via           │  MCP Server │
                     git pull               │  (7 tools)  │
                          │                 └────────────┘
                          ▼                        │
                   post-checkout                   ▼
                   hook imports              Agent gets
                   new memories              nudge on
                                             file read
```

**No Docker.** No vector database service. No API keys. No cloud dependency.

One npm package. SQLite for caching. JSON files for persistence. Git for sync. The agent's own model for reasoning -- zero extra LLM cost.

---

## Quick Start

```bash
# 1. Install in any project
npx aide-memory init

# 2. (Optional) Generate initial memories from your project structure
npx aide-memory init --scan

# 3. Start working -- hooks capture corrections automatically
# When you say "No, use composition here," the hook stores it

# 4. Check what's been captured
npx aide-memory list

# 5. Next session, your agent gets nudges automatically
# "3 memories exist for src/components/**. Call aide_recall if relevant."
```

That is it. Two minutes to install. Zero ongoing maintenance. Your agent remembers what you teach it.

---

## FAQ

### Is it free?

Yes. All individual memory features are free with no limits. No usage caps, no memory count limits, no feature gates for solo developers.

### Does it work with Cursor?

Yes. AIDE Memory supports Claude Code and Cursor out of the box. The init command writes rules files for both editors and configures the MCP server. Same memories work across both tools.

### Does it send data anywhere?

No. Everything is local. Memories are JSON files on your disk. SQLite is a local cache. The MCP server communicates over stdio, not HTTP. Your data never leaves your machine unless you choose to commit it to your git repo.

### How does it compare to claude-mem?

claude-mem dumps all memories into the system prompt on every interaction (~2,000 tokens). AIDE Memory sends a 20-token nudge and lets the agent decide relevance. claude-mem requires Docker and ChromaDB. AIDE Memory requires only `npx`. claude-mem has a documented 72% summary failure rate (issue #1546) and creates files in every directory (issues #609, #632, #641). AIDE Memory keeps everything in one `.aide/` directory with 544 tests passing.

### Can I use my own embedding model?

Yes. AIDE Memory supports configurable embedding backends. Use the built-in Transformers.js pipeline for zero-setup local embeddings, or connect Ollama for a model you are already running. Configure via `npx aide-memory config set embeddings.provider ollama`.

---

## CTA

### Start remembering.

```bash
npx aide-memory init
```

[Documentation](https://aide-memory.dev/docs) | [GitHub](https://github.com/aide-memory/aide-memory) | [npm](https://www.npmjs.com/package/aide-memory)

Free. Local-only. Two minutes to install. Zero config.
