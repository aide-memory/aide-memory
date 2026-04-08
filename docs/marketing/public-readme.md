# aide-memory

Persistent memory for AI coding agents. Your agent remembers corrections, preferences, and architecture decisions across sessions -- automatically captured by hooks, recalled by path, synced through git.

`npx aide-memory init` -- two minutes, zero config.

---

## Why

AI coding agents forget everything between sessions. You correct them, they adjust, you close the session, and next time they start from zero.

Existing memory tools either dump all memories into the system prompt (~2,000 tokens wasted per interaction) or rely on the agent voluntarily saving context (tested: 0% adoption rate).

AIDE Memory uses hooks that fire automatically at the right moments. Tested adoption: 0% voluntary to 100% hook-driven.

---

## Features

- **Hook-driven capture** -- 4 hooks fire automatically (PreToolUse, Stop, UserPromptSubmit, PreCompact). No voluntary saving needed.
- **Nudge, not dump** -- ~20 token nudge per file read instead of ~2,000 token system prompt injection. Agent decides relevance.
- **Path-scoped recall** -- memories are tied to code paths via glob patterns. A memory about checkout code surfaces in checkout files, not everywhere.
- **File-per-memory** -- each memory is a human-readable JSON file in `.aide/memories/`. Browsable, diffable, version-controlled.
- **Git is the sync** -- memories are files, files are committed, git syncs them. No separate sync mechanism.
- **Structured layers** -- preferences, technical, area context, guidelines. Recalled in priority order.
- **FTS5 search** -- BM25-ranked keyword search across all memories.
- **Local embeddings** -- optional semantic search via Transformers.js or Ollama. No API keys.
- **Cross-tool** -- works with Claude Code and Cursor. Same memories across both.
- **Pre-train scan** -- `--scan` flag detects your stack and generates initial memories from project structure.
- **Zero dependencies on external services** -- no Docker, no Chroma, no cloud, no API keys required.

---

## Install

```bash
npx aide-memory init
```

This command:
1. Creates the `.aide/memories/` directory structure
2. Installs 4 hooks (PreToolUse, Stop, UserPromptSubmit, PreCompact)
3. Writes rules files for your editor (`.claude/rules/aide-memory.md`, `.cursor/rules/aide-memory.mdc`)
4. Configures the MCP server
5. Sets up `.gitignore` entries (personal preferences excluded, shared memories tracked)

---

## Quick Start

### 1. Initialize

```bash
npx aide-memory init
```

### 2. Work normally

Start a coding session. The hooks capture context as you go:
- Corrections you make are stored automatically
- Planning decisions are extracted before context compaction
- Task completion triggers a reflection prompt

### 3. Next session

Your agent remembers. When it opens a file, the PreToolUse hook nudges: "8 memories exist for this path." The agent recalls what is relevant and uses it.

### 4. Pre-populate (optional)

```bash
npx aide-memory init --scan
```

Scans your codebase and generates initial memories from project structure, stack detection, and configuration files.

### 5. Inspect

```bash
aide-memory list                    # See all stored memories
aide-memory search "authentication" # Find specific memories
aide-memory stats                   # View analytics
```

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `aide-memory init [--scan] [--update-rules]` | Create `.aide/`, write rules, install hooks, configure MCP |
| `aide-memory recall <path>` | Recall memories for a file or directory path |
| `aide-memory remember <what>` | Store a memory (`--layer`, `--scope`, `--tags`, `--why`) |
| `aide-memory update <uuid>` | Update an existing memory (`--what`, `--why`, `--scope`, `--tags`) |
| `aide-memory forget <uuid>` | Delete a memory (removes JSON file) |
| `aide-memory search <query>` | Search memories by keyword (FTS5 BM25 ranking) |
| `aide-memory list` | List memories (`--layer`, `--scope`, `--contributor`, `--limit`) |
| `aide-memory stats` | Show analytics: counts, most recalled, stale candidates |
| `aide-memory config <key> [value]` | Get or set configuration |
| `aide-memory sync import` | Rebuild SQLite cache from JSON files |
| `aide-memory sync export` | Ensure all memories have JSON files |
| `aide-memory migrate` | Migrate from legacy memory.db format |

---

## MCP Tools

Seven tools, ~1,400 tokens total (GitHub MCP is 54K for comparison):

| MCP Tool | CLI Equivalent | Description |
|----------|---------------|-------------|
| `aide_recall` | `aide-memory recall` | Path-scoped memory retrieval with glob inheritance |
| `aide_remember` | `aide-memory remember` | Store a new memory with layer, scope, tags |
| `aide_update` | `aide-memory update` | Edit an existing memory |
| `aide_forget` | `aide-memory forget` | Permanently delete a memory |
| `aide_search` | `aide-memory search` | FTS5 keyword search, grouped by layer |
| `aide_memories` | `aide-memory list` | List memories with count and filter support |
| `aide_import` | `aide-memory sync import` | Import from markdown bullet/numbered lists |

---

## How It Works

### Storage

```
.aide/
├── memories/
│   ├── preferences/
│   │   ├── personal/          # gitignored -- your private preferences
│   │   └── shared/            # tracked -- preferences visible to team
│   ├── technical/             # tracked -- stack and integration facts
│   ├── area_context/          # tracked -- decisions for specific code areas
│   └── guidelines/            # tracked -- team and project principles
├── config.json                # local configuration
└── cache/
    └── memory.db              # SQLite cache (rebuildable, gitignored)
```

Each memory is a single JSON file with a UUID filename:

```json
{
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "layer": "technical",
  "what": "Apollo needs useGraphQLGateway: true for federation",
  "why": "Discovered during checkout service integration -- without this flag, subgraph queries silently fail",
  "scope": "src/graphql/**",
  "contributor": "ahmed",
  "tags": ["api-contracts", "graphql"],
  "shared": true,
  "source": "hook",
  "created_at": "2026-04-01T10:30:00Z",
  "updated_at": "2026-04-01T10:30:00Z"
}
```

SQLite is a cached index. Delete it and it rebuilds from the JSON files. The JSON files are the source of truth.

### Hooks

| Hook | When | What it does | Token cost |
|------|------|-------------|------------|
| PreToolUse | Before file reads | Nudge: "N memories exist for this path" | ~20 tokens |
| Stop | Task completion | Prompts agent to reflect on session | Hidden |
| UserPromptSubmit | User corrects agent | Detects correction patterns, stores scoped memory | Hidden |
| PreCompact | Before compaction | Extracts planning decisions before context loss | Hidden |

All hooks work via `additionalContext` -- invisible to the developer. Memory management happens silently.

### Recall

Three-tier search:
1. **Path match** -- SQL lookup on glob patterns (sub-millisecond, deterministic)
2. **FTS5** -- BM25-ranked keyword search (cross-cutting queries)
3. **Embeddings** -- cosine similarity via local model (semantic fallback, no API calls)

Path inheritance: a memory at `src/**` surfaces for `src/checkout/CartSummary.tsx`. A memory at `src/checkout/**` surfaces only in checkout code.

### Sync

Git is the sync mechanism. Memories are files. Commit them, push them, pull them.

A `post-checkout` hook automatically imports new or changed memories after `git pull` or branch switches. Comparison by UUID + `updated_at` timestamp -- newer wins.

---

## Configuration

Configuration lives in `.aide/config.json`. Manage via CLI:

```bash
# View a setting
aide-memory config capture.enabled

# Change a setting
aide-memory config capture.enabled false

# Manage tag presets
aide-memory config tags.presets
```

### Key settings

| Key | Default | Description |
|-----|---------|-------------|
| `capture.enabled` | `true` | Enable/disable automatic hook capture |
| `capture.hooks.preToolUse` | `true` | PreToolUse hook on/off |
| `capture.hooks.stop` | `true` | Stop hook on/off |
| `capture.hooks.userPromptSubmit` | `true` | UserPromptSubmit hook on/off |
| `capture.hooks.preCompact` | `true` | PreCompact hook on/off |
| `tags.presets` | `[architecture, testing, security, style, performance, api-contracts]` | Available tags for memory categorization |

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

- Node.js 18+
- npm or npx
- Claude Code or Cursor (for hook integration)

No Docker. No external databases. No API keys. No cloud accounts.

---

## Test Status

- **544 tests passing** (4 failures are external service comparison tests -- expected)
- **0 TypeScript errors**
- **21 test files**, 7 MCP tools, 11 CLI commands, 4 hooks

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
