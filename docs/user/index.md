# aide-memory: persistent context across AI coding sessions

aide-memory is a local, path-scoped memory layer for AI coding agents. It captures decisions, preferences, and technical knowledge via editor hooks, stores them as human-readable JSON files, and surfaces the right bits to the agent through a seven-tool MCP server. The same store works across editors; git is the sync layer.

```bash
npm install -g aide-memory && aide-memory init
```

Two minutes. Zero config. No Docker, no cloud, no API keys.

---

**Full documentation lives at https://aide-memory.dev/docs.** This `docs/user/` tree in the repo carries short pointers to each canonical page. If you are browsing the repo and want depth, click through to the website.

aide-memory is **proprietary freeware**: free to use today, source not public, not open source. See `LICENSE.md` for terms.

## Pages

| Topic | Where |
|---|---|
| Install and see first recall in 2 minutes | [Quick start](https://aide-memory.dev/docs/quick-start) |
| Mental model: memories, layers, scopes, hooks | [Concepts](https://aide-memory.dev/docs/concepts) |
| All capabilities | [Features](https://aide-memory.dev/docs/features) |
| Configure behavior | [Configuration](https://aide-memory.dev/docs/configuration) |
| MCP tool reference (the seven tools your agent calls) | [MCP Tools](https://aide-memory.dev/docs/mcp-tools) |
| CLI command reference | [CLI Reference](https://aide-memory.dev/docs/cli-reference) |
| Per-hook walkthrough | [Hooks](https://aide-memory.dev/docs/hooks) |
| Pick an editor / capability matrix | [Supported Editors](https://aide-memory.dev/docs/supported-editors) |
| Per-editor UX | [Claude Code](https://aide-memory.dev/docs/editors/claude-code) · [Cursor](https://aide-memory.dev/docs/editors/cursor) · [Codex](https://aide-memory.dev/docs/editors/codex) · [Copilot](https://aide-memory.dev/docs/editors/copilot) · [Windsurf](https://aide-memory.dev/docs/editors/windsurf) |
| How it's built (contributors) | [Architecture](https://aide-memory.dev/docs/architecture) |
| Fix something broken | [Troubleshooting](https://aide-memory.dev/docs/troubleshooting) |
| Compare with claude-mem and engram | [Comparison](https://aide-memory.dev/docs/comparison) |
| Common questions | [FAQ](https://aide-memory.dev/docs/faq) |

## Quick links

- Install + initialize: `npm install -g aide-memory && aide-memory init`
- Store a memory: `aide-memory remember "..." --layer technical`
- Recall context: `aide-memory recall src/`
- Search memories: `aide-memory search "authentication"`
- View stats: `aide-memory stats`
