# Changelog

All notable changes to aide-memory are documented in this file.

## 0.3.0 — 2026-04-21

### Breaking changes

- **Removed `aide-memory init --scan` flag.** The pre-train scan feature that generated initial memories from filesystem analysis is gone. Users who relied on `--scan` should seed initial memories manually via `aide-memory remember` (CLI) or the MCP `aide_remember` tool. The tree-sitter–based scan infrastructure has also been removed from the package.

### New features

- **Pending-memories import on MCP server startup.** If the MCP server crashes or is interrupted while writing memories, pending entries are now replayed automatically when the server next starts. Closes a gap where a crashed session could leave memories unimported.
- **Mid-session drift-repair for derived artifacts.** `aide-memory` detects when `.claude/rules/aide-memory.md`, `.mcp.json`, or `.claude/settings.json` hook entries have drifted from the canonical templates mid-session and re-syncs them automatically. Prevents "it worked at init, doesn't work now" class of bugs.
- **Settings surface refactored — 18 public configuration keys.** Dead settings removed, remaining settings documented and exposed via `aide-memory config <key> [value]`. Keys include: `capture.enabled`, `capture.hooks.*`, `contributor`, `embeddings.backend`, `embeddings.model`, `hooks.correction.enabled`, `hooks.edit.maxBlocks`, `hooks.precompact.mode`, `hooks.read.maxBlocks`, `hooks.search.mode`, `hooks.stop.schedule`, `injection.area_context`, `injection.guidelines`, `injection.preferences`, `injection.priorityAlwaysOverride`, `injection.technical`, `memories.hideFromGrep`, `memories.softening.threshold`, `nudge.visible`, `recall.*`, `tags.presets`, `telemetry.enabled`, `updates.check`.
- **Manual E2E validation guide.** Full scenario coverage (A-G + D/F/G/A7/gap-fill) documented for maintainers verifying releases end-to-end.

### Fixes

- **`detect-correction` hook now matches colloquial contractions.** Phrases like "don't", "can't", "won't", "isn't" were previously missed; they're now correctly flagged as potential corrections so the agent is prompted to store them.
- **MCP schema leniency.** Numeric MCP parameters now use `z.coerce.number()` across all tools (was previously only `aide_recall`); optional fields accept explicit `null` in addition to `undefined`; string IDs are coerced for `aide_forget` / `aide_update`. Prevents LLM type-mismatch errors from blocking tool calls.
- **Stop hook suppression when agent already stored in same turn.** The Stop-hook "did you store?" prompt no longer fires if the agent already called `aide_remember` or `aide_update` during the current turn. Reduces noise.

### Internal — source protection (no user-facing change)

- **Published package is now bundled + minified via esbuild.** Ships three bundled entry points:
  - `dist/cli/aide-memory.js` (CLI, 118 KB)
  - `dist/memory/index.js` (library, 703 KB)
  - `dist/memory/cli.js` (MCP server stdio entry, 618 KB)
  All three minified, all three with zero comments / type info / original identifiers. Source TypeScript, source maps, and per-module tsc output are NOT shipped.
- **Fixed chronic missing-deps bug.** `chalk` and `fast-glob` were imported at runtime but missing from 0.1.1 / 0.2.0 `package.json` dependencies. Both now bundled into the minified output (no longer runtime deps). Only `better-sqlite3` (native) and optional `@huggingface/transformers` remain external.
- **Hardened `scripts/verify-package.sh`** — the CI publish gate now fails if any `.ts`, `.map`, `src/` (non-template), or dev-monorepo-leak string (`aide-v0`, `aide-legacy`, `ts-morph`, `tree-sitter-typescript`, `web-tree-sitter`, `graph-based retrieval`, `marked-terminal`) appears in the tarball or in any shipped bundle.
- **Tightened `.npmignore`** with `**/*.map`, `*.d.ts.map`, `*.ts`, `.github/`, `.git/` as belt-and-suspenders alongside the `package.json` `files` allowlist.
- **CLI bundle no longer inlines `package.json`.** The `require('../../package.json')` pattern that was embedding dev-monorepo metadata into the minified output has been replaced with a runtime `fs.readFileSync` — no leak even when building from the dev worktree.

### Distribution

- **Installs via npm as normal.** `npm install -g aide-memory@0.3.0` fetches the bundled package; no binary download, no platform matrix, no postinstall network access.
- **Zero compatibility shim needed for upgrades.** The `.aide/` database schema, `.claude/settings.json` hook entries, and MCP tool surface are unchanged from 0.2.x. Existing memories and hooks continue to work without re-init.

### License

- **LICENSE.md added.** aide-memory now ships under a proprietary free-to-use license — free for personal and commercial use, no redistribution, no reverse-engineering, no derivative works, no competing-product development. Future versions may include paid features; the current version remains free under its current terms.

### Upgrading from 0.1.x or 0.2.0

- Replace any `aide-memory init --scan` invocations with manual memory seeding via `aide-memory remember ...` or the MCP `aide_remember` tool.
- Run `npm update -g aide-memory` to install 0.3.0. No data migration required — the `.aide/` directory format is unchanged.
- Hooks configured in existing `.claude/settings.json` files continue to work unchanged. Optionally run `aide-memory init --force` to refresh rule templates and hook entries to the 0.3.0 canonical form.
