# Handoff — aide-memory minified-publish release

**Context for the publishing agent:** a previous session implemented the
build-pipeline changes to ship aide-memory as a minified JS bundle via npm.
Your job is to (a) survey everything that has accumulated since the live
aide-memory@0.2.0 on npm, (b) decide the correct next version per semver,
(c) write the release notes, and (d) publish.

---

## What the previous session built (this branch)

Branch: `feature/minified-publish` (off `feature/phase-1@71f8a9b`).
Single commit: **`d30f617`** — `feat(publish): minify + bundle at publish time via esbuild; tighten files allowlist`.

### Changes in this commit

- **esbuild added as devDependency.** `npm install --save-dev esbuild`.
- **New npm scripts** (in both `package.json` and `package.aide-memory.json`):
  - `build:dist` → runs CLI + library bundles
  - `build:dist:cli` → `esbuild src/cli/aide-memory.ts --bundle --platform=node --target=node18 --minify --external:better-sqlite3 --external:@huggingface/transformers --outfile=dist/cli/aide-memory.js`
  - `build:dist:lib` → same flags for `src/memory/index.ts` → `dist/memory/index.js`
  - `prepublishOnly` (in package.aide-memory.json) → `npm run build && npm run build:dist && ./scripts/verify-package.sh`
- **Hook helpers migrated** to require the bundled library (`dist/memory/index`) instead of individual module files. Affects:
  - `scripts/hooks/recall-for-path.js`
  - `scripts/hooks/search-preview.js`
  - `scripts/hooks/session-inject.js`
- **`src/memory/index.ts`** now exports `computeScopedForPath` (needed by the migrated hook helper).
- **`package.aide-memory.json`**:
  - `files` allowlist tightened to: `dist/cli/aide-memory.js`, `dist/memory/index.js`, `scripts/hooks/*.{sh,js}`, `scripts/hooks/defaults.json`, `src/templates/rules`, `README.md`, `LICENSE`.
  - `dependencies` slimmed to `better-sqlite3` only. commander, chalk, fast-glob, @modelcontextprotocol/sdk, zod are now bundled (no longer runtime deps).
  - `optionalDependencies` keeps `@huggingface/transformers` (dynamic-imported, external).
- **`scripts/verify-package.sh`** rewritten — fails on any `.ts` source, `.map` file, dev-only directory, unbundled dist output, or missing bundle in the tarball.
- **`.npmignore`** hardened with `**/*.map`, `*.d.ts.map`, `*.ts`, `.github/`, `.git/`.
- **`.github/workflows/release.yml`** runs `build:dist` after `build`, and `verify-package.sh` before `npm publish`.
- **`src/__tests__/package.test.ts`** updated for the new manifest shape; version assertion loosened to a semver regex.
- **All 654 tests pass** locally under this branch.

### End-to-end verification already done

- `npm pack --dry-run` produces 30 files, 242 KB compressed, 935 KB unpacked.
- No `.ts` source, no `.map` files, no `dist/cli/commands/memory/` or unbundled `dist/memory/*.js` leak into the tarball.
- `./scripts/verify-package.sh` passes.
- Clean-install test: `npm install ./aide-memory-0.2.0.tgz` in an empty project → `aide-memory init / remember / recall / search` all work end-to-end.
- Published bundle head: `#!/usr/bin/env node` + single minified line. No original function names, no comments, no types visible.

---

## What you (publishing agent) need to decide

### 1. Version bump — **required before publish**

`package.aide-memory.json` currently reads `"version": "0.2.0"`. **That version is already live on npm**, published 2026-04-11, and contains the pre-cleanup codebase (still has `--scan`, ships unbundled source). You cannot republish 0.2.0.

**Recommended: 0.3.0.** Rationale:
- `--scan` removal is a breaking change (users invoking `aide-memory init --scan` will fail).
- Multiple new features accumulated on `feature/phase-1` since live 0.2.0 (pending-memories import, mid-session drift-repair, settings refactor — see "Full diff to survey" below).
- Pre-1.0 SemVer: bump the minor segment for breaking changes + new features.

If you find something in the diff that warrants a 1.0.0 "we're stable now" declaration, consider that. Otherwise 0.3.0.

Bump in `package.aide-memory.json` (NOT `package.json` — the root is the dev-monorepo manifest, irrelevant to what ships).

### 2. Full diff to survey

Published 0.2.0 was tagged at some commit on or near 2026-04-11. The full set of changes since then includes work from multiple sessions:

```bash
# From the repo root, on feature/phase-1:
git log --oneline --since="2026-04-10" feature/phase-1

# Or compare against the published tarball contents:
git log --format='%h %s' feature/phase-1 -- src/ scripts/hooks/ package.aide-memory.json
```

Known accumulated changes (not exhaustive — verify via git log):

- **Breaking**: `aide-memory init --scan` flag removed (commit 6be74e6). `src/memory/scan.ts` deleted. Users relying on `--scan` should seed memories via `aide-memory remember` or the MCP `aide_remember` tool.
- **New feature**: pending-memories import on MCP server startup (commit b7e5a4d, closes J6). Previously a crashed session could leave memories unimported.
- **New feature**: mid-session drift-repair for derived artifacts via `read-config.sh` (commit 4382bed). `.claude/rules/aide-memory.md`, `.mcp.json`, and `.claude/settings.json` hook entries now re-sync automatically when they drift mid-session.
- **Refactor**: dead settings removed, 18 public settings exposed via `aide-memory config` (commit fe809b3 + 6be74e6).
- **Fix**: `detect-correction` hook regex now matches colloquial contractions like "don't", "can't" (commit d56e837). Previously these false-negatived.
- **Docs**: manual E2E validation guide (commits a5c5624, 71f8a9b).
- **Plus this commit (d30f617)**: minified-publish build pipeline.

### 3. Release notes

Author based on your full survey of the diff. Don't copy my list blindly — verify each entry, look for anything I missed, and group by section (Breaking / New / Fixes / Internal).

Template:

```markdown
# aide-memory 0.3.0

## Breaking changes
- Removed `aide-memory init --scan` flag…
- (any other breaking changes you find)

## New features
- Pending-memories import on MCP server startup…
- Mid-session drift-repair for derived artifacts…
- (any other new features)

## Fixes
- detect-correction hook regex matches colloquial contractions…
- (any other fixes)

## Internal (no user-facing change)
- Published package is now bundled + minified via esbuild. Source TypeScript, source maps, and per-command files are no longer shipped. Install size is smaller (~242 KB tarball, ~935 KB unpacked).
- Missing runtime deps (chalk, fast-glob) fixed — they are now bundled into the CLI binary.
- Hooks reworked to import from the bundled library entry (`dist/memory/index.js`) rather than individual module files.

## Upgrading from 0.2.x

If you were using `aide-memory init --scan`, replace it with manual memory
seeding. The `aide-memory remember` command or the MCP `aide_remember` tool
creates memories individually.

All other commands and behaviors are unchanged. The `.aide/` database
format and `.claude/settings.json` hooks are fully compatible — no
migration needed.
```

### 4. Publish steps

The automated flow (via `.github/workflows/release.yml`) runs on tag push `v*`. Manual flow:

```bash
# On feature/minified-publish (this branch), or after merge to main:

# 1. Bump version in package.aide-memory.json
# (manually edit, or use a script)

# 2. Run the full build + verify locally first
npm run build                      # tsc
npm run build:dist                 # esbuild bundles
npm test                           # all 654 tests

# 3. Verify the tarball that would ship
cp package.json package.json.backup
cp package.aide-memory.json package.json
./scripts/verify-package.sh        # must PASS
# (cleanup)
mv package.json.backup package.json

# 4. Commit the version bump + release-notes file
git commit -am "chore(release): 0.3.0"

# 5. Tag + push (this triggers the GitHub Actions release workflow)
git tag v0.3.0
git push origin feature/minified-publish --tags

# The workflow will:
# - npm ci
# - npm run build
# - npm run build:dist
# - npm test
# - cp package.aide-memory.json package.json
# - ./scripts/verify-package.sh
# - npm publish --access public
# - Create a GitHub Release with generated notes
```

Alternatively, publish manually from a clean clone with the above sequence plus `npm publish --access public` — the tag push is just for the GitHub Release artifact.

### 5. Post-publish sanity check

```bash
# From a clean machine or empty directory
npm install -g aide-memory@0.3.0
aide-memory --version                                       # 0.3.0
cat $(npm root -g)/aide-memory/dist/cli/aide-memory.js | head -1
# Should be: #!/usr/bin/env node
# Second line should be a single long minified JS line
ls $(npm root -g)/aide-memory/dist/
# Should show only: cli/ memory/
# Should NOT show: anything ending in .ts, .map, store.js, recall.js, etc.
```

---

## Things to flag to the user if you see them

- If `git log feature/phase-1 -- src/templates/rules/` shows changes to rule template content since 0.2.0, mention that in release notes — users' `.claude/rules/aide-memory.md` will refresh via the drift-repair mechanism on next session.
- If there are hook behavior changes (any `.sh` file in `scripts/hooks/`), call those out — they affect existing users' session flow.
- If the MCP tool surface changed (any `src/memory/server.ts` change), call those out — they affect anyone depending on specific MCP tool shapes.

## Things NOT to change (guardrails)

- Do not re-add `chalk`, `fast-glob`, `commander`, `zod`, or `@modelcontextprotocol/sdk` to the `dependencies` field of `package.aide-memory.json`. They are intentionally bundled. Adding them back causes double-install.
- Do not loosen the `files` allowlist. It is the primary defense against source-map-style accidental source leaks (see Claude Code 2026-03-31 incident).
- Do not skip `scripts/verify-package.sh` in CI — that's the safety net.
- Do not run `npm publish` without bumping the version first. aide-memory@0.2.0 is already live.

## If anything goes wrong during publish

- `npm unpublish` works within 72h of publish for corrections. Past that you must publish a new patch version.
- If the tarball accidentally ships source code: immediately `npm unpublish`, fix, republish a patch. Do not leave exposed source in the registry.

---

## Unpublishing / deprecating previous versions — source exposure concern

**User intent:** remove access to old versions (0.1.1, 0.2.0) that ship unbundled TypeScript-derived source code. Both are currently installable and expose logic the user wants closed.

**npm's unpublish policy (72-hour rule):**
- Within 72 hours of publish: anyone can `npm unpublish` immediately.
- After 72 hours: blocked by default. Removal requires contacting npm support with a reason.

Both 0.1.1 (2026-04-08) and 0.2.0 (2026-04-11) are well past the 72-hour window as of 2026-04-21. Automatic unpublish will be refused. Two-step process:

### Step 1 (immediate, automatic): deprecate

Right after publishing 0.3.0, run:

```bash
npm deprecate aide-memory@0.1.1 "Superseded by 0.3.0. This version shipped raw JavaScript source and is no longer supported — please upgrade."
npm deprecate aide-memory@0.2.0 "Superseded by 0.3.0. This version shipped raw JavaScript source and is no longer supported — please upgrade."
```

Effect:
- Anyone running `npm install aide-memory@0.1.1` or `@0.2.0` gets a deprecation warning in their terminal.
- Versions remain downloadable — deprecation is a soft signal, not a block.
- This is the strongest control available without npm support.

### Step 2 (request): unpublish via npm support

File a support ticket at [https://www.npmjs.com/support](https://www.npmjs.com/support) requesting removal of specific versions. Use this framing:

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

**What typically happens:**
- npm support reviews within a few business days.
- For source-exposure concerns with no reverse dependencies, removal is usually granted.
- If granted: the tarballs are removed from the registry. Anyone who has the package locally keeps it (npm unpublish doesn't reach into user machines), but new installs fail for those versions.
- If declined: deprecation remains the only control. Users can still install but see warnings.

### After unpublish succeeds

Update README and landing page to reference 0.3.0+ only:
- Remove any "install 0.1.1" or "v0.2.0 changelog" references
- Note in a FAQ section that older versions have been removed
- Update shields.io badges if they pin to old versions

### Local-copy caveat

Once unpublished, any machine that already has 0.1.1 or 0.2.0 in its `node_modules/` or `~/.npm-global/lib/node_modules/` will keep working — `npm unpublish` removes from the registry only. Source code is still on those machines. This is unavoidable; the only way to get it off is convincing users to upgrade. The deprecation warning nudges them.

---

## Future-release guide (create as permanent internal docs)

The full publish playbook now lives at [`docs/RELEASING.md`](./RELEASING.md) — that's the canonical reference for every future release. This handoff doc is a one-off for the 0.3.0 transition; after that, use `docs/RELEASING.md`.

---

## Open items from the design discussion (optional follow-ups)

These are NOT blockers for 0.3.0 publish. Captured as future work:

- The `feature/binary` branch (Bun compile work) is abandoned. See memory 151. Can be deleted or kept as historical reference.
- The `pre-binary-migration` git tag is on the old HEAD of feature/phase-1 before the --scan removal landed. Harmless to keep.
- If source protection ever needs to be stronger than minified-npm (current approach), the upgrade path is Rust via napi-rs for sensitive modules. See memory 157.
