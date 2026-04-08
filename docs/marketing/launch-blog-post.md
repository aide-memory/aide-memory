# Why Your AI Agent Forgets Everything (And How to Fix It)

You correct your AI agent three times in one session. "Shorter files. Composition, not inheritance. Use the existing utility." The agent adjusts. Great.

Next session, it generates a 400-line component with five levels of ternaries and reimplements a function that already exists in your utils folder. Everything you taught it is gone.

This is not a bug in any particular tool. It is how every AI coding agent works today.

## The problem is worse than you think

Every AI coding session starts from zero. Your agent has no memory of your preferences, your corrections, your architecture decisions. It reads the code, makes assumptions, and writes something plausible. You spend the first ten minutes re-teaching it what you spent thirty minutes teaching it yesterday.

But individual amnesia is only half of it.

Google tested AI coding assistance with 96 engineers in a controlled study. The AI-assisted group was 21% faster on individual tasks. Then METR ran a study with 16 experienced open-source developers working on their own real codebases. They were 19% slower. The individual gains get eaten by coordination overhead.

Before AI agents, teams coordinated through informal channels -- Slack threads, pairing sessions, PR reviews, hallway conversations. Knowledge flowed between people as a side effect of working together. AI agents replace this with solo sessions. Each developer works in a private loop with their agent. None of that context is visible to anyone else.

Dev A's agent learns that a prop is shaped to match an API contract. Dev B's agent has no idea. It explores the component, decides the structure is "messy," refactors it, and breaks the API. The context existed. It just lived in Dev A's session and died when the conversation ended.

And then there is context compaction. You and your agent spend 45 minutes building a plan -- skeleton loading states, backward compatibility for the v1 API, progressive disclosure in the settings panel. The context window fills. Compaction kicks in. The agent "decides" to drop skeleton loading for spinners and remove the backward compat shim. It did not disagree with the plan. It forgot the plan existed.

## What existing tools get wrong

30+ memory tools launched in March 2026 alone. Most have zero real users. The ones that do have traction share the same fundamental problems.

**claude-mem** (44K stars) dumps all memories into the system prompt. Every file read loads every memory you have ever stored, whether relevant or not. That is roughly 2,000 tokens of context window wasted before the agent even starts thinking about your actual task. It also has a 72% summary failure rate confirmed in their own issue tracker, creates files in every directory, and runs an unauthenticated HTTP API on a local port.

**engram** (2K stars) takes the opposite approach: it provides tools and waits for the agent to voluntarily save memories. We tested this. Zero out of ten prompts resulted in voluntary memory saves when the tools were simply available. The agent's trained behavior overrides the instruction. Claude Code itself diagnosed the problem in an engram issue: "The tools are deferred... my trained behavior overrides the instruction... there's nothing in the tool flow that forces a pause."

The gap is clear. Dump everything (expensive, noisy) or wait for voluntary saving (0% adoption). Neither works.

## How AIDE Memory works

AIDE Memory takes a different approach: hooks that capture automatically, nudges that cost almost nothing, and plain files that sync through git.

**Install in one command:**

```bash
npx aide-memory init
```

This creates the `.aide/` directory, installs four hooks, writes rules files for your editor, and configures the MCP server. Two minutes, zero config.

**Four hooks drive 100% adoption (not 0%):**

Instead of hoping the agent will voluntarily save memories, AIDE Memory uses hooks that fire at the right moments:

- **PreToolUse** -- fires before the agent reads any file. Outputs a count-only nudge.
- **Stop** -- fires when the agent finishes a task. Prompts reflection: "Anything worth remembering?"
- **UserPromptSubmit** -- detects when you correct the agent. "No, don't use that pattern" triggers a memory store.
- **PreCompact** -- fires before context compaction. Extracts planning decisions before they are lost.

All four are invisible to you. The memory management happens in `additionalContext` -- you see only the agent's actual work.

**Nudge, not dump (~20 tokens vs ~2,000):**

When you open a file, the agent gets a one-line nudge:

```
8 memories exist for src/checkout/**. Call aide_recall if relevant.
```

That is about 20 tokens. The agent decides whether those memories matter for the current task. If yes, it pulls them. If no, it moves on. Zero wasted context.

Compare this to injecting every memory into the system prompt on every interaction. The difference compounds across a full day of work.

**File-per-memory, git syncs:**

Every memory is a single JSON file in `.aide/memories/<layer>/`:

```json
{
  "uuid": "a1b2c3d4-...",
  "layer": "guidelines",
  "what": "Use composition over inheritance in React components",
  "why": "Corrected during DataTable refactor -- deep inheritance caused prop drilling issues",
  "scope": "src/components/**",
  "contributor": "ahmed",
  "tags": ["architecture", "react"]
}
```

There is no separate sync mechanism. Memories are files. Files are committed. Git syncs them. A post-checkout hook imports new memories automatically. Local SQLite is just a cached index -- delete it and it rebuilds from the JSON files.

No Docker. No Chroma. No API keys. No cloud dependency.

## What makes it different

The architecture differences add up:

**Simpler stack.** No Docker container, no vector database service, no API keys required. One npm package, SQLite for caching, JSON files for persistence. If you can run `npx`, you can run AIDE Memory.

**Better token efficiency.** A 20-token nudge versus a 2,000-token system prompt dump. Over a full day with hundreds of file reads, this saves tens of thousands of tokens.

**Path scoping from day one.** A memory about test utilities surfaces when you open test files, not when you open database migrations. Glob inheritance means a memory scoped to `src/**` is available everywhere under `src/`, but a memory scoped to `src/checkout/**` only surfaces in checkout code.

**Four hooks, not zero.** The adoption problem is solved at the architecture level, not by hoping agents will cooperate. Tested: 0% voluntary adoption versus 100% hook-driven adoption.

**Works across tools.** Claude Code and Cursor out of the box. Same memories, same hooks, same MCP server. Switch tools mid-task and your context follows.

## Quick start

```bash
npx aide-memory init
```

That is it. The init command creates the directory structure, installs hooks, writes editor rules, and configures the MCP server. Start working normally. The hooks capture context as you go. Next session, your agent remembers.

If you want to pre-populate with project structure:

```bash
npx aide-memory init --scan
```

This detects your stack, frameworks, and project layout, then generates initial memories so the agent has context from the first interaction.

## What is next

Phase 1 is individual memory -- your agent remembers what you taught it across sessions. That is shipping now.

The harder problem is team context. Dev A's agent learning something that helps Dev B's agent before damage is done. Not in a PR comment after the fact. Not buried in a wiki. Proactively, scoped to the code path being touched, at the moment the agent reaches for the file.

That is what we are building toward. Individual memory is the infrastructure. Team context is the product.

GitHub: [aide-memory](https://github.com/aide-memory/aide-memory) | Install: `npx aide-memory init`
