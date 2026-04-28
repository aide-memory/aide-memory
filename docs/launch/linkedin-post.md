# LinkedIn announcement (zero em-dashes)

Launching aide-memory: layered, path-scoped, auto-captured memory for AI coding agents AND teams.

The problem: every new session, your agent re-learns what you taught yesterday. Your teammates' agents re-learn the things your agent already learned. Switch from Claude Code to Cursor and the lesson is gone. CLAUDE.md and .cursorrules help, but they're flat files; they drift; they don't scope to areas; they don't auto-capture.

aide-memory closes those gaps. It's the layer between your editor's hooks, your agent's MCP tools, and the persistent knowledge of your codebase.

What's unique is the combination:

- **Layered + path-scoped recall.** Glob scopes (`src/auth/**`, `packages/api/**`) AND four typed layers (preferences, technical, area_context, guidelines). The agent gets only what's relevant for the file it's touching.

- **Hook-driven auto-capture.** Six hooks fire across the session lifecycle. When you correct the agent, it stores the correction. When a turn ends with a real decision, it offers to save it. When a session starts, top preferences and guidelines inject automatically.

- **Git-synced for teams.** Memories are JSON files in `.aide/memories/`. Commit them, push them, your teammates pull them. Their agents pick up the lessons you stored, on the next file read in the relevant area. Personal preferences stay gitignored; team conventions travel with the repo.

- **Cross-tool.** Claude Code and Cursor read the same store. More editor adapters in flight.

- **Uses your existing agent.** aide-memory is a typed store + dispatcher, no LLM calls of its own. The model in the editor you already pay for does all the reasoning. No extra inference cost.

- **Local-first, opt-in telemetry.** Memories live as JSON files on your disk plus a local SQLite cache. Until you set `AIDE_TELEMETRY=on`, aide-memory makes zero telemetry network calls. When opted in, only anonymized event tallies are sent; never content.

7 MCP tools, 13 CLI commands, 6 hooks, plus FTS5 keyword search and optional semantic search via Transformers.js or Ollama.

License: proprietary freeware. Free to use today; potentially paid team / pro features later.

Install: `npx aide-memory init`
Docs: https://aide-memory.dev
Demo: [video link]

Per-editor capability matrix: https://aide-memory.dev/docs/supported-editors
