# Changelog

## 0.5.15 — 2026-04-29

- **Fix: scope dynamic rules-file regen to Cursor only.** The `## Current memory context` section (priority:always memories + injection content + version notice) is now appended only to `.cursor/rules/aide-memory.mdc`. Claude Code's `.claude/rules/aide-memory.md` stays at static teaching content (~111 lines) since its SessionStart hook delivers the same content as `additionalContext` natively. Removes a redundant copy of session-start content from every Claude Code rules-file regen. New `needsDynamicRules` flag on `EditorAdapter` opts each editor in.
- **New: Cursor-specific init reminder.** Init output now includes `For Cursor: also enable aide-memory in Settings > MCP after restart.` alongside the generic restart line. Cursor users sometimes miss the second-gate MCP toggle in Settings; this surfaces the step at install time.
- **Docs: 0.5.14 currency sweep across user-facing and internal docs.** Install command (`npm install -g aide-memory && aide-memory init`), telemetry framing (drop opt-in/opt-out terminology, state plainly: on by default; disable via `AIDE_TELEMETRY=off` or `aide-memory config telemetry.enabled false`), PreCompact wording (hook clears tracking; rules file separately tells the agent what to save), GeoIP framing simplified, storage-shape diagram corrected, monorepo post-checkout walk-up + version-update notice mechanism documented, marketing duplicates consolidated.

## 0.5.14 — 2026-04-29

- Added `$geoip_disable: true` alongside `$ip: null` for belt-and-suspenders GeoIP prevention.

## 0.5.13 — 2026-04-29

- **Privacy fix: disable PostHog GeoIP enrichment.** PostHog was auto-enriching events with location data (city, lat/long, postal code) from sender IP. Added `$ip: null` to the event payload to prevent this. Also disable GeoIP in your PostHog project settings.

## 0.5.12 — 2026-04-29

- **Fix: version notice + Cursor rules work on empty projects.** Both SessionStart and Cursor rules file now show the update notice even when no memories exist.
- **Fix: dev-tree detection.** Version check skips in dev trees so the placeholder 0.2.0 version doesn't trigger false positives.

## 0.5.11 — 2026-04-29

- **Fix: version update notice shows even when no memories are stored yet.** Previously the notice was skipped on empty projects because the early return checked for memory content only.
- Added smoke tests for version notification + telemetry config.

## 0.5.10 — 2026-04-29

- **Cursor: version update notice in rules file.** When a newer version is cached, the dynamically regenerated `.cursor/rules/aide-memory.mdc` includes an "Update available" section so the Cursor agent tells the user.

## 0.5.9 — 2026-04-29

- **Version update notice is visible to the user directly.** The `aide-memory · update available: vX.Y.Z` line now shows in the chat alongside the injection message, not just in the agent's context.

## 0.5.8 — 2026-04-29

- **Version update notification surfaces via the agent.** SessionStart hook checks cached npm registry result and tells the agent if a newer version is available, so the agent can inform the user.
- **Post-checkout hook boundary guard.** Walk-up to find `.git/` now stops if it encounters a different project's `.aide/` directory, preventing hook installation in the wrong repo.

## 0.5.7 — 2026-04-29

- **Fix: post-checkout hook installs correctly in monorepo subdirectories.** Init now walks up to find `.git/` instead of only looking in the project root.
- Updated RELEASING.md with dual-repo release process and token requirements.

## 0.5.6 — 2026-04-29

- **Fix: `telemetry.enabled: false` in config.json now disables PostHog remote telemetry too.** Previously only stopped local SQLite logging while PostHog kept sending. Now both are controlled by the config key. `AIDE_TELEMETRY=off` env var still works as an override.
- All config keys audited and confirmed wired to runtime behavior.

## 0.5.5 — 2026-04-29

- Init warning simplified: "Restart your editor (or start a fresh session) to ensure the MCP server is picked up." No editor-specific details.

## 0.5.4 — 2026-04-29

- README formatting: website/docs/install each on their own line.

## 0.5.3 — 2026-04-29

- npm license field now links to the correct LICENSE file on GitHub (was referencing LICENSE.md which doesn't exist on the public repo).
- Install instructions updated across all surfaces to recommend `npm install -g aide-memory`.

## 0.5.2 — 2026-04-29

- Init detects when running from the npx cache and warns that paths may break on Node version changes or cache cleans. Recommends `npm install -g aide-memory`.
- SessionStart hook checks that the MCP server binary still exists at the path written by init. If broken, surfaces a clear error with fix instructions instead of failing silently.
- Quick start docs updated to recommend global install with npx as a quick-try alternative.

## 0.5.1 — 2026-04-29

Patch: ship the correct README to npm. The 0.5.0 tarball included the dev monorepo README instead of the public-facing one. Also fixes the CI workflow to copy README.npm.md at publish time.

## 0.5.0 — 2026-04-29

First public release. Full Cursor support, libsql migration, editor adapter architecture, and content/docs overhaul.

### New features

- **Cursor support.** Full hook + MCP wiring. `aide-memory init` writes `.cursor/hooks.json`, `.cursor/mcp.json`, and a dynamically-regenerated `.cursor/rules/aide-memory.mdc`. Hard blocks, soft nudges, correction detection, and Stop reflections all work.
- **Editor adapter architecture.** Each editor gets its own adapter (`src/memory/editors/`) that translates aide-memory events into that editor's hook I/O contract. Claude Code remains the reference adapter. Codex, Copilot, and Windsurf get a rules template.
- **`content` alias for `what`** in `aide_remember` and `aide_update`. Some models reach for `content` first.
- **`memories.defaultShared` config key.** Controls whether new preferences go to `shared/` (committed) or `personal/` (gitignored) by default.
- **Telemetry on by default.** Anonymized usage counts ship to PostHog. Disable with `AIDE_TELEMETRY=off`.
- **Pre-search nudge sharpened.** Clearer wording when the hook suggests `aide_search` before grep.
- **User-facing `aide-memory` status lines** via `systemMessage` channel (Claude Code) and `user_message` (Cursor).

### Fixes

- **libsql migration.** Replaced `better-sqlite3` with `libsql` (N-API binding). Resolves ABI mismatch crashes on Node version upgrades. Diagnostic surface classifies binding errors with actionable hints.
- **Template resolution.** `aide-memory init` now resolves templates via package.json walk-up, fixing init failures when installed globally.
- **Embedding persistence.** Embeddings now persist under `memory.uuid` instead of being orphaned.
- **Bundle leak.** Dev-monorepo name no longer appears as a literal string in published bundles.

### Breaking

- **Node 18 minimum.** `engines` field now requires `>=18.0.0` (was `>=20.0.0` in 0.4.x, but most deps only need 18).
- **libsql replaces better-sqlite3.** If you have code that imports from aide-memory's internals and references better-sqlite3 types, update to libsql.

### Internal

- 782 tests (up from ~650 in 0.4.3)
- Editor adapter test suite, cursor envelope tests, hook merge tests, rules generation tests
- Semantic search smoke test wired into `test:smoke`

## 0.4.3 — 2026-04-22

Minor release: polish + correctness sweep. Fixes several latent bugs, expands correction-detection coverage, and introduces three configurable knobs for SessionStart injection + scope-matching behavior. Also cleans up dead public-config keys that were listed as valid but had no runtime effect.

### Config surface changes

- **Several `AideConfig` keys are no longer accepted by `aide-memory config`:** `capture.enabled`, `capture.hooks.preCompact`, `capture.hooks.preToolUse`, `capture.hooks.stop`, `capture.hooks.userPromptSubmit`, `nudge.visible`. These were never actually read by any runtime code — setting them did nothing. They're removed from the valid-keys list so users stop thinking they do something. (If you had any of these in your `.aide/config.json`, they're now ignored; safe to delete the entries.) See `docs/user/configuration.md` for `hooks.*` replacements that do what the `capture.*` names suggested.

- **Scope matching is now configurable AND more consistent.** The previous focused-mode rule was asymmetric: `src/**`-scoped memories matched direct-child files but not grandchildren, and `src/api/**`-scoped memories failed to reach deep files like `src/api/routes/routeA.ts`. Fixed under a new config knob `recall.minScopeDepth` (default `1`) that measures scope specificity. With default `1`, every scope matches its descendants at any depth — so `src/api/**` now correctly surfaces for `src/api/routes/routeA.ts`, and `src/**` surfaces for everything under `src/`. Users with many broad scopes who find per-file recall noisy can bump to `2` (broad scopes like `src/**` get filtered to SessionStart only). See `docs/user/configuration.md` for a visual walkthrough.

### New features

- **`recall.minScopeDepth`** (default `2`) — makes focused-mode scope matching configurable. Fixes the long-standing gap where mid-depth scopes like `src/api/**` didn't surface for deeper files like `src/api/routes/routeA.ts` because they were treated as grandparents. Now scopes with ≥2 fixed segments match descendants at any depth. Set to `1` for the old narrow behavior, or `3+` for stricter scoping. Re-introduces configurability that was accidentally removed when the original `recall.minScopeDepth` was hard-coded into `computeScopedForPath` during Phase 1 cleanup.

- **`injection.excludeScopedPreferences`** (default `false`) — opt-in to filter scoped preferences out of SessionStart injection. Default keeps the current "inject all prefs regardless of scope" behavior. Flip to `true` for tighter initial token usage when you have many area-scoped preferences — they'll still surface via Read/Edit path hooks when the agent touches matching paths.

- **`injection.maxChars`** (default `1200`) — overall character cap for the combined SessionStart injection. Replaces the previously hardcoded `MAX_INJECT_CHARS` constant. Bump to 2000+ for richer initial context, drop to 600 for token-conscious sessions.

- **`contributor` config is now wired up.** Setting `aide-memory config contributor "TeamBot"` actually overrides the git user on new memories. Default `'auto'` reads `git config user.name` as before. Useful for shared repos where multiple humans contribute under a single handle.

- **`embeddings.backend` + `embeddings.model` configs are now wired up.** Accepted values for `backend`: `auto` (default — try transformers → ollama → keyword-only), `transformers` (force local via optional `@huggingface/transformers` dep), `ollama` (force local Ollama at `localhost:11434`), `none` (disable semantic search). `embeddings.model` accepts backend-specific model names (`Xenova/bge-small-en-v1.5` for transformers, `nomic-embed-text` for ollama, or any other supported model).

- **Correction regex extended** to match real-world phrasings: `no, we use X not Y`, `no, I want X instead`, `no, it should be X`, `no, you should use X`, `no, try X instead`. The `^no I mean ...` false-positive filter narrowed to only catch reference clarifications (`no I mean the other file`) — corrections like `no I mean use X instead` now fire correctly.

- **SessionStart section reorder:** `## Always` (priority-marked memories) renders FIRST in the injection output. Under the previous order (always-last), large-project SessionStarts with char-cap truncation could chop off the priority-always section entirely.

- **Preferences sort by `recalled_count desc, updated_at desc`** at SessionStart. Heavily-used preferences rise to the top of the 15-slot cap. New/rarely-recalled prefs get ordered by recency among themselves as tiebreaker.

### Fixes

- **`preRead`/`preEdit` resolve relative → absolute before `hasRecalledFile` lookup.** Production Claude Code always sends absolute paths, so this was latent, but tests and any future relative-path caller (custom MCP integrations, etc.) now correctly transition from hard-block to soft on second read.

- **`recall-log.jsonl` entries use normalized relative paths** instead of whatever the caller passed. Makes log entries consistent across CLI + MCP callers and portable across machines.

- **`contributor` override was previously ignored.** Code hardcoded `detectGitUser()` and never consulted the config. Wired up as described above.

- **`embeddings.backend` / `embeddings.model` were previously ignored.** Code tried Transformers → Ollama in fixed order regardless of config. Wired up as described above.

### Dead-code cleanup

- **6 dead config keys removed from `AideConfig.defaults()`:** `capture.*` family (5), `nudge.visible` (1). These had no runtime reader. `nudge.visible` will return (with real wiring) when the hook-output visibility UX work lands; the other 5 are gone for good.

### Internal

- `scripts/hooks/__tests__/all-configs-behavior.test.sh` now covers every public config (21 PASS, 3 SKIP, 0 FAIL) — enforces that every setting visible in `aide-memory config` either changes observable behavior OR is explicitly flagged as SKIP with a reason. Previous coverage was only 5 of 16 settings.
- New `scripts/hooks/__tests__/install-from-tarball.smoke.sh` — packs the published tarball, installs into a fresh temp dir, runs full CLI lifecycle + drift-repair. Catches packaging-shape regressions that dev-mode tests miss (per memory #163).
- 660 unit tests + 4 bash smokes + 1 install-from-tarball smoke all pass.
- `detect-correction.test.sh` expanded from 9 to 17 cases covering the new regex branches.
- `docs/validation/E2E_VALIDATION.md` (formerly `MANUAL_E2E_VALIDATION.md` — consolidated Phase C7, 2026-04-23) updated for the new configs + revised expected outputs for steps 3, 6, 8.

### Upgrading from 0.4.2

No action required for normal usage. If you had any `capture.*` or `nudge.visible` entries in your `.aide/config.json`, they're silently ignored now — safe to delete, no behavior change.

If your project had `src/api/**`-scoped memories that never surfaced for deeply-nested files like `src/api/routes/routeA.ts`: good news — they now do, automatically.

---

## 0.4.2 — 2026-04-21

Patch release restoring mid-session drift-repair for derived artifacts and fixing a hook-dispatch path-resolution bug caught in post-0.4.1 audit.

### Fixes

- **Mid-session config edits now resync derived artifacts again.** When the 0.4.0 hook consolidation collapsed `scripts/hooks/read-config.sh` into the bundled CLI, an ambient side effect — the `_aide_drift_check` call that ran at the bottom of that sourced file — silently disappeared. As a result, editing `.aide/config.json` by hand (e.g. flipping `memories.hideFromGrep`) no longer triggered re-sync of the `.ignore` file until the MCP server restarted. Restored as `maybeTriggerDriftResync()` in the hook dispatcher; runs on every hook fire, spawns a detached + `unref()`-ed child so hook latency is unaffected. User-facing promise in `docs/user/cli-reference.md` ("next hook fire picks it up") is accurate again. Regression test added.

- **Hook `resolveProjectRoot` fallback matches bash semantics.** The 0.4.0 TS port used `path.resolve(__dirname, '..', '..')` as the `cwd`-missing fallback — which resolves to `dist/` when running the tsc output of `src/memory/hooks/handlers.ts`, not the package root. Swapped to `process.cwd()` which matches the original bash `SCRIPT_DIR/../..` semantics in practice (Claude Code always passes `cwd` in production; fallback only hits in tests).

- **Drift-repair spawn resolves the CLI entry correctly in both build outputs.** The spawn call now prefers `process.argv[1]` (robust against the bundled-vs-tsc-output layout difference) with a `__dirname`-based fallback for tsc-direct invocation contexts.

### Internal

- 658 tests pass (3 new: two drift-repair tests + test of `internal-resync` subcommand).
- Pre-flight bash smoke suites extended to cover the drift-repair path end-to-end.
- `docs/validation/E2E_VALIDATION.md` Scenario I (formerly `MANUAL_E2E_VALIDATION.md` step 15) exercises the drift-repair manually.
- Hidden `aide-memory internal-resync <projectRoot>` subcommand added for the detached child spawn; not part of the user-facing CLI.

No other changes from 0.4.1. All features, CLI commands, hooks, and MCP tools remain identical.

---

## 0.4.1 — 2026-04-21

Patch release fixing two bugs caught in a post-publish audit of 0.4.0.

### Fixes

- **`aide-memory config <hook-key>` no longer fails with "Unknown config key".** 0.4.0 removed `scripts/hooks/defaults.json` from the published tarball (hook logic is bundled, so the source JSON was redundant) — but `src/memory/settings.ts` was still reading that file at runtime to validate config keys. The result: every hook-related setting key (`hooks.read.maxBlocks`, `hooks.stop.schedule`, `recall.limit`, `injection.preferences`, 14 others) reported as "Unknown config key" and returned the AideConfig defaults as the valid key list. Fixed by inlining the defaults JSON at bundle time via the same ES module JSON import pattern the hook handlers use.
- **MCP `serverInfo.version` now reports the installed package version.** The `createServer()` call in `src/memory/server.ts` hardcoded `version: '0.2.0'`, a stale holdover that advertised the wrong product version in the MCP initialize handshake. Changed to read the version from the installed `package.json` at runtime. Functional impact was limited to MCP clients that surface the server-advertised version — npm still shows the correct installed version everywhere else.

No other changes from 0.4.0. All features, CLI commands, hooks, and MCP tools remain identical.

---

## 0.4.0 — 2026-04-21

### aide-memory — the persistent memory layer for AI coding agents

aide-memory gives AI coding agents a persistent, path-scoped memory of everything you've taught them. Your agent remembers your stack, your preferences, your team's conventions, and the reasoning behind your past decisions — across every session, every branch, and every tool.

Memories live in your git repo, not in someone else's cloud. No telemetry, no cross-project leakage, no lock-in. Private by default.

This release is the first stable line shipped as a closed-source, source-protected binary. Earlier numbered versions (0.1.x, 0.2.x, 0.3.x) predated this architecture and are no longer supported.

### What's in the box

**Path-scoped recall across four layers.** Memories are attached to glob scopes (`src/api/**`, `docs/`, a specific file, or project-wide) and surface to your agent when it touches those paths. Four semantic layers keep recall organized:

- **preferences** — how you like to work (coding style, tool choices, personal habits)
- **technical** — facts about your stack (library constraints, version requirements, known gotchas)
- **area_context** — decisions for a code area (why the auth module works this way, the trade-offs made)
- **guidelines** — team principles and rules

Parent-scope inheritance (memories scoped to `src/components/**` also match `src/components/dashboard/Card.tsx`) and focused-scope filtering (grandparent scopes stay out of the way) make recall precise enough to not be noisy.

**Full MCP server integration.** Once `aide-memory init` wires up `.mcp.json`, your agent gets seven tools:

- `aide_recall` — retrieve memories for a set of paths
- `aide_remember` — store a new memory (four layers supported)
- `aide_update` — change an existing memory's `why`, `scope`, or `priority`
- `aide_forget` — delete a memory
- `aide_search` — keyword-match across all memories
- `aide_memories` — list memories with filters
- `aide_import` — bulk import memories from raw text (e.g., a README or decision doc)

All tool schemas accept lenient inputs (`z.coerce.number()` for IDs, `null` in addition to `undefined` for optional fields) so LLMs don't get blocked by minor type mismatches.

**Eleven hooks that nudge the agent at the right moments.** aide-memory installs hooks into `.claude/settings.json` that fire during a Claude Code session:

- **Pre-read / pre-edit** — block or soft-nudge the agent to call `aide_recall` before touching a file with scoped memories
- **Pre-search** — nudge the agent to call `aide_search` before a Grep/Glob when matching memories exist
- **Pre-prompt (UserPromptSubmit)** — detect corrections, decisions, and preferences in what you type, and prompt the agent to store them via `aide_remember`
- **Session-start injection** — surface preferences, guidelines, and priority-always memories as context at the start of every session
- **Dynamic Stop-hook intervals** — remind the agent to save newly-learned things every 3rd, 5th, or 10th turn (configurable schedule) so nothing is lost between sessions
- **Pre-compact cleanup** — clear session tracking before Claude Code compacts the context, so the next turn re-blocks cleanly
- **Post-tool trackers** — mark ids/paths/queries as already-recalled so the same memory doesn't get nudged twice

Hook logic is bundled into the distributed binary; only a thin bash shim is visible on disk. All hook behavior is configurable via `aide-memory config`.

**CLI parity with the MCP surface.** Everything agents can do over MCP, you can do from the terminal:

```
aide-memory init                        # set up .aide/, .claude/rules/, .mcp.json, hooks
aide-memory remember "<what>" --layer <layer> [--scope <glob>] [--contributor <name>]
aide-memory recall <path>               # preview what the agent will see
aide-memory list [--layer <layer>]
aide-memory search <keyword>
aide-memory update <id> [--why ...] [--scope ...] [--priority always|normal]
aide-memory forget <id>
aide-memory stats                       # counts by layer, most-recalled, source breakdown
aide-memory config <key> [value]        # tune 18 public settings
aide-memory sync export | sync import   # reconcile SQLite cache ↔ .aide/memories/*.json
aide-memory cleanup                     # remove stale session tracking files
```

**Synchronous SQLite backend.** Memories are written to `.aide/memories/<layer>/<uuid>.json` and indexed in a local SQLite cache at `.aide/memory.db`. Commits track memory changes via git — the database is rebuildable from the JSON files at any time (`aide-memory sync import`), so losing the cache is never lossy.

**Optional semantic recall.** The default recall is fast keyword + scope filtering. Install `@huggingface/transformers` to add BGE-small-en-v1.5 embeddings for semantic-similarity fallback when keyword matches come up short. Optional dependency — no effect on cold install size if you don't use it.

**18 tunable settings.** `aide-memory config` lets you adjust nudge aggressiveness, injection limits per layer, embedding backend, stop-hook intervals, grep-hook mode, and more. Every setting is transparent — no hidden pro-vs-free gating in the current version.

**Drift-repair.** If `.claude/rules/aide-memory.md`, `.mcp.json`, or `.claude/settings.json` hook entries drift from the canonical form mid-session (e.g., because someone edited them by hand), aide-memory re-syncs them automatically on the next hook fire. No restart required.

**Multi-editor rules templates.** `aide-memory init` installs guidance-rule files for Claude Code, Cursor, Copilot, Codex, and Windsurf. Your agent sees the rule file appropriate to whatever tool is running.

### Distribution

- **Install:** `npm install -g aide-memory`
- **Size:** 388 KB compressed, ~1.4 MB unpacked (three bundled JS entries for CLI / library / MCP server + 11 bash hook shims + rule templates + docs + license).
- **Node version:** requires Node.js 18 or later. No Node runtime shipped — aide-memory runs on whatever Node you already have.
- **Platforms:** any platform with Node.js + better-sqlite3 (native) — macOS arm64/x64, Linux x64/arm64, Windows x64 all supported.
- **No telemetry or cloud dependency.** All data lives in your local `.aide/` directory, committed to your git repo.

### License

aide-memory is free to install and use — personal and commercial — under the terms in `LICENSE.md`. This version has no paid features. The license reserves the right to offer paid features in future versions; the terms that ship with any given version continue to apply to that version.

Source code is NOT distributed. The package ships bundled and minified JavaScript with reverse-engineering prohibited by the license. Your `.aide/memories/` data, hook scripts invoked by your own projects, and anything you write using aide-memory remain fully yours.

### Support

- Issues: <https://github.com/aide-memory/aide-memory/issues>
- Docs: <https://aide-memory.dev>
