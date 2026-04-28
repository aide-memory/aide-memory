# aide-memory: persistent memory for AI coding agents

## The problem

You spent thirty minutes yesterday explaining to the agent why your codebase uses libsql instead of better-sqlite3, why error responses use a flat shape instead of nested envelopes, and why `src/auth/middleware.ts` does its own JWT parsing instead of leaning on the framework helper.

Today you open a new session and ask the agent to add a refresh-token endpoint. It suggests better-sqlite3. It nests the error envelope. It rips out your custom JWT parser in favor of the framework helper "for simplicity."

You correct it again. Tomorrow you'll correct it again.

This is the shape of working with stateless agents. The model is fine. The codebase is fine. What's missing is the layer in between: a place to write down the conventions, corrections, and decisions that make this codebase *this codebase*, in a form the agent picks up automatically when it touches the relevant files.

That's what aide-memory is.

## What aide-memory does

aide-memory is an MCP server and hook layer that runs locally alongside your editor. It gives agents persistent, path-scoped memory across sessions.

### Path-scoped recall with glob inheritance

Every memory attaches to a scope: a glob pattern like `src/auth/**`, `packages/api/server/**`, or no scope at all (project-wide). When the agent reads or edits a file, aide-memory matches the file path against stored scopes and surfaces the relevant memories before the agent acts.

Memories live in four layers:

- **preferences.** How you like to work (e.g. "prefers composition over inheritance").
- **technical.** Facts about the stack not obvious from code (e.g. "WAL mode required for concurrent SQLite access").
- **area_context.** Decisions tied to specific code areas (e.g. "the dashboard uses skeleton loading, not spinners").
- **guidelines.** Team-wide principles (e.g. "all API responses use camelCase").

The layers aren't bureaucracy. They drive how memories surface: preferences and guidelines inject at session start so the agent knows your style from turn one; technical and area_context surface lazily when the agent touches matching paths, so token budget stays bounded.

### Automatic capture via hooks

Six hooks fire across the session lifecycle. You don't manage them; they're installed by `aide-memory init`.

- **SessionStart** injects top-N preferences, guidelines, and any priority-always memories into the agent's starting context (capped at 1200 characters by default; tunable).
- **PreToolUse** intercepts file reads, edits, and grep calls. When scoped memories exist for the target path, the hook hard-blocks the first read or edit per session and tells the agent to call `aide_recall`. After recall, the agent retries; subsequent reads of the same path are silent.
- **UserPromptSubmit** detects correction patterns ("no, use X instead", "actually...") and nudges the agent to call `aide_remember` with the correction stored against the relevant scope.
- **Stop** prompts a reflection nudge ("anything worth remembering?") on a ramped schedule (every 3 turns early, every 10 turns later) so noise stays low on long sessions.
- **PreCompact** clears tracking files before context compaction so the post-compact turn starts clean and re-blocks correctly.
- **PostToolUse** records which memory IDs were recalled so the same path doesn't re-block within a session.

The result: the agent learns from your corrections automatically. You don't have to remember to tell it to remember.

### Search-first nudge before code dumps

When the agent reaches for grep on a concept-level query ("where do we handle auth tokens?", "what's the API response convention?"), a soft hook points it at `aide_search` first. The agent decides whether the lookup is worth a separate call. If a stored memory already answers the question, it surfaces before a thousand lines of grep output do.

### Personal vs shared preferences

Preferences live in two folders: `preferences/shared/` (committed to the repo, team-visible) and `preferences/personal/` (gitignored, yours alone). By default new preferences are shared, so teams build a common picture; flip `memories.defaultShared` to false if you'd rather opt in explicitly per memory. Per-call `shared: true|false` always wins over the default.

### Local-first storage, opt-in telemetry

Memories live as JSON files under `.aide/memories/` in your repo, organized by layer (preferences, technical, area_context, guidelines), with a local SQLite cache at `~/.aide/projects/<hash>/memory.db` (WAL mode) for fast lookups. The JSON files are the source of truth; the cache rebuilds from them.

Telemetry is **off by default and opt-in via `AIDE_TELEMETRY=on`**. When opted in, only anonymized event tallies (counts of recalls, remembers, hook fires) are sent. Memory content, file paths, code, and query strings never leave your machine, opted in or not.

### Search backends

`aide_search` runs FTS5 keyword search against the local SQLite cache by default. For semantic-similarity search, aide-memory ships with two optional backends:

- `@huggingface/transformers` is listed under `optionalDependencies`. Default `npm install -g aide-memory` will attempt to install it (npm continues if it fails). When present, semantic search runs locally with no network calls; the model itself downloads from Hugging Face on first use.
- A local Ollama server (default `http://localhost:11434`) with an embedding model loaded. Configure with `aide-memory config embeddings.backend ollama`.

If neither backend is available, semantic search degrades to keyword-only and aide-memory continues to work.

## Editor support today

aide-memory's core (the MCP server, the seven tools, the hook dispatcher) is editor-agnostic. Each editor integration is an adapter that translates aide-memory's canonical events into that editor's config shape and hook I/O contract.

**Claude Code** is the reference adapter. Every capability (hard-block on read or edit, soft re-read nudges, native session-start injection, in-turn correction detection, branded inline status lines, post-compaction context re-injection) works as designed. New aide-memory features validate against Claude Code first.

**Cursor** ships with full hook and MCP wiring. `aide-memory init` writes `.cursor/hooks.json`, `.cursor/mcp.json`, and a dynamically regenerated `.cursor/rules/aide-memory.mdc` that carries the same content Claude Code gets via SessionStart. Hard blocks render branded chrome inline; soft nudges reach the agent through Cursor's `agent_message` channel; corrections are detected via `beforeSubmitPrompt`.

A handful of capabilities are tracked against upstream Cursor threads and will upgrade as Cursor ships the corresponding platform changes:

- The native `sessionStart.additional_context` channel isn't yet wired by Cursor itself. We deliver the same content via the regenerated rules file (Cursor staff's endorsed approach).
- Inline visible chrome on soft fires lives in the Hooks Output panel rather than chat; agent-side context still arrives on every fire.
- The per-Read hook does not fire when the file is already open in Cursor's editor pane. The per-Edit safety net is unaffected, and the rules-file guidance instructs agents to call `aide_recall` on editor-cached reads (empirically followed in 100% of file-open reads under typical prompts).
- Correction reminders surface one turn later via the next Stop hook's `followup_message`, since `beforeSubmitPrompt` has no context-injection channel.
- SessionStart does not re-fire after compaction; the always-applied rules file partially covers it, but the dedicated post-compact pipeline isn't available.

Each item maps to a public Cursor thread (linked in `docs/user/editors/cursor.md`). When Cursor ships the fix, the adapter upgrades and the workaround retires.

**Codex, Copilot, Windsurf** ship a curated rules template today: same canonical body as Claude Code and Cursor, plus editor-specific frontmatter. Hooks and MCP config aren't yet generated by `aide-memory init` for these editors. Full adapters are next on the roadmap.

## Try it

```bash
npm install -g aide-memory
cd your-project
aide-memory init
```

`init` writes the config files for the editors aide-memory supports today (Claude Code and Cursor get hooks, MCP config, rules; Codex, Copilot, Windsurf get a rules template), creates `.aide/config.json` and `.aide/memories/`, and adds the right `.gitignore` entries.

What to expect on your first session:

1. The agent gets your top preferences and guidelines injected at session start (or the rules file equivalent in Cursor).
2. The first time it reads a file with scoped memories, the hook prompts it to call `aide_recall` first.
3. When you correct it, the correction stores against the relevant scope automatically.
4. Next session, those memories are still there.

Full docs at `/docs/user/`. Per-editor capability matrix at `/docs/user/editors/`.

## Honest disclosure

`/docs/user/editors/` is the per-editor capability matrix. It documents what each adapter ships today, plus the upstream platform threads tracked for capabilities we'd like to add.

A few coverage caveats worth flagging up front:

- aide-memory's pre-search hook fires on the editor's `Grep` matcher. `Bash+grep` (shell-routed) and Cursor's built-in `codebase_search` are not hook-covered today. The agent should still call `aide_search` first on concept queries; the rules file reminds it to.
- Cursor `@-file` attachments and Tab context bypass `preToolUse` hooks entirely. aide-memory's nudge is about agent-planned reads, not user-provided context.
- Most of the manual end-to-end testing on this release exercised the FTS5 keyword path. The semantic-search path is contract-tested at unit level, has a smoke test against a real backend (Ollama) wired into `npm run test:smoke`, and works empirically; we are still doing more verification across embedding models, larger memory tables, and combined keyword + semantic queries. If you hit a semantic-search edge case, please file an issue.

aide-memory is proprietary freeware. Free for everyone today, with some future enhancements expected to remain free and some that may ship as paid team or pro features.

Counts at launch: 7 MCP tools, 13 CLI commands, 6 hooks, 782 vitest tests, plus install-from-tarball, debug-output, defaultShared, and semantic-search smokes.
