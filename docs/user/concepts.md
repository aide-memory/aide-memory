# Concepts — the aide-memory mental model

aide-memory is a persistent memory layer for AI coding agents. It keeps
structured knowledge about your project (preferences, decisions, technical
facts, guidelines) in a local store, and feeds the right bits to the agent
at the right moments via editor hooks and MCP tools. The store survives
session compaction, editor restarts, and switching between agents; the
agent sees only what is scoped to the code it is currently looking at.

This page is the editor-agnostic mental model. For how the model surfaces
inside a specific tool, see the [per-editor pages](./editors/). For config
keys, see [configuration.md](./configuration.md); for CLI and MCP, see
[cli-reference.md](./cli-reference.md) and [mcp-tools.md](./mcp-tools.md).

---

## 1. Memories

A memory is a single JSON file under `.aide/memories/<layer>/`. It captures
one unit of knowledge — a decision, a preference, a fact, a rule — with a
scope (the code area it applies to) and a layer (what kind of knowledge it
is). Memories are human-readable, diffable, and syncable via git.

## 2. The four layers

Layers separate **how** the knowledge is used. Recall and injection are
prioritized by layer, so the agent gets the most important context first.

| Layer | Use when | Example |
|-------|----------|---------|
| `preferences` | How the developer likes to work | "Prefers composition over inheritance" |
| `technical` | Facts about the stack not obvious from code | "WAL mode required for concurrent SQLite access" |
| `area_context` | Decisions and context for specific code areas | "Dashboard uses skeleton loading, not spinners" |
| `guidelines` | Team-wide or project-wide principles | "All API responses use camelCase keys" |

`preferences` split further into `preferences/personal/` (gitignored) and
`preferences/shared/` (committed). The rest are team-visible by default.

## 3. Scopes (glob patterns)

Every memory can carry a `scope`, a glob pattern describing which code area
it applies to. aide-memory uses scopes to decide what surfaces on which file
read.

- `src/auth/**`: memory is relevant when working in the auth module
- `src/components/**`: relevant in components
- *(no scope)*: project-wide; surfaces everywhere

**Inheritance** is the key property: a memory scoped to `src/**` surfaces
for `src/checkout/CartSummary.tsx`. A memory scoped to `src/checkout/**`
surfaces only inside checkout code. Scoping lets you attach nuanced context
to specific areas without polluting recall in unrelated files.

## 4. Hooks

Hooks are small scripts the editor runs at lifecycle points. aide-memory
installs them at `aide-memory init`. The agent does not call them; the
editor does. So capture and nudging happen automatically, without
depending on the agent's goodwill.

| Hook | Fires when | What aide-memory does |
|------|-----------|-----------------------|
| **SessionStart** | Session begins or resumes | Injects top-N preferences + guidelines + priority-always memories as session context |
| **PreToolUse** | Before file read, edit, search, or aide_* MCP call | Hard-blocks the first read of a scoped path with "N memories exist, call aide_recall"; soft-nudges on re-read; tracks recalled IDs |
| **PostToolUse** | After aide_recall / aide_remember / aide_search | Records what was recalled so re-reads don't re-block; clears correction-pending flags |
| **UserPromptSubmit** | User sends a message | Detects correction patterns ("no, use X instead") and nudges the agent to store the correction with `aide_remember` |
| **Stop** | Agent finishes a turn | Prompts: "Anything worth remembering?" Agent reflects and stores if warranted |
| **PreCompact** | Before context compaction | Prompts the agent to save active plans/decisions before they are lost |

Not every editor supports every channel — see
[supported-editors.md](./supported-editors.md) for the capability matrix
and [hooks.md](./hooks.md) for the script-by-script breakdown.

## 5. MCP tools

aide-memory ships a local MCP server (`dist/memory/cli.js`) exposing seven
tools. The agent calls them directly during conversation. Each tool is
described fully in [mcp-tools.md](./mcp-tools.md); here is the one-liner
version.

| Tool | Purpose |
|------|---------|
| `aide_recall` | Fetch memories scoped to one or more paths (glob-inherited, layer-ordered) |
| `aide_remember` | Store a new memory (layer + scope + what/why + tags) |
| `aide_update` | Edit an existing memory's content, scope, or tags |
| `aide_forget` | Permanently delete a memory (no archive mode) |
| `aide_search` | Keyword / semantic / auto-mode full-text search across all memories |
| `aide_memories` | List memories with layer, scope, contributor, tag filters |
| `aide_import` | Bulk-import from markdown bullet / numbered lists |

Total schema cost: ~1,400 tokens. (GitHub MCP is ~54,000 tokens for
comparison.)

## 6. Storage shape

```
.aide/
├── memories/
│   ├── preferences/
│   │   ├── personal/    # gitignored — private to you
│   │   └── shared/      # tracked — visible to team
│   ├── technical/
│   ├── area_context/
│   └── guidelines/
├── config.json          # local configuration
└── cache/
    ├── memory.db        # SQLite cache (rebuildable, gitignored)
    └── recalled-paths-<sid>.txt  # session-scoped tracking
```

The JSON files are the source of truth. SQLite is a rebuildable cache;
delete `.aide/cache/memory.db` and it reconstructs from the JSON on the
next run.

## 7. Sync via git

Memories are files. Commit them, push them, pull them. A `post-checkout`
git hook automatically imports new or changed memory files after
`git pull` or a branch switch. Conflicts resolve by `updated_at` timestamp
— newer wins.

## 8. Recall strategy

When the agent calls `aide_recall({paths: [...]})`, the store returns:

1. **Path-matched memories**: scoped globs that cover the requested paths.
   Sub-millisecond SQLite lookup, deterministic.
2. **Layer-ordered**: guidelines first, then technical, then
   area_context, then preferences (configurable via `injection.*`).
3. **Budget-capped**: `injection.maxChars` (default 1200) truncates.

For conceptual searches ("where do we handle auth tokens?"), the agent
should prefer `aide_search` over `aide_recall`, since keyword + semantic
search surfaces memories that path-scoping alone would miss.

## 9. Non-goals

- **aide-memory does not replace CLAUDE.md or `.cursorrules`.** Those are
  static editor-level context files. aide-memory adds path-scoped dynamic
  recall on top. They can coexist.
- **Code and memory content never leave your machine.** Memories live on
  your disk. Anonymized event tallies (event type + hashed machine id +
  platform + Node version, never memory content or identifiers) are sent
  to PostHog only when you opt in via `AIDE_TELEMETRY=on`. Default is off.
- **aide-memory does not do LLM calls.** The agent does the reasoning;
  aide-memory is a typed store + dispatcher.

---

## Further reading

- [configuration.md](./configuration.md) — every config key, default, and
  which editors honor it
- [cli-reference.md](./cli-reference.md) — every CLI command with flags
- [mcp-tools.md](./mcp-tools.md) — full MCP tool reference
- [hooks.md](./hooks.md) — per-hook script walkthrough
- [architecture.md](./architecture.md) — internals: adapters, dispatcher,
  hook-events manifest, recall tiers
- [supported-editors.md](./supported-editors.md) — capability matrix
- [editors/claude-code.md](./editors/claude-code.md) — Claude Code UX
- [editors/cursor.md](./editors/cursor.md) — Cursor UX + gap list
- [editors/windsurf.md](./editors/windsurf.md),
  [editors/codex.md](./editors/codex.md),
  [editors/copilot.md](./editors/copilot.md) — rule-template-only today
