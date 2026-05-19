# End-to-End Validation — aide-memory

> **0.5.17 supersedes Stop / correction expectations.** The scenarios below describe 0.5.16 behavior (Stop hook decision:block, correction-pending always blocks). With 0.5.17's soft+visible defaults, scheduled Stop fires emit `additionalContext` + chrome (no block) and correction detection emits soft only — the "correction was not stored" reminder is opt-in via `hooks.correction.escalate = "soft" | "block"`. To validate 0.5.17 default behavior, see [`../specs/PHASE_1_HOOK_DEFAULTS_0_5_17.md`](../specs/PHASE_1_HOOK_DEFAULTS_0_5_17.md) §6.3 + §6.5. The scenarios here remain the canonical reference for `hooks.stop.mode = "block"` + `hooks.correction.escalate = "block"` (the explicit opt-in to 0.5.16 behavior).

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

**Audience-mapping (post-2026-04-27, see memories #358 + #359):** Cursor's
`preToolUse` envelope HAS two audience channels — `user_message` (chat-visible
chrome) + `agent_message` (agent-context only, like Claude Code's
`additionalContext`). The earlier "Cursor has no soft channel" claim was an
adapter-bias bug, not a platform gap. We now emit BOTH fields on every fire:

- Hard block (deny): `{permission:"deny", user_message:<chrome>, agent_message:<reason>}`
- Soft (allow): `{permission:"allow", user_message:<chrome>, agent_message:<context>}`
- Stop hook: single `followup_message` field — chrome prefixed inline (e.g.
  `"aide-memory · checkpoint — Anything worth remembering?"`).
- ANSI escape codes stripped for Cursor (Claude Code keeps them).

Stale "Cursor lacks soft channel" / "no additionalContext" claims in tables
below have been updated to reflect verified behavior. Remaining real gaps:
inline `systemMessage` on `preToolUse:allow` user_message visibility (Cursor
3.2.11 quirk — kept in envelope for forward-compat), `sessionStart.additional_context`
(handled via rules-file regen), `beforeSubmitPrompt` additionalContext (handled
via flag-file → next Stop hook).

---

## Pre-flight (REQUIRED before any scenario)

Run every time — fresh session start, after merging a branch, after any
dependency update, after a release-bundle swap, or whenever you're resuming
after a long break. If any check fails, fix that first before opening an
agent session.

```bash
cd /Users/meky/code/aide-v0

# Recommended: single command — runs tsc + vitest + esbuild bundle +
# install-from-tarball smoke + debug-output smoke. Catches drift between
# TypeScript-compiled and esbuild-bundled outputs (the 0.5.0 templates-path
# bug was caught here, not in vitest).
npm run test:full

# Expected (as of 2026-04-27, 0.5.0):
#   - tsc: clean exit, no output
#   - vitest: 773/773 pass (count grows as regression tests are added)
#   - esbuild build:dist: dist/cli/aide-memory.js + dist/memory/{index,cli}.js emitted
#   - install-from-tarball.smoke.sh: 11/11 PASS (bundle integrity + init flow)
#   - debug-output-smoke.test.sh: 15/15 PASS (AIDE_DEBUG + loudError surfaces)
```

If `test:full` is too heavy for an iterative cycle, run pieces individually:

```bash
# Unit tests only (fast)
npm test 2>&1 | tail -5

# Bash smoke suites — each prints "PASS" at the end
bash scripts/hooks/__tests__/settings-behavior.test.sh          # 5 PASS
bash scripts/hooks/__tests__/detect-correction.test.sh          # 17 PASS
bash scripts/hooks/__tests__/all-configs-behavior.test.sh       # 23 PASS
bash scripts/hooks/__tests__/cursor-init-smoke.test.sh          # 25 PASS
bash scripts/hooks/__tests__/debug-output-smoke.test.sh         # 15 PASS

# End-to-end autonomous smokes — spawn real MCP against dirty state.
# Covers H (auto-update), J (pending-memory ingest), drift-repair.
bash scripts/hooks/__tests__/e2e-autonomous.sh
```

**`test:full` MUST pass before starting any scenario.** If you're validating a
freshly-published tarball (not dev-mode), the install-from-tarball smoke
inside `test:full` covers it — dev-mode hides packaging-scoped bugs (missing
bundles, dev-manifest leaks, etc.). Per `docs/RELEASING.md` §4.

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
| F | Soft nudge — `additionalContext` with *"N memories for path… call aide_recall"*. Tool call not forcibly blocked; agent chooses to call `aide_recall`. | **✅ Soft nudge PASSes via `agent_message`** (audience-mapping fix 2026-04-27, #359). Hook emits `{permission:"allow", agent_message:"<nudge>", user_message:"<chrome>"}`. Agent receives the nudge in context. Hard-block path also works at/above threshold (same as Claude Code). Earlier "Cursor `preToolUse` has no soft channel" claim was an adapter-bias bug, not a platform gap (#358). Caveat: in Cursor 3.2.11 the Read hook does not fire when file is open in editor pane — see Scenario F-fileopen. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-19 | Claude Code | ✅ PASS | F2 — soft delivered (debug line 242); agent proactively called `aide_recall`. F2b — agent acted on soft. F4 — search soft delivered (debug line 887); agent acknowledged. |
| 2 | 2026-04-22 | Claude Code | ✅ PASS | Re-verified with `softening.threshold=100` manual variant → pure forceSoft branch validated. |
| 3 | 2026-04-27 | Cursor 3.2.11 | ✅ Soft path PASS via agent_message | Post-audience-mapping fix. Verified soft `preToolUse:Read` after proactive `aide_recall` (encountered=true path) emits `{"permission":"allow","agent_message":"2 memories not yet recalled. Call aide_recall({ids:[7,6]}).","user_message":"<ANSI>aide-memory · <reset>prompting aide_recall for scoped memories"}`. Memory #356. |

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
| 3 | 2026-04-26 | Cursor | ✅ PASS (broad — agent used MCP tool) | Fresh `/tmp/aide-cursor-val` fixture (11 memories seeded). Agent enumerated all 11 memories with correct scope/layer attribution + read 3 source stubs + summarized. **Caveat:** agent reached for `aide_memories` (LIST tool) before answering — proves MCP works + memories accessible, but didn't isolate "rules-file injection alone" path. **Token cost:** 132,653 (full agent turn). **First-run UX gate hit:** aide-memory MCP appeared toggled OFF in Cursor settings on first launch — see FOLLOWUPS §"Cursor MCP first-run UX gate". |
| 4 | 2026-04-26 | Cursor | ✅ PASS (tight — rules-file injection isolated) | New chat in same fixture. Prompt: *"without calling any aide-memory tool, list the things you should NOT store as memories."* Agent answered verbatim with all 4 items from `shared/body.md`'s `**Do NOT store:**` line ("obvious facts readable from code, temporary/session-specific state, secrets/credentials, trivial observations") AND attributed the source to "the rules in the workspace" AND made zero tool calls. **Confirms:** Cursor's `alwaysApply: true` rules engine IS injecting the regenerated `.cursor/rules/aide-memory.mdc` content into agent context every chat. C4 workaround end-to-end verified. Cursor UI also shows the rules file "attached" to each chat — visual affordance for users. |

#### Issues found (resolved inline)

- ~~session-inject.js fetched all memories before filtering — inefficient.~~ Fixed: SQL-level priority filter.
- ~~Post-compact save prompt was injected alongside memories — confusing.~~ Removed; SessionStart now only injects preferences/guidelines.
- ~~Mid-session project-wide memory invisibility.~~ Filed as separate follow-up (see FOLLOWUPS §"Mid-Session Project-Wide Memory Invisibility") — still OPEN.
- **Cursor first-run MCP toggle defaults OFF** (2026-04-26 discovery). Cursor's design — every newly-discovered MCP server stays opt-in until user consent. Documented prominently in `docs/user/editors/cursor.md` "First-time MCP enablement" section + tracked as 0.5.1 fast-follow in FOLLOWUPS doc.

---

### Scenario N-regen — rules-file regenerates on memory write + Cursor picks up new content

**Action:** in the validation fixture, add a new memory via CLI or MCP. Verify
`.cursor/rules/aide-memory.mdc` was rewritten (mtime + content). Open a new
chat in Cursor and ask about the new memory's distinctive marker WITHOUT
calling any aide-memory tool.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| N-regen-1 | N/A — Claude Code uses SessionStart hook for injection; rules-file regen is a Cursor workaround. (Claude Code's rule file IS regenerated post-C4 too, but its session-start path doesn't depend on it.) | `.cursor/rules/aide-memory.mdc` mtime updates within ~1 sec of the write. New memory's `what` content visible in the file under `## Session Preferences` or `## Guidelines` section. |
| N-regen-2 | N/A | New Cursor chat, prompted "without calling any aide-memory tool, do you see <distinctive-marker> in your rules?" → agent quotes the marker verbatim, no tool calls. Confirms Cursor reloads rules file every chat (alwaysApply:true behavior). |

#### Walkthrough (preferred — MCP path, no shell needed)

End-to-end test of the path real users hit: agent stores via MCP →
`maybeRegenRules` in `server.ts` fires → atomic write → new Cursor
chat reloads rules.

1. **In current Cursor chat**, prompt:
   *"remember `REGEN-MARKER-XYZ-9k3` as a guideline."*
   - Agent calls `aide_remember({what: "REGEN-MARKER-XYZ-9k3", layer: "guidelines"})` via MCP.
   - Behind the scenes: `store.add()` → `shouldRegenForMemory()` returns true (guidelines layer) → `triggerRulesRegen()` → atomic tmp+rename of `.cursor/rules/aide-memory.mdc`.
2. **Open a NEW chat** in Cursor (Cmd+N — no carryover).
3. **Prompt**: *"without calling any aide-memory tool, do you see `REGEN-MARKER-XYZ-9k3` in your guidelines?"*
   - ✅ pass: agent confirms it sees the marker, no tool calls. Closes the regen-trigger + reload loop end-to-end.
   - ❌ fail: agent doesn't know about it OR reaches for `aide_memories`. Means either MCP-trigger regen isn't firing OR Cursor isn't picking up new file content.

#### Optional shell-side verification (if Step 3 fails, narrow the cause)

```bash
# Did regen actually write the file?
stat -f '%m %N' /tmp/aide-cursor-val/.cursor/rules/aide-memory.mdc
grep "REGEN-MARKER-XYZ-9k3" /tmp/aide-cursor-val/.cursor/rules/aide-memory.mdc
```

- Marker present in file → regen fired correctly; failure is on Cursor's side (didn't reload).
- Marker absent → MCP-trigger path is broken (`maybeRegenRules` in `server.ts` not firing). Check server logs.

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-26 | Cursor | ✅ PASS (full chain) | Tested via MCP path per memory #342. **Step 1:** in original chat, prompted *"remember REGEN-MARKER-XYZ-9k3 as a guideline."* Agent called `aide_remember` via MCP. User confirmed `.cursor/rules/aide-memory.mdc` was updated on disk with the marker under `## Guidelines`. **Step 2:** opened new Cursor chat (Cmd+N), prompted *"without calling any aide-memory tool, do you see REGEN-MARKER-XYZ-9k3 in your guidelines?"* Agent confirmed seeing it as "the first bullet under ## Guidelines, right above 'Use async/await not callbacks'" with NO tool calls. **Validates:** (a) `maybeRegenRules` MCP-trigger fires correctly post-store.add, (b) atomic tmp+rename writes the new content, (c) Cursor's `alwaysApply: true` reload-every-chat behavior holds — new chats see the latest rules content. **Closes out C4 dynamic rules-file regeneration end-to-end.** |

#### Issues found (resolved inline)

_None yet._

---

### Scenario A0 — Cursor user-mentioned file path

**Action:** in a fresh Cursor chat with empty tracking, type a prompt that
mentions a file path explicitly (e.g. *"read src/utils/dates.ts"*).

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| A0 | Same as A1 — Claude Code's Read tool is always agent-mediated regardless of how the user phrased the request. | **Same as A1 — Read tool fires + `preToolUse:Read` fires + `permission: deny` honored.** Cursor 3.2.11 invokes the Read tool for user-mentioned paths just like for autonomous discovery (verified 2026-04-27, see #345). The earlier hypothesis that Cursor auto-attaches file content and bypasses Read was WRONG — it was confounded with the Node ABI mismatch silent-failure that's now fixed by the libsql migration. |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-26 | Cursor | ⚠ Inconclusive (superseded) | Earlier run reported "PASS via different mechanism — no preToolUse:Read fired." Now believed to have been confounded by the Node ABI mismatch (memory #348): hooks silently failed, agent proceeded via rules-file guidance, looked like auto-attach. Re-run on 2026-04-27 (post-libsql) shows Read tool DOES fire. |
| 2 | 2026-04-27 | Cursor 3.2.11 | ✅ PASS | Post-libsql migration. Fresh chat. Prompt: *"read src/utils/dates.ts"*. Hooks panel: beforeSubmitPrompt (empty) → **preToolUse:Read fired** with `tool_input.file_path = /private/tmp/aide-cursor-val/src/utils/dates.ts` → `pre-read-recall.sh` returned `{"permission":"deny","user_message":"1 memories for ... (1 technical) — topics: timezone-aware. Call aide_recall({paths: [...]})."}` → Cursor honored deny → agent called `aide_recall({paths:[...]})` → Read retried successfully. **End-to-end indistinguishable from A1.** Memory #345 updated to reflect the corrected understanding. |

#### Issues found (resolved inline)

- ~~"Cursor auto-attaches mentioned files in chat — bypasses preToolUse:Read hook."~~ **Hypothesis was wrong** — disproven on 2026-04-27 with empirical evidence. The original "OUTPUT empty" symptoms were the Node ABI mismatch (memory #348), not auto-attach. Per memory #351, removed from external docs. Current truth: Read tool fires for user-mentioned paths in Cursor 3.2.11 just like for autonomous discovery.
- **Same-session re-read may answer from chat history, not invoke Read.** Observed 2026-04-27: a follow-up prompt "read it again" on a file already in chat context did NOT invoke a fresh Read tool. Agent answered from prior-turn content. This is single-session context-reuse, not auto-attach — different file → Read fires fresh. Doesn't affect the first-time-read-of-file safety net.

---

### Scenario A — path-based recall + ID-based blocking

**Action:** cross threshold (≥10 mems), read `src/api/routes.ts`, re-read, read
different-scope file, read unscoped file. Covers IDB-1..IDB-8 inline.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| A1 / IDB-1 | First read: hard block. `decision: block` with path-based message *"N memories for src/api/routes.ts (L1, L2) — topics: ... Call aide_recall({paths: [...]})"*. | Hard block via `{permission:"deny", user_message:<chrome>, agent_message:<reason>}` (audience-mapped post-#359). User sees chrome (`aide-memory · …`) in Cursor chat, agent receives the reason+IDs in `agent_message` context. Same semantic effect as Claude Code. **Caveat:** verified only when file is NOT already open in the editor pane — see Scenario F-fileopen for the editor-cached Read coverage gap. |
| A3 / IDB-2 | Re-read: SILENT. All scoped IDs already tracked. | _Same — silent._ `file\|` + `ids\|` tracking works identically (no emit required, writes flag files only). |
| A4 / IDB-3 | Sibling file in same dir, IDs covered: SILENT. | _Same — silent._ |
| A5 / IDB-5 | Different-dir file (e.g. `src/auth/middleware.ts`): hard block for auth-scoped mems. | Hard block via `permission: deny`. |
| A6 / IDB-6 | File with no scoped memories (`README.md`): SILENT. | _Same — silent._ |
| A7 | Edit uses same tracking line (`ids\|`); covered IDs → silent Edit. | _Same — silent._ Edit (Cursor matcher `Write`) routes through same pre-edit-recall handler; tracking shared. |
| IDB-4 | Sibling read with some IDs missing: hard block listing only the missing IDs. | _Same — hard block via `permission: deny`._ |
| IDB-7 | After SessionStart injection, read file where scoped IDs partially covered: hard block with missing IDs. | _Same_ — session-inject writes IDs before first turn (Claude Code) or rules-file injection IDs get written on read (Cursor variant). |
| IDB-8 | After compact/clear/resume, re-read: hard block (tracking reset). | _Same — hard block._ PreCompact clears tracking identically. Cursor compact has a separate quirk (bug #158873) but tracking file clearing works. |
| Scn1 / IDB-10 | Re-read of previously-encountered file with a NEW mid-session memory added: SOFT (`additionalContext`) — "1 memory not yet recalled. Call `aide_recall({ids: [N]})`". | **✅ Soft path now PASSes** via `agent_message` (audience-mapping fix 2026-04-27, memory #359). Hook emits `{permission:"allow", agent_message:"<reason>", user_message:"<chrome>"}`. Agent receives the soft nudge in context. **Caveat:** in Cursor 3.2.11 this only fires when the file is NOT already open in the editor pane — see Scenario F-fileopen below for the editor-cached Read coverage gap. |
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
| 4 | 2026-04-26 | Cursor | ✅ PASS via proactive recall (soft path) | Fresh chat in `/tmp/aide-cursor-val`. Prompt: *"look at all the source files in this project and tell me what's there"* (autonomous discovery — no user-mentioned paths). Agent **proactively recalled** before reading per rules-file guidance, so `pre-read-recall.sh` correctly stayed silent (coveredCount === scoped_ids.length). Validates the proactive-recall path. **Did NOT exercise the hard-block adversarial path** — see Run 5 below. |
| 5 | 2026-04-27 | Cursor 3.2.11 | ✅ A1 + A1-edit hard-block PASS | Post-libsql migration. Fresh chat in `/private/tmp/aide-cursor-val`. **A1 (autonomous Read with adversarial prompt):** *"Without calling any aide-memory tools first, use the Read tool directly to open src/api/routes.ts and tell me what's in it."* `preToolUse:Read` fired → `{"permission":"deny","user_message":"2 memories for src/api/routes.ts not yet recalled. Call aide_recall({ids:[7,6]})."}` → Cursor honored deny → agent called `aide_recall({ids:[7,6]})` → Read retried successfully. ID-based message branch (vs path-based) — coveredCount > 0 because rules-file injection had pre-tracked some scoped_ids; missing 2 of 5 src/api/** scoped IDs still triggered the block. **A1-edit (autonomous Write):** *"Add a JSDoc comment above the export in src/auth/middleware.ts using the Edit tool. Don't call aide_recall first."* `preToolUse:Write` fired → `{"permission":"deny","user_message":"2 memories for ...auth/middleware.ts. Call aide_recall({paths:[...]}) before editing."}` → deny honored → agent recalled → Edit succeeded. **Closes the deny-honored gap that confused Run 4 + the originally-suspected forum #154377 — Cursor honors deny correctly when our hook actually emits one.** |
| 6 | 2026-04-27 | Cursor 3.2.11 | ✅ BLOCK → SILENT progression PASS | conv `89f5d173`. Post-`tool_output`→`tool_response` adapter fix (memory #364). 19:33:35 preToolUse:Read fired DENY on missing [7,6] → agent recalled via `aide_recall({paths:["src/api/routes.ts"]})` → 19:33:50 next preToolUse:Read OUTPUT (empty) — **SILENT post-recall**. Pre-fix this would have re-fired soft with "missing [7,6]" (the bug that motivated the fix). Empirical tracking-file verification (`cat .aide/cache/recalled-paths-89f5d173-...txt`) showed `ids|2,3,5,6,7,9,10,11,12,13,15,16,18` — IDs 6, 7 successfully written by `track-recall-post.sh` after the field-name remap. Closes the silent-tracking-failure gap. Memories #364 + #368. |

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
| B1 | Soft nudge — *"N aide memories match 'rate'. Call aide_search..."*. Agent calls `aide_search({keyword: ...})`, then Grep. Summary includes both. | **✅ Soft nudge PASSes** via `agent_message` (audience-mapping fix 2026-04-27, memory #359). Hook emits `{permission:"allow", agent_message:"<nudge>", user_message:"<chrome>"}`. Cursor's Grep matcher IS supported (`matcherMap.search = 'Grep'`); Glob matcher unsupported (null in matcherMap) → semantic/glob searches go uncovered. |
| B2 | Grep for unmatched term: SILENT. | _Same — silent._ |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-17 | Claude Code | ✅ B1/B2 PASS | Session B (Round 2) — 199-char additionalContext, agent called aide_search in 6ms. |
| 2 | 2026-04-22 | Claude Code (0.4.3) | ⚠ PARTIAL | Grep tool appears deferred in CC 2.1.118 — Claude falls back to Bash+grep, which misses the matcher. See FOLLOWUPS §"Bash-grep fallback coverage" (still OPEN, ELEVATED priority). |
| 3 | 2026-04-27 | Cursor 3.2.11 | ✅ PASS — ideal agent flow | Fresh chat. Prompt: *"search the codebase for \"JWT\""*. Agent acted on rules-file guidance ("prefer aide_search as FIRST step") and called `aide_search({keyword:"JWT"})` BEFORE Grep — found stored memory `[1] Use JWT for auth [src/auth/**]`. Then fell back to `Grep:JWT` for literal-string matching (none found). Hook timeline: postToolUse on `MCP:aide_search` → `track-search.sh` recorded the keyword in `.aide/cache/searched-queries-<session>.txt`. preToolUse on Grep:JWT → `pre-search-nudge.sh` fired → emitted EMPTY output (correctly silent — already covered via prior aide_search; nudge dedupes per memory #297). Agent's final answer correctly distinguished "stored context says X" from "code has no literal matches." **Picture-perfect end-to-end search flow.** |
| 4 | 2026-04-27 | Cursor 3.2.11 | ✅ B+ adversarial PASS via agent_message | Post-audience-mapping fix. Adversarial prompt forced Grep before aide_search → `pre-search-nudge.sh` fired → emitted `{"permission":"allow","agent_message":"1 aide memories match 'Rate limit' (Rate limit 50 req/min per user). Call aide_search({keyword:'Rate limit'}) if not already in context.","user_message":"<ANSI>aide-memory · <reset>prompting aide_search for \"Rate limit\" — 1 matching memory"}`. Agent received the agent_message nudge in context. **The previously-documented "Cursor gap" was our adapter bug, not a platform limitation — confirmed bias-correction in #358.** Memory #356 has full empirical evidence. |
| 5 | 2026-04-27 | Cursor 3.2.11 | ✅ Smoke G PASS (hook side); behavioral observation on agent compliance | conv `cc027c84` + `6abfbaae` (re-runs with + without suppression). Prompt: *"Use Grep to search this codebase for the literal string 'rate limit'."* preToolUse:Grep fired → pre-search-nudge.sh emitted exact audience-mapped envelope with `permission:"allow"` + `agent_message` (full nudge) + `user_message` (chrome). **Hook-side: PASS.** Agent-side: did NOT call `aide_search` after the nudge in either run. Root cause traced to documented rules-file exception: *"Fall back to code-level search tools ONLY after aide_search: For pure syntactic lookups (exact function name, **specific string literal**)"*. The prompt explicitly asked for "literal string" search, fitting the exception cleanly. Agent compliance with rules-file guidance: ✅. Trade-off documented: literal-string lookups for terms that ARE concepts (e.g. "rate limit") miss potentially-relevant stored knowledge. **Triggered nudge-wording sharpening:** dropped redundant "if not already in context" qualifier from soft-path nudge (memory #370 — hook already gates on alreadySearched, qualifier was permissive defensive language). |
| 6 | 2026-04-27 | Cursor 3.2.11 | ✅ Smoke G post-sharpen — sharpened wording verified, literal-string exception still wins | conv `d068e678`. Same prompt as Run 5 ("Use Grep to search this codebase for the literal string 'rate limit'.") — preToolUse:Grep OUTPUT now ends `Call aide_search({keyword: 'rate limit'}).` (period, no qualifier — wording fix live). Agent still skipped aide_search per the rules-file "specific string literal" exception. Verified `searched-queries-d068e678-...txt: No such file` (no aide_search invoked). **Hook side: PASS (sharpened format verified). Agent behavior: per rules.** Trade-off documented for 0.5.x: literal-string exception applies even when the term has semantic meaning ("rate limit" is also a stored concept) — fast-follow consideration whether to tighten exception to identifier-shaped tokens only. Memory #370. |
| 7 | 2026-04-27 | Cursor 3.2.11 | ✅ Picture-perfect end-to-end on generic search | conv `325da50b`. Prompt: *"Search for rate limit in the codebase"* (no "literal string" qualifier). Agent **proactively** called `aide_search({keyword:"rate limit"})` per "prefer aide_search FIRST" rules guidance → track-search.sh wrote keyword to dedup file → next preToolUse:Grep ("rate[\\s_-]?limit" pattern) correctly **silent** (dedup branch fired, alreadySearched=true). Agent synthesized stored knowledge + literal grep results into a single answer. **End-to-end "concept search" flow on Cursor 3.2.11 verified post all-fixes.** |

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
| 5 | 2026-04-27 | Cursor 3.2.11 | ✅ C end-to-end PASS (Smoke C) | conv `a4ab6525`. Prompt: *"No, use snake_case for API parameters not camelCase."* → beforeSubmitPrompt:detect-correction silently set `correction-pending-<sid>.txt`. Agent picked smart path: `aide_search({keyword:"camelCase"})` → found memory [2] "API uses camelCase [src/api/**]" → `aide_update({id:2, content:"API parameters use snake_case"})` (using `content` alias on aide_update — verifies #367 fix on update too) → track-remember.sh fired → cleared correction-pending flag. Stop at 21:40:54 OUTPUT empty (flag cleared). User then ran a separate session that didn't store → next Stop fired correction-pending chrome `"aide-memory · correction from this turn was not saved — prompting aide_remember"` confirming the chrome-prefix path works. Tracking file inspection: `correction-pending-a4ab6525-...txt` doesn't exist (cleared) ✓; memory 2 now reads "API parameters use snake_case" ✓. **Verifies (a) detect-correction fires on Cursor for `no, use ...` pattern, (b) flag-write happens silently per gap #5, (c) track-remember clears flag on aide_update, (d) Cursor stop chrome-prefix path works, (e) content alias works on aide_update.** Memory #364 has full evidence. |

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
| 3 | 2026-04-27 | Cursor 3.2.11 | ⚠ Platform-gap (not testable in Cursor's native flow) | **Cursor 3.2.11 has no manual `/compact` UI surface — only "clear" (chat reset, fires no preCompact event).** Cursor's hook event schema DOES include `preCompact`, so it likely fires on auto-compact when context fills, but reproducibly testing that requires flooding the context window — expensive and slow. Since the underlying mechanism (preCompact → cleanup → tracking reset) is verified end-to-end on Claude Code, this is recorded as a Cursor-platform gap rather than a regression. **Expected behavior on Cursor (untested): when Cursor's auto-compact does fire preCompact, our `pre-compact-save.sh` clears `.aide/cache/recalled-paths-<session>.txt` for the same session_id, and the next read re-blocks normally — same code path as Claude Code, only the trigger differs.** Documented as a known Cursor-platform limitation, not blocking 0.5.0. |

**Note on `clear` vs `preCompact` (Cursor 3.2.11):**

- **Clear** (chat reset button) starts a NEW session with a NEW `conversation_id` → tracking files are keyed by session_id → the new session has no tracking by construction (file just doesn't exist yet for the new ID). No preCompact fires; no special handling needed.
- **preCompact** fires on auto-compact while session_id stays the same → tracking would be stale → our hook explicitly clears the file.

So for Cursor we don't need a "clear" hook — the new-session-id mechanism handles clear implicitly. Same pattern works in Claude Code's `/clear` (new session) vs `/compact` (preCompact fires).

#### Issues found (resolved inline)

- ~~hookSpecificOutput format invalid for PreCompact — only top-level decision/reason/systemMessage accepted.~~ Fixed (confirmed architectural Claude Code constraint; PreCompact simplified to exit 0 cleanup-only).
- ~~PreCompact two-phase blocking never actually blocked.~~ Refactored; PreCompact is cleanup-only.
- ~~PreCompact didn't clear the current session's recalled-paths file.~~ Fixed in commit `6af5001`.

---

### Scenario N-mismatch — Node ABI version drift across install/runtime (per #350)

**Background:** in 0.4.x and earlier, aide-memory used `better-sqlite3` which
binds directly to V8 internals. The compiled `.node` binary is tied to a
specific NODE_MODULE_VERSION (Node 18 = ABI 108, Node 22 = ABI 127, etc.).
If the user's install-time Node and the editor's hook-execution Node had
different ABIs, `require('better-sqlite3')` threw silently (absorbed by the
hook dispatcher's top-level catch), and every hook produced empty output.
This is the bug class documented in memory #348 — caused hours of
mis-attribution to "Cursor doesn't honor permission:deny" before the root
cause was found.

**Fix (0.5.0):** migrated to `libsql` (Turso), which uses Node-API (N-API).
N-API is a stable C ABI maintained by Node — modules built against N-API
work unchanged across all supported Node majors. Same `.node` binary loads
on Node 18, 20, 22, 24+. The bug class is eliminated by construction
(memory #354 has the empirical proof from the spike).

**Action:** verify that aide-memory works when install-time Node ≠ runtime
Node ABI. Two complementary checks.

| # | Expected (Claude Code) | Expected (Cursor) |
|---|---|---|
| N-mismatch-1 | `[AIDE_DEBUG/binding] loaded lib=libsql node=<v> abi=<n> ...` shows successful binding load with whatever Node Claude Code uses for hook execution. | _Same — observable in Cursor's Hooks output panel when `AIDE_DEBUG=binding` is set on a hook command in `.cursor/hooks.json` (or wrapped inline as `AIDE_DEBUG=binding bash ...`)._ |
| N-mismatch-2 | After installing aide-memory under Node X (e.g. 18) and switching to Node Y at runtime (e.g. 22), hooks still fire correctly — no `NODE_MODULE_VERSION` errors, no silent empties. With libsql N-API, this is by construction. | _Same — Cursor bundles its own Node which can differ from the user's terminal Node. The original 0.5.0 bug surfaced precisely this case._ |
| N-mismatch-3 (defense-in-depth) | If a binding load DOES fail for any reason (corrupt install, missing platform package), the hook dispatcher emits a single `[AIDE_ERROR]` line via `loudError()` with an actionable hint (e.g. `reinstall aide-memory or run \`npm rebuild libsql\``). Hook still exits 0; agent flow not interrupted. | _Same — error classification + hint are editor-agnostic._ |

#### Runs

| Run | Date | Tool | Result | Notes |
|---|---|---|---|---|
| 1 | 2026-04-27 | spike-libsql worktree | ✅ N-mismatch-2 PROVEN by construction | Same libsql `.node` binary built under Node 22 (ABI 127) loaded successfully under Node 18 (ABI 108) without rebuild. PRAGMA, FTS5, prepared statements all worked. Memory #354 captures the empirical evidence. This is the structural fix — re-running under varying Node majors is a sanity check, not a true verification because N-API guarantees the property. |
| 2 | 2026-04-27 | Bash smoke (`debug-output-smoke.test.sh`) | ✅ N-mismatch-1 + N-mismatch-3 PASS | 15/15 checks. `AIDE_DEBUG=binding` produces `[AIDE_DEBUG/binding] loaded lib=libsql node=22.22.2 abi=127 platform=darwin-arm64` on store init. `AIDE_ERROR` lines emit when failures induced (unknown hook event tested as proxy for the error-classification path). |
| TBD | TBD | Cursor (live) | — | Pending: enable `AIDE_DEBUG=binding` in one entry of `/private/tmp/aide-cursor-val/.cursor/hooks.json`, restart Cursor, fresh chat, trigger a Read. Hooks output panel should show `[AIDE_DEBUG/binding] loaded ...` line confirming Cursor's bundled Node version + that libsql loaded cleanly under it. ~2 minutes total. |
| TBD | TBD | Claude Code | — | Same shape as Cursor — set `AIDE_DEBUG=binding` in `.claude/settings.json` env field for one hook + verify line surfaces in `claude --debug` output. |

#### Issues found (resolved inline)

- **0.5.0 binding ABI mismatch silent-fail (the bug that started all this)** — Fixed by migrating from better-sqlite3 (V8-bound) to libsql (N-API). Memory #348 captures the original silent-failure mode; #353 captures the N-API-as-standard-fix research; #354 captures the spike result; #355 captures the implementation choices in `src/memory/internal/` (binding-loader factory, debug helper, dispatcher error classification).

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
| 4 | 2026-04-27 | Cursor 3.2.11 | ✅ Cross-session via Cmd+Q restart PASS (Smoke E) | conv `cc027c84` (post-restart). Setup: prior session updated memory 2 from "API uses camelCase" → "API parameters use snake_case" via `aide_update` (memory write triggered `maybeRegenRules` → atomic rewrite of `.cursor/rules/aide-memory.mdc`). Then Cmd+Q (full Cursor process exit) → re-launch → Cmd+N fresh chat. Prompt: *"Without calling any aide-memory tools, what convention does this project use for API parameters — camelCase or snake_case?"* Agent responded: *"The project uses snake_case for API parameters."* with **zero MCP tool calls** (only beforeSubmitPrompt + stop fired, no preToolUse:MCP:* events in the log). Verified via `stat`: rules-file mtime = 17:40:51 (matches the aide_update timestamp); via `grep`: `snake_case` present in regenerated mdc. **End-to-end cross-session memory propagation on Cursor 3.2.11 verified:** write → MCP-trigger regen → atomic rules-file rewrite → Cursor exit → restart → rules-engine reload-on-launch → SessionStart-equivalent inject via `alwaysApply: true` → agent reads with zero tool calls. |

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
| V | All `aide-memory · ...` branded systemMessage lines hidden when `hooks.visible=false`. Block enforcement + additionalContext contract unchanged. | **Partial — partially toggleable on Cursor.** Cursor's `user_message` renders chrome on `permission:deny` (chat-visible) and is logged in the Hooks output panel under `permission:allow` (panel-visible only, not in chat per Cursor 3.2.11). When `hooks.visible=false`, the adapter omits chrome from `user_message`; `agent_message` (the agent-context channel) is unaffected. Effect: deny-line chrome disappears from chat; agent still receives the deny reason via `agent_message`. ANSI escapes are stripped for Cursor regardless (Cursor doesn't render terminal ANSI). |

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

### Scenario F-fileopen — Cursor per-Read coverage with file-open + suppression

**Background:** verified empirically 2026-04-27 (memory #363) — Cursor 3.2.11
does NOT fire `preToolUse:Read` when the target file is already open in the
editor pane. `preToolUse:Write` (Edit matcher) fires reliably regardless of
editor state. This documents the floor of safety-net coverage and tests
whether the rules-file injection (`body.md` "Even when a file is visible to
you, call aide_recall…" bullet added 2026-04-27) compensates for the hook gap.

**Setup:** fresh chat in `/private/tmp/aide-cursor-val` fixture (13+ memories
seeded, `memories.softening.threshold=5`, Cursor 3.2.11). Pick a file with
≥1 scoped memory NOT yet in the SessionStart-injected ID set so a hard-block
COULD fire when hook engages. Regenerate the fixture rules file first so the
new "even when visible to you" bullet is present:

```bash
cd /private/tmp/aide-cursor-val
node /Users/meky/code/aide-v0/dist/cli/aide-memory.js init --update-rules
grep "Even when a file" .cursor/rules/aide-memory.mdc   # confirm
```

**4-cell matrix (cross axes — file editor state × prompt suppression):**

| # | File state | Prompt | What to verify | Why this matters |
|---|---|---|---|---|
| F-fo-1 | Closed (not in editor) | Normal — no suppression | Agent calls `aide_recall` per rules-file guidance; `preToolUse:Read` fires reliably; either hard-block (first read) or silent (already covered). | Best case — both safety nets engaged. |
| F-fo-2 | Closed | Suppression: *"Without calling any aide-memory tools first, use the Read tool directly to open X"* | `preToolUse:Read` fires hard-block; chrome may render in Hooks panel; agent forced to recall via deny. | Tests hook safety net in isolation (rules-file overridden by prompt). |
| F-fo-3 | Open in editor | Normal — no suppression | `preToolUse:Read` does NOT fire (verified gap, #363). Agent must rely on rules-file guidance — does it call `aide_recall` on its own per the new bullet? | Tests rules-file-only fallback path — the **NEW body.md bullet's value**. |
| F-fo-4 | Open in editor | Suppression | `preToolUse:Read` does NOT fire AND agent told to skip — worst case; agent likely proceeds without memory awareness. | Documents the floor of safety-net coverage. |

**Capture per cell:**
- Conversation ID
- Did agent call `aide_recall`? (Y/N — observable in MCP tool-call chrome OR transcript)
- Did `preToolUse:Read` fire? (Y/N — Hooks output panel)
- Did agent reference stored memories in its response? (Y/N qualitative — proves whether memory awareness reached the agent)
- File-tracking state at end: `cat .aide/cache/recalled-paths-<sid>.txt`

#### Runs

| Run | Date | Tool | Cell | Result | Notes |
|---|---|---|---|---|---|
| 1 | 2026-04-27 | Cursor 3.2.11 | (proto F-fo-3 controlled experiment) | ⚠ Hook does not fire when file open in editor | Verified via brand-new file + editor-open variable. Memory #363. |
| 2 | 2026-04-27 | Cursor 3.2.11 | **F-fo-1** (closed, no suppression) | ✅ PASS | conv `ef1768eb`. Agent's flow: `Grep:**/src/api/routes.ts` (silent) → **proactive `aide_recall({paths:["src/api/routes.ts"]})`** per rules-file guidance → soft `preToolUse:Read` fired `{permission:"allow", agent_message:"2 memories ... Call aide_recall({ids:[7,6]})", user_message:"aide-memory · …"}` → Read succeeded. Picture-perfect flow. |
| 3 | 2026-04-27 | Cursor 3.2.11 | **F-fo-2** (closed, suppression) | ✅ PASS | conv `d2409c82`. Prompt suppressed aide-memory call. `preToolUse:Read` fired hard-block with audience-split: `{permission:"deny", user_message:"aide-memory · prompting aide_recall for scoped memories (expected flow)", agent_message:"2 memories ... Call aide_recall({ids:[7,6]})."}` → Cursor honored deny → agent recalled → Read retried successfully. **Hook safety net works in isolation.** |
| 4 | 2026-04-27 | Cursor 3.2.11 | **F-fo-3** (open, no suppression) — **KEY CELL** | ✅ PASS via rules-file bullet | conv `a348d125`. `preToolUse:Read` did NOT fire for routes.ts (gap confirmed). Despite no hook, **agent followed the new body.md "Even when a file is visible to you, call aide_recall" bullet** and called `aide_recall({paths:["src/api/routes.ts"]})` proactively at 19:04:52. postToolUse returned 12 memories. **Memory awareness reached the agent with zero hook fires — rules-file guidance fully compensates for the editor-cached-Read coverage hole** when no suppression is present. Memory #364. |
| 5 | 2026-04-27 | Cursor 3.2.11 | **F-fo-4** (open, suppression) | ❌ Floor of coverage (documented gap) | conv `9a5b9375`. `preToolUse:Read` does NOT fire AND agent told to skip aide-memory tools. Agent did NOT call aide_recall. Stop fired at 19:05:21 with no relevant hook fires. **Worst case** — requires deliberate adversarial prompt + file open. No further mitigation possible without upstream Cursor fix for editor-cached `preToolUse:Read` OR stronger override-resistant prompt language. Documented gap. |

**Edit-equivalent confirmation (single row, low priority):**
- Edit hard-block fires reliably regardless of file-open state (verified). The
  suppression-vs-no-suppression axis on Edit only tests whether the agent
  follows the hook deny vs prompt instruction — a less interesting case
  because the Edit safety net is already empirically reliable.

**What this scenario means for the product framing:**
Cell F-fo-3 (file open, no suppression) is the realistic user workflow —
developer has files open in their editor and asks the agent to do something.
The new `body.md` bullet ("Even when a file's content is already visible to
you, call aide_recall…") was added specifically to make this cell pass. If
empirical testing shows the agent does NOT call `aide_recall` in F-fo-3, the
rules-file guidance is insufficient and we need additional reinforcement
(stronger prompt language, or accept the gap and document it as a Cursor
platform limitation pending an upstream FR).

#### Issues found (resolved inline)

- **Cursor preToolUse:Read editor-open gap (NEW DISCOVERY 2026-04-27)** —
  documented in `docs/user/editors/cursor.md` "Per-Read coverage gap on
  Cursor" section + `body.md` rules-file injection. Mitigation:
  per-Edit safety net + rules-file guidance. Memory #363 has the evidence
  chain + ruled-out wrong hypotheses. Upstream FR pending (post-0.5.0).

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
5. Expected (Cursor 3.2.11, post-audience-mapping fix 2026-04-27): SOFT path
   PASSes — hook emits `{permission:"allow", agent_message:"<reason>",
   user_message:"<chrome>"}`. Agent receives the soft nudge in context via
   `agent_message`. Chrome may not render in chat under `allow` but logs in
   the Hooks output panel. **Caveat: only fires when the file is NOT open in
   the editor pane** — see Scenario F-fileopen below for the editor-cached
   Read coverage gap.

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
| F (softening) | ✅ | ✅ | Soft nudge path NOW PASSes via `agent_message` (audience-mapping fix 2026-04-27, #359). Hard-block path at/above threshold works. |
| N (SessionStart) | ✅ | Rules-file channel | Cursor via `.mdc` regen (bugs #157141/#158452). |
| A / IDB-1..13 (recall) | ✅ | ✅ hard / ✅ soft | Hard block works; soft nudges NOW PASS via `agent_message` (#359). Caveat: Read hook does not fire when file is open in editor — see F-fileopen. |
| B (search) | ⚠ bash-grep gap | ✅ via agent_message | Grep matcher covered; Glob unsupported; soft nudge NOW PASSes via `agent_message` (B+ adversarial verified 2026-04-27, #356). |
| C (correction) | ✅ | ✅ end-to-end (one-turn delay by design) | Verified Smoke C 2026-04-27 (Run 5, conv `a4ab6525`): detect-correction fires, flag-write silent, agent picked smart `aide_search → aide_update` path with `content` alias, track-remember cleared flag, manual-stop chrome verified. `beforeSubmitPrompt` still can't inject in-turn context (gap #5 — platform). Next Stop delivers via `followup_message` chrome-prefixed inline. |
| D (compact) | ✅ | ⚠ Not testable | Cursor 3.2.11 has no manual `/compact` UI. Auto-compact preCompact event likely fires but expensive to reproducibly trigger; recorded as platform gap, not regression. |
| E (cross-session) | ✅ | ✅ end-to-end via Cmd+Q restart | Verified Smoke E 2026-04-27 (Run 4, conv `cc027c84`): aide_update → maybeRegenRules → atomic mdc rewrite → Cursor exit → re-launch → fresh chat reads regenerated content with zero MCP calls. mtime + grep evidence captured. |
| G (concurrent) | ✅ | Expected ✅ | session_id-scoped tracking works identically. |
| H (auto-update) | ✅ | Expected ✅ | Requires Cursor restart (bug #3887); init warns. |
| J (MCP down + pending) | ✅ | Expected ✅ | Server-side logic editor-agnostic. |
| K (plan persistence) | Pending | Pending | Behavioral; needs live session. |
| O (dynamic Stop) | ✅ phase 1+2 | ✅ phase 1 verified | Phase 1 (every-3 cadence) implicitly verified 2026-04-27 via Smoke C session (memory #369): stop-count file = 15 + chrome-fires observed at counts 3, 6, 9. Followup_message channel + chrome-prefix design works. Phase 2/3 untested but mechanism is editor-agnostic. |
| U1 (team decisions) | ✅ 6/7 | Expected same | Agent judgment is ceiling. |
| U2 (correction loop) | ✅ | Expected ✅ | One-turn delay on first detection. |
| U3 (behavioral prefs) | ⚠ mid-session gap | ⚠ same gap | Project-wide mid-session invisibility still OPEN. |
| M (scope precision) | ✅ | Expected ✅ | Editor-agnostic. |
| I (.ignore) | ✅ | Expected ✅ | OS-level. |
| Settings (toggle) | ✅ | Expected ✅ | Per-invocation re-read. |
| V (hooks.visible) | ✅ | ⚠ partial | Strips chrome from `user_message`; `agent_message` unaffected. ANSI escapes always stripped on Cursor. |
| **F-fileopen** (new) | N/A | ✅ 3/4 cells PASS | preToolUse:Read does not fire when file open in editor. F-fo-1/2/3 PASS via rules-file mitigation + Edit safety net. F-fo-4 (open + adversarial suppression) is documented floor of coverage. Memory #363 (gap) + #364 (4-cell verification 2026-04-27). |
| **N-mismatch** (new) | ✅ | ✅ by construction | libsql N-API ABI-stable across Node 18/20/22/24+. The bug class that started this is eliminated. Memory #354. |
| **Smoke A — content alias** (new 2026-04-27) | n/a | ✅ verified live | conv `cbd48dc9`. Agent called `aide_remember({content:"content-alias-smoke 2026-04-27", ...})` → MCP `isError:false` on first try, no `-32602` zod recovery loop. Memory id 19 stored. Verifies #367 alias fix in the wild. Smoke C (Run 5) also verified the alias on `aide_update`. |
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
