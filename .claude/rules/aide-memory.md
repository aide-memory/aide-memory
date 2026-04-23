# aide-memory: Persistent context across sessions

This project uses aide-memory, an MCP server that persists knowledge across conversations. Memory management is invisible to the user -- do not mention aide-memory in responses unless the user asks about it.

## MCP tools

- `aide_recall` — retrieve stored context for file paths you're about to work on
- `aide_remember` — store discoveries, decisions, corrections, and preferences
- `aide_update` — update an existing memory when information changes
- `aide_forget` — remove outdated memories
- `aide_search` — find memories by keyword
- `aide_import` — seed knowledge from existing markdown docs
- `aide_memories` — list all stored memories

## Hooks

Four hooks fire automatically. Respond to them as described:

- **PreToolUse** -- Before you read/edit a file, the hook may inject: "N memories exist for this path." When you see this nudge, call `aide_recall` with those paths before proceeding.
- **Stop** -- On task completion, the hook prompts: "Anything worth remembering?" Review what happened in the session. If a decision was made, a correction was given, or you discovered something non-obvious, call `aide_remember` (or `aide_update` if an existing memory needs revision). Otherwise, do nothing.
- **UserPromptSubmit** -- Detects correction patterns ("no, use X instead", "don't do that"). When flagged, store the correction with `aide_remember` (or `aide_update` if an existing memory needs revision) scoped to the relevant code area.
- **PreCompact** -- Before context compaction, the hook prompts you to save important context. Store any active plans, decisions, or constraints via `aide_remember` (or `aide_update` if an existing memory needs revision) immediately -- after compaction you will only have a summary.

## Proactive saving

As conversations grow long, proactively call `aide_remember` (or `aide_update` if an existing memory needs revision) for key decisions, constraints, and corrections -- don't wait for the Stop hook or compaction. If you've made important decisions or received corrections that haven't been stored yet, save them now. Context can be compacted at any time and detail will be lost.

## When to call aide_recall

- Before starting work in a code area you have not read yet this session
- Before proposing a plan or making changes to unfamiliar code
- After context compaction (you may have lost earlier memories)
- When starting a new task involving different files
- When a PreToolUse nudge tells you memories exist

## When to call aide_remember

- The developer corrects your approach or rejects a suggestion
- A design decision is made during planning or discussion
- You discover a non-obvious constraint, pattern, or dependency
- On task completion when the Stop hook prompts you (only if warranted)
- When the user explicitly asks you to remember something

**Do NOT store:** obvious facts readable from the code, temporary/session-specific state, secrets or credentials, trivial observations (e.g., "this file uses TypeScript").

## When to call aide_search

**Prefer `aide_search` as your FIRST step for any codebase search that's about a concept, convention, decision, or pattern** — not just a specific string. Stored memories often already have the answer, and surfacing them first avoids grep/find dumps that miss the stored context.

Examples:
- "Where do we handle auth tokens?" → `aide_search({keyword: "token"})` BEFORE Grep/Glob/Bash
- "What's the API response convention?" → `aide_search({keyword: "api response"})` FIRST
- "How do we validate inputs?" → aide_search first
- Any search driven by a human concept (auth, errors, migrations, config, styling, etc.)

Fall back to code-level search tools (Grep, Glob, Bash+grep, rg) ONLY after aide_search:
- For pure syntactic lookups (exact function name, specific string literal)
- When aide_search returns nothing relevant for a concept-level query
- When the user explicitly asks for a code search, not a knowledge search

This matters whether the agent has the native Grep tool loaded or falls back to Bash+grep — `aide_search` should run first regardless.

## When to call aide_update

- A stored memory's content has changed (e.g., a convention evolved)
- The scope needs adjusting (code was moved or renamed)
- Tags need correction

## When to call aide_forget

- Information is factually wrong
- A decision was reversed or is no longer relevant
- Duplicate memories exist -- delete the redundant one

Note: aide_forget permanently deletes the memory. There is no archive mode.

## Formatting memories

### Layer selection

| Layer | Use when | Example |
|-------|----------|---------|
| `preferences` | How the developer likes to work | "Prefers composition over inheritance" |
| `technical` | Facts about the stack not obvious from code | "WAL mode required for concurrent SQLite access" |
| `area_context` | Decisions and context for specific code areas | "Dashboard uses skeleton loading, not spinners" |
| `guidelines` | Team-wide or project-wide principles | "All API responses use camelCase keys" |

### Scope

Set `scope` to a glob pattern matching the relevant code area:
- `src/components/**` -- for component-related knowledge
- `src/auth/**` -- for auth module decisions
- Omit scope entirely for project-wide knowledge

### Tags

Auto-assign from presets: `architecture`, `testing`, `security`, `style`, `integration`, `config`, `migration`, `performance`, `api-contract`. Choose the most relevant one or two.

### Contributor

Set `contributor` to `` (from git config). This is required for the `preferences` layer.

### generated_by

Set `tool` to `"claude-code"`. Set `author_type` to `"ai"` when you decide to store a memory, `"human"` when the user explicitly asks you to remember something.
