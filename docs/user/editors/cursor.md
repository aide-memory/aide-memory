# aide-memory in Cursor

**Canonical version: https://aide-memory.dev/docs/editors/cursor**

Cursor ships with aide-memory's full hook + MCP wiring. `aide-memory init` writes `.cursor/hooks.json`, `.cursor/mcp.json`, and a dynamically-regenerated `.cursor/rules/aide-memory.mdc` (gitignored derived artifact).

**First-time enablement (read carefully):**
1. **Restart Cursor** after `aide-memory init` (Cmd+Q, not just close window). Cursor reads `.cursor/mcp.json` on startup only; no hot-reload.
2. **Enable the aide-memory MCP server** in Cursor → Settings → MCP. Newly-discovered servers stay disabled by default.

Until both gates clear, MCP tools are unavailable.

A handful of capabilities are tracked against upstream Cursor platform work and will upgrade as Cursor ships the corresponding changes (sessionStart injection, postToolUse context, beforeSubmitPrompt context, post-compact re-injection, MCP server name in payload, idle-injection, sessionStart-after-compact). When Cursor fixes a thread, the adapter upgrades and the workaround retires.

For the full Cursor-specific UX walkthrough, per-Read coverage gap explanation, rules-file regeneration mechanics, token budget, troubleshooting, and the seven tracked Cursor threads, see [aide-memory.dev/docs/editors/cursor](https://aide-memory.dev/docs/editors/cursor).
