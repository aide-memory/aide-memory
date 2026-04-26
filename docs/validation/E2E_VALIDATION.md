# End-to-End Validation — aide-memory

Canonical validation matrix for aide-memory 0.5.0. Replaces the pre-consolidation
trio:

- `MANUAL_E2E_VALIDATION.md` (runbook, 17 steps) → consolidated here.
- `PHASE_1_RESULTS.md` (dated run log) → runs tables inlined per scenario.
- `PHASE_0_1_VALIDATION_FOLLOWUPS.md` — trimmed to non-validation follow-ups.
  FIXED items inlined below per scenario.

Each scenario has: **Action** · **Expected (Claude Code)** · **Expected (Cursor)** ·
**Runs** · **Issues found (resolved inline)**. Add editor columns as onboarding
lands (Windsurf, Codex, Copilot, Cline, Aider).

**Cursor adapter notes** — the Cursor column is authoritative per
`docs/specs/CURSOR_ONBOARDING.md` §1 (gap table) + `src/memory/editors/cursor.ts`.
When Cursor lacks the channel (soft `additionalContext` on `preToolUse`, inline
`systemMessage`, `sessionStart.additional_context`), we write the gap — not TBD.

---

## Pre-flight (REQUIRED before any scenario)

Run every time — fresh session start, after merging a branch, after any
dependency update, after a release-bundle swap, or whenever you're resuming
after a long break. If any check fails, fix that first before opening an
agent session.

```bash
cd /Users/meky/code/aide-v0

# 1. Unit tests — expect 750/750 pass (as of 2026-04-23; number grows as
#    regression tests are added). Includes:
#      - src/memory/__tests__/hook-merge.test.ts (5 tests)
#      - src/memory/hooks/__tests__/cursor-envelope.test.ts (30 tests)
#      - src/memory/__tests__/rulesGen.test.ts (17 tests)
#      - src/memory/__tests__/hooks-visibility.test.ts (12 tests)
#    (count-parity smoke was removed after the 0.4.0 hook consolidation —
#     its invariant is now covered by recall.test.ts + hooks.test.ts
#     + the e2e-autonomous.sh suite below.)
npm test -- --run 2>&1 | tail -5

# 2. Bash smoke suites — each prints "PASS" at the end
bash scripts/hooks/__tests__/settings-behavior.test.sh          # 5 PASS
bash scripts/hooks/__tests__/detect-correction.test.sh          # 17 PASS
bash scripts/hooks/__tests__/all-configs-behavior.test.sh       # 23 PASS
bash scripts/hooks/__tests__/cursor-init-smoke.test.sh          # 25 PASS

# 3. End-to-end autonomous smokes — spawn real MCP against dirty state.
#    Covers H (auto-update on stale settings), J (pending-memory ingest
#    on MCP start), and drift-repair (config.json edit → hook fires
#    resync). These can't be unit-tested because they need the real
#    startServer() path + hook dispatcher running together.
bash scripts/hooks/__tests__/e2e-autonomous.sh

# 4. Build is clean — tsc should exit 0 with no output
npm run build 2>&1 | tail -3
```

**All four MUST pass before starting any scenario.** If you're validating a
freshly-published tarball (not dev-mode), also add the install-from-tarball
smoke per `docs/RELEASING.md` §4 — dev-mode hides packaging-scoped bugs
(missing bundles, dev-manifest leaks, etc.).

---

## Validation Setup (shared fixture recipe)

Every scenario runs against a scratch project wired at the canonical
`aide-memory init` flow. Idempotent recipe:

```bash
# Claude Code fixture
rm -rf /tmp/aide-e2e
mkdir -p /tmp/aide-e2e/src/api /tmp/aide-e2e/src/auth /tmp/aide-e2e/src/utils
cd /tmp/aide-e2e
git init -q && git config user.name test && git config user.email t@t.com
aide-memory init

# Seed source files (empty-ish stubs)
cat > src/api/routes.ts <<'EOF'
export function getUsers() { return []; }
EOF
cat > src/auth/middleware.ts <<'EOF'
export function authMiddleware(req: any, res: any, next: any) {}
EOF
cat > src/utils/dates.ts <<'EOF'
export function parseDate(s: string) { return new Date(s); }
EOF
```

For scenarios that need hard-block paths to fire with small seeded sets, drop
the softening threshold:

```bash
aide-memory config memories.softening.threshold 5
```

For Cursor validation the same fixture applies — swap `.claude/` outputs for
`.cursor/hooks.json`, `.cursor/mcp.json`, `.cursor/rules/aide-memory.mdc`.
Approve hooks + MCP on first prompt (Claude Code: `/permissions`, Cursor: GUI
prompt). `aide-memory init` creates all 7 files on a single invocation.

---

## Scenarios

### Scenario F0 — empty project, zero memories

**Action:** fresh `aide-memory init`, then read any file (e.g. `src/api/routes.ts`)
before seeding any memories.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| F0 | Silent read. Zero memories → zero scoped memories → no hook output. | _Same — silent._ No memories → no hook fires in either channel. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-17 | Claude Code | ✅ PASS | Session F0 — Read proceeded with no blocking or nudge; Stop fired standard prompt. |
| TBD | TBD | Cursor | — | Blocked on Phase C8. Expected identical (silent). |

#### Issues found (resolved inline)

- _None — first-time UX was clean on first attempt._

---

### Scenario F — softening threshold (<10 memories)

**Action:** seed 3-5 scoped memories (below `memories.softening.threshold=10`),
read a file whose scope matches.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| F | Soft nudge — `additionalContext` with *"N memories for path… call aide_recall"*. Tool call not forcibly blocked; agent chooses to call `aide_recall`. | _Partial gap._ Cursor `preToolUse` has NO `additional_context` channel (gap #1 in CURSOR_ONBOARDING §1). Soft nudge is dropped silently — user sees nothing, agent doesn't get the context. Hard-block path DOES fire at/above threshold (same as Claude Code). Documented in `docs/user/editors/cursor.md`. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-19 | Claude Code | ✅ PASS | F2 — soft delivered (debug line 242); agent proactively called `aide_recall`. F2b — agent acted on soft. F4 — search soft delivered (debug line 887); agent acknowledged. |
| 2 | 2026-04-22 | Claude Code | ✅ PASS | Re-verified with `softening.threshold=100` manual variant → pure forceSoft branch validated. |
| TBD | TBD | Cursor | — | Known-silent for soft path. Blocked on Phase C8 for hard-block path at threshold. |

#### Issues found (resolved inline)

- ~~Edit soft was misattributed — initial test failed because agent reused cached file content in same session (didn't actually call Read tool).~~ Retested with fresh session; soft IS effective across Read/Edit/Search hooks.

---

### Scenario N — SessionStart injection

**Action:** seed project-wide preferences + guidelines. Start a new session.
Ask *"what do you know about this project?"*

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| N | Agent mentions project-wide guidelines/preferences (scoped items NOT in SessionStart list — those come on path reads). Debug log shows `## Session Preferences` / `## Guidelines` in SessionStart hook output. | _Same content, different channel._ Cursor's `sessionStart.additional_context` is broken (bug #157141/#158452). Workaround: `aide-memory init` writes `.cursor/rules/aide-memory.mdc` with `alwaysApply: true`; Cursor re-reads it every turn. Content identical to Claude Code's SessionStart output. Rules file is gitignored + regenerates on config/memory changes. See CURSOR_ONBOARDING §4. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-17 | Claude Code | ✅ PASS | Session E1-E3 — agent listed all 6 preferences + 5 guidelines from injection; supplemented with `aide_memories` for technical facts. |
| 2 | 2026-04-20 | Claude Code | ✅ PASS | U3 Session C — SessionStart included mid-session-stored preference #106 on fresh session. |
| TBD | TBD | Cursor | — | Blocked on Phase C8. Rules-file regeneration path tested via `rulesGen.test.ts` (17 tests). |

#### Issues found (resolved inline)

- ~~session-inject.js fetched all memories before filtering — inefficient.~~ Fixed: SQL-level priority filter.
- ~~Post-compact save prompt was injected alongside memories — confusing.~~ Removed; SessionStart now only injects preferences/guidelines.
- ~~Mid-session project-wide memory invisibility.~~ Filed as separate follow-up (see FOLLOWUPS §"Mid-Session Project-Wide Memory Invisibility") — still OPEN.

---

### Scenario A — path-based recall + ID-based blocking

**Action:** cross threshold (≥10 mems), read `src/api/routes.ts`, re-read, read
different-scope file, read unscoped file. Covers IDB-1..IDB-8 inline.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| A1 / IDB-1 | First read: hard block. `decision: block` with path-based message *"N memories for src/api/routes.ts (L1, L2) — topics: ... Call aide_recall({paths: [...]})"*. | Hard block via `{permission: "deny", user_message: <reason>}`. User sees the deny message inline in Cursor chat. Same semantic effect as Claude Code. |
| A3 / IDB-2 | Re-read: SILENT. All scoped IDs already tracked. | _Same — silent._ `file\|` + `ids\|` tracking works identically (no emit required, writes flag files only). |
| A4 / IDB-3 | Sibling file in same dir, IDs covered: SILENT. | _Same — silent._ |
| A5 / IDB-5 | Different-dir file (e.g. `src/auth/middleware.ts`): hard block for auth-scoped mems. | Hard block via `permission: deny`. |
| A6 / IDB-6 | File with no scoped memories (`README.md`): SILENT. | _Same — silent._ |
| A7 | Edit uses same tracking line (`ids\|`); covered IDs → silent Edit. | _Same — silent._ Edit (Cursor matcher `Write`) routes through same pre-edit-recall handler; tracking shared. |
| IDB-4 | Sibling read with some IDs missing: hard block listing only the missing IDs. | _Same — hard block via `permission: deny`._ |
| IDB-7 | After SessionStart injection, read file where scoped IDs partially covered: hard block with missing IDs. | _Same_ — session-inject writes IDs before first turn (Claude Code) or rules-file injection IDs get written on read (Cursor variant). |
| IDB-8 | After compact/clear/resume, re-read: hard block (tracking reset). | _Same — hard block._ PreCompact clears tracking identically. Cursor compact has a separate quirk (bug #158873) but tracking file clearing works. |
| Scn1 / IDB-10 | Re-read of previously-encountered file with a NEW mid-session memory added: SOFT (`additionalContext`) — "1 memory not yet recalled. Call `aide_recall({ids: [N]})`". | _Silent_ (gap). Cursor has no `additionalContext` channel on `preToolUse`. Self-track-on-fire writes the flag file identically, but the user-visible nudge is dropped. Agent may proceed without calling `aide_recall({ids})`. Documented gap — see CURSOR_ONBOARDING §1, gap #1. |
| Scn2 / IDB-11 | Different sibling file (never directly read) in same scope, after `aide_recall`: HARD block on fresh path. | Hard block via `permission: deny`. Conservative "fresh file = fresh enforcement" per memory #324. |
| IDB-9 | `aide_recall({ids: [N]})` returns exact memories, tracks those IDs as recalled. | _Same — MCP tool-call chrome shows the `aide_recall` invocation._ |
| IDB-12 | `minScopeDepth=1` (default) + memory scoped `src/**` + read any file under src/: HARD block. | _Same — hard block._ |
| IDB-13 | `minScopeDepth=2` override + `src/**` memory + read file under src/: SILENT. | _Same — silent._ |

See "Walkthroughs" appendix below for IDB-10/11/12/13 step-by-step procedures.

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-17 | Claude Code | ✅ A1/A3/A4/A5/A6/A7/A8-adj/Scn1/Scn2 all PASS | Session A (Round 2), 17 memories. Debug log `1ca3aeee-…`. |
| 2 | 2026-04-21 | Claude Code (0.4.2) | ✅ IDB-1..13 PASS | Post-settings-framework re-verification with `softening.threshold=5`. |
| 3 | 2026-04-22 | Claude Code (0.4.3) | ✅ PASS | Hook-visibility systemMessage attached on block + soft paths. |
| TBD | TBD | Cursor | — | Blocked on Phase C8. |

#### Issues found (resolved inline)

- ~~PostToolUse jq path wrong — `tool_response` is an array not a string.~~ Fixed in 0.3.x; one-line fix unblocked all PostToolUse tracking of recall/search results.
- ~~Grandparent scopes triggered blocking (reading `src/api/routes.ts` triggered on `src/**`-scoped memories).~~ Fixed with focused scope matching (minScopeDepth=1 direct parent rule).
- ~~Session-inject didn't write injected IDs — caused redundant blocks for SessionStart-injected memories.~~ Fixed; session-inject now writes IDs into `recalled-ids-{session_id}.txt`.
- ~~Directory trigger redundant with ID-based blocking and sometimes conflicting.~~ Removed entirely; no more `dir\|` entries.
- ~~Broad scope `src/**` caused useless blocks on `src/lib/logger.ts`.~~ Fixed with depth-based rule (MIN_SCOPE_DEPTH=2 → 1 after flat-project compat work).
- ~~Project-root path normalization — `path.relative()` returns "" for root.~~ Fixed (fallback to absolute path).
- ~~Directory trailing slash stripped — broke `isDirectoryQuery` detection.~~ Fixed.
- ~~aide_recall `ids` parameter accepted numeric strings as strings, caused zod failure.~~ Fixed with `z.coerce.number()` across all 6 numeric MCP params. Regression test in `server.test.ts`.
- ~~Nudge preview layer counts included grandparent scopes while the blocking integer used focused scopes — cosmetic mismatch.~~ Still OPEN. See FOLLOWUPS §"Nudge Preview Layer Counts Include Grandparent Scopes".

---

### Scenario B — search nudge

**Action:** Grep the codebase for a term matching a stored memory (e.g. `rate`).

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| B1 | Soft nudge — *"N aide memories match 'rate'. Call aide_search..."*. Agent calls `aide_search({keyword: ...})`, then Grep. Summary includes both. | _Gap on soft path._ Cursor's Grep matcher IS supported (`matcherMap.search = 'Grep'`), but Cursor has no `additionalContext` on `preToolUse`. Nudge is dropped silently. Glob matcher is unsupported (null in matcherMap) → semantic/glob searches go uncovered. Agent may still call `aide_search` from rules-file guidance but won't get the per-query nudge. |
| B2 | Grep for unmatched term: SILENT. | _Same — silent._ |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-17 | Claude Code | ✅ B1/B2 PASS | Session B (Round 2) — 199-char additionalContext, agent called aide_search in 6ms. |
| 2 | 2026-04-22 | Claude Code (0.4.3) | ⚠ PARTIAL | Grep tool appears deferred in CC 2.1.118 — Claude falls back to Bash+grep, which misses the matcher. See FOLLOWUPS §"Bash-grep fallback coverage" (still OPEN, ELEVATED priority). |
| TBD | TBD | Cursor | — | Blocked on Phase C8. Expected partial — Grep covered, Glob + bash-grep uncovered. |

#### Issues found (resolved inline)

- ~~Search hook was initially blocking; forced redundant aide_search calls when agent had memories from prior recall.~~ Changed to always-soft; agent decides whether to call aide_search.
- ~~Grep returned `.aide/memories/` JSON files mixed with code.~~ Fixed by adding `.ignore` file (config `memories.hideFromGrep=true`).
- ~~Agent could bypass the search block by retrying grep.~~ Fixed: tracking only via PostToolUse:aide_search (not block).
- ~~track-search.sh was missing — no tracking on aide_search.~~ Added as new PostToolUse hook.

---

### Scenario C — correction loop

**Action:** type a correction (*"no, we use epoch seconds not milliseconds"*).
Agent should detect, store, and Stop hook should not prefix with "correction
wasn't stored".

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| C1 | UserPromptSubmit fires soft — `additionalContext`: "BEFORE doing anything else, store via aide_remember (or aide_update if an existing memory needs revision)". | _Gap — one-turn delay._ Cursor's `beforeSubmitPrompt` CANNOT inject additionalContext (only `{continue:false, user_message}` deny channel). aide-memory writes the `correction-pending-{sid}.txt` flag silently. The next Stop hook delivers the "wasn't stored" reminder via `followup_message`. So the agent reminder arrives ONE TURN LATER than on Claude Code. Documented in CURSOR_ONBOARDING §1 gap #5. |
| C2 | Agent calls `aide_update` (modify existing) or `aide_remember` (new). PostToolUse clears flag. Stop fires STANDARD message (no "correction wasn't stored" prefix). | _Same flag-clear mechanics._ Stop delivers via `followup_message` on Cursor (vs `decision:"block"+reason` on Claude Code); semantically equivalent reprompt. |
| L | Colloquial `dont` without apostrophe IS matched post-fix (regex: `don'?t`). Bare `dont add todos` WITHOUT leading `no, ` does NOT match (negation context required). | _Same detection semantics_ — flag-file write + Stop reprompt loop works identically on Cursor. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-13 | Claude Code | ✅ C1-C4 PASS | Session C (Round 1) — memory id 36 stored, layer=guidelines, scope=src/api/**, contract-quality metadata correct. |
| 2 | 2026-04-17 | Claude Code | ✅ C1-C4 PASS | Session C (Round 2) — aide_update flag clearing verified; Stop shows standard prompt. |
| 3 | 2026-04-20 | Claude Code | ✅ L PASS | L-scenario via detect-correction.sh mechanical test — 9/9 plus colloquial edges (dont/cant/shouldnt/wouldnt/thats wrong). |
| 4 | 2026-04-22 | Claude Code (0.4.3) | ✅ PASS | systemMessage visibility shipped — "aide-memory · correction detected — prompting aide_remember" visible. |
| TBD | TBD | Cursor | — | Expected: flag-file mechanics PASS; in-turn nudge gap (known). |

#### Issues found (resolved inline)

- ~~PostToolUse hook for `aide_update` was missing — flag stayed set when agent updated instead of remembered.~~ Fixed by adding `mcp__aide-memory__aide_update` matcher to PostToolUse.
- ~~PostToolUse for `aide_forget` also missing.~~ Fixed by adding `aide_forget` matcher (write-clears-flag complete list: remember, update, forget; import intentionally excluded).
- ~~Regex `don.t` didn't match colloquial `dont` (required 5 chars).~~ Fixed: changed to `don'?t` (optional apostrophe) in all 3 pattern groups.
- ~~aide_forget rejected string ID "8" from agent with zod type error.~~ Fixed with `z.coerce.number()` in server.ts for all numeric params. Regression test added.
- ~~False-positive corrections on imperatives like "don't you think" and "no I mean".~~ Fixed via negation+directive requirement, negative filters, 3-word minimum, match-at-message-start-only.
- ~~Stop-hook reprompt when agent already stored in same turn — wasted turn.~~ Still OPEN. See FOLLOWUPS §"Suppress Stop Hook Prompt When Agent Already Stored in Same Turn".

---

### Scenario D — compact clears tracking

**Action:** within a session, `/compact`. After compact, re-read previously-tracked
file.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| D | PreCompact hook fires (exit 0, no output) → clears session's `recalled-paths-*.txt` + `recalled-ids-*.txt`. After compact, re-read blocks again (tracking reset). SessionStart:compact re-injects session-start content. | _Partial_. Tracking-clear mechanics work identically (file writes). BUT Cursor's `sessionStart` doesn't fire after compact (bug #158873). Rules file (`alwaysApply:true`) still picks up updated content on next turn — so mid-turn injection post-compact is the workaround. Documented in CURSOR_ONBOARDING §2 (bug tracker). |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-13 | Claude Code | ✅ D2/D2b PASS (after fix) | Hook format initially wrong; PreCompact now cleanup-only exit 0. |
| 2 | 2026-04-17 | Claude Code | ✅ D1-D3 PASS | Session D (Round 2) — tracking went from 11+2 IDs to 11 (injection-only) after PreCompact. Agent proactively called aide_recall post-compact. |
| TBD | TBD | Cursor | — | Expected partial PASS — clear works, SessionStart:compact known-broken upstream. |

#### Issues found (resolved inline)

- ~~hookSpecificOutput format invalid for PreCompact — only top-level decision/reason/systemMessage accepted.~~ Fixed (confirmed architectural Claude Code constraint; PreCompact simplified to exit 0 cleanup-only).
- ~~PreCompact two-phase blocking never actually blocked.~~ Refactored; PreCompact is cleanup-only.
- ~~PreCompact didn't clear the current session's recalled-paths file.~~ Fixed in commit `6af5001`.

---

### Scenario E — cross-session persistence

**Action:** store a correction in Session A. Exit. Start Session B, ask about the
convention.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| E | Session B SessionStart injects prefs/guidelines including the new correction. Agent answers from injection alone (no file reads needed). | _Same — injection content identical._ Delivered via `.cursor/rules/aide-memory.mdc` regeneration (rules file is rewritten when memory writes touch priority-always / preferences / guidelines layers; see CURSOR_ONBOARDING §4.3 triggers). Content byte-equivalent to Claude Code's SessionStart emit. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-13 | Claude Code | ✅ E1-E3 PASS | "Correct once, remembered forever" — memory 36 from Session C surfaced in new Session E. |
| 2 | 2026-04-17 | Claude Code | ✅ E1-E3 PASS | 4 corrections (snake_case, epoch seconds, rate limit 30, brute-force lockout) all surfaced. |
| 3 | 2026-04-20 | Claude Code | ✅ U2 PASS | Fresh-session recall via `aide_recall({ids: [105]})` after hard block; exact envelope applied. |
| TBD | TBD | Cursor | — | Rules-file regen covered by `rulesGen.test.ts` (17 tests). Live E2E blocked on Phase C8. |

#### Issues found (resolved inline)

- _No scenario-specific issues. Cross-session persistence was correct from first implementation._

---

### Scenario G — concurrent sessions (isolation)

**Action:** two agent sessions running simultaneously on same project. Session A
reads a file; Session B reads a different file with same scope.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| G | Each session has its own `recalled-paths-{session_id}.txt` + `recalled-ids-{session_id}.txt`. Session B blocks independently even if Session A already recalled the shared-scope IDs. No cross-session leakage. | _Same — session isolation via session_id in filename._ Cursor emits `conversation_id` which the adapter renames to `session_id`. Tracking files are identical shape. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-17 | Claude Code | ✅ G1-G5 PASS | Sessions `0850e190…` and `a3702548…` — IDs 87,88,92 tracked in A, NOT in B. B blocked on every one. |
| TBD | TBD | Cursor | — | Envelope translation tested in `cursor-envelope.test.ts` (30 tests covering conversation_id→session_id rename). Blocked on Phase C8 live. |

#### Issues found (resolved inline)

- ~~SessionStart cleanup touched concurrent sessions' files.~~ Fixed: only clear THIS session on clear/compact/resume.

---

### Scenario H — auto-update on MCP server start

**Action:** corrupt `.claude/settings.json` (remove hook matchers, add custom
user key). Start a new session.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| H | `autoUpdateIfNeeded()` on MCP startup bumps `_aideMemoryVersion`, restores missing matchers, preserves user custom keys. Restored hooks become live on the NEXT session (Claude Code loads settings.json once at session start — "heal on first run, works on second run"). | _Same heal-on-startup pattern._ Applies to `.cursor/hooks.json` + `.cursor/mcp.json` + `.cursor/rules/aide-memory.mdc`. Cursor has NO hot MCP reload (bug #3887 / #55723) — user must restart Cursor after `aide-memory init` or version upgrade. Init output should warn. Hook collision warning also fires if another tool's hook array is present (bug #141996 — only first hook executes). |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-20 | Claude Code | ✅ PASS | Version bumped 0.1.5 → 0.2.0, 6 missing matchers restored, `_userCustomSetting` preserved. Captured in memory #108 — two-session pattern required. |
| 2 | 2026-04-21 | Claude Code (0.4.2) | ✅ PASS | Drift-repair + settings-framework integration re-verified. |
| TBD | TBD | Cursor | — | `hook-merge.test.ts` (5 tests) covers cross-editor merge semantics. Blocked on Phase C8 live. |

#### Issues found (resolved inline)

- ~~--force merge was overwriting user settings.~~ Fixed: preserves user settings.
- ~~--reset flag needed (resets config to factory without deleting memories).~~ Added.

---

### Scenario J — MCP unavailable + pending-memory recovery

**Action:** break `.mcp.json` (point to non-existent path). Start agent, submit
correction. Exit. Restore `.mcp.json`. Start agent again.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| J1 | Banner: "1 MCP server failed · /mcp". Session remains usable. | _Same — banner via Cursor's native MCP failure notice._ |
| J2-J3 | Correction fires UserPromptSubmit; agent attempts `aide_remember`. | _Same flag-write mechanics (soft nudge dropped per gap #5, but flag persists to pending-memories)._ |
| J4 | Agent falls back to `.aide/pending-memories.jsonl`; writes memory as JSON line. | _Same — `detect-correction.sh` writes JSONL regardless of editor._ |
| J5 | Agent tells user "Start the MCP server and it'll be picked up". | _Same message._ |
| J6 | On MCP recovery, `ingestPendingMemories()` at `startServer()` imports JSONL lines, archives file to `pending-memories.jsonl.imported-{ts}`. stderr prints import count. | _Same server-side import logic._ |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-20 | Claude Code | ✅ J1-J6 PASS (after implementing `ingestPendingMemories`) | Memory #131 captured the gap; implementation landed in `init.ts` + `server.ts`. |
| 2 | 2026-04-21 | Claude Code | ✅ PASS | Re-verified in autonomous smoke. |
| TBD | TBD | Cursor | — | Server-side path editor-agnostic. Blocked on Phase C8 live. |

#### Issues found (resolved inline)

- ~~`ingestPendingMemories()` was never implemented — PHASE_0_1_SPEC:1012 assumed it existed.~~ Implemented in Apr 2026 (memory #131, #135). Schema map `content`→`what` added.
- ~~TTL cleanup for archived `pending-memories.jsonl.imported-*` files.~~ Still OPEN (low priority; see FOLLOWUPS §"TTL Cleanup for Archived Pending-Memory Files").

---

### Scenario K — plan persistence (organic cross-session)

**Action:** ask agent to draft a plan *without telling it to save*. Exit. Start
new session, ask to continue the plan.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| K | Agent PROACTIVELY calls `aide_remember` (layer=area_context, scope=relevant-dir) to store the plan summary. Next session picks up specific details (not a re-draft from scratch). Stop hook fires standard message. | _Behavioral — should work identically._ Agent is guided by the rules file (same content via `.cursor/rules/aide-memory.mdc`). MCP `aide_remember` call visible in Cursor's tool-call chrome. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| TBD | TBD | Claude Code | — | K is the only scenario not yet run in live sessions. Mechanics (store+recall+cross-session) already validated via U2 + U3 Session C. The K-specific "agent decides on its own" half is agent-behavioral and can't be simulated. |
| TBD | TBD | Cursor | — | Blocked on Phase C8. |

#### Issues found (resolved inline)

- _Nothing scenario-specific — underlying mechanics already validated elsewhere._

---

### Scenario O — dynamic Stop hook (3 → 5 → 10)

**Action:** run 30+ sequential turns. Watch for Stop fires.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| O | Phase 1 (turns 1-9, every 3): fires at 3, 6, 9. Phase 2 (10-29, every 5): fires at 14, 19, 24. Phase 3 (30+, every 10): fires at 34, 44, etc. Counter tracks "turns since last fire", not `count % N`. | _Same schedule logic._ Cursor delivers via `{followup_message: <reason>}` (vs `decision:"block"+reason` on Claude Code). Semantic equivalent — user sees the reprompt. Bug #152230: `AskUserQuestion` tool doesn't trigger hooks, so if agent uses it mid-turn the counter may be off. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-13 | Claude Code | ✅ Live | Block at turn 14 and 15 observed; soft visible. |
| 2 | 2026-04-20 | Claude Code | ✅ Phase 1+2 PASS | 19 sequential prompts. Phase 3 not tested (needs 30+). Memory #126 captured counter logic. |
| TBD | TBD | Cursor | — | Blocked on Phase C8. |

#### Issues found (resolved inline)

- ~~hookSpecificOutput invalid for Stop — confirmed architectural, not a bug.~~ Uses top-level fields.
- ~~Correction flag persisted forever on false positives.~~ Fixed: flag clears after one chance.
- ~~suppressOutput doesn't work for Stop.~~ Confirmed; soft branch outputs silently via non-block path.
- ~~No dedicated Stop enable/disable boolean (only `schedule '[{"every":99999999}]'` hack).~~ Still OPEN. See FOLLOWUPS §"Stop-hook enable/disable boolean".

---

### Scenario U1 — team decisions (pre-seeded context)

**Action:** with 16 pre-seeded memories covering conventions, ask agent to
implement a new endpoint.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| U1 | 6+ of 7 relevant memories followed (epoch ms, soft delete, camelCase, async/await, <30 lines, requestId on errors). Agent judgment may miss one (delivery ≠ compliance). | _Same — mechanics deliver identically._ Agent compliance depends on LLM; delivery path is ID-based block + recall. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-20 | Claude Code | ✅ 6/7 PASS | Debug log `0850e190…`. Rate-limiter memory missed (agent judgment). Captured in memory #102. |
| TBD | TBD | Cursor | — | Blocked on Phase C8. |

#### Issues found (resolved inline)

- _Delivery works; agent judgment is the ceiling._ Possible Phase 2 follow-up: surface high-priority memories more forcefully.

---

### Scenario U2 — correction learning loop

**Action:** correct agent in Session A, ask for similar code in Session B.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| U2 | Correction stored → surfaced via ID-based block in next session → exact envelope applied. Full detect → store → clear flag → recall → apply loop. | _Same semantic loop._ In-turn nudge is one-turn-delayed on Cursor (gap #5) but the store + cross-session recall path is identical. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-20 | Claude Code | ✅ PASS end-to-end | Session A: stored id 105. Session B: BLOCK → `aide_recall({ids: [105]})` → exact `{data, meta}` envelope applied. |
| TBD | TBD | Cursor | — | Blocked on Phase C8. |

#### Issues found (resolved inline)

- _Nothing scenario-specific — exercises flows covered elsewhere._

---

### Scenario U3 — behavioral preferences

**Action:** state a preference naturally (not a correction). Ask for related
code same session AND fresh session.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| U3a | Agent detects preference (not correction), proactively calls `aide_remember`, applies retroactively. | _Same — MCP call visible in tool-call chrome._ |
| U3b (same session) | Mid-session project-wide preference does NOT surface on subsequent reads — project-wide scope isn't caught by path-based blocking; SessionStart injection is start-of-session only. | _Same gap._ Rules file regenerates on memory writes that hit priority-always / preferences / guidelines layers; however, Cursor re-reads rules on next turn — may or may not surface mid-session depending on turn boundaries. |
| U3c (fresh session) | SessionStart injection surfaces the preference; agent applies compliance exactly. | _Same — via rules-file regeneration channel._ |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-20 | Claude Code | ⚠ PARTIAL | Session A + Session C PASS. Session B exposed the mid-session invisibility gap — memory #106 never surfaced. |
| TBD | TBD | Cursor | — | Blocked on Phase C8. |

#### Issues found (resolved inline)

- ~~Mid-session project-wide memory invisibility.~~ Still OPEN. See FOLLOWUPS §"Mid-Session Project-Wide Memory Invisibility" — Approach 1 (inject on storage) recommended.

---

### Scenario M — scope exclusion precision

**Action:** seed 5 memories at different scopes (`src/auth/**`, `src/api/**`,
`src/**`, exact-file, project-wide). Invoke `pre-read-recall.sh` for 4 different paths.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| M | `src/api/routes.ts` → nudged for api/** + exact-file. `src/auth/middleware.ts` → nudged for auth/** only (no api leakage). `src/lib/other.ts` → silent. `outside/unrelated.ts` → silent. | _Same scope semantics (pure server-side computation)._ |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-20 | Claude Code | ✅ PASS | Mechanical test via hook-script invocation. Cosmetic layer-count discrepancy remains (preview counts grandparent, blocking uses focused). |
| 2 | 2026-04-21 | Claude Code | ✅ PASS | Re-verified via count-parity smoke (removed in 0.4.0) → replaced by `recall.test.ts` + `hooks.test.ts`. |
| TBD | TBD | Cursor | — | Same scope matcher logic; Blocked on Phase C8. |

#### Issues found (resolved inline)

- ~~Preview text "N guidelines, M technical" counts grandparent scopes but the blocking integer uses focused.~~ Still OPEN. See FOLLOWUPS §"Nudge Preview Layer Counts Include Grandparent Scopes".

---

### Scenario I — `.ignore` grep exclusion

**Action:** with `.aide/memories/` containing JSON memories referencing "JWT",
run `rg` with various flag combinations.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| I | `rg "JWT"` → no results (dotfile skip + `.ignore`). `rg --hidden "JWT"` → no results (`.ignore` active). `rg --hidden --no-ignore "JWT"` → finds memories. `rg "JWT" .aide/memories/` (explicit path) → finds. Drift-repair on direct config.json edit removes `.ignore` entry within ~3s. | _Same grep/rg behavior (editor-agnostic OS-level tool)._ Drift-repair mechanics same. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-20 | Claude Code | ✅ PASS | All 4 grep permutations; toggle gap noted. |
| 2 | 2026-04-21 | Claude Code | ✅ PASS | Drift-repair via `_aide_drift_check` in `read-config.sh` confirmed; `ignoreFile.test.ts` 11/11. |
| TBD | TBD | Cursor | — | Editor-agnostic. |

#### Issues found (resolved inline)

- ~~`aide-memory config memories.hideFromGrep false` did not re-sync `.ignore` file.~~ Fixed — drift-repair + `resyncDerivedArtifacts()` wired into `autoUpdateIfNeeded`. Manual config write also syncs via `applySideEffects`.
- ~~`memories.hideFromGrep` was `public: false` — config override silently ignored.~~ Settings framework gap — see FOLLOWUPS §"Settings Framework Has No User-Settable Keys" (still OPEN).

---

### Scenario Settings — config toggle propagation

**Action:** `aide-memory config hooks.correction.enabled false`. Start new
session. Submit correction. Toggle back.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| Settings | Correction nudge does NOT fire when disabled; fires when re-enabled. No process restart needed — each hook invocation is a fresh node process reading `.aide/config.json` per call. | _Same — config is editor-agnostic._ Cursor has NO MCP hot-reload (bug #3887), but HOOK reloads work per-invocation (bash scripts re-read on each fire). |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-20 | Claude Code | ⚠ PARTIAL | 0 of 18 settings were `public: true`. Fixed in settings-behavior.test.sh wiring. |
| 2 | 2026-04-21 | Claude Code (0.4.2) | ✅ 5 toggles PASS | maxBlocks=0, correction.enabled=false, search.mode=off/block, precompact.mode=off, stop.schedule every:1 vs every:100 all honored. |
| TBD | TBD | Cursor | — | `all-configs-behavior.test.sh` 23 PASS parametrized for both editors in C6. |

#### Issues found (resolved inline)

- ~~All 18 settings `public: false` — `aide-memory config` silently no-op'd.~~ Fixed: promoted user-facing settings to `public: true`; CLI warns/rejects non-public keys.
- ~~Config hot-reload uncertainty mid-session.~~ Still OPEN. See FOLLOWUPS §"Config hot-reload verification".
- ~~Grep/Glob hook rendering into collapsed `(ctrl+o to expand)`.~~ Still OPEN. See FOLLOWUPS §"Grep/Glob hook rendering verification".

---

### Scenario V — `hooks.visible` toggle (hook-visibility fast-follow)

**Action:** `aide-memory config hooks.visible false` → repeat any scenario →
`aide-memory · ...` lines vanish. `true` → lines return.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| V | All `aide-memory · ...` branded systemMessage lines hidden when `hooks.visible=false`. Block enforcement + additionalContext contract unchanged. | _N/A — Cursor has no inline systemMessage channel_ (gap #2). `hooks.visible` is a no-op in Cursor because there's nothing user-visible to toggle. Block `user_message` still renders on deny (only non-configurable surface). Documented in CURSOR_ONBOARDING §5. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-22 | Claude Code (0.4.3) | ✅ PASS | Added in PR #1. `hooks-visibility.test.ts` 12 tests; `all-configs-behavior.test.sh` behavior test. 677 existing tests green. |
| TBD | TBD | Cursor | — | Expected: no-op (silent, but config accepted without error). |

#### Issues found (resolved inline)

- ~~systemMessage was not wired on block paths initially.~~ Fixed in hook-visibility fast-follow: wired on pre-read-recall block, pre-edit-recall block, stop-remember correction-pending + schedule branches.
- ~~FALLBACK message didn't mention aide_update as alternative to aide_remember.~~ Fixed across handlers.ts + all 5 rules templates.
- ~~SessionStart was plain-stdout, couldn't attach systemMessage.~~ Migrated to JSON envelope.

---

### Scenario init-smoke — init generates all files

**Action:** `aide-memory init` in a fresh project.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| init | Creates `.aide/`, `.claude/settings.json`, `.mcp.json`, `.claude/rules/aide-memory.md`, `.ignore`, `.gitignore` entry, `.git/hooks/post-checkout`. | _Adds_ `.cursor/hooks.json`, `.cursor/mcp.json`, `.cursor/rules/aide-memory.mdc` (with `alwaysApply: true`), `.gitignore` entry for the rules file (gitignored per CURSOR_ONBOARDING §4.5). All 7 files generated on a single invocation. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-23 | Claude Code | ✅ PASS | 23/23 PASS in `all-configs-behavior.test.sh`. |
| 2 | 2026-04-23 | Cursor | ✅ PASS (fixture only) | `cursor-init-smoke.test.sh` 25/25 PASS. Live editor validation blocked on Phase C8. |

#### Issues found (resolved inline)

- ~~Hook collision warning not fired when `.cursor/hooks.json` has pre-existing entries (bug #141996 — only first hook executes).~~ Fixed in C1 — init warns on collision.

---

## Walkthroughs (extended procedures for complex scenarios)

### IDB-10 walkthrough (soft on re-read after mid-session new memory)

1. After Scenario A / IDB-1 fires on `src/api/routes.ts` (hard-blocked + recalled),
   session tracking has `file|routes.ts` + IDs for src/api/**.
2. Add new memory mid-session:
   `aide-memory remember --layer technical --scope "src/api/**" --what "mid-session test"`
3. Re-read: `Read src/api/routes.ts again`
4. Expected (Claude Code): soft path — *"PreToolUse:Read says: aide-memory ·
   prompting aide_recall for scoped memories"* (no `(expected flow)` tail).
   Self-track-on-fire (commit b558f93) validated.
5. Expected (Cursor): silent (gap #1 — no `additionalContext` on `preToolUse`).
   Flag-file tracking still updates; agent may not see the nudge.

### IDB-11 walkthrough (hard on sibling file after recall)

1. After IDB-10, create a sibling file: `create src/api/orders.ts as a stub`.
2. Read it: `Read src/api/orders.ts`.
3. Expected: HARD block + `(expected flow)` line. `orders.ts` is a fresh path
   (encountered=false) even though `aide_recall` already covered its scope via
   `routes.ts`. Conservative "fresh file = fresh enforcement" per revert of
   commit fcf3e0b + memory #324.

### IDB-12 walkthrough (flat-project compat at minScopeDepth=1)

1. `aide-memory remember --layer guidelines --scope "src/**" --what "IDB-12 broad-scope"`
2. Read a fresh file in src/: `Read src/auth/token.ts` (if not yet touched).
3. Expected: HARD block. `src/**` (depth 1) is INCLUDED at default
   `minScopeDepth=1`. Validates flat-project compat (memory #318).

### IDB-13 walkthrough (user opt-in strict at minScopeDepth=2)

1. `aide-memory config recall.minScopeDepth 2`
2. Create + read a file whose only covering scope is `src/**`:
   `create src/utils/helpers.ts`, `Read src/utils/helpers.ts`.
3. Expected: SILENT. `src/**` (depth 1 < threshold 2) excluded from per-file
   recall at `minScopeDepth=2`. Memory surfaces at SessionStart only.
4. Reset: `aide-memory config recall.minScopeDepth 1`

---

## Coverage summary

| Scenario | Claude Code | Cursor | Notes |
|---|---|---|---|
| F0 (empty) | ✅ | Expected ✅ | Both silent when store empty. |
| F (softening) | ✅ | ⚠ gap | Soft nudge path silent on Cursor (gap #1); hard-block path at/above threshold works. |
| N (SessionStart) | ✅ | Rules-file channel | Cursor via `.mdc` regen (bugs #157141/#158452). |
| A / IDB-1..13 (recall) | ✅ | Expected ✅ hard / ⚠ soft | Hard block works; soft nudges dropped on Cursor. |
| B (search) | ⚠ bash-grep gap | ⚠ gap | Grep matcher covered; Glob unsupported; soft nudge dropped on Cursor. |
| C (correction) | ✅ | ⚠ one-turn delay | `beforeSubmitPrompt` can't inject context (gap #5). Next Stop delivers via `followup_message`. |
| D (compact) | ✅ | Partial | Cursor sessionStart doesn't fire post-compact (bug #158873); rules-file bridges. |
| E (cross-session) | ✅ | Expected ✅ | Injection content identical; channel differs. |
| G (concurrent) | ✅ | Expected ✅ | session_id-scoped tracking works identically. |
| H (auto-update) | ✅ | Expected ✅ | Requires Cursor restart (bug #3887); init warns. |
| J (MCP down + pending) | ✅ | Expected ✅ | Server-side logic editor-agnostic. |
| K (plan persistence) | Pending | Pending | Behavioral; needs live session. |
| O (dynamic Stop) | ✅ phase 1+2 | Expected ✅ | Delivered via `followup_message` on Cursor. |
| U1 (team decisions) | ✅ 6/7 | Expected same | Agent judgment is ceiling. |
| U2 (correction loop) | ✅ | Expected ✅ | One-turn delay on first detection. |
| U3 (behavioral prefs) | ⚠ mid-session gap | ⚠ same gap | Project-wide mid-session invisibility still OPEN. |
| M (scope precision) | ✅ | Expected ✅ | Editor-agnostic. |
| I (.ignore) | ✅ | Expected ✅ | OS-level. |
| Settings (toggle) | ✅ | Expected ✅ | Per-invocation re-read. |
| V (hooks.visible) | ✅ | N/A | No visibility channel on Cursor. |
| init | ✅ | ✅ fixture | Live Cursor C8. |

Legend: ✅ fully validated · ⚠ partial / known gap · Expected = adapter+test coverage but no live editor run yet · Pending = not yet executed · N/A = not applicable.

---

## Related docs

- `docs/specs/PHASE_0_1_SPEC.md` — master spec; high-level acceptance criteria.
- `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` — non-validation follow-ups
  (Cursor bug tracker, plugin-marketplace, Phase 2+ design items). FIXED items
  are inlined here per scenario.
- `docs/specs/CURSOR_ONBOARDING.md` — Cursor onboarding plan; §1 gap table, §2
  bug tracker, §4 rules-file regeneration workaround, §6 phase plan.
- `docs/specs/VALIDATION_HOOK_VISIBILITY.md` — the hook-visibility work
  (Scenario V was shipped here).
