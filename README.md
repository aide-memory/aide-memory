# aide-memory

**Layered, path-scoped, automatically-captured memory for AI coding agents and teams.**

Static rules files (CLAUDE.md, .cursorrules) drift, miss area-specific context, and live as one giant file with no scoping. Every new session, your agent re-learns what you taught yesterday. Your teammates' agents re-learn the things your agent already learned. Switch from Claude Code to Cursor and the lesson is gone.

aide-memory closes those gaps. It's a typed, scoped, auto-captured memory store with file-per-memory storage, six editor hooks, an MCP server, and git as the team-sync layer. Memories your agent stores travel with the repo so your teammates' agents pick them up on the next file read.

```bash
npx aide-memory init
```

Free. Local-first. No account required. Full docs at **https://aide-memory.dev**.

---

## What aide-memory uniquely combines

The differentiator is the combination, not any single piece:

- **Layered + path-scoped recall.** Glob scopes (`src/auth/**`, `packages/api/**`) AND four typed layers (preferences / technical / area_context / guidelines). The agent gets only what's relevant for the file it's touching, ranked by how specific the layer is.
- **Hook-driven auto-capture.** Six hooks fire across the session lifecycle (SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop, PreCompact). Capture happens because the editor invokes them, not because anyone remembers to.
- **File-per-memory + git-synced.** One JSON file per memory under `.aide/memories/`. `git add`, `git push`, `git pull` is the team-sync path. Personal preferences stay gitignored; team-shared memories travel with the repo.
- **Cross-tool out of the box.** Claude Code and Cursor read the same store today; more editor adapters in flight.
- **Local-first.** SQLite cache + JSON files on your disk. Telemetry is opt-in; nothing is sent until you set `AIDE_TELEMETRY=on`.
- **Uses your existing agent.** No LLM calls of aide-memory's own; the model in your editor does the reasoning, no extra inference cost.

---

## Quick Start

```bash
# 1. Initialize
npx aide-memory init

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
- **6 hooks** wired into the editor at `init`
- **4 typed memory layers** with personal/shared split for preferences
- **Local SQLite cache** rebuildable from JSON files at any time
- **FTS5 keyword search** plus optional semantic search via Transformers.js or Ollama
- **Configurable everything**: hook modes, scope-depth dial, recall caps, injection budgets, Stop schedule

---

## Storage shape

```
.aide/
├── memories/
│   ├── preferences/
│   │   ├── personal/          # gitignored, your private prefs
│   │   └── shared/            # tracked, team-shared prefs
│   ├── technical/             # tracked, stack and integration facts
│   ├── area_context/          # tracked, decisions for specific code areas
│   └── guidelines/            # tracked, team and project principles
├── config.json                # local configuration with every public knob
├── config-reference.md        # auto-generated key/default/description listing
└── cache/
    └── memory.db              # SQLite cache (rebuildable, gitignored)
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

JSON files are the source of truth. SQLite is a rebuildable cache; delete `.aide/cache/memory.db` and it reconstructs from the JSON on the next run.

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

Anonymized usage counts ship to PostHog by default so we can see which features are used: event type, a SHA256-hashed `hostname:username` for deduplication, platform, Node version. Memory content, file paths, query strings, the number of memories you have, and any other user-identifying data are never sent. To disable telemetry entirely:

```bash
export AIDE_TELEMETRY=off
```

---

## Editor support

| Editor | Status |
|---|---|
| **Claude Code** | Reference adapter, every capability works as designed. Restart your session after `init` so the MCP server registers. |
| **Cursor** | Full hook + MCP wiring. Cmd+Q the app and reopen after `init`, then toggle the aide-memory MCP server ON in Settings → MCP. Some capabilities are tracked against upstream Cursor platform work and will upgrade as Cursor ships fixes. |
| **Windsurf, Codex, Copilot** | Curated rules template at launch; full hook + MCP adapters in flight. |

Capability matrix: https://aide-memory.dev/docs/supported-editors.

---

## Configuration

`aide-memory init` seeds `.aide/config.json` with every public setting in one place so you can see and edit every knob with your normal editor.

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

**aide-memory** combines layered + path-scoped recall, hook-driven auto-capture, file-per-memory storage with personal/shared split, git-as-sync for teams, cross-tool support, and uses-your-existing-agent (no LLM calls of its own).

**claude-mem** injects context from recent sessions at session start and exposes a 3-layer MCP search workflow (search → timeline → get_observations) for on-demand detail. Folder Context Files give per-folder activity timelines. Storage: Chroma + Bun-managed worker. License: AGPL-3.0.

**engram** models three memory types (Episodic, Semantic, Procedural) with a knowledge graph for the semantic layer and namespace isolation per project or agent. License: MIT.

Full comparison table: https://aide-memory.dev/docs/comparison.

---

## Requirements

- **Node.js 18+**
- **npm or npx**
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
- [Configuration](https://aide-memory.dev/docs/configuration), every knob and what it does
- [Reference](https://aide-memory.dev/docs/reference), MCP tools + CLI commands side-by-side
- [Hooks](https://aide-memory.dev/docs/hooks), per-hook walkthrough
- [Architecture](https://aide-memory.dev/docs/architecture), how storage, hooks, and recall work
- [Supported Editors](https://aide-memory.dev/docs/supported-editors), capability matrix
- [Comparison](https://aide-memory.dev/docs/comparison), aide-memory vs claude-mem vs engram
- [FAQ](https://aide-memory.dev/docs/faq), common questions
- [Troubleshooting](https://aide-memory.dev/docs/troubleshooting), fix something broken

The repo's `docs/user/` tree carries short pointers to each canonical page on the website.
