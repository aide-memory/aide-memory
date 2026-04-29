# aide-memory: persistent memory for AI coding agents and teams

## The problem

You spent thirty minutes yesterday explaining to the agent why your codebase uses libsql instead of better-sqlite3, why error responses use a flat shape instead of nested envelopes, and why `src/auth/middleware.ts` does its own JWT parsing instead of leaning on the framework helper.

Today you open a new session and ask the agent to add a refresh-token endpoint. It suggests better-sqlite3. It nests the error envelope. It rips out your custom JWT parser in favor of the framework helper "for simplicity."

You correct it again. Tomorrow you'll correct it again. And so will your teammate, separately, in their session, against their own copy of the same agent.

This is the shape of working with stateless agents on a real codebase. The model is fine. The codebase is fine. What's missing is the layer in between: a place to write down the conventions, corrections, and decisions that make this codebase *this codebase*, in a form the agent picks up automatically when it touches the relevant files, and your teammates' agents pick up when they touch them too.

That's what aide-memory is.

## Why static rules files aren't enough

The starting point most teams reach for is `CLAUDE.md` or `.cursorrules`. These are real and useful, but they have known limits:

- **They drift.** One flat file, no scoping, manual to update. The agent can read stale guidance when reality moves and the file doesn't.
- **No layered structure.** A team-wide guideline, a personal preference, a decision-for-this-area, and a fact about the stack all blur into a 200-line wall of text.
- **No team handoff for live knowledge.** What you teach Claude Code in your session is gone the moment your teammate opens their session. Domain knowledge stays trapped in your conversation history.
- **Tool lock-in.** What you teach Claude Code doesn't carry to Cursor. Switch tools, lose the lesson. "Works on my agent" is the new "works on my machine."
- **Capture without auto-recall.** Even if you do capture corrections in a rules file, nothing prompts the agent to recall the relevant subset when it opens a file. Everything gets injected globally on every turn, even when most of it isn't relevant to the file the agent is touching.

aide-memory does not replace your rules files. They coexist. aide-memory adds the scoped, layered, auto-captured, git-synced layer on top.

## What aide-memory does

aide-memory is an MCP server, a hook layer, and a typed file-per-memory store that runs locally alongside your editor. It gives agents (and your team's agents) persistent memory across sessions, scoped to the code they're touching, captured automatically by editor hooks, and synced via git.

### Layered + path-scoped recall

Every memory attaches to a scope: a glob pattern like `src/auth/**`, `packages/api/server/**`, or no scope at all (project-wide). When the agent reads or edits a file, aide-memory matches the file path against stored scopes and surfaces the relevant memories before the agent acts.

Memories live in four layers:

- **preferences.** How a contributor likes to work (e.g. "When refactoring shared types, prefer `type` aliases over `interface` for union shapes").
- **technical.** Facts about the stack not obvious from code (e.g. "Apollo client uses persisted query hashes; raw queries 404 in prod").
- **area_context.** Decisions tied to specific code areas (e.g. "Checkout uses Stripe Payment Element, not the legacy Card Element. Migration landed sprint 38.").
- **guidelines.** Team-wide principles (e.g. "Public REST endpoints return errors as `{error: {code, message}}`, never bare strings").

Recall is layered: `area_context` ranks first (most specific), then `technical`, then `preferences`, then `guidelines`. Within a layer, scoped memories beat project-wide ones, deeper scopes beat shallower ones.

### Personal vs team-shared

Preferences split into two folders: `preferences/personal/` (gitignored, yours alone) and `preferences/shared/` (committed, team-visible). The other three layers are team-visible by default. So personal style stays personal, but team conventions, decisions, and stack facts travel with the repo.

### Hook-driven capture

Six hooks fire across the session lifecycle. You don't manage them; they're installed by `aide-memory init`.

- **SessionStart** injects top-N preferences, guidelines, and any priority-always memories into the agent's starting context (capped at 1200 characters by default; tunable).
- **PreToolUse** intercepts file reads, edits, and grep calls. When scoped memories exist for the target path, the hook hard-blocks the first read or edit per session and tells the agent to call `aide_recall`. After recall, subsequent reads of the same path are silent or soft-nudged. Configurable: flip to `0` to disable, or `block` mode for grep too.
- **UserPromptSubmit** detects correction patterns ("no, use X instead", "actually...") and prompts the agent to call `aide_remember` with the correction stored against the relevant scope.
- **Stop** prompts a reflection nudge ("anything worth remembering?") on a configurable schedule (default ramps every 3 turns through turn 9, every 5 through turn 29, every 10 afterwards) so noise stays low on long sessions.
- **PreCompact** prompts the agent to save active plans/decisions before context compaction, then clears session tracking so post-compact reads re-prompt cleanly.
- **PostToolUse** records which memory IDs were recalled so the same path doesn't re-prompt within a session.

The result: capture happens because the editor invokes the hook, not because anyone remembers to call a tool. Studies put voluntary "remember this" adoption near zero; hooks bring it to one hundred percent of the moments that matter.

### Git-synced for teams

Memories are JSON files. Commit them, push them, pull them. A `post-checkout` git hook (installed at init) rebuilds the local SQLite cache after `git pull` or branch switch so your teammates' agents see the same context yours does on their next file read.

```bash
# You captured a decision worth keeping
git add .aide/memories/area_context/
git commit -m "Capture skeleton-loading decision for dashboard"
git push

# Your teammate pulls
git pull
# Their agent's next read of src/components/dashboard/ surfaces:
# "1 memory exists for src/components/dashboard/. Call aide_recall."
```

No sync service, no auth, no daemons. Files are the substrate; git is the sync.

### Cross-tool out of the box

Claude Code and Cursor both read the same `.aide/memories/` directory. Switch tools mid-task and your context follows. More editor adapters are in flight: Codex, Copilot, and Windsurf get a curated rules template at launch, with full hook + MCP adapters being onboarded next.

### Search-first nudge before grep dumps

When the agent reaches for grep on a concept-level query ("where do we handle auth tokens?", "what's the API response convention?"), a soft hook points it at `aide_search` first. The agent decides whether the lookup is worth a separate call. If a stored memory already answers the question, it surfaces before a thousand lines of grep output do.

### Local-first storage, opt-in telemetry

Memories live as JSON files under `.aide/memories/` in your repo, organized by layer (preferences, technical, area_context, guidelines), with a local SQLite cache at `~/.aide/projects/<hash>/memory.db` (WAL mode) for fast lookups. The JSON files are the source of truth; the cache rebuilds from them.

Telemetry is **opt-in: until you set `AIDE_TELEMETRY=on`, aide-memory makes zero telemetry network calls.** When you opt in, only anonymized event tallies (counts of recalls, remembers, hook fires; a hashed machine id; platform; Node version) are sent. Memory content, file paths, code, and query strings never leave your machine, opted in or not.

### Search backends

`aide_search` runs FTS5 keyword search against the local SQLite cache by default. For semantic-similarity search, aide-memory ships with two optional backends:

- `@huggingface/transformers` is listed under `optionalDependencies`. Default `npm install -g aide-memory` will attempt to install it (npm continues if it fails). When present, semantic search runs locally with no network calls; the model itself downloads from Hugging Face on first use.
- A local Ollama server (default `http://localhost:11434`) with an embedding model loaded. Configure with `aide-memory config embeddings.backend ollama`.

If neither backend is available, semantic search degrades to keyword-only and aide-memory continues to work.

### Uses your existing agent

aide-memory is a typed store + hook dispatcher + MCP server. It does no LLM calls of its own. The agent in the editor you already use does all the reasoning, so there's no extra inference cost: aide-memory's surface is just the tools the agent calls and the hooks the editor fires.

### Configurable everything

Defaults capture the common case. The point of the config surface is that every part of the flow is tunable: every hook mode, scope dial, recall cap, injection budget, Stop schedule, contributor identity, embedding backend. If you don't like one piece of the flow, you flip one knob. `aide-memory init` seeds `.aide/config.json` with every public setting in one place so you can see and edit every knob with your normal editor.

## Editor support today

aide-memory's core (the MCP server, the seven tools, the hook dispatcher) is editor-agnostic. Each editor integration is an adapter that translates aide-memory's canonical events into that editor's config shape and hook I/O contract.

**Claude Code** is the reference adapter. Every capability (hard-block on read or edit, soft re-read nudges, native session-start injection, in-turn correction detection, branded inline status lines, post-compaction context re-injection) works as designed. New aide-memory features validate against Claude Code first.

**Cursor** ships with full hook and MCP wiring. `aide-memory init` writes `.cursor/hooks.json`, `.cursor/mcp.json`, and a dynamically regenerated `.cursor/rules/aide-memory.mdc` that carries the same content Claude Code gets via SessionStart. Hard blocks render branded chrome inline; soft nudges reach the agent through Cursor's `agent_message` channel; corrections are detected via `beforeSubmitPrompt`.

A handful of capabilities are tracked against upstream Cursor threads and will upgrade as Cursor ships the corresponding platform changes:

- The native `sessionStart.additional_context` channel isn't yet wired by Cursor itself. We deliver the same content via the regenerated rules file (Cursor staff's endorsed approach).
- Inline visible chrome on soft fires lives in the Hooks Output panel rather than chat; agent-side context still arrives on every fire.
- The per-Read hook does not fire when the file is already open in Cursor's editor pane. The per-Edit safety net is unaffected, and the rules-file guidance instructs agents to call `aide_recall` on editor-cached reads.
- Correction reminders surface one turn later via the next Stop hook's `followup_message`, since `beforeSubmitPrompt` has no context-injection channel.
- SessionStart does not re-fire after compaction; the always-applied rules file partially covers it, but the dedicated post-compact pipeline isn't available.

Each item maps to a public Cursor thread (linked at https://aide-memory.dev/docs/editors/cursor). When Cursor ships the fix, the adapter upgrades and the workaround retires.

**Codex, Copilot, Windsurf** ship a curated rules template today: same canonical body as Claude Code and Cursor, plus editor-specific frontmatter. Hooks and MCP config aren't yet generated by `aide-memory init` for these editors. Full adapters are next on the roadmap.

Both Claude Code and Cursor require **a one-time editor restart** after `aide-memory init` so the MCP server registers (both editors load MCP config at session start, not live). Cursor adds a second step: toggle the aide-memory MCP server ON in Settings → MCP, since Cursor disables newly-discovered MCP servers by default.

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
4. Next session, those memories are still there. So is the next teammate's agent that pulls your commits.

Full docs at https://aide-memory.dev. Per-editor capability matrix at https://aide-memory.dev/docs/supported-editors.

## Honest disclosure

A few coverage caveats worth flagging up front:

- aide-memory's pre-search hook fires on the editor's `Grep` matcher. `Bash+grep` (shell-routed) and Cursor's built-in `codebase_search` are not hook-covered today. The agent should still call `aide_search` first on concept queries; the rules file reminds it to.
- Cursor `@-file` attachments and Tab context bypass `preToolUse` hooks entirely. aide-memory's nudge is about agent-planned reads, not user-provided context.
- Most of the manual end-to-end testing on this release exercised the FTS5 keyword path. The semantic-search path is contract-tested at unit level, has a smoke test against a real Ollama backend wired into `npm run test:smoke`, and works empirically against simple queries. Deeper coverage across embedding models, larger memory tables, and combined keyword + semantic queries is open work, not in flight. If you hit a semantic-search edge case, please file an issue.

aide-memory is **proprietary freeware**: free to use today; source not public; not open source, not FSL, not MIT. Free for individuals today. Future enhancements may stay free, or some may ship as separate tiers as the project grows.

Counts at launch: 7 MCP tools, 13 CLI commands, 6 hooks. The website docs at https://aide-memory.dev are the canonical reference; the GitHub repo's `docs/user/` tree carries short pointers to each canonical page.
