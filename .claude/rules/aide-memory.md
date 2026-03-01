# aide-memory: Persistent project memory

This project has aide-memory installed — an MCP server that persists knowledge across sessions.

## Tools available
- `aide_recall` — retrieve stored context for file paths you're about to work on
- `aide_remember` — store discoveries, decisions, corrections, and preferences
- `aide_forget` — remove outdated memories
- `aide_search` — find memories by keyword
- `aide_memories` — list all stored memories

## When to call aide_recall
- Before working on an unfamiliar area of the codebase
- When starting a new task involving files you haven't read yet
- The PreToolUse hook handles this automatically for file reads

## When to call aide_remember
- When you discover a non-obvious constraint or pattern in the code
- When the user corrects your approach (store the correction)
- When a design decision is made that future sessions should know about
- Use the right layer: `preferences` (user style), `technical` (codebase facts), `area_context` (file/module notes), `guidelines` (team rules)
- Set `scope` to the relevant path (e.g., `src/memory/**`) — not everything is project-wide

## When NOT to use these tools
- Don't recall for files you've already read in this session
- Don't remember trivial or obvious things (e.g., "this file uses TypeScript")
- Don't store session-specific state that won't be useful next time
