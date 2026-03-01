# Hooks Implementation — aide-memory Adoption Layer

> Created Mar 1, 2026. This doc covers the hooks phase: why, what, how, testing.
> Previous phase: `docs/IMPLEMENTATION_PROGRESS.md` (MVP + Round 2 E2E)

---

## Why Hooks? (And Why Not Sooner?)

### Why we should have considered hooks earlier

The agent adoption problem was identified in Round 1 (0/6 proactive calls). Our response was rules (`.claude/rules/aide-memory.md`), which partially worked for aide_recall (75%) but completely failed for aide_remember (0%). Hooks were mentioned in the IMPLEMENTATION_PROGRESS doc as a "Tier 2 fix" but we deprioritized them in favor of running a Round 2 intra-session comparison test.

**In hindsight, this was a sequencing mistake.** The Round 2 intra-session comparison proved code quality is equivalent with or without aide_recall — a real finding, but one that doesn't test aide-memory's actual value prop (cross-session persistence). We could have:
1. Implemented hooks immediately after Round 1 (fix aide_remember)
2. Jumped straight to cross-session tests (prove the value prop)

Instead we spent time proving something we could have predicted: agents that can read code directly don't need aide_recall for intra-session work. The Round 2 results are still useful (confirmed rules fix recall adoption, confirmed equivalent quality) but the hooks should have come first.

### What Round 2 proved

Round 2 E2E testing (Run A bare vs Run B with AIDE+rules, **separate sessions, same prompts**) proved:

| Finding | Data |
|---------|------|
| Rules fix aide_recall adoption | 0% → 75% (3/4 proactive calls) |
| aide_recall doesn't improve intra-session code quality | Both runs produced equivalent code |
| aide_remember is completely broken | 0% across 10 test prompts (Round 1 + Round 2) |
| Cross-session value is untested | Can't test until aide_remember works |

**The problem:** aide_remember never fires. The agent treats "store knowledge" as lower priority than "finish the coding task." Rules say to call aide_remember but the agent ignores it — completing the task takes precedence.

**The solution:** Claude Code hooks — automatic triggers at moments where remembering makes sense. Instead of asking the agent to remember, we inject context at the right moment so remembering becomes the natural next action.

**Secondary benefit:** Hooks can also make aide_recall 100% automatic (vs 75% with rules), eliminating the PlanMode bypass problem.

---

## What Are Claude Code Hooks?

Claude Code hooks are event handlers configured in `.claude/settings.json`. They fire shell commands on specific events and can inject context back into the agent's conversation.

**Key mechanics:**
- **Input:** Hook receives JSON on stdin with event details (tool name, input, session ID, cwd)
- **Output:** Hook stdout is injected as context into the conversation
- **Blocking:** Exit code 2 blocks the action; stderr becomes the error message
- **Modification:** `PreToolUse` hooks can modify tool inputs via `modifiedInput` in JSON output

**19 event types available.** The ones relevant to aide-memory:

| Event | When | Can Block? | Our Use |
|-------|------|------------|---------|
| `PreToolUse` | Before tool executes | Yes | Auto-inject aide_recall before Read/Edit |
| `PostToolUse` | After tool succeeds | No | Nudge aide_remember after Edit |
| `Stop` | Agent finishes responding | Yes | End-of-task reflection for aide_remember |
| `UserPromptSubmit` | User sends message | Yes | Detect corrections, auto-store |
| `SubagentStop` | Subagent finishes | No | Capture subagent discoveries |

---

## How It Integrates

### Claude Code (Full Hook Support)

Claude Code has native hook support. Configuration lives in:
- `~/.claude/settings.json` — user-wide
- `.claude/settings.json` — project-level (shareable via git)
- `.claude/settings.local.json` — project-level (not shared)

We'll use **project-level** (`.claude/settings.json`) so hooks travel with the repo.

### Cursor (Also Has Hook Support)

Cursor has hooks too — similar event model to Claude Code. Config lives in `.cursor/hooks.json` (project-level) or `~/.cursor/hooks.json` (user-level).

**Cursor hook events relevant to aide-memory:**

| Cursor Event | Claude Code Equivalent | Our Use |
|-------------|----------------------|---------|
| `preToolUse` | `PreToolUse` | Auto-inject aide_recall before Read/Edit |
| `postToolUse` | `PostToolUse` | Nudge aide_remember after Edit |
| `stop` | `Stop` | End-of-task reflection for aide_remember |
| `beforeSubmitPrompt` | `UserPromptSubmit` | Detect corrections, auto-store |
| `beforeReadFile` | (no direct equiv) | Inject context before any file read |
| `afterFileEdit` | (no direct equiv) | Post-edit nudge |
| `sessionStart` | `SessionStart` | Inject `additional_context` at start |
| `beforeMCPExecution` | `PreToolUse` (matcher) | Observe/modify MCP calls |

**Cursor hook config format (`.cursor/hooks.json`):**
```json
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "command": "bash scripts/hooks/stop-remember.sh",
        "type": "command",
        "timeout": 30
      }
    ],
    "beforeSubmitPrompt": [
      {
        "command": "bash scripts/hooks/detect-correction.sh",
        "type": "command"
      }
    ],
    "beforeReadFile": [
      {
        "command": "node scripts/hooks/recall-for-path.js",
        "type": "command"
      }
    ]
  }
}
```

**Key differences from Claude Code:**
- Config file: `.cursor/hooks.json` (not `.claude/settings.json`)
- Cursor has `beforeReadFile` (fires on file reads specifically, separate from tool use)
- Cursor has `afterFileEdit` (fires after edits specifically)
- Cursor's `stop` hook can return `followup_message` to auto-submit a next prompt — could auto-trigger aide_remember call
- Cursor has `beforeMCPExecution` — fires before any MCP tool call, useful for logging/analytics
- Cursor hooks support `"type": "prompt"` — LLM-evaluated conditions (e.g., "was this a design decision?")

**Strategy:** Write hooks as tool-agnostic shell/node scripts in `scripts/hooks/`. Create separate config files for each tool:
- `.claude/settings.json` — Claude Code hooks config
- `.cursor/hooks.json` — Cursor hooks config

Both point to the same scripts. One implementation, two configs.

### Other Tools (VS Code + Continue, Windsurf, etc.)

Tools without hooks rely on MCP tools only. The MCP tools should be self-sufficient — hooks are an enhancement layer that boosts adoption from ~75% to ~100%. Without hooks, the tool descriptions and any rules files (`.cursorrules`, `.claude/rules/`) carry the load.

---

## Implementation Plan

### Phase 1: aide_remember Hook (Stop event)

**Goal:** Get aide_remember adoption above 0%.

**Hook:** When the agent finishes responding (Stop event), inject a reflection prompt.

**File:** `scripts/hooks/stop-remember.sh`

```bash
#!/bin/bash
# Stop hook — nudge agent to call aide_remember after completing a task
INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# Prevent infinite loop — if this is already a stop-hook turn, exit
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# Only nudge on substantive responses (not simple Q&A)
# Check if any Edit/Write tools were used in this turn
echo '{
  "decision": "block",
  "reason": "Before finishing: Did you discover any non-obvious constraints, make design decisions, or learn something about this codebase during this task? If so, call aide_remember to persist it for future sessions. If nothing worth storing, proceed."
}'
```

**Config (`.claude/settings.json`):**
```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash scripts/hooks/stop-remember.sh"
          }
        ]
      }
    ]
  }
}
```

**Risk:** Too aggressive — fires on every response, even trivial ones. May need filtering (only fire when Edit/Write was used in the turn).

### Phase 2: Correction Detection Hook (UserPromptSubmit)

**Goal:** Auto-detect when user corrects the agent and nudge storing the correction.

**File:** `scripts/hooks/detect-correction.sh`

```bash
#!/bin/bash
# UserPromptSubmit hook — detect correction patterns in user messages
INPUT=$(cat)
USER_MESSAGE=$(echo "$INPUT" | jq -r '.user_message // empty')

# Pattern match for corrections
if echo "$USER_MESSAGE" | grep -qiE "(no,? (don.t|use|instead)|actually|wrong|not like that|prefer|always use|never use|stop using)"; then
  echo "{\"additionalContext\": \"The user just corrected you. After addressing their feedback, call aide_remember to store this correction so it persists across sessions. Use layer 'preferences' if it's a style preference, or 'technical' if it's a factual correction.\"}"
fi

exit 0
```

### Phase 3: Auto aide_recall Hook (PreToolUse on Read)

**Goal:** 100% aide_recall adoption, zero rules dependency, PlanMode bypass eliminated.

**File:** `scripts/hooks/pre-read-recall.sh`

```bash
#!/bin/bash
# PreToolUse hook — auto-inject aide_recall context before file reads
INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name')
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Call aide_recall via the MCP server and inject results
# Implementation: either shell out to the MCP server or use a lightweight Node script
RECALL_OUTPUT=$(node scripts/hooks/recall-for-path.js "$FILE_PATH" 2>/dev/null)

if [ -n "$RECALL_OUTPUT" ] && [ "$RECALL_OUTPUT" != "null" ]; then
  echo "{\"hookSpecificOutput\": {\"hookEventName\": \"PreToolUse\", \"additionalContext\": \"aide-memory context for this file area:\\n${RECALL_OUTPUT}\"}}"
fi

exit 0
```

**Note:** This hook needs to call the aide-memory store directly (not via MCP — can't call MCP from a hook). Will use a lightweight Node script that imports MemoryStore directly.

**File:** `scripts/hooks/recall-for-path.js`

```javascript
// Direct store access — no MCP, just SQLite
const { MemoryStore } = require('../../dist/memory/store');
const { recall } = require('../../dist/memory/recall');

const filePath = process.argv[2];
if (!filePath) process.exit(0);

const store = new MemoryStore(process.cwd());
const result = recall(store, { paths: [filePath], limit: 10 });
store.close();

if (result.memories.length > 0) {
  const lines = result.memories.map(m => `- [${m.layer}] ${m.what}`);
  process.stdout.write(lines.join('\n'));
}
```

### Phase 4: PostToolUse Nudge (Optional)

**Goal:** Lighter nudge after file edits — only fire if Phase 1 isn't enough.

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'You just modified code. If you discovered a non-obvious constraint or made a decision worth persisting, consider calling aide_remember.'"
          }
        ]
      }
    ]
  }
}
```

**Risk:** Very noisy — fires on every edit. Should be tried only if Stop hook alone doesn't work.

---

## Implementation Order

| Step | What | Depends On | Effort |
|------|------|-----------|--------|
| 1 | Create `scripts/hooks/` directory structure | — | 5 min |
| 2 | Implement Stop hook (`stop-remember.sh`) | — | 30 min |
| 3 | Add `.claude/settings.json` with Stop hook config | Step 2 | 5 min |
| 4 | Add `.cursor/hooks.json` with stop hook config | Step 2 | 5 min |
| 5 | **Test: Run 1 prompt in Claude Code, verify aide_remember fires** | Steps 2-3 | 15 min |
| 6 | Implement correction detection hook (`detect-correction.sh`) | — | 30 min |
| 7 | Add UserPromptSubmit / beforeSubmitPrompt hooks to configs | Step 6 | 5 min |
| 8 | **Test: Send correction, verify detection + storage** | Steps 6-7 | 15 min |
| 9 | Build `recall-for-path.js` (direct store access, no MCP) | `npm run build` | 45 min |
| 10 | Implement PreToolUse / beforeReadFile hooks | Step 9 | 30 min |
| 11 | **Test: Verify auto-recall injection before Read** | Steps 9-10 | 15 min |
| 12 | Full E2E test — Claude Code (see below) | Steps 1-11 | 1-2 hrs |
| 13 | Full E2E test — Cursor (same prompts, `.cursor/hooks.json`) | Steps 1-11 | 1-2 hrs |

**Scripts are tool-agnostic.** Same shell/node scripts in `scripts/hooks/`, just different config files:
- Claude Code: `.claude/settings.json` (hooks nested under `"hooks"` key)
- Cursor: `.cursor/hooks.json` (dedicated hooks file, `"version": 1` format)

---

## E2E Testing Plan

### Test Design Principles (Lessons from Round 2)

1. **Separate sessions per comparison** — Run A and Run B MUST be different sessions (verified in Round 2).
2. **Cross-session tests are essential** — intra-session tests can't prove aide_memory's value because agents accumulate context from file reads within a session.
3. **Measure adoption rates AND quality** — adoption without quality improvement isn't enough.
4. **Record everything** — fill tables as we go, paste session IDs, extract from JSONL.

### Branch Strategy

```
feature/agent-memory          ← current, has MVP + Run A code
  └── feature/hooks           ← NEW branch for hooks implementation
       └── hooks-test-run-a   ← bare test results (after hooks tests)
       └── hooks-test-run-b   ← AIDE+hooks test results
```

**Before testing:**
```bash
# Create hooks branch off feature/agent-memory
git checkout feature/agent-memory
git checkout -b feature/hooks

# Implement hooks (steps 1-10 above)
# Commit implementation

# For Run B (AIDE + hooks): hooks are active
# For Run A (bare): disable hooks + MCP
```

### Test Suite 1: aide_remember Adoption (Single Session)

**Purpose:** Does the Stop hook make aide_remember fire?

**Setup — Run B (AIDE + hooks):**
- `.mcp.json` active (aide-memory MCP server)
- `.claude/settings.json` with Stop hook + UserPromptSubmit hook
- `.claude/rules/aide-memory.md` active
- Fresh session: `claude`

**Setup — Run A (bare baseline):**
- `mv .mcp.json .mcp.json.bak`
- `mv .claude/rules/aide-memory.md .claude/rules/aide-memory.md.bak`
- Remove hooks from `.claude/settings.json` (or back up the file)
- Fresh session: `claude`

**Prompts (same for both runs):**

**Prompt H-1: Simple task with discoverable constraint**
```
Add a method `archiveOld(days: number)` to MemoryStore in src/memory/store.ts — like pruneOld but sets status to 'archived' instead of deleting. Write a vitest test.
```

Measure:
| Dimension | Run A (Bare) | Run B (AIDE+Hooks) |
|-----------|-------------|-------------------|
| aide_recall called? | n/a | Y/N (auto via hook or proactive) |
| aide_remember called? | n/a | Y/N — **this is the key metric** |
| What was remembered? | n/a | (paste content) |
| Used sync API? | Y/N | Y/N |
| Test uses vitest? | Y/N | Y/N |
| Corrections needed | count | count |

**Prompt H-2: Task with user correction mid-stream**
```
Add a method `duplicateCheck()` to MemoryStore that finds memories with very similar `what` text. Use string comparison.
```

After agent writes first version, **correct it:** "No, don't use exact string match — use Levenshtein distance or SQL LIKE with fuzzy matching."

Measure:
| Dimension | Run A (Bare) | Run B (AIDE+Hooks) |
|-----------|-------------|-------------------|
| Correction detected by hook? | n/a | Y/N |
| aide_remember called after correction? | n/a | Y/N |
| What was stored? | n/a | (paste content) |
| Agent adapted to correction? | Y/N | Y/N |

### Test Suite 2: Cross-Session Persistence (Two Sessions)

**Purpose:** Does knowledge stored in session 1 survive to session 2?

**This is the test that proves aide_memory's value.** It requires aide_remember to work (hence hooks first).

**Session 1 — Teaching session:**

Setup: AIDE + hooks active. Fresh session.

```
I'm working on src/memory/store.ts. Some things to know:
- Never use `new Date()` for SQLite date comparison — use `datetime('now', '-N days')` in SQL
- Always add an index on columns used in WHERE clauses for new tables
- Status transitions go: active → completed → archived (never skip)

Now add an `expireCompleted(days: number)` method that moves completed memories older than N days to archived status.
```

Then correct: "Also, always log the count of affected rows when doing bulk operations."

After session 1, verify storage:
```bash
sqlite3 ~/.aide/projects/*/memory.db "SELECT id, layer, substr(what,1,80) FROM memories WHERE source='conversation' ORDER BY id DESC LIMIT 10"
```

**Session 2 — Recall session (NEW session, same project):**

Close session 1. Start fresh: `claude`

```
Add a method `purgeArchived(days: number)` to MemoryStore that permanently deletes archived memories older than N days. Write a vitest test.
```

Measure:
| Dimension | With AIDE+Hooks | Without AIDE (bare) |
|-----------|----------------|-------------------|
| Used `datetime()` SQL pattern? | Y/N | Y/N |
| Logged affected row count? | Y/N | Y/N |
| Used vitest? | Y/N | Y/N |
| Corrections needed | count | count |
| aide_recall returned session 1 knowledge? | Y/N | n/a |
| Token usage | — | — |

**This is the money test.** If the AIDE agent uses `datetime()` and logs row counts (both taught in session 1) while the bare agent doesn't — aide_memory has proven its value.

### Test Suite 3: Auto-Recall via Hook (PreToolUse)

**Purpose:** Does the PreToolUse Read hook make aide_recall 100% automatic?

**Setup:** AIDE + hooks (including PreToolUse Read hook). Fresh session.

**Prompt HR-1: Direct task (should auto-recall)**
```
Add a new method `mergeMemories(id1: number, id2: number)` to MemoryStore that combines two memories into one. Keep the most recent created_at.
```

**Prompt HR-2: PlanMode task (should ALSO auto-recall via hook)**
```
Add a new module src/memory/dedup.ts — a DedupEngine class that finds and merges duplicate memories. Include detect, merge, and report methods. Write vitest tests.
```

Measure:
| Dimension | HR-1 (Direct) | HR-2 (PlanMode) |
|-----------|---------------|-----------------|
| Auto-recall injected via hook? | Y/N | Y/N |
| Agent also called aide_recall manually? | Y/N | Y/N |
| PlanMode subagents got recall context? | n/a | Y/N |
| Context was relevant to task? | Y/N | Y/N |

---

## Cursor Testing

Cursor **does** support hooks (`.cursor/hooks.json`). The same hook scripts work for both tools — only the config file format differs.

**Cursor setup:**

1. **MCP config** (`.cursor/mcp.json`):
```json
{
  "mcpServers": {
    "aide-memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["ts-node", "src/memory/cli.ts", "."]
    }
  }
}
```

2. **Hooks config** (`.cursor/hooks.json`):
```json
{
  "version": 1,
  "hooks": {
    "stop": [
      {
        "command": "bash scripts/hooks/stop-remember.sh",
        "type": "command",
        "timeout": 30
      }
    ],
    "beforeSubmitPrompt": [
      {
        "command": "bash scripts/hooks/detect-correction.sh",
        "type": "command"
      }
    ],
    "beforeReadFile": [
      {
        "command": "node scripts/hooks/recall-for-path.js",
        "type": "command"
      }
    ]
  }
}
```

3. **Rules** (`.cursorrules`):
```
# aide-memory: Persistent project memory
Call `aide_recall` with file paths before working on new areas.
Call `aide_remember` when user corrects approach, decisions made, constraints discovered.
Don't over-use: skip for already-recalled areas, trivial changes.
```

**Cursor-specific advantages:**
- `beforeReadFile` hook fires on all file reads (not just tool calls) — more granular than Claude Code's `PreToolUse`
- `stop` hook supports `followup_message` — can auto-submit an aide_remember prompt
- `"type": "prompt"` hooks — can use LLM to decide if something is worth remembering (e.g., "Did the agent just make a design decision? Respond with {ok: true/false}")

**Cursor E2E plan:**
- Run same Test Suites 1-3 as Claude Code (same prompts, separate sessions)
- Use `.cursor/hooks.json` instead of `.claude/settings.json`
- Compare aide_remember adoption rates between Claude Code and Cursor
- Test `beforeReadFile` vs Claude Code's `PreToolUse` Read for auto-recall injection
- Note: Cursor sessions are composer-based, not CLI — extraction method differs (no JSONL, need to check Cursor's transcript format)

---

## Success Criteria

| Metric | Target | Round 2 Baseline |
|--------|--------|-----------------|
| aide_remember adoption (Stop hook) | >50% of tasks | 0% |
| Correction storage (UserPromptSubmit hook) | >75% of corrections | 0% |
| aide_recall auto-injection (PreToolUse hook) | 100% of file reads | 75% (rules only) |
| Cross-session recall improves code quality | Measurable difference in Test Suite 2 | Untested |
| PlanMode bypass eliminated | PreToolUse fires for subagent reads too | 25% bypass rate |

---

## Implementation Log

> Fill this as we implement. Each entry: date, what was done, result.

_(Empty — implementation not yet started)_
