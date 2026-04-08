# AIDE Memory Documentation

Persistent context for AI coding agents. Your agent remembers decisions, preferences, and technical knowledge across sessions.

## Guides

| Document | Description |
|----------|-------------|
| [Quick Start](./quick-start.md) | Install to first recall in 2 minutes |
| [CLI Reference](./cli-reference.md) | Every command with flags, examples, and output |
| [MCP Tools](./mcp-tools.md) | Every MCP tool with parameters and responses |
| [Configuration](./configuration.md) | All config keys, defaults, and examples |
| [Hooks](./hooks.md) | How hooks work and how to customize them |
| [Troubleshooting](./troubleshooting.md) | Common issues and solutions |
| [Architecture](./architecture.md) | How it works internally (for contributors) |

## Quick links

- Initialize a project: `npx aide-memory init`
- Store a memory: `aide remember "..." --layer technical`
- Recall context: `aide recall src/`
- Search memories: `aide search "authentication"`
- View stats: `aide stats`
