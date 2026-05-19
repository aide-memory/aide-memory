# 0.5.17 — Hook Defaults + Capture Philosophy

**Status:** spec, pre-implementation
**Date:** 2026-05-01
**Branch:** `feature/phase-1`
**Anchored memory:** #443

---

## TL;DR

Shift hook defaults from "forceful, blocking, clobbery" to **"soft + visible by default"** to reduce noise during everyday use. Add config knobs so power users can opt back into stricter behavior. Update layer guidance in `body.md` to be concrete and not overfit. Skip SessionStart injection on `resume`. Don't ship until smoke + unit + validation suite passes AND a side-by-side comparison shows the new defaults capture meaningfully without the prior noise.

---

## 1. Background — why this work

### 1.1 User feedback during launch week (2026-04-29 → 2026-05-01)

- During the launch-content iteration, the user noticed many memories getting stored that were **iteration-specific** (corrections about a specific draft, voice fixes, etc.) — they wouldn't apply to future sessions but the correction hook wrote them anyway.
- The "correction-pending" mechanism caused the user to see Stop blocks repeatedly with "correction was not stored" — visually annoying, eroded trust in the tool.
- The current correction hook prompt (`BEFORE doing anything else, store via aide_remember…`) is forceful — coerces the agent rather than letting it judge.
- The current Stop hook uses `decision:"block"` which forces an extra agent turn to respond "nothing to persist" even when there's nothing meaningful — wastes time and feels intrusive.
- During SessionStart, on `source: "resume"`, aide-memory clears tracking AND re-injects the SessionStart content. Both are wrong: the agent's prior transcript already has both, so this duplicates content and forces re-blocking on every file path.

### 1.2 Stop-loop bug (open, deferred)

User reported: ONE user prompt → agent responds → Stop blocks "correction was not stored" → agent responds again → Stop blocks again with same correction message → loop.

Code reading (`src/memory/hooks/handlers.ts:551`) shows the cap-at-1 (clearCorrectionPending unconditionally on first read) is implemented correctly. Could not reproduce the loop from static reading.

**Hypotheses (none confirmed):**
- Stop's re-prompt fires UserPromptSubmit on the synthetic re-prompt (would require Claude Code firing UserPromptSubmit on hook-initiated re-prompts — design says no, unverified)
- session_id changing mid-loop (compaction, reconnect, etc.)
- Claude Code rendering the same Stop message multiple times in the UI even though the hook fires once

**Required to diagnose:** reproduce with `AIDE_DEBUG=hooks` set in the environment that **launches Claude Code** (not in a child bash that exits immediately). Capture stderr across the loop to see what's writing the flag and which session_ids are receiving it.

**0.5.17 sidesteps this entirely:** new default doesn't write the `correction-pending` flag at all, so the loop pattern can't reproduce in default config even if the bug exists.

### 1.3 Capture philosophy

The user's articulated principle:

> Capture what's *different from default model behavior* + what's specific to this user or this code area. Even small corrections should leave some signal so familiar context is preserved next time. But don't capture iteration-specific noise that won't generalize.

Translates to concrete signals tied to the four memory layers (see §3 below).

---

## 2. 0.5.17 hook defaults

> **Platform constraint discovered during validation (2026-05-06).**
> An earlier draft of this spec proposed `hooks.stop.mode = "soft"` and
> `hooks.correction.escalate = "soft"` as paths that emit
> `hookSpecificOutput.hookEventName: "Stop"` + `additionalContext`. Claude
> Code's hook protocol (verified empirically + against
> https://code.claude.com/docs/en/hooks on 2026-05-06) does NOT permit
> `hookSpecificOutput` on `Stop` events. Text reaches the agent via Stop only
> through `decision: "block" + reason` or `continue: false + stopReason`.
> Both `soft` enum values are dropped. The constraint + protocol facts now
> live in code at `src/memory/hooks/claude-code-protocol.ts` with a
> `LAST_VERIFIED` date marker, validated by every hook's emit in the
> conformance test suite (§6.2).

### 2.1 Behavior matrix

| Hook | Default behavior in 0.5.17 | Config knob |
|---|---|---|
| `UserPromptSubmit` (correction detected) | **Soft + visible.** Emit unified `hookSpecificOutput.UserPromptSubmit.additionalContext` + chrome `systemMessage`. **Do NOT write `correction-pending` flag.** | `hooks.correction.enabled = false` → disable detection entirely. `hooks.correction.escalate = "off"` (default) / `"block"` — opt-in to `block` to write the flag and have Stop remind on the next fire if not stored. |
| `Stop` (scheduled checkpoint) | **`decision: "block"` + softened `reason` + chrome `systemMessage`.** Default `mode = "block"` because Claude Code's Stop protocol has no soft additionalContext channel. The TUI collapses the alarming "Stop hook error:" label behind ctrl+o when `systemMessage` is present (mem #310), so the brand chrome is the primary visible line. | `hooks.stop.mode = "block"` (default) / `"off"`. Frequency still controlled by `hooks.stop.schedule`. |
| `PreToolUse:Read` / `:Write` | Unchanged — hard-block on first un-recalled scoped paths. | `hooks.read.maxBlocks` / `hooks.edit.maxBlocks` (existing). |

**Net effect for a default user:**
- Corrections get one soft hint at the moment of detection (in-turn additionalContext on UserPromptSubmit, which the platform DOES support). No follow-up reminder, no enforcement.
- Stop checkpoints fire on the existing schedule (every 3 → 5 → 10 turns) with `decision: "block"` + the new softened `DEFAULT_PROMPT` ("Anything from this turn worth persisting…? Otherwise stop.") + chrome.
- Users who want zero Stop noise: `aide-memory config hooks.stop.mode off`.
- Recall on first file read still hard-blocks (separate concern, kept).

### 2.2 SessionStart `source` handling

```ts
const source = input.source;

// Track-clearing: only when prior context wouldn't apply
if (source === 'clear' || source === 'compact') {
  clearSessionTracking(projectRoot, sessionId);
}

// Injection: skip on resume — agent's preserved transcript already has it
if (source === 'resume') {
  // No tracking clear, no injection emit.
  return;
}

// startup / clear / compact: inject as normal
```

Reasoning per source:
- `startup` — fresh; inject
- `clear` — context wiped; clear tracking + inject
- `compact` — summarized; clear tracking + inject (original additionalContext may not have survived the summary)
- `resume` — Claude Code restores prior transcript including original SessionStart additionalContext AND prior recalled-paths state; **don't touch either**

### 2.3 Soft-path chrome differentiation

Currently both deny + soft paths print: `aide-memory · prompting aide_recall for scoped memories`. Visually identical when consecutive — user sees "duplicate."

Rename:
- Hard block: `aide-memory · prompting aide_recall — scoped memories not recalled yet (expected flow)`
- Soft nudge: `aide-memory · prompting aide_recall — additional scoped memories not yet recalled`

### 2.4 Regex tightening (correction detection)

Current regex (`src/memory/hooks/handlers.ts:412`) over-matches when content is **discussing or quoting** corrections rather than enacting them. Add exclusions for:

- Lines starting with quote characters (`"`, `'`, `` ` ``)
- Lines inside fenced code blocks (` ``` `…` ``` `)
- Lines containing meta-references like "the correction prompt", "matched correction", "correction regex"

Less critical now that default doesn't write the flag at all, but still useful when `hooks.correction.escalate` is on.

---

## 3. `body.md` capture guidance

Replaces the current `### When to call aide_remember` / `### When NOT to call aide_remember` sections in `src/templates/rules/shared/body.md`.

```markdown
### When to call aide_remember

If something from the conversation will help in a future session in this project, capture it on the matching layer:

| Layer | What goes here |
|---|---|
| **preferences** | How the user works — explicit choices and patterns visible in how they structure or approach code |
| **technical** | Non-obvious facts about the stack, workarounds, the reasoning behind a technical choice |
| **area_context** | Decisions or patterns specific to a particular code area, including the reasoning behind them |
| **guidelines** | Team or project-wide rules |

### When NOT to call aide_remember

- Information already readable directly from the file
- Secrets, credentials, or user-identifying data
```

Notes on what was DROPPED from prior drafts:
- Quoted examples (`"I prefer X"`, `"we always Y"`) — overfit to explicit statements only
- "Would help in 6 months" — too specific
- "Would the model produce by default" — model self-assessment unreliable
- "Implementation details any reasonable approach would have produced" — too vague
- "If you're stating a rule" — overfits
- "Nothing fits a layer" — vague catch-all; agent skips by default if nothing matches

### 3.1 Hook-prompt drafts

**UserPromptSubmit (correction):**
> Your prompt may contain a correction or convention worth persisting. If something here applies to future work in this project — across preferences (how you work), technical (stack facts, why-decisions), area_context (decisions for this code area), or guidelines (team rules) — call aide_remember on the matching layer. Otherwise respond as normal.

**Stop (scheduled):**
> Anything from this turn worth persisting for future sessions in this project? Could touch preferences, technical, area_context, or guidelines. If yes, call aide_remember on the matching layer. Otherwise stop.

---

## 4. Config schema additions

In `scripts/hooks/defaults.json`:

```json
{
  "hooks.correction.escalate": {
    "value": "off",
    "public": true,
    "description": "When 'block', write a correction-pending flag and have the next Stop fire emit decision:block with the reminder. Default 'off' — no reminder fires; correction surfaces only as the in-turn UserPromptSubmit soft hint."
  },
  "hooks.stop.mode": {
    "value": "block",
    "public": true,
    "description": "How the scheduled Stop checkpoint surfaces. 'block' (default) uses decision:block + softened reason + chrome. 'off' skips entirely."
  }
}
```

Enums dropped from earlier drafts:
- `hooks.correction.escalate = "soft"` — would have routed through Stop's `additionalContext` channel, which the platform doesn't support. Dropped.
- `hooks.stop.mode = "soft"` — same reason. Dropped.

Both keys must be:
- Read by their respective hook handlers
- Tested via `scripts/hooks/__tests__/all-configs-behavior.test.sh`
- Validated by `src/memory/__tests__/hook-protocol-conformance.test.ts` (no hookSpecificOutput on Stop emits — see §6.2)
- Documented in `docs/user/configuration.md`

---

## 4.1 Config precedence (organic expectations)

Hooks read multiple config keys. Precedence rules — most-specific wins, master switches gate finer ones:

### Correction system

| Config combo | Behavior |
|---|---|
| `hooks.correction.enabled = false` | Detection completely off. `correction.escalate` is moot. No chrome, no additionalContext, no flag, no Stop reminder. Stale flags from before are ignored. |
| `enabled = true` + `escalate = "off"` (default) | Soft hint at moment of correction (UserPromptSubmit additionalContext + chrome). No flag written. Stop reminder never fires. |
| `enabled = true` + `escalate = "block"` | Soft hint + flag written. On next Stop fire, the reminder forces `decision:"block"` regardless of `hooks.stop.mode`. |

**Master switch:** `hooks.correction.enabled` gates everything correction-related. When `false`, all other correction keys are inert.

### Stop checkpoint system

| Config combo | Behavior |
|---|---|
| `hooks.stop.schedule = []` | Schedule has no phases — Stop never fires on a schedule. `mode` is moot for scheduled fires (correction-pending fires can still happen if `escalate = "block"`). |
| `schedule` populated + `mode = "off"` | Schedule chooses fire turns, but emit is silent. No chrome, no block. (Functionally equivalent to `schedule = []` for the scheduled path; correction-pending path still runs per `escalate`.) |
| `schedule` populated + `mode = "block"` (default) | Scheduled fires emit `decision:"block"` + softened reason + chrome systemMessage. |

**Master switch:** `hooks.stop.schedule` controls *when* Stop considers firing. `mode` controls *how* it emits when it does fire.

### Cross-system: correction-pending vs scheduled Stop on the same fire

If a Stop fire reads a correction-pending flag AND is also a scheduled-checkpoint turn:
- The **correction-pending branch wins** (more specific signal).
- The emit is `decision:"block"` with the correction-reminder reason (the only escalation shape — `soft` was dropped because the platform forbids `hookSpecificOutput` on Stop).
- The scheduled-checkpoint emit is skipped that turn (don't double-emit).

Reasoning: a correction-pending reminder is the user's targeted "you missed something" signal. The scheduled checkpoint is a generic pulse. Specific over general.

### Existing-user upgrade behavior

When a user upgrades 0.5.16 → 0.5.17:
- Their `.aide/config.json` doesn't contain the new keys (`hooks.stop.mode`, `hooks.correction.escalate`).
- `getSetting()` falls back to `scripts/hooks/defaults.json` for missing keys → gets the new defaults (`"soft"`, `"off"`).
- **New defaults apply automatically — both new installs AND existing users get the softer behavior on upgrade.**
- Users who explicitly tuned `hooks.stop.schedule` keep their schedule (independent of `mode`).
- No config migration needed.

If a user wants the previous (forceful) 0.5.16 behavior:
```bash
aide-memory config hooks.stop.mode block
aide-memory config hooks.correction.escalate block
```

## 5. Code touch points

| File | Change |
|---|---|
| `src/memory/hooks/handlers.ts` | Correction handler: emit soft additionalContext + chrome; conditional flag write gated on `hooks.correction.escalate`. Stop handler: replace `emitBlockDecision(DEFAULT_PROMPT, …, 'stop')` with mode-aware emit (soft → additionalContext + chrome; block → existing; off → silent). Correction-pending branch: only fire if `escalate` opted in. SessionStart: rework source handling (skip clear + skip inject on `resume`). |
| `src/memory/hooks/handlers.ts:412` | Correction regex: add exclusions for quoted content + code-block content + meta-references. |
| `src/templates/rules/shared/body.md` | Replace `When to call` / `When NOT to call` sections per §3 above. |
| `src/memory/hooks/stdio.ts` | `emitBlockDecision` may need a `softVariant` helper or new `emitSoftDecision` for the soft+visible path. |
| `scripts/hooks/defaults.json` | Add `hooks.correction.escalate` + `hooks.stop.mode`. |
| `docs/user/configuration.md` | Document the two new keys. |
| Chrome strings | Update soft-path message in handlers.ts to "additional scoped memories not yet recalled". |

---

## 6. Test plan — required before release

### 6.1 Unit tests

Cover every new config combination:

| Config | Expected behavior |
|---|---|
| Default (`escalate: "off"`, `stop.mode: "block"`) | Correction → soft additionalContext via UserPromptSubmit + chrome, NO flag. Stop scheduled → `decision:"block"` + softened reason + chrome (NO `hookSpecificOutput`). |
| `escalate: "block"` + correction | Flag written. Next Stop fires `decision:"block"` with the correction reminder. |
| `stop.mode: "off"` | Stop scheduled fires silent. |
| `correction.enabled: false` | Correction detection completely disabled (no chrome, no additionalContext, no flag). |
| Regex exclusions | Quoted content / code-block content / meta-references DON'T match. |
| `source: "resume"` | No injection emit, no tracking clear. |
| `source: "compact"` / `"clear"` | Clear + inject as before. |
| **Protocol conformance (every emit)** | Output JSON conforms to `claude-code-protocol.ts` constants. Stop emits never include `hookSpecificOutput`. |

### 6.2 Protocol conformance + smoke tests

**New layered defense (added 2026-05-06 after the soft-Stop platform-limit
discovery):**

- `src/memory/__tests__/hook-protocol-conformance.test.ts` — calls every
  handler directly with every config branch, captures stdout, validates the
  parsed JSON against the schema constants in
  `src/memory/hooks/claude-code-protocol.ts`. Specifically catches "we emitted
  output Claude Code rejects" without needing a live `claude` session.
  Includes a regression guard for the exact bug 0.5.17-attempt-1 shipped
  (Stop with `hookSpecificOutput`).
- `src/memory/hooks/claude-code-protocol.ts` — single source of truth for
  per-event field whitelists/forbids. `LAST_VERIFIED: <date>` marker. Every
  release re-verifies against `https://code.claude.com/docs/en/hooks` per
  `docs/RELEASING.md` step 0.

**Existing smoke surface (still required):**

- `cursor-init-smoke.test.sh` — confirm new config keys land in `.aide/config.json`
- `all-configs-behavior.test.sh` — exercise the two new keys
- `version-telemetry.smoke.test.sh` — still green
- `install-from-tarball.smoke.sh` — unchanged
- `memories-default-shared.smoke.test.sh` — unchanged
- `semantic-search.smoke.test.sh` — unchanged
- `hooks-soft-default.smoke.test.sh` — drives each hook event via stdin-piped
  JSON to the bash dispatcher, asserts the same output shape the TS
  conformance test asserts (catches dispatcher-level regressions the unit
  test misses)

### 6.3 Validation scenarios

Manual or simulated walks of:

1. **Default-config session.** Have an agent work on a feature with a few corrections. Verify:
   - Correction soft-hint fires once per correction, no Stop blocks for "correction was not stored"
   - Scheduled Stop checkpoints emit chrome + soft additionalContext but don't force a turn
   - Memories captured by aide_remember are layer-appropriate (per the new body.md guidance)
   - Compare to 0.5.16: count of memories stored, count of "noise" memories, agent turn count for Stop reflections
2. **Resume scenario.** Start session, store memories, resume. Verify:
   - Tracking persists (no re-block on first read)
   - SessionStart doesn't re-inject
3. **Escalate opted-in.** Set `hooks.correction.escalate = "soft"`, do a correction, verify next Stop reminds via additionalContext.
4. **Stop block opted-in.** Set `hooks.stop.mode = "block"`, verify Stop returns block decision.

### 6.4 Bug review checklist

Before tagging release:
- [ ] Skim all `emitBlockDecision` call sites for any that should now be soft instead
- [ ] Confirm correction-pending file isn't being written elsewhere besides the gated UserPromptSubmit path
- [ ] Confirm `clearSessionTracking` isn't called from other hook paths on `resume`
- [ ] Run full unit suite (target: all green, count >= 787 from 0.5.16 + new tests)
- [ ] `verify-package.sh` passes
- [ ] Bundle hygiene: line 2 minified, no source maps, no `.ts` files
- [ ] Cursor-init smoke 25/25
- [ ] No new dependencies added

### 6.5 Side-by-side comparison

Required for release decision:

Run a fixed scenario (e.g., the demo flow from `setup-demo-v2.sh` or a fresh real-world session) on:
- 0.5.16 (current)
- 0.5.17 candidate

Compare:
- Number of memories stored
- Subjective signal/noise ratio of stored memories (per the new "what's different from default" criterion)
- Number of Stop blocks visible in chat
- Number of "correction was not stored" reminders
- Number of agent turns triggered purely by hook re-prompts

**Release gate:** new defaults must show fewer noise memories AND fewer hook-induced agent turns than 0.5.16 on the same scenario, while still capturing the legitimate signal (real corrections, real area decisions). If signal drops too much, dial up the bias-toward-storing in the prompt wording before shipping.

---

## 6.6 Documentation updates required (internal + external)

ALL of these must be updated as part of 0.5.17 to reflect the new defaults + config keys. Don't ship until each is current.

### External (user-facing)

| File | Update needed |
|---|---|
| `README.md` (parent) | Hooks-list bullet: clarify default = soft + visible. Mention that the "correction was not stored" reminder is opt-in. Section on tunability: list the new keys. |
| `README.npm.md` | Same updates as parent README — this is what ships in the npm tarball. |
| `docs/user/configuration.md` | Add `hooks.stop.mode` + `hooks.correction.escalate` to the keys table. Default values + descriptions + the precedence rules from §4.1. |
| `docs/user/hooks.md` | Update PreToolUse / Stop / UserPromptSubmit rows to describe the new soft+visible defaults. Add a "Tuning capture density" subsection pointing at the new knobs. |
| `docs/user/concepts.md` | If it describes hook behavior, update to soft-by-default. |
| `docs/user/quick-start.md` | If it shows hook-fire examples, refresh. |
| `docs/user/architecture.md` | Section on hook lifecycle: update Stop description (soft default) + correction-detection description (soft, no flag by default). |
| `docs/launch/blog-post.md` | "Capture happens as you work" / "Recall is scoped" sections — verify still accurate; the soft default doesn't break the capture story but the wording around forceful prompts should be neutral. |
| `aide-memory-web/pages/blog/launch.mdx` | Same updates as docs/launch/blog-post.md. |
| `aide-memory-web/pages/docs/configuration.mdx` | Mirror docs/user/configuration.md updates. |
| `aide-memory-web/pages/docs/hooks.mdx` | Mirror docs/user/hooks.md updates. |
| `aide-memory-web/pages/docs/faq.mdx` | If FAQ mentions hook behavior, refresh. |
| `CHANGELOG.md` | New 0.5.17 entry (see §7 below for content). |

### Internal (specs / strategy / handoffs)

| File | Update needed |
|---|---|
| `docs/PRODUCT_VISION.md` | If it describes hook intensity / behavior defaults, update to soft+visible. |
| `docs/specs/PHASE_0_1_SPEC.md` | If it describes hook behavior in a "current state" section, update. |
| `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` | Note that this spec landed; mark Stop-loop diagnosis as deferred (sidestepped by new default). |
| `docs/specs/CURSOR_ONBOARDING.md` | If it describes Stop-block behavior, update to soft default. |
| `.claude/rules/aide-memory.md` (this project's dev rules) | Will auto-regenerate from updated body.md template at next init / --update-rules. No manual edit needed. |
| `.cursor/rules/aide-memory.mdc` | Same — auto-regenerates. |

### Verification before release

- [ ] grep across `docs/` and `aide-memory-web/` for old phrasing: "BEFORE doing anything else, store" — must be gone from user-facing docs (the hook prompt itself + any quoted instances)
- [ ] grep for "decision: block" / `decision:"block"` references in user-facing docs — clarify which paths are still hard-block (PreToolUse only)
- [ ] grep for "correction was not stored" / "correction-pending" — should appear only in escalate-mode descriptions, not as default behavior
- [ ] Confirm no doc claims the agent is "forced" / "must" reflect at Stop — soft default doesn't force
- [ ] aide-memory-web blog/launch.mdx mirrors docs/launch/blog-post.md verbatim

## 7. Migration / user-facing notes

Add to `CHANGELOG.md` under 0.5.17:

- **Hook defaults are now soft + visible.** Corrections and Stop checkpoints surface a chrome line + soft hint to the agent without forcing a re-prompt or extra agent turn. The "correction was not stored" reminder is opt-in via `hooks.correction.escalate = "soft"` (or `"block"`).
- **`hooks.stop.mode` config key (default `"soft"`).** Power users who prefer the previous behavior can flip to `"block"`.
- **`hooks.correction.escalate` config key (default `"off"`).** Set to `"soft"` or `"block"` to enable next-Stop reminder when a correction wasn't stored.
- **SessionStart on `resume` no longer re-injects or clears tracking.** Prior session's recall state is preserved.
- **Soft-path chrome wording differentiated.** Consecutive deny + soft fires are no longer visually identical.
- **`body.md` capture guidance refreshed.** Layer table without overfit examples; clearer when-to-store / when-not-to-store rules.

Existing user behavior on upgrade: their config.json doesn't change. New keys default to soft / off / off. They'll see less Stop noise. Memories already stored are unchanged. **All users — new installs and upgraders alike — get the new defaults automatically** because `getSetting()` falls back to `defaults.json` for any keys missing from the user's config (no migration step required).

To explicitly opt back into 0.5.16 behavior:
```bash
aide-memory config hooks.stop.mode block
aide-memory config hooks.correction.escalate block
```

---

## 8. Conversation context worth preserving (pre-compact)

The following points came up during the design session and should NOT be lost:

1. **User verbosity / repetition complaint (2026-05-01 mid-session):** "You repeated yourself many times in the last output." Lesson saved to memory #438 (small/specific copy feedback → surgical edit only, not a rewrite). Apply to ALL future iteration in this codebase.

2. **Stop loop diagnosis attempt:** I theorized about Stop's re-prompt firing UserPromptSubmit but couldn't confirm without `AIDE_DEBUG=hooks` set in the environment that launches Claude Code (not in a child bash). User attempted to set it but bash invocation exited; needs to be in shell profile + Claude Code session restart. Diagnosis deferred.

3. **"Capture between model defaults + what's specific to this user/area":** the user's articulated capture philosophy. Don't reduce to quoted examples or 6-month heuristics. Concrete signals via the four layers.

4. **No new mode knob for `hooks.correction.mode`:** existing `hooks.correction.enabled` (on/off) is enough. Adding the `escalate` knob is the ONLY new correction config.

5. **Resume injection redundancy:** confirmed via code reading. Claude Code preserves prior transcript on resume; aide-memory was duplicating both injection AND re-blocking via cleared tracking. Fix shipped in 0.5.17.

6. **Two PreToolUse:Read messages on what looked like one Read:** the file appeared twice in the recalled-paths file — confirmed two Read attempts (one blocked, one retry after recall). Chrome differentiation in 0.5.17 will make this less confusing in the UI.

7. **Buttondown form is reverted to local-API stub.** Memory #440 has the failure mode. Don't re-enable until newsletter slug verified via Buttondown dashboard.

8. **Demo fixture at `/tmp/aide-demo-v2`** — `scripts/demo/setup-demo-v2.sh`. Reactive rules + Stop schedule tweak still works. Demo recorded at 2.5x in `~/Downloads/quickDemoV2-2.5x.mp4`.

9. **Currently shipped:** 0.5.16 on npm (0.5.0–0.5.15 unpublished; only 0.5.16 live). Public repo + private repo both at v0.5.16 latest.

10. **Open follow-ups (don't lose):**
    - PUBLIC_REPO_SECRET token scope (CI release sync to public repo)
    - Buttondown account / slug verification
    - boolean@3.2.0 upstream warning
    - User-overrides marker pair in rules files (memory #441 — survive `init --force` and version upgrades)
    - Stop loop diagnosis with `AIDE_DEBUG=hooks` data when reproduced
    - Show HN / dev.to drafts need rewrite to current voice/version
    - Rewrite of `docs/marketing/show-hn.md` and `devto-post.md` per memory #430

11. **Internal docs not yet updated for 0.5.17:**
    - `docs/user/configuration.md` — add the two new config keys
    - `CHANGELOG.md` — 0.5.17 entry
    - `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` — note this spec, mark Stop-loop as deferred
    - `docs/specs/PHASE_0_1_SPEC.md` — possibly note hook-defaults shift

---

## 9. Release sequence (per `docs/RELEASING.md`)

1. Implement code changes per §5
2. Run unit suite — must be green
3. Run smoke suite — must be green
4. Run validation scenarios per §6.3
5. Bug review per §6.4
6. **Side-by-side comparison per §6.5 — release gate**
7. Update `CHANGELOG.md` with 0.5.17 entry
8. Update `docs/user/configuration.md` with new keys
9. Bump `package.aide-memory.json` to `0.5.16` → `0.5.17`
10. Commit `chore(release): 0.5.17`
11. Tag `v0.5.17`
12. Push branch + tag → CI publishes
13. Manual public-repo sync (PUBLIC_REPO_SECRET still pending)
14. Mark v0.5.16 as Pre-release on both repos
15. Post-publish smoke on a clean install
16. Empirical fix verification on the published bundle (default config really doesn't write correction-pending flag)

---

## 10. Open questions / decisions deferred

- Should `hooks.correction.escalate = "soft"` and `"block"` differ in behavior, or fold into a single boolean? (Currently three states: off / soft / block. Could simplify to off / on if soft and block converge.) Decision: keep three states, gives users meaningful gradient.
- Should the soft-path chrome show *which* memory IDs are missing, or just the count? (Current: count + ID list in the agent_message; chrome only says "additional scoped memories." Decision: keep current — chrome is summary, agent_message has detail.)
- User-overrides marker pair (memory #441) — implement now or stay parked? Decision: stay parked. Out of scope for 0.5.17, separate concern (version upgrade clobber, not memory-write clobber which is already fixed in 0.5.16).
