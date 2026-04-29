# aide-memory

> **Website:** https://aide-memory.dev
> **Docs:** https://aide-memory.dev/docs
> **Install:** `npx aide-memory init`

## TL;DR

aide-memory is a categorized, scoped, auto-captured-and-recalled memory layer for AI coding agents (Claude Code + Cursor today). It runs locally, plugs in via hooks + an MCP server, and uses git for team sync. Coexists with `CLAUDE.md` and `.cursorrules`; doesn't replace them.

When the agent opens a file in a code area you've taught aide-memory about, it gets prompted to recall what's been learned there. When you correct it, hooks prompt it to remember. Memories live as JSON files in `.aide/memories/`, so `git add` / `git push` / `git pull` is the team-sync path.

## Install

```bash
npx aide-memory init
```

After init, start a fresh session in your editor (or restart it) so the MCP server registers. On Cursor, also enable the aide-memory MCP server in Settings → MCP.

## What it does

- Categorized + scoped recall (4 layers: preferences / technical / area_context / guidelines × glob scopes like `src/auth/**`)
- Six editor hooks prompt the agent to recall and remember at the right moments
- Memories are JSON files in your repo; commit, push, pull, your teammates' agents pick them up
- Single shared `.aide/memories/` store across Claude Code + Cursor
- Local-first: SQLite cache + JSON files on your disk; no LLM calls of aide-memory's own

## Privacy

Code and memory content never leave your machine. Anonymized usage counts (event type, hashed machine id, platform, Node version) ship to PostHog by default; disable any time with `AIDE_TELEMETRY=off`. See https://aide-memory.dev/docs/configuration#telemetry for the full breakdown.

## License

Proprietary freeware: free to use today, source not public, not open source.

## Documentation

Full documentation: **https://aide-memory.dev**
