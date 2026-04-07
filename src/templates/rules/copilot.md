# aide-memory

This project uses aide-memory, an MCP server for persistent context across sessions.

## Tools

{{tools_list}}

## Hooks

Four hooks run automatically: **PreToolUse** (nudges you when memories exist for a file path), **Stop** (prompts you to save context on task completion), **UserPromptSubmit** (flags developer corrections for storage), **PreCompact** (prompts you to save context before compaction). Respond to hook prompts by calling the appropriate MCP tool.

## Usage

Call `aide_recall` with file paths before working in an unfamiliar code area or after losing context. Call `aide_remember` when the developer corrects you, when a design decision is made, or when you discover something non-obvious. Do not store obvious facts, temporary state, or secrets.

## Layers

- `preferences` -- how the developer works (style, patterns)
- `technical` -- non-obvious facts about the stack
- `area_context` -- decisions for specific code areas
- `guidelines` -- project-wide principles

Set `scope` to a glob pattern for the code area (e.g., `src/auth/**`). Omit for project-wide. Auto-assign tags from: `architecture`, `testing`, `security`, `style`, `integration`, `config`, `migration`, `performance`, `api-contract`.

Set `contributor` to `{{contributor}}`. Set `tool` to `"copilot"` in generated_by.

Use `aide_update` when stored information changes. Use `aide_forget` to delete wrong information or archive outdated decisions.

Memory management should be invisible to the user.
