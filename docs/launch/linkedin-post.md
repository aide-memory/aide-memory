# LinkedIn announcement (zero em-dashes)

Launching aide-memory: a persistent memory layer for AI coding agents.

The problem: every new session, the agent forgets your stack, your conventions, the corrections you gave it yesterday. You re-explain. It re-suggests the thing you already rejected.

aide-memory is an MCP server plus hook layer that gives agents path-scoped memory across sessions. What it does:

- **Path-scoped recall.** Memories attach to glob scopes (`src/auth/**`, `packages/api/**`) and surface when the agent reads or edits matching files. Four layers: preferences, technical, area_context, guidelines.

- **Automatic capture.** Six hooks fire across the session lifecycle. When you correct the agent ("no, use X"), it stores the correction. When a turn ends with a real decision, it offers to save it. When a session starts, preferences and guidelines inject into context.

- **Search-first nudge.** Before the agent reaches for grep on a concept query ("where do we handle auth?"), a soft nudge points it at `aide_search` first. Stored answers surface before code dumps do.

- **Local SQLite, opt-in telemetry.** Memories live as JSON files in `.aide/memories/`, your repo stays clean. Telemetry is opt-in via `AIDE_TELEMETRY=on`. When on, only anonymized event tallies leave your machine. Memory content, file paths, and queries never do.

Available today for Claude Code and Cursor with full hook + MCP wiring. Codex, Copilot, and Windsurf get a curated rules template; full adapters ship next.

7 MCP tools, 13 CLI commands, 6 hooks, 778 vitest tests.

License: proprietary freeware. Free for everyone today; some future enhancements are expected to remain free, others may ship as paid team or pro features.

Install: `npm i -g aide-memory && aide-memory init`
Docs: [link]
Demo: [video link]

Per-editor capability matrix: /docs/user/editors/
