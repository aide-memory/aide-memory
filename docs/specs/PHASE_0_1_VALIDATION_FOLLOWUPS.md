# Phase 0/1 Validation Follow-ups: Hook Defaults Optimization + Settings Framework

## What We're Implementing NOW

### 1. Settings Framework (defaults.json + read-config.sh)

**Create `scripts/hooks/defaults.json`:**
All settings with `{value, public, pro}` metadata. All start as `public: false`.

```json
{
  "hooks.read.maxBlocks": { "value": 1, "public": false, "pro": false },
  "hooks.edit.maxBlocks": { "value": 1, "public": false, "pro": false },
  "hooks.directoryTrigger.maxBlocks": { "value": 1, "public": false, "pro": false },
  "hooks.stop.schedule": { "value": [{"until":9,"every":3},{"until":29,"every":5},{"every":10}], "public": false, "pro": false },
  "hooks.search.mode": { "value": "soft", "public": false, "pro": false },
  "hooks.correction.enabled": { "value": true, "public": false, "pro": false },
  "hooks.precompact.mode": { "value": "cleanup", "public": false, "pro": false },
  "recall.minScopeDepth": { "value": 2, "public": false, "pro": false },
  "recall.limit": { "value": 20, "public": false, "pro": false },
  "recall.ensureLayerDiversity": { "value": true, "public": false, "pro": false },
  "recall.layerDiversityMinLimit": { "value": 5, "public": false, "pro": false },
  "injection.preferences": { "value": 15, "public": false, "pro": false },
  "injection.technical": { "value": false, "public": false, "pro": false },
  "injection.area_context": { "value": false, "public": false, "pro": false },
  "injection.guidelines": { "value": "all", "public": false, "pro": false },
  "injection.priorityAlwaysOverride": { "value": true, "public": false, "pro": false },
  "memories.hideFromGrep": { "value": true, "public": false, "pro": false },
  "memories.softening.threshold": { "value": 10, "public": false, "pro": false }
}
```

**Create `scripts/hooks/read-config.sh`:**
Shared function that reads defaults → checks if public → checks user override → checks pro gate.

**Auto-add public settings on update:**
Extend `autoUpdateIfNeeded()` in init.ts: scan defaults.json for `public: true` settings, add missing ones to `.aide/config.json` with default values. Pro-gated settings get a comment: `"_key_requires": "pro"`.

### 2. Read/Edit Block-Once-Then-Soft

**Change:** Track block count per file in tracking file. After `maxBlocks` blocks, switch to soft with remaining-count message.

**Tracking format:** Add `block-count|path|N` entries to recalled-paths file.

**Soft message when remaining:** "N more scoped memories for this file haven't been recalled yet."

**Files:** pre-read-recall.sh, pre-edit-recall.sh

### 3. Fix Directory Prefix Match

**Current bug:** `dir|src/api/` in tracking → ALL files under `src/api/` skip blocking. Wrong — directory recall may not include file-specific memories.

**Fix:** Remove prefix match from file-level blocking check (line 102 of pre-read-recall.sh). Only exact `file|path` matches exempt files. `dir|path` only exempts the directory trigger.

**Remaining-count check:** After directory recall, check if file's scoped memory IDs are in the `ids|` list. If all covered → soft. If any missing → block (or soft with remaining count after maxBlocks).

### 4. Stop Hook 3 → 5 → 10

**Change:** Extend dynamic interval to three phases.
- Phase 1 (turns 1-9): block every 3
- Phase 2 (turns 10-29): block every 5
- Phase 3 (turns 30+): block every 10

**Read from:** `hooks.stop.schedule` in defaults.json

### 5. Correction Detection Tuning

**Current patterns (too broad):** "no, don't", "we should", "I want you to"

**Improved approach:**
- Require negation + directive (not just negation alone)
- Negative filters: "no I mean", "I don't think", "I don't know", "I don't get", "no but"
- Match at message start (not mid-sentence)
- Research + test wide range of real corrections vs false positives before finalizing

### 6. Clean PreCompact

**Remove:** Any remnants of old two-phase logic, systemMessage output, decision:approve output.
**Keep:** Cleanup only — source clear-tracking.sh, exit 0, no output.

### 7. Injection Per-Layer Settings

**Change session-inject.js to read per-layer config:**
- `injection.preferences: 15` — top N preferences
- `injection.technical: false` — not injected at SessionStart (comes from recall)
- `injection.area_context: false` — not injected (comes from recall)
- `injection.guidelines: "all"` — always include all guidelines
- `injection.priorityAlwaysOverride: true` — priority:"always" always included first, takes precedence over per-layer caps

### 8. Wire ALL Hooks to Read from Config

Every hook reads settings via `source read-config.sh` + `get_setting "key"` instead of hardcoded values.

### 9. Clear Tracking on Resume (all resumes)

**Change:** SessionStart clears tracking on `source: "resume"` in addition to `"clear"` and `"compact"`. Can't distinguish full resume from resume-with-summary — safe to clear all (extra re-blocking on full resume is minor, missing re-blocking on summary resume is a real gap).

**File:** session-start-clear.sh — add `"resume"` to the clear condition.

---

## FAST FOLLOWS (after this implementation, before continuing validation)

### Recall Pagination / Window-style
- Add `offset` and `exclude_ids` parameters to aide_recall MCP tool
- Agent can query: top 5, then 5-10, then 10-15
- Or pass `exclude_ids: [1,2,3,4,5]` to get only new results
- Enables the "get remaining memories" flow after directory recall

### init --scan Validation
- Verify `aide-memory init --scan` works with the new memory system
- Add validation scenario for importing initial memories from code analysis
- If tree-sitter analysis doesn't work for all languages, fix or make more basic

### UX Exploration Session
- Collect all hook output samples (block, soft, silent, stop, precompact)
- Compare labels/rendering across sessions
- Determine what can be fixed vs Claude Code platform limitation
- Stop hook "error" label
- hookSpecificOutput only valid for PreToolUse/UserPromptSubmit/PostToolUse
- Cursor compaction behavior investigation
- Config mapping to Cursor's equivalent system
- Audit hook usage patterns (are blocking/flag patterns correct practice?)

**Moved to PHASE_0_1_SPEC.md:**
- Distribution Strategy + Binary → Explore section (prior to publishing new version / demoing)
- PreCompact Feature Request → Phase 1 follow-ups
- Progressive Context Warnings → Phase 1 follow-ups (PreCompact mitigation)
- Search Tools Coverage → Phase 1 follow-ups (explore soft blocking on other tools)

## ALREADY DONE (from this session)

- **Dynamic stop interval data collected**: 1 aide_remember per 9 prompts, 51% signal-to-noise. Anthropic: avg 4 prompts/session. ProAIDE: mid-task interruptions 62% dismissed.
- **Search dedup independence from recall**: already how it works — aide_search runs independently, doesn't check recalled-paths.
- **Correction detection research**: included in implementation item #5 (not deferred).

---

## VALIDATION SCENARIOS (remaining)

### Completed (A-F):
- A: Hook + Recall ✅
- B: Search ✅
- C: Correction ✅
- D: Compact ✅
- E: Cross-session persistence ✅
- F0: Empty project ✅
- F: Softening (<10 mems) ✅

### Remaining:
- A2: Blocking permutations (block-once-then-soft, directory fix)
- G: Concurrent sessions
- H: Auto-update on server start
- I: .ignore grep exclusion
- J: MCP server unavailable / graceful degradation
- K: Plan persistence across sessions
- L: Multiple corrections in one session
- M: Scope exclusion precision
- N: SessionStart injection verification
- O: Dynamic stop hook (updated for 3→5→10)
- U1: Pre-seeded context (without vs with)
- U2: Correction learning loop
- U3: Behavioral preferences
- NEW: init --scan importing
- NEW: Block-once-then-soft with remaining count
- NEW: Settings framework validation (changing defaults changes behavior)

---

## IMPLEMENTATION ORDER

1. **Settings framework** (defaults.json + read-config.sh) — foundation for everything else
2. **Wire hooks to config** — all hooks read from get_setting()
3. **Fix directory prefix match** — remove line 102, implement ID-based check
4. **Read/Edit block-once-then-soft** — track block count, soft with remaining
5. **Stop 3→5→10** — extend dynamic schedule
6. **Correction detection tuning** — research patterns, implement filters
7. **Clean PreCompact** — remove old remnants
8. **Injection per-layer** — update session-inject.js
9. **Auto-add public settings** — extend autoUpdateIfNeeded()
10. **Unit tests for each** — verify config reading, behavior changes
11. **Smoke tests** — end-to-end for each change
12. **Bug audit** — spin off agents to review all changes
13. **Validation scenarios** — update and run remaining sessions
