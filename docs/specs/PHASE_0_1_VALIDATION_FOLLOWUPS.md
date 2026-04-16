# Phase 0/1 Validation Follow-ups: Hook Defaults Optimization + Settings Framework

## What We Implemented (Status as of April 13, 2026)

### 1. Settings Framework (defaults.json + read-config.sh) -- DONE

**Created `scripts/hooks/defaults.json`:**
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

**Created `scripts/hooks/read-config.sh`:**
Shared function that reads defaults, checks if public, checks user override, checks pro gate.

**Auto-add public settings on update:**
Extended `autoUpdateIfNeeded()` in init.ts: scans defaults.json for `public: true` settings, adds missing ones to `.aide/config.json` with default values. Pro-gated settings get a comment: `"_key_requires": "pro"`.

### ~~2. Read/Edit Block-Once-Then-Soft~~ -- REPLACED by ID-based blocking (see item 10)

### ~~3. Fix Directory Prefix Match~~ -- REPLACED by ID-based blocking (see item 10)

### 4. Stop Hook 3 -> 5 -> 10 -- DONE

Three-phase dynamic interval implemented:
- Phase 1 (turns 1-9): block every 3
- Phase 2 (turns 10-29): block every 5
- Phase 3 (turns 30+): block every 10

Reads from `hooks.stop.schedule` in defaults.json.

### 5. Correction Detection Tuning -- DONE

Improved approach implemented:
- Require negation + directive (not just negation alone)
- Negative filters: "no I mean", "I don't think", "I don't know", "I don't get", "no but"
- Match at message start (not mid-sentence)
- 3-word minimum to avoid false positives

### 6. Clean PreCompact -- DONE

Removed all remnants of old two-phase logic, systemMessage output, decision:approve output.
PreCompact is now cleanup-only: sources clear-tracking.sh, exit 0, no output.
PreCompact also clears the current session's recalled-paths file.

### 7. Injection Per-Layer Settings -- DONE

session-inject.js reads per-layer config:
- `injection.preferences: 15` — top N preferences
- `injection.technical: false` — not injected at SessionStart (comes from recall)
- `injection.area_context: false` — not injected (comes from recall)
- `injection.guidelines: "all"` — always include all guidelines
- `injection.priorityAlwaysOverride: true` — priority:"always" always included first, takes precedence over per-layer caps

### 8. Wire ALL Hooks to Read from Config -- DONE

Every hook reads settings via `source read-config.sh` + `get_setting "key"` instead of hardcoded values.

### 9. Clear Tracking on Resume (all resumes) -- DONE

SessionStart clears tracking on `source: "resume"` in addition to `"clear"` and `"compact"`. Session-scoped recall tracking via session_id in PreToolUse hooks.

### 10. ID-Based Blocking -- DONE (NEW -- replaced items 2 and 3)

**Replaced** block-once-then-soft and directory prefix match fix with a fundamentally better approach: track which memory IDs the agent has seen, and only block when there are unseen IDs scoped to the file being read.

- Recalled memory IDs tracked in session-scoped file (`recalled-ids-{session_id}`)
- On file read: query scoped memory IDs for that path, compare against tracked IDs
- If all scoped IDs already tracked -> SILENT (no block, no soft)
- If some IDs missing -> BLOCK with message listing the missing count
- If no scoped memories exist for the path -> SILENT
- Grandparent/broad scopes excluded from triggering (focused scope matching)

### 11. Focused Scope Matching -- DONE (NEW)

Grandparent scopes (e.g., `src/**` when reading `src/api/routes.ts`) no longer trigger blocking. Only scopes that are direct parents or exact matches trigger. This prevents broad-scope memories from causing unnecessary blocks on deeply nested files.

### 12. aide_recall `ids` Parameter -- DONE (NEW)

Added `ids` parameter to the aide_recall MCP tool. When the hook blocks with "N memories not yet recalled, call aide_recall({ids: [...]})," the agent can request exact memories by ID. Returned memories are tracked as recalled.

### 13. PostToolUse Response Parsing Fix -- DONE (NEW)

Fixed PostToolUse hook for MCP tool responses. `tool_response` is an array (not a string) -- the jq path was wrong, causing response parsing to silently fail. One-line fix that unblocked PostToolUse tracking of aide_recall/aide_search results.

### 14. Session-Inject Writes Injected IDs -- DONE (NEW)

session-inject.js now writes the IDs of injected memories (from SessionStart) into the recalled-IDs tracking file. This means memories injected at session start are considered "already seen" by the ID-based blocking system, preventing redundant blocks for memories the agent already received.

### 15. Directory Trigger Removed -- DONE (NEW)

The directory trigger (block on first file read in a new directory) was removed entirely. The ID-based blocking system makes it unnecessary -- if there are scoped memories for a directory's files, they'll be caught by the ID check. No more `dir|path` tracking entries.

---

## FAST FOLLOWS (after this implementation, before continuing validation)

### ~~Recall Pagination / Window-style~~ -- PARTIALLY DONE
- `ids` parameter added to aide_recall (item 12 above)
- `offset` and `exclude_ids` parameters still available as future enhancements
- ID-based blocking + `ids` param covers the primary use case (get specific missing memories)

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

## ALREADY DONE (from prior sessions)

- **Dynamic stop interval data collected**: 1 aide_remember per 9 prompts, 51% signal-to-noise. Anthropic: avg 4 prompts/session. ProAIDE: mid-task interruptions 62% dismissed.
- **Search dedup independence from recall**: already how it works — aide_search runs independently, doesn't check recalled-paths.
- **Correction detection research**: included in implementation item #5 (not deferred).

## DONE THIS SESSION (April 13, 2026)

All 9 original items implemented. Items 2 and 3 replaced by ID-based blocking (item 10). Six additional items implemented (items 10-15). Summary:

| # | Item | Status |
|---|------|--------|
| 1 | Settings framework (defaults.json + read-config.sh) | DONE |
| 2 | ~~Block-once-then-soft~~ | REPLACED by #10 |
| 3 | ~~Directory prefix match fix~~ | REPLACED by #10 |
| 4 | Stop 3->5->10 three-phase | DONE |
| 5 | Correction detection tuning | DONE |
| 6 | Clean PreCompact | DONE |
| 7 | Injection per-layer from config | DONE |
| 8 | Wire all hooks to config | DONE |
| 9 | Resume clears tracking | DONE |
| 10 | ID-based blocking (NEW) | DONE |
| 11 | Focused scope matching (NEW) | DONE |
| 12 | aide_recall `ids` param (NEW) | DONE |
| 13 | PostToolUse response parsing fix (NEW) | DONE |
| 14 | Session-inject writes injected IDs (NEW) | DONE |
| 15 | Directory trigger removed (NEW) | DONE |

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

### NEW: ID-Based Blocking Validation Scenarios

These scenarios validate the ID-based blocking system that replaced block-once-then-soft and directory prefix matching.

| # | Scenario | Expected Behavior |
|---|----------|-------------------|
| IDB-1 | First file read (no IDs tracked) | BLOCK -- scoped memories exist, none recalled yet |
| IDB-2 | Re-read same file after recall | SILENT -- all scoped IDs already tracked |
| IDB-3 | Read sibling file in same dir, IDs covered from sibling recall | SILENT -- sibling recall covered the shared scoped memories |
| IDB-4 | Read sibling file in same dir, SOME IDs missing (limit cut off earlier recall) | BLOCK with ID message -- only the missing IDs listed |
| IDB-5 | Read file in completely different directory | BLOCK -- different scope, no IDs tracked for this area |
| IDB-6 | Read file with no scoped memories at all | SILENT -- nothing to recall, no block needed |
| IDB-7 | After SessionStart injection, read file where scoped IDs partially covered | BLOCK with ID message -- only IDs not injected at session start |
| IDB-8 | After compact/clear/resume, re-read previously recalled file | BLOCK -- tracking cleared, IDs reset |
| IDB-9 | aide_recall({ids: [specific IDs]}) | Returns exact memories by ID, those IDs tracked as recalled |

### Remaining:
- ~~A2: Blocking permutations (block-once-then-soft, directory fix)~~ REPLACED by IDB-1 through IDB-9 above
- G: Concurrent sessions
- H: Auto-update on server start
- I: .ignore grep exclusion
- J: MCP server unavailable / graceful degradation
- K: Plan persistence across sessions
- L: Multiple corrections in one session
- M: Scope exclusion precision
- N: SessionStart injection verification
- O: Dynamic stop hook (updated for 3->5->10)
- U1: Pre-seeded context (without vs with)
- U2: Correction learning loop
- U3: Behavioral preferences
- NEW: init --scan importing
- NEW: Settings framework validation (changing defaults changes behavior)
- NEW: ID-based blocking scenarios (IDB-1 through IDB-9 above)

---

## IMPLEMENTATION ORDER (COMPLETED)

All items implemented as of April 13, 2026. Actual order diverged from plan -- items 2 and 3 were replaced mid-implementation by the ID-based blocking approach, which proved fundamentally better than the block-count and directory-prefix-fix designs.

1. ~~Settings framework~~ DONE
2. ~~Wire hooks to config~~ DONE
3. ~~Fix directory prefix match~~ REPLACED by ID-based blocking
4. ~~Read/Edit block-once-then-soft~~ REPLACED by ID-based blocking
5. ~~Stop 3->5->10~~ DONE
6. ~~Correction detection tuning~~ DONE
7. ~~Clean PreCompact~~ DONE
8. ~~Injection per-layer~~ DONE
9. ~~Resume clears tracking~~ DONE
10. **ID-based blocking** DONE (replaced 3 + 4)
11. **Focused scope matching** DONE
12. **aide_recall ids param** DONE
13. **PostToolUse response parsing fix** DONE
14. **Session-inject writes injected IDs** DONE
15. **Directory trigger removed** DONE

**Remaining:** Unit tests, smoke tests, bug audit, validation scenarios (IDB-1 through IDB-9 + remaining sessions G-U3)
