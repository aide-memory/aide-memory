# AIDE Memory Landing Page Content

> For aide-memory.dev. Generated from PRODUCT_VISION.md, PHASE_0_1_SPEC.md, VERIFICATION_REPORT.md, and launch-blog-post.md.

---

## Hero

### Headline

**AI coding agents have fragmented, limited memory. aide-memory fixes that.**

### Subheadline

Structured, persistent, path-scoped memory for AI coding agents -- captured automatically by hooks, recalled with a 20-token nudge, synced through git. Works across Claude Code, Cursor, and any MCP client.

### Install

```bash
npx aide-memory init
```

### Badge

Zero cloud dependencies | Local-first | Works with Claude Code (reference) and Cursor (~80% parity in 0.5.0); rule templates for Codex, Copilot, Windsurf

---

## Problem

**AI coding agents have memory, but it is shallow and fragmented.**

- **Static context files do not scale.** Claude has `CLAUDE.md`, Cursor has `.cursorrules` -- useful for project-level instructions, but they are manually maintained, unstructured, and editor-locked. As your project grows, a single flat file cannot capture the nuance of what matters where. A memory about your checkout flow should not surface when you are working on database migrations.

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

Claude Code is the reference adapter — every feature works there. Cursor ships at ~80% parity in 0.5.0 (with five documented gaps tied to open Cursor forum threads). Codex, Copilot, and Windsurf get rule templates today and full adapters post-0.5.0. Same memories, same MCP server, same recall across every supported editor — switch tools mid-task and your context follows. See the [Supported editors matrix](./user/supported-editors.md) for the honest feature-by-feature breakdown.

### 7. Full-Text Search
**Icon:** search / magnifying-glass

BM25-ranked search via FTS5. Find any memory by keyword instantly. Falls back to LIKE-based search when FTS5 is unavailable.

### 8. No Cloud, No Docker, No API Keys
**Icon:** lock / shield

Everything runs locally. One npm package, SQLite for caching, JSON files for persistence. Your memories never leave your machine unless you commit them to your repo.

---

## Feature Comparison

| Feature | aide-memory | Claude CLAUDE.md | Cursor .cursorrules | ConPort | mcp-memory-service | Windsurf memory | GitHub Copilot memory |
|---------|-------------|------------------|---------------------|---------|--------------------|-----------------|-----------------------|
| Persistent across sessions | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Path-scoped recall | Yes | No | No | No | No | No | No |
| Cross-tool (multiple editors) | Yes | No | No | Yes (MCP) | Yes (MCP) | No | No |
| Structured memory layers | Yes (4 layers) | No (flat file) | No (flat file) | Partial (entity types) | No (flat store) | No | No |
| Auto-capture hooks | Yes (4 hooks) | No | No | No | No | Partial (built-in) | Partial (built-in) |
| CLI access | Yes | No | No | No | No | No | No |
| Git-syncable (team sharing) | Yes (file-per-memory) | Yes (single file) | Yes (single file) | No | No | No | No |
| No cloud dependency | Yes | Yes | Yes | Yes | Yes | No | No |

**Notes:**
- `CLAUDE.md` and `.cursorrules` are useful static context files. aide-memory complements them -- `aide-memory init` writes rules for both editors.
- ConPort uses a similar stack (SQLite + MCP) but stores memories workspace-flat without path scoping.
- mcp-memory-service provides semantic search via embeddings but has no codebase structure awareness.
- Windsurf and GitHub Copilot have built-in memory but it is proprietary, not portable, and not user-inspectable.

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

# 2. Start working -- hooks capture corrections automatically
# When you say "No, use composition here," the hook stores it

# 3. Check what's been captured
npx aide-memory list

# 5. Next session, your agent gets nudges automatically
# "3 memories exist for src/components/**. Call aide_recall if relevant."
```

That is it. Two minutes to install. Zero ongoing maintenance. Your agent remembers what you teach it.

---

## FAQ

### Is it free?

Yes. All features are free with no limits. No usage caps, no memory count limits, no feature gates.

### Does it work with Cursor?

Yes. Cursor ships in aide-memory 0.5.0 at ~80% parity with Claude Code. `aide-memory init` writes `.cursor/hooks.json`, `.cursor/mcp.json`, and a dynamically regenerated `.cursor/rules/aide-memory.mdc`. Five platform-level gaps (no soft-nudge channel, no inline branded chrome, sessionStart doesn't re-fire post-compact, correction nudges land one turn late, no Glob matcher) are documented and tracked against open Cursor forum threads — when Cursor fixes one, aide-memory upgrades. **Restart Cursor after `aide-memory init`** — Cursor has no MCP hot-reload. See [supported-editors.md](./user/supported-editors.md) for the full matrix and [editors/cursor.md](./user/editors/cursor.md) for the UX walkthrough.

### What about Codex, Copilot, Windsurf?

Rule templates ship in 0.5.0 — the seven MCP tools work identically to Claude Code if you add aide-memory as an MCP server manually in each editor's config. Automatic hooks + init-time MCP config generation for these editors is tracked as a post-0.5.0 onboarding task.

### Does it send data anywhere?

aide-memory collects anonymous usage telemetry by default (event types, platform, node version) to help improve the product. **Your memory content is never sent.** You can disable telemetry by setting `AIDE_TELEMETRY=off`. Memories are JSON files on your disk. SQLite is a local cache. Your data never leaves your machine unless you choose to commit it to your git repo.

### How is this different from CLAUDE.md or .cursorrules?

Those are static context files -- useful for project-level instructions, but manually maintained, unstructured, and locked to a single editor. aide-memory adds path-scoped recall (memories surface only where relevant), structured layers (preferences vs. technical vs. guidelines), automatic capture via hooks, and cross-tool portability. aide-memory complements those files rather than replacing them.

### Can I use my own embedding model?

Yes. aide-memory supports configurable embedding backends. Use the built-in Transformers.js pipeline for zero-setup local embeddings, or connect Ollama for a model you are already running. Configure via `npx aide-memory config set embeddings.provider ollama`.

---

## Support

Bug reports and feature requests: [github.com/aide-memory/aide-memory/issues](https://github.com/aide-memory/aide-memory/issues)

---

## CTA

### Start remembering.

```bash
npx aide-memory init
```

[Documentation](https://aide-memory.dev/docs) | [GitHub](https://github.com/aide-memory/aide-memory) | [npm](https://www.npmjs.com/package/aide-memory)

Free to use. Local-only. Two minutes to install. See [EULA](https://github.com/aide-memory/aide-memory/blob/main/docs/legal/EULA.md) for license terms.
