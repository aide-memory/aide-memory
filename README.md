# aide-memory

**Your AI coding agent forgets everything between sessions.** You correct it, it adjusts, you close the session, and next time it starts from zero. aide-memory fixes this -- persistent, path-scoped memory that captures context automatically via hooks and recalls it exactly when the agent needs it.

```bash
npx aide-memory init
```

Two minutes. Zero config. No Docker, no cloud, no API keys.

---

## What It Does

- **Hook-driven capture** -- 6 hooks fire automatically (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, PreCompact). Your agent stores context without you asking it to. Tested: 0% voluntary adoption vs 100% hook-driven.
- **Nudge, not dump** -- ~20 token nudge per file read instead of ~2,000 token system prompt injection. The agent decides what is relevant and recalls only that.
- **Path-scoped recall** -- memories are tied to code paths via glob patterns. A memory about checkout code surfaces in checkout files, not everywhere.
- **File-per-memory storage** -- each memory is a human-readable JSON file in `.aide/memories/`. Browsable, diffable, version-controlled.
- **Git is the sync** -- memories are files, files are committed, git syncs them. No separate sync mechanism needed.
- **Structured layers** -- preferences, technical, area context, guidelines. Recalled in priority order so the agent gets the most important context first.
- **FTS5 search** -- BM25-ranked full-text search across all memories. Sub-millisecond path lookups.
- **Cross-editor** -- works with Claude Code and Cursor. Same memories, same hooks, same recall across both. Rule templates also ship for Codex, Copilot, and Windsurf; see [docs/user/supported-editors.md](docs/user/supported-editors.md) for the full capability matrix.

---

## Quick Start

### 1. Initialize

```bash
npx aide-memory init
```

Creates `.aide/memories/`, installs 6 hooks, writes editor rules, configures the MCP server.

### 2. Store a memory

```bash
aide-memory remember "API responses must use camelCase keys" --layer guidelines
```

Or let the hooks capture context automatically as you work -- corrections, planning decisions, and session reflections are stored without manual intervention.

### 3. Recall by path

```bash
aide-memory recall src/auth/
```

Returns memories scoped to that path, plus project-wide context. Your agent does this automatically via the PreToolUse hook whenever it reads a file.

### 4. Search across memories

```bash
aide-memory search "authentication"
```

FTS5 BM25-ranked keyword search, grouped by layer.

### 5. Inspect

```bash
aide-memory stats
```

See totals by layer, most-recalled memories, capture source breakdown, and stale candidates.

---

## How It Works

### Hooks drive everything

| Hook | When it fires | What it does | Token cost |
|------|--------------|--------------|------------|
| **SessionStart** | Session begin / resume | Injects top-N preferences + guidelines + priority-always memories | Hidden |
| **PreToolUse** | Before file reads / edits / Grep / aide_* MCP calls | Nudges: "N memories exist for this path" | ~20 tokens |
| **PostToolUse** | After aide_recall / aide_remember / aide_search | Records recalled memory IDs so re-reads don't re-block | Hidden |
| **UserPromptSubmit** | User corrects agent | Detects correction patterns, stores scoped memory | Hidden |
| **Stop** | Task completion | Prompts agent to reflect and store learnings | Hidden |
| **PreCompact** | Before context compaction | Extracts planning decisions before context is lost | Hidden |

All hooks use `additionalContext` (Claude Code) or `agent_message` (Cursor) -- invisible to you. Memory management happens silently in the background.

### Storage: file-per-memory with SQLite cache

```
.aide/
├── memories/
│   ├── preferences/
│   │   ├── personal/          # gitignored -- your private preferences
│   │   └── shared/            # tracked -- team-visible preferences
│   ├── technical/             # tracked -- stack and integration facts
│   ├── area_context/          # tracked -- decisions for specific code areas
│   └── guidelines/            # tracked -- team and project principles
├── config.json                # local configuration
└── cache/
    └── memory.db              # SQLite cache (rebuildable, gitignored)
```

Each memory is a single JSON file:

```json
{
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "layer": "technical",
  "what": "Apollo needs useGraphQLGateway: true for federation",
  "why": "Without this flag, subgraph queries silently fail",
  "scope": "src/graphql/**",
  "contributor": "ahmed",
  "tags": ["api-contracts", "graphql"],
  "shared": true
}
```

SQLite is a rebuildable cache. Delete it and it reconstructs from the JSON files. The JSON files are the source of truth.

### Recall: three tiers

1. **Path match** -- glob pattern lookup (sub-millisecond, deterministic)
2. **FTS5** -- BM25-ranked keyword search for cross-cutting queries
3. **Embeddings** -- cosine similarity via local model for semantic fallback (no API keys)

Path inheritance: a memory scoped to `src/**` surfaces for `src/checkout/CartSummary.tsx`. A memory scoped to `src/checkout/**` surfaces only in checkout code.

### Sync via git

Memories are files. Commit them, push them, pull them. A `post-checkout` hook automatically imports new or changed memories after `git pull` or branch switches. Conflicts resolve by timestamp -- newer wins.

---

## CLI Commands

All commands use the `aide-memory` binary (aliased as `aide`).

| Command | Description |
|---------|-------------|
| `init [--update-rules]` | Create `.aide/`, install hooks, write editor rules, configure MCP |
| `recall <path>` | Recall memories scoped to a file or directory path |
| `remember <what>` | Store a memory with `--layer`, `--scope`, `--tags`, `--why` |
| `update <id>` | Update an existing memory's content, scope, or context |
| `forget <id>` | Permanently delete a memory |
| `search <query>` | FTS5 keyword search with BM25 ranking |
| `list` | List memories with `--layer`, `--scope`, `--contributor`, `--tag` filters |
| `stats` | Show analytics: counts by layer, most recalled, stale candidates |
| `recall-log` | Tail the recall-log to inspect recent recall events |
| `config <key> [value]` | Get or set configuration (dot-notation keys) |
| `sync import` / `sync export` | Rebuild SQLite cache from JSON memory files / ensure JSON exists for every memory |
| `migrate` | (placeholder) Migrate from legacy DB format |
| `cleanup [--older-than 7d]` | Remove stale session tracking files from `.aide/cache/` |

---

## MCP Tools

Seven tools exposed to your AI agent (~1,400 tokens total schema -- GitHub MCP is 54K for comparison):

| Tool | Description |
|------|-------------|
| `aide_recall` | Path-scoped memory retrieval with glob inheritance |
| `aide_remember` | Store a new memory with layer, scope, tags, and context |
| `aide_update` | Edit an existing memory's content or scope |
| `aide_forget` | Permanently delete a memory |
| `aide_search` | FTS5 keyword search, results grouped by layer |
| `aide_memories` | List memories with count and filter support |
| `aide_import` | Import from markdown bullet/numbered lists into any layer |

---

## Configuration

Configuration lives in `.aide/config.json`. Manage via CLI:

```bash
aide-memory config hooks.read.maxBlocks        # read
aide-memory config hooks.read.maxBlocks 0      # write (disable pre-read hook)
```

Changes via `aide-memory config` apply immediately. If you hand-edit
`.aide/config.json`, running sessions pick up the change on the next hook
fire (file read, edit, or prompt). For instant propagation across all
open sessions, reconnect the MCP server in Claude Code via `/mcp` → reconnect.

A few of the most-used keys (full reference in
[docs/user/configuration.md](docs/user/configuration.md)):

| Key | Default | Description |
|-----|---------|-------------|
| `hooks.read.maxBlocks` | `1` | Max pre-read hard-blocks per file path per session. `0` disables the hook. |
| `hooks.edit.maxBlocks` | `1` | Same as above, for the pre-edit hook. |
| `hooks.search.mode` | `"soft"` | Pre-search hook: `"soft"`, `"block"`, or `"off"`. |
| `hooks.correction.enabled` | `true` | Detect correction patterns in user messages. |
| `hooks.visible` | `true` | Show user-facing `aide-memory · …` systemMessage lines. |
| `recall.minScopeDepth` | `1` | Minimum scope segments for per-file recall. Bump to `2` to demote `src/**`-style broad scopes to SessionStart only. |
| `memories.softening.threshold` | `10` | Below this total memory count, hard-blocks downgrade to soft nudges. |
| `memories.defaultShared` | `true` | Default `shared` value for new `preferences` memories. Per-call `shared: true\|false` always wins. |
| `tags.presets` | _(9 defaults)_ | Available tags for memory categorization. |

---

## Privacy & Telemetry

**Code and memory content never leave your machine.** Memories are JSON files on your disk, the SQLite cache is local, and the MCP server runs over stdio.

aide-memory has two distinct analytics surfaces -- don't conflate them:

**1. Local SQLite analytics (always local).** Tool-call counts and recall events drive `aide-memory stats`. Written to your local cache (`~/.aide/projects/<hash>/memory.db`) and never transmitted.

**2. Anonymized event tallies to PostHog (opt-in).** Off by default. You opt in by exporting `AIDE_TELEMETRY=on`. When opted in, only event tallies are sent: event type (`remember`, `recall`, `search`, etc.), a SHA256-hashed `hostname:username` for deduplication, platform, and Node version. **What's never sent:** memory content, file paths, code, scope strings, query strings, contributor names, or anything else user-identifying.

```bash
# Default: nothing is sent. To opt in:
export AIDE_TELEMETRY=on

# To stay opted out (or be explicit):
export AIDE_TELEMETRY=off
```

---

## Comparison with Alternatives

### vs. claude-mem

[claude-mem](https://github.com/nicobailon/claude-mem) dumps all memories into the system prompt on every interaction (~2,000 tokens of overhead regardless of relevance). No path scoping -- every memory surfaces everywhere. No hooks -- relies on the agent voluntarily saving context, which in testing has a 0% adoption rate without explicit prompting.

aide-memory uses a ~20 token nudge per file read, path-scoped recall so only relevant memories surface, and hook-driven capture that works without agent cooperation.

### vs. engram

[engram](https://github.com/cline/engram) stores memories as flat key-value pairs with no structural awareness of your codebase. No glob-based path scoping, no layered priority (preferences vs. technical vs. guidelines), no hook integration for automatic capture. Memories are workspace-global -- you cannot scope a memory to `src/auth/**` and have it surface only when working in auth code.

aide-memory provides four structured layers, path-scoped recall with glob inheritance, and automatic capture via editor hooks.

### What we share

All three tools solve the same core problem: AI agents forget between sessions. The key architectural difference is **how memories are selected for recall**. Flat stores surface everything or nothing. Path-scoped stores surface what is relevant to the code you are working in right now.

---

## Editor Setup

### Claude Code (reference implementation)

`aide-memory init` automatically:
- Writes `.claude/rules/aide-memory.md` (agent instructions)
- Configures hooks in `.claude/settings.json` (6 event types)
- Sets up the MCP server in `.mcp.json`

Full UX walkthrough: [docs/user/editors/claude-code.md](docs/user/editors/claude-code.md).

### Cursor (~80% parity with Claude Code, 0.5.0)

`aide-memory init` automatically:
- Writes `.cursor/rules/aide-memory.mdc` (with MDC frontmatter, auto-regenerated on memory/config changes)
- Configures hooks in `.cursor/hooks.json`
- Configures MCP server in `.cursor/mcp.json`

Verified gaps versus Claude Code (each tracked against a Cursor forum
thread; adapter upgrades when upstream lands a fix):
- Per-Read hard-block does not fire when the file is already open in the
  editor pane (per-Edit safety net + rules-file injection cover it
  functionally).
- Inline visible chrome on **soft** fires lives in the Hooks Output
  panel rather than chat (hard-block chrome renders inline as expected).
- SessionStart context is delivered via the regenerated `.mdc` rules
  file rather than a hook channel (Cursor staff's endorsed workaround
  for an upstream sessionStart bug).
- Correction detection arrives one turn later than in Claude Code
  (Cursor's `beforeSubmitPrompt` has no in-turn additionalContext
  channel; reminder ships via the next Stop hook's `followup_message`).
- No Glob matcher in Cursor's vocabulary, so pre-search nudges fire on
  Grep only.

Restart Cursor after init for MCP to load. Full walkthrough:
[docs/user/editors/cursor.md](docs/user/editors/cursor.md).

### Codex, Copilot, Windsurf

Rule template ships in 0.5.0. Hook + MCP config generation at init is
tracked as a post-0.5.0 task — see
[docs/user/supported-editors.md](docs/user/supported-editors.md) for the
matrix and [docs/specs/EDITOR_ONBOARDING_GUIDE.md](docs/specs/EDITOR_ONBOARDING_GUIDE.md)
for the onboarding playbook.

---

## Requirements

- **Node.js 18+**
- **npm or npx**
- **Claude Code or Cursor** (for hook integration)

No Docker. No external databases. No API keys. No cloud accounts.

---

## Test Status

- **773 vitest tests passing** across 31 test files (plus 11/11 install-from-tarball smokes and 15/15 debug-output smokes via `npm run test:full`)
- **0 TypeScript errors**
- 7 MCP tools, 13 CLI commands, 6 hooks -- all verified end-to-end

---

## Contributing

Contributions welcome. Please open an issue first to discuss what you would like to change.

```bash
git clone https://github.com/aide-memory/aide-memory.git
cd aide-memory
npm install
npm test
```

---

## License

See [LICENSE](LICENSE) for details.

---

## Documentation

- [Docs landing page](docs/user/index.md) -- start here
- [Concepts](docs/user/concepts.md) -- memories, layers, scopes, hooks, MCP tools
- [Supported editors](docs/user/supported-editors.md) -- capability matrix: Claude Code, Cursor, Codex, Copilot, Windsurf
- [CLI Reference](docs/user/cli-reference.md) -- every command with flags, examples, and error messages
- [MCP Tools Reference](docs/user/mcp-tools.md) -- every MCP tool with parameters and example calls
- [Architecture Guide](docs/user/architecture.md) -- storage, hooks, recall, and sync internals
- [Configuration Guide](docs/user/configuration.md) -- all settings with defaults
- [Troubleshooting](docs/user/troubleshooting.md) -- common issues and solutions
