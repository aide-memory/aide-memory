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

## 0.5.0 Cursor validation — fast-follow tracker

Items discovered during the 2026-04-26 manual Cursor validation walk
(`/tmp/aide-cursor-val` fixture). Each entry has a triage call:
**BLOCK 0.5.0** = must fix before publishing; **0.5.1 fast-follow** =
ship in patch within days; **defer** = file but not urgent. NPM
patch-version delivery: users on `^0.5.0` get 0.5.x updates on next
`npm install`; for global installs (most aide-memory users today),
they need `npm update -g aide-memory` so 0.5.1 reach is friction-y —
prefer landing real BLOCKERS in 0.5.0.

### Cursor MCP first-run UX gate (Scenario N validation, 2026-04-26)

**Discovery:** After `aide-memory init` + Cursor restart, the
`aide-memory` MCP server appears in Cursor's MCP settings list but is
**toggled OFF by default**. User must manually flip it ON before any
of the 7 MCP tools (`aide_recall`, `aide_remember`, etc.) are
callable. Hooks still fire from `.cursor/hooks.json`, but they
prompt the agent to call `aide_recall` — which fails until MCP is
enabled.

**Triage: 0.5.1 fast-follow (or defer).** This is Cursor's
security/UX choice — every newly-discovered MCP server stays opt-in
until explicit user consent. We can't pre-enable from
`.cursor/mcp.json`; there's no documented field, and even if there
were, it would be a security gap (users would lose the consent gate).

**Mitigations attempted in 0.5.0:**
- Init output prints a "restart Cursor" warning (active).
- `docs/user/editors/cursor.md` now has a prominent "First-time MCP
  enablement" section calling out BOTH gates (restart + toggle).

**Mitigations to investigate post-validation:**
1. **Test if any undocumented Cursor field auto-enables an MCP server**
   on first registration (e.g. `enabled: true`, `autoEnable: true`,
   `requiresApproval: false`). Spike: ~15 min to scan Cursor's MCP
   settings schema + try fields. If ONE works → patch in 0.5.1.
2. **File a Cursor feature request** for an opt-in field that
   pre-authorizes specific MCP servers (would be useful for
   aide-memory-like tools where user consents at install time, not
   per-Cursor-launch).
3. **Add to init output** a more specific instruction: "After Cursor
   restarts, open Settings → MCP and toggle 'aide-memory' ON." (Today
   the warning just says "restart" which is the FIRST gate; the
   toggle is the SECOND gate not mentioned.)

### `aide_import` — clarify intent + relationship to memories-vs-docs principle (Cursor validation, 2026-04-26)

**Discovery + correction:** Initial framing of `aide_import` as a
"hard anti-pattern that violates memory #335" was too strong (user
pushback 2026-04-26). Looking at the actual implementation
(`src/memory/server.ts:315-351`):

- Takes a raw markdown CONTENT string (not a file path)
- Parses into bullet/paragraph items via `parseMarkdownItems`
- Creates one memory per item, all with `source: 'import'`, shared
  layer + scope + context_label

**Legitimate use cases that are NOT anti-patterns:**
1. **One-time seed from a legacy doc you're DELETING.** The doc
   goes away, the memory becomes the new home. Not a duplicate.
2. **External material that doesn't live in repo docs.** E.g. paste
   a Notion page section, an ADR template, a snippet of ChatGPT
   output. The memory is the FIRST class storage, no original doc
   to drift from.
3. **Import → curate workflow.** Bring in raw bullets, then prune
   the import-source memories down to the cross-cutting essentials,
   `aide_forget`-ing the rest. Faster than typing each via
   `aide_remember`.

**Where it COULD become an anti-pattern:**
- Repeated re-import of a maintained doc that still lives in repo →
  every re-import creates duplicate memories with new IDs
  (`source: 'import'` doesn't dedupe). This IS the "doc-content
  duplicated into memories" problem #335 warns about.

**Triage: defer / 0.5.1+ doc clarification.** Not a 0.5.0 BLOCKER.
Tool works correctly; mental model just needs sharpening.

**Options:**
1. **Keep behavior, sharpen the docstring + per-editor docs.** Spell
   out "appropriate uses" + "watch out for repeated imports of
   live docs." Lowest effort.
2. **Add idempotency to import** — dedupe on (what, layer, scope)
   so repeated imports of the same doc don't create duplicates.
   Mid effort.
3. **Rework as "pointer-style import"** — create short pointer
   memories (`"see docs/api-conventions.md §Auth"`) instead of
   copying content. Most aligned with #335 + zero-drift, but
   biggest work + might miss the "delete the source doc"
   workflow.

**Recommendation:** option 1 for 0.5.1 (10-line docstring change +
per-editor doc update). Reconsider option 2/3 if real-world usage
shows repeated re-import as the dominant pattern.

### "Rules-file alone" vs "MCP tool retrieval" — Scenario N test ambiguity

**Discovery:** Scenario N ("what do you know about this project?") in
the Cursor validation walk passed, but the agent reached for
`aide_memories` (the LIST tool) BEFORE relying on the
`alwaysApply: true` rules file's baked-in content. Result: we proved
MCP works AND memories are accessible AND rules file regenerates
correctly — but we couldn't isolate "agent answers from rules-file
injection alone, no tool calls."

**Triage: 0.5.0 doc-only update; 0.5.1 add tighter test.**

**Mitigation:** add a TIGHTER variant of Scenario N to
`docs/validation/E2E_VALIDATION.md`:

> **Scenario N-tight:** Type `write a getUser function in src/api/`.
> Agent should APPLY the project guidelines (camelCase, async/await,
> < 30 lines, no TODOs) WITHOUT calling any aide-memory tool — purely
> from the rules-file content injected via `alwaysApply: true`.
> Failing this test means the rules-file regen workaround for
> sessionStart.additional_context is leaking — the agent has the
> content but isn't using it as session-start context.

This is the test that actually validates the C4 rules-file
regeneration workaround end-to-end.

### npm update enforcement — can it be retroactive? (validation Q, 2026-04-26)

**Question:** Can we force users currently on 0.4.x to update to 0.5.0
before they hit issues?

**Answer:** No, not retroactively. npm has no mechanism to push
updates to installed copies. What we have today + can add later:

**Already wired (existing behavior):**
- `updater.ts` — CLI/MCP startup checks the registry, prints
  "aide-memory v0.X.Y available (current: v0.A.B). Run
  `npm update -g aide-memory` to update." Soft nag every run.
- Confirmed working — visible in scratch fixture init output today.

**`npm deprecate aide-memory@0.4.X` — retroactive nag.** One-shot
command we run from our publishing account. Adds a deprecation
message to the registry; shown by `npm install` of that version +
`npm outdated`. Doesn't break existing installs. Safe push.

**Options for FUTURE-cohort enforcement (future-version users only —
nothing helps users currently on 0.4.x except the soft nag above):**
1. **Hard floor** — refuse to run if version is older than X
   (e.g. 30 days). Aggressive; can break workflows. Add via flag,
   not default.
2. **Auto-update offer** — detect new version, prompt user to
   `npm install -g aide-memory@latest`. Risky around perms/sudo.
3. **Required-version registry** — package.json carries a
   `_aideMemoryMinVersion` field; new releases bump it; old releases
   refuse to run when peer-version is below the floor.

**Triage: nothing for 0.5.0; consider option 3 for 0.6+.** Adding
update-enforcement code in 0.5.0 only helps cohort 0.5.0+. The
0.4.x users we want to push forward will only see the existing
updater nag + (optionally) the new `npm deprecate` message.

**Recommended action for 0.5.0 release:**
- Run `npm deprecate aide-memory@"<0.5.0" 'urgent: upgrade to 0.5.x for Cursor support + bug fixes'` after publish.
- Defer hard-floor / auto-update mechanism to 0.6+.

### `aide_import` parsing detail in mcp-tools.md (doc clarity, 2026-04-26)

**Discovery:** User asked "how is each item parsed, do we talk about it
in external docs at all?" `docs/user/mcp-tools.md:242` covers the
headline ("each bullet point, numbered item, or paragraph >20 chars
becomes a separate memory") but doesn't mention the SKIP list:
headings (lines starting `#`), code fences (` ``` `), tables (lines
starting `|`), and minimum thresholds (>5 chars after bullet marker,
>20 chars for non-bullet paragraphs).

**Triage: 0.5.1 doc-only.** Easy 5-line addition to mcp-tools.md.
Useful to set expectations — users importing a doc with mixed content
(headings + code + bullets) need to know structural markdown gets
dropped + only "content lines" become memories.

### Dev manifest version drift — updater always nags during dev (Cursor validation, 2026-04-26)

**Discovery:** Running `aide-memory init` (or any CLI command) from the
dev tree always prints:
```
aide-memory v0.4.3 available (current: v0.2.0).
Run `npm update -g aide-memory` to update.
```

Root cause: TWO package.json files in the repo:
- `package.json` (dev) → version `0.2.0` (frozen placeholder)
- `package.aide-memory.json` (publish) → version `0.4.3` (real shipped)

Runtime reads `package.json` (dev) for the "current" version. Updater
fetches npm registry's latest (0.4.3) and compares 0.2.0 < 0.4.3 → nag.

**This isn't going away when we publish 0.5.0** — the dev manifest will
still say 0.2.0. Persistent nag until fixed.

**Triage: 0.5.1 fast-follow.** Two fix options:

1. **Bump dev `package.json` to a pre-release suffix** like `0.5.0-dev`.
   Updater's semver comparison treats pre-release as newer than base,
   so 0.5.0-dev > 0.4.3 → no nag. Manual maintenance: bump the suffix
   on each minor cut (`0.5.0-dev` → `0.6.0-dev` after 0.5.x ships).
2. **Detect dev mode** in `updater.ts` — skip the registry check when
   running from a path containing `dist/cli/` AND a sibling `src/cli/`
   (clear dev-tree signal). End users install from npm, get the
   compiled-only bundle without `src/`. Single-line check.

**Recommendation: option 2** (dev-mode detection). Zero maintenance
overhead per release. ~5 lines in `updater.ts`. Ship in 0.5.1.

Side effect: stops the version nag from showing up in scratch fixtures
that init from the dev binary (cleaner validation logs).

### Cursor file auto-attach bypasses preToolUse:Read for user-mentioned paths (Cursor validation, 2026-04-26)

**Discovery:** When a Cursor user types a prompt containing a file path
(e.g. *"read src/api/routes.ts"* or *"the auth middleware file"*),
Cursor auto-attaches the file content to the agent's context. The
agent does NOT call the `Read` tool — it just references the
auto-attached content. **Our `preToolUse:Read` hook never fires for
these cases.**

Confirmed via two attempts (2026-04-26):
1. Plain prompt *"read src/api/routes.ts"* → no preToolUse:Read fired,
   agent saw content via auto-attach.
2. Explicit override *"use the Read tool directly on src/api/routes.ts"*
   → still no preToolUse:Read fired. Agent acknowledged the override
   but answered from auto-attached content anyway.

**Triage: not a bug, document as Cursor design.** This is platform
behavior — when user names a file, they've consented to the read; the
hard-block exists for unintended/discovery-based reads. The hard-block
DOES fire for autonomous Read calls (agent discovering files itself
without user mention).

**Documentation actions:**
- Update `docs/user/editors/cursor.md` to make this explicit:
  *"aide-memory's hard-block protection on file reads only applies to
  AUTONOMOUS agent reads (when the agent discovers + reads a file the
  user didn't mention). When you mention a file path in your prompt,
  Cursor auto-attaches the content — agent gets it without calling the
  Read tool, so no hard-block fires. The recall-via-rules-file
  guidance still nudges the agent to call aide_recall before
  responding, so memories still surface."*
- Possibly add a "What you'll see" subsection to clarify the two
  flows: user-mentioned-path (auto-attach + rules-guided recall) vs
  autonomous-discovery (preToolUse:Read hard-block).

**No code change needed.** This is Cursor UX; aide-memory's behavior
is correct for what it can see.

### Token-cost recording for validation runs (recordkeeping)

For future cost-calibration / pricing work, record token counts in
the E2E_VALIDATION runs table when feasible. **Scenario N first run
(2026-04-26): 132,653 tokens** (Cursor agent, including MCP
overhead, file reads, and rules-file injection on every turn). Can
help us understand aide-memory's per-turn token cost vs
non-aide-memory baseline at marketing/pricing decision time.

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

---

## Post-0.5.10 follow-ups (2026-04-29)

- **Fix PUBLIC_REPO_SECRET token scope.** CI release workflow creates releases on aide-memory/aide-memory but the token gets 403. Needs `repo` scope on the aide-memory org, not just ahmedmmeky repos. Until fixed, public repo releases + changelog sync are done manually after each publish.
- **Buttondown newsletter.** Embed-subscribe attempt with slug `aide-memory` returned "We're unable to process your subscription at this time" (2026-04-30, commit 81e77db wired then aeb9101 reverted). Before re-enabling, verify the actual newsletter slug from Buttondown dashboard (Settings → Subscribe form → embed code), test the URL with curl, and confirm the account is fully published vs draft. Memory #440 has the full failure mode.
- **`boolean@3.2.0` deprecated warning.** Upstream from `@huggingface/transformers` → `onnxruntime-node` → `global-agent` → `boolean`. Cosmetic, can't fix on our end. Goes away when upstream updates.
- **Session handoff features.** Carrying context from one session to the next without manual capture. Mentioned in comparison page as roadmap item. User wants to explore (memory #391).
- **Rules-file USER OVERRIDES section (parked 2026-04-30, fast-follow).** 0.5.16 fixed memory-write clobber, but `aide-memory init --force` / `init --update-rules` / `autoUpdateIfNeeded` on version upgrade still rewrite both rules files entirely and lose user edits. Proposed: add a USER OVERRIDES marker pair (`<!-- ─── USER OVERRIDES — preserved... ─── -->` / `<!-- ─── END USER OVERRIDES ─── -->`) to the static template; `writeRulesFiles` extracts content between markers and splices it back when force-rewriting. Composes cleanly with the existing AUTOGEN_MARKER for Cursor. Code touch points: `src/templates/rules/shared/body.md`, `src/memory/init.ts:writeRulesFiles`, new test coverage. Memory #441 has the full proposed implementation. Parked because version upgrades are rare + git catches edits for tracked projects; revisit if it becomes a real pain point.

## Post-0.5.16 follow-ups (2026-05-01)

- **0.5.17 hook defaults shift — soft + visible.** Spec landed at [`PHASE_1_HOOK_DEFAULTS_0_5_17.md`](./PHASE_1_HOOK_DEFAULTS_0_5_17.md). Changes: (1) UserPromptSubmit correction emits soft additionalContext + chrome only — no `correction-pending` flag by default; opt-in via `hooks.correction.escalate = "soft" | "block"`. (2) Stop scheduled checkpoint emits soft additionalContext + chrome by default — no `decision:"block"`; opt-in to previous behavior via `hooks.stop.mode = "block"`. (3) SessionStart on `source: "resume"` skips both injection and tracking-clear (prior transcript already has them). (4) Soft-path chrome wording differentiated from hard-block path. (5) Correction regex tightened (skip quoted/code-block content + meta-references). (6) `body.md` capture guidance refreshed (no quoted examples; layer-table only). New defaults apply to new installs AND existing users on upgrade via `defaults.json` fallback — no migration required. Existing Stop-loop bug (below) is sidestepped because the default no longer writes the flag.
- **Stop-loop diagnosis (deferred — sidestepped by 0.5.17 default).** User reported a loop where ONE prompt → Stop blocks "correction was not stored" → agent responds → Stop blocks again → loop. Could not reproduce from static reading; cap-at-1 in `clearCorrectionPending` is in place. To diagnose: set `AIDE_DEBUG=hooks` in the shell that **launches** Claude Code (not in a child bash that exits) and capture stderr across the loop. Deferred because 0.5.17's default doesn't write the flag, so the loop pattern can't reproduce in default config; only a user who opts into `hooks.correction.escalate = "block"` could hit it, and a repro recipe is the prerequisite for any further fix.

---

*Validation run results for every scenario live in
[`../validation/E2E_VALIDATION.md`](../validation/E2E_VALIDATION.md). This
doc is deliberately scoped to non-scenario parked work.*
