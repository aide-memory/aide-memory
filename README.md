# aide-memory

> **Website:** https://aide-memory.dev
> **Docs:** https://aide-memory.dev/docs
> **Install:** `npm install -g aide-memory && aide-memory init`

## TL;DR

aide-memory is an auto-captured, auto-recalled, path-scoped memory layer for AI coding agents. It runs locally, plugs into Claude Code and Cursor via hooks + an MCP server, and uses git for team sync. It sits alongside `CLAUDE.md` and `.cursorrules`, not above or below; those cover always-on guidance, aide-memory covers the dynamic, area-specific knowledge that should only surface when it's relevant.

What this means in practice: when the agent opens a file in a code area you've taught aide-memory about, it gets prompted to recall what's been learned there. When you correct it or surface a non-obvious finding, hooks prompt it to remember. Memories live as JSON files in `.aide/memories/`, so `git add` / `git push` / `git pull` is the team-sync path. Personal preferences stay gitignored; team-shared memories travel with the repo.

```bash
npm install -g aide-memory && aide-memory init
```

Free. Local-first. No account required.

---

## What aide-memory closes that rules files don't

Static rules files (CLAUDE.md, .cursorrules) and skills are useful for always-on guidance, but they have four real limits:

- **No unified convention or structure.** A team-wide guideline, a personal style preference, an area-specific decision, and a stack fact all blur into one file. The whole file gets injected on every turn, even when most of it might not be relevant to the area the agent is working in.
- **Manual capture.** Corrections and area knowledge from conversations don't make it back into the file on their own.
- **Tool-specific by default.** What you teach your agent in Claude Code doesn't carry to Cursor unless you copy the file over manually.
- **Unscoped recall.** Even when context is captured, nothing prompts the agent to look up what's relevant when it opens a specific file. The whole file lands in context, or nothing does.

aide-memory adds the layer those gaps leave open: scoped, layered, auto-captured-and-recalled memory with git as the team-sync substrate. Coexists with rules files; doesn't replace them.

---

## What aide-memory uniquely combines

The differentiator is the combination, not any single piece:

- **Layered + path-scoped recall.** Glob scopes (`src/auth/**`, `packages/api/**`) AND four typed layers (preferences / technical / area_context / guidelines). The agent gets only what's relevant for the file it's touching, ranked by how specific the layer is.
- **Hook-driven auto-capture.** Six hooks fire across the session lifecycle (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, PreCompact). Capture happens because the editor invokes them, not because anyone remembers to.
- **File-per-memory + git-synced.** One JSON file per memory under `.aide/memories/`. `git add`, `git push`, `git pull` is the team-sync path. Personal preferences stay gitignored; team-shared memories travel with the repo.
- **Cross-tool.** Claude Code and Cursor read the same store today. Deeper integration for other editors may come based on user feedback.
- **Local-first.** SQLite cache + JSON files on your disk. Memory content stays on your machine. Anonymized usage counts ship to PostHog by default; disable with `AIDE_TELEMETRY=off`.
- **Uses your existing agent.** No LLM calls of its own. The model in your editor does the reasoning.

---

## Quick Start

```bash
# 1. Install + initialize
npm install -g aide-memory
aide-memory init

# 2. Restart your editor so the MCP server registers
#    Cursor: Cmd+Q to quit, then reopen, then enable in Settings → MCP
#    Claude Code: start a fresh session in this project

# 3. Store a memory (or just talk to your agent and let hooks capture it)
aide-memory remember "API responses must use camelCase keys" --layer guidelines

# 4. Recall context for a path
aide-memory recall src/auth/

# 5. Search across memories
aide-memory search "authentication"

# 6. Share with your team
git add .aide/memories/
git commit -m "Capture team conventions"
git push
```

Full walkthrough: https://aide-memory.dev/docs/quick-start.

---

## What's in the box

- **7 MCP tools** for the agent: `aide_recall`, `aide_remember`, `aide_update`, `aide_forget`, `aide_search`, `aide_memories`, `aide_import`
- **13 CLI commands** for you: `init`, `recall`, `remember`, `update`, `forget`, `search`, `list`, `stats`, `recall-log`, `config`, `sync`, `migrate`, `cleanup`
- **6 hooks** wired into the editor at `init` (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, PreCompact)
- **4 typed memory layers** with personal/shared split for preferences
- **Local SQLite cache** rebuildable from JSON files at any time
- **FTS5 keyword search** plus optional semantic search via Transformers.js or Ollama
- **Configurable**: hook modes, scope-depth dial, recall caps, injection budgets, Stop schedule
- **Version update notice**: when a newer version is on npm, the SessionStart hook surfaces an "update available" line in chat (Claude Code) and a matching note in the auto-regenerated Cursor rules file

---

## Storage shape

```
.aide/                          # in your project (committed; personal prefs gitignored)
├── memories/
│   ├── preferences/
│   │   ├── personal/          # gitignored, your private prefs
│   │   └── shared/            # tracked, team-shared prefs
│   ├── technical/             # tracked, stack and integration facts
│   ├── area_context/          # tracked, decisions for specific code areas
│   └── guidelines/            # tracked, team and project principles
├── config.json                # local configuration with every public knob
└── config-reference.md        # auto-generated key/default/description listing

~/.aide/projects/<hash>/        # in your home dir (per-machine, never committed)
└── memory.db                   # SQLite cache (rebuildable from the JSON above)
```

Each memory is a single JSON file:

```json
{
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "layer": "technical",
  "what": "Apollo client uses persisted query hashes; raw queries 404 in prod",
  "why": "Discovered when the staging-vs-prod query mismatch broke checkout",
  "scope": "src/graphql/**",
  "contributor": "ahmed",
  "tags": ["api-contract", "graphql"],
  "shared": true
}
```

JSON files are the source of truth. SQLite is a rebuildable cache; delete `~/.aide/projects/<hash>/memory.db` and it reconstructs from the JSON on the next run.

---

## How recall works

When the agent calls `aide_recall({paths: [...]})`, the engine:

1. Loads memories whose scope matches at least one of the requested paths (with parent inheritance, so querying `src/` returns memories scoped under `src/`).
2. Sorts by **scope match first** (scoped beats project-wide), then **layer priority** (`area_context` > `technical` > `preferences` > `guidelines`), then **scope specificity** (deeper scopes rank higher) and keyword relevance.
3. Caps at `recall.limit` (default 20) before returning.
4. **Layer-diversity rebalance**: when the total result set is below `recall.layerDiversityMinLimit` (default 5), under-represented layers swap up so each enabled layer is at least represented.

For conceptual searches ("where do we handle auth tokens?"), prefer `aide_search` over `aide_recall` since keyword + semantic search surfaces memories that path-scoping alone would miss.

---

## Privacy and telemetry

**Code and memory content never leave your machine.** Memories are JSON files on your disk, the SQLite cache is local, and the MCP server runs over stdio.

Telemetry is on by default. Only event types and machine-anonymous counts are sent: event name, a SHA256-hashed `hostname:username` for deduplication, platform, arch, Node version. Memory content, file paths, query strings, the number of memories you have, and any other user-identifying data are never sent. The sender IP is not transmitted (`$ip: null`, `$geoip_disable: true`), so location is not derived from events. To turn it off:

```bash
# Option 1: env var (per-shell)
export AIDE_TELEMETRY=off

# Option 2: persistent config (per-project)
aide-memory config telemetry.enabled false
```

---

## Editor support

| Editor | Status |
|---|---|
| **Claude Code** | Reference adapter. Restart your session after `init` so the MCP server registers. |
| **Cursor** | Full hook + MCP wiring. Cmd+Q the app and reopen after `init`, then toggle the aide-memory MCP server ON in Settings → MCP. |
| **Windsurf, Codex, Copilot** | Rules template at launch. Deeper integration may come based on user feedback. |

Per-editor support: https://aide-memory.dev/docs/supported-editors.

---

## Configuration

`aide-memory init` seeds `.aide/config.json` with all public settings so you can see and edit them in one place.

```bash
aide-memory config <key>           # read
aide-memory config <key> <value>   # write
```

Or hand-edit `.aide/config.json`; the JSON file is the source of truth. Hooks re-read it on every fire so changes propagate without restarting anything.

A few of the most-used keys:

| Key | Default | Description |
|---|---|---|
| `hooks.read.maxBlocks` | `1` | Max pre-read hard-blocks per file path per session. `0` disables the hook. |
| `hooks.edit.maxBlocks` | `1` | Same for the pre-edit hook. |
| `hooks.search.mode` | `"soft"` | Pre-search hook: `"soft"`, `"block"`, or `"off"`. |
| `hooks.correction.enabled` | `true` | Detect correction patterns in user messages. |
| `hooks.visible` | `true` | Show user-facing `aide-memory · ...` lines in the terminal. |
| `recall.minScopeDepth` | `1` | How specific a scope must be to surface per-file. Bump to `2` to demote `src/**`-style broad scopes to SessionStart only. |
| `memories.softening.threshold` | `10` | Below this total-memory count, hard blocks downgrade to soft nudges. |
| `memories.defaultShared` | `true` | Default `shared` value for new `preferences` memories. Per-call always overrides. |

Full reference: https://aide-memory.dev/docs/configuration.

---

## Comparison with alternatives

aide-memory, [claude-mem](https://github.com/thedotmack/claude-mem), and [engram](https://github.com/ayvazyan10/engram) all attempt to give AI coding agents persistent memory, but they take meaningfully different shapes.

**aide-memory** is the new entrant. It combines layered + scoped recall, hook-driven auto-capture, file-per-memory storage with personal/shared split, a single shared store across Claude Code + Cursor, and git as the team-sync substrate. Uses your existing agent's inference budget; no LLM calls of its own.

**claude-mem** is the more established project in the space, with editor support across Claude Code, Cursor, Gemini CLI, OpenCode, and OpenClaw. Continuous capture via PostToolUse hook + session-summary at Stop; SessionStart injection of compressed recent-sessions context; 3-tool MCP search workflow for on-demand detail. Storage is SQLite (FTS5) primary with optional Chroma for semantic search; runtime uses a Bun-managed worker. Per-folder timelines via Folder Context Files are opt-in (`CLAUDE_MEM_FOLDER_CLAUDEMD_ENABLED`), default-off. License: AGPL-3.0.

**engram** is a cognitive-architecture-style memory system: three typed memory types (Episodic, Semantic, Procedural) on a knowledge graph, with graph-expansion at recall and contradiction detection. Storage is SQLite or Postgres + HNSW vector index; surface is MCP-first plus REST / CLI / webhooks / Ollama proxy. License: MIT.

Full comparison table: https://aide-memory.dev/docs/comparison.

---

## Requirements

- **Node.js 18 or later**
- **npm** (global install recommended; `npx` works as a quick try but path resolution can break across Node version upgrades or npx cache cleans)
- **Claude Code or Cursor** (for hook + MCP integration)

No Docker. No external databases. No API keys. No cloud accounts.

---

## License

aide-memory is **proprietary freeware**: free to use today, source not public, not open source. See [LICENSE](LICENSE) for the exact terms. More features coming.

---

## Documentation

Full docs at https://aide-memory.dev. Page directory:

- [Quick Start](https://aide-memory.dev/docs/quick-start)
- [Concepts](https://aide-memory.dev/docs/concepts), the editor-agnostic mental model
- [Features](https://aide-memory.dev/docs/features), what's in the box
- [Configuration](https://aide-memory.dev/docs/configuration), all config keys and what they do
- [Reference](https://aide-memory.dev/docs/reference), MCP tools + CLI commands side-by-side
- [Hooks](https://aide-memory.dev/docs/hooks), per-hook walkthrough
- [Architecture](https://aide-memory.dev/docs/architecture), how storage, hooks, and recall work
- [Supported Editors](https://aide-memory.dev/docs/supported-editors), per-editor table
- [Comparison](https://aide-memory.dev/docs/comparison), aide-memory vs claude-mem vs engram
- [FAQ](https://aide-memory.dev/docs/faq), common questions
- [Troubleshooting](https://aide-memory.dev/docs/troubleshooting), fix something broken

The repo's `docs/user/` tree carries short pointers to each canonical page on the website.
