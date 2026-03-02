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
| Session ID | `d5ffba86-0333-4187-a315-06dca9b32eb2` |
| MCP tools confirmed available? | **Y** — `/context` showed "MCP tools: 1.4k tokens (0.7%)" |
| Called `aide_recall` before coding? | N — not proactively. PreToolUse hook fired for both Read calls (injected recall automatically) |
| Used sync API (no `await`)? | Y — `.prepare().run()` sync, no await |
| Test uses vitest (not jest)? | Y — `npx vitest run` |
| Respected WAL mode? | Y — sync better-sqlite3 |
| Corrections needed | 0 |
| **Stop hook fired?** | **Y — Gate 1 PASS** (hasOutput=True, hookCount=1) |
| **aide_remember called?** | **N — Agent chose not to** (correctly judged nothing worth storing) |
| **What was stored (paste)?** | N/A — agent said "Nothing non-obvious to store" |
| **Layer + scope correct?** | N/A |
| Notes | Gate 2 not exercised but not failed — agent had MCP tools available (confirmed in /context), made a reasonable judgment. The `hookErrors` field in JSONL misleadingly contains the hook's stdout text, not actual errors. Loop prevention confirmed: 2nd stop had `hasOutput=false`. Duration: 34,990ms (~35s). |

**aide_recall output received by agent:**
```
PreToolUse hook fired for both Read(store.ts) and Read(store.test.ts).
No matching memories injected (no stored memories matched these paths).
```

**Code produced:**
```ts
archiveOld(days: number): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = this.db.prepare(
    "UPDATE memories SET status = 'archived' WHERE created_at < ? AND status != 'archived'"
  ).run(cutoff);
  return result.changes;
}
```

Tests: 26 pass (2 new archiveOld tests — archives old memories, skips already-archived).

**Tool call sequence:**
```
Read(store.ts) → [PreToolUse hook] → Glob(test files) → Read(store.test.ts) → [PreToolUse hook]
→ Edit(store.ts) → Edit(store.test.ts) → Bash(vitest) → [Stop hook] → TEXT("nothing to store")
→ [Stop hook, hasOutput=false] → END
```

**JSONL technical note:** The `stop_hook_summary` system message has a `hookErrors` field that contains the hook's stdout output text (the nudge prompt), not actual errors. `hasOutput` boolean is the reliable indicator. Second stop has `hasOutput: false` confirming loop prevention.

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
| Used sync API (no `await`)? | Y — `.prepare().all()` sync |
| Test uses vitest? | Y — `npx vitest run`, 32 pass |
| Agent adapted code to correction? | **Y** — Jaccard word similarity → SQL LIKE self-join |
| Corrections needed (beyond the intentional one) | 0 |
| **UserPromptSubmit hook detected correction?** | **N** — no `hook_progress` for UserPromptSubmit in JSONL (same as voided suite — see follow-up notes) |
| **aide_remember called after correction?** | **Y — GATE 2 PASS** — called proactively BEFORE Stop hook |
| **Correction content stored accurately?** | **Y — GATE 3 PASS** — stored as memory #39 in DB |
| **Stop hook fired after H-2?** | **Y** — hasOutput=True, agent said "Already stored the key correction (memory #39)" |
| **aide_remember called on stop (H-2)?** | **N** — correctly de-duplicated: agent recognized it already stored during the task |
| Notes | Agent called aide_remember proactively after adapting code, not triggered by Stop hook. The Stop hook served as a safety net but wasn't needed. No duplicate entry. Duration: 61,879ms (~62s). |

**Code produced — BEFORE correction (Jaccard word similarity in JS):**
```ts
// Module-level helpers
function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ').trim();
}
function wordSimilarity(a: string, b: string): number {
  const na = normalizeText(a);
  const nb = normalizeText(b);
  if (na === nb) return 1;
  const wordsA = new Set(na.split(' '));
  const wordsB = new Set(nb.split(' '));
  const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
  const union = new Set([...wordsA, ...wordsB]).size;
  return union === 0 ? 0 : intersection / union;
}

// Method
duplicateCheck(options?: { threshold?: number }): Array<[Memory, Memory]> {
  const threshold = options?.threshold ?? 0.8;
  const memories = this.list({ status: 'active' });
  const pairs: Array<[Memory, Memory]> = [];
  for (let i = 0; i < memories.length; i++) {
    for (let j = i + 1; j < memories.length; j++) {
      if (wordSimilarity(memories[i].what, memories[j].what) >= threshold) {
        pairs.push([memories[i], memories[j]]);
      }
    }
  }
  return pairs;
}
```

**Code produced — AFTER correction (SQL LIKE self-join):**
```ts
duplicateCheck(): Array<[Memory, Memory]> {
  const rows = this.db.prepare(`
    SELECT a.*, b.id AS b_id
    FROM memories a
    JOIN memories b ON a.id < b.id
    WHERE a.status = 'active' AND b.status = 'active'
      AND (
        LOWER(a.what) = LOWER(b.what)
        OR LOWER(a.what) LIKE '%' || LOWER(b.what) || '%'
        OR LOWER(b.what) LIKE '%' || LOWER(a.what) || '%'
      )
  `).all() as Array<any & { b_id: number }>;
  return rows.map(row => [
    this.rowToMemory(row),
    this.get(row.b_id)!,
  ]);
}
```

JS helpers (`normalizeText`, `wordSimilarity`) removed. Tests updated: removed threshold test, added case-insensitive and substring containment tests.

**aide_remember input:**
```json
{
  "what": "Keep data operations in the database layer — use SQL (LIKE, self-joins) instead of pulling data into JS for comparison. Don't do in JS what SQLite can do.",
  "why": "User corrected Jaccard word similarity approach in JS — wanted SQL LIKE with wildcard matching in a self-join instead, keeping logic in the database layer.",
  "layer": "preferences",
  "scope": "src/memory/**",
  "contributor": "meky"
}
```

**DB verification:** Memory #39 confirmed in `memory.db` — layer=preferences, scope=src/memory/**, contributor=meky.

---

**After Suite 1, verify the DB:**

```bash
sqlite3 ~/.aide/projects/*/memory.db \
  "SELECT id, layer, scope, substr(what,1,80), source FROM memories WHERE source='conversation' ORDER BY id DESC LIMIT 10"
```

**MCP Tool Call Summary (Suite 1):**

| Call # | Tool | Trigger | Proactive? |
|--------|------|---------|------------|
| 1 | `aide_remember` | After H-2 correction (agent chose to store before Stop hook) | **Yes** |

**Total MCP calls: 1. Proactive calls: 1. aide_remember calls: 1.**

Note: No `aide_recall` MCP calls — all recall was handled by PreToolUse hooks (fired 4x across H-1 and H-2 for Read tool calls). The hooks injected context directly without requiring the agent to call aide_recall as an MCP tool.

**Token usage (`/context` after Suite 1):**

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | 3.4k | 1.7% |
| System tools (built-in) | 17.4k | 8.7% |
| MCP tools (aide-memory) | 1.4k | 0.7% |
| Memory files (MEMORY.md + rules) | 1.1k | 0.5% |
| Skills | 164 | 0.1% |
| Messages (conversation) | 28.6k | 14.3% |
| Free space | 115k | 57.4% |
| Autocompact buffer | 33k | 16.5% |
| **Total used** | **51k / 200k** | **26%** |

MCP tool breakdown: 6 tools × 235 tokens each = 1.4k. aide-memory overhead is minimal (~0.7% of context).

All 6 MCP tools confirmed available: aide_recall, aide_remember, aide_forget, aide_memories, aide_import, aide_search.

**Reset code changes:**

```bash
git checkout -- src/
```

---

### Suite 1 Observations

**What went well:**
- **Gate 1 PASS:** Stop hook fires reliably. Loop prevention works (2nd stop has `hasOutput: false`).
- **Gate 2 PASS:** aide_remember called with MCP properly connected. The voided suite's Gate 2 failure was entirely due to MCP config being in the wrong file (`.claude/settings.json` instead of `.mcp.json`).
- **Gate 3 PASS:** Memory #39 stored with correct layer (`preferences`), scope (`src/memory/**`), contributor (`meky`), and accurate content summarizing the correction.
- **Agent self-de-duplicated:** Called aide_remember proactively after the correction, then recognized "already stored" when Stop hook nudged — no duplicate entry.
- **Code quality:** Agent adapted correctly both times (H-1 simple task, H-2 correction). 0 corrections needed beyond the intentional one.
- **PreToolUse hooks:** Fired 4x total (every Read call) — automatic recall injection working.

**What went mid:**
- **UserPromptSubmit hook:** No `hook_progress` events for UserPromptSubmit in JSONL for either H-1 or H-2. Same behavior as voided suite. Either: (a) the hook fires but generates no JSONL progress entry, (b) the hook fires but `detect-correction.sh` exits cleanly with no output so nothing is logged, or (c) the hook doesn't fire. Need to add debug logging to `detect-correction.sh` to determine which. The agent stored the correction anyway via Stop hook flow, so this wasn't a blocker.
- **Gate 2 on H-1:** Not exercised — agent correctly judged "nothing to store" for a simple method addition. This is arguably correct behavior (not everything needs remembering), but it means we only got Gate 2 evidence from H-2.

**What needs investigation:**
- **UserPromptSubmit visibility:** Is the hook firing at all? Add `echo "USH fired" >> /tmp/ush-debug.log` to `detect-correction.sh` to confirm. If it fires but JSONL doesn't log it, that's a JSONL limitation. If it doesn't fire, there's a config issue.
- **JSONL `hookErrors` naming:** The `hookErrors` field in `stop_hook_summary` contains stdout output text, not actual errors. `hasOutput` is the reliable boolean. This is a Claude Code JSONL quirk worth noting for future analysis.

**Hook interaction design question: Stop + UserPromptSubmit duplication risk**

This test showed the agent storing the correction proactively (after adapting code, before Stop hook). The Stop hook then served as a safety net — agent said "already stored." But what happens if both UserPromptSubmit and Stop successfully trigger aide_remember?

Possible outcomes:
1. **Only one fires aide_remember** (what happened here) — clean, no duplication. The proactive call pre-empted the Stop nudge.
2. **Both fire aide_remember** — duplicate risk. The entries could be:
   - Redundant: same content stored twice → wasteful, pollutes recall
   - Complementary: UserPromptSubmit stores the raw correction, Stop stores the synthesized lesson → arguably useful
3. **Neither fires aide_remember** — both hooks too weak (didn't happen with MCP connected)

Design options if duplication becomes an issue:
- **Stop hook checks for recent aide_remember calls** — "if you already called aide_remember in the last 2 turns, skip"
- **Store deduplication at recall time** — `duplicateCheck()` handles it (ironic given the test prompt)
- **Different roles by design** — UserPromptSubmit stores corrections, Stop stores lessons. Accept both as valid if content differs.

**This test suggests option 1 (natural de-duplication) works with Opus — the agent is smart enough to not store twice.** But this needs more test runs to confirm it's not a fluke, and may not hold with weaker models.

**Token usage:** User needs to run `/context` in the test session before closing to capture this.

**Duration:**
- H-1: 34,990ms (~35s)
- H-2: 61,879ms (~62s) — correction + re-implementation + aide_remember call
- Total Suite 1: ~97s

**Strategic connection — go/no-go:**

Suite 1 answers: **"Can hooks make aide_remember fire?"** → **Yes.** The 0% adoption rate from all prior rounds (10 test prompts across Round 1 + Round 2) is now 100% for correction scenarios (1/1 correction stored). The MCP config fix was the critical blocker.

**Remaining question for Suite 2:** Does the stored knowledge actually influence a fresh session? Memory #39 ("keep data operations in the database layer") needs to surface via aide_recall in a new session and measurably change agent behavior. That's the money test.

---

### Things to Keep an Eye On (Mitigate If Issues Arise)

These aren't blockers right now, but could become problems at scale. Track here so we don't lose sight of them.

**1. Memory duplication over time**

In Suite 1, the agent self-de-duplicated (stored once, recognized "already stored" when Stop nudged). But this is one test run with Opus. Over many sessions, similar corrections could accumulate near-duplicate memories. For now, the agent seems smart enough — **don't add deduplication to every run unless we see it becoming a problem.**

If it does become a problem, mitigation options:
- Periodic agent-driven cleanup: spin up an agent job that runs `duplicateCheck()` and merges/archives duplicates
- Agent-driven codebase learning: an agent that reads a code area and fills memories proactively (not just from corrections)
- Both of these are "agent as memory janitor" — a follow-up improvement, not needed now

**2. "Nothing to store" UX noise**

After every task where the agent decides nothing is worth remembering, the user sees the Stop hook output: *"Nothing non-obvious to store — the method follows the exact same pattern as pruneOld..."* This is informative but could become noisy in daily use.

Mitigations to consider:
- Make the Stop hook output optional / suppressible (e.g., only show when something IS stored)
- Use Claude Code's hook `decision: "block"` vs `decision: "approve"` — only block (show to user) when there's something to store, approve silently when there isn't
- This is a UX polish item, not a blocker for the value prop test

**3. UserPromptSubmit hook visibility**

No `hook_progress` events appeared in JSONL for UserPromptSubmit across both voided and current suite. Need to determine if the hook fires at all or if JSONL just doesn't log it. Add debug logging to `detect-correction.sh` before Suite 2.

**4. Absolute vs relative path matching (FIXED, needs hardening)**

Discovered during Suite 2 Session 2A: Claude Code passes absolute paths to hooks, but memory scopes are relative. The `recall-for-path.js` script now strips the project root. This was a critical bug — without it, all scoped memories (the most valuable ones) were invisible to the agent. Fixed by converting absolute → relative before calling `recall()`. Also bumped recall limit from 10 → 20 to prevent guidelines layer truncation.

**Future hardening needed:** `scopeMatchesPath()` should be more robust — handle absolute paths natively, trailing slashes, case-insensitive matching on macOS/Windows, symlinks, monorepo subpaths. The current prefix-matching approach is fragile. This is a good candidate for proper glob matching (e.g., `minimatch` or `picomatch`) rather than hand-rolled string ops.

**Scope isolation model:** Memory DBs are project-specific (keyed by hash of project root path), so `src/utils/**` in project A won't collide with `src/utils/**` in project B. However, within a single project (especially monorepos), relative scopes can be ambiguous — `src/utils/**` would match `packages/app-a/src/utils/` AND `packages/app-b/src/utils/` if the project root is the monorepo root. Scopes need to be stored with enough path depth to be unambiguous within the project. The agent storing the memory controls the scope string, so this depends on agent behavior. Additionally, `projectPath` comes from `cwd` at session start — if the user starts `claude` from different directories within the same repo, the DB hash (and thus the entire memory store) changes. This means memories stored from the monorepo root aren't visible when starting from a subdirectory, and vice versa.

**5. Recall visibility — user can't see injected memories**

PreToolUse hook injects recalled memories as a system-reminder that the model sees but the user doesn't. In Session 2A re-run, the agent used `datetime()` and `logInfo` from recalled memories, but the user had no visibility that memories were injected — only behavioral evidence (the agent searching for `logInfo` import, using `datetime()` without being told). This is a UX gap:
- User can't verify what the agent "knows" from past sessions
- User can't debug when recall fails (as happened with the absolute path bug — invisible failure)
- Mitigations: show recalled memories in a collapsible UI section (like "1 PostToolUse hook ran" but for PreToolUse), or log them to a sidecar file, or have the agent explicitly mention "I'm using these recalled preferences: ..."

**6. Hook recall fallback to MCP aide_recall**

If the PreToolUse hook returns no scoped memories (only project-wide), the hook could add guidance like "No specific memories found for this path — consider calling aide_recall with related paths if you need more context." This would give the agent a chance to use the MCP tool as a fallback. Currently the agent trusts the hook injection and doesn't independently call aide_recall — if the hook fails silently (as it did with the absolute path bug), the agent has no safety net.

### Potential Improvements (Post-Validation)

These are enhancements to consider after the core value prop (cross-session persistence) is validated.

**1. Embeddings for smarter recall**

Currently recall uses path-scoped glob matching (exact path hierarchy). Adding embeddings could:
- **Help:** Recall semantically related memories even when paths don't match (e.g., a lesson about "database operations" surfacing when working in a new module that does DB work)
- **Help:** Better deduplication — semantic similarity catches paraphrased duplicates that LIKE matching misses
- **Risk:** Adds complexity (embedding model dependency, vector storage, latency). The existing `src/retrieval/semanticSearch.ts` pipeline exists but adds overhead.
- **Risk:** Could surface irrelevant memories if similarity threshold is too loose, adding noise to agent context
- **Verdict:** Path-scoped recall is the right starting point. Embeddings are a natural next step IF path scoping proves too rigid, but not before validating the core value prop.

**2. Agent-driven memory maintenance**

Use agents (not just hooks) to actively maintain the memory store:
- **Fill agent:** Reads a code area, generates memories about patterns/conventions it discovers. Useful for onboarding a new codebase.
- **Cleanup agent:** Runs periodically to merge duplicates, archive stale memories, verify memories still match the code.
- **Quality agent:** Reviews stored memories for accuracy against current codebase state. Code changes may invalidate old memories.
- These are all "agents operating on the memory layer" — a natural extension but depends on Suite 2 proving the basic loop works.

**3. Cross-tool code quality comparison**

Still untested. MVP round had methodology issues. Need a proper test: same prompt, same session type, with vs without aide-memory tools, comparing code output quality. Not the current focus (adoption/persistence is), but important for the full value story. This would need to be revisited with a better test setup.

**4. Memory visibility / management UX**

Currently memories live in SQLite, only viewable via `sqlite3` queries. This is fine for testing but not for real users. Considerations:
- **JSON export/view:** Dump memories to a JSON file users can browse. Low effort, but still a dev-oriented format.
- **Dashboard/UI:** Web-based viewer where users can see, search, edit, archive memories. Could filter by scope, layer, contributor. This is the "real product" UX but significant effort.
- **CLI commands:** `aide memories list`, `aide memories search "keyword"`, `aide memories forget 42`. Middle ground — stays in terminal, no web UI needed.
- **Team/multi-user:** If memories have `contributor` field, a dashboard could show "your memories" vs "team memories" — useful for shared codebases.
- **Stack:** SQLite stays as the storage layer regardless. UI/export layers sit on top. Don't change the storage stack just for presentation.
- **Priority:** After cross-session persistence is validated. No point building a dashboard for a feature that might not work.

**5. Read/write quality at scale — not thoroughly tested**

Our testing covered specific scenarios but did NOT stress-test the full read/write loop at scale:

**Write (aide_remember) — what we tested vs what we didn't:**
- ✅ Tested: agent stores corrections when prompted (Suite 1 H-2), stores taught rules proactively (Suite 2 Session 1), stores tech debt observations (Suite 2 Session 1 #41)
- ❌ Not tested: does the agent over-write? As the memory DB grows, does it store redundant/noisy entries? How well does the agent judge "this is worth remembering" vs "this is trivial"? In our tests the agent correctly said "nothing to store" for simple tasks — but we only ran 2-3 tasks. Over 50+ sessions, memory quality could degrade.
- ❌ Not tested: what happens when a stored memory becomes wrong? (code refactored, convention changed). Does the agent know to update/archive old memories, or does stale knowledge accumulate?

**Read (aide_recall) — what we tested vs what we didn't:**
- ✅ Tested: hook-injected recall influences agent behavior (Session 2A re-run proved this conclusively)
- ❌ Not tested: recall quality as DB grows. With 20 memories it works. With 200? 2000? Does the limit (currently 20) become a bottleneck? Do important memories get crowded out by less relevant ones?
- ❌ Not tested: agent proactively calling aide_recall as an MCP tool. In all our tests, the agent relied on the PreToolUse hook — it never called aide_recall independently. We don't know if the agent would use aide_recall proactively without hooks.
- ❌ Not tested: recall precision. Does the agent correctly apply recalled preferences, or does it sometimes misinterpret them? We saw correct application in our tests but the sample size is tiny.

**Bottom line:** We proved the read/write loop works mechanically and influences behavior. We have NOT proven it works well at scale, with growing/stale knowledge, or across diverse task types. This needs longitudinal testing — use aide-memory for real work over weeks and monitor memory quality.

**6. Expand memory scope beyond corrections**

Currently memories are mostly corrections and taught rules. Could expand to:
- **Conversation history:** Store summaries of past sessions (what was worked on, key decisions). Would help agents understand "what happened last time" without full context replay.
- **Code change summaries:** When agent makes changes, auto-store a memory of what was changed and why. Creates an "agent changelog" that persists.
- **Architectural decisions:** ADR-style records stored as memories. Agent can recall past decisions when working in the same area.
- **Risk:** Scope creep. More memory types = more noise in recall = more irrelevant context. Path-scoped recall helps, but need to be careful about signal-to-noise ratio.
- **Verdict:** Start with what works (corrections, rules, observations), expand if recall quality stays high.

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
| Session 1 ID | `fcb1011e-d990-44b7-9ca6-f871d722817f` |
| Called `aide_recall` before coding? | N — not as MCP tool. PreToolUse hook fired for Read(store.ts), injecting recall automatically. |
| Used sync API (no `await`)? | Y — `.prepare().run()` sync |
| Used `datetime()` SQL (not JS Date)? | **Y** — `datetime('now', '-' || ? || ' days')` ✅ |
| Added index on WHERE columns? | **N** — not applicable (no new tables created, method operates on existing `memories` table) |
| Followed status transition rule? | **Y** — `WHERE status = 'completed'` → sets `status = 'archived'` (completed→archived, no skip) ✅ |
| Adapted to logging correction? | **Y** — added `logInfo` import + `logInfo(\`expireCompleted: archived ${result.changes} memories...\`)` ✅ |
| Test uses vitest? | N/A — agent didn't write tests in this session (not asked in correction prompt) |
| Corrections needed (beyond intentional one) | 0 |
| **Stop hook fired?** | **Y** — fired 2x (after initial task + after correction). Both times hasOutput=True then False. |
| **aide_remember calls** | **3** |
| **`datetime()` preference stored?** | **Y** — memory #40 (bundled with all 3 rules) |
| **Index preference stored?** | **Y** — memory #40 (bundled) |
| **Status transition rule stored?** | **Y** — memory #40 (bundled) |
| **Logging correction stored?** | **Y** — memory #42 (separate, stored immediately on correction) |
| Notes | Agent also noticed existing `pruneOld` uses `new Date()` (the bad pattern) and stored tech debt note as memory #41. 3 memories total: #40 (taught rules), #41 (tech debt observation), #42 (logging correction). Agent self-de-duplicated on both Stop hook nudges. |

**aide_recall output received by agent:**
```
PreToolUse hook fired for Read(store.ts). Returned existing memories including:
- Layer ordering on output: area_context first, then technical, then preferences, then guidelines [src/memory/**]
- Plus ~20 lines of existing stored context
```

**Code produced (expireCompleted — final with logging):**
```ts
import { logInfo } from '../core/logger';

expireCompleted(days: number): number {
  const result = this.db.prepare(
    `UPDATE memories SET status = 'archived'
     WHERE status = 'completed'
       AND created_at < datetime('now', '-' || ? || ' days')`
  ).run(days);
  logInfo(`expireCompleted: archived ${result.changes} memories older than ${days} days`);
  return result.changes;
}
```

Note: Agent also flagged that `pruneOld` (line ~243) uses `new Date()` — the exact anti-pattern taught in the prompt. Asked user if they wanted it fixed.

**aide_remember calls (all 3):**
```json
// Memory #40 — stored BEFORE coding (proactive, on receiving the prompt)
{
  "what": "Never use `new Date()` for SQLite date comparison — use `datetime('now', '-N days')` in SQL. Always add an index on columns used in WHERE clauses for new tables. Status transitions go: active → completed → archived (never skip).",
  "layer": "technical",
  "scope": "src/memory/**",
  "why": "User-specified constraints for the memory store layer — date handling, indexing, and status transition rules."
}

// Memory #41 — stored on Stop hook nudge (agent-discovered tech debt)
{
  "what": "`pruneOld` method in store.ts (line ~243) uses `new Date()` for SQLite date comparison — violates the project rule. Should be refactored to use `datetime('now', '-' || ? || ' days')` like `expireCompleted`.",
  "layer": "area_context",
  "scope": "src/memory/store.ts",
  "why": "Known tech debt flagged during expireCompleted implementation. User was informed but hasn't opted to fix yet."
}

// Memory #42 — stored BEFORE adapting code (proactive, on receiving correction)
{
  "what": "Always log the count of affected rows when doing bulk operations — use `logInfo` from `src/core/logger`.",
  "layer": "guidelines",
  "scope": "src/memory/**",
  "why": "User-specified convention for observability in bulk store operations."
}
```

**DB verification:**
```
39|preferences|src/memory/**|Keep data operations in the database layer...  (Suite 1)
40|technical|src/memory/**|Never use new Date() for SQLite date comparison...
41|area_context|src/memory/store.ts|pruneOld method uses new Date()...
42|guidelines|src/memory/**|Always log the count of affected rows...
```

**Token usage session 1 (`/context`):**

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | 3.4k | 1.7% |
| System tools (built-in) | 17.4k | 8.7% |
| MCP tools (aide-memory) | 1.4k | 0.7% |
| Memory files (MEMORY.md + rules) | 1.1k | 0.5% |
| Skills | 164 | 0.1% |
| Messages (conversation) | 9.3k | 4.7% |
| Free space | 134k | 67.1% |
| Autocompact buffer | 33k | 16.5% |
| **Total used** | **30k / 200k** | **15%** |

Note: Session 1 used 30k total (vs 51k for Suite 1 which had 2 tasks). Messages were 9.3k — 2 prompts, 3 aide_remember calls, code edits, and Stop hook interactions. aide-memory overhead remains ~0.7%.

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

Results (RUN 1 — VOIDED due to recall bug):

| Dimension | Session 2A (AIDE+Hooks) |
|-----------|------------------------|
| Session 2A ID | `c1e8aa65-898a-4aa2-bb37-917d45f69654` |
| aide_recall fired (hook or proactive)? | Y — PreToolUse hook fired for both Read calls |
| Session 1 memories returned? | **NO — BUG** (see below) |
| Used sync API (no `await`)? | Y |
| Used `datetime()` SQL? | **N** — used `new Date(Date.now() - days * 86_400_000).toISOString()` |
| Logged affected row count? | **N** — no logInfo |
| Added index? | N/A (no new tables) |
| Used vitest? | Y — 26 tests pass (3 new) |
| Corrections needed | 0 |
| Stop hook fired? | Y — agent said "nothing to store" |
| aide_remember called? | N (0) |
| Notes | **VOIDED** — recall bug meant Session 1 memories weren't injected. Agent followed existing `pruneOld` pattern (which uses `new Date()`). |

**ROOT CAUSE: absolute vs relative path bug in `recall-for-path.js`**

The PreToolUse hook passes the file path from Claude Code's Read tool, which is **absolute** (e.g., `/Users/meky/code/aide-v0/src/memory/store.ts`). But memory scopes are stored as **relative** (e.g., `src/memory/**`). The `scopeMatchesPath()` function does prefix matching, so `src/memory/` never matches `/Users/meky/.../src/memory/store.ts`.

Result: recall returned only 11 generic `project`-scoped memories (branching, file size limits, etc.) — NOT the 9 scoped memories including #40 (datetime rule), #41 (pruneOld tech debt), #42 (logInfo guideline), #39 (SQL preference).

**Fix applied:** `recall-for-path.js` now strips the project root from absolute paths before calling `recall()`. Also bumped limit from 10 → 20 (guidelines layer was getting truncated at limit 10).

```js
// Convert absolute path to relative for scope matching
let relativePath = filePath;
if (path.isAbsolute(filePath) && filePath.startsWith(projectPath)) {
  relativePath = path.relative(projectPath, filePath);
}
```

**Verified fix:** After the fix, recall for `src/memory/store.ts` returns 20 memories including all Session 1 memories (#39-42).

**Code produced (for the record — doesn't reflect taught preferences due to bug):**
```ts
purgeArchived(days: number): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = this.db.prepare(
    'DELETE FROM memories WHERE status = ? AND created_at < ?'
  ).run('archived', cutoff);
  return result.changes;
}
```

**Session 2A needs to be re-run with the recall fix.** Reset code and start fresh.

**Reset code:**

```bash
git checkout -- src/
```

---

**Session 2A (Re-run) — AIDE+Hooks: Fresh session, recall fix applied**

Bug fix applied to `recall-for-path.js`:
- Convert absolute → relative path before calling `recall()`
- Bumped recall limit 10 → 20 (guidelines layer was truncated)

Additional finding from voided run: agent did NOT call `aide_recall` as an MCP tool — relied entirely on PreToolUse hook injection. This means the hook is the only recall pathway for non-proactive agents.

Start fresh: `claude`. AIDE + hooks active. Same prompt:

```
Add a method `purgeArchived(days: number)` to MemoryStore that permanently deletes archived memories older than N days. Write a vitest test.
```

Results:

| Dimension | Session 2A Re-run (AIDE+Hooks) |
|-----------|-------------------------------|
| Session 2A Re-run ID | `21418cd2-927e-44c6-9115-fdd7929f9be7` |
| aide_recall fired (hook or proactive)? | Y — PreToolUse hook fired for both Read calls. Agent did NOT call aide_recall as MCP tool. |
| Session 1 memories returned? | **Y — fix validated.** Memories #39-42 now included in recall output. |
| Used sync API (no `await`)? | Y — `.prepare().run()` sync |
| Used `datetime()` SQL? | **Y** — `datetime('now', '-' \|\| ? \|\| ' days')` ✅ (taught in Session 1, never mentioned in 2A prompt) |
| Logged affected row count? | **Y** — `logInfo(\`purgeArchived: deleted ${result.changes}...\`)` ✅ (taught in Session 1 correction, never mentioned in 2A prompt) |
| Added index? | N/A (no new tables) |
| Used vitest? | Y — 26 tests pass (3 new) |
| Corrections needed | 0 |
| Stop hook fired? | Y — agent said "conventions I followed were already captured in existing memories" |
| aide_remember called? | N (0) — correctly judged nothing new to store |
| Notes | Agent proactively searched for `logInfo` in `src/core/logger.ts` to find the import — it knew to use logInfo from recalled memories even though store.ts had no existing logInfo usage. Duration: 44,139ms. |

**aide_recall output received by agent (injected via PreToolUse hook, not visible in user UI):**

The hook injected 20 memories including Session 1 memories:
```
- [area_context] (src/memory/store.ts) `pruneOld` uses `new Date()` — violates project rule
- [technical] (src/memory/**) Never use `new Date()` for SQLite date comparison — use `datetime('now', '-N days')`
- [technical] (src/memory/**) SQLite uses WAL mode — never switch to DELETE journal mode
- [technical] (src/memory/**) better-sqlite3 is synchronous — do not use await with db calls
- [preferences] (src/memory/**) Keep data operations in the database layer — use SQL (LIKE, self-joins)
- [guidelines] (src/memory/**) Always log the count of affected rows — use `logInfo` from `src/core/logger`
... plus 14 project-wide memories (branching, file size, vitest, etc.)
```

Note: recalled memories are invisible to the user in the chat UI. The only evidence is behavioral — agent searched for `logInfo` import and used `datetime()` without being told.

**Code produced:**
```ts
import { logInfo } from '../core/logger';

purgeArchived(days: number): number {
  const result = this.db.prepare(
    "DELETE FROM memories WHERE status = 'archived' AND created_at < datetime('now', '-' || ? || ' days')"
  ).run(days);
  logInfo(`purgeArchived: deleted ${result.changes} archived memories older than ${days} days`);
  return result.changes;
}
```

Tests: 3 new (deletes old archived keeping active/recent, returns 0 when nothing qualifies, batch purge).

**Comparison: Voided 2A vs Re-run 2A (same prompt, same codebase):**

| Dimension | Voided 2A (broken recall) | Re-run 2A (fixed recall) |
|-----------|--------------------------|--------------------------|
| `datetime()` SQL | **NO** — `new Date(Date.now() - ...)` | **YES** — `datetime('now', '-' \|\| ? \|\| ' days')` |
| `logInfo` logging | **NO** — no import, no logging | **YES** — imported + used |
| Searched for logInfo? | No | Yes — `Grep('logInfo', 'src/core/logger.ts')` |
| Code pattern | Copied `pruneOld` verbatim | Wrote new pattern following taught rules |
| Duration | 54,716ms | 44,139ms (faster with right context) |

**This is the cross-session persistence proof.** The only difference between the two runs was the recall fix — same prompt, same codebase, same model. With correct recall, the agent applied Session 1 teachings without being told.

**Token usage session 2A re-run (`/context`):**

| Category | Tokens | % of context |
|----------|--------|------------|
| System prompt | 3.5k | 1.7% |
| System tools (built-in) | 17.4k | 8.7% |
| MCP tools (aide-memory) | 1.4k | 0.7% |
| Memory files (MEMORY.md + rules) | 1.1k | 0.5% |
| Skills | 164 | 0.1% |
| Messages (conversation) | 11.8k | 5.9% |
| Free space | 132k | 65.8% |
| Autocompact buffer | 33k | 16.5% |
| **Total used** | **34k / 200k** | **17%** |

**Reset code:**

```bash
git checkout -- src/
```

---

**Session 2B — Bare: Fresh session, same prompt, no memory**

```bash
# Disable hooks + MCP
cp .claude/settings.json .claude/settings.json.bak
echo '{}' > .claude/settings.json
mv .mcp.json .mcp.json.bak
# Also reset src/ from 2A
git checkout -- src/
```

Start fresh: `claude`. No hooks, no MCP, no aide-memory. Note session ID.

Same prompt:

```
Add a method `purgeArchived(days: number)` to MemoryStore that permanently deletes archived memories older than N days. Write a vitest test.
```

Results:

| Dimension | Session 2B (Bare) |
|-----------|-------------------|
| Session 2B ID | `ea04e979-869a-427a-980f-645ccc45e680` |
| Used sync API (no `await`)? | Y — `.prepare().run()` sync |
| Used `datetime()` SQL? | **N** — `new Date(Date.now() - days * 86_400_000).toISOString()` |
| Logged affected row count? | **N** — no logInfo, no logging at all |
| Added index? | N/A (no new tables) |
| Used vitest? | Y — 26 tests pass (3 new) |
| Corrections needed | 0 |
| Notes | Bare agent copied `pruneOld` pattern exactly (same `new Date()` approach). No hooks fired (none configured). No stop hook, no recall. `/mcp` confirmed "No MCP servers configured." Duration: 62,743ms. |

**Code produced:**
```ts
purgeArchived(days: number): number {
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
  const result = this.db.prepare(
    "DELETE FROM memories WHERE status = 'archived' AND created_at < ?"
  ).run(cutoff);
  return result.changes;
}
```

No `logInfo` import, no logging. Identical pattern to voided Session 2A (which also had broken recall).

**Token usage session 2B:** User did not run `/context`. No MCP tools, no memory files, no hooks — baseline would be ~21k (system prompt + tools + messages only).

**Restore after:**

```bash
mv .claude/settings.json.bak .claude/settings.json
mv .mcp.json.bak .mcp.json
git checkout -- src/
```

---

**Suite 2 Side-by-Side Comparison:**

| Dimension | Session 2A Re-run (AIDE+Hooks) | Session 2B (Bare) | Proves Value? |
|-----------|-------------------------------|-------------------|--------------|
| Used `datetime()` SQL | **YES** — `datetime('now', '-' \|\| ? \|\| ' days')` | **NO** — `new Date(Date.now() - ...)` | **YES — clear signal** |
| Logged row count | **YES** — `logInfo(...)` | **NO** — no logging | **YES — clear signal** |
| Added index | N/A | N/A | N/A |
| Used vitest | Y | Y | Both Y (readable from code) |
| Used sync API | Y | Y | Both Y (readable from code) |
| Corrections needed | 0 | 0 | Tie |
| Duration | 44,139ms | 62,743ms | AIDE faster (with right context) |
| Total tokens | 34k / 200k (17%) | ~21k estimated (no MCP/memory overhead) | Bare uses less (no MCP tools) |

**Key finding:** The two key signals (`datetime()` and `logInfo`) both differentiate. The AIDE+Hooks agent applied preferences taught in a previous session that the bare agent had no way to know about. The bare agent defaulted to copying the existing `pruneOld` code pattern — a reasonable approach, but one that perpetuates the `new Date()` anti-pattern the user specifically taught against.

**MCP Tool Call Summary (Suite 2 — all sessions):**

| Call # | Session | Tool | Trigger | Proactive? |
|--------|---------|------|---------|------------|
| 1 | S1 | `aide_remember` | On receiving taught rules (before coding) | **Yes** |
| 2 | S1 | `aide_remember` | Stop hook nudge (tech debt observation) | Stop-triggered |
| 3 | S1 | `aide_remember` | On receiving correction (before adapting) | **Yes** |
| — | S2A re-run | (none) | Relied on PreToolUse hook for recall | Hook-driven |

**Total MCP calls: 3 (all in Session 1). aide_remember: 3. aide_recall via MCP: 0 (all recall via hooks).**

**Interpreting results:**

- **AIDE uses taught patterns, Bare doesn't** → aide-memory proves cross-session value. This is the win condition.
- **Both use the patterns** → Agent discovers them from reading code. aide-memory doesn't add value for these patterns. Try with patterns that AREN'T discoverable from code (e.g., "use X library, not Y").
- **Neither uses the patterns** → Session 1 knowledge wasn't stored or wasn't recalled. Debug: check DB, check aide_recall output, check if context was injected.

**Result: Outcome 1 confirmed.** AIDE+Hooks agent used `datetime()` and `logInfo` from Session 1 memories. Bare agent copied `pruneOld`'s `new Date()` pattern with no logging. Cross-session persistence value prop validated.

### Suite 2 Observations

**What went well:**
- Cross-session persistence works end-to-end: teach → store → recall → apply.
- Agent applied 2/3 taught preferences without being told (`datetime()`, `logInfo`). The third (index on WHERE columns) was N/A for this task.
- Agent was faster with recalled context (44s vs 63s) — less exploration needed when you already know the conventions.
- Session 1 stored 3 well-structured memories across 3 different layers (technical, area_context, guidelines) with correct scoping.

**What went wrong (and was fixed):**
- **Critical bug:** absolute vs relative path matching in recall hook. Voided Session 2A entirely. Fixed by converting absolute → relative in `recall-for-path.js`.
- **Recall limit:** 10 was too low — guidelines layer got truncated. Bumped to 20.
- Both bugs meant the first Session 2A attempt was essentially a bare run despite having hooks enabled — scoped memories were invisible.

**What's uncertain:**
- Bare agent was slower (63s vs 44s) but also used a subagent for exploration. The speed difference may be coincidental rather than caused by memory availability.
- Agent never called `aide_recall` as an MCP tool — relied entirely on PreToolUse hook injection. If the hook fails, there's no fallback.
- Token overhead of aide-memory: ~3.5k (1.4k MCP tools + 1.1k memory files + ~1k hook-injected recall). Not significant at current scale.
- This test used preferences that ARE somewhat discoverable from code (the `new Date()` pattern exists in `pruneOld`). A stronger test would use preferences that can't be inferred from reading the codebase at all.

**Strategic answer: Should we continue building aide-memory?**

Suite 2 proves the core value loop works: knowledge taught in session 1 persists to session 2 and measurably changes agent behavior. The bare agent has no way to access cross-session preferences — it defaults to copying existing code patterns even when those patterns are exactly what the user taught against.

This is the differentiation. Platform-native memory (Claude's built-in) and competitors (ConPort) could replicate the storage, but the path-scoped recall + hook-driven injection is what makes it work without requiring agent cooperation. The agent doesn't need to "decide" to recall — the hook does it automatically.

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


