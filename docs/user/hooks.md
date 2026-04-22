# Hooks

Hooks are the core of AIDE Memory's capture system. Instead of relying on voluntary `aide_remember` calls (which studies show approach 0% adoption), hooks inject context at the right moments so capture happens automatically.

## Overview

Six hook scripts fire at different points in the agent lifecycle, across four event types:

| Hook | Event type | Fires when | What it does |
|------|-----------|-----------|--------------|
| Read | PreToolUse:Read | Agent is about to read a file | Shows layer counts + topics, blocks until recalled |
| Track recall | PreToolUse:aide_recall | Agent calls aide_recall | Records recalled paths for session-scoped tracking |
| SessionStart | SessionStart | Session starts or resumes | Cleans up stale tracking files from other sessions |
| UserPromptSubmit | UserPromptSubmit | User sends a message | Detects corrections, decisions, preferences (soft nudge) |
| Stop | Stop | Agent finishes responding | Blocks: "Anything worth remembering?" |
| PreCompact | PreCompact | Context is about to be compacted | Blocks + clears session tracking before context loss |

An optional git hook handles sync:

| Hook | Fires when | What it does |
|------|-----------|--------------|
| post-checkout | Branch switch or pull | Rebuilds SQLite cache from JSON files |

## Read hook (PreToolUse:Read)

**File:** `scripts/hooks/pre-read-recall.sh`

Fires before the agent reads a file. The hook counts memories scoped to that file path using direct SQLite access (via `scripts/hooks/recall-for-path.js`) and shows a breakdown by layer and topic:

```
19 memories for src/auth/middleware.ts (5 technical, 8 area_context, 4 preferences, 2 guidelines) — topics: JWT, middleware, validation. Call aide_recall if results not already in this conversation.
```

The hook never dumps memory content -- only counts, layers, and topic keywords. The agent decides whether to call `aide_recall` to fetch actual memories.

**Session-scoped blocking:** On the first read of a path in a session, the hook **blocks** until the agent calls `aide_recall`. After recall, subsequent reads of the same path get a soft nudge only. Tracking uses a session-scoped file (`.aide/cache/recalled-paths-{session_id}.txt`) written by the track-recall hook. Directory prefix matching applies -- recalling `src/auth/` covers `src/auth/middleware.ts`.

**Special case:** If the agent tries to read a raw `.aide/memories/` file directly, the hook warns:
```
memory_file_direct_read: You are reading a raw memory file. Use aide_recall for structured context.
```

**How it works:**
1. Hook receives tool input via stdin (JSON with `tool_input.file_path` and `session_id`)
2. Calls `recall-for-path.js` which opens the MemoryStore, counts scope-matching memories with layer breakdown and topic extraction
3. Checks the session-scoped recalled-paths file for this path
4. If not yet recalled: outputs `{"decision": "block", "reason": "..."}` to force recall
5. If already recalled: outputs a soft nudge via `hookSpecificOutput.additionalContext`

## Track recall hook (PreToolUse:aide_recall)

**File:** `scripts/hooks/track-recall.sh`

Fires before the agent calls `aide_recall`. The hook writes the recalled paths to a session-scoped tracking file so the Read hook knows not to block again for those paths.

**How it works:**
1. Hook receives tool input via stdin (JSON with `tool_input.paths` and `session_id`)
2. Writes each path to `.aide/cache/recalled-paths-{session_id}.txt`
3. Paths are resolved to absolute paths for consistent matching
4. Exits cleanly (never blocks)

## SessionStart hook

**File:** `scripts/hooks/session-start-clear.sh`

Fires when Claude Code starts, resumes, or clears a session. The hook cleans up stale recalled-paths tracking files from other sessions while preserving the current session's file.

**How it works:**
1. Hook reads `session_id` from stdin JSON
2. Iterates over `.aide/cache/recalled-paths-*.txt` files
3. Removes all tracking files except the current session's
4. Exits cleanly (never blocks)

## Stop hook

**File:** `scripts/hooks/stop-remember.sh`

Fires when the agent finishes its response. The hook blocks the first stop attempt and injects a reflection prompt:

```
Before finishing: anything non-obvious worth persisting (constraints, decisions,
corrections)? Call aide_remember (layer, scope, source:hook). If nothing to store, stop.
```

On the second stop (`stop_hook_active=true`), the hook exits cleanly to avoid infinite loops. This means the agent gets exactly one reflection prompt per task completion.

**How it works:**
1. Hook reads `stop_hook_active` from stdin JSON
2. If `true` (second stop), exits with code 0 (allow stop)
3. If `false` (first stop), outputs `{"decision": "block", "reason": "..."}` which prevents the stop and shows the reflection prompt

## UserPromptSubmit hook

**File:** `scripts/hooks/detect-correction.sh`

Fires when the user sends a message. The hook scans the message for three patterns and injects a **soft nudge** (never blocking -- blocking on UserPromptSubmit would reject the user's message entirely):

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
3. If a pattern matches, outputs a `hookSpecificOutput.additionalContext` message (soft nudge)
4. The agent sees the suggestion and calls `aide_remember` as appropriate

## PreCompact hook

**File:** `scripts/hooks/pre-compact-save.sh`

Fires before both manual `/compact` and auto-compact. This is a high-value hook -- context loss from compaction is a common pain point. The hook **blocks** compaction and prompts the agent to save anything important:

```
Context compacting. Save key decisions/constraints via aide_remember (source: hook)
before they are lost. If nothing to store, stop.
```

The hook also **clears the current session's recalled-paths file**. After compaction, the agent's context no longer contains previous tool results, so paths must be re-recalled on next read.

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

## Session-scoped tracking

All recall tracking is session-scoped via `session_id` (available in hook stdin JSON). Each session gets its own tracking file at `.aide/cache/recalled-paths-{session_id}.txt`. This means:

- Different sessions (e.g., multiple terminal tabs) track independently
- SessionStart cleans up stale tracking files from ended sessions
- PreCompact clears the current session's file (context loss means paths must be re-recalled)

## Disabling individual hooks

Each hook can be disabled independently via config. (The old `capture.*` family was removed in 0.4.3 in favor of the more specific `hooks.*` controls.)

```bash
# Disable the stop-hook reflection prompt (effectively)
aide-memory config hooks.stop.schedule '[{"every":100}]'

# Disable correction detection
aide-memory config hooks.correction.enabled false

# Disable the file-read nudge and blocking
aide-memory config hooks.read.maxBlocks 0

# Disable file-edit nudge and blocking
aide-memory config hooks.edit.maxBlocks 0

# Disable pre-compact cleanup (preserve tracking across /compact)
aide-memory config hooks.precompact.mode off

# Silence the pre-search nudge
aide-memory config hooks.search.mode off
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
