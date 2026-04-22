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

### ~~init --scan Validation~~ (REMOVED Apr 2026)
- `--scan` was removed (see "Deferred: Auto-scan for Codebase Pattern Discovery" below).
- Onboarding now uses `aide_import` against existing CLAUDE.md / README / docs.

### UX Exploration Session
- Collect all hook output samples (block, soft, silent, stop, precompact)
- Compare labels/rendering across sessions
- Determine what can be fixed vs Claude Code platform limitation
- Stop hook "error" label
- hookSpecificOutput only valid for PreToolUse/UserPromptSubmit/PostToolUse
- Cursor compaction behavior investigation
- Config mapping to Cursor's equivalent system
- Audit hook usage patterns (are blocking/flag patterns correct practice?)

### Context Usage Detection — Investigate for Pre-Compaction Saves
- Claude Code's `/context` command shows exact token usage (e.g., 848k/1m = 85%)
- Hooks don't receive token count in input JSON — but the DATA exists somewhere
- Investigate: can the MCP server or hooks access context usage programmatically?
- Investigate: does the transcript_path file size correlate with token usage?
- Investigate: can we parse Claude Code's internal state for token counts?
- Goal: detect when context is 70-80% full → trigger proactive save prompt (block Stop hook, or inject warning)
- If programmatic access isn't possible: file Claude Code feature request for token_used/context_remaining in hook input JSON
- Related: GitHub issue #46695 (context_threshold setting for auto-compact)
- This is the best remaining approach for pre-compaction saves since PreCompact can't force agent tool calls

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
- ~~NEW: init --scan importing~~ (--scan removed Apr 2026)
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

---

## New Follow-up: Automatic Stale Tracking Cleanup

**Problem:** Session tracking files (.aide/cache/recalled-paths-*.txt, searched-queries-*.txt, correction-pending-*.txt, recalled-ids-*.txt) accumulate from crashed or abnormally-exited sessions. Only current session's files are cleared by PreCompact/SessionStart.

**Current state:** `aide-memory cleanup` command added (default 7d TTL, --older-than/--all/--dry-run flags). Manual only.

**Phase 1 follow-up work:**
- Add automatic TTL-based cleanup on SessionStart (source: "startup" only, NOT resume/compact) — safe because any file 7+ days old is definitely from a dead session
- Add cleanup to post-checkout git hook (already runs on branch switch)
- Consider adding to config: `cleanup.autoTtl = "7d"` to toggle auto-cleanup
- Include correction-pending and recalled-ids patterns in the cleanup (already covered)
- Add stop-count-*.txt pattern if it's tracked (need to verify)

**Implementation notes:**
- Cleanup command at `src/cli/commands/memory/cleanup.ts`
- Uses 7d default, configurable via `--older-than`
- Safe to remove active session file — session will re-block on next read and re-populate via aide_recall (no data loss)

---

## New Follow-up: Hooks on File Creation (Write tool)

**Problem:** When a user creates a new file in a package/directory that already has scoped memories, the agent has no visibility into the context for that area. Read and Edit hooks check for directory-scoped memories, but Write (creating a new file) doesn't surface the memories for the directory being written into. This creates a gap: the agent can create files that violate area conventions without ever seeing the scoped memories.

**Scenarios where this matters:**
- Agent creates a new component in `src/components/` without seeing scoped conventions (skeleton loading, naming patterns, prop shapes)
- Agent scaffolds a new API route in `src/api/` without seeing scoped decisions (camelCase, requestId, rate limiting)
- Agent adds a test file in `tests/auth/` without knowing the shared auth mock setup

**Proposed behavior:**
- On Write to a new file path, look up memories scoped to the parent directory(ies)
- If scoped memories exist and IDs aren't tracked: BLOCK or SOFT with the standard "N memories for this directory" nudge
- Reuse the ID-based tracking so if directory memories were already seen via a sibling Read/Edit, no re-block
- Consider: soft-only for Write (less disruptive) vs block like Read/Edit (stronger guarantee)

**Open questions:**
- Does Write currently fire pre-edit-recall.sh? (Settings show Write matcher uses pre-edit-recall.sh already — but behavior for new-file paths may differ since the file doesn't exist yet)
- Should this extend beyond Write to other file-creation patterns (Bash `touch`, `mkdir`, framework scaffolding commands)?
- How to handle path resolution when the target file doesn't exist yet (scope matching should still work on parent dirs)

**Implementation notes:**
- `scripts/hooks/pre-edit-recall.sh` already handles Write matcher per `.claude/settings.json`
- Need to verify it correctly resolves parent-directory scoped memories for paths that don't yet exist
- Validation scenario needed: create new file in a directory with scoped memories, verify block fires

---

## New Follow-up: Mid-Session Project-Wide Memory Invisibility

**Problem:** Project-wide memories (preferences/guidelines with no scope) that are created mid-session are invisible to the rest of that same session. Discovered in U3 validation (Apr 20, 2026):

1. Agent stored preference #106 ("add contract comment above every function") in Session A as project-wide (no scope)
2. Same agent, later in Session B (continuation), was asked to add `hasExpired()` to `src/auth/jwt.ts`
3. Agent created the function with NO contract comment — never saw memory #106
4. Debug log: `recalled 0x` for #106; tracking file shows IDs [87–105] but NOT 106
5. Pre-edit-recall fired but produced no block because:
   - Memory #106 is project-wide → path-based blocking doesn't catch it (scope-gated)
   - `src/auth/**` scoped memories already tracked → no block from those
   - SessionStart injection only runs on new sessions → #106 never got injected into current session

**Two potential approaches:**

**Approach 1: Inject on storage**
When `aide_remember` stores a project-wide preference/guideline, append a "new preference stored" nudge into the tool response the agent sees. This keeps the new memory in the agent's immediate context for the rest of the session without requiring a session restart. Simple, low-cost. Downside: only works while the agent is actively processing tools — doesn't help if the agent is just in a conversational turn.

**Approach 2: Track on storage**
On `aide_remember` for project-wide memories, write the new ID directly into the session's `recalled-ids` tracking file immediately. This prevents redundant blocks if the agent later calls `aide_recall`, but doesn't solve the surfacing problem (ID-based blocking is scope-gated — project-wide IDs never block). Would need to pair with Approach 1 or with broader injection into pre-tool context. On its own, insufficient.

**Recommended:** Approach 1. Project-wide memories inherently depend on injection (SessionStart + in-conversation) rather than path-scoped blocking. Extending injection to "just-stored" is the natural fit.

**Validation plan:**
- Session C (fresh Claude Code session after #106 was stored) — verify SessionStart injection surfaces #106 and a new `hasExpired`-style function gets the contract comment
- Confirms whether the gap is limited to same-session continuation (as diagnosed) vs. a broader injection problem

---

## Resolved: Pending Memory Import on MCP Recovery (Apr 20, 2026)

**Problem:** `.aide/pending-memories.jsonl` (written by `detect-correction.sh` fallback when MCP is unavailable) had no import mechanism. The file was write-only — orphaned memories never reached the store. PHASE_0_1_SPEC.md:1012 (step J6) assumed an import existed; it didn't.

**Fix shipped:** `ingestPendingMemories(projectRoot, store)` added to `src/memory/init.ts` and wired into `src/memory/server.ts` `startServer()` right after `MemoryStore` construction.

On every MCP server startup:
1. Reads `.aide/pending-memories.jsonl`
2. Parses each JSONL line, maps `content`→`what` for schema compatibility, calls `store.add()`
3. On successful import, archives the file to `pending-memories.jsonl.imported-{timestamp}` (audit trail — not deleted)
4. Malformed lines kept in a regenerated `pending-memories.jsonl` so the user can inspect
5. Prints `aide-memory: imported N pending memor(y|ies) from .aide/pending-memories.jsonl` to stderr

**Validated:** Session J end-to-end (see `docs/validation/PHASE_1_RESULTS.md` J1–J6).

**Housekeeping follow-on:** extend `aide-memory cleanup` (or SessionStart TTL cleanup) to sweep old `*.imported-*` archive files after ~7 days. Not urgent — files are tiny, but the archive count will grow if users hit MCP outages frequently.

---

## New Follow-up: Settings Framework Has No User-Settable Keys

**Problem:** All 18 settings in `scripts/hooks/defaults.json` are `public: false, pro: false`. That means:
- `get_setting()` in `read-config.sh` returns the default regardless of what's in `.aide/config.json`
- `aide-memory config KEY VALUE` writes to the user's config file silently with no effect
- Docs in `docs/user/cli-reference.md` show `aide-memory config capture.enabled false` as if it works — misleading

**Fix (two parts):**
1. Promote the settings users most reasonably want to toggle to `public: true`:
   - `hooks.correction.enabled` (users may want quieter sessions)
   - `memories.hideFromGrep` (users may want memories visible to their grep/rg)
   - `hooks.read.maxBlocks`, `hooks.edit.maxBlocks` (block frequency tuning)
   - `memories.softening.threshold` (control new-project softening cutoff)
   - `hooks.stop.schedule` (let power users customize the 3→5→10 pattern)
2. Have `aide-memory config KEY VALUE` look up the key in `defaults.json`. If not public, either reject with a clear error (*"setting KEY is not user-configurable"*) or warn the user that the write is a no-op.

Discovered during Apr 20, 2026 Settings validation. Documented in PHASE_1_RESULTS.md.

---

## New Follow-up: Correction Detection Misses "don't" Without Apostrophe

**Problem:** `scripts/hooks/detect-correction.sh` Pattern 1 regex uses `don.t` (any single char between n and t). "don't" matches (apostrophe = the `.`), but colloquial "dont" without apostrophe (4 chars) does NOT match because the regex expects 5 chars.

**Fix:** Change `don.t` to `don'?t` (optional apostrophe) in all three pattern groups in detect-correction.sh. Same for "that.s wrong" → "that'?s wrong".

One-line tweak. Low priority but easy.

---

## New Follow-up: Nudge Preview Layer Counts Include Grandparent Scopes

**Problem:** `pre-read-recall.sh` returns `X memories for {path}. (N guidelines, M technical) — topics: ...` where the layer counts include memories from grandparent scopes and project-wide, but the integer `X` ("N memories not yet recalled") only counts focused-scope memories per memory #96.

**Example:** Reading `src/api/routes.ts` where memories exist scoped to `src/api/**` (direct parent), `src/**` (grandparent), and no-scope (project-wide):
- Correct blocking count: 2 memories (api/** + exact-file)
- Displayed layer breakdown: 4 memories (includes src/** + project-wide)

Cosmetic mismatch; doesn't change behavior but is confusing.

**Fix:** Align the layer-count aggregation with the focused-scope set (match the IDs actually being blocked).

---

## New Follow-up: `memories.hideFromGrep` Toggle Doesn't Sync `.ignore`

**Problem:** `aide-memory config memories.hideFromGrep false` writes to `.aide/config.json` but does NOT update the `.ignore` file. The `.ignore` file is written once at init time. So toggling the setting has no effect on grep behavior.

Compounded by the Settings Framework gap above: `memories.hideFromGrep` is `public: false`, so the override is ignored anyway.

**Fix (once Settings gap is resolved):** On `aide-memory config memories.hideFromGrep VALUE`, also update the `.ignore` file:
- `true` → ensure `.aide/memories/` is in `.ignore`
- `false` → remove the entry (or write `!.aide/memories/` exception if user has a broader ignore pattern)

---

## New Follow-up: `init --scan` Output Is Surface-Level — Consider Deprecating or Deepening

**Problem:** `aide-memory init --scan` produces basic memories from `package.json` and top-level directory inference only. Tested on two projects:
- Tiny project (1 file): 1 memory ("Source code is in src/ directory")
- Realistic Express app with routes/middleware/db: 4 memories (project name, Express usage, CommonJS modules [wrongly — it was TS], src/ directory)

Doesn't surface route patterns, auth middleware design, SQLite WAL mode config, or anything the agent would actually benefit from.

**Options:**

**Option A — Deepen:** Invest in tree-sitter-backed code analysis that looks at actual usage patterns (not just package.json). Could produce: "Uses Bearer token auth via X-Auth-Token header (src/middleware/auth.ts)", "SQLite WAL mode enabled in src/db/client.ts", etc.

**Option B — Deprecate:** Remove `--scan` entirely. Replace with stronger onboarding via `aide_import` against existing CLAUDE.md / README / docs — richer signal, less inference guesswork. The "viral hook" pitch shifts from "one command generates your context" to "aide-memory ingests your existing docs and makes them recall-able."

**Recommend:** B for Phase 1 (simpler, less risky), A as a Phase 2 pro feature if users ask for it. Also fix the module-system inference bug (was called CommonJS for a TS project).

**Decision (Apr 21, 2026):** Option B accepted — `--scan` removed. See next section for the deferred revisit criteria.

---

## Deferred: Auto-scan for Codebase Pattern Discovery

--scan was removed in Apr 2026 because output was too surface-level
(package.json + dir inference only — 4 memories from an Express app,
one wrong). Phase 2 could revisit with real tree-sitter-backed
analysis that looks at code patterns (auth middleware, route conventions,
SQLite config, etc.). Until then, users should use `aide_import`
against existing CLAUDE.md / README / design docs — richer signal
with less inference guesswork.

---

## New Follow-up: TTL Cleanup for Archived Pending-Memory Files

**Problem:** `ingestPendingMemories()` archives the source file to `.aide/pending-memories.jsonl.imported-{timestamp}` on successful import rather than deleting it (preserves audit trail). Over time — if users hit MCP outages frequently — the project accumulates stale archive files.

**Fix:** Extend `aide-memory cleanup` (or the SessionStart TTL sweep) to also remove `pending-memories.jsonl.imported-*` files older than the configured TTL (default 7 days per existing cleanup command). Match pattern:

```
.aide/pending-memories.jsonl.imported-*
```

Alongside the existing cleanup patterns (`recalled-paths-*.txt`, `searched-queries-*.txt`, `correction-pending-*.txt`, `recalled-ids-*.txt`).

Low priority — archive files are tiny (one JSONL line each) and will only accumulate for users with repeated MCP outages.

---

## New Follow-up: `.ignore` Drift-Repair on MCP Startup — DONE (Apr 21, 2026)

`autoUpdateIfNeeded()` now unconditionally calls `resyncDerivedArtifacts()` at the top of its body, before the version-stamp check. This catches the case where a user edits `.aide/config.json` directly (e.g. merges a teammate's `memories.hideFromGrep` change) without going through the `aide-memory config` CLI — the CLI write path live-syncs via `applySideEffects`, but direct edits would otherwise go undetected until the next `init --force`.

Both paths now delegate to `resyncDerivedArtifacts(projectRoot)` in `src/memory/init.ts`, the single source of truth for "files whose content is derived from a config setting." Currently only `.ignore` (from `memories.hideFromGrep`) qualifies, but the pattern is extensible — future derived artifacts add a block in the same function.

Verified: manually edited `.aide/config.json` to flip `memories.hideFromGrep=false`; `.ignore` stayed stale; spawning a new MCP server against the project removed `.ignore` on startup as expected.

---

## New Follow-up: Suppress Stop Hook Prompt When Agent Already Stored in Same Turn

**Problem:** The Stop hook (`scripts/hooks/stop-remember.sh`) fires on its scheduled interval (every 3/5/10 turns per `hooks.stop.schedule`) with the standard prompt *"Any decisions, technical constraints, preferences, or guidelines worth persisting?"* — even when the agent **already called** `aide_remember` / `aide_update` / `aide_forget` earlier in the same turn.

Observed in C (correction loop) validation on Apr 21 2026: user corrected epoch ms→s, agent proactively called `aide_remember` (id=15), Stop hook still fired the "anything worth persisting?" prompt at turn end. Agent had to reply *"nothing else to persist — already saved (id=15)"*. Wasted turn + UX friction.

**Fix idea:** Track whether the agent called any of the memory-writing MCP tools (`aide_remember`, `aide_update`, `aide_forget`) during the current turn. If yes, skip the standard Stop prompt (or shorten it to a silent confirm). Two implementation paths:

1. **Session-state tracking:** PostToolUse for those tools writes a per-turn flag (`.aide/cache/remembered-this-turn-{session_id}.txt`). Stop hook reads the flag, skips the prompt if set, clears the flag. Simpler but needs careful turn-boundary logic.

2. **Transcript scan:** Stop hook reads the session's transcript (already available via hook input) and checks the last turn's tool_uses for memory writes. More expensive but no extra state file.

The existing correction-flag path (`correction-pending-{session_id}.txt`) already does something similar for the *"A correction from this turn wasn't stored"* prefix. This extends the pattern to the standard-prompt case.

**Priority:** Low — Stop hook fires infrequently (every 3-10 turns) and the agent can easily reply "nothing else to persist." But it's a papercut worth fixing for polish before launch.

---

## Done (Apr 21, 2026): All MCP tool numeric params now use `z.coerce.number()`

**Problem observed in E validation (Apr 21 2026):** Agent organically detected a conflict between two memories (id=8 "epoch ms" and id=15 "epoch seconds"), called `aide_forget({id: "8"})` to remove the stale one. MCP returned:

```
MCP error -32602: Input validation error: Invalid arguments for tool aide_forget: [
  { "expected": "number", "code": "invalid_type", "path": ["id"],
    "message": "Invalid input: expected number, received string" }
]
```

Agent recovered on second try with `id: 8` (number), but the first failure burned a turn.

Same class of bug that was fixed in `aide_recall` per memory #42 — LLMs commonly send numeric parameters as strings, and the fix was `z.coerce.number()` in the zod schema.

**Fix:** Update `aide_forget` and `aide_update` in `src/memory/server.ts` to use `z.coerce.number()` for their `id` parameter so string "8" → number 8 transparently.

Grep pattern: `z.number()` in server.ts near tool definitions — any `id` param should be `z.coerce.number()`.

Fixed in `src/memory/server.ts` — every `z.number()` → `z.coerce.number()` across all 6 numeric params (aide_recall ids + limit, aide_update id, aide_forget id, aide_search limit, aide_memories limit). Regression test added in `src/memory/__tests__/server.test.ts` (aide_forget with string id). 654/654 tests pass.

---

## Follow-ups from 0.4.3 (Apr 22, 2026)

Deferred from the 0.4.3 remediation bundle. Not critical; tracked here so they don't vanish.

### 1. Stop-hook enable/disable boolean

Currently the Stop hook has no dedicated on/off knob — you set `hooks.stop.schedule '[{"every":99999999}]'` for effective off. Other hooks all have clean toggles (`hooks.read.maxBlocks=0`, `hooks.correction.enabled=false`, etc.). For consistency: extend `hooks.stop.schedule` to accept `false`, or add `hooks.stop.enabled` boolean.

**Priority:** Low — cosmetic UX polish.

### 2. Smarter per-layer char allocation for SessionStart injection

`injection.maxChars` does a dumb string-slice after sections concatenate. Works for the common case (most injections are well under the 1200-char cap). When over cap, later sections (guidelines) get partially chopped mid-content even though the Always-first reorder (shipped in 0.4.3) protects priority memories.

Proposed: per-layer char budgets (e.g. `preferences=25%`, `always=20%`, `guidelines=35%`, `technical=10%`, `area_context=10%`). Each section clips within its share. More predictable on over-budget sessions.

**Priority:** Low — 0.4.3's Always-first ordering already covers the critical case.

### 3. Cloud embedding backends

`embeddings.backend` accepts `auto / transformers / ollama / none` in 0.4.3. Phase 2+ adds `openai`, `cohere`, `voyage`. Requires:
- API key config (`embeddings.apiKey` or env var lookup)
- Cloud-specific model names + dimension handling
- Network retry / rate-limit logic
- Graceful degradation when cloud is down

**Priority:** Phase 2 — local-only is intentional for the 0.4.x line.

### 4. PreToolUse "blocking error" label softening (memory #310)

`PreToolUse:Read hook returned blocking error` renders with alarming "error" framing in Claude Code TUI even when the block is intentional. Legacy `decision:"block"` shape renders this way; modern `permissionDecision:"deny"` shape with `hookSpecificOutput` may render differently. Needs empirical testing.

**Test path:** swap one hook emit to `permissionDecision:"deny"`, verify render. Then migrate `emitBlockDecision` + refactor `reason` text to reframe in-place (per memory #316).

**Priority:** Medium — real UX friction, cosmetic only.

### 5. `nudge.visible` rewiring (hook output visibility UX)

Per memory #307, user wants configurable hook-output visibility (verbosity control). `nudge.visible` key was removed in 0.4.3 as dead, but the UX need remains. Memory #316 captures user-directed design decisions on `hooks.output.visible`.

**Scope:** Part of larger UX-exploration work, not a one-liner.

### 6. Adaptive `recall.minScopeDepth` default

Current default `1` (permissive) works across all project shapes. `aide-memory init` could peek at top-level folder structure — if `src/` exists, default to `2` (quieter for src-prefixed projects); otherwise stay at `1`. Zero-friction across project shapes.

**Priority:** Low — current default is safe.

### 7. Deep E2E test for backend selection with real deps installed

`src/memory/__tests__/embeddings.test.ts` covers backend-selection wiring via `vi.spyOn` mocks (fast, hermetic). For fuller coverage, a nightly CI job could install `@huggingface/transformers` + start a local Ollama container, exercise semantic search with each backend explicitly configured.

**Priority:** Low — mock coverage is sufficient for regression catches.

### 8. Visuals for remaining config settings

0.4.3 added bar-diagram visuals in `docs/user/configuration.md` for the high-value settings (`recall.minScopeDepth`, `hooks.stop.schedule`, `memories.softening.threshold`, `injection.maxChars`, SessionStart layer map, `hooks.search.mode`, `hooks.precompact.mode`, `hooks.read/edit.maxBlocks`). Remaining settings with plain text-only docs:
- `recall.limit` / `recall.ensureLayerDiversity` / `recall.layerDiversityMinLimit` — ranking / diversity swap explainer
- `contributor`, `embeddings.backend`/`.model`, `telemetry.enabled` — simple enough without visuals, but could add before/after for `contributor` override

**Priority:** Low — diminishing return on visuals; current docs adequate.
