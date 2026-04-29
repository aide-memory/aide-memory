# aide-memory

**Layered, path-scoped, automatically-captured memory for AI coding agents and teams.**

Static rules files (CLAUDE.md, .cursorrules) drift. Every new session, your agent re-learns what you taught yesterday. Your teammates' agents re-learn the things your agent already learned. Switch tools and the lesson is gone.

aide-memory fixes this with a typed, scoped, auto-captured memory store, six editor hooks, an MCP server, and git as the team-sync layer.

## Install

```bash
npx aide-memory init
```

After init, restart your editor so the MCP server registers. On Cursor, also enable the aide-memory MCP server in Settings → MCP.

## What it does

- **Layered + path-scoped recall**: glob scopes (`src/auth/**`) AND four typed layers (preferences / technical / area_context / guidelines)
- **Hook-driven auto-capture**: six editor hooks prompt the agent to recall and remember at the right moments
- **Git-synced for teams**: memories are JSON files; commit, push, pull, your teammates' agents pick them up
- **Cross-tool**: Claude Code and Cursor today; more editor adapters in flight
- **Local-first**: SQLite cache + JSON files on your disk; uses your existing agent (no extra LLM calls)

## Privacy

Code and memory content never leave your machine. Anonymized usage counts (event type, hashed machine id, platform, Node version) ship to PostHog by default so we can see which features are used; disable any time with `AIDE_TELEMETRY=off`. See https://aide-memory.dev/docs/configuration#telemetry for the full breakdown.

## License

Proprietary freeware: free to use today, source not public, not open source. More features coming.

## Documentation

Full documentation: **https://aide-memory.dev**
