# Full Audit — minified-publish release

Systematic audit of the minified-publish architecture covering bundle hygiene, import-graph separation, source-map exclusion, file allowlist completeness, and real-scenario behavior. Run 2026-04-21.

**Result: all checks pass.** Two bugs caught and fixed during this audit:

1. **CLI bundle leaked the dev-monorepo `package.json`** — `require('../../package.json')` at bundle time inlined the whole object, exposing `aide-v0`, `aide-legacy`, "graph-based retrieval", and all legacy dep names in the minified output. Fixed by switching to a runtime `fs.readFileSync` pattern.
2. **Missing `LICENSE` file** — `package.aide-memory.json` references one but none exists. Flagged for user decision (legal content).

---

## Part 1 — Static audits (all pass)

### 1.1 Legacy-identifier leak check across all three bundles

```
=== aide-legacy / aide-v0 / old-AIDE identifiers in each bundle ===
--- dist/cli/aide-memory.js ---     (empty)
--- dist/memory/index.js ---        (empty)
--- dist/memory/cli.js ---          (empty)
```

Search strings: `aide-legacy`, `aide-v0`, `graph-based retrieval`, `ts-morph`, `tree-sitter-typescript`, `web-tree-sitter`, `chokidar`, `marked-terminal`, `axios`, `express`. None appear in any bundle after the fix. ✓

### 1.2 Import-graph separation

Built each entry point with `esbuild --metafile` and inspected the input set for any paths under legacy directories:

- `src/cli/aide-memory.ts`: zero imports from `src/brain/`, `src/orchestration/`, `src/analysis/`, `src/retrieval/`, `src/project/`, `src/core/logger`, `src/core/tokenTracker`, `src/core/treeSitter`. ✓
- `src/memory/index.ts`: zero. ✓
- `src/memory/cli.ts`: zero. ✓

Full import graph for the published artifact stays entirely within `src/memory/*`, `src/cli/aide-memory.ts`, `src/cli/commands/memory/*`, and allowed third-party deps.

### 1.3 Source-map audit

| Location | Status |
|---|---|
| `dist/cli/aide-memory.js` `sourceMappingURL` | not present ✓ |
| `dist/memory/index.js` `sourceMappingURL` | not present ✓ |
| `dist/memory/cli.js` `sourceMappingURL` | not present ✓ |
| `dist/**/*.map` | none ✓ |
| `scripts/hooks/**/*.map` | none ✓ |
| Hook helper `.js` files referencing `sourceMappingURL` | none ✓ |
| `tsconfig.json` `sourceMap` or `inlineSourceMap` | not set (default false) ✓ |
| Bundle tails (last 200 bytes) | pure minified code, no trailing `//# sourceMappingURL=` ✓ |

**Hooks are shipped as-is** (not bundled) — they are plain bash + small node-helper JS files with no compilation step, so there are no source maps to strip. Verified by grepping all `.js` helpers and `.sh` scripts.

### 1.4 Hook-helper contract audit

Each hook helper's require targets were traced against the tarball contents:

| Helper | Requires | Resolves in tarball? |
|---|---|---|
| `recall-for-path.js` | `dist/memory/index` (MemoryStore, computeScopedForPath) | ✓ — `dist/memory/index.js` shipped |
| `search-preview.js` | `dist/memory/index` (MemoryStore) | ✓ |
| `session-inject.js` | `dist/memory/index` (MemoryStore); `./read-config.js` (getSetting) | ✓ + ✓ |
| `read-config.js` | built-ins only | ✓ |

Each `.sh` file's sourced/spawned targets:

| Shell ref | Resolves? |
|---|---|
| `$SCRIPT_DIR/clear-tracking.sh` | ✓ |
| `$SCRIPT_DIR/read-config.sh` | ✓ |
| `$SCRIPT_DIR/defaults.json` | ✓ |
| `node $SCRIPT_DIR/session-inject.js` | ✓ |
| `node $SCRIPT_DIR/recall-for-path.js` | ✓ |
| `node $SCRIPT_DIR/search-preview.js` | ✓ |

All hook contracts resolve cleanly in the installed tarball.

### 1.5 File-inclusion audit (31 files ship)

Complete tarball contents:

- **Bundled JS (3):** `dist/cli/aide-memory.js`, `dist/memory/index.js`, `dist/memory/cli.js`
- **Hook scripts (16):** all 11 `.sh`, all 4 `.js` helpers, `defaults.json`
- **Rule templates (5):** `claude-code.md`, `codex.md`, `copilot.md`, `cursor.mdc`, `windsurf.md`
- **Docs (3):** `README.md`, `README.npm.md`, `README.legacy.md`
- **Manifest:** `package.json` (aide-memory publish manifest, renamed from `package.aide-memory.json` at publish time)
- **LICENSE:** MISSING — `package.aide-memory.json` references it but no file exists. **Flagged for user.**

No `.ts`, no `.map`, no `src/` (except `src/templates/rules/`), no dev configs, no dotfiles (`.claude`, `.aide`, `.github`, `.git`).

### 1.6 Hardened `scripts/verify-package.sh`

Added defense-in-depth checks that fail a publish if:

- Any `.ts` source in tarball
- Any `.map` in tarball
- Any `src/` outside `src/templates/rules/`
- Any dev-monorepo leak string in a bundle (`aide-v0`, `aide-legacy`, `graph-based retrieval`, `ts-morph`, `tree-sitter-typescript`, `web-tree-sitter`, `marked-terminal`)
- Any `sourceMappingURL` reference in any bundle
- Missing bundle: CLI, library, or MCP server entry

This is the CI gate. If any check fails, `npm publish` is blocked.

---

## Part 2 — Real-scenario validation (9 scenarios, all pass)

Scratch project at `/tmp/aide-audit-<ts>` with git init + 3 source files in `src/memory/`, `src/cli/`, `src/api/`. Installed minified tarball via `npm install`.

### Scenario A: fresh install, no `.aide/`

- `aide-memory list` → "No memories found." ✓
- `pre-read-recall.sh` with representative stdin → exit 0, silent ✓
- `session-start-clear.sh` → exit 0, silent (no .aide/ = nothing to inject) ✓

### Scenario B: init + idempotent re-init

- First init creates `.aide/`, `.claude/rules/`, `.cursor/rules/`, `.claude/settings.json` (6 hook events, 15 hook entries), `.mcp.json`, `.aide/config.json`, `.gitignore` entries, `.ignore`, `.git/hooks/post-checkout` ✓
- Second init detects existing artifacts, reports each as "already present" ✓
- `.mcp.json` correctly points at `node_modules/aide-memory/dist/memory/cli.js` ✓

### Scenario C: CLI memory lifecycle

All 4 layers stored. Scoped recall verified:

- `recall src/memory/store.ts` → technical (src/memory/**) + preferences + guidelines (correctly excludes api area_context)
- `recall src/api/routes.ts` → area_context (src/api/**) + preferences + guidelines (correctly excludes memory technical)
- `recall src/cli/index.ts` → only project-wide (preferences + guidelines, neither scoped memory matches)

`search`, `stats`, `update`, `forget`, `list` all work.

### Scenario D: MCP server via stdio

MCP server spawned from `dist/memory/cli.js`:

| Call | Result |
|---|---|
| `initialize` | server `aide-memory 0.2.0`, protocol `2024-11-05` ✓ |
| `tools/list` | exactly 7 tools in expected alphabetical order ✓ |
| `aide_remember` × 2 | stored, returned id + uuid ✓ |
| `aide_memories` | "Showing 5 of 5" ✓ |
| `aide_recall` | layered output with scope filtering ✓ |
| `aide_search` | validates input correctly (test used wrong arg name, got proper error) ✓ |
| `aide_update` | updated memory ✓ |
| `aide_forget` | deleted, echoed ✓ |
| `aide_import` | validates `content` requirement ✓ |

### Scenario E: hook permutations

11 permutations tested against scoped/unscoped files, matching/non-matching queries, correction/non-correction prompts, stop-count boundaries, session-start injection:

| # | Permutation | Behavior | ✓ |
|---|---|---|---|
| E1 | pre-read on scoped file with matching memory | returns additional context with `aide_recall` call hint | ✓ |
| E2 | pre-read on unscoped file (no scoped memory) | silent (project-wide handled by session-start) | ✓ |
| E3 | pre-edit on scoped file | returns context with "before editing" phrasing | ✓ |
| E4 | pre-search with matching query | returns match count + call-to-search | ✓ |
| E5 | pre-search with non-matching query | silent | ✓ |
| E6 | detect-correction with "actually" phrase | nudges to store via aide_remember | ✓ |
| E7 | detect-correction without correction phrase | silent | ✓ |
| E8 | stop at count 1 | silent (interval is every 3rd turn) | ✓ |
| E9 | stop at count 3 | block with "store decisions" reason | ✓ |
| E10 | session-start on new session | injects "prefer terse logs" preference | ✓ |
| E11 | pre-compact | silent, clears tracking | ✓ |

### Scenario F: sync export/import round-trip

- SQLite had 4 memories, `.aide/memories/` had 4 JSON files (one per UUID)
- `sync export` → "everything up to date" (idempotent)
- Deleted SQLite DB, ran `sync import`
- After import: all 4 memories restored, IDs preserved via UUIDs ✓

### Scenario G: config get/set

- `config nudge.visible false` → set, get returns `false` ✓
- `config recall.limit 20` → set, get returns `20` ✓
- `config hooks.read.maxBlocks 3` → set, get returns `3` ✓

### Scenario H: upgrade simulation (uninstall + reinstall)

- `rm -rf node_modules/aide-memory && npm install <tarball>` simulates a fresh install over existing project
- Memories persist (stored in `.aide/`, not `node_modules/`) ✓
- All 4 memories still accessible via `list` after reinstall ✓

### Scenario I: cleanup

- `cleanup --dry-run` on a freshly-touched tracking file → "No stale tracking files found" (file too recent) ✓
- `cleanup --all` → "Cleaned up 1 stale tracking file(s)" ✓

---

## Part 3 — Flagged items for user decision

### 3.1 LICENSE file missing

`package.aide-memory.json` declares `"license": "SEE LICENSE IN LICENSE"` and the `files` allowlist includes `LICENSE` — but the file does not exist in the repo. npm silently skips missing files. **Tarball ships without a license.**

**Impact:** users installing aide-memory see "license" reported by `npm view aide-memory license` but no actual terms. For a closed-source commercial product this is ambiguous and arguably should be fixed before broader distribution.

**Action needed:** add a `LICENSE` file at the repo root with the actual terms. Content is a legal decision, not a build-pipeline concern — this was flagged rather than autofilled.

### 3.2 Release workflow ordering (already correct)

The `.github/workflows/release.yml` workflow sequence is:

1. `npm ci` (dev deps)
2. `npm run build` (tsc — uses dev manifest for tests)
3. `npm run build:dist` (esbuild bundles — at this point `package.json` is still the dev manifest)
4. `npm test` (uses dev manifest)
5. `cp package.aide-memory.json package.json` (manifest swap)
6. `./scripts/verify-package.sh`
7. `npm publish`

Because of step 3 happening before step 5, the bundled CLI used to inline the dev manifest (see bug #1 fixed in this audit). The fix — runtime read of `package.json` in `src/cli/aide-memory.ts` — makes this ordering safe. The bundle no longer cares what `package.json` looks like at build time; it reads whatever the installed `package.json` is at runtime.

No workflow change required. Added defensive `verify-package.sh` check as belt-and-suspenders.

### 3.3 Pre-existing `LICENSE` reference in `package.aide-memory.json` `files` field

Kept in the allowlist so it ships automatically once someone adds the file. npm accepts missing allowlist entries silently.

---

## Summary

- **Static audit:** bundles clean, import graph clean, no source maps, hook contracts resolve, 31-file tarball contents complete (minus missing LICENSE).
- **Defense-in-depth:** `scripts/verify-package.sh` now fails on any regression (source leak, map file, dev-manifest leak, missing bundle).
- **Real scenarios:** 9 scenarios covering fresh install, init idempotency, CLI lifecycle, MCP 7 tools, 11 hook permutations, sync round-trip, config, upgrade, cleanup — all pass.
- **Bugs caught + fixed:** dev-manifest leak into CLI bundle, missing MCP server bundle.
- **Flagged:** LICENSE file missing — user decision.

Branch `feature/minified-publish` is ready for the publishing agent to version-bump and release. See `docs/HANDOFF_MINIFIED_PUBLISH.md` for publish steps and `docs/RELEASING.md` for the permanent release playbook.
