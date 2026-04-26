# aide-memory in Cursor

Cursor ships with aide-memory 0.5.0 at ~80% parity with Claude Code. The
remaining 20% is not us being lazy — it is a set of five concrete gaps
caused by missing platform channels, each tracked against an upstream
Cursor bug or feature request. When Cursor fixes a thread, the aide-memory
adapter upgrades and the workaround goes away.

For the editor-agnostic mental model see [concepts.md](../concepts.md);
for the capability matrix see [supported-editors.md](../supported-editors.md).

## What you'll see

**At init.** `aide-memory init` creates:

- `.cursor/hooks.json` — hook registrations (sessionStart, preCompact,
  stop, beforeSubmitPrompt, preToolUse matching Read / Write / Grep /
  MCP:aide_*, postToolUse)
- `.cursor/mcp.json` — MCP server entry (`type: "stdio"`,
  `args: [<path>, "${workspaceFolder}"]`)
- `.cursor/rules/aide-memory.mdc` — **dynamically regenerated** rules file
  with YAML frontmatter (`alwaysApply: true`, `globs: **/*`). Gitignored
  because it is a derived artifact that rewrites on memory and config
  changes — see "Rules-file regeneration" below.
- `.aide/config.json` and `.aide/memories/` — same as Claude Code
- `.ignore` / `.gitignore` entries

**⚠ Restart Cursor after init.** Cursor has no MCP hot-reload
([#3887](https://github.com/cursor/cursor/issues/3887),
[#55723](https://forum.cursor.com/t/refresh-mcp-server-via-command/55723)).
MCP tools will not appear until Cursor restarts. `aide-memory init` prints
a reminder in its output.

**⚠ MCP tool list may need a manual toggle.** If the aide-memory tools do
not appear after restart, open Cursor → Settings → MCP and toggle the
aide-memory server off then on ([#122421](https://forum.cursor.com/t/mcp-tool-list-only-updates-after-manually-toggling-server-off-on/122421)).

**On first read of a file with scoped memories.** The `preToolUse` hook
returns:

```json
{"permission": "deny", "user_message": "19 memories for src/auth/middleware.ts …"}
```

Cursor renders the `user_message` inline as a denial reason. The agent
reads that, calls `aide_recall({paths: [...]})`, and retries the read.
Same effect as Claude Code's hard-block.

**On re-read of the same path.** Silent — the tracking file
(`.aide/cache/recalled-paths-<sid>.txt`) suppresses the block. But unlike
Claude Code, there is **no soft-nudge middle tier**: Cursor's `preToolUse`
has no `additionalContext` field, so re-reads after the first recall are
fully silent. See gap [#157231](https://forum.cursor.com/t/add-additional-context-to-beforesubmitprompt-hook-output/157231).

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

## What's different from Claude Code

A deliberate, explicit gap list — not hedging, just the facts.

1. **Soft `additionalContext` channel is missing.** Cursor's `preToolUse`
   output has no `additionalContext` field. After the first
   hard-block-and-recall on a file, re-reads are **silent** — no middle
   tier. Claude Code's soft nudge is absent on Cursor.

2. **No inline branded chrome.** Cursor has no `systemMessage`-equivalent
   field for non-deny hook events. The `aide-memory · …` status lines you
   see in Claude Code do not appear in Cursor. Users infer state from the
   agent's natural tool-call chrome and response.

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
