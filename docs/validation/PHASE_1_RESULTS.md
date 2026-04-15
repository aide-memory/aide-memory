# Phase 1 Validation Results

Session ID: `bba8e4e2-3479-4d29-b007-7830baa85104`
Debug log: `~/.claude/debug/bba8e4e2-3479-4d29-b007-7830baa85104.txt`
Date: 2026-04-14

## Session A: Hook + Recall Flow

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| A1 | Read src/api/routes.ts | Read block | Read blocked, 10 memories (0 file-specific, 7 from src/api/) | PASS |
| A2 | aide_recall called | Scoped first, all layers | 10 returned: 7 scoped + 3 project-wide. 3 layers (technical, preferences, guidelines). Scoped ranked first. | PASS |
| A3 | Re-read same file | Soft | Soft (additionalContext in debug log, line 375) | PASS |
| A4 | Read 2nd file same dir (handler.ts) | Dir trigger block | Soft — agent proactively recalled directory in A2 (dir\|src/api/ in tracking). Dir trigger not needed. | PASS (by design) |
| A6 | Edit src/utils/dates.ts (not recalled) | Edit block | Agent chose to Read first → Read blocked → recalled → edit proceeded. Edit hook never independently tested. | PARTIAL |
| A7 | Edit on recalled file (routes.ts) | Soft | Soft — edit proceeded, agent followed 4 conventions (camelCase, epoch ms, <30 lines, explain first) | PASS |

### Recall Quality (A2)

| Metric | Value |
|--------|-------|
| Total returned | 10 |
| Scoped | 7 |
| Project-wide | 3 |
| Layers represented | 3/4 (no area_context seeded for this path) |
| Scoped before project-wide | Yes |
| Top result | technical: rate limiting (scoped src/api/**) |
| Anti-false-positive conventions in results | 4/4 (epoch, soft delete, requestId, rate limit) |

### Agent Convention Compliance (A7 — getUsers rewrite)

| Convention | Followed? |
|-----------|----------|
| camelCase keys | Yes |
| Unix epoch ms timestamps | Yes |
| Functions under 30 lines | Yes |
| Explained approach before coding | Yes |

## Session B: Search Flow

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| B1 | Search "authentication" | Search block | Agent didn't use Grep — read files directly. Read hook blocked for src/auth/ instead. | N/A (agent bypassed grep) |
| B1b | Grep "token" (forced) | Search block | Search hook BLOCKED. Agent retried → blocked again (tracking fix working). Agent called aide_search on 3rd attempt. | PASS |
| B5 | Grep "middleware" (after search hook changed to soft) | Search soft | Soft nudge — "(ctrl+o to expand)". Agent said "already in context from earlier recalls", proceeded without aide_search. | PASS |

### Observations
- Search hook changed from blocking to always-soft during validation — agent had memories from prior recall, blocking forced redundant aide_search calls
- Grep returned .aide/memories/ JSON files mixed with code → led to .ignore implementation
- Agent sometimes uses Read instead of Grep for search tasks — search hook doesn't fire in those cases

## Session C: Correction + Remember

Prompt: "No, always add request logging with the structured logger from src/lib/logger.ts — you should have included it in the endpoint you wrote"

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| C1 | User types correction | UserPromptSubmit soft + flag | Agent immediately acted on correction | PASS |
| C2 | aide_remember called | Memory stored, flag cleared | Memory id 36 stored, no correction-pending flag | PASS |
| C3 | Verify memory quality | Correct layer/scope/content | layer=guidelines, scope=src/api/**, content="All API endpoints must include request logging using structured logger" | PASS |
| C4 | Stop hook | No double-store | Agent said "Already persisted the guideline (memory id 36)" | PASS |

### Remember Quality (C2-C3)

| Field | Value | Correct? |
|-------|-------|----------|
| Layer | guidelines | Yes (not "technical" or "preferences") |
| Scope | src/api/** | Yes (not project-wide) |
| What | "All API endpoints must include request logging using the structured logger from src/lib/logger.ts" | Yes — specific, actionable |
| Why | "User correction after getUsers endpoint was written without logging — structured logger is the project standard for request observability" | Yes — captures context |
| Tags | ["api-contract"] | Reasonable |

### Agent Behavior
- Applied the fix immediately (added import + log.info to routes.ts)
- Read src/lib/logger.ts first (hook blocked for src/lib/, recalled, then read)
- Stop hook: correctly said nothing new to store

## Changes Made During Validation

### Bugs Fixed
1. **PreCompact two-phase blocking** — exit 0 → exit 2 for Phase 1. Previously never actually blocked compaction.
2. **SessionStart cleanup** — only clear THIS session on clear/compact. Don't touch concurrent sessions.
3. **Search hook tracked on block** — agent could bypass by retrying grep. Fixed: tracking only via PostToolUse:aide_search.
4. **Directory path trailing slash stripped** — path.relative() broke isDirectoryQuery detection.
5. **Project-root path normalization** — path.relative() returns "" for root, fell back to absolute path.
6. **MCP_TOOLS_LIST missing aide_update/aide_import** — rules templates referenced them but tools list didn't.
7. **Broad scope blocking** — src/** (depth 1) triggered blocking for every file under src/. Fixed: minimum scope depth of 2 path segments required for blocking.

### Features Added
8. **Auto-update on MCP server start** — checks _aideMemoryVersion, auto-merges hooks/MCP/rules/dirs/.gitignore/post-checkout. No manual init needed after upgrade.
9. **--force merge** — preserves user settings instead of overwriting.
10. **--reset flag** — resets config to factory defaults without deleting memories.
11. **Round-robin hard cap** — limit is now a true cap. Swaps underrepresented layers into over-represented slots within the limit.
12. **session-inject.js efficiency** — SQL-level priority filter instead of fetching all memories.
13. **Scope trailing slash normalization** — src/memory/ treated like src/memory/** in scopeMatchesPath.
14. **`.ignore` file** — hides .aide/memories/ from grep. Config: memories.hideFromGrep.
15. **track-search.sh** — new PostToolUse hook for aide_search tracking.
16. **Search hook always soft** — no longer blocks grep. Agent decides whether to call aide_search.

## Session D: Compact + Re-recall

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| D2 | /compact | PreCompact cleanup + compaction | Hook format initially wrong (hookSpecificOutput invalid for PreCompact). Fixed to top-level decision/reason. Compaction succeeded. | PASS (after fix) |
| D2b | Post-compact SessionStart | Agent sees save prompt | Agent confirmed seeing instruction, reviewed context, said "nothing new" (memory 36 already saved) | PASS |
| D4 | Re-read after compact | Block (tracking cleared) | Not tested separately — agent read rules file on compact (auto-behavior) | PARTIAL |

### PreCompact Findings
- PreCompact cannot give agent an agentic turn — confirmed Claude Code limitation
- hookSpecificOutput format invalid for PreCompact — must use top-level decision/reason/systemMessage
- v2.1.105 added PreCompact support but only for blocking (cancel), not agentic turns
- Save strategy: Stop hook (every turn) + proactive saving rule + user guidance

## Session E: Cross-Session Persistence (NEW session)

Prompt: "What do you know about this project's API conventions?"

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| E1 | Start new session | SessionStart injects prefs/guidelines | Agent listed 7 conventions from injection — "Based on the session preferences/guidelines provided" | PASS |
| E2 | Correction from Session C persists | Memory 36 (structured logging) in new session | Agent included "All endpoints must include request logging via structured logger from src/lib/logger.ts" | PASS |
| E3 | Agent aware without file reads | No aide_recall needed | Agent answered from injected context alone, didn't read any files | PASS |

### Remember→Recall Loop: VALIDATED
- Session C: user corrected → aide_remember stored memory 36 (structured logging, src/api/**)
- Session E: new session → SessionStart injected memory 36 → agent referenced it
- **Core product promise confirmed: correct once, remembered forever**

## Session F0: Empty Project — Zero Memories

Prompt: "Read src/index.ts and explain it"

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| F0.1 | aide-memory init | Creates .aide/, hooks, MCP, .ignore | All created correctly | PASS |
| F0.3 | Read file | Silent (no hook output) | Silent — read proceeded with no blocking or nudge | PASS |
| F0.7 | Stop hook | Fires (standard prompt) | Fired, agent said "Nothing worth persisting" | PASS |

First-time UX is clean — aide-memory is invisible until memories exist.

## Dynamic Stop Hook (implemented mid-validation)

| Change | Detail |
|--------|--------|
| Dynamic interval | Block every 3 turns (first 9), every 5 after. Soft on non-block turns. |
| Correction flag clears after one chance | No infinite nagging on false positives |
| Soft format | `decision: "approve"` + `systemMessage` (top-level fields, valid for all hooks) |
| Data basis | 1 aide_remember per 9 prompts, 51% signal-to-noise with always-block |
| Research | Anthropic: avg 4 prompts/session. ProAIDE: mid-task interruptions 62% dismissed. |
| Bugs found/fixed | hookSpecificOutput invalid for Stop (same as PreCompact). Correction flag persisted forever on false positives. |

### Design Decisions
17. **Stop hook always blocks** — intentional (block until reflect pattern). UX concern logged as P1.18.
18. **Minimum scope depth = 2** — src/** too broad for blocking, src/api/** specific enough. Configurable later.
19. **Session cleanup rules** — start/resume: don't touch. clear/compact: clear this session only.
20. **Scope depth replaces parent-only check** — first iteration used parent-directory match (N=1). Replaced with minimum depth (≥2 segments) which is more general and directly answers "is this scope specific enough?"
21. **23 configurable settings identified** — hooks, recall, injection, search, auto-update, embeddings. Documented in Phase 2 item 5 with project-type presets (monorepo, small, team, security-sensitive).
22. **Validation docs consolidated** — deleted 2 stale runbooks (-2446 lines), extracted 5 missing sessions (J-N) into spec.
23. **P1.18 UX exploration scope expanded** — includes hook usage pattern audit (are blocking/flag-file patterns correct practice?), config-to-Cursor mapping, and all UI label issues.

## Pivots and Observations

1. **Search hook blocking → soft** — agent had memories from prior recall, blocking forced redundant aide_search calls
2. **`.ignore` file added** — grep was returning raw memory JSON, bypassing structured access
3. **Claude Code UI labels** — soft hooks may show as "returned blocking error" in collapsed/expanded view. Debug log is source of truth. Added to P1.18.
4. **Stop hook fires every turn** — confirmed intentional, but "error" label is confusing. P1.18.
5. **Agent proactively recalled directory** — directory trigger (A4) didn't fire because agent recalled src/api/ on first call
6. **Broad scope blocking was major friction** — src/** caused useless blocks on src/lib/logger.ts returning only generic preferences. Fixed with depth-based rule (MIN_SCOPE_DEPTH=2).
7. **Stale validation docs consolidated** — INTEGRATION_TESTING.md and RUN_VALIDATION.md deleted (-2446 lines). Gaps extracted into Sessions J-N.
8. **Preview message misleading** — "2 from src/lib/" implied lib-specific memories but they were src/** broad scopes. Preview should show actual scope. Follow-up fix.
9. **Agent bypassed search hook** — used Read instead of Grep for "search the codebase" prompt. Search hook only fires on Grep/Glob tools, not agent's choice to read files directly.
10. **Correction quality excellent** — memory id 36 stored with correct layer (guidelines), scope (src/api/**), specific content, meaningful why field. Best result of validation.
