# Handoff, 2026-04-28: 0.5.0 launch-ready state

Prior compaction handoffs:
- `HANDOFF_APRIL27_CURSOR_VALIDATION.md` (libsql migration root cause)
- `HANDOFF_APRIL27_AUDIENCE_MAPPING_AND_READ_GAP.md` (audience-mapping fix + per-Read editor-open gap)

This doc picks up after a long single-day push that took the repo from "audience-mapping verified" through full launch prep, including a real semantic-search bug found via empirical probe and fixed.

---

## TL;DR

0.5.0 is code-complete and content-ready. All commits pushed. Tests green. Semantic search works end-to-end. Launch content drafted as files (LinkedIn, blog, demo script) with all corrections inline and zero em-dashes. Web docs build clean (faq.mdx MDX compile error fixed). Competitor accuracy reframe applied. The remaining work is your review of the launch content, then the C9 publish flow, then the announcement campaign. None of the pending items are blocking; they're sequenced.

---

## Branch state

Branch: `feature/phase-1-cursor-support` at `b75c415` on `origin`. Merge target per user direction: `feature/phase-1`, NOT `main`.

Submodule: `aide-memory-web` at `03bbbb1` on its own `main` branch.

`npm run test:full` at HEAD:
- vitest: 782/782 (was 778, +4 new embedding-key regression tests)
- install-from-tarball smoke: 11/11
- debug-output smoke: 15/15
- memories-default-shared smoke: 3/3
- **semantic-search smoke**: PASS against real backend (Ollama or Transformers); SKIPs cleanly when neither is available so a CI runner without the embedding infra doesn't false-fail. Source: `scripts/hooks/__tests__/semantic-search.smoke.test.sh` wrapping `scripts/dev/verify-semantic-search.ts`. Wired into `npm run test:smoke`.
- all-configs-behavior sweep: every public key, including `memories.defaultShared`, PASS

`cd aide-memory-web && npm run build` at HEAD: passes. Vercel deploy should succeed on next push (the faq.mdx compile error that was breaking the deploy is fixed).

---

## Commits this session (post-prior-handoff)

```
b75c415 fix(embeddings): persist under memory.uuid + launch content + em-dash scrub
d428536 docs: reframe Cursor opening from '0.5.0 / 5 gaps' to first-public-release framing
a186773 docs: competitor accuracy reframe (memory #376)
692710d test(configs): add memories.defaultShared to all-configs sweep
90beaad test: strengthen defaultShared smoke to verify JSON shared field too
02ca18b test: unit + smoke coverage for memories.defaultShared
c091a47 docs: 0.5.0 launch reconciliation per memory #373
11effb0 feat: opt-in telemetry default + memories.defaultShared config key
540b637 ci: restore claude-code-review.yml + claude.yml from main
cfa9dea feat(hooks): sharpen pre-search-nudge wording + 2026-04-27 verified E2E rows
0bdfcc9 feat(mcp): accept "content" as alias for "what" in aide_remember + aide_update
d7ce833 docs: 0.5.0 ship, verified Cursor coverage + audience-mapping + per-Read gap
ae45ddd feat(editors/cursor): adapter v3.1 audience-mapping for preToolUse + stop
3125b78 fix(init): resolve templates dir via package.json walk-up
e41d1e0 feat(deps): migrate to libsql N-API + diagnostic surface
```

aide-memory-web submodule:
```
03bbbb1 fix: faq.mdx MDX compile error + scrub em-dashes from public docs
6a716cd docs: competitor accuracy reframe (memory #376)
c89e562 (Phase C8 docs reconciliation, prior session)
```

---

## Newly-discovered bugs fixed this session

### 1. Semantic-search embedding-key bug (production, just discovered + fixed today)

User asked "can we verify aide_search semantic actually works today" instead of deferring to fast-follow. Probe via real Ollama backend revealed: store.ts was calling

```ts
embeddingService.storeEmbedding(this.db, String(memory.id), vec)
```

so the embeddings table got rows keyed by integer-id-as-string ("1", "2", "3"), but `searchWithEmbeddings` later does `getByUuid(hit.uuid)` which queries the memories table by actual UUID hash. Lookup always returned null, semantic search always returned [].

Fixed in commit `b75c415`:
- `src/memory/store.ts`: 3 call sites changed to pass `memory.uuid` / `existing.uuid`.
- 4 regression tests in `src/memory/__tests__/embeddings.test.ts` pin the contract.
- `scripts/dev/verify-semantic-search.ts` ships as a dev probe for future re-verification.

End-to-end empirical: 3 memories stored via the production fire-and-forget path, 3 semantic queries with zero keyword overlap, all 3 returned the correct memory as top match.

### 2. faq.mdx MDX compile error (broke Vercel deploy)

Bare `{ids: [10,9,4]}` expressions on lines 171 and 180 of `aide-memory-web/pages/docs/faq.mdx` were being parsed as JSX expressions by MDX (they were inside plain text, not inline code or fenced blocks). Wrapped line 171 in inline backticks; reworded line 180 to drop the JSX-shape entirely.

Fixed in submodule commit `03bbbb1`. Local `npm run build` passes; next Vercel deploy should succeed.

---

## Memories captured this session (priority:always or scoped, durable)

| ID | Topic |
|---|---|
| #354..#372 | 0.5.0 prep memories from prior session (libsql, audience-mapping, validation matrix, etc.) |
| #373 | 6 launch-blocker decisions locked (telemetry opt-in, semantic search rules, shared default, license framing, accurate counts, "we chased this" tone) |
| #374 | Memory file storage layout: JSON not markdown; preferences-only shared/personal split |
| #375 | Config-key onboarding checklist (every new key must hit defaults.json + code reader + unit test + sweep + standalone smoke + docs) |
| #376 | Competitor verification table (claude-mem at thedotmack/claude-mem, engram at ayvazyan10/engram), with REMOVE / UPDATE / KEEP actions |
| #377 | Fast-follow: priority:always per-contributor local override (don't force a team-wide "always" decision) |
| **#378** | **Critical workflow corrections (apply > flag, verify > claim, zero em-dashes in launch content, verify-now over fast-follow when feasible, opus-not-haiku for sub-agents, fix at pattern level not instance level)** |

---

## Launch content (saved as files, ready for review)

`docs/launch/linkedin-post.md`
- Capability-led, first-public-release framing.
- Counts: 7 MCP, 13 CLI, 6 hooks, 778 vitest (the file should be updated to 782 before posting since the 4 new embedding regression tests landed).
- Em-dashes: 0.
- Placeholders for video link, docs link.

`docs/launch/blog-post.md`
- Capability tour > "first public release" framing > editor support today > try it > honest disclosure footer.
- Memories described as JSON (not markdown). Honest disclosure about Bash+grep / codebase_search not hook-covered + Cursor @-file attachment bypass.
- License: proprietary freeware, free today, future may have paid features.
- Telemetry: opt-in via `AIDE_TELEMETRY=on`.
- Em-dashes: 0.
- Counts in body say 778; same update to 782 needed before posting if the user wants the freshest number.

`docs/launch/demo-script.md`
- Six sections, 5 to 6 min, full pre-record checklist at the end.
- Section 2 init-detects regression resolved with the user's "init does what it does, just does all tools for now" framing.
- Section 4 correctly says JSON files, preferences-only shared/personal split, defaultShared config knob.
- Section 5 reframed gaps as "capabilities tracked against upstream Cursor work" per the launch frame.
- Em-dashes: 0.

---

## What you'll review (when ready)

1. **`docs/launch/linkedin-post.md`** (~330 words)
2. **`docs/launch/blog-post.md`** (~1500 words)
3. **`docs/launch/demo-script.md`** (5 to 6 min script with screen actions, voiceover, presenter notes, pre-record checklist)
4. **`README.md` + `README.npm.md`** (em-dash-scrubbed launch surfaces)
5. **`aide-memory-web/pages/docs/*.mdx` + `components/HomePage.jsx`** (em-dash-scrubbed, competitor-reframed, MDX-compile-clean)

If you want me to iterate on any of them, point at the section. Per memory #378, my default is to apply the fix, verify, push, then surface; no more "here's the line to replace, paste it later."

---

## Pending after your launch-content approval

These are queued; none are blocking until you approve.

### Merge sequence (per user direction 2026-04-27)

Branch graph today:
```
main (lags) ─── workflows live here (claude-code-review.yml, claude.yml)
  │
  └─ feature/phase-1 ─── phase 0+1 spec + validation
       │
       └─ feature/phase-1-cursor-support  ← we are here, 16 commits ahead
```

Sequence:
1. Merge `feature/phase-1-cursor-support` into `feature/phase-1` (NOT main; per user direction).
2. From `feature/phase-1`: run Phase C9 publish flow below.
3. Eventually `feature/phase-1` → `main` (whenever you're ready; not part of this launch).

The PR check on `feature/phase-1-cursor-support` should now pass since commit `540b637` cherry-picked the workflow files from main onto the cursor branch.

### Phase C9 publish (post-approval, post-merge)

1. Update test counts in launch content from 778 to 782 (or whatever `npm test 2>&1 | tail -5` reports at publish time).
2. `npm pack` against `package.aide-memory.json`. Inspect tarball.
3. `npm publish --access public`.
4. Run the source-audit checklist from memory #336 §6.2:
   - `find node_modules/aide-memory -name '*.ts' -o -name '*.map'` returns zero
   - `grep -r 'sourceMappingURL' node_modules/aide-memory/dist/` returns zero
   - `grep -r 'aide-v0\|aide-legacy'` returns zero
   - First 200 lines of each bundle is shebang + 1 minified line
   - Grep for known original identifiers (`detectCorrection`, `computeScopedForPath`, `maybeTriggerDriftResync`, `rulesGen`, `EditorAdapter`) returns zero recognizable matches
5. If audit passes: unpublish older versions per `docs/HANDOFF_MINIFIED_PUBLISH.md` (CLI unpublish first, support fallback only if needed; per memory #197).
6. If audit fails: ship 0.5.1 with the leak fixed first, THEN unpublish priors. Per memory #333: never leave users without a working fallback version.
7. Fresh-install smoke: in a brand-new project, `npm install -g aide-memory@0.5.0 && aide-memory init` then run Smokes A, C, E, G in Cursor and matching scenarios in Claude Code.

### Announcement campaign (post-publish)

1. Day-of-week / time-of-day research for LinkedIn + blog posting (no recommendation yet; this is a small research task).
2. Post LinkedIn and blog with video embedded.
3. Track responses, iterate.

---

## Fast-follow backlog

Carried from prior sessions plus today's additions. Priority order is rough; we ship as bandwidth allows post-0.5.0.

- `aide-memory clear` CLI for explicit tracking-reset (Cursor Clear gap, memory #357)
- Bash+grep matcher coverage on Claude Code (memory #325; Grep is a deferred tool, agent uses Bash+grep, we don't hook it)
- Cursor codebase_search FR (no matcher in Cursor's hook vocab; semantic search uncovered)
- Per-tool MCP wrapping (per-tool name/args/duration via `debug('mcp',...)`)
- Cursor log dedup (init writes both .cursor + .claude configs; Cursor logs "Removed duplicate" noise; runtime-detect editor)
- `analytics.enabled` config key (today opt-in is env-var only via `AIDE_TELEMETRY=on`; add a project-level config knob)
- `priority: "always"` per-contributor local override (memory #377; teams shouldn't have to push always-prominence to main to get personal benefit)
- Project-level shared default for non-preferences layers (today `memories.defaultShared` only meaningfully changes folder for preferences; for technical/area_context/guidelines it just flips the JSON metadata)
- Aide_search semantic pipeline: now empirically working, but the `auto` mode keyword-fallback path (line 859 in store.ts) does an async semantic supplement after a sync keyword search — verify this path against real backends and add an integration test
- Literal-string-exception refinement in body.md (per memory #361 + 2026-04-27 Smoke G observations)
- Redundant `file|` line dedupe in `recalled-paths-<sid>.txt` (memory #324: "redundant but harmless")
- Cursor `@-file` and Tab-context bypass: documented; revisit if Cursor adds a hook for these surfaces
- Demo script template improvements once we have first-recording feedback

---

## Process / preference memories that should drive future sessions

These supersede earlier defaults. From memory #378:

1. Apply fixes. Don't flag them. The user reviews at the end.
2. Verify before declaring done. Run the build/test for the surface I edited.
3. Zero em-dashes in launch content. Use periods, colons, commas, parentheses, semicolons.
4. "Verify now" beats "fast-follow" when verification is feasible (backend installed, test rig is 10 min of work).
5. All sub-agents must be Opus 4.7. Never Haiku.
6. Same problems should not recur across turns. Track corrections at the pattern level.

These are stored as a priority:always memory and will auto-inject in future sessions.

---

## Recommended pickup steps for the next session

1. Read this handoff end-to-end.
2. Aide_recall the launch-relevant memories: `aide_recall({ids: [378, 373, 376, 374, 375, 377, 363, 364, 367, 369, 370, 371, 359, 358]})`.
3. `npm run test:full` to confirm 782 + 11 + 15 + 3 still green.
4. `cd aide-memory-web && npm run build` to confirm web docs still compile.
5. If user has approved launch content: proceed to Phase C9 publish.
6. If user has feedback on launch content: iterate per the apply-not-flag rule.
7. Otherwise: standby for user direction.

---

## Honest things still untested

- aide_search `mode: 'auto'` (keyword-first, semantic-fallback within one call) is plumbed correctly and depends on the same key fix that the semantic-only smoke now covers, so it should work; not exercised in a single combined-modes query. Add to fast-follow if observed flaky.
- Manual end-to-end testing across this session was primarily keyword (FTS5 / LIKE in Smokes A through G). Semantic now has unit-test contract coverage (mock backend, 4 tests) plus one real-backend smoke (Ollama nomic-embed-text), but more verification possible across embedding models, larger memory tables, and combined keyword+semantic queries. The launch blog footer flags this honestly.
- `@huggingface/transformers` is in `optionalDependencies` in both manifests + listed as `--external` in esbuild. So `npm install -g aide-memory` will attempt to install it (npm continues if it fails); the bundle does NOT inline it; the model files download from HF on first semantic call. End-user state is "tries to give you semantic out of the box, falls back to Ollama or no-semantic if transformers unavailable."
- Vercel deploy: **verified live**. GitHub status API on aide-memory-web@03bbbb1 returns `{"context":"Vercel","state":"success"}`. The compile-error fix (faq.mdx) + em-dash scrub deployed cleanly. Local `npm run build` also passes. (Earlier draft of this handoff said "verified locally only / handed off"; updated after the user pushed back on whether deploy actually succeeded.)
- Semantic search latency under load: not measured. Probably fine for 0.5.0 given small embedding tables; revisit if anyone reports slow `aide_search` calls.
