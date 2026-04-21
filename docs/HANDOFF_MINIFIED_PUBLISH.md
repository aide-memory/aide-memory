# Handoff — aide-memory releases 0.3.0 → 0.4.1

**Current `latest` on npm: `aide-memory@0.4.1` (2026-04-21T22:44:35Z).** Three releases shipped across this session: 0.3.0 (minified publish architecture), 0.4.0 (hook logic bundled into CLI), 0.4.1 (post-publish bug fixes). This doc tracks what shipped and what still needs attention.

---

## DONE in this session

### 1. Released three npm versions

| Version | Published | Summary |
|---|---|---|
| **0.4.1** | 2026-04-21T22:44:35Z | Patch: fixes two bugs caught in post-publish 0.4.0 audit (see Audit Findings below) |
| 0.4.0 | 2026-04-21T22:28:59Z | Hook logic consolidated into `aide-memory hook <name>` CLI subcommand; .sh files reduced to 4-line shims |
| 0.3.0 | 2026-04-21T21:59:15Z | First minified-publish release (bundled CLI, library, MCP server; no source code shipped); --scan flag removed |

Current release smoke test (0.4.1, post-publish):
- `npm install aide-memory@0.4.1` clean install succeeds
- `aide-memory --version` → `0.4.1` ✓
- `aide-memory init` creates `.aide/`, `.claude/`, `.mcp.json` ✓
- CLI lifecycle (remember + list + recall + search + update + forget + stats + config + sync + cleanup) all work ✓
- MCP server spawn from `dist/memory/cli.js` → `tools/list` returns 7 tools ✓
- All 11 hook shims dispatch correctly through the bundled CLI ✓
- Zero readable source on disk — `find node_modules/aide-memory -name "*.ts" -o -name "*.map"` returns nothing; hook `.sh` files are 4-line shims
- `scripts/verify-package.sh` passes with all defense-in-depth checks (no `.ts`, no `.map`, no dev-manifest leaks, no `sourceMappingURL` references in bundles, no missing bundle entries)

### 2. Branches + tag

- `feature/phase-1` on origin is now at **`d02c783`** (the release commit). Phase-1 is the canonical release line going forward.
- `feature/minified-publish` is at the same commit (`d02c783`).
- Tag `v0.3.0` → `d02c783`.
- Merge commit `0a84beb` folded in phase-1's 5 MCP schema-leniency fixes before release.

### 3. Release artifacts (shipped tarball)

- 32 files, 388 KB compressed, 935 KB unpacked
- **3 bundled minified JS entries:** `dist/cli/aide-memory.js` (CLI), `dist/memory/index.js` (library), `dist/memory/cli.js` (MCP server stdio)
- **Hook glue:** 11 `.sh` + 4 `.js` helpers + `defaults.json` in `scripts/hooks/` (shipped as plain readable text — see "Hook visibility" in REMAINING below)
- **Rule templates:** 5 `.md/.mdc` files
- **Docs:** `README.md`, `README.npm.md`, `README.legacy.md`
- **License:** `LICENSE.md` (17 clauses, NC jurisdiction, reserves pro-tier for future versions)
- **Manifest:** `package.json` (published publication manifest — `name: aide-memory`, `license: "SEE LICENSE IN LICENSE.md"`, only `better-sqlite3` as runtime dep; everything else bundled)

### 4. LICENSE.md created

Custom EULA, agent-researched to match the industry pattern for closed-source CLIs (same approach as Claude Code and GitHub Copilot CLI). 17 sections including DMCA §1201(f) interop carve-out, per-version licensing (so future paid versions are governed separately), AAA arbitration + class-action waiver + jury-trial waiver in Wake County NC, $100 aggregate liability cap, AI/training-data exclusion clause.

**Not attorney-reviewed.** A 1-hour IP-counsel review is strongly advisable before introducing a paid tier or scaling distribution substantially. See memory 166 for the rationale and the 11 off-the-shelf licenses explicitly rejected + why.

### 5. CHANGELOG.md written

Covers everything accumulated since the live 0.2.0 on npm (published 2026-04-11). Sections: Breaking / New features / Fixes / Internal / Distribution / License / Upgrading. See the file for the full list.

### 6. Defense-in-depth hardening

- `scripts/verify-package.sh` — fails publish on any `.ts`, `.map`, unbundled source, sourceMappingURL reference, or dev-monorepo-leak string (`aide-v0`, `aide-legacy`, legacy dep names) in any of the three bundles.
- `.npmignore` — `**/*.map`, `*.d.ts.map`, `*.ts`, `.github/`, `.git/` as belt-and-suspenders.
- CLI bundle no longer inlines `package.json` at build time (switched from `require('../../package.json')` to runtime `fs.readFileSync`), removing a dev-manifest leak that was in the earlier commits.

### 7. CI workflow updated for Node 24 deprecation

`.github/workflows/release.yml` now sets `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true` to opt into Node 24 runners ahead of the June 2026 forced migration. Bumped `setup-node` from Node 18 → 20 for the build environment. Deprecation warning resolved for the next release.

---

## Audit findings from this session (all addressed)

Two bugs caught in post-0.4.0 audit and fixed in 0.4.1:

1. **`aide-memory config <hook-key>` rejected every hook-setting key.** 0.4.0 dropped `scripts/hooks/defaults.json` from the published tarball (the JSON was inlined into the hook dispatcher via esbuild JSON import). But `src/memory/settings.ts` was still reading that file from disk at runtime via `fs.readFileSync`. With the file missing, `loadDefaults()` silently returned `{}`, so `validateConfigKey('hooks.read.maxBlocks')` failed with "Unknown config key" and the list of valid keys shrank from ~31 to ~13 (AideConfig leaves only). Fix: inline the JSON in `settings.ts` via the same ES module JSON import pattern. Ships in 0.4.1.

2. **MCP server advertised `version: '0.2.0'` on initialize.** `src/memory/server.ts` `createServer()` hardcoded the version literal, a holdover from the 0.2.0 era that never got bumped for 0.3.0 or 0.4.0. MCP clients surfacing `serverInfo.version` saw the wrong version. Fix: read version from installed package.json at runtime. Ships in 0.4.1.

**Lesson for future releases:** any change to the `files` allowlist in `package.aide-memory.json` must be cross-referenced against every `fs.readFileSync` / `require` at runtime in the published code. The hook dispatcher's handlers caught this at build time (via JSON import), but `settings.ts` wasn't in the refactor scope and was missed. Added `scripts/verify-package.sh` checks in the history but none covered this specific pattern — worth adding a smoke-test step to CI that reads an arbitrary hook setting post-install.

---

## REMAINING (in priority order)

### A. Await manual validation

**Required before user-facing announcement / broader adoption push.**

The automated pre-publish validation (`scripts/verify-package.sh`, unit tests, build/bundle/tarball checks) has passed. But **manual Phase 1 validation scenarios** against the now-published 0.3.0 have NOT been run this session. These live in:

- `docs/validation/PHASE_1_RESULTS.md` (existing scenario results + methodology)
- `docs/MANUAL_E2E_VALIDATION.md` if present (A-G + D/F/G/A7/gap-fill scenarios)
- `docs/specs/PHASE_0_1_SPEC.md` § validation criteria

Expected flow: install `aide-memory@0.3.0` in a real project (not a scratch one), run the A-G scenarios + cross-session persistence + IDB-based blocking + concurrent sessions + session-start injection. Confirm:
- Memories persist across sessions
- Scoped recall returns the expected layers per scenario
- Hooks fire correctly in real Claude Code sessions (not just isolated stdin pipes)
- MCP tool calls succeed from real client

Log results to `docs/validation/PHASE_1_RESULTS.md` or a new `docs/validation/V0.3.0_RESULTS.md`.

**If any scenario fails:** triage, fix, ship 0.3.1 patch. See `docs/RELEASING.md` for the patch-release process.

### B. Deprecate + unpublish stale versions (0.1.1 and 0.2.0)

User decision: remove access to old versions that ship unbundled/raw JavaScript source.

#### Step 1 (immediate): deprecate

```bash
npm deprecate aide-memory@0.1.1 "Superseded by 0.3.0. This version shipped raw JavaScript source and is no longer supported — please upgrade."
npm deprecate aide-memory@0.2.0 "Superseded by 0.3.0. This version shipped raw JavaScript source and is no longer supported — please upgrade."
```

Soft warning on install; versions stay downloadable until unpublished.

#### Step 2 (try CLI directly — likely succeeds):

Per npm policy ([docs.npmjs.com/policies/unpublish](https://docs.npmjs.com/policies/unpublish)): after 72h, CLI unpublish works if ALL THREE: no reverse deps + <300 weekly downloads + single maintainer. aide-memory meets all three.

```bash
# Eligibility pre-check
npm view aide-memory@0.1.1 dependents
npm view aide-memory@0.2.0 dependents
curl -s "https://api.npmjs.org/downloads/point/last-week/aide-memory" | python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("downloads"))'
npm owner ls aide-memory

# If eligible, unpublish directly:
npm unpublish aide-memory@0.1.1
npm unpublish aide-memory@0.2.0
```

#### Step 3 (fallback, only if CLI refuses):

File a support ticket at [npmjs.com/support](https://www.npmjs.com/support):

> Subject: Unpublish request — aide-memory@0.1.1 and @0.2.0 (source exposure)
>
> Hi npm support,
>
> I'm the maintainer of `aide-memory` (npm user: `<your-npm-username>`). I'd like to request removal of versions 0.1.1 (published 2026-04-08) and 0.2.0 (published 2026-04-11).
>
> Both versions were published before we finalized the source-protection design and contain unbundled, readable TypeScript-compiled JavaScript that we intended to ship only as a minified bundle starting with 0.3.0. The current versions expose implementation details we now consider closed source.
>
> I understand these are outside the 72-hour unpublish window. I have already deprecated both versions. I've verified no other npm packages depend on either version (see dependents count on the npm page). Version 0.3.0 supersedes both with identical functionality except for `--scan` removal, documented in the 0.3.0 changelog.
>
> Thank you for considering this request.

Expect 2-5 business days for review.

#### After unpublish succeeds

Update README and landing page to reference 0.3.0+ only. Note: anyone with 0.1.1/0.2.0 already installed locally keeps working — unpublish only touches the registry.

### C. Hook visibility decision (open question)

Current state: `scripts/hooks/*.sh` (bash glue) and `scripts/hooks/*.js` (node helpers calling into the bundled `dist/memory/index.js`) ship as plain readable text in `node_modules/aide-memory/scripts/hooks/`. The **core logic** (memory engine, recall algorithm, MCP handlers) IS minified in the bundle — what's readable is the glue code that extracts JSON fields from stdin and spawns the node helpers.

Decision pending: is this acceptable, or should hooks also be minified?

**Option A — ship 0.3.1 with hooks minified.** Bundle each hook `.js` helper (recall-for-path.js, search-preview.js, session-inject.js, read-config.js) into a minified artifact at `dist/hooks/<name>.js`. Update `.sh` files to point there. Bash `.sh` files remain visible (bash has no "compile") but they'd be 10-20 lines of thin shim. ~2-4 hours. Version bump: 0.3.1.

**Option B — consolidate into `aide-memory hook <name>` subcommand pattern.** Hook logic moves into the CLI bundle as subcommands. `.sh` files become single-line: `aide-memory hook pre-read`. Everything user-visible is single-line bash shim + minified CLI bundle. ~1-2 days. Version bump: 0.4.0 (breaking — hook-invocation shape changes).

**Option C — accept current state.** Core IP is minified. Glue is visible but low-value.

User decision needed. Affects next release scope.

### D. Verify release notes are comprehensive

CHANGELOG.md was written from my memory of commits + the handoff plan — **it was NOT written by surveying every commit since the last live 0.2.0 tarball.** The publishing agent's original mandate was to "survey everything that has accumulated since the live aide-memory@0.2.0."

To verify the changelog is complete, run:

```bash
cd /Users/meky/code/aide-v0
# Find the commit used for live 0.2.0 build
# (approximately 2026-04-11)
git log --oneline --since="2026-04-10" --until="2026-04-22" feature/phase-1 > /tmp/commits-since-020.txt
# Compare to CHANGELOG.md entries
```

Look for commits that touched:
- `src/memory/` — affects core behavior
- `src/cli/commands/memory/` — affects CLI UX
- `scripts/hooks/` — affects hook behavior
- `src/templates/rules/` — users' rules files may differ
- `src/memory/server.ts` — MCP tool shapes

If any commit's user-visible change is missing from the changelog, amend CHANGELOG.md and push. (No re-publish needed; CHANGELOG.md is in the tarball but users read it on GitHub — a post-hoc edit is fine.)

### E. Update landing page / external docs

Per memory 121 + the LICENSE update:
- ✅ Say "free" (current version)
- ❌ Don't say "always free" / "free forever"
- ✅ Can say "pro features planned"
- ❌ Don't say "open source"

Update `docs/PUBLIC_README.md`, landing page install instructions to use 0.3.0, and any marketing copy to match the revised memory 121.

### F. Post-unpublish README/landing cleanup

After 0.1.1 / 0.2.0 are unpublished (step B):
- Remove any "install 0.1.1" or "v0.2.0 changelog" references from README / landing
- Add a FAQ note that older versions have been removed

---

## What's in each doc on this branch

- **HANDOFF_MINIFIED_PUBLISH.md** (this file) — one-off for the 0.3.0 transition + remaining post-publish items
- **RELEASING.md** — permanent release playbook for every future release (use this, not the handoff, for future releases)
- **VALIDATION_MINIFIED_PUBLISH.md** — pre-publish E2E validation results (CLI + MCP + hooks via scratch install)
- **AUDIT_MINIFIED_PUBLISH.md** — static + scenario audit (import-graph cleanliness, source-map check, legacy-identifier leak check, 9 real scenarios)
- **CHANGELOG.md** — user-facing release notes for 0.3.0

## Guardrails for the next release

From memory 151 + validation scars:

- **Never re-add pure-JS deps to `package.aide-memory.json` `dependencies`.** `commander`, `chalk`, `fast-glob`, `@modelcontextprotocol/sdk`, `zod` are intentionally bundled by esbuild. Adding them back causes npm to install them twice.
- **Never loosen the `files` allowlist** to include directories like `dist/memory/` or `dist/cli/commands/`. Those would leak unbundled tsc output.
- **Never drop any of the three bundles** (`dist/cli/aide-memory.js`, `dist/memory/index.js`, `dist/memory/cli.js`). Missing any breaks a user path.
- **Never bypass `scripts/verify-package.sh`** in CI. It's the safety net against source-map/dev-manifest regressions.
- **Read `package.json` at runtime, not via `require('../../package.json')`** — bundle-time require inlines the dev manifest.
- **Merge feature branches INTO `feature/phase-1` before publishing** (not the other way). `feature/phase-1` should be the release line that every version tag lives on.

## Open items from the design discussion (optional follow-ups)

- The `feature/binary` branch (Bun compile exploration) is abandoned. See memory 151 history. Can be deleted or kept.
- The `pre-binary-migration` git tag marks the pre-release rollback point. Harmless to keep.
- If source protection ever needs to be stronger than minified-npm, the upgrade path is Rust via napi-rs for sensitive modules (not a different JS bundler). See memory 157.
