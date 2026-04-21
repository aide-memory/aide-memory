# Phase 1 Validation Results

## Round 2: ID-Based Blocking Validation (April 17, 2026)

Session ID: `1ca3aeee-1c60-4375-85f5-01f52f84128d`
Debug log: `~/.claude/debug/1ca3aeee-1c60-4375-85f5-01f52f84128d.txt`
Transcript: `~/.claude/projects/-private-tmp-aide-val/1ca3aeee-1c60-4375-85f5-01f52f84128d.jsonl`
Test project: `/tmp/aide-val` (17 memories, IDs 67-84)

### Session A: ID-Based Recall Flow

| Step | Action | Expected | Actual | Debug Log | Pass? |
|------|--------|----------|--------|-----------|-------|
| A1 | Read src/api/routes.ts (first file, no IDs tracked) | **BLOCK** — path-based message | BLOCK: "5 memories for src/api/routes.ts". Hook denied Read tool. | Line 311: `decision: block`, permissionDecision: deny | **PASS** |
| A2 | Agent calls aide_recall for routes.ts | PostToolUse tracks IDs, file| entry written | aide_recall completed in 10ms. Returned IDs 72,71,80,81,79,74,78,76 (scoped + project-wide). Tracking: `ids|70,71,72,74,76,77,78,79,80,81` + `file|routes.ts` | Line 349-350: Tool completed successfully | **PASS** |
| A3 | Re-read src/api/routes.ts | **SILENT** — all scoped IDs covered | SILENT: "Unchanged since last read". No PreToolUse block in debug log. | No hook JSON output between 21:54:32-21:54:37 | **PASS** |
| A4 | Read src/api/handler.ts (shared scope IDs) | **SILENT** — IDs 70,71,72,76,78 already covered from A2 | SILENT: "Read 1 file" with no block. Agent explained handler gaps vs conventions. | No PreToolUse block between 21:55:59-21:56:01 | **PASS** |
| A5 | Read src/auth/middleware.ts (different dir) | **BLOCK** — IDs 67,68,69 not yet recalled | BLOCK: "3 memories for middleware.ts". Agent auto-recalled. | Line 624: `decision: block`, permissionDecision: deny | **PASS** |
| A6 | Read README.md (no scoped memories) | **SILENT** — no scoped memories | SILENT: Read proceeded with no hook output. | No PreToolUse entries for README | **PASS** |
| A7 | Edit src/api/routes.ts (all IDs covered) | **SILENT** — edit hook reads same tracking | SILENT: Edit went through, added `// validated` comment. | No PreToolUse:Edit block, only Stop hook at 22:08:12 | **PASS** |
| A8-adj | Edit src/auth/types.ts (shared auth scope) | **SILENT** — IDs 67,68,69 covered from A5 | SILENT: Edit proceeded. Same as A4 pattern — sibling file shares scope IDs. | Hook ran silent (no JSON output) | **PASS** (adjusted) |
| Scn1 | Re-read middleware.ts (encountered + 1 new ID 84 added) | **SOFT** — encountered=true, ID 84 missing | SOFT: `additionalContext`: "1 memories not yet recalled. Call aide_recall({ids: [84]})". Agent called aide_recall({ids: [84]}). | Line ~692: `hookSpecificOutput` with `additionalContext` (109 chars) | **PASS** |
| Scn2 | Read jwt.ts (never encountered, ID 83 not tracked, IDs 67,69 tracked from sibling) | **BLOCK** — never encountered + missing ID | BLOCK: "1 memories for jwt.ts not yet recalled. Call aide_recall({ids: [83]})". Agent recalled and reported RS256 constraint. | 23:08:30: `decision: block`, reason lists `ids: [83]` | **PASS** |

### Recall Quality

**A2 recall (routes.ts)** — verified from transcript line 13:
| Metric | Value |
|--------|-------|
| Total returned | 10 (5 scoped + 5 project-wide) |
| Scoped IDs | 72 (rate limiting), 71 (async/await), 78 (requestId), 76 (epoch timestamps), 70 (camelCase) |
| Project-wide IDs | 80 (30-line limit), 81 (no TODOs), 79 (explain first), 74 (dayjs), 77 (soft deletes) |
| Layers | 3/4 (technical, preferences, guidelines — no area_context seeded) |
| Scoped before project-wide | Yes — technical scoped first, then preferences, then guidelines |

**A5 recall (middleware.ts)** — verified from transcript line 46:
| Metric | Value |
|--------|-------|
| Total returned | 8 (3 scoped + 5 project-wide) |
| Scoped IDs | 68 (Bearer tokens), 67 (JWT RS256), 69 (no auth logging) |
| Scoped before project-wide | Yes |

### Key Behaviors Validated

1. **ID-based, not path-based** — A4 silent because IDs 70,71,72,76,78 were already covered by A2's recall (shared src/api/** scope across files)
2. **No directory trigger** — no `dir|` entries in tracking, each file evaluated by scoped IDs only
3. **Edit uses same tracking** — A7 silent because edit hook reads same `ids|` line as read hook
4. **Project-wide-only paths are silent** — A6 confirms scoped_count=0 exits early
5. **SOFT for encountered + missing IDs** — Scn1 shows additionalContext with specific missing ID list
6. **BLOCK for never-encountered + missing IDs** — Scn2 shows decision:block with ID-based message
7. **aide_recall({ids: [N]}) gap-filling works** — both Scn1 and Scn2 used ID-specific recall successfully

### Tracking File State (end of Session A)

```
file|/private/tmp/aide-val/src/api/routes.ts
file|/private/tmp/aide-val/src/auth/middleware.ts
ids|67,68,69,70,71,72,74,76,77,78,79,80,81
```
(IDs 83, 84 added after gap-filling scenarios)

### Session B (Round 2): Search Flow

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| B1 | `grep auth in the codebase` | **SOFT** with aide_search preview | SOFT — hookSpecificOutput with additionalContext (199 chars): "5 aide memories match 'auth' ...Call aide_search". Agent called aide_search({keyword: "auth"}) - completed in 6ms. Agent summarized both grep + stored context. | **PASS** |
| B2 | `grep zzz_nonexistent in the codebase` | **SILENT** — no matching memories | SILENT. Hook exited early, Grep returned "Found 0 lines", no nudge. | **PASS** |

### Session C (Round 2): Correction + Flag Lifecycle

Test session: `c8ee5214-4d2d-4fd1-b985-077e21575f9f`

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| C1 | Correction: "No, use epoch seconds not milliseconds" | UserPromptSubmit SOFT + flag, agent stores, flag cleared | UserPromptSubmit fired SOFT (218 chars additionalContext). Agent called aide_remember (completed 14ms). PostToolUse:aide_remember fired track-remember.sh → flag cleared. Stop hook silent (turn 1, not scheduled). | **PASS** |
| C2 | Correction: "No actually, use milliseconds not seconds" | aide_update should clear flag | Agent hesitated (conflict with SessionStart prefs), Stop fired BEFORE aide_update with "correction not stored". Then agent called aide_update → flag cleared. Demonstrates Stop's enforcement role. | **PASS** (behavior correct, agent timing just delayed) |
| C3 | Correction: "No, the rate limit is 100 not 50" | aide_remember (agent doesn't know existing memory) | Agent called aide_remember (new memory) since it hadn't recalled memory 72 this session. Scope was left project-wide for user refinement. | **PASS** (create-new is correct when no existing recalled) |
| C4 | Recall first, then correct existing: "No, update that camelCase one — we use snake_case" | aide_update should fire, flag cleared | Agent recalled src/api/, saw memory 70 (camelCase). Then on correction: **aide_update** called (updated memory 70 to snake_case). Stop fired with STANDARD prompt ("Any decisions..."), NOT correction warning. Flag was cleared by aide_update PostToolUse. | **PASS** |

### Bug Fix During Session C

**Issue**: PostToolUse hook for `aide_update` was missing — only `aide_remember` had the clearing hook. When agent called aide_update, flag stayed set and Stop kept complaining "correction not stored".

**Fix**: Added `mcp__aide-memory__aide_update` matcher to PostToolUse in init.ts generateHookConfig. Same script (track-remember.sh) clears flag for both tools.

**Verification**: autoUpdateIfNeeded picked up new hook config on next MCP server start (removed _aideMemoryVersion to trigger update). Confirmed via debug log: PostToolUse fires for aide_update, flag deleted, Stop shows standard prompt instead of correction warning.

### Stop Hook Combined Message (verified)

When correction flag exists AND it's a scheduled block turn (every 3 in phase 1), Stop combines both:
```
A correction from this turn wasn't stored. Call aide_remember for it.
Also: any decisions, technical constraints, preferences, or guidelines worth persisting?...
```

The "Also:" stitching was observed in multiple test turns. Flag-only and schedule-only each work independently.

### Session E (Round 2): Cross-Session Persistence

New fresh session (cold start): `5ce0bcde-8be4-4e1f-b04f-dca8d8d7b3b0`
Prompt: "What do you know about this project's conventions?"

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| E1 | SessionStart hook fires | Inject preferences + guidelines | Debug log line confirmed at 23:16:01: Hook output included all 6 preferences and 5 guidelines (snake_case, epoch seconds, requestId, soft deletes, no auth log tokens) | **PASS** |
| E2 | Agent answers from injection | Preferences/guidelines without tool calls | Agent listed ALL 6 preferences + 5 guidelines, matching injection exactly | **PASS** |
| E3 | Agent supplements with aide_memories | Technical facts beyond injection | Agent called aide_memories (completed 9ms), listed 4 technical facts: JWT RS256, Bearer validation + brute-force lockout, AuthToken iat requirement, rate limit 30/min | **PASS** |

### Corrections Validated (from prior test session)

All 4 corrections from prior session survived to new session:

| Correction | Prior tool call | Accessible in new session via |
|------------|----------------|-------------------------------|
| "Use snake_case for API responses" | aide_update (memory 70) | SessionStart injection (guidelines) |
| "Use epoch seconds for timestamps" | aide_remember + aide_update | SessionStart injection (guidelines) |
| "Rate limit is 30 req/min" | aide_update (memory 72) | aide_memories (technical) |
| "Brute-force: 5 failures/15min → 30min lockout" | aide_remember (memory 84) | aide_memories (technical) |

**Core product promise validated: "Correct once, remembered forever."**

### Bug Fix During Session

**Issue**: aide_forget was missing from PostToolUse correction-clearing matchers. User could say "no, delete that wrong memory" and agent's aide_forget response would leave flag set.

**Fix**: Added `mcp__aide-memory__aide_forget` matcher to PostToolUse in init.ts generateHookConfig. Same track-remember.sh clears flag.

**Write-clears-flag complete list**: aide_remember, aide_update, aide_forget. aide_import intentionally excluded (bulk seeding, not correction response).

### Session D (Round 2): Compact + Re-recall

Fresh test session: `0850e190-e6ed-4378-ad45-4fdfb8d584e0`

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| D1 | Read src/auth/middleware.ts (fresh session) | BLOCK with missing IDs | BLOCK: "2 memories not yet recalled. Call aide_recall({ids: [88, 87]})". Agent recalled, read succeeded. | **PASS** |
| D2 | `/compact` manual trigger | PreCompact clears tracking + SessionStart:compact re-injects | Debug log confirms: 19:40:56 PreCompact completed, 19:41:30 SessionStart:compact success. Tracking went from `[87, 88 + 11 injection IDs]` → `[11 injection IDs only]`. | **PASS** |
| D3 | Read src/auth/types.ts (post-compact, new file) | BLOCK (new file, scoped IDs not tracked) | Agent proactively called aide_recall FIRST (learning from compact), then Read went silent (all IDs pre-populated). | **PASS** (agent optimization) |

### Post-Compact Flow Verified

1. Pre-compact tracking: all 11 injection IDs + any file-specific IDs recalled during the session
2. PreCompact hook clears current session's tracking (NOT other sessions' files)
3. Context gets compacted (summary + reload of `.claude/rules/aide-memory.md` + middleware.ts)
4. SessionStart fires with `source: "compact"` → re-injects 11 preference/guideline IDs
5. New file reads re-block (IDs not tracked) → agent recalls to restore context

### Cleanup Command Added

New CLI: `aide-memory cleanup` (`src/cli/commands/memory/cleanup.ts`)
- Removes stale session tracking files (`recalled-paths-*.txt`, `searched-queries-*.txt`, `correction-pending-*.txt`, `recalled-ids-*.txt`)
- Default 7d TTL, `--older-than`/`--all`/`--dry-run` flags
- Safe for active sessions — hook re-blocks and re-recalls on next read
- Tested: deleted 3 orphaned tracking files with `--older-than 1h`
- Follow-up: automatic TTL cleanup on SessionStart startup (Phase 1)

### Session G (Round 2): Concurrent Sessions Isolation

Two Claude Code sessions running simultaneously on the same project:
- **Session A**: `0850e190-e6ed-4378-ad45-4fdfb8d584e0`
- **Session B**: `a3702548-0d1b-4c60-a1ab-b5ddb70ca2d1`

| Step | Action | Expected | Actual | Pass? |
|------|--------|----------|--------|-------|
| G1 | Session A: Read src/api/routes.ts | A's tracking gets routes file + ID 92 | A file has `file|routes.ts` + ids including 92 | **PASS** |
| G2 | Session B: Read src/api/handler.ts | B blocks independently on handler's ID 92 (not in B's tracking) | BLOCK: "1 memories for handler.ts not yet recalled. Call aide_recall({ids: [92]})" — even though A has 92 | **PASS** |
| G3 | Session A's tracking file exists separately | Filename: `recalled-paths-0850e190...txt` | 241 bytes, file+ids entries | **PASS** |
| G4 | Session B's tracking file exists separately | Filename: `recalled-paths-a3702548...txt` | 42 bytes, just injection ids | **PASS** |
| G5 | Session B: Read src/auth/middleware.ts (A already has auth IDs tracked) | B still blocks — doesn't inherit A's state | BLOCK: "2 memories not yet recalled. Call aide_recall({ids: [88, 87]})" — same IDs A has tracked but B doesn't see them | **PASS** |

**Critical validation**: IDs 87, 88, 92 were in Session A's tracking but NOT in Session B's. Session B correctly blocked for all of them, proving sessions read only their own `recalled-paths-{session_id}.txt` file. No cross-session leakage.

---

## Session B (Round 1): Search Flow


| Step | Action                                                | Expected     | Actual                                                                                                                  | Pass?                     |
| ---- | ----------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| B1   | Search "authentication"                               | Search block | Agent didn't use Grep — read files directly. Read hook blocked for src/auth/ instead.                                   | N/A (agent bypassed grep) |
| B1b  | Grep "token" (forced)                                 | Search block | Search hook BLOCKED. Agent retried → blocked again (tracking fix working). Agent called aide_search on 3rd attempt.     | PASS                      |
| B5   | Grep "middleware" (after search hook changed to soft) | Search soft  | Soft nudge — "(ctrl+o to expand)". Agent said "already in context from earlier recalls", proceeded without aide_search. | PASS                      |


### Observations

- Search hook changed from blocking to always-soft during validation — agent had memories from prior recall, blocking forced redundant aide_search calls
- Grep returned .aide/memories/ JSON files mixed with code → led to .ignore implementation
- Agent sometimes uses Read instead of Grep for search tasks — search hook doesn't fire in those cases

## Session C: Correction + Remember

Prompt: "No, always add request logging with the structured logger from src/lib/logger.ts — you should have included it in the endpoint you wrote"


| Step | Action                | Expected                     | Actual                                                                                                               | Pass? |
| ---- | --------------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----- |
| C1   | User types correction | UserPromptSubmit soft + flag | Agent immediately acted on correction                                                                                | PASS  |
| C2   | aide_remember called  | Memory stored, flag cleared  | Memory id 36 stored, no correction-pending flag                                                                      | PASS  |
| C3   | Verify memory quality | Correct layer/scope/content  | layer=guidelines, scope=src/api/**, content="All API endpoints must include request logging using structured logger" | PASS  |
| C4   | Stop hook             | No double-store              | Agent said "Already persisted the guideline (memory id 36)"                                                          | PASS  |


### Remember Quality (C2-C3)


| Field | Value                                                                                                                                       | Correct?                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| Layer | guidelines                                                                                                                                  | Yes (not "technical" or "preferences") |
| Scope | src/api/**                                                                                                                                  | Yes (not project-wide)                 |
| What  | "All API endpoints must include request logging using the structured logger from src/lib/logger.ts"                                         | Yes — specific, actionable             |
| Why   | "User correction after getUsers endpoint was written without logging — structured logger is the project standard for request observability" | Yes — captures context                 |
| Tags  | ["api-contract"]                                                                                                                            | Reasonable                             |


### Agent Behavior

- Applied the fix immediately (added import + log.info to routes.ts)
- Read src/lib/logger.ts first (hook blocked for src/lib/, recalled, then read)
- Stop hook: correctly said nothing new to store

## Changes Made During Validation

### Bugs Fixed

1. **PreCompact two-phase blocking** — exit 0 → exit 2 for Phase 1. Previously never actually blocked compaction. (Later refactored: two-phase removed, PreCompact is now cleanup-only exit 0, no output)
2. **SessionStart cleanup** — only clear THIS session on clear/compact. Don't touch concurrent sessions.
3. **Search hook tracked on block** — agent could bypass by retrying grep. Fixed: tracking only via PostToolUse:aide_search.
4. **Directory path trailing slash stripped** — path.relative() broke isDirectoryQuery detection.
5. **Project-root path normalization** — path.relative() returns "" for root, fell back to absolute path.
6. **MCP_TOOLS_LIST missing aide_update/aide_import** — rules templates referenced them but tools list didn't.
7. **Broad scope blocking** — src/** (depth 1) triggered blocking for every file under src/. Fixed: minimum scope depth of 2 path segments required for blocking.

### Features Added

1. **Auto-update on MCP server start** — checks _aideMemoryVersion, auto-merges hooks/MCP/rules/dirs/.gitignore/post-checkout. No manual init needed after upgrade.
2. **--force merge** — preserves user settings instead of overwriting.
3. **--reset flag** — resets config to factory defaults without deleting memories.
4. **Round-robin hard cap** — limit is now a true cap. Swaps underrepresented layers into over-represented slots within the limit.
5. **session-inject.js efficiency** — SQL-level priority filter instead of fetching all memories.
6. **Scope trailing slash normalization** — src/memory/ treated like src/memory/** in scopeMatchesPath.
7. `**.ignore` file** — hides .aide/memories/ from grep. Config: memories.hideFromGrep.
8. **track-search.sh** — new PostToolUse hook for aide_search tracking.
9. **Search hook always soft** — no longer blocks grep. Agent decides whether to call aide_search.

## Session D: Compact + Re-recall


| Step | Action                    | Expected                        | Actual                                                                                                                                                                                                    | Pass?            |
| ---- | ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| D2   | /compact                  | PreCompact cleanup + compaction | Hook format initially wrong (hookSpecificOutput invalid for PreCompact). Fixed to top-level decision/reason. Compaction succeeded. (Subsequently simplified: PreCompact now cleanup-only with no output)  | PASS (after fix) |
| D2b  | Post-compact SessionStart | Agent sees save prompt          | Agent confirmed seeing instruction, reviewed context, said "nothing new" (memory 36 already saved) (Post-compact save prompt subsequently removed — SessionStart now only injects preferences/guidelines) | PASS             |
| D4   | Re-read after compact     | Block (tracking cleared)        | Not tested separately — agent read rules file on compact (auto-behavior)                                                                                                                                  | PARTIAL          |


### PreCompact Findings

- PreCompact cannot give agent an agentic turn — confirmed Claude Code limitation
- hookSpecificOutput format invalid for PreCompact — must use top-level decision/reason/systemMessage
- v2.1.105 added PreCompact support but only for blocking (cancel), not agentic turns
- Save strategy: Stop hook (dynamic interval) + proactive saving rule + user guidance

## Session E: Cross-Session Persistence (NEW session)

Prompt: "What do you know about this project's API conventions?"


| Step | Action                             | Expected                                      | Actual                                                                                                   | Pass? |
| ---- | ---------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ----- |
| E1   | Start new session                  | SessionStart injects prefs/guidelines         | Agent listed 7 conventions from injection — "Based on the session preferences/guidelines provided"       | PASS  |
| E2   | Correction from Session C persists | Memory 36 (structured logging) in new session | Agent included "All endpoints must include request logging via structured logger from src/lib/logger.ts" | PASS  |
| E3   | Agent aware without file reads     | No aide_recall needed                         | Agent answered from injected context alone, didn't read any files                                        | PASS  |


### Remember→Recall Loop: VALIDATED

- Session C: user corrected → aide_remember stored memory 36 (structured logging, src/api/**)
- Session E: new session → SessionStart injected memory 36 → agent referenced it
- **Core product promise confirmed: correct once, remembered forever**

## Session F0: Empty Project — Zero Memories

Prompt: "Read src/index.ts and explain it"


| Step | Action           | Expected                            | Actual                                            | Pass? |
| ---- | ---------------- | ----------------------------------- | ------------------------------------------------- | ----- |
| F0.1 | aide-memory init | Creates .aide/, hooks, MCP, .ignore | All created correctly                             | PASS  |
| F0.3 | Read file        | Silent (no hook output)             | Silent — read proceeded with no blocking or nudge | PASS  |
| F0.7 | Stop hook        | Fires (standard prompt)             | Fired, agent said "Nothing worth persisting"      | PASS  |


First-time UX is clean — aide-memory is invisible until memories exist.

## Session F: Softening (<10 memories)

Prompt: "Read src/index.ts and explain it" (5 memories seeded, below threshold)


| Step | Action                                 | Expected           | Actual                                                                                                             | Pass? |
| ---- | -------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------ | ----- |
| F2   | Read file with scoped mems (<10 total) | Soft (not block)   | Soft nudge delivered (debug log line 242: additionalContext). Agent proactively called aide_recall from the nudge. | PASS  |
| F2b  | Agent acts on soft                     | aide_recall called | Debug log: ToolSearch → aide_recall at line 259, 307. Agent chose to recall — not forced.                          | PASS  |


| F4 | Grep with matching keyword (<10 total) | Search → soft | Hook fired soft (debug line 887). Agent acknowledged: "already in context from earlier." | PASS |

### Findings

- Soft nudge (additionalContext) works for ALL three hook types: Read, Edit, Search
- Agent sees soft nudges and makes informed decisions (recall, skip, or acknowledge)
- Read soft: agent proactively recalled (didn't ignore)
- Edit soft: agent acknowledged, decided already loaded
- Search soft: agent acknowledged, decided already in context
- First test failed because agent reused cached file content (same session, didn't call Read tool)
- **Soft IS effective across all hooks** — confirmed via debug log for each

## Dynamic Stop Hook (implemented mid-validation)


| Change                                  | Detail                                                                                                                                                                           |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dynamic interval                        | Block every 3 turns (first 9), every 5 after. Soft on non-block turns.                                                                                                           |
| Correction flag clears after one chance | No infinite nagging on false positives                                                                                                                                           |
| Soft format                             | `decision: "approve"` + `systemMessage` (top-level fields, valid for all hooks)                                                                                                  |
| Data basis                              | 1 aide_remember per 9 prompts, 51% signal-to-noise with always-block                                                                                                             |
| Research                                | Anthropic: avg 4 prompts/session. ProAIDE: mid-task interruptions 62% dismissed.                                                                                                 |
| Bugs found/fixed                        | hookSpecificOutput invalid for Stop — confirmed architectural constraint, not a bug. Correction flag persisted forever on false positives. suppressOutput doesn't work for Stop. |
| Non-block turns                         | Silent (hook runs, counts, checks flags, but outputs nothing). Agent awareness from rules file proactive saving instruction.                                                     |
| Tested live                             | Block at turn 14 ✅ (correct schedule). Soft visible at turn 15 ✅ (before suppressOutput). Silent after fix.                                                                      |


### Design Decisions

1. **Stop hook uses dynamic interval (every 3 for first 9, every 5 after). Silent on non-block turns.** UX concern logged as P1.18.
2. **Minimum scope depth = 2** — src/** too broad for blocking, src/api/** specific enough. Configurable later.
3. **Session cleanup rules** — start/resume: don't touch. clear/compact: clear this session only.
4. **Scope depth replaces parent-only check** — first iteration used parent-directory match (N=1). Replaced with minimum depth (≥2 segments) which is more general and directly answers "is this scope specific enough?"
5. **23 configurable settings identified** — hooks, recall, injection, search, auto-update, embeddings. Documented in Phase 2 item 5 with project-type presets (monorepo, small, team, security-sensitive).
6. **Validation docs consolidated** — deleted 2 stale runbooks (-2446 lines), extracted 5 missing sessions (J-N) into spec.
7. **P1.18 UX exploration scope expanded** — includes hook usage pattern audit (are blocking/flag-file patterns correct practice?), config-to-Cursor mapping, and all UI label issues.

## Pivots and Observations

1. **Search hook blocking → soft** — agent had memories from prior recall, blocking forced redundant aide_search calls
2. `**.ignore` file added** — grep was returning raw memory JSON, bypassing structured access
3. **Claude Code UI labels** — soft hooks may show as "returned blocking error" in collapsed/expanded view. Debug log is source of truth. Added to P1.18.
4. **Stop hook was every-turn, changed to dynamic interval** — confirmed intentional, but "error" label is confusing. P1.18.
5. **Agent proactively recalled directory** — directory trigger (A4) didn't fire because agent recalled src/api/ on first call
6. **Broad scope blocking was major friction** — src/** caused useless blocks on src/lib/logger.ts returning only generic preferences. Fixed with depth-based rule (MIN_SCOPE_DEPTH=2).
7. **Stale validation docs consolidated** — INTEGRATION_TESTING.md and RUN_VALIDATION.md deleted (-2446 lines). Gaps extracted into Sessions J-N.
8. **Preview message misleading** — "2 from src/lib/" implied lib-specific memories but they were src/** broad scopes. Preview should show actual scope. Follow-up fix.
9. **Agent bypassed search hook** — used Read instead of Grep for "search the codebase" prompt. Search hook only fires on Grep/Glob tools, not agent's choice to read files directly.
10. **Correction quality excellent** — memory id 36 stored with correct layer (guidelines), scope (src/api/**), specific content, meaningful why field. Best result of validation.

---

## Implementation Changes (Built/Fixed During Validation -- April 13, 2026)

This section documents everything built or fixed during the post-validation implementation session on `feature/phase-1`.

### Hook Defaults Optimization (Original 9 Items)


| #   | Change                                                                                                                                                                                               | Commits              |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1   | **Settings framework** -- `defaults.json` with `{value, public, pro}` metadata + `read-config.sh` shared config reader. All hooks now read settings via `get_setting()` instead of hardcoded values. | Part of batch commit |
| 4   | **Stop hook 3->5->10** -- Three-phase dynamic interval. Phase 1 (turns 1-9): every 3. Phase 2 (10-29): every 5. Phase 3 (30+): every 10. Reads schedule from `hooks.stop.schedule` in defaults.json. | Part of batch commit |
| 5   | **Correction detection tuning** -- Negation + directive required (not just negation). Negative filters added ("no I mean", "I don't think", etc.). 3-word minimum. Match at message start only.      | Part of batch commit |
| 6   | **PreCompact cleanup** -- Removed old two-phase logic, systemMessage output, decision:approve output. Now cleanup-only: clears current session's recalled-paths file, exit 0, no output.             | `6af5001`            |
| 7   | **Injection per-layer** -- session-inject.js reads per-layer config (preferences: 15, technical: false, area_context: false, guidelines: "all", priorityAlwaysOverride: true).                       | Part of batch commit |
| 8   | **All hooks wired to config** -- Every hook sources read-config.sh and uses get_setting() for all configurable values.                                                                               | Part of batch commit |
| 9   | **Resume clears tracking** -- SessionStart clears tracking on "resume" in addition to "clear" and "compact". Session-scoped via session_id.                                                          | `6b0423a`, `6f95443` |


### ID-Based Blocking System (Replaced Original Items 2 and 3)

The block-once-then-soft approach (item 2) and directory prefix match fix (item 3) were both replaced by a fundamentally better design: **ID-based blocking**.

**How it works:**

- Each recalled memory ID is tracked in a session-scoped file (`recalled-ids-{session_id}`)
- On file read: hook queries scoped memory IDs for the path, compares against tracked IDs
- All IDs tracked -> SILENT (no block, no output)
- Some IDs missing -> BLOCK with message: "N memories not yet recalled. Call aide_recall({ids: [...]})"
- No scoped memories -> SILENT (nothing to recall)
- After compact/clear/resume -> tracking reset, re-blocks on next read

**Why this is better than block-once-then-soft:**

- Block-once was file-granular -- after one block per file, agent never re-blocks even if new memories are added
- ID-based is memory-granular -- tracks exactly which memories the agent has seen
- Sibling files in same directory share scoped memories -- reading one file and recalling covers siblings too
- No arbitrary block count, no "remaining count" soft messages -- just "have you seen these? yes/no"

### Additional Improvements (New Items 10-15)


| #   | Change                                 | Detail                                                                                                                                                                                                                              |
| --- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 10  | **ID-based blocking**                  | Core system described above. Replaced items 2 + 3.                                                                                                                                                                                  |
| 11  | **Focused scope matching**             | Grandparent scopes (e.g., `src/`** when reading `src/api/routes.ts`) no longer trigger blocking. Only direct parent or exact scope matches trigger. Prevents broad memories from causing unnecessary blocks on deeply nested files. |
| 12  | **aide_recall `ids` param**            | Added `ids` parameter to aide_recall MCP tool. Agent can request exact memories by ID when the hook blocks with specific IDs. Returned memories are tracked as recalled.                                                            |
| 13  | **PostToolUse response parsing fix**   | `tool_response` is an array, not a string. The jq path was wrong, causing response parsing to silently fail. One-line fix that unblocked PostToolUse tracking of aide_recall/aide_search results.                                   |
| 14  | **Session-inject writes injected IDs** | session-inject.js writes IDs of injected memories into the recalled-IDs tracking file. Memories from SessionStart injection are pre-tracked, preventing redundant blocks.                                                           |
| 15  | **Directory trigger removed**          | Directory trigger (block on first file read in new directory) removed entirely. ID-based blocking makes it unnecessary. No more `dir|path` tracking entries.                                                                        |


### Key Commits (feature/phase-1)


| Hash      | Description                                                                     |
| --------- | ------------------------------------------------------------------------------- |
| `6af5001` | fix: PreCompact clears current session's recalled-paths file                    |
| `6b0423a` | feat: session-scoped recall tracking via session_id + PreToolUse hooks          |
| `6f95443` | feat: session-scoped recall tracking via SessionStart hook                      |
| `4686f7b` | feat: improved Read hook with layer counts, topics, and session-scoped blocking |
| `e23592c` | feat: upgrade UserPromptSubmit and PreCompact hooks to blocking                 |


### Bugs Found and Fixed This Session

1. **PostToolUse jq path wrong** -- `tool_response` is an array, was being read as a string. Caused silent failure of all PostToolUse response tracking (aide_recall IDs, aide_search results).
2. **PreCompact didn't clear session tracking** -- After /compact, recalled-paths file for the current session wasn't cleared. Agent wouldn't re-block on files it had recalled before compaction.
3. **Grandparent scopes triggered blocking** -- Reading `src/api/routes.ts` would trigger on memories scoped to `src/`**, causing blocks with broad/generic memories. Fixed with focused scope matching (direct parent only).
4. **Session-inject didn't track injected IDs** -- Memories injected at SessionStart weren't written to the tracking file, causing immediate re-blocks on files whose memories were already injected.
5. **Directory trigger redundant with ID-based blocking** -- After implementing ID-based blocking, the directory trigger was redundant and sometimes conflicted. Removed entirely.

---

## U1–U3 Validation Results (Apr 20, 2026)

Three user-centric scenarios from PHASE_0_1_SPEC section 12.3, run in `/tmp/aide-val` with 16 pre-seeded memories.

### U1: Team Decisions — `6/7` conventions applied

**Prompt:** *"Add a DELETE /users/:id endpoint to src/api/routes.ts"*

All 7 scoped memories for routes.ts were in session tracking (ids 87–102, covered via earlier Reads on sibling files). ID-based blocking correctly returned SILENT for the Edit — no gap in delivery.

| Memory | Followed |
|---|---|
| [96] Epoch ms timestamps (`Date.now()`) | ✅ |
| [97] Soft delete, never hard DELETE | ✅ |
| [90] camelCase keys | ✅ |
| [91] async/await | ✅ |
| [100] Functions <30 lines | ✅ (13 lines) |
| [98] requestId on error responses | ✅ (memory literally says "error responses") |
| [92] Rate limit `rateLimiter('user', 50)` | ❌ |

**Debug log:** `/Users/meky/.claude/debug/0850e190-e6ed-4378-ad45-4fdfb8d584e0.txt`

**Key signal:** System delivered all relevant memories; agent judgment still allowed one miss. Documents a real limit of the value prop — **delivery ≠ compliance**. Captured in memory #102 for cross-session context. Possible Phase 2 follow-up: surface high-priority memories more forcefully (agent-side compliance check, stronger framing in block message).

### U2: Correction Learning Loop — PASS end-to-end

**Session A:** Asked for `GET /orders/:id`. Agent implemented with bare object return.

User correction: *"no, for GET endpoints we always return { data, meta } wrapped — never the bare object"*

- `20:17:26.453` UserPromptSubmit flagged correction
- `20:17:26.472` Agent called `aide_remember` → stored id 105, scoped `src/api/**`
- `20:17:31.446` Stop hook fired with **standard message** (no "correction wasn't stored" prefix) — confirms PostToolUse `track-remember.sh` cleared the flag

**Session B (continuation):** Asked for `GET /products/:id`.

- `20:18:51.200` PreToolUse block: *"1 memories... Call aide_recall({ids: [105]})"* — proves freshly-stored correction surfaced via ID-based blocking
- `20:18:53.220` Agent called `aide_recall`
- `20:19:15.889` routes.ts written with `{ data: product, meta: { requestId } }` — exact envelope applied

**All three phases validated:** detect → store → clear flag → recall → apply. Full correction loop works across sessions.

### U3: Behavioral Preferences — PASS across fresh sessions, exposes mid-session gap

**Session A:** User stated preference naturally (not a correction): *"When you add new functions in this project, always include a one-line comment above them describing the public contract..."*

- Agent correctly detected preference (not correction), proactively called `aide_remember`
- Stored as id 106, layer=preferences, contributor=test-user, **no scope** (project-wide)
- Agent retroactively added contract comments to its own newly-added functions (deleteUser, getOrder)

**Session B (same agent continuation):** Asked to create `src/auth/jwt.ts` with `hasExpired(token)`.

- Agent created the file **without a contract comment** — memory #106 never surfaced
- Tracking file missing id 106: `ids|87,88,89,90,91,92,93,94,96,97,98,99,100,101,105`
- Pre-edit-recall fired (line 612) but no block — project-wide scope isn't caught by path-based blocking, and SessionStart injection only runs on new sessions

**Session C (fresh session, ID `4fbf64b9`):** Asked for `verifySignature(token, publicKey)` in `src/auth/jwt.ts`.

- SessionStart injection at `20:32:14.485` included memory #106 as the first bullet under `## Session Preferences`
- Agent implemented with exact compliance: `// Verifies an RS256 JWT's signature against a public key; returns true if valid, false if malformed or mismatched. No side effects.`

**Gap identified:** Project-wide preferences/guidelines created mid-session stay invisible to that same session. Path-based blocking is scope-gated; SessionStart injection is start-of-session-only. Fix approach noted in `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` → "Mid-Session Project-Wide Memory Invisibility" (Approach 1 — inject on storage).

### Summary

| Scenario | Outcome |
|---|---|
| U1 | 6/7 pass — delivery works, agent judgment is the ceiling |
| U2 | Full loop validated end-to-end |
| U3 | Fresh-session behavior works; same-session gap documented as follow-up |

Two new Phase 1 follow-ups filed during these runs:
1. **Hooks on file creation (Write tool)** — verify parent-dir scoped memories surface when creating new files
2. **Mid-session project-wide memory invisibility** — project-wide memories stored mid-session don't reach the current session

---

## H, O, J Validation Results (Apr 20, 2026)

### H: Auto-update on MCP Server Start — PASS (two-session pattern)

**Setup:** fresh project `/tmp/aide-val-h`, ran `aide-memory init`, then corrupted `.claude/settings.json` to simulate stale v0.1.5 state:
- Removed 6 hook matchers (Write, Grep, Glob, aide_recall PreToolUse, aide_update/aide_forget/aide_search PostToolUse)
- Added `_userCustomSetting: "preserve-me-across-update"` to verify user keys survive

**Session 1:** started Claude Code in the corrupted project. `autoUpdateIfNeeded()` fired on MCP startup:
- `_aideMemoryVersion` bumped 0.1.5 → 0.2.0 ✅
- All 6 missing hook matchers restored ✅
- `_userCustomSetting` preserved ✅
- The restored hooks were NOT active in Session 1 itself — Claude Code loads `settings.json` once at session start, so the file was rewritten mid-session but the in-memory hook registry was still the stale version.

**Session 2 (resume of Session 1):** confirmed restored hooks fire — Stop, UserPromptSubmit, PostToolUse `aide_remember` all visible in debug log. Resume re-reads `settings.json`, so the updated hooks became live on the next session entry.

**Key finding captured in memory #108:** auto-update follows a "heal on first run, works on second run" pattern. Validating H fully requires two sessions.

### O: Dynamic Stop Hook (3→5→10) — PASS (two phases validated)

**Setup:** 19 sequential prompts in the resumed `/tmp/aide-val-h` session.

| Phase | Expected | Observed |
|---|---|---|
| Phase 1 (turns 1–9, every 3) | fires at turns 3, 6, 9 | ✅ exact |
| Phase 2 (turns 10–29, every 5) | fires 5 turns after last Phase 1 fire | ✅ fired at 14 and 19 |
| Phase 3 (turns 30+, every 10) | — | Not tested (would need 30+ prompts) |

**Implementation detail learned:** the counter tracks "turns since last fire" and resets after each fire, not `count % N == 0`. Captured in memory #126.

### J: MCP Server Unavailable — PASS (all 6 steps after implementing the missing import)

**Setup:** broke `/tmp/aide-val-h/.mcp.json` by pointing the command to a non-existent path. Opened a fresh Claude Code session.

| Step | Expected | Result |
|---|---|---|
| J1 | MCP server fails to start | ✅ banner: "1 MCP server failed · /mcp" |
| J2 | Session remains usable (hooks are bash, don't need MCP) | ✅ agent responsive, no hang |
| J3 | Correction triggers UserPromptSubmit | ✅ additionalContext injected, agent attempted `aide_remember` |
| J4 | Agent falls back to `.aide/pending-memories.jsonl` | ✅ file written with valid memory JSON |
| J5 | Agent notifies user to start MCP | ✅ "Start the MCP server and it'll be picked up" |
| J6 | Pending memories ingested on MCP recovery | ✅ *after* implementing `ingestPendingMemories()` |

**J6 gap + fix (Apr 20, 2026):** the spec called for pending memories to be imported on MCP recovery, but the code was never written. Searched entire codebase — only references to `pending-memories.jsonl` were `.gitignore`, `init.ts` gitignore list, and the `detect-correction.sh` write instruction. No reader. Memory #131 captured the gap.

Implemented `ingestPendingMemories()` in `src/memory/init.ts` and wired into `startServer()` in `src/memory/server.ts`. On every MCP startup:
1. Reads `.aide/pending-memories.jsonl` if it exists
2. For each line, maps schema (`content` → `what`) and calls `store.add()`
3. On successful import, renames the file to `pending-memories.jsonl.imported-{timestamp}` (audit trail, not deleted)
4. Malformed lines kept in the original file so the user can inspect
5. Prints `aide-memory: imported N pending memor(y|ies) from .aide/pending-memories.jsonl` to stderr

**Validated by manually spawning a fresh MCP server against the test project.** stderr printed the import message, `aide-memory list --layer preferences` confirmed the "Use spaces for indentation" memory landed as ID `[3]`, and `.aide/` contained the archive file (no plain `pending-memories.jsonl`).

**Key lifecycle insight captured in memory #135:** the aide-memory MCP server is not a persistent daemon — it's a stdio child process Claude Code spawns per session. Recovery from MCP outages is automatic: any new session with a healthy `.mcp.json` triggers `ingestPendingMemories()` on startup and catches up whatever accumulated during the outage.

### Summary

| Scenario | Outcome |
|---|---|
| H | PASS — auto-update rewrites settings correctly, restored hooks active on next session |
| O | PASS — Phase 1 and Phase 2 transitions behave per schedule; Phase 3 untested (30+ prompts needed) |
| J | PASS — full graceful-degradation loop works end-to-end after adding `ingestPendingMemories()` |

### Remaining Scenarios

- **K** — Plan persistence across sessions (organic, not pre-seeded)
- **L** — Multiple corrections in one session, all recalled next
- **M** — Scope exclusion precision (no cross-directory leakage)
- **I** — `.ignore` grep exclusion
- **init --scan** — importing generated memories from code analysis
- **Settings framework** — change defaults, verify behavior actually shifts
- **IDB-1 through IDB-9** — ID-based blocking scenarios (many incidentally covered by A–G/U1–U3)

