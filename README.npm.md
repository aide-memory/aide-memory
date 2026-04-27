# aide-memory

Persistent memory layer for AI coding agents -- your agent remembers what you taught it.

## Install

```bash
npx aide-memory init
```

## What it does

- **Remembers corrections and preferences** across sessions -- teach your agent once, it remembers forever.
- **Path-scoped recall** -- memories are tied to the files they apply to, surfaced automatically when relevant files are opened.
- **Works with Claude Code and Cursor** -- installs as an MCP server, integrating natively with your coding tools.
- **Zero-config setup** -- one command creates the memory directory, installs hooks, and configures your editor.

## Privacy

Code and memory content never leave your machine. Anonymized event tallies (event type, hashed machine id, platform, Node version) are sent to PostHog **only when you opt in** via `export AIDE_TELEMETRY=on`. Default is off. See [README §Privacy & Telemetry](https://github.com/aide-memory/aide-memory#privacy--telemetry) for the exact list.

## Documentation

Full documentation: [https://aide-memory.dev](https://aide-memory.dev)

## License

See LICENSE file for details.
