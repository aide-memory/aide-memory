# Hooks Implementation — aide-memory Adoption Layer

> Created Mar 1, 2026. This doc covers the hooks phase: why, what, how, testing.

## Background

The previous phase built the aide-memory MVP (MCP server, 6 tools, SQLite store, path-scoped recall) and ran two rounds of E2E testing. Full details in `**docs/MVP_IMPLEMENTATION.md**` — that doc covers:

- MVP build (store, recall, server, CLI, 82 tests)
- Round 1 E2E: 0/6 proactive tool calls without rules
- Round 2 E2E: Run A (bare) vs Run B (AIDE+rules) across **separate sessions**, same 4 prompts
- Key finding: aide_recall adoption fixed by rules (75%), but **code quality comparison was inconclusive** — MVP implementation testing had issues (see `docs/MVP_IMPLEMENTATION.md`). Cross-tool code quality comparison still needs proper testing.
- aide_remember: 0% adoption across all 10 test prompts

This doc picks up where MVP_IMPLEMENTATION.md left off. The MVP works mechanically. The problem is adoption (aide_remember) and proving cross-session value.

---

## docs/HOOKS_[IMPLEMENTATION.md](http://IMPLEMENTATION.md)Why Hooks? (And Why Not Sooner?)

### Why we should have considered hooks earlier

The agent adoption problem was identified in Round 1 (0/6 proactive calls). Our response was rules (`.claude/rules/aide-memory.md`), which partially worked for aide_recall (75%) but completely failed for aide_remember (0%). Hooks were mentioned in the MVP_IMPLEMENTATION doc as a "Tier 2 fix" but we deprioritized them in favor of running a Round 2 intra-session comparison test.

**In hindsight, this was a sequencing mistake.** The Round 2 intra-session comparison suggested code quality may be similar with or without aide_recall, but the MVP testing had issues and this isn't conclusively proven. Either way, intra-session comparison doesn't test aide-memory's actual value prop (cross-session persistence). We could have:

1. Implemented hooks immediately after Round 1 (fix aide_remember)
2. Jumped straight to cross-session tests (prove the value prop)

Instead we spent time on intra-session comparison when the real question is cross-session persistence. The Round 2 results are still useful (confirmed rules fix recall adoption) but the hooks should have come first. Code quality comparison across tools vs no tools still needs proper testing — the MVP round had methodology issues.

### What Round 2 proved

Round 2 E2E testing (Run A bare vs Run B with AIDE+rules, **separate sessions, same prompts**) proved:


| Finding                                                | Data                                          |
| ------------------------------------------------------ | --------------------------------------------- |
| Rules fix aide_recall adoption                         | 0% → 75% (3/4 proactive calls)                |
| aide_recall intra-session code quality impact unclear | MVP testing had issues; needs proper re-test  |
| aide_remember is completely broken                     | 0% across 10 test prompts (Round 1 + Round 2) |
| Cross-session value is untested                        | Can't test until aide_remember works          |


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


| Event              | When                      | Can Block? | Our Use                                  |
| ------------------ | ------------------------- | ---------- | ---------------------------------------- |
| `PreToolUse`       | Before tool executes      | Yes        | Auto-inject aide_recall before Read/Edit |
| `PostToolUse`      | After tool succeeds       | No         | Nudge aide_remember after Edit           |
| `Stop`             | Agent finishes responding | Yes        | End-of-task reflection for aide_remember |
| `UserPromptSubmit` | User sends message        | Yes        | Detect corrections, auto-store           |
| `SubagentStop`     | Subagent finishes         | No         | Capture subagent discoveries             |


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


| Cursor Event         | Claude Code Equivalent | Our Use                                  |
| -------------------- | ---------------------- | ---------------------------------------- |
| `preToolUse`         | `PreToolUse`           | Auto-inject aide_recall before Read/Edit |
| `postToolUse`        | `PostToolUse`          | Nudge aide_remember after Edit           |
| `stop`               | `Stop`                 | End-of-task reflection for aide_remember |
| `beforeSubmitPrompt` | `UserPromptSubmit`     | Detect corrections, auto-store           |
| `beforeReadFile`     | (no direct equiv)      | Inject context before any file read      |
| `afterFileEdit`      | (no direct equiv)      | Post-edit nudge                          |
| `sessionStart`       | `SessionStart`         | Inject `additional_context` at start     |
| `beforeMCPExecution` | `PreToolUse` (matcher) | Observe/modify MCP calls                 |


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


| Step | What                                                              | Depends On      | Effort  |
| ---- | ----------------------------------------------------------------- | --------------- | ------- |
| 1    | Create `scripts/hooks/` directory structure                       | —               | 5 min   |
| 2    | Implement Stop hook (`stop-remember.sh`)                          | —               | 30 min  |
| 3    | Add `.claude/settings.json` with Stop hook config                 | Step 2          | 5 min   |
| 4    | Add `.cursor/hooks.json` with stop hook config                    | Step 2          | 5 min   |
| 5    | **Test: Run 1 prompt in Claude Code, verify aide_remember fires** | Steps 2-3       | 15 min  |
| 6    | Implement correction detection hook (`detect-correction.sh`)      | —               | 30 min  |
| 7    | Add UserPromptSubmit / beforeSubmitPrompt hooks to configs        | Step 6          | 5 min   |
| 8    | **Test: Send correction, verify detection + storage**             | Steps 6-7       | 15 min  |
| 9    | Build `recall-for-path.js` (direct store access, no MCP)          | `npm run build` | 45 min  |
| 10   | Implement PreToolUse / beforeReadFile hooks                       | Step 9          | 30 min  |
| 11   | **Test: Verify auto-recall injection before Read**                | Steps 9-10      | 15 min  |
| 12   | Full E2E test — Claude Code (see below)                           | Steps 1-11      | 1-2 hrs |
| 13   | Full E2E test — Cursor (same prompts, `.cursor/hooks.json`)       | Steps 1-11      | 1-2 hrs |


**Scripts are tool-agnostic.** Same shell/node scripts in `scripts/hooks/`, just different config files:

- Claude Code: `.claude/settings.json` (hooks nested under `"hooks"` key)
- Cursor: `.cursor/hooks.json` (dedicated hooks file, `"version": 1` format)

---

## E2E Testing Plan

### Lessons from Round 2 (What NOT to Repeat)

Round 2 ran 4 prompts in a single session, bare vs AIDE. MVP implementation testing had issues — code quality comparison was inconclusive. See `docs/MVP_IMPLEMENTATION.md` for full results. Key takeaways for this round:


| Lesson                                                               | What We Learned                                                                                         | How We Avoid Repeating                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| **Intra-session quality comparison is pointless**                    | Agent reads code directly, matches AIDE agent. Both produce same code.                                  | Don't compare code quality within a single session. Only compare across sessions. |
| **Adoption is measurable**                                           | JSONL session files show exact MCP calls. Can extract programmatically.                                 | Keep using JSONL extraction. Define "proactive" precisely.                        |
| **Token tracking matters**                                           | Run B (76k) used fewer tokens than Run A (83k). aide_recall replaces file reads.                        | Record `/context` after every test. Compare message tokens specifically.          |
| **Both runs must be separate sessions**                              | Verified in Round 2 — session IDs confirmed different.                                                  | Always note session IDs.                                                          |
| **Code changes from tests should be kept or discarded deliberately** | Round 2 Run A code was committed (useful). Run B extra code (tags, stats) preserved on separate branch. | Decide BEFORE testing: will we keep the code? Branch accordingly.                 |


### What We're Actually Testing This Time

**Round 2 tested:** Does aide_recall improve code quality? (Answer: No, for intra-session work.)

**This round tests three different questions:**


| #   | Question                                                  | How We Test                                                                     | What Proves It                                                                 |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | **Does the Stop hook make aide_remember fire?**           | Single session, 1 prompt + 1 correction. Check JSONL for `aide_remember` calls. | aide_remember call count > 0 (was 0/10 in all prior tests)                     |
| 2   | **Does stored knowledge survive to a new session?**       | Session 1: teach + correct. Session 2 (fresh): similar task. Compare output.    | AIDE agent in session 2 uses patterns taught in session 1. Bare agent doesn't. |
| 3   | **Does PreToolUse hook make aide_recall 100% automatic?** | Single session with hook. Check if recall context appears before file reads.    | Context injected on every Read, including inside PlanMode subagents.           |


**Question 2 is the money test.** If it passes, aide-memory has proven cross-session value. If it fails, we need to understand why (aide_remember didn't store? aide_recall didn't return? agent ignored the context?).

### Decision Gates (Stop-and-Fix Before Proceeding)

```
Gate 1: Does Stop hook fire?
├── YES → Proceed to Gate 2
└── NO → Fix hook config. Don't run any E2E tests yet.

Gate 2: Does aide_remember get called?
├── YES → Proceed to Gate 3
└── NO → Hook fires but agent ignores nudge. Fix prompt text / try
│         Cursor's followup_message approach. Don't run cross-session test.

Gate 3: Is stored knowledge correct and scoped?
├── YES → Proceed to Test Suite 2 (cross-session)
└── NO → Memories stored but wrong layer/scope/content. Fix and re-test.

Gate 4: Does session 2 agent use session 1 knowledge?
├── YES → aide-memory proves cross-session value. Ship it.
└── NO → Recall returns knowledge but agent ignores it. Investigate why.
         Is it context injection format? Relevance? Token budget?
```

**Do NOT skip gates.** Each depends on the previous. Running cross-session tests before aide_remember works is a waste of time.

### Branch Strategy

```
feature/agent-memory              ← current, has MVP + Round 2 code
  └── feature/hooks               ← hooks implementation (scripts + configs)
```

We do NOT create separate branches for test runs this time. Code changes from test prompts are **not kept** — we're testing hooks behavior, not generating production code. After each test, `git checkout -- src/` to reset.

```bash
# Setup
git checkout feature/agent-memory
git checkout -b feature/hooks

# Implement hooks (steps 1-11 from Implementation Order)
# Commit implementation
# Then run tests on this branch, resetting code changes between tests
```

### Test Suite 1: aide_remember Adoption (Gates 1-3)

**What this tests:** Do hooks make aide_remember fire? (Was 0% in all prior rounds.)

**What this does NOT test:** Intra-session code quality comparison (MVP round was inconclusive — still needs proper testing, but not the focus here).

**Pre-flight checklist (MUST verify before running):**
- [ ] `.mcp.json` exists at project root with aide-memory config
- [ ] `settings.json` has hooks only (no `mcpServers` key)
- [ ] Start fresh `claude` session
- [ ] Run `/mcp` — verify aide-memory server is connected
- [ ] Run `/context` — verify MCP tools appear in token breakdown
- [ ] Only proceed if MCP tools are confirmed available

**Setup:**

```bash
# On feature/hooks branch with hooks implemented
# Verify:
cat .mcp.json                          # MCP server config (NOT in settings.json)
cat .claude/settings.json              # hooks only
cat .claude/rules/aide-memory.md       # rules active
sqlite3 ~/.aide/projects/*/memory.db "SELECT count(*) FROM memories WHERE status='active'"
```

**Session:** Fresh `claude` session. Note session ID from JSONL filename.

---

**Prompt H-1: Simple task (tests Gate 1 + 2)**

```
Add a method `archiveOld(days: number)` to MemoryStore in src/memory/store.ts — like pruneOld but sets status to 'archived' instead of deleting. Write a vitest test.
```

Wait for agent to complete. The Stop hook should fire and nudge aide_remember.

Results:

| Dimension | Result |
|-----------|--------|
| Session ID | |
| MCP tools confirmed available? | Y/N |
| Called `aide_recall` before coding? | Y/N — proactive? |
| Used sync API (no `await`)? | Y/N |
| Test uses vitest (not jest)? | Y/N |
| Respected WAL mode? | Y/N |
| Corrections needed | count |
| **Stop hook fired?** | **Y/N — Gate 1** |
| **aide_remember called?** | **Y/N — Gate 2** |
| **What was stored (paste)?** | |
| **Layer + scope correct?** | **Y/N — Gate 3** |
| Notes | |

**aide_recall output received by agent (paste):**
```
(paste aide_recall output here)
```

**Code produced (paste key method):**
```ts
(paste archiveOld method here)
```

**aide_remember input (paste if called):**
```json
(paste aide_remember call input here)
```

**If Gate 2 fails (aide_remember not called) WITH MCP confirmed available:** This is a real failure. The stop hook prompt is not convincing enough. Try stronger language or Cursor's `followup_message` approach.

---

**Prompt H-2: User correction (tests correction detection hook)**

In the SAME session, paste:

```
Add a method `duplicateCheck()` to MemoryStore that finds memories with very similar `what` text. Use string comparison.
```

After agent writes first version, send this correction:

```
No, don't use bigram similarity in JS — use SQL LIKE with wildcard matching instead so it stays in the database layer.
```

*(If agent doesn't use bigram/JS similarity, adapt correction to whatever approach it chose.)*

Results:

| Dimension | Result |
|-----------|--------|
| Used sync API (no `await`)? | Y/N |
| Test uses vitest? | Y/N |
| Agent adapted code to correction? | Y/N |
| Corrections needed (beyond the intentional one) | count |
| **UserPromptSubmit hook detected correction?** | **Y/N** |
| **aide_remember called after correction?** | **Y/N** |
| **Correction content stored accurately?** | **Y/N** |
| **Stop hook fired after H-2?** | **Y/N** |
| **aide_remember called on stop (H-2)?** | **Y/N** |
| Notes | |

**Code produced (paste key method — before and after correction):**
```ts
(paste here)
```

**aide_remember input (paste if called):**
```json
(paste here)
```

---

**After Suite 1, verify the DB:**

```bash
sqlite3 ~/.aide/projects/*/memory.db \
  "SELECT id, layer, scope, substr(what,1,80), source FROM memories WHERE source='conversation' ORDER BY id DESC LIMIT 10"
```

**MCP Tool Call Summary (Suite 1):**

| Call # | Tool | Trigger | Proactive? |
|--------|------|---------|------------|
| 1 | | | |
| 2 | | | |
| ... | | | |

**Total MCP calls: _. Proactive calls: _. aide_remember calls: _.**

**Token usage (`/context` after Suite 1):**

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | | |
| System tools (built-in) | | |
| MCP tools (aide-memory) | | |
| Memory files (MEMORY.md) | | |
| Skills | | |
| Messages (conversation) | | |
| Free space | | |
| Autocompact buffer | | |
| **Total used** | **k / 200k** | **%** |

**Reset code changes:**

```bash
git checkout -- src/
```

---

### Test Suite 2: Cross-Session Persistence (The Money Test)

**Prerequisite:** Suite 1 passed Gates 1-3. aide_remember works and stores correct knowledge.

**What this tests:** Does knowledge taught in session 1 survive to session 2 and influence the agent's code?

**What makes this different from Round 2:** Round 2 tested intra-session (agent already had context). This tests cross-session (agent starts cold, gets context only from aide_recall).

**Why we need a bare comparison this time:** Unlike Round 2 (where bare matched AIDE because code was readable), a bare agent in session 2 has NO way to know what was taught in session 1. There's no code to read that contains the preferences. This is where aide_memory should clearly win.

---

**Session 1 — AIDE+Hooks: Teaching + Coding**

Fresh session. AIDE + hooks active.

```
I'm working on src/memory/store.ts. Some things to know:
- Never use `new Date()` for SQLite date comparison — use `datetime('now', '-N days')` in SQL
- Always add an index on columns used in WHERE clauses for new tables
- Status transitions go: active → completed → archived (never skip)

Now add an `expireCompleted(days: number)` method that moves completed memories older than N days to archived status.
```

After agent writes code, correct:

```
Also, always log the count of affected rows when doing bulk operations — use logInfo from src/core/logger.
```

Results:

| Dimension | Result |
|-----------|--------|
| Session 1 ID | |
| Called `aide_recall` before coding? | Y/N — proactive? |
| Used sync API (no `await`)? | Y/N |
| Used `datetime()` SQL (not JS Date)? | **Y/N — taught in prompt** |
| Added index on WHERE columns? | **Y/N — taught in prompt** |
| Followed status transition rule? | **Y/N — taught in prompt** |
| Adapted to logging correction? | **Y/N — corrected** |
| Test uses vitest? | Y/N |
| Corrections needed (beyond intentional one) | count |
| **Stop hook fired?** | **Y/N** |
| **aide_remember calls** | **count** |
| **`datetime()` preference stored?** | **Y/N** |
| **Index preference stored?** | **Y/N** |
| **Status transition rule stored?** | **Y/N** |
| **Logging correction stored?** | **Y/N** |
| Notes | |

**aide_recall output received by agent (paste):**
```
(paste here)
```

**Code produced (paste expireCompleted method):**
```ts
(paste here)
```

**aide_remember calls (paste all):**
```json
(paste each aide_remember call input here)
```

**After session 1, check what was stored:**

```bash
sqlite3 ~/.aide/projects/*/memory.db \
  "SELECT id, layer, scope, substr(what,1,100) FROM memories WHERE source='conversation' ORDER BY id DESC LIMIT 10"
```

**If key preferences were NOT stored:** STOP. aide_remember still broken. Go back to Suite 1 and fix hooks.

**Token usage session 1 (`/context`):**

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | | |
| System tools (built-in) | | |
| MCP tools (aide-memory) | | |
| Memory files (MEMORY.md) | | |
| Messages (conversation) | | |
| Free space | | |
| **Total used** | **k / 200k** | **%** |

**Reset code (don't keep session 1's code):**

```bash
git checkout -- src/
```

**Close session 1 completely.** Wait 5 seconds.

---

**Session 2A — AIDE+Hooks: Fresh session, recall test**

Start fresh: `claude`. AIDE + hooks active. Note new session ID.

```
Add a method `purgeArchived(days: number)` to MemoryStore that permanently deletes archived memories older than N days. Write a vitest test.
```

**Do NOT mention any preferences.** The agent should get them from aide_recall only.

Results:

| Dimension | Session 2A (AIDE+Hooks) |
|-----------|------------------------|
| Session 2A ID | |
| aide_recall fired (hook or proactive)? | Y/N |
| Session 1 memories returned? | Y/N |
| Used sync API (no `await`)? | Y/N |
| Used `datetime()` SQL? | **Y/N — key signal** |
| Logged affected row count? | **Y/N — key signal** |
| Added index? | Y/N |
| Used vitest? | Y/N |
| Corrections needed | count |
| Stop hook fired? | Y/N |
| aide_remember called? | Y/N (count) |
| Notes | |

**aide_recall output received by agent (paste — should include session 1 memories):**
```
(paste here)
```

**Code produced (paste purgeArchived method):**
```ts
(paste here)
```

**Token usage session 2A (`/context`):**

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | | |
| System tools (built-in) | | |
| MCP tools (aide-memory) | | |
| Memory files (MEMORY.md) | | |
| Messages (conversation) | | |
| Free space | | |
| **Total used** | **k / 200k** | **%** |

**Reset code:**

```bash
git checkout -- src/
```

---

**Session 2B — Bare: Fresh session, same prompt, no memory**

```bash
# Disable everything
cp .claude/settings.json .claude/settings.json.bak
echo '{}' > .claude/settings.json
# settings.json had MCP server + hooks, so this disables both
```

Start fresh: `claude`. Note session ID.

Same prompt:

```
Add a method `purgeArchived(days: number)` to MemoryStore that permanently deletes archived memories older than N days. Write a vitest test.
```

Results:

| Dimension | Session 2B (Bare) |
|-----------|-------------------|
| Session 2B ID | |
| Used sync API (no `await`)? | Y/N |
| Used `datetime()` SQL? | **Y/N — key comparison** |
| Logged affected row count? | **Y/N — key comparison** |
| Added index? | Y/N |
| Used vitest? | Y/N |
| Corrections needed | count |
| Notes | |

**Code produced (paste purgeArchived method):**
```ts
(paste here)
```

**Token usage session 2B (`/context`):**

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | | |
| System tools (built-in) | | |
| Messages (conversation) | | |
| Free space | | |
| **Total used** | **k / 200k** | **%** |

**Restore after:**

```bash
mv .claude/settings.json.bak .claude/settings.json
```

**Reset code:**

```bash
git checkout -- src/
```

---

**Suite 2 Side-by-Side Comparison:**

| Dimension | Session 2A (AIDE+Hooks) | Session 2B (Bare) | Proves Value? |
|-----------|------------------------|--------------------|--------------|
| Used `datetime()` SQL | | | If AIDE=Y, Bare=N → **YES** |
| Logged row count | | | If AIDE=Y, Bare=N → **YES** |
| Added index | | | If AIDE=Y, Bare=N → **YES** |
| Used vitest | | | Likely both Y (readable from code) |
| Used sync API | | | Likely both Y (readable from code) |
| Corrections needed | | | Fewer for AIDE → value |
| Message tokens | | | Lower for AIDE → efficiency |
| Code quality (1-5) | | | |
| Total tokens | | | |

**MCP Tool Call Summary (Suite 2 — all sessions):**

| Call # | Session | Tool | Trigger | Proactive? |
|--------|---------|------|---------|------------|
| 1 | S1 | | | |
| 2 | S1 | | | |
| ... | S2A | | | |

**Interpreting results:**

- **AIDE uses taught patterns, Bare doesn't** → aide-memory proves cross-session value. This is the win condition.
- **Both use the patterns** → Agent discovers them from reading code. aide-memory doesn't add value for these patterns. Try with patterns that AREN'T discoverable from code (e.g., "use X library, not Y").
- **Neither uses the patterns** → Session 1 knowledge wasn't stored or wasn't recalled. Debug: check DB, check aide_recall output, check if context was injected.

---

### Test Suite 3: Auto-Recall via Hook (PreToolUse)

**Prerequisite:** Suites 1-2 done. This is an optimization test, not a value test.

**What this tests:** Does PreToolUse hook make aide_recall 100% automatic? Does it work inside PlanMode subagents?

**What this does NOT test:** Code quality comparison (MVP round was inconclusive; future follow-up needed).

**Setup:** AIDE + hooks (including PreToolUse/beforeReadFile hook). Fresh session.

**Prompt HR-1: Direct task**

```
Add a new method `mergeMemories(id1: number, id2: number)` to MemoryStore that combines two memories into one. Keep the most recent created_at.
```

**Prompt HR-2: PlanMode-triggering task**

```
Add a new module src/memory/dedup.ts — a DedupEngine class that finds and merges duplicate memories. Include detect, merge, and report methods. Write vitest tests.
```

Results:

| Dimension | HR-1 (Direct) | HR-2 (PlanMode) |
|-----------|---------------|-----------------|
| Used sync API (no `await`)? | Y/N | Y/N |
| Test uses vitest? | Y/N | Y/N |
| Corrections needed | count | count |
| Hook injected recall context before Read? | Y/N | Y/N |
| Agent also called aide_recall manually? | Y/N | Y/N |
| PlanMode subagents got recall context? | n/a | Y/N |
| Duplicate recall (hook + manual)? | Y/N | Y/N |
| Stop hook fired? | Y/N | Y/N |
| aide_remember called? | Y/N (count) | Y/N (count) |
| Token overhead from hook injection | estimate | estimate |
| Notes | | |

**Code produced HR-1 (paste key method):**
```ts
(paste mergeMemories method here)
```

**Code produced HR-2 (paste DedupEngine class):**
```ts
(paste here)
```

**If hook doesn't fire for subagent reads:** This confirms the PlanMode bypass is structural (hooks may not fire inside subagent processes). Document and accept — rules handle 75%, hook handles the remaining direct reads. This is not a blocker.

**MCP Tool Call Summary (Suite 3):**

| Call # | Tool | Trigger | Proactive? |
|--------|------|---------|------------|
| 1 | | | |
| ... | | | |

**Reset code:**

```bash
git checkout -- src/
```

**Token usage (`/context` after Suite 3):**

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | | |
| System tools (built-in) | | |
| MCP tools (aide-memory) | | |
| Memory files (MEMORY.md) | | |
| Messages (conversation) | | |
| Free space | | |
| Autocompact buffer | | |
| **Total used** | **k / 200k** | **%** |

---

### Token Budget Comparison (All Suites)

After all tests, fill this summary:

| Session | Prompts | Total Tokens | Message Tokens | aide_recall calls | aide_remember calls |
|---------|---------|-------------|----------------|-------------------|---------------------|
| Suite 1 (AIDE+Hooks) | 2 + correction | | | | |
| Suite 2 Session 1 (AIDE+Hooks) | 1 + correction | | | | |
| Suite 2A (AIDE+Hooks, recall) | 1 | | | | |
| Suite 2B (Bare) | 1 | | | | |
| Suite 3 (AIDE+Hooks) | 2 | | | | |
| **Round 2 Run A (bare, 4 prompts)** | **4** | **83k** | **63k** | **n/a** | **n/a** |
| **Round 2 Run B (AIDE+rules, 4 prompts)** | **4** | **76k** | **52k** | **3** | **0** |

This shows whether hooks add token overhead vs rules-only vs bare.

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

1. **Hooks config** (`.cursor/hooks.json`):

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

1. **Rules** (`.cursorrules`):

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


| Metric                                       | Target                                  | Round 2 Baseline |
| -------------------------------------------- | --------------------------------------- | ---------------- |
| aide_remember adoption (Stop hook)           | >50% of tasks                           | 0%               |
| Correction storage (UserPromptSubmit hook)   | >75% of corrections                     | 0%               |
| aide_recall auto-injection (PreToolUse hook) | 100% of file reads                      | 75% (rules only) |
| Cross-session recall improves code quality   | Measurable difference in Test Suite 2   | Untested         |
| PlanMode bypass eliminated                   | PreToolUse fires for subagent reads too | 25% bypass rate  |


---

## Implementation Log

> Fill this as we implement. Each entry: date, what was done, result.


| Date  | What                                                                     | Result                                                                                                                                                                                                                             |
| ----- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mar 1 | Created `feature/hooks` branch off `feature/agent-memory`                | Clean branch, all 180 tests passing                                                                                                                                                                                                |
| Mar 1 | Implemented `scripts/hooks/stop-remember.sh` (Stop hook)                 | Blocks first stop with reflection prompt, exits on `stop_hook_active=true`. Tested: outputs valid JSON, loop prevention works.                                                                                                     |
| Mar 1 | Implemented `scripts/hooks/detect-correction.sh` (UserPromptSubmit hook) | Detects correction patterns (no/don't/instead/actually/wrong/prefer/always/never). Silent for normal prompts. Tested with both correction and non-correction inputs.                                                               |
| Mar 1 | Implemented `scripts/hooks/recall-for-path.js` (direct store access)     | Node script imports `dist/memory/store` and `dist/memory/recall` directly. Takes file path + project path args. Returns formatted memory lines. Tested with scoped path (gets area memories) and generic path (gets project-wide). |
| Mar 1 | Implemented `scripts/hooks/pre-read-recall.sh` (PreToolUse hook)         | Parses `tool_input.file_path` from JSON stdin, calls `recall-for-path.js`, outputs `hookSpecificOutput.additionalContext` with proper JSON escaping via `jq`. Tested: injects 10+ memories for `src/memory/store.ts`.              |
| Mar 1 | Configured `.claude/settings.json` with all 3 hooks                      | Stop, UserPromptSubmit, PreToolUse (matcher: Read). Preserved existing mcpServers config.                                                                                                                                          |
| Mar 1 | Configured `.cursor/hooks.json` (version 1 format)                       | stop, beforeSubmitPrompt, beforeReadFile. Same scripts as Claude Code.                                                                                                                                                             |
| Mar 1 | Created `.claude/rules/aide-memory.md`                                   | Concise rules for aide_recall/aide_remember usage. Notes that PreToolUse handles auto-recall.                                                                                                                                      |
| Mar 1 | Fixed pre-existing TS error in `e2e-comparison.test.ts`                  | `process.env` spread had `undefined` values incompatible with `Record<string, string>`. Fixed with explicit filter.                                                                                                                |
| Mar 1 | Build + test pass                                                        | `tsc` clean, 180/184 tests pass (4 failures are external tool connection tests — ConPort/mcp-memory-service not installed).                                                                                                        |
| Mar 1 | Fixed hooks config format                                                | All events need nested `{"hooks": [...]}` array inside the matcher group, not flat handler objects. Stop and UserPromptSubmit were rejected by Claude Code validator. Fixed and confirmed working — PreToolUse hook fires on every Read call in live session. |
| Mar 1 | Aligned E2E test format with MVP doc                                     | Per-prompt tables now include code quality dimensions (sync API, vitest, corrections), paste areas for code/recall/remember output, MCP Tool Call Summary tables, and full token category breakdowns matching `docs/MVP_IMPLEMENTATION.md`. |
| Mar 1 | Ran H-1 (simple task) + H-2 (correction) in session `d40efe75`          | See Suite 1 results above. Gate 1 PASS (stop hook fires). Gate 2: H-1 agent dismissed nudge; H-2 agent TRIED aide_remember via Bash MCP client workaround — failed silently. 0 memories stored. |
| Mar 1 | **ROOT CAUSE FOUND:** MCP config was in wrong location                   | `mcpServers` in `.claude/settings.json` is NOT where Claude Code loads MCP servers. They must be in `.mcp.json` at project root. `enabledMcpjsonServers` in `settings.local.json` is a permission flag for `.mcp.json` servers, not `settings.json`. Created `.mcp.json`, removed `mcpServers` from `settings.json`. |

---

## Archive: Voided Suite 1 Results (MCP Not Connected)

> **These results are invalid.** MCP config was in `.claude/settings.json` instead of `.mcp.json`. The agent never had aide_remember/aide_recall available as MCP tools. All Gate 2 failures are explained by this. See Test Suite 1 above for the valid re-run.

### Voided Suite 1 Observations (H-1 + H-2)

### Token Usage (Suite 1 — `/context` after H-2)

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | 3.4k | 1.7% |
| System tools (built-in) | 17.4k | 8.7% |
| MCP tools (aide-memory) | — | — (not listed separately; may not have connected) |
| Memory files (MEMORY.md + aide-memory.md) | 1.1k | 0.5% |
| Skills | 164 | 0.1% |
| Messages (conversation) | 25.1k | 12.6% |
| Free space | 120k | 59.9% |
| Autocompact buffer | 33k | 16.5% |
| **Total used** | **46k / 200k** | **23%** |

**Notable:** MCP tools are not listed as a separate category. This strongly suggests the aide-memory MCP server **was not connected** in this session. The agent had no MCP tools available, which explains why it tried to call aide_remember via a Bash workaround instead of as an MCP tool.

### UI Issues Observed

The Stop hook output displays as an error in Claude Code's UI:
```
⏺ Ran 1 stop hook
  ⎿  bash scripts/hooks/stop-remember.sh
  ⎿  Stop hook error: Before finishing: Did you learn anything non-obvious during this task?...
```

The word "error" is misleading — the hook is working correctly. This happens because our hook uses `"decision": "block"` which Claude Code surfaces as `hookErrors` in JSONL and "Stop hook error:" in the UI. This is cosmetic but could confuse users.

### UserPromptSubmit Hook: No Evidence It Fired

Zero `UserPromptSubmit` hook_progress events in the entire session JSONL. Only PreToolUse, PostToolUse (built-in callbacks), and Stop events appear. The correction message (`"No, don't use bigram similarity..."`) should have matched the regex pattern `no[, ]+(don.t)` but:

- No context injection visible in the user message (line 73 in JSONL is plain text)
- No system-reminder or additionalContext between user message and assistant response
- The agent responded to the correction without mentioning aide_remember

Possible causes:
1. UserPromptSubmit hooks don't generate hook_progress entries in JSONL (different telemetry path)
2. The hook fired but its output format was wrong (our `hookSpecificOutput` format may not be correct for UserPromptSubmit)
3. The hook genuinely didn't fire for this session

**Contrast with current session:** The same hook fires correctly in THIS session (analyzing H-2 results), injecting "The user appears to be correcting you..." context. The difference may be that MCP server connectivity affects hook execution, or the hook was only working after the config format fix.

### What Went Well

1. **Stop hook mechanics work perfectly.** Fires on every task completion. Loop prevention (`stop_hook_active`) works — second stop always exits cleanly. The nudge text reaches the agent and it considers the question seriously.

2. **PreToolUse:Read hook fires reliably.** Every Read tool call triggers `pre-read-recall.sh`. The hook correctly parses `tool_input.file_path` and calls `recall-for-path.js`. The mechanism is sound.

3. **Code quality remains excellent.** Both H-1 and H-2 produced correct sync API code, vitest tests, all passing. Zero unintended corrections needed. The agent adapted to the H-2 correction cleanly (Dice bigrams → SQL LIKE self-join).

4. **Agent shows genuine judgment.** H-1: "Nothing non-obvious to store" was arguably correct for a copy-paste-modify task. H-2: "Yes — the user's preference to keep logic in the database layer is worth storing" — the agent identified the right thing to remember.

### What Went Mid

1. **Stop hook convinces but can't execute.** The H-2 agent clearly wanted to call aide_remember. It identified the correct memory (SQL-first preference, preferences layer, `src/memory/**` scope). But it used a Bash MCP client workaround that failed silently — `.catch(() => {})` swallowed the error, `exit code 0` was misleading.

2. **PreToolUse hook fires but has nothing to inject.** All 6 Read calls triggered the hook, but no memories matched (the DB had no memories scoped to `src/memory/store.ts` or `src/memory/__tests__/store.test.ts` specifically — existing memories use broader scopes like `src/memory/**`). The recall path-matching may need to resolve glob scopes against specific file paths.

3. **H-2 test prompt was poorly designed.** Said "Use string comparison" expecting exact match, but agent used Dice coefficient bigram similarity instead. The planned correction didn't apply; we had to adapt it. Future test prompts need to be more constraining if they rely on the agent making a specific mistake.

### What Went Bad

1. **MCP server appears to not have been connected.** The `/context` output shows no MCP tools category. This is the root cause of Gate 2 failure — the agent literally could not call aide_remember as an MCP tool because the tool wasn't available. The hook nudge worked, but the agent had no way to act on it.

2. **aide_remember adoption is still 0%.** Zero memories stored across both H-1 and H-2. The H-2 Bash workaround attempt doesn't count — the memory is not in the DB. We went from "agent ignores memory tools" to "agent wants to use memory tools but can't find them."

3. **UserPromptSubmit correction detection is unverified.** No evidence it fired in the H-2 session. Without this hook working, the only path to aide_remember is the Stop hook, which fires too late (after the agent already forgot the context of the correction).

### Root Cause Analysis

The most likely root cause is **MCP server not connected in the test session**. Evidence:
- `/context` shows no MCP tools category
- Agent used Bash workaround instead of MCP tool call
- Agent tool list shows only Read/Edit/Bash/Write/Glob — no aide_* tools

Why wasn't MCP connected? **Root cause found:** Claude Code loads MCP servers from `.mcp.json` at the project root, NOT from `mcpServers` in `.claude/settings.json`. The `enabledMcpjsonServers` in `settings.local.json` is a permission flag for `.mcp.json` servers. We had the config in the wrong file — the MCP server was never loaded.

**Fix applied:** Created `.mcp.json` at project root, removed `mcpServers` from `settings.json`. See new Suite 1 above for re-run with correct config.

### Connection to Original Question: Should We Continue?

The original question from `docs/PROTOTYPE.md` competitive analysis: *"Is path-scoped recall enough to justify building vs. using ConPort?"*

**Suite 1 results don't answer this yet, but they reveal a prerequisite problem:**

1. **The hooks architecture is sound.** Stop hook fires, PreToolUse fires, loop prevention works, agent judgment is good. The MECHANISM works.

2. **The MCP connection is the bottleneck.** If the MCP server isn't connected, nothing else matters — aide_remember can't be called, aide_recall can't be called proactively, and the PreToolUse hook has no memories to inject.

3. **We haven't yet tested the actual value proposition.** Cross-session persistence (Suite 2) is "the money test." We can't run it until Suite 1 works end-to-end.

**Decision: Continue, but fix MCP first.** The hooks work. The agent wants to use memory. The MCP connection is the broken link. Fix that, re-run Suite 1, and if Gate 2 passes, proceed to Suite 2.

### Next Steps

1. **Diagnose MCP connection failure.** Run `claude` with verbose output, check if aide-memory MCP server starts. Test: `npx ts-node src/memory/cli.ts /Users/meky/code/aide-v0` manually — does it respond to JSON-RPC?

2. **Re-run Suite 1 with confirmed MCP connection.** Before sending any test prompts, verify MCP tools appear in `/context` output. If they don't, fix MCP config first.

3. **Consider alternative aide_remember path.** If MCP connection is inherently unreliable, the Stop hook could call `recall-for-path.js` (direct store access) to WRITE as well as read — bypassing MCP entirely for the store path.

4. **Test UserPromptSubmit hook independently.** Send a known correction pattern and check if the context injection appears. May need to fix the hook output format.

### Potential Mitigations

| Problem | Mitigation | Effort |
|---------|-----------|--------|
| MCP server not connected | Add health check at session start (PreToolUse hook checks MCP, warns if down) | Low |
| Agent uses Bash instead of MCP tool | Update Stop hook prompt to explicitly say "use the aide_remember MCP tool" | Low |
| Agent dismisses Stop hook nudge (H-1) | Make prompt stronger: "You MUST call aide_remember if any of these apply: ..." | Low |
| PreToolUse has no memories to inject | Seed DB with base memories; fix recall glob matching for specific file paths | Medium |
| UserPromptSubmit hook not firing | Debug output format; test with `claude --debug` or manual hook execution | Medium |
| MCP connection inherently unreliable | Direct store access for both read AND write (bypass MCP in hooks) | High |
| Stop hook "error" display confusing | Can't fix — Claude Code's UI decision. Consider using `"decision": "approve"` + just outputting text | Low |


