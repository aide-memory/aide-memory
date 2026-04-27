# aide-memory: Persistent context across sessions

This project uses aide-memory, an MCP server that persists knowledge across conversations. Memory management is invisible to the user -- do not mention aide-memory in responses unless the user asks about it.

## MCP tools

{{tools_list}}

## Hooks

Six hooks fire automatically. Respond to them as described:

- **SessionStart** -- When a session begins or resumes, the hook may inject preferences + guidelines + priority-always memories as additional context. Read them and let them shape your work.
- **PreToolUse** -- Before you read/edit/grep a file, the hook may inject: "N memories exist for this path." When you see this nudge, call `aide_recall` with those paths before proceeding.
- **PostToolUse** -- After you call `aide_recall` / `aide_remember` / `aide_search`, the hook records the recalled IDs so subsequent reads of the same path don't re-block. No agent action required.
- **UserPromptSubmit** -- Detects correction patterns ("no, use X instead", "don't do that"). When flagged, store the correction with `aide_remember` (or `aide_update` if an existing memory needs revision) scoped to the relevant code area.
- **Stop** -- On task completion, the hook prompts: "Anything worth remembering?" Review what happened in the session. If a decision was made, a correction was given, or you discovered something non-obvious, call `aide_remember` (or `aide_update` if an existing memory needs revision). Otherwise, do nothing.
- **PreCompact** -- Before context compaction, the hook prompts you to save important context. Store any active plans, decisions, or constraints via `aide_remember` (or `aide_update` if an existing memory needs revision) immediately -- after compaction you will only have a summary.
{{editor_notes}}
## Proactive saving

As conversations grow long, proactively call `aide_remember` (or `aide_update` if an existing memory needs revision) for key decisions, constraints, and corrections -- don't wait for the Stop hook or compaction. If you've made important decisions or received corrections that haven't been stored yet, save them now. Context can be compacted at any time and detail will be lost.

## When to call aide_recall

- Before starting work in a code area you have not read yet this session
- Before proposing a plan or making changes to unfamiliar code
- After context compaction (you may have lost earlier memories)
- When starting a new task involving different files
- When a PreToolUse nudge tells you memories exist
- Even when a file's content is already visible to you (open in your editor, attached, in a prior message), call aide_recall for that path — UNLESS you've already recalled memories for that path in this session. File content alone does not include stored conventions, constraints, or decisions for that path.

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

Fall back to code-level search tools (Grep, Glob, Bash+grep, rg, codebase_search) ONLY after aide_search:
- For pure syntactic lookups (exact function name, specific string literal) — keyword Grep is fine
- For semantic / fuzzy intent matches across the codebase (Cursor's `codebase_search`, IDE-native semantic indices) — fine when you've already checked aide_search and want to widen the net
- When aide_search returns nothing relevant for a concept-level query
- When the user explicitly asks for a code search, not a knowledge search

Default order for concept queries: `aide_search` → keyword Grep → semantic `codebase_search`. Use judgment; this isn't a rigid pipeline.

**Hook coverage caveat:** the aide-memory pre-search hook fires on the editor's `Grep` matcher only. `codebase_search` is NOT hook-covered. So on a `codebase_search` you won't get a pre-tool nudge — calling `aide_search` first is on you. The agent should still consider `aide_search` first for concept-level queries regardless of which downstream search tool is being used.

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

Set `contributor` to `{{contributor}}` (from git config). This is required for the `preferences` layer.

### generated_by

Set `tool` to `"{{tool_id}}"`. Set `author_type` to `"ai"` when you decide to store a memory, `"human"` when the user explicitly asks you to remember something.
