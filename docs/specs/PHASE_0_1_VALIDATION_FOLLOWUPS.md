# Phase 0/1 Validation Follow-ups — Parked Work

**Scope note (post-C7 consolidation, 2026-04-23):** this doc is now the "parked
work" doc — OPEN, non-validation-scenario follow-ups only. FIXED items were
inlined into the relevant scenario in [`../validation/E2E_VALIDATION.md`](../validation/E2E_VALIDATION.md).
Validation scenarios themselves (F0, F, N, A, B, C, D, E, G, H, J, K, O, U1,
U2, U3, M, I, Settings, V, init, IDB-1..13) are tracked in `E2E_VALIDATION.md`.

If you came here looking for:
- **What happened in Session A/B/C/…/U1-U3/H/J/O:** see `E2E_VALIDATION.md` scenario sections.
- **FIXED items (PreCompact cleanup, directory trigger removal, ID-based
  blocking, zod coerce, detect-correction regex, etc.):** inlined as
  strikethrough entries under "Issues found (resolved inline)" in each scenario.

---

## Cursor platform bug tracker

7 threads we depend on for future Cursor upgrades. Full table lives in
[`CURSOR_ONBOARDING.md`](./CURSOR_ONBOARDING.md) §2. Re-check weekly per the
onboarding-guide protocol.

- [#158452](https://forum.cursor.com/t/sessionstart-hook-additional-context-is-never-injected-into-agents-initial-system-context/158452) — `sessionStart.additional_context` dropped. **Staff-confirmed, no workaround, no ETA.** Impact if fixed: drop the rules-file regeneration workaround.
- [#157141](https://forum.cursor.com/t/sessionstart-hook-output-is-accepted-and-merged-but-the-injected-context-does-not-reach-agent-window/157141) — related `sessionStart` race. Staff-confirmed.
- [#158168](https://forum.cursor.com/t/posttooluse-hooks-additional-context-not-injected-into-agent-model-context/158168) — `postToolUse.additional_context` not injected. Staff-confirmed TODAY (2026-04-23).
- [#138691](https://forum.cursor.com/t/include-mcp-server-name-as-part-of-the-payload-for-beforemcpexecution-cursor-hook/138691) — MCP server name in matcher. Feature request.
- [#157231](https://forum.cursor.com/t/add-additional-context-to-beforesubmitprompt-hook-output/157231) — `additional_context` on `beforeSubmitPrompt`. Feature request. Would eliminate Scenario C's one-turn delay on Cursor.
- [#153966](https://forum.cursor.com/t/no-mechanism-to-trigger-hooks-or-inject-messages-into-cursor-when-agent-is-idle/153966) — idle-trigger hook. Enables cross-session propagation to running Cursor sessions.
- [#158873](https://forum.cursor.com/t/sessionstart-hook-should-fire-after-compact/158873) — `sessionStart` after compact. Re-inject context after compaction.

Extra quirks (not bugs, but design-around behavior):
- MCP no hot reload ([#3887](https://github.com/cursor/cursor/issues/3887), [#55723](https://forum.cursor.com/t/refresh-mcp-server-via-command/55723)).
- MCP tool list needs manual toggle ([#122421](https://forum.cursor.com/t/mcp-tool-list-only-updates-after-manually-toggling-server-off-on/122421)).
- Disabled MCP servers re-enable on restart ([#141009](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009)).
- MCP orphan process leak ([#156478](https://forum.cursor.com/t/mcp-process-leak-orphaned-children-on-restart/156478)).
- Only first hook in array executes ([#141996](https://forum.cursor.com/t/cursor-hooks-bug-multiple-hooks-in-array-only-execute-first-hook/141996)).
- `AskUserQuestion` doesn't trigger hooks ([#152230](https://forum.cursor.com/t/askquestion-tool-does-not-trigger-cursor-hooks/152230)).
- `beforeReadFile` vs `preToolUse` matcher=Read ordering unspecified (empirical test pending).

---

## Open, non-validation follow-ups

### Bash-grep fallback coverage for pre-search-nudge (ELEVATED priority)

During Apr 22 validation, Grep appears to be a deferred tool in Claude Code
2.1.118 — not loaded by default. Claude falls back to Bash+grep, which misses
our `Grep|Glob` matcher. Our pre-search-nudge hook never fires for most
Claude-initiated code searches in practice.

Scope options:
1. Extend matcher to `Bash` with command-content filter — parse grep/rg/ripgrep/find
   out of the bash command, extract search term, fire same nudge logic. Fiddly
   (quoted args, flags, pipelines) but doable.
2. File Anthropic FR: make `Grep` default-loaded, OR provide a unified "search"
   event matcher that catches both Grep tool and Bash-grep.
3. In the rules file, instruct agent to prefer explicit Grep+aide_search over
   Bash+grep. Relies on agent compliance.

**Impact:** pre-search-nudge (Scenario B) is effectively dead in current Claude
Code versions without this fix. Users' `aide_search` opportunities go
unsurfaced whenever they ask for code search.

### Config hot-reload verification (investigation)

User reported during Apr 22 validation that setting
`memories.softening.threshold` mid-session did not appear to take effect for
the next hook fire — required restarting Claude Code. Expected behavior:
each hook invocation is a fresh node process reading `.aide/config.json` via
`getSetting()` on every call — no in-process caching.

Investigation plan: reproduce by `aide-memory config set <key> <value>`
mid-session, immediately trigger the hook path, compare vs restart. Related:
drift-repair mechanism (`resyncDerivedArtifacts`) already watches
`.aide/config.json` mtime — same watcher could trigger broader config
re-read if caching is confirmed.

### Grep/Glob hook rendering verification (investigation)

User reported during Apr 22 validation that pre-search-nudge's `systemMessage`
didn't appear inline under Grep tool calls — despite the hook firing correctly
(confirmed via smoke test; output contains systemMessage).

Hypothesis: Claude Code collapses PreToolUse output for Grep/Glob into the
`(ctrl+o to expand)` section, unlike Read/Edit where systemMessage renders
inline. Investigation: reproduce in clean session, ctrl+o expand, verify
systemMessage is inside the expanded view. If yes — no code fix, doc it.

### Hooks on file creation (Write tool)

When a user creates a new file in a package with scoped memories, the agent
has no visibility into the area conventions. Proposed: on Write to new-file
path, look up parent-directory-scoped memories; reuse ID-based tracking.

Scenarios:
- New component in `src/components/` without seeing scoped conventions.
- New API route in `src/api/` without seeing camelCase/requestId/rate-limiting.
- New test file in `tests/auth/` without knowing shared mock setup.

Open questions: does Write currently fire pre-edit-recall.sh for new-file
paths (settings show Write matcher uses pre-edit-recall.sh already, but
behavior may differ)? Should this extend to Bash `touch`, framework scaffolds?

### Mid-session project-wide memory invisibility

Discovered in U3 validation. Project-wide memories (preferences/guidelines
with no scope) stored mid-session are invisible to the rest of that same
session. Two approaches considered:

1. **Inject on storage (recommended):** `aide_remember` for project-wide
   prefs/guidelines appends a "new preference stored" nudge into the tool
   response. Keeps new memory in agent's immediate context. Simple.
2. **Track on storage:** write the new ID directly into the session's
   recalled-ids tracking file. Prevents redundant blocks but doesn't surface.
   Needs pairing with (1).

### Auto-Inject Recall Mode (Option G — separate spec)

Architectural alternative to agent-driven recall: hook queries SQLite directly
and emits memory bodies as additionalContext, bypassing "call aide_recall" and
avoiding the hardcoded "blocking error" label entirely. Opt-in via
`recall.mode: "agent" | "autoInject"` (default preserves current behavior).
Full design: `docs/specs/PHASE_1_FOLLOWUP_AUTO_INJECT_RECALL.md`. Deferred —
changes the agent-driven pattern core to current UX; needs dedicated
validation session before shipping.

### Context Usage Detection — pre-compaction saves

Claude Code's `/context` shows exact token usage (e.g., 848k/1m = 85%). Hooks
don't receive this in input JSON but the data exists. Investigate: can MCP or
hooks access context programmatically? Does transcript_path file size correlate
with token usage? Goal: detect 70-80% full → trigger proactive save prompt.
If unreachable, file Claude Code FR for `token_used` / `context_remaining` in
hook input. Best remaining approach for pre-compaction saves (PreCompact can't
force agent tool calls).

### TTL cleanup for archived pending-memory files

`ingestPendingMemories()` archives source to
`.aide/pending-memories.jsonl.imported-{timestamp}` on success. Over time —
if users hit MCP outages frequently — stale archives accumulate. Fix: extend
`aide-memory cleanup` (or SessionStart TTL sweep) to remove
`pending-memories.jsonl.imported-*` older than configured TTL (default 7d).

### Automatic stale tracking cleanup

Session tracking files accumulate from crashed/abnormally-exited sessions.
Only the current session's files are cleared by PreCompact/SessionStart.
`aide-memory cleanup` exists (7d TTL, manual). Phase 1 follow-up: add auto
TTL sweep on SessionStart startup (not resume/compact — safe because 7+ day
files are definitely from dead sessions). Also wire into post-checkout git
hook. Config: `cleanup.autoTtl = "7d"`.

### Suppress Stop hook prompt when agent already stored in same turn

Observed in C validation: user corrected → agent proactively called
`aide_remember` → Stop still fired "Any decisions worth persisting?" at turn
end. Agent had to reply "nothing else to persist — already saved". Wasted
turn.

Fix options:
1. Per-turn flag: PostToolUse for remember/update/forget writes
   `.aide/cache/remembered-this-turn-{session_id}.txt`. Stop reads + clears.
2. Transcript scan: Stop reads session transcript, checks last turn's
   tool_uses for memory writes. No extra state file.

Existing correction-flag path (`correction-pending-{session_id}.txt`) already
does something similar. Low priority but worth fixing for polish.

### Nudge preview layer counts include grandparent scopes

`pre-read-recall.sh` returns `X memories for {path}. (N guidelines, M technical) — topics: ...`
where layer counts include memories from grandparent scopes + project-wide, but
the integer `X` ("not yet recalled") uses only focused-scope memories per
memory #96. Cosmetic mismatch, confusing. Fix: align layer-count aggregation
with the focused-scope set.

### Settings framework — no user-settable keys

All 18 settings in `scripts/hooks/defaults.json` were `public: false,
pro: false` originally. Promoted some to public; CLI now warns/rejects
non-public keys. Follow-up: identify the remaining settings users reasonably
want to toggle and promote them.

### `memories.hideFromGrep` toggle `.ignore` sync

Original issue: `aide-memory config memories.hideFromGrep false` didn't
update `.ignore` file. RESOLVED via drift-repair +
`resyncDerivedArtifacts()` in Apr 2026.

**Outstanding:** `false` should remove `.aide/memories/` from `.ignore` or
write a `!.aide/memories/` exception if user has a broader ignore pattern.
Currently does the former; exception-pattern handling not implemented.

---

## Follow-ups from 0.4.3 (parked)

### 1. Stop-hook enable/disable boolean

Currently no dedicated Stop on/off — set `hooks.stop.schedule '[{"every":99999999}]'`
for effective off. Other hooks all have clean toggles
(`hooks.read.maxBlocks=0`, `hooks.correction.enabled=false`). For consistency:
extend `hooks.stop.schedule` to accept `false`, or add `hooks.stop.enabled`
boolean. Priority: Low — cosmetic UX polish.

### 2. Smarter per-layer char allocation for SessionStart injection

`injection.maxChars` does a dumb string-slice after concat. When over cap,
later sections (guidelines) get partially chopped mid-content even though
Always-first reorder (0.4.3) protects priority memories. Proposed: per-layer
char budgets (`preferences=25%`, `always=20%`, `guidelines=35%`, etc.). Low
priority — 0.4.3's Always-first ordering covers the critical case.

### 3. Cloud embedding backends

`embeddings.backend` accepts `auto / transformers / ollama / none` in 0.4.3.
Phase 2+ adds `openai`, `cohere`, `voyage`. Requires API key config,
cloud-specific model/dimension handling, network retry, graceful degradation.
Priority: Phase 2 — local-only is intentional for the 0.4.x line.

### 4. PreToolUse "blocking error" label softening (memory #310)

`PreToolUse:Read hook returned blocking error` renders with alarming "error"
framing in Claude Code TUI even when block is intentional. Legacy
`decision:"block"` shape renders this way; modern
`permissionDecision:"deny"` with `hookSpecificOutput` may render differently.
Needs empirical testing. Priority: Medium — real UX friction, cosmetic.

### 5. `nudge.visible` rewiring (hook output visibility UX)

Per memory #307, user wants configurable hook-output visibility.
`nudge.visible` was removed in 0.4.3 as dead; UX need remains.
Memory #316 captures user-directed `hooks.output.visible` design. Part of
larger UX-exploration work, not a one-liner.

### 6. Adaptive `recall.minScopeDepth` default

Current default `1` works across all project shapes. `aide-memory init`
could peek at top-level folder structure — if `src/` exists, default to `2`
(quieter for src-prefixed projects); otherwise stay at `1`. Zero-friction
across shapes. Priority: Low — current default is safe.

### 7. Deep E2E test for backend selection with real deps

`embeddings.test.ts` covers backend selection via `vi.spyOn` mocks
(fast, hermetic). For fuller coverage, nightly CI could install
`@huggingface/transformers` + start local Ollama container, exercise
semantic search with each backend explicitly configured. Priority: Low —
mock coverage is sufficient for regression catches.

### 8. Visuals for remaining config settings

0.4.3 added bar-diagram visuals in `docs/user/configuration.md` for
high-value settings. Remaining with plain text-only docs: `recall.limit`,
`recall.ensureLayerDiversity`, `recall.layerDiversityMinLimit`,
`contributor`, `embeddings.backend`/`.model`, `telemetry.enabled`.
Priority: Low — diminishing return; current docs adequate.

### 9. Clarify memories-vs-docs guidance for agents (0.5.0/0.5.1 candidate — HIGHER priority)

**Problem surfaced 2026-04-23 during Cursor plan work:** agent over-stored 7
memories that duplicated plan-doc content because aide-memory's current agent
guidance doesn't explicitly distinguish WHEN to use memories vs WHEN to put
content into a doc. Memory #335 captures the principle but only injects at
that agent's SessionStart — new agents in other sessions won't see it until
they too over-store and discover the issue.

**Status: EXPLORE.** Options:
- `src/templates/rules/shared/body.md` — add "What goes in memories vs docs":
  - **Memories:** cross-cutting user preferences; conversational decision
    history; session-start auto-inject context; cross-session audit trail.
  - **Docs:** canonical reference (plans, specs, ADRs); content a teammate
    reading the repo should see; anything benefiting from structure + links +
    versioning; implementation detail that needs to survive `/compact`.
  - **Rule:** when info fits both, prefer the doc. Memories = safety net /
    cross-cutting preferences, not a backup copy of doc content.
- Starter memory pack (see item 10) includes ONE starter: "aide-memory
  principle: docs are canonical, memories are cross-cutting preferences +
  audit trail. Don't duplicate doc content." Every new project starts with
  the right model.
- `aide_remember` MCP tool description could surface the principle in its
  schema description.
- **Pointer-style memories (novel):** store memories that POINT TO canonical
  doc rather than duplicating. Example: `what` = *"Cursor hook I/O semantics —
  see docs/specs/CURSOR_ONBOARDING.md §2"* (short, searchable,
  auto-inject-friendly). Benefits: zero drift, dramatically reduced
  SessionStart token cost, principle becomes self-enforcing via data shape,
  `aide_search` still finds the memory and points to the right doc. Possible
  schema extension: `doc_ref` field (optional `{path, section?}`).
  - **Nuance:** pointers work best when target doc is **shared/team-visible**.
    For **private/individual** plans (un-committed scratch), point at a doc
    another teammate can't read → dead link. Guidance: **point when shared;
    store inline when private/un-committed**.
  - **Why memories still matter beyond docs:** carry conversational decision
    history (who said what + WHY), audit trail of options explored, cross-cutting
    preferences that don't belong in any single doc. Doc captures "we picked
    X" outcome; memories capture "we considered X/Y/Z and rejected Y because
    of <reason>" journey.
  - **Future extension — PR-review surfacing:** memories tagged to changed
    paths could feed PR review comments ("context for this area: 4 relevant
    memories — auth uses Bearer tokens because of X decision; session-based
    approach rejected because of Y"). Compounding review aid. Deferred past
    0.5.0.

**Why higher priority:** affects EVERY agent using aide-memory right now.
Over-storage pattern is likely to repeat. 20-line addition to `shared/body.md` +
starter memory fixes for all users immediately.

**Scope for 0.5.0:** can land in Phase C1 alongside the shared-rules refactor
(same file). Or file as 0.5.1 fast-follow if C1 bandwidth tight.

**Cross-refs:**
- Memory #335 — the principle.
- Memory #334 — example of over-storage anti-pattern.
- `docs/specs/CURSOR_ONBOARDING.md` §3.5 — shared-rules refactor enabling
  this one-file change.

### 10. Starter memory packs via `aide-memory init` (1.0+ candidate)

Explore shipping curated "starter memory packs" imported into a fresh
`.aide/` on init.

**Shapes:**
- **Opt-in:** `aide-memory init --pack <name>` (`--pack react-typescript`,
  `--pack python-fastapi`, `--pack monorepo-pnpm`) seeds layer-appropriate
  memories with stack guidelines, pitfalls, conventions.
- **Default starter:** small "aide-memory principles" pack seeds on ANY init —
  teaches what layers mean, when to recall, how to format scopes. Addresses
  cold-start ("new project has zero memories so agent can't do anything
  useful yet").
- **Community packs:** user-contributed, registry-hosted (shadcn/ui blocks,
  Tailwind plugins analog). Pay-gated packs = revenue stream.

**Cross-refs:**
- `docs/PRODUCT_VISION.md` — principle-packs framing (don't duplicate;
  this follow-up is the DELIVERY mechanism).
- Memory-file format (`.aide/memories/<layer>/<uuid>.json`) — packs ship as
  bundled JSONs with deterministic UUIDs for idempotent re-init.
- Viral auto-rules generation (memories #225, #276, #292) — a pack IS a
  pre-generated rules set.

**Priority:** 1.0+ candidate. 0.5.0 ships Cursor; packs are a separate
value-prop expansion. Could be the viral moment for 1.0 ("one command and
your agent knows your stack") independent of Cursor work.

---

*Validation run results for every scenario live in
[`../validation/E2E_VALIDATION.md`](../validation/E2E_VALIDATION.md). This
doc is deliberately scoped to non-scenario parked work.*
