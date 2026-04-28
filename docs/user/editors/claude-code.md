# aide-memory in Claude Code

**Canonical version: https://aide-memory.dev/docs/editors/claude-code**

Claude Code is aide-memory's reference adapter. Every feature in the [capability matrix](https://aide-memory.dev/docs/supported-editors) works as designed.

`aide-memory init` creates `.claude/settings.json` (six-event hook registration), `.mcp.json`, `.claude/rules/aide-memory.md`, `.aide/config.json`, and `.aide/memories/`.

Branded `aide-memory · ...` chrome renders inline via `systemMessage`. Hard-block on first read uses `decision: "block"` + `reason`; soft nudges use `hookSpecificOutput.additionalContext`. SessionStart re-fires after compaction.

For setup, runtime UX, troubleshooting, and platform capability dependencies, see [aide-memory.dev/docs/editors/claude-code](https://aide-memory.dev/docs/editors/claude-code).
