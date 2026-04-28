# aide-memory in Cursor

Cursor ships with aide-memory's full hook + MCP wiring. A handful of
capabilities are tracked against upstream Cursor platform work — each
maps to an open Cursor bug or feature request thread. When Cursor ships
the corresponding change, the aide-memory adapter upgrades and the
workaround goes away.

For the editor-agnostic mental model see [concepts.md](../concepts.md);
for the capability matrix see [supported-editors.md](../supported-editors.md).

## What you'll see

**At init.** `aide-memory init` creates:

- `.cursor/hooks.json` — hook registrations (sessionStart, preCompact,
  stop, beforeSubmitPrompt, preToolUse matching Read / Write / Grep /
  MCP:aide_*, postToolUse)
- `.cursor/mcp.json` — MCP server entry (`type: "stdio"`,
  `args: [<path>, "${workspaceFolder}"]`)
- `.cursor/rules/aide-memory.mdc`: **dynamically regenerated** rules file
  with YAML frontmatter (`alwaysApply: true`, `globs: **/*`). Gitignored
  because it is a derived artifact that rewrites on memory and config
  changes (see "Rules-file regeneration" below).
- `.aide/config.json` and `.aide/memories/` — same as Claude Code
- `.ignore` / `.gitignore` entries

### ⚠ ⚠ ⚠ First-time MCP enablement (read this — easy to miss)

Cursor's MCP integration has **two enablement gates** you'll hit on first
init. Neither is an aide-memory bug; both are Cursor security/UX
choices we have to live with:

1. **Cursor must be restarted to pick up the MCP config.** Cursor reads
   `.cursor/mcp.json` on startup only; there is no hot-reload
   ([#3887](https://github.com/cursor/cursor/issues/3887),
   [#55723](https://forum.cursor.com/t/refresh-mcp-server-via-command/55723)).
   `aide-memory init` prints a reminder, but if you skip it nothing
   else in this doc works. **Cmd+Q the Cursor app** (don't just close
   the window) and reopen.

2. **The aide-memory MCP server is registered DISABLED by default.**
   Cursor's design: every newly-discovered MCP server stays toggled
   off until the user explicitly opts in. We can't pre-enable from
   `.cursor/mcp.json` (no documented field for it; would also be a
   security gap). To turn it on:

   - Cursor → **Settings** → **MCP**
   - Find `aide-memory` in the list
   - Flip the toggle **ON**

   You'll know it worked when the agent can call `aide_recall`,
   `aide_remember`, etc. without errors. If those calls fail, you're
   either still toggled off OR hitting Cursor bug
   [#122421](https://forum.cursor.com/t/mcp-tool-list-only-updates-after-manually-toggling-server-off-on/122421);
   toggle off then back on to refresh the tool list.

> **Until both gates clear, aide-memory's MCP tools are unavailable.**
> Hooks (`.cursor/hooks.json`) still fire correctly, but the
> hard-block messages tell the agent to "call aide_recall," and that
> tool can't run if MCP isn't enabled.

**On first read of a file with scoped memories — when applicable.** The
`preToolUse` hook returns:

```json
{
  "permission": "deny",
  "user_message": "aide-memory · prompting aide_recall for scoped memories (expected flow)",
  "agent_message": "2 memories for src/auth/middleware.ts not yet recalled. Call aide_recall({ids: [7,6]})."
}
```

The agent reads `agent_message` and calls `aide_recall({paths: [...]})`, then
retries. Same effect as Claude Code's hard-block.

> **"When applicable" is doing real work in that sentence.** The hook
> fires for Reads where (a) the file is not already in Cursor's editor
> pane, AND (b) scoped memories haven't been recalled this session.
> Reads of files that are already open in your editor are **not seen by
> the hook** (see "Per-Read coverage gap on Cursor" below for the
> verified observation and the ideal-vs-current behavior gap).

**On re-read of the same path — soft.** When the file has been
encountered before but new memories exist (or some IDs are still
uncovered), `preToolUse` returns `{"permission": "allow", "agent_message":
"<missing-ids nudge>"}`. The agent receives the nudge in context but the
read isn't blocked.

**When the agent calls `aide_recall` or `aide_remember`.** Standard Cursor
chat chrome shows the MCP tool call — request + response — same as any
other MCP tool. No branded `aide-memory · …` status line; Cursor has no
platform surface for inline chrome on allow events ([#142589](https://forum.cursor.com/t/regression-hook-response-fields-user-message-agent-message-still-ignored-in-windows-v2-0-77/142589),
[#115748](https://forum.cursor.com/t/webview-panel-keeps-being-automatically-closed-when-using-an-extension-that-uses-webviewpanel-api/115748),
[#121400](https://forum.cursor.com/t/request-for-dedicated-ai-features-extension-api/121400)).

**When you type a correction.** The `beforeSubmitPrompt` hook detects
correction patterns and writes a `correction-pending-<sid>.txt` flag. The
flag is set immediately, but the user-visible reminder ("correction
wasn't stored — please call `aide_remember`") fires **one turn later** via
the next Stop hook's `followup_message`. Reason: `beforeSubmitPrompt`
supports only `continue` + `user_message` — no additionalContext channel.

**When a session starts.** This is the biggest Cursor-specific workaround.
`sessionStart.additional_context` is broken ([#158452](https://forum.cursor.com/t/sessionstart-hook-additional-context-is-never-injected-into-agents-initial-system-context/158452)
— staff-confirmed, no workaround). Instead, aide-memory regenerates
`.cursor/rules/aide-memory.mdc` with top-N preferences + guidelines +
priority-always memories baked in. Cursor reads that rules file on every
agent turn (`alwaysApply: true`). **The content is the same as what
Claude Code's SessionStart injects; the channel is the rules file, not a
hook response.**

**When the agent finishes a turn.** The Stop hook emits a
`followup_message`:

```
Anything worth remembering? Call aide_remember if this turn produced a
decision, correction, or non-obvious finding.
```

`followup_message` is visible in chat and re-prompts the agent.

## Per-Read coverage gap on Cursor

**Observed behavior (verified empirically 2026-04-27 on Cursor 3.2.11):**
when the file is already open in Cursor's editor pane, aide-memory's
per-Read hook (`preToolUse:Read`) does **not** fire for subsequent Read
tool calls on that file. Neither the hard-block path nor the soft-nudge
path engages in this case.

When the file is **not** open in the editor, the hook fires reliably and
applies the appropriate gate (hard-block, soft-nudge, or silent) based
on tracking state.

**The per-Edit safety net is unaffected.** `preToolUse:Write` (which
matches `Write`, `Edit`, and Cursor's `StrReplace`) fires reliably on
every edit regardless of whether the file is open in the editor.

**Memory context still reaches the agent** via the rules-file injection
(`.cursor/rules/aide-memory.mdc` with `alwaysApply: true`), which is
loaded on every agent turn. The rules-file guidance instructs the agent
to call `aide_recall` for any file path it's reasoning about — even when
the file content is already visible — so memory awareness is present
whether or not the per-Read hook fires.

**Empirical confirmation (verified 2026-04-27 across the 4-cell file-open
matrix in `docs/validation/E2E_VALIDATION.md` Scenario F-fileopen):** in
the realistic case (file open in editor, no adversarial prompt), the
agent followed the rules-file guidance and called `aide_recall`
proactively even though the per-Read hook didn't fire. The only failure
case is when the user has the file open AND explicitly tells the agent
to skip aide-memory tools — a deliberate suppression scenario, not a
typical workflow. For typical use, memory awareness reaches the agent
in 100% of observed file-open reads.

**Ideal behavior (what we'd want):** the per-Read hard-block fires
whenever applicable (i.e., scoped memories haven't been recalled), irrespective of how the
agent obtained the file content (Read tool, editor cache, attachment).
We have not yet identified a Cursor-side mechanism that lets us hook
editor-cached reads — investigation tracked as a Phase 1 follow-up.

## What's different from Claude Code

A deliberate, explicit gap list — based on verified observations.

1. **Per-Read safety net is partial in Cursor.** The per-Read hook fires
   only when the file is not already open in Cursor's editor pane.
   See "Per-Read coverage gap on Cursor" above. Per-Edit safety net is
   reliable. The rules-file injection covers the gap functionally —
   memory context reaches the agent regardless of hook firing.

2. **Inline chrome rendering is inconsistent across hooks.** Cursor 3.2.11
   renders `user_message` differently for different events: visible in
   the Hooks Output panel for some "tool attempted" entries (e.g. Edit
   attempted), not visible for others (e.g. Read attempted) even with
   the same JSON shape. Soft `agent_message` reliably reaches the agent
   regardless. The `aide-memory · …` brand chrome users see in Claude
   Code does not consistently surface inline in Cursor.

3. **SessionStart content ships via the rules file, not the hook.**
   Channel different, content the same. See "Rules-file regeneration"
   below.

4. **Correction detection fires one turn late.** `beforeSubmitPrompt`
   has no additionalContext channel, so the reminder is delivered on the
   next Stop hook via `followup_message`. The correction flag is set
   immediately; only the user-visible nudge is delayed.

5. **No Glob matcher.** Cursor's documented matcher vocabulary is
   `Shell, Read, Write, Grep, Delete, Task, MCP:<tool>` — no `Glob`. Pre-search
   nudges fire on Grep only. `codebase_search` is also uncovered.

6. **SessionStart does not re-fire after compaction**
   ([#158873](https://forum.cursor.com/t/sessionstart-hook-should-fire-after-compact/158873)).
   The regenerated rules file partially covers this — Cursor re-injects
   `alwaysApply: true` rules on every turn, so post-compact turns still
   see aide-memory content — but the dedicated post-compact re-injection
   pipeline Claude Code has is not available.

## Rules-file regeneration

`.cursor/rules/aide-memory.mdc` is a **derived artifact**. aide-memory
regenerates it atomically on:

1. `aide-memory init` and `aide-memory init --force --update-rules`
2. `aide-memory config <key> <value>` when the key affects session-start
   content (`injection.*`, `memories.softening.threshold`, etc.)
3. `aide_remember` / `aide_update` / `aide_forget` for memories that are
   `priority: "always"` or in the `preferences` / `guidelines` layer
4. `aide-memory sync import`

The file is gitignored with a header comment explaining why. When Cursor
fixes [#158452](https://forum.cursor.com/t/sessionstart-hook-additional-context-is-never-injected-into-agents-initial-system-context/158452),
aide-memory will narrow this file back to a static template and stop
regenerating it.

Atomic writes use `fs.rename()` (POSIX-atomic), so concurrent sessions
never see a torn file.

## Token budget

The rules file is injected on every agent turn. With defaults:

- `injection.preferences: 15` × ~30 tokens ≈ 450 tokens
- All guidelines (typical 5-15) × ~20 tokens ≈ 100-300 tokens
- Priority-always memories (typical 0-3) × ~50 tokens ≈ 0-150 tokens
- Headers / formatting ≈ 100 tokens
- **Total ≈ 650-1000 tokens per turn**

Capped by `injection.maxChars` (default 1200 chars ≈ 300 tokens after
truncation). Cursor's community soft-cap across **all** `alwaysApply: true`
rules is ~2000 tokens — if you have other always-on rules, keep an eye on
the cumulative total.

**Per-turn cost is roughly equivalent to Claude Code's SessionStart
approach.** LLMs are stateless; session-start content re-ships on every
API call in both tools. Rules-file content caches well in Anthropic's
prompt cache (system-prompt slot, ~90% hit rate steady-state), so
effective cost drops after the first turn.

**If you want to reduce the budget:**

```bash
# Option 1: full disable — static rules only, no dynamic content
aide-memory config injection.enabled false

# Option 2: granular tune
aide-memory config injection.preferences false
aide-memory config injection.guidelines false
aide-memory config injection.maxChars 300

# Option 3: aggressive cap, keep everything
aide-memory config injection.maxChars 400
```

Full breakdown: see
[`docs/specs/CURSOR_ONBOARDING.md`](../../specs/CURSOR_ONBOARDING.md) §4.7.

## Troubleshooting

**MCP tools don't appear after init.** Restart Cursor ([#3887](https://github.com/cursor/cursor/issues/3887)).
If they still don't appear, toggle the aide-memory MCP server off then on
in Settings → MCP ([#122421](https://forum.cursor.com/t/mcp-tool-list-only-updates-after-manually-toggling-server-off-on/122421)).

**Disabled MCP server keeps re-enabling on restart**
([#141009](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009)).
Known Cursor quirk; not specific to aide-memory.

**Hook collision with another tool.** Cursor only runs the **first** hook
registered per event ([#141996](https://forum.cursor.com/t/cursor-hooks-bug-multiple-hooks-in-array-only-execute-first-hook/141996)).
If another tool already registered hooks in `.cursor/hooks.json`, its
hook fires and ours does not. `aide-memory init` warns on collision.

**Agent doesn't notice session-start content.** Check
`.cursor/rules/aide-memory.mdc` exists and has `alwaysApply: true` in the
frontmatter. If missing or stale, run `aide-memory init --update-rules`
to regenerate.

**MCP orphan processes on restart**
([#156478](https://forum.cursor.com/t/mcp-process-leak-orphaned-children-on-restart/156478)).
aide-memory does PID-file cleanup on server start, so leaks are bounded.
If you see multiple `node dist/memory/cli.js` processes, `pkill -f
dist/memory/cli.js` is safe.

**Personal vs shared preferences.** `aide_remember` accepts a `shared`
parameter (`true` writes to `preferences/shared/`, committed; `false`
writes to `preferences/personal/`, gitignored). When the agent omits it,
the default comes from `memories.defaultShared` in `.aide/config.json`
(default `true`). Flip with `aide-memory config memories.defaultShared
false` if you want new preferences to default to personal/private.
Per-call `shared: true|false` always overrides this default.

**Agent reads a file via @-attachment or Tab context and aide-memory
doesn't nudge.** Expected — `@-file` attachments and Tab context pulls
bypass `preToolUse` hooks entirely. aide-memory's nudge is about
agent-planned reads, not user-provided context. See
[CURSOR_ONBOARDING.md](../../specs/CURSOR_ONBOARDING.md) §3 rationale #5.

## Platform issues we're tracking

Seven Cursor threads gate specific workarounds or missing features.
When Cursor fixes one, aide-memory upgrades the adapter and removes the
workaround. Checked weekly per the
[onboarding guide protocol](../../specs/EDITOR_ONBOARDING_GUIDE.md).

| Thread | What it unblocks |
|---|---|
| [#158452](https://forum.cursor.com/t/sessionstart-hook-additional-context-is-never-injected-into-agents-initial-system-context/158452) | Drop rules-file regeneration; switch to native sessionStart injection |
| [#157141](https://forum.cursor.com/t/sessionstart-hook-output-is-accepted-and-merged-but-the-injected-context-does-not-reach-agent-window/157141) | Related sessionStart race condition — same fix |
| [#158168](https://forum.cursor.com/t/posttooluse-hooks-additional-context-not-injected-into-agent-model-context/158168) | `postToolUse.additional_context` becomes usable |
| [#138691](https://forum.cursor.com/t/include-mcp-server-name-as-part-of-the-payload-for-beforemcpexecution-cursor-hook/138691) | Disambiguate aide-memory's `aide_recall` from other servers' same-named tools |
| [#157231](https://forum.cursor.com/t/add-additional-context-to-beforesubmitprompt-hook-output/157231) | Deliver correction nudge in-turn (eliminate one-turn delay) |
| [#153966](https://forum.cursor.com/t/no-mechanism-to-trigger-hooks-or-inject-messages-into-cursor-when-agent-is-idle/153966) | Cross-session memory propagation to running sessions |
| [#158873](https://forum.cursor.com/t/sessionstart-hook-should-fire-after-compact/158873) | SessionStart re-injection post-compaction |

Additional quirks we design around (not strict bugs, just shapes we
account for):

- MCP server no hot reload ([#3887](https://github.com/cursor/cursor/issues/3887))
- MCP tool list needs manual toggle ([#122421](https://forum.cursor.com/t/mcp-tool-list-only-updates-after-manually-toggling-server-off-on/122421))
- Disabled MCP servers re-enable on restart ([#141009](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009))
- MCP orphan process leak ([#156478](https://forum.cursor.com/t/mcp-process-leak-orphaned-children-on-restart/156478))
- First-hook-per-event only ([#141996](https://forum.cursor.com/t/cursor-hooks-bug-multiple-hooks-in-array-only-execute-first-hook/141996))
- `AskUserQuestion` tool doesn't trigger hooks ([#152230](https://forum.cursor.com/t/askquestion-tool-does-not-trigger-cursor-hooks/152230))
