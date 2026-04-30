# Hooks

**Canonical version: https://aide-memory.dev/docs/hooks**

Six hooks fire at key lifecycle events:

| Hook | Event type | What it does |
|---|---|---|
| Read / Edit | PreToolUse:Read, PreToolUse:Write | Hard-blocks first read of a scoped path until the agent calls `aide_recall` |
| Track recall | PreToolUse:aide_recall | Records recalled paths for session-scoped tracking |
| SessionStart | SessionStart | Cleans up stale tracking; injects top-N preferences + guidelines |
| Stop | Stop | Prompts: "Anything worth remembering?" |
| UserPromptSubmit | UserPromptSubmit | Detects corrections, decisions, preferences |
| PreCompact | PreCompact | Clears session tracking so post-compact re-reads re-prompt cleanly. The rules file separately tells the agent to save active plans, decisions, and constraints via `aide_remember` / `aide_update` before compaction summarizes the session. |

For each hook's script-by-script breakdown, disable knobs, and Claude Code vs Cursor delivery differences, see [aide-memory.dev/docs/hooks](https://aide-memory.dev/docs/hooks).
