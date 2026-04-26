# aide-memory — persistent context across AI coding sessions

aide-memory is a local, path-scoped memory layer for AI coding agents.
It captures decisions, preferences, and technical knowledge via editor
hooks, stores them as human-readable JSON files, and surfaces the right
bits to the agent through a seven-tool MCP server. The same store works
across editors; git is the sync layer.

```bash
npx aide-memory init
```

Two minutes. Zero config. No Docker, no cloud, no API keys.

## Works with

| Editor | Status | Details |
|---|---|---|
| [Claude Code](./editors/claude-code.md) | ✅ shipping | Reference adapter — every feature works here |
| [Cursor](./editors/cursor.md) | 🚧 0.5.0 target | ~80% parity with Claude Code, five documented gaps |
| [Windsurf](./editors/windsurf.md) | 📝 rule template only | MCP tools work if added manually; no hooks yet |
| [Codex](./editors/codex.md) | 📝 rule template only | MCP tools work if added manually; no hooks yet |
| [Copilot](./editors/copilot.md) | 📝 rule template only | MCP tools work if added manually; no hooks yet |

See [supported-editors.md](./supported-editors.md) for the full capability
matrix.

## Where to go next

| Want to… | Read |
|---|---|
| Install and see first recall in 2 minutes | [Quick start](./quick-start.md) |
| Understand memories, layers, scopes, hooks, MCP | [Concepts](./concepts.md) |
| Configure behavior | [Configuration](./configuration.md) |
| Pick an editor / check feature parity | [Supported editors](./supported-editors.md) |
| Look up a CLI command | [CLI reference](./cli-reference.md) |
| Look up an MCP tool | [MCP tools](./mcp-tools.md) |
| See how hooks work | [Hooks](./hooks.md) |
| Fix something broken | [Troubleshooting](./troubleshooting.md) |
| See how it's built (contributors) | [Architecture](./architecture.md) |

## Quick links

- Initialize a project: `npx aide-memory init`
- Store a memory: `aide-memory remember "..." --layer technical`
- Recall context: `aide-memory recall src/`
- Search memories: `aide-memory search "authentication"`
- View stats: `aide-memory stats`
