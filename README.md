# aide-memory

**Your AI coding agent forgets everything between sessions.** You correct it, it adjusts, you close the session, and next time it starts from zero. aide-memory fixes this -- persistent, path-scoped memory that captures context automatically via hooks and recalls it exactly when the agent needs it.

```bash
npx aide-memory init
```

Two minutes. Zero config. No Docker, no cloud, no API keys.

---

## What It Does

- **Hook-driven capture** -- 4 hooks fire automatically (PreToolUse, Stop, UserPromptSubmit, PreCompact). Your agent stores context without you asking it to. Tested: 0% voluntary adoption vs 100% hook-driven.
- **Nudge, not dump** -- ~20 token nudge per file read instead of ~2,000 token system prompt injection. The agent decides what is relevant and recalls only that.
- **Path-scoped recall** -- memories are tied to code paths via glob patterns. A memory about checkout code surfaces in checkout files, not everywhere.
- **File-per-memory storage** -- each memory is a human-readable JSON file in `.aide/memories/`. Browsable, diffable, version-controlled.
- **Git is the sync** -- memories are files, files are committed, git syncs them. No separate sync mechanism needed.
- **Structured layers** -- preferences, technical, area context, guidelines. Recalled in priority order so the agent gets the most important context first.
- **FTS5 search** -- BM25-ranked full-text search across all memories. Sub-millisecond path lookups.
- **Cross-editor** -- works with Claude Code and Cursor. Same memories, same hooks, same recall across both.

---

## Quick Start

### 1. Initialize

```bash
npx aide-memory init
```

Creates `.aide/memories/`, installs 4 hooks, writes editor rules, configures the MCP server.

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
| **PreToolUse** | Before file reads | Nudges: "N memories exist for this path" | ~20 tokens |
| **Stop** | Task completion | Prompts agent to reflect and store learnings | Hidden |
| **UserPromptSubmit** | User corrects agent | Detects correction patterns, stores scoped memory | Hidden |
| **PreCompact** | Before context compaction | Extracts planning decisions before context is lost | Hidden |

All hooks use `additionalContext` -- invisible to you. Memory management happens silently in the background.

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
| `init [--scan] [--update-rules]` | Create `.aide/`, install hooks, write editor rules, configure MCP |
| `recall <path>` | Recall memories scoped to a file or directory path |
| `remember <what>` | Store a memory with `--layer`, `--scope`, `--tags`, `--why` |
| `update <id>` | Update an existing memory's content, scope, or context |
| `forget <id>` | Permanently delete a memory |
| `search <query>` | FTS5 keyword search with BM25 ranking |
| `list` | List memories with `--layer`, `--scope`, `--contributor`, `--tag` filters |
| `stats` | Show analytics: counts by layer, most recalled, stale candidates |
| `config <key> [value]` | Get or set configuration (dot-notation keys) |
| `sync import` | Rebuild SQLite cache from JSON memory files |
| `sync export` | Ensure all memories have corresponding JSON files |

Use `--scan` with `init` to generate initial memories from your project structure, stack detection, and config files.

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
aide-memory config capture.enabled          # read
aide-memory config capture.enabled false    # write
```

| Key | Default | Description |
|-----|---------|-------------|
| `capture.enabled` | `true` | Enable/disable all automatic hook capture |
| `capture.hooks.preToolUse` | `true` | PreToolUse hook (nudge on file read) |
| `capture.hooks.stop` | `true` | Stop hook (reflection on task completion) |
| `capture.hooks.userPromptSubmit` | `true` | UserPromptSubmit hook (correction detection) |
| `capture.hooks.preCompact` | `true` | PreCompact hook (save before compaction) |
| `tags.presets` | `[architecture, testing, security, style, performance, api-contracts]` | Available tags for memory categorization |

---

## Privacy & Telemetry

aide-memory collects **anonymous usage telemetry by default** to help improve the product. Here's what you should know:

**What's collected:** Event types (remember, recall, search, etc.), platform, architecture, Node version. **What's NOT collected:** Memory content, file paths, code, or personal information. Machine identification is a SHA256 hash of hostname:username for deduplication only.

**How to opt out:** Set the `AIDE_TELEMETRY=off` environment variable:
```bash
export AIDE_TELEMETRY=off
npx aide-memory stats
```

All telemetry is local-first — events are buffered in SQLite and sent to PostHog asynchronously. Your memories never leave your machine unless you commit them to git.

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

### Claude Code

`aide-memory init` automatically:
- Writes `.claude/rules/aide-memory.md` (agent instructions)
- Configures hooks in Claude Code settings
- Sets up the MCP server

### Cursor

`aide-memory init` automatically:
- Writes `.cursor/rules/aide-memory.mdc` (with MDC frontmatter)
- Configures MCP server in `.cursor/mcp.json`

---

## Requirements

- **Node.js 18+**
- **npm or npx**
- **Claude Code or Cursor** (for hook integration)

No Docker. No external databases. No API keys. No cloud accounts.

---

## Test Status

- **544 tests passing** across 21 test files
- **0 TypeScript errors**
- 7 MCP tools, 11 CLI commands, 4 hooks -- all verified end-to-end

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

- [CLI Reference](docs/user/cli-reference.md) -- all 11 commands with flags, examples, and error messages
- [MCP Tools Reference](docs/user/mcp-tools.md) -- all 7 tools with parameters and example calls
- [Architecture Guide](docs/user/architecture.md) -- storage, hooks, recall, and sync internals
- [Configuration Guide](docs/user/configuration.md) -- all settings with defaults
- [FAQ](docs/user/faq.md) -- common questions and troubleshooting
