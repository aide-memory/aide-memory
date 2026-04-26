# Handoff — Phase 1 Validation + Fix Sweep (Apr 20–21, 2026)

## TL;DR

Multi-day session validated Phase 1 scenarios A–G + U1–U3 + H/J/O end-to-end, discovered bugs during validation, **fixed them in the same session rather than filing as follow-ups**, then started the manual walk through the pre-consolidation `MANUAL_E2E_VALIDATION.md` runbook (now consolidated into `docs/validation/E2E_VALIDATION.md` as of Phase C7, 2026-04-23 — completed scenarios up to E including an ID-stability wipe test). 14 commits on `feature/phase-1`. 660 unit tests pass, 4 bash smoke suites pass, live smoke on `/tmp/aide-e2e` confirms every fix.

**Still to run manually:** G (concurrent sessions), K (organic plan persistence), Settings toggle, Drift-repair in fresh project, MCP-down recovery.

**Cross-branch note:** `minified-publish` is landing a bundling/release change with its own `HANDOFF_MINIFIED_PUBLISH.md`. Once that merges, re-run **every scenario** — automated via the bash smoke suites + unit tests, then the manual walk from Scenario F0 onward — to confirm the minified bundle doesn't regress hook paths, schema coercions, or CLI behavior. Capture the re-run results as new dated rows in the per-scenario Runs tables in `docs/validation/E2E_VALIDATION.md` with the post-merge commit SHA.

---

## What Was Done (Code + Docs)

All commits on `feature/phase-1`. Listed newest → oldest.

| SHA | Type | Scope |
|---|---|---|
| `669e5bf` | fix | MCP schemas: optional fields accept explicit `null` too (not just undefined) |
| `a7a105a` | fix | MCP schemas: `lenientArray`, `lenientBoolean` helpers — single-item arrays + string booleans now tolerated |
| `fbb872c` | fix | MCP schemas: all numeric params use `z.coerce.number()` (was only `aide_recall`) |
| `d259702` | docs | Follow-up filed for aide_forget/aide_update coercion — superseded by `fbb872c` which fixed it |
| `c6c542d` | docs | Follow-up: suppress Stop hook prompt when agent already stored in same turn |
| `99d470f` | fix | Persist numeric `id` in JSON memory files so rebuildCache doesn't reassign |
| `71f8a9b` | docs | Expand `MANUAL_E2E_VALIDATION.md` to cover A-G + D/F/G/A7/gap-fill |
| `a5c5624` | docs | New `MANUAL_E2E_VALIDATION.md` + re-verification pass in `PHASE_1_RESULTS.md` |
| `4382bed` | feat | Mid-session drift-repair for derived artifacts via `read-config.sh` |
| `fe809b3` | refactor | Remove dead settings (directoryTrigger, minScopeDepth), centralize derived-artifact resync, update spec to reflect all-public / no-pro-gating |
| `6be74e6` | feat | Phase 1 validation fixes: count consistency (M), .ignore resync (I), settings ungating (18 public), --scan removal |
| `d56e837` | fix | detect-correction regex matches colloquial contractions (dont/cant/shouldnt etc.) |
| `613881a` | docs | Validation results for L, M, I, Settings, --scan, IDB + gap follow-ups |
| `b7e5a4d` | feat | `ingestPendingMemories()` on MCP server startup (closes J6) |

### Fixes grouped by subsystem

**MCP tool schemas (`src/memory/server.ts`) — LLM-friendliness pass:**
- Every `z.number()` → `z.coerce.number()` (6 sites: aide_recall ids + limit, aide_update id, aide_forget id, aide_search limit, aide_memories limit)
- `lenientArray(item)` helper: accepts single-item shortcut (`paths: "src/foo"` → `["src/foo"]`). Applied to `paths`, `ids`, `layers`, `tags`
- `lenientBoolean`: accepts `"true"`/`"false"`/`"1"`/`"0"` strings. Applied to `shared`
- Every optional field now uses `.nullish().transform((v) => v ?? undefined)` — accepts null AND undefined
- **Enums stay strict** — mistyped enum values (e.g. `"tech"` for `"technical"`) must reject loudly to prevent silent bad-data storage
- Memory `#165` (guidelines, scope `src/memory/server.ts`) locks in the design principle for future MCP tool additions
- Regression tests in `src/memory/__tests__/server.test.ts` cover every lenient path (6 new tests)

**Memory store (`src/memory/store.ts`) — ID stability:**
- `MemoryFile` schema (in `types.ts`) now includes optional `id?: number`
- `toMemoryFile()` writes `id` to disk on every add/update
- `rebuildCache()` has three branches: existing UUID match → UPDATE (keeps id); new row + JSON has id → INSERT with explicit id; legacy row + JSON missing id → INSERT via AUTOINCREMENT, then rewrite the JSON to backfill the id
- Legacy migration is idempotent — next rebuild stays stable
- 2 new tests in `store.test.ts`: "numeric IDs stay stable across full cache rebuild" + "legacy JSON files without id get assigned one + backfilled on first rebuild"

**Pending memory recovery (`src/memory/init.ts`, `server.ts`):**
- `ingestPendingMemories(projectRoot, store)` reads `.aide/pending-memories.jsonl`, parses each line, maps `content` → `what` for schema compatibility, calls `store.add()`, archives file to `pending-memories.jsonl.imported-{timestamp}`
- Wired into `startServer()` after `MemoryStore` construction
- Malformed lines kept in regenerated `pending-memories.jsonl` for user inspection
- Closes gap in PHASE_0_1_SPEC.md:1012 (J6 "Verify pending memories can be imported")

**Count consistency (`src/memory/recall.ts`, `scripts/hooks/recall-for-path.js`):**
- New `computeScopedForPath(memories, filePath)` helper — **single source of truth** for the focused-scope filter used by blocking
- Applies focused-mode filter + excludes project-wide (null/'project') scope
- Fixed `scopeMatchesPath` depth rule: `scopeDepth < parentDepth` (was `scopeDepth < parentDepth - 1` which leaked grandparent scopes)
- Preserves trailing slash on directory queries through `realpathSync`
- `recall-for-path.js` calls `computeScopedForPath()` once; `count`, `scoped_count`, `scoped_ids`, `layers`, `topics` all derive from the same filtered set — parity guaranteed
- Regression: `scripts/hooks/__tests__/count-parity.sh` + unit test in `hooks.test.ts`

**`.ignore` sync (`src/memory/ignoreFile.ts`, config.ts, init.ts):**
- New module owns `.ignore` with `# BEGIN/END aide-memory-managed` markers — user entries outside markers never touched
- Legacy `.ignore` files (bare `.aide/memories/` entry) migrate on first sync
- `aide-memory config memories.hideFromGrep <true|false>` live-syncs via `applySideEffects` in `config.ts`
- Centralized `resyncDerivedArtifacts(projectRoot)` in `init.ts` is the single source of truth — called from CLI write path AND `autoUpdateIfNeeded` (unconditional at MCP startup, before version check, so direct edits to `config.json` get picked up)
- Mid-session drift check: `maybeTriggerDriftResync()` in `src/memory/hooks/index.ts` (TS dispatcher) compares config.json mtime against `.aide/cache/config-mtime.txt`. On mtime change, spawns a DETACHED+UNREFED `aide-memory internal-resync` child — fire-and-forget so the hook process exits fast (important for pre-compact latency). The child runs `resyncDerivedArtifacts(projectRoot)`. Every hook fire runs the mtime check at dispatch-entry — so config edits get picked up by the next hook fire, no session restart needed. The legacy bash `_aide_drift_check` side effect in `scripts/hooks/read-config.sh` was silently dropped in the 0.4.0 hook consolidation (memory #171); re-ported to the TS dispatcher in the 0.4.2 regression fix
- Cross-session propagation works via the shared mtime cache file

**Settings framework (`scripts/hooks/defaults.json`, `src/memory/settings.ts`, `src/cli/commands/memory/config.ts`):**
- All 18 (now 16) settings promoted to `public: true` — Phase 1 is all-public, no pro gating. `pro: false` kept only as stable schema placeholder
- Dead settings removed: `hooks.directoryTrigger.maxBlocks` (directory trigger was removed per memory #96), `recall.minScopeDepth` (superseded by hardcoded focused-mode in `computeScopedForPath`)
- New `src/memory/settings.ts`: `getSetting`, `loadDefaults`, `listPublicDefaults`, `flatMapToNested`, `validateKey`
- New `scripts/hooks/read-config.js`: JS-side reader mirroring bash semantics, used by `recall-for-path.js` and `session-inject.js`
- `aide-memory config KEY VALUE` validates against `defaults.json` — unknown keys rejected with valid-key list, exits non-zero, does NOT write
- `init` + `autoUpdateIfNeeded` seed all public defaults into `.aide/config.json`
- Fixed latent nested-key lookup bug in `read-config.sh` (memory #110): `runConfig` writes nested JSON (`{hooks:{correction:{enabled:false}}}`) but the old reader looked up flat keys. New reader uses jq `getpath` with path-existence check
- JSON objects/arrays now parse correctly — `aide-memory config hooks.stop.schedule '[{"every":5}]'` works
- Representative 5 settings verified end-to-end via `scripts/hooks/__tests__/settings-behavior.test.sh`

**Correction detection regex (`scripts/hooks/detect-correction.sh`):**
- Added non-apostrophized contractions: `dont`, `cant`, `wont`, `isnt`, `wasnt`, `werent`, `shouldnt`, `didnt`, `couldnt`, `wouldnt`, `mustnt`, `havent`, `hadnt`, `arent`
- Added `that's wrong` / `thats wrong` coverage
- Same for decisions branch (`let's`/`lets`, `we're`/`were`) and preferences branch (`don't ever`/`dont ever`)
- Regression test: `scripts/hooks/__tests__/detect-correction.test.sh` — 9/9 pass
- Verified edge cases: "no didnt we", "no shouldnt this", "no wasnt that", "no wouldnt be", "thats wrong" all trigger correction branch now

**`--scan` feature removed:**
- `src/memory/scan.ts` + `src/memory/__tests__/scan.test.ts` deleted
- `--scan` flag removed from `src/cli/aide-memory.ts` and `src/cli/commands/memory/init.ts`
- User docs + marketing copy updated (README.md, docs/user/*, docs/marketing/*, docs/PUBLIC_README.md, docs/LANDING_PAGE_CONTENT.md)
- Spec: P1.15 struck through; follow-up "Deferred: Auto-scan for Codebase Pattern Discovery" documents the option to revisit with real tree-sitter analysis in Phase 2
- Regression test: `aide-memory init --scan` → `error: unknown option '--scan'`

### New Phase 1 follow-ups filed

In `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md`:

- **Hooks on file creation (Write tool)** — verify parent-dir scoped memories surface when creating new files (Write matcher is wired but needs validation for non-existent paths)
- **Mid-session project-wide memory invisibility** — project-wide memories created mid-session don't reach running sessions (filed during U3 run; diagnosed fully, Approach 1 "inject on storage" recommended)
- **TTL cleanup for `pending-memories.jsonl.imported-*` archive files** — extend `aide-memory cleanup` to sweep them after 7 days
- **Stop hook prompt suppression when agent already stored in same turn** — track remember/update/forget per turn, skip the standard prompt if the agent already wrote a memory

Marked DONE (fix shipped in-session, not deferred):
- `resyncDerivedArtifacts` centralizes config→artifact drift repair (in `autoUpdateIfNeeded` + CLI write path)
- All 18 MCP tool numeric params coerce string IDs (not just `aide_recall`)

### Memories stored (relevant to this repo)

- **#102** — U1 finding: 6/7 conventions followed, rate-limit missed
- **#108** — Claude Code reads settings.json once per session; H auto-update needs two sessions to fully validate
- **#126** — O validation: 3→5→10 stop schedule verified at turns 3, 6, 9, 14, 19
- **#129** — J/H validation status (code existed, validation pending — now done)
- **#131** — pending-memories.jsonl import gap (resolved)
- **#135** — MCP server lifecycle: stdio child process per session, not a daemon
- **#146** — Count parity: single source of truth via `computeScopedForPath`
- **#147** — Fixed scope depth rule in focused mode
- **#148** — IDB validation rigor: full permutation matrix required
- **#152** — Derived-artifact resync pattern: centralize in one function
- **#164** — User correction on class-of-issue fixes: when fixing pattern X, grep and update all sites in one pass
- **#165** — MCP tool schema design principle: LLM-friendly everywhere except enums

---

## What's Already Validated

### Earlier in this session / previous sessions (now inlined as dated Runs rows in `docs/validation/E2E_VALIDATION.md`)

| Scenario | How | When |
|---|---|---|
| A (path-based recall, ID-based blocking) | Live session + debug log | Prior Round 2 |
| B (search nudge) | Live session | Prior Round 2 |
| C (correction loop + flag lifecycle) | Live session | Prior Round 2 |
| D (PreCompact clears tracking) | Live session | Prior Round 2 |
| E (cross-session persistence) | Live session | Prior Round 2 |
| F0 (empty project) | Live session | Prior Round 2 |
| F (softening <10 memories) | Live session | Prior Round 2 |
| G (concurrent sessions isolation) | Live session | Prior Round 2 |
| U1 (team decisions — 6/7 conventions) | Live session | Apr 20 |
| U2 (correction learning loop) | Live session | Apr 20 |
| U3 (behavioral preferences + gap diagnosis) | Live session | Apr 20 |
| H (auto-update at MCP start) | Live + stderr log | Apr 20 |
| J (MCP unavailable + pending-ingest) | Live + stderr log | Apr 20 |
| O (dynamic Stop 3→5→10) | Live session, 19 prompts | Apr 20 |
| L (correction regex) | Unit + smoke | Apr 21 |
| M (count parity) | Unit + smoke + live | Apr 21 |
| I (.ignore resync) | Unit + smoke + live | Apr 21 |
| Settings framework | Bash smoke | Apr 21 |
| IDB-1..8 (ID-based blocking permutations) | Direct hook invocation + live | Apr 21 |

### Manual walk this session (runbook — now consolidated into `docs/validation/E2E_VALIDATION.md`)

Completed steps 0 through E:

- **Step 0** — init clean from scratch ✅
- **Step 1a** — F0 empty project silent ✅ (debug log confirmed)
- **Step 1b** — F softening with 3 memories — soft `additionalContext` not hard block ✅
- **Step 1c** — ID stability across full DB wipe ✅ (real DB at `~/.aide/projects/<hash>/memory.db` was deleted, rebuild preserved id→what mapping exactly)
- **Step 2** — Seeded to 11 memories, then added 4th while running ✅
- **Step 3** — SessionStart injection: `## Session Preferences` (1 pref) + `## Guidelines` (4 project-wide + 1 scoped) ✅
- **Step 4 with rules disabled** — Hard block verified on `src/auth/middleware.ts` with `decision: "block"` and `permissionDecision: deny` ✅
- **Step 7 (B search)** — `grep for "rate"` → aide_search nudge fires, agent follows ✅
- **Step 8 (C correction)** — `no, we use epoch seconds not milliseconds` → agent stored id=15, Stop hook fired standard message (flag cleared) ✅
- **Step 9 (D compact)** — `/compact` cleared tracking, post-compact `read src/utils/dates.ts` triggered fresh hard block ✅
- **Step 10 (E cross-session)** — New session, `Add a getOrder handler...`, agent hit hard block, called aide_recall, wrote function with epoch seconds per correction. **Bonus:** agent detected conflict between id=8 (epoch ms) and id=15 (epoch seconds), called `aide_forget({id: "8"})` — which exposed the string-id coercion bug that we then fixed ✅

---

## Still To Validate (manual)

Pick up from `docs/validation/E2E_VALIDATION.md` (former runbook steps 11-17 map to Scenarios G, K, O, Settings, I, J, and housekeeping):

- **Step 11 (G concurrent sessions)** — open 2nd terminal `cd /tmp/aide-e2e && claude --debug`, read a file in session B, verify independent `recalled-paths-{session_id}.txt` + independent hard block
- **Step 12 (K plan persistence organic)** — in a session, ask agent to draft a plan for a feature (pagination), watch whether agent proactively calls `aide_remember` with `layer: area_context`, `scope: src/api/**`. Exit, restart, ask to "continue the pagination work" — verify plan surfaces. This is the one scenario nothing has fully validated yet
- **Step 13 (O dynamic Stop — optional)** — validated before; skip unless you want to re-confirm
- **Step 14 (Settings toggle live)** — `aide-memory config hooks.correction.enabled false`, fresh session, type a correction, verify nudge doesn't fire
- **Step 15 (Drift-repair live)** — hand-edit `.aide/config.json` to flip `hideFromGrep`, fire any hook, verify `.ignore` resyncs within ~3s
- **Step 16 (MCP down + pending recovery)** — break `.mcp.json`, in a session type a correction, verify `pending-memories.jsonl` gets the JSON line, restore `.mcp.json`, restart, verify stderr shows `imported 1 pending memory...` and memory lands in store
- **Step 17 (Stats + cleanup CLI)** — `aide-memory stats`, `aide-memory cleanup --dry-run`

---

## Cross-Branch: `minified-publish` — ALREADY LANDED (Apr 21, 2026)

**Status update:** when this handoff was first drafted, `minified-publish` was presented as a future merge to coordinate against. That's no longer accurate — while this handoff was being finalized, `minified-publish` merged and shipped three releases:

- `0a84beb` — merge `feature/phase-1` into `minified-publish` (includes the MCP schema leniency fixes from `669e5bf`/`a7a105a`/`fbb872c`)
- `d02c783` — **0.3.0 release** (first minified+bundled tarball; closed-source ready)
- `a190f20` — **0.4.0 release** (hook logic consolidated into the bundled CLI — hooks are now thin shims like `exec node $PKG_ROOT/dist/cli/aide-memory.js hook pre-prompt`)
- `93f56f2` — **0.4.1 release** (audit patches for two bugs surfaced in the 0.4.0 post-publish audit — see memory #169)

Authoritative docs for the minified-publish architecture (on main now, not under `sessions/`):
- `docs/HANDOFF_MINIFIED_PUBLISH.md` — the release handoff + post-release updates
- `docs/RELEASING.md` — permanent playbook for every future release
- `docs/VALIDATION_MINIFIED_PUBLISH.md` — pre-publish E2E procedures
- `docs/AUDIT_MINIFIED_PUBLISH.md` — security audit findings
- Memory `#151` — summary of the 0.3.0 ship (live URL, verified no-leak tarball, three-bundle invariant)
- Memory `#169` — lessons from the 0.4.0 audit (e.g. `files` allowlist must be cross-referenced against runtime `readFileSync` calls, CI smoke against a packed tarball prevents re-occurrence)
- Memory `#163` — validation discipline: test against install-from-tarball, NOT dev node_modules. Dev-mode hides packaging bugs.

### Architectural invariants to preserve going forward (from memory #151)

Any refactor that touches the release path must respect:
1. **Three bundles.** CLI (`dist/cli/aide-memory.js`), library (`dist/memory/index.js`), MCP server (`dist/memory/cli.js`). Missing any breaks a user path.
2. **Runtime `package.json` read.** Every entry point reads `package.json` via `fs.readFileSync` at runtime, NOT `require('../../package.json')` at bundle time. The latter inlines the dev-monorepo manifest (memory #162).
3. **`scripts/verify-package.sh` is the CI gate.** It blocks source leaks (`.ts`/`.map`/`sourceMappingURL`), dev-manifest leaks, missing bundles. Never bypass.
4. **Hooks are thin shims.** `scripts/hooks/*.sh` are now 2-3 line `exec node ... hook <name>` wrappers — the real logic lives in `src/cli/commands/hooks/*.ts` bundled into `dist/cli/aide-memory.js`.

### What to do next (vs what I originally wrote)

The original plan was "re-run everything after `minified-publish` merges." That already happened during the release validation (see `docs/VALIDATION_MINIFIED_PUBLISH.md`). **What still needs to run in a fresh session** is:

1. **Re-read this handoff + `docs/HANDOFF_MINIFIED_PUBLISH.md` + `docs/RELEASING.md`** to get current on state.
2. **Run the pre-flight block at the top of `docs/validation/E2E_VALIDATION.md`** (automated tests + bash smokes + build) against the current HEAD. If any fail, fix first.
3. **Pick up the manual walk** from wherever it left off — last stopping point is between step 10 (E — cross-session correction, passed) and step 11 (G — concurrent sessions, next). See "What's Already Validated" + "Still To Validate (manual)" sections in this doc.
4. **Periodically `git fetch` + check `git log HEAD..origin/feature/phase-1`** — per memory #170, the primary worktree may receive commits during parallel release activity and you should not assume origin is a fast-forward of your local HEAD.

---

## Key Files Changed (This Session)

**Source code:**
- `src/memory/server.ts` — MCP schemas + lenient helpers
- `src/memory/store.ts` — id persistence in JSON
- `src/memory/recall.ts` — `computeScopedForPath`, focused-mode fix
- `src/memory/init.ts` — `ingestPendingMemories`, `resyncDerivedArtifacts`, public settings seeding, `--scan` removal
- `src/memory/ignoreFile.ts` — NEW: BEGIN/END marker-based `.ignore` management
- `src/memory/settings.ts` — NEW: settings schema + validation
- `src/memory/types.ts` — `MemoryFile.id?: number`
- `src/cli/commands/memory/config.ts` — key validation + applySideEffects → resyncDerivedArtifacts
- `src/cli/aide-memory.ts`, `src/cli/commands/memory/init.ts` — `--scan` removed

**Hooks:**
- `scripts/hooks/defaults.json` — 18→16 settings, all public:true
- `scripts/hooks/read-config.sh` — `_aide_drift_check`, nested-key lookup fix
- `scripts/hooks/read-config.js` — NEW: JS reader mirroring bash semantics
- `scripts/hooks/recall-for-path.js` — uses `computeScopedForPath`
- `scripts/hooks/detect-correction.sh` — colloquial contractions
- `scripts/hooks/session-inject.js` — reads from new read-config.js
- `scripts/hooks/pre-*.sh` — settings wiring

**Tests:**
- `src/memory/__tests__/server.test.ts` — 6 new lenient-schema regression tests
- `src/memory/__tests__/store.test.ts` — 2 new id-stability tests
- `src/memory/__tests__/ignoreFile.test.ts` — NEW (11 tests for I agent work)
- `src/memory/__tests__/recall.test.ts` — focused-mode + helper tests
- `src/memory/__tests__/hooks.test.ts` — count-parity integration
- `src/memory/__tests__/init-settings-seeding.test.ts` — NEW (5 tests)
- `src/memory/__tests__/init.test.ts` — markers-on-fresh-init + legacy migration
- `src/memory/__tests__/deep-integration.test.ts` — schema key list updated to include id
- `src/cli/commands/memory/__tests__/config.test.ts` — NEW (10 tests)
- `src/cli/commands/memory/__tests__/config-validation.test.ts` — NEW (13 tests)
- `src/cli/__tests__/cli.test.ts` — `--scan` rejection test
- `scripts/hooks/__tests__/count-parity.sh` — NEW bash smoke
- `scripts/hooks/__tests__/settings-behavior.test.sh` — NEW bash smoke
- `scripts/hooks/__tests__/detect-correction.test.sh` — NEW bash smoke

**Docs:**
- `docs/specs/PHASE_0_1_SPEC.md` — Phase 1 pro-gating update, public config defaults table rewritten
- `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` — 7+ new follow-ups filed, 2 marked DONE
- `docs/validation/E2E_VALIDATION.md` — consolidated matrix (replaces former `PHASE_1_RESULTS.md` + `MANUAL_E2E_VALIDATION.md` as of Phase C7, 2026-04-23) — scenario actions + per-tool expected + Runs tables + inline resolved issues
- `docs/user/cli-reference.md` — `.ignore` resync timing table, reconnect `/mcp` tip
- `README.md`, `docs/PUBLIC_README.md` — propagation note added
- `docs/user/architecture.md`, `quick-start.md`, `troubleshooting.md` — `--scan` removed

---

## Test / Smoke Status (as of last commit `669e5bf`)

```
npm test -- --run (main worktree only, excluding .claude/worktrees + .cursor/worktrees):
  660/660 pass

Bash smoke suites:
  scripts/hooks/__tests__/count-parity.sh        PASS
  scripts/hooks/__tests__/settings-behavior.test.sh  PASS (5 toggles verified)
  scripts/hooks/__tests__/detect-correction.test.sh  PASS (9/9 including edges)
```

Live `/tmp/aide-e2e` fixture has 11 memories across 4 layers and has exercised path-block, re-read silent, cross-scope block, compact re-block, correction store + cross-session surface, and organic conflict-resolution (agent forget on duplicate).

---

## Resumption Instructions (for the next agent / session)

1. **Read this doc end-to-end.**
2. **Check if `minified-publish` has merged to `feature/phase-1` yet.** If yes: read `docs/sessions/HANDOFF_MINIFIED_PUBLISH.md` as well, then run the full re-verification per "Cross-Branch: `minified-publish` Coordination" above before continuing.
3. **If `minified-publish` hasn't merged yet:** pick up from Scenario G (concurrent sessions) in `docs/validation/E2E_VALIDATION.md`. The `/tmp/aide-e2e` fixture project is already seeded and ready.
4. **Before shipping anything user-visible**, confirm test parity with the last recorded count (660/660 unit + all bash smokes) and verify the manual scenarios completed so far haven't regressed — diff the Runs tables in `docs/validation/E2E_VALIDATION.md` against the "Manual walk this session" section above.

### User preferences locked in this session

- **Fix the class, not the instance.** When a validation-type/schema/contract issue is found in ONE tool or entry point, grep for the same pattern across the codebase and fix all instances in the same pass. Memory #164.
- **Don't file follow-ups for things we can fix now.** Both aide_forget coercion and the broader lenient-schema work were originally filed as follow-ups mid-session; user redirected to "fix now, validate now" — so we did. The follow-ups doc was updated to reflect which items are DONE vs still pending.
- **Whenever making fixes that affect multiple validation scenarios, re-run what could regress** — this session did a mini-re-verification after each fix. Same expectation post-minified-publish.
