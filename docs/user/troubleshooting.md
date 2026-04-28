# Troubleshooting

**Canonical version: https://aide-memory.dev/docs/troubleshooting**

Common issues:

- **"No .aide/ directory found"**, run `aide-memory init` from your project root
- **Hooks not firing**, check `aide-memory config hooks.read.maxBlocks` is `1`; verify `.mcp.json` / `.cursor/mcp.json`; regenerate rules with `aide-memory init --update-rules`
- **Cursor MCP tools missing**, restart Cursor (no hot-reload); enable the aide-memory server in Cursor → Settings → MCP
- **Search returns nothing**, check `aide-memory stats`; rebuild cache with `aide-memory sync import`
- **Memories not persisting**, verify JSON files exist under `.aide/memories/<layer>/`; ensure consistent project-root path
- **Sync conflicts**, resolved by `updated_at` timestamp (newer wins); to force file-version, delete `~/.aide/projects/*/memory.db` and run `aide-memory sync import`
- **Reset everything**, `rm -rf .aide/ ~/.aide/projects/ && aide-memory init`

For full causes, fixes, and case studies, see [aide-memory.dev/docs/troubleshooting](https://aide-memory.dev/docs/troubleshooting).
