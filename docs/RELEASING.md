# Releasing aide-memory

Canonical internal reference for publishing aide-memory to npm. Every new release follows this playbook.

**Audience:** maintainers (human or agent) cutting a release from `feature/phase-1` (or whatever the active release branch is at the time).

---

## Before you start

1. **Confirm you're on the right branch.** Active work lives on `feature/phase-1` (or its successor). Check `git branch --show-current`.
2. **Confirm your tree is clean.** `git status` should show no untracked/unstaged files.
3. **Confirm you have npm auth.** `npm whoami` should print your maintainer username. If it doesn't, `npm login` first.
4. **Confirm you're on Node 18+.** `node --version` → 18.x or higher. The publish uses Node 18 as the `--target` for esbuild, so build on the same line.

---

## Step 1 — Survey changes since the last published version

```bash
# What's the current live version?
curl -s https://registry.npmjs.org/aide-memory | \
  python3 -c 'import json, sys; d = json.loads(sys.stdin.read()); print("latest:", d["dist-tags"]["latest"]); print("all:", list(d["versions"].keys()))'

# What's changed since?
LAST_TAG=$(git tag --list 'v*' --sort=-v:refname | head -1)
git log --oneline "$LAST_TAG..HEAD"

# Or: what's changed since a specific commit?
git log --oneline <commit-from-last-publish>..HEAD
```

Classify each commit: **breaking / new feature / fix / internal / docs**. Use this to:

- Decide the semver bump (see Step 2).
- Author release notes (see Step 5).

---

## Step 2 — Decide the version bump

We're pre-1.0. Rules:

| Change type | Bump |
|---|---|
| Breaking (removed/renamed CLI flag, removed export, changed data format, changed MCP tool shape) | **Minor** (0.x.y → 0.(x+1).0) |
| New feature (added command, added config key, added MCP tool, new behavior users can opt into) | Minor or Patch — minor if user-facing |
| Bug fix (no new behavior, user could not observe) | **Patch** (0.x.y → 0.x.(y+1)) |
| Internal only (minification, test refactor, dep bump, CI, docs) | Patch |

If in doubt, bump minor. Patch releases are cheap but minor bumps let users opt-in to "read the changelog" signals.

Once 1.0 ships, switch to standard SemVer (major for breaking, minor for additive, patch for fixes).

---

## Step 3 — Update the version in the publish manifest

**Bump `package.aide-memory.json`**, NOT the root `package.json`:

```bash
# Example: bumping to 0.3.1
# Edit package.aide-memory.json, find "version": "0.3.0", change to "0.3.1"
```

The root `package.json` ("name": "aide-v0") is the dev-monorepo manifest. It's irrelevant to what ships. `package.aide-memory.json` is the publish manifest (copied over at publish time by the release workflow and by the manual flow below).

---

## Step 4 — Build, test, and verify the tarball locally

```bash
# Clean build
rm -rf dist
npm run build              # tsc — produces full dist/ (needed for tests + library path)
npm run build:dist         # esbuild — overwrites dist/cli/aide-memory.js + dist/memory/index.js with bundled minified versions

# Test
npm test                   # must be 100% green

# Verify the tarball that would ship
cp package.json package.json.backup
cp package.aide-memory.json package.json
./scripts/verify-package.sh   # must print "PASS"
npm pack --dry-run            # optional: review file list

# Cleanup
mv package.json.backup package.json
```

**If `verify-package.sh` fails**: read its output. Common causes:
- `.ts` or `.map` files in the tarball → check `.npmignore` and `files` allowlist in `package.aide-memory.json`.
- Missing bundled entries → `npm run build:dist` didn't run; rerun it.
- Bundle looks unminified → `--minify` flag missing from the esbuild commands; check `package.json` scripts.

**DO NOT** proceed to publish if `verify-package.sh` fails. The whole point is that check.

---

## Step 5 — Write the release notes

Create or update `CHANGELOG.md` at the repo root with a new entry. Format:

```markdown
# aide-memory <version> (YYYY-MM-DD)

## Breaking changes
- <describe what breaks, who it affects, how to migrate>

## New features
- <describe feature + user-facing behavior>

## Fixes
- <bug + symptom + resolution>

## Internal (no user-facing change)
- <refactor / dep bump / CI / etc>

## Upgrading from <previous version>
<short migration notes if non-trivial>
```

Commit the changelog and version bump together:

```bash
git add package.aide-memory.json CHANGELOG.md
git commit -m "chore(release): <version>"
```

---

## Step 6 — Publish

### Option A: automated (preferred) — tag push triggers release workflow

```bash
git tag v<version>
git push origin <branch> --tags
```

The `.github/workflows/release.yml` workflow will:

1. `npm ci` (install deps)
2. `npm run build` (tsc)
3. `npm run build:dist` (esbuild bundles)
4. `npm test` (all tests must pass)
5. `cp package.aide-memory.json package.json` (swap manifest)
6. `./scripts/verify-package.sh` (final check before publish)
7. `npm publish --access public` (using `NPM_TOKEN` secret)
8. Create a GitHub Release with auto-generated notes

If the workflow fails, the publish did not happen. Check the GitHub Actions log, fix, re-tag, re-push.

### Option B: manual (fallback, if CI unavailable)

```bash
# From a clean clone on the tagged commit
rm -rf node_modules dist
npm ci
npm run build && npm run build:dist && npm test

# Swap manifest and verify
cp package.json package.json.backup
cp package.aide-memory.json package.json
./scripts/verify-package.sh   # MUST PASS

# Publish
npm publish --access public

# Restore local state
mv package.json.backup package.json
```

Then manually create a GitHub release attaching the changelog.

---

## Step 7 — Post-publish verification

From a clean machine or empty directory:

```bash
npm install -g aide-memory@<version>
aide-memory --version                                       # <version>

# Check the shipped bundle looks right
head -1 "$(npm root -g)/aide-memory/dist/cli/aide-memory.js"
# Expected: #!/usr/bin/env node
# Line 2 should be a single long minified line

# Check no source leaked
ls "$(npm root -g)/aide-memory/dist/"
# Expected: cli/ memory/
# Unexpected: anything.ts, anything.map, store.js, recall.js (bare)

# Functional smoke test
mkdir /tmp/smoke-$$ && cd /tmp/smoke-$$
echo '{"name":"smoke"}' > package.json
aide-memory init
aide-memory remember "smoke test" --layer technical --scope "src/**"
aide-memory recall src/example.ts   # should return the smoke memory
aide-memory search smoke            # should find it
cd / && rm -rf /tmp/smoke-$$
```

If any of the above fails, you have a published broken release. Options:

- **Within 72h**: `npm unpublish aide-memory@<bad-version>`, fix, republish (same version is allowed to be reused if re-registered within 72h of unpublish).
- **After 72h**: publish a patch release that fixes the issue. The broken version stays live; deprecate it with `npm deprecate aide-memory@<bad-version> "..."`.

---

## Step 8 — Deprecate superseded versions (optional but recommended)

When a new minor or major lands, consider deprecating older versions whose bugs are known or whose APIs are gone:

```bash
# Deprecate a single version
npm deprecate aide-memory@0.2.0 "Superseded by 0.3.0 — please upgrade. See CHANGELOG.md for migration notes."

# Deprecate a range
npm deprecate "aide-memory@<0.3.0" "Superseded — please upgrade to 0.3.0 or later."
```

Deprecation is a soft signal (users see a warning on install but can still install). Use it liberally for versions with known issues, less so for minor version gaps.

---

## Step 9 — Request unpublish for versions with sensitive content (rare)

Only relevant for versions that leaked source, credentials, or broken security assumptions. Policy:

- Versions < 72h old: automatic `npm unpublish` works.
- Versions > 72h old: contact [https://www.npmjs.com/support](https://www.npmjs.com/support) with:
  - Your npm username (maintainer of the package)
  - Specific versions to remove
  - Reason (source exposure, credential leak, etc.)
  - Confirmation no other npm packages depend on those versions (check the "Dependents" tab on npmjs.com)

Expect 2-5 business days for review. For the 0.1.1 and 0.2.0 versions (published 2026-04-08 and 2026-04-11), this step is the path to remove the raw source code they contain — see `docs/HANDOFF_MINIFIED_PUBLISH.md` for the specific ticket template.

---

## Guardrails — never break these

- **Never republish over an existing version.** npm refuses, but even if it didn't: immutable versions are the whole point. Bump.
- **Never ship source maps.** `package.json` `files` allowlist + `.npmignore` both enforce this. `scripts/verify-package.sh` is the CI gate. If the check fails, fix — don't bypass.
- **Never ship raw `.ts` files.** Same mechanism. The verify script blocks this.
- **Never add pure-JS deps to `package.aide-memory.json` `dependencies`.** `commander`, `chalk`, `fast-glob`, `@modelcontextprotocol/sdk`, `zod` are BUNDLED at publish time by esbuild. Adding them to dependencies causes double-install on user machines.
- **Never loosen the `files` allowlist to include directories like `dist/memory/`.** That would re-ship unbundled tsc output and defeat the whole minified-publish design.
- **Never commit a new version bump without running `npm test` locally.** The CI runs it, but catching test failures before the tag push saves a round-trip.

---

## Quick-reference checklist (copy to a PR description or tag release)

- [ ] Survey changes since last published version
- [ ] Decide semver bump (patch/minor)
- [ ] Update `package.aide-memory.json` version
- [ ] Run `npm run build && npm run build:dist && npm test` → all green
- [ ] Run `./scripts/verify-package.sh` after manifest swap → PASS
- [ ] Write/update `CHANGELOG.md` with release notes
- [ ] Commit: `chore(release): <version>`
- [ ] Tag: `git tag v<version>`
- [ ] Push: `git push origin <branch> --tags` (triggers release workflow)
- [ ] Wait for workflow to complete green
- [ ] Post-publish: `npm install -g aide-memory@<version>` on a clean machine + smoke test
- [ ] If superseding: `npm deprecate aide-memory@<old>` with a helpful message
- [ ] Update landing page / README install references if user-visible version changed
