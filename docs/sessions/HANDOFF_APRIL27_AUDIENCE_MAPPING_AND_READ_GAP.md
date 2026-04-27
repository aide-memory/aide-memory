# Handoff — 2026-04-27 (after audience-mapping work + Read coverage discovery)

Prior compaction-handoff doc: `HANDOFF_APRIL27_CURSOR_VALIDATION.md` covered
the libsql-migration and binding-mismatch root cause. This doc picks up from
**after** that work landed.

---

## TL;DR

- **0.5.0 ship status:** code is in a green, shippable state. All major
  technical work is done. Final docs phase is partially complete.
- **Branch:** `feature/phase-1-cursor-support` — many uncommitted changes
  (see "What's in the working tree" below).
- **Tests:** `npm run test:full` — 768/768 vitest + 11/11 install-from-tarball
  smoke + 15/15 debug-output smoke. All green.
- **Critical 0.5.0 finding:** Cursor's per-Read hard-block has a real
  coverage gap when files are open in the editor pane. Verified empirically.
  Documented honestly in `docs/user/editors/cursor.md`. NOT a regression —
  Edit safety net + rules-file injection still cover the value-prop.

---

## What was done in this session (post-compaction restart at top)

### 1. libsql migration (closes the 0.5.0 binding-mismatch bug class)
- Migrated from `better-sqlite3` (V8-bound, breaks across Node versions) to
  `libsql` (N-API, ABI-stable across Node 18/20/22/24+).
- Spike result, evidence, perf comparison: memory **#354**.
- Patches required: 6 import sites, `bufferToVector` polyfill in
  `embeddings.ts`, test cleanup `rmSync` change in 10 test files,
  `package.json` + `package.aide-memory.json` dep swap, esbuild externals.
- Spike branch retained at `.claude/worktrees/spike-libsql/` for reference.

### 2. Diagnostic surface (`AIDE_DEBUG` + `loudError`)
- New `src/memory/internal/debug.ts` — `debug(category, message)` opt-in
  via `AIDE_DEBUG=hooks|mcp|binding|recall|all` env var, plus
  `loudError(message, hint?)` always-on stderr for failure surfacing.
- New `src/memory/internal/binding-loader.ts` — `createDatabase()` factory
  with classified load-error reporting (handles ABI mismatch, missing
  module, dlopen failure, etc.).
- Hook dispatcher (`src/memory/hooks/index.ts`) instrumented with
  `debug('hooks', ...)` + `loudError` on swallowed errors.
- MCP server startup (`src/memory/server.ts`) instrumented similarly.
- Recall path (`src/memory/recall.ts`) instrumented with entry/exit logs.
- Implementation choices captured in memory **#355**.
- Verification: `src/memory/__tests__/internal-debug.test.ts` (13 tests),
  `scripts/hooks/__tests__/debug-output-smoke.test.sh` (15 checks), and
  `scripts/dev/show-debug-output.sh` (developer-facing observable demo).

### 3. Cursor adapter audience-mapping (v3.1)
- `src/memory/editors/cursor.ts` `translateOutput` rewritten to map by
  audience: `user_message` for chat-visible chrome, `agent_message` for
  agent-only instruction. Replaces the earlier "drop everything to empty"
  behavior that was bias-driven.
- Hard block (preToolUse deny): `{permission:"deny", user_message:<chrome>,
  agent_message:<instruction>}`. Verified working.
- Soft (preToolUse allow): `{permission:"allow", agent_message:<instruction>,
  user_message:<chrome>}`. user_message under allow not visibly rendered by
  Cursor 3.2.11 (verified) but kept for forward-compat + Hooks Output panel
  visibility. Agent_message reaches agent.
- Stop (followup_message): chrome prefixed inline because Cursor only
  accepts one channel on stop. `{followup_message: "<chrome> — <reason>"}`.
- Standalone systemMessage: dropped (no anchored render path on Cursor
  under non-deny).
- ANSI stripping for Cursor (Cursor doesn't render terminal ANSI like
  Claude Code does).
- Design rationale + corrections captured in memory **#359** (revised after
  empirical verification).

### 4. Templates path-resolution bug (ship blocker, fixed)
- New `src/memory/internal/paths.ts` — package.json walk-up to find
  templates dir reliably across all four runtime layouts (ts-node, tsc
  dist, esbuild bundle, npm-installed).
- Replaces broken `__dirname/../...` math that failed in the bundled CLI.
- `init.ts` and `editors/rules.ts` now both import from the shared helper.
- Caught by `install-from-tarball.smoke.sh` when run after `build:dist` —
  smoke now wired into `npm run test:smoke` and `npm run test:full`.

### 5. Test pipeline robustness
- New npm scripts: `test:smoke` (runs both bash smokes), `test:full`
  (chains tsc → vitest → esbuild → smokes). Catches drift between
  TypeScript-compiled and esbuild-bundled outputs.
- `npm test` now bakes in `--exclude '**/.claude/worktrees/**' --exclude
  '**/.cursor/worktrees/**'` so dev tests don't pick up worktree files.

### 6. Cursor preToolUse:Read coverage gap (NEW DISCOVERY)
- **Verified empirically 2026-04-27 18:05 UTC via controlled experiment.**
- When a file is open in Cursor's editor pane, `preToolUse:Read` does NOT
  fire for subsequent Read tool calls on that file. Neither hard-block nor
  soft-nudge path engages.
- When the file is NOT open in the editor, the hook fires reliably.
- `preToolUse:Write` (matches Edit/Write/StrReplace) fires reliably
  regardless of editor-open state.
- Cause hypothesis (Cursor likely serves editor-cached content directly to
  agent) is unverified — could be cache, could be design intent, could be
  bug. We don't claim cause in docs, only the observation.
- Documented honestly in `docs/user/editors/cursor.md` per #351 + #358:
  "Per-Read coverage gap on Cursor" section + "Ideal behavior" framing.
- Mitigation in body.md rules-file: added bullet
  "Even when a file's content is already visible to you (open in your
  editor, attached, in a prior message), call aide_recall for that path —
  UNLESS you've already recalled memories for that path in this session."
- Memory **#363** has the full evidence chain + ruled-out wrong hypotheses.

### 7. Memories stored / updated
- **#357** — Cursor Clear semantics (Clear keeps session_id; Cmd+N creates
  new). Empirically verified.
- **#358** — Bias directive (priority:always): default to capability parity
  across editors; verify before claiming gaps.
- **#359** — Cursor adapter audience-mapping pattern (revised with
  empirical constraints).
- **#360** — Log-analysis methodology: don't claim absence-of-event from
  missing OUTPUT block; check `Hook step requested:` lines.
- **#361** — Plain-language directive (priority:always): use "user sees X /
  agent sees Y" framing, not jargon.
- **#362** — Validation-fixture gotcha: SessionStart auto-injects IDs into
  tracking; pick file paths whose scoped IDs don't overlap with injected
  set when testing hard-block.
- **#363** — Cursor preToolUse:Read editor-open coverage gap (revised
  multiple times this session as we narrowed the actual cause).

---

## What's in the working tree (uncommitted)

All on `feature/phase-1-cursor-support`. No commits yet.

**Code changes:**
- `package.json` — libsql dep, removed better-sqlite3 + @types/better-sqlite3,
  esbuild `--external:libsql`, new test scripts, worktree excludes baked into
  test command
- `package.aide-memory.json` — version bumped to 0.5.0, dep swapped to libsql,
  esbuild externals updated
- `src/memory/store.ts`, `src/brain/sqliteStore.ts` — use `createDatabase`
  from binding-loader
- `src/memory/analytics.ts`, `src/memory/sync.ts`, `src/memory/embeddings.ts`,
  `src/memory/fts5.ts` — type-only libsql imports
- `src/memory/embeddings.ts` — `bufferToVector` polyfill for libsql ArrayBuffer
- `src/memory/hooks/index.ts` — debug() + loudError() integration with
  classified error handling
- `src/memory/server.ts` — startServer instrumentation + loudError on store
  init failure
- `src/memory/recall.ts` — recall path debug logging
- `src/memory/editors/cursor.ts` — audience-mapping translateOutput v3.1 +
  ANSI strip
- `src/memory/internal/debug.ts` — NEW
- `src/memory/internal/binding-loader.ts` — NEW
- `src/memory/internal/paths.ts` — NEW
- `src/memory/init.ts`, `src/memory/editors/rules.ts` — use getTemplatesDir
  from paths.ts (removed duplicate broken __dirname math)
- `src/__tests__/package.test.ts` — assertion updated to libsql + comment fix
- 10 test files — `rmdirSync(dir)` → `rmSync(dir, {recursive, force})` for
  libsql WAL/SHM cleanup
- `src/memory/hooks/__tests__/cursor-envelope.test.ts` — 5 new tests for
  audience-mapping + ANSI strip
- `src/memory/__tests__/internal-debug.test.ts` — NEW (13 tests for debug
  helper + loudError)

**Bash test additions:**
- `scripts/hooks/__tests__/debug-output-smoke.test.sh` — NEW (15 checks)
- `scripts/dev/show-debug-output.sh` — NEW (developer demo)
- `scripts/hooks/pre-edit-recall.sh` — reverted to pre-debug state

**Doc changes:**
- `src/templates/rules/shared/body.md` — added "Even when file is visible to
  you, call aide_recall (unless already recalled)" bullet
- `docs/user/editors/cursor.md` — verified observations updated:
  - Hard-block example shape updated to show audience split
  - "On re-read" section updated to show soft path with agent_message
  - NEW "Per-Read coverage gap on Cursor" section with editor-open behavior
  - "What's different from Claude Code" item 1 rewritten to be observation-based
  - Item 2 rewritten to address inline chrome inconsistency factually
- `docs/sessions/HANDOFF_APRIL27_CURSOR_VALIDATION.md` — original prior
  handoff, untouched
- `docs/sessions/HANDOFF_APRIL27_AUDIENCE_MAPPING_AND_READ_GAP.md` — THIS DOC

---

## What's still pending for 0.5.0 ship

### Required before ship

1. **E2E_VALIDATION.md reclassification** — update scenario rows to reflect
   the verified findings:
   - A1, A1-edit, A0: PASS (with Cursor caveat for A1 cold-cache only)
   - B+ adversarial: PASS via agent_message
   - IDB-10: PASS via soft path
   - D Cursor compact: not testable in 3.2.11 (no manual UI)
   - N-mismatch: not applicable (libsql ABI-stable)
   - NEW row for Read editor-open gap

2. **`docs/specs/CURSOR_ONBOARDING.md` re-audit** — search for stale claims
   about "Cursor lacks soft channel" or "no additionalContext" — replace
   with verified pattern from #359 + #363.

3. **`docs/user/supported-editors.md`** — capability matrix: don't
   over-promise per-Read hard-block reliability on Cursor.

4. **Commit split + push.** Suggested split:
   - Commit 1: libsql migration (incl. dist + bundle changes)
   - Commit 2: debug surface (debug.ts, binding-loader, instrumentation, tests)
   - Commit 3: paths.ts templates fix + test:full pipeline
   - Commit 4: cursor adapter v3.1 audience-mapping (+ tests)
   - Commit 5: docs (cursor.md, body.md, E2E_VALIDATION.md, etc.)

5. **Phase C9 release** — `npm pack` from `package.aide-memory.json`,
   verify, publish to npm. Per `docs/RELEASING.md`.

### Deferred to fast-follow (0.5.x)

- `aide-memory clear` CLI for explicit tracking reset (Cursor Clear gap
  per #357)
- Per-tool MCP wrapping (per-tool name/args/duration via debug('mcp',...))
- Cursor log dedup follow-up (init writes both .cursor + .claude configs;
  Cursor logs "Removed duplicate" noise — runtime-detect editor)
- File Cursor FR for editor-cached preToolUse:Read coverage
- Investigate `beforeReadFile` registration as fallback (analyzed in this
  session, found NOT viable as direct workaround — soft path can't be
  replicated, tracking via beforeReadFile would corrupt encountered state).

---

## Verified validation matrix (2026-04-27)

| Scenario | Cursor 3.2.11 | Notes |
|---|---|---|
| A1 (autonomous Read with adversarial prompt) | ✅ PASS when file not open in editor | Hard-block fires, deny honored, chrome shows in Hooks panel under "Edit attempted" log entries (Read attempted entries have inconsistent rendering) |
| A1-edit (autonomous Write hard-block) | ✅ PASS | Reliable on every Edit/Write/StrReplace |
| A0 (user-mentioned path) | ✅ PASS | Auto-attach hypothesis was wrong — Read tool fires for path-mentioned prompts |
| B (search nudge happy path) | ✅ PASS | Agent uses aide_search per rules, Grep nudge stays correctly silent |
| B+ (adversarial Grep first) | ✅ PASS | agent_message channel reaches agent under permission:allow |
| IDB-10 (soft re-read with new memory) | ✅ PASS | Soft path verified via brand-new file test |
| D (compact resets tracking) | ⚠ Not testable in Cursor 3.2.11 | No manual /compact UI |
| N-mismatch (Node ABI drift) | ✅ Resolved by construction | libsql N-API |
| **NEW: Read with file open in editor** | **❌ Hook does not fire** | Documented as platform gap; per-Edit + rules-file cover |
| Cursor Clear (`Clear` button) | ⚠ Verified keeps session_id | Use Cmd+N for fresh tracking |

---

## Quick re-orientation commands for next session

```bash
# Verify state
cd /Users/meky/code/aide-v0
git status
git log --oneline -5
npm run test:full   # tsc + 768/768 vitest + 11/11 tarball + 15/15 debug

# Re-fetch the key memories (most important first)
# (In agent context — paste verbatim)
aide_recall({ids: [363, 359, 358, 354, 357, 356, 361, 360, 362, 355]})

# Read the prior handoff for the libsql/binding root cause (if needed)
docs/sessions/HANDOFF_APRIL27_CURSOR_VALIDATION.md
```

---

## Pickup steps for next session

1. Read this doc end-to-end.
2. `aide_recall` the IDs listed above.
3. `npm run test:full` to confirm green starting state.
4. **If continuing fixture-based validation** — regenerate the fixture's
   rules file so it picks up the new "even when file is visible" bullet
   added to `body.md` this session:
   ```bash
   cd /private/tmp/aide-cursor-val
   node /Users/meky/code/aide-v0/dist/cli/aide-memory.js init --update-rules
   grep "Even when a file" .cursor/rules/aide-memory.mdc   # confirm it landed
   ```
   Without this step, the fixture's existing `.cursor/rules/aide-memory.mdc`
   has the OLD body content and won't reflect the new guidance.
5. Decide: complete the remaining E2E_VALIDATION.md + CURSOR_ONBOARDING +
   supported-editors updates, OR move directly to commit split.
6. After docs done → commit split per the suggested 5-commit plan above.
7. Phase C9 release flow when greenlit.

The work is structurally complete. Pending tasks are mechanical docs + commit + release.

---

## Validation scenario matrix to add (per user direction 2026-04-27)

The Cursor per-Read coverage gap and the new body.md guidance call for an
expanded scenario matrix that crosses TWO axes:

**Axis A — file editor state:**
- A.1 File NOT open in Cursor editor pane
- A.2 File IS open in Cursor editor pane

**Axis B — agent prompt instruction:**
- B.1 Prompt does NOT instruct the agent to skip aide_recall
- B.2 Prompt instructs "without calling aide-memory tools first"

**Resulting 4-cell matrix:**

| # | File state | Prompt | What to verify | Why this matters |
|---|---|---|---|---|
| 1 | NOT open | No suppression | Agent calls aide_recall per rules-file guidance; hook fires reliably; either hard-block (first read) or silent (already covered) | Best case — both safety nets engaged |
| 2 | NOT open | Suppression ("don't call aide_recall") | preToolUse:Read hook fires hard-block; chrome may render in Hooks panel; agent forced to recall via deny | Tests hook safety net in isolation |
| 3 | IS open | No suppression | Hook does NOT fire (verified gap); agent must rely on rules-file guidance — does it call aide_recall on its own per the new bullet? | Tests rules-file-only fallback path — the NEW bullet's value |
| 4 | IS open | Suppression | Hook does NOT fire AND agent told to skip — worst case; agent may proceed without memory awareness | Documents the floor of safety net coverage |

**For each cell, capture:**
- Conversation ID
- Did agent call aide_recall? (Y/N — from MCP:aide_recall hook fire OR from agent transcript)
- Did preToolUse:Read fire? (Y/N — from Hooks panel)
- Did agent reference stored memories in its response? (Y/N — qualitative — proves whether memory awareness reached the agent)
- File-tracking state at end (`cat .aide/cache/recalled-paths-<sid>.txt`)

**Same matrix for Edit:**
- Edit hard-block fires reliably regardless of file-open state (verified)
- Suppression-vs-no-suppression on Edit tests whether agent follows hook
  deny vs prompt instruction
- Less interesting because Edit safety net is already empirically reliable;
  but worth a single confirmation row.

**Where this matters in product framing:**
Cell 3 (file open, no suppression) is the realistic user workflow —
developer has files open in their editor and asks agent to do something.
The new body.md bullet ("Even when a file's content is already visible to
you, call aide_recall...") was added specifically to make this cell pass.
If empirical testing shows the agent does NOT call aide_recall in cell 3,
the rules-file guidance is insufficient and we need additional reinforcement
(e.g. stronger prompt language in body.md, or accept the gap).

**Proposed before 0.5.0 ship OR as 0.5.x fast-follow:**
Run all 4 cells, capture results, add as new rows in E2E_VALIDATION.md
under a new "F — file-open coverage" scenario block. This is the
validation that converts our claim ("rules-file injection covers the gap
functionally") from theory to evidence.
