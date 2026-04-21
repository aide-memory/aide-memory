# Changelog

## 0.4.1 — 2026-04-21

Patch release fixing two bugs caught in a post-publish audit of 0.4.0.

### Fixes

- **`aide-memory config <hook-key>` no longer fails with "Unknown config key".** 0.4.0 removed `scripts/hooks/defaults.json` from the published tarball (hook logic is bundled, so the source JSON was redundant) — but `src/memory/settings.ts` was still reading that file at runtime to validate config keys. The result: every hook-related setting key (`hooks.read.maxBlocks`, `hooks.stop.schedule`, `recall.limit`, `injection.preferences`, 14 others) reported as "Unknown config key" and returned the AideConfig defaults as the valid key list. Fixed by inlining the defaults JSON at bundle time via the same ES module JSON import pattern the hook handlers use.
- **MCP `serverInfo.version` now reports the installed package version.** The `createServer()` call in `src/memory/server.ts` hardcoded `version: '0.2.0'`, a stale holdover that advertised the wrong product version in the MCP initialize handshake. Changed to read the version from the installed `package.json` at runtime. Functional impact was limited to MCP clients that surface the server-advertised version — npm still shows the correct installed version everywhere else.

No other changes from 0.4.0. All features, CLI commands, hooks, and MCP tools remain identical.

---

## 0.4.0 — 2026-04-21

### aide-memory — the persistent memory layer for AI coding agents

aide-memory gives AI coding agents a persistent, path-scoped memory of everything you've taught them. Your agent remembers your stack, your preferences, your team's conventions, and the reasoning behind your past decisions — across every session, every branch, and every tool.

Memories live in your git repo, not in someone else's cloud. No telemetry, no cross-project leakage, no lock-in. Private by default.

This release is the first stable line shipped as a closed-source, source-protected binary. Earlier numbered versions (0.1.x, 0.2.x, 0.3.x) predated this architecture and are no longer supported.

### What's in the box

**Path-scoped recall across four layers.** Memories are attached to glob scopes (`src/api/**`, `docs/`, a specific file, or project-wide) and surface to your agent when it touches those paths. Four semantic layers keep recall organized:

- **preferences** — how you like to work (coding style, tool choices, personal habits)
- **technical** — facts about your stack (library constraints, version requirements, known gotchas)
- **area_context** — decisions for a code area (why the auth module works this way, the trade-offs made)
- **guidelines** — team principles and rules

Parent-scope inheritance (memories scoped to `src/components/**` also match `src/components/dashboard/Card.tsx`) and focused-scope filtering (grandparent scopes stay out of the way) make recall precise enough to not be noisy.

**Full MCP server integration.** Once `aide-memory init` wires up `.mcp.json`, your agent gets seven tools:

- `aide_recall` — retrieve memories for a set of paths
- `aide_remember` — store a new memory (four layers supported)
- `aide_update` — change an existing memory's `why`, `scope`, or `priority`
- `aide_forget` — delete a memory
- `aide_search` — keyword-match across all memories
- `aide_memories` — list memories with filters
- `aide_import` — bulk import memories from raw text (e.g., a README or decision doc)

All tool schemas accept lenient inputs (`z.coerce.number()` for IDs, `null` in addition to `undefined` for optional fields) so LLMs don't get blocked by minor type mismatches.

**Eleven hooks that nudge the agent at the right moments.** aide-memory installs hooks into `.claude/settings.json` that fire during a Claude Code session:

- **Pre-read / pre-edit** — block or soft-nudge the agent to call `aide_recall` before touching a file with scoped memories
- **Pre-search** — nudge the agent to call `aide_search` before a Grep/Glob when matching memories exist
- **Pre-prompt (UserPromptSubmit)** — detect corrections, decisions, and preferences in what you type, and prompt the agent to store them via `aide_remember`
- **Session-start injection** — surface preferences, guidelines, and priority-always memories as context at the start of every session
- **Dynamic Stop-hook intervals** — remind the agent to save newly-learned things every 3rd, 5th, or 10th turn (configurable schedule) so nothing is lost between sessions
- **Pre-compact cleanup** — clear session tracking before Claude Code compacts the context, so the next turn re-blocks cleanly
- **Post-tool trackers** — mark ids/paths/queries as already-recalled so the same memory doesn't get nudged twice

Hook logic is bundled into the distributed binary; only a thin bash shim is visible on disk. All hook behavior is configurable via `aide-memory config`.

**CLI parity with the MCP surface.** Everything agents can do over MCP, you can do from the terminal:

```
aide-memory init                        # set up .aide/, .claude/rules/, .mcp.json, hooks
aide-memory remember "<what>" --layer <layer> [--scope <glob>] [--contributor <name>]
aide-memory recall <path>               # preview what the agent will see
aide-memory list [--layer <layer>]
aide-memory search <keyword>
aide-memory update <id> [--why ...] [--scope ...] [--priority always|normal]
aide-memory forget <id>
aide-memory stats                       # counts by layer, most-recalled, source breakdown
aide-memory config <key> [value]        # tune 18 public settings
aide-memory sync export | sync import   # reconcile SQLite cache ↔ .aide/memories/*.json
aide-memory cleanup                     # remove stale session tracking files
```

**Synchronous SQLite backend.** Memories are written to `.aide/memories/<layer>/<uuid>.json` and indexed in a local SQLite cache at `.aide/memory.db`. Commits track memory changes via git — the database is rebuildable from the JSON files at any time (`aide-memory sync import`), so losing the cache is never lossy.

**Optional semantic recall.** The default recall is fast keyword + scope filtering. Install `@huggingface/transformers` to add BGE-small-en-v1.5 embeddings for semantic-similarity fallback when keyword matches come up short. Optional dependency — no effect on cold install size if you don't use it.

**18 tunable settings.** `aide-memory config` lets you adjust nudge aggressiveness, injection limits per layer, embedding backend, stop-hook intervals, grep-hook mode, and more. Every setting is transparent — no hidden pro-vs-free gating in the current version.

**Drift-repair.** If `.claude/rules/aide-memory.md`, `.mcp.json`, or `.claude/settings.json` hook entries drift from the canonical form mid-session (e.g., because someone edited them by hand), aide-memory re-syncs them automatically on the next hook fire. No restart required.

**Multi-editor rules templates.** `aide-memory init` installs guidance-rule files for Claude Code, Cursor, Copilot, Codex, and Windsurf. Your agent sees the rule file appropriate to whatever tool is running.

### Distribution

- **Install:** `npm install -g aide-memory`
- **Size:** 388 KB compressed, ~1.4 MB unpacked (three bundled JS entries for CLI / library / MCP server + 11 bash hook shims + rule templates + docs + license).
- **Node version:** requires Node.js 18 or later. No Node runtime shipped — aide-memory runs on whatever Node you already have.
- **Platforms:** any platform with Node.js + better-sqlite3 (native) — macOS arm64/x64, Linux x64/arm64, Windows x64 all supported.
- **No telemetry or cloud dependency.** All data lives in your local `.aide/` directory, committed to your git repo.

### License

aide-memory is free to install and use — personal and commercial — under the terms in `LICENSE.md`. This version has no paid features. The license reserves the right to offer paid features in future versions; the terms that ship with any given version continue to apply to that version.

Source code is NOT distributed. The package ships bundled and minified JavaScript with reverse-engineering prohibited by the license. Your `.aide/memories/` data, hook scripts invoked by your own projects, and anything you write using aide-memory remain fully yours.

### Support

- Issues: <https://github.com/aide-memory/aide-memory/issues>
- Docs: <https://aide-memory.dev>
