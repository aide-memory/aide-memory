# Hooks

Hooks are the core of AIDE Memory's capture system. Instead of relying on voluntary `aide_remember` calls (which studies show approach 0% adoption), hooks inject context at the right moments so capture happens automatically.

## Overview

Four hooks fire at different points in the agent lifecycle:

| Hook | Fires when | What it does |
|------|-----------|--------------|
| PreToolUse | Agent is about to read/edit a file | Nudges: "N memories exist for this path" |
| Stop | Agent finishes responding | Prompts: "Anything worth remembering?" |
| UserPromptSubmit | User sends a message | Detects corrections, decisions, preferences |
| PreCompact | Context is about to be compacted | Prompts: "Save key context before it is lost" |

An optional git hook handles sync:

| Hook | Fires when | What it does |
|------|-----------|--------------|
| post-checkout | Branch switch or pull | Rebuilds SQLite cache from JSON files |

## PreToolUse hook

**File:** `scripts/hooks/pre-read-recall.sh`

Fires before the agent reads a file. The hook counts memories scoped to that file path using direct SQLite access (via `scripts/hooks/recall-for-path.js`). If memories exist, it injects a nudge into the agent's context:

```
5 memories exist for src/auth/middleware.ts. Call aide_recall if relevant.
```

The hook never dumps memory content -- only the count. The agent decides whether to call `aide_recall` to fetch actual memories.

**Special case:** If the agent tries to read a raw `.aide/memories/` file directly, the hook warns:
```
memory_file_direct_read: You are reading a raw memory file. Use aide_recall for structured context.
```

**How it works:**
1. Hook receives tool input via stdin (JSON with `tool_input.file_path`)
2. Calls `recall-for-path.js` which opens the MemoryStore, counts scope-matching memories
3. If count > 0, outputs a JSON nudge via `hookSpecificOutput.additionalContext`
4. The agent sees the nudge in its context and decides whether to call `aide_recall`

## Stop hook

**File:** `scripts/hooks/stop-remember.sh`

Fires when the agent finishes its response. The hook blocks the first stop attempt and injects a reflection prompt:

```
Before finishing: Did you learn anything non-obvious during this task?
Constraints, patterns, decisions, or corrections worth persisting?
If so, call aide_remember with the appropriate layer and scope.
Use source: "hook" to tag hook-captured memories.
If nothing worth storing, you may stop.
```

On the second stop (`stop_hook_active=true`), the hook exits cleanly to avoid infinite loops. This means the agent gets exactly one reflection prompt per task completion.

**How it works:**
1. Hook reads `stop_hook_active` from stdin JSON
2. If `true` (second stop), exits with code 0 (allow stop)
3. If `false` (first stop), outputs `{"decision": "block", "reason": "..."}` which prevents the stop and shows the reflection prompt

## UserPromptSubmit hook

**File:** `scripts/hooks/detect-correction.sh`

Fires when the user sends a message. The hook scans the message for three patterns:

**Corrections** -- user is fixing agent behavior:
- Triggers on: "no, don't", "actually,", "that's wrong", "use X instead", "stop using", "I told you"
- Suggests: `aide_remember` with layer `preferences` or `technical`

**Decisions** -- user is making a choice:
- Triggers on: "let's use", "we should", "go with", "decided to", "from now on"
- Suggests: `aide_remember` with layer `area_context` or `technical`

**Preferences** -- user is expressing style:
- Triggers on: "I prefer", "always use", "never use", "my style is", "don't ever"
- Suggests: `aide_remember` with layer `preferences`

Only the first matching pattern fires. The hook does not store anything itself -- it injects context telling the agent what it detected and suggests the appropriate `aide_remember` call.

**How it works:**
1. Hook reads `prompt` from stdin JSON
2. Runs regex patterns against the message text
3. If a pattern matches, outputs a `hookSpecificOutput.additionalContext` message
4. The agent sees the suggestion and calls `aide_remember` as appropriate

## PreCompact hook

**File:** `scripts/hooks/pre-compact-save.sh`

Fires before both manual `/compact` and auto-compact. This is a high-value hook -- context loss from compaction is a common pain point. The hook prompts the agent to save anything important:

```
Context is about to be compacted. Extract any key decisions, plans, or
constraints worth persisting via aide_remember before they are lost.
Use source: "hook" to tag these as hook-captured.
```

The hook never blocks compaction -- it only provides the prompt. The agent decides what (if anything) to save.

## post-checkout hook

**File:** `scripts/hooks/post-checkout.sh`
**Installed to:** `.git/hooks/post-checkout`

Fires after `git checkout` or `git pull` (branch checkout only, not file checkout). Runs `MemorySync.syncFromGit()` to rebuild the SQLite cache from JSON memory files. This keeps the cache in sync when switching branches or pulling changes from teammates.

**Performance:** Targets under 500ms for 100 files. Runs in the background with a 2-second timeout. Never blocks git operations (always exits 0).

**How it works:**
1. Checks flag `$3` -- only runs on branch checkout (flag=1), not file checkout (flag=0)
2. Counts JSON files under `.aide/memories/`
3. Runs `sync-runner.js` in the background with a timeout
4. Exits 0 regardless of success or failure

## Disabling individual hooks

Each hook can be disabled independently via config:

```bash
# Disable the stop hook (no reflection prompt)
aide-memory config capture.hooks.stop false

# Disable correction detection
aide-memory config capture.hooks.userPromptSubmit false

# Disable the file-read nudge
aide-memory config capture.hooks.preToolUse false

# Disable pre-compact save prompt
aide-memory config capture.hooks.preCompact false

# Disable all hooks at once
aide-memory config capture.enabled false
```

## Claude Code vs Cursor differences

Both editors receive the same hook content, but the delivery mechanism differs:

**Claude Code:**
- Hooks use `hookSpecificOutput.additionalContext` to inject context
- The nudge appears in the agent's hidden context (not visible in the terminal by default)
- Stop hook uses `{"decision": "block"}` to prevent the first stop

**Cursor:**
- Hooks use `agent_message` for responses rather than `additionalContext`
- The nudge content appears directly in the agent message flow
- Rules file uses `.mdc` format with YAML frontmatter (`alwaysApply: true`)

Both get the same rules file content (generated from templates during `aide-memory init`). The rules file teaches the agent when to call each MCP tool and how to format memories.

## Rules files

The init command generates two rules files from templates:

| File | Editor | Purpose |
|------|--------|---------|
| `.claude/rules/aide-memory.md` | Claude Code | Teaches Claude when to recall/remember |
| `.cursor/rules/aide-memory.mdc` | Cursor | Same content, Cursor's `.mdc` format |

Rules files are safe to regenerate:

```bash
aide-memory init --update-rules
```

This always overwrites the rules files with the latest templates (idempotent).
