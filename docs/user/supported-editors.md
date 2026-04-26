# Supported editors — capability matrix

aide-memory is editor-agnostic at the core: the memory store, the seven
MCP tools, and the hook dispatcher are the same across every tool. Each
editor integration is an **adapter** that translates aide-memory's
canonical events and matchers into that editor's config shape and hook
I/O contract. This page is the honest accounting of what each adapter
ships today.

**TL;DR.** Claude Code is the reference implementation — every feature
below works there. Cursor ships at ~80% parity in 0.5.0 with five
documented gaps caused by missing platform channels. Codex, Copilot,
and Windsurf are **rule-template only** today — their adapters write a
curated rules file but do not yet generate hooks or MCP config at
`aide-memory init`.

## Legend

- ✅ supported
- ❌ not supported
- ⚠ partial support — see footnote
- 📝 rule template only (no hook / MCP wiring yet)

## Capability matrix

| Capability | Claude Code | Cursor | Codex | Copilot | Windsurf |
|---|---|---|---|---|---|
| `aide-memory init` generates editor config files | ✅ | ✅ | 📝 | 📝 | 📝 |
| MCP tools available in agent sessions | ✅ | ✅ [^mcp-manual] | ⚠ [^mcp-manual] | ⚠ [^mcp-manual] | ⚠ [^mcp-manual] |
| Hard-block on file read with scoped memories | ✅ | ✅ | ❌ | ❌ | ❌ |
| Soft nudge on re-read (additionalContext) | ✅ | ❌ [^cursor-soft] | ❌ | ❌ | ❌ |
| Inline branded status lines ("aide-memory · …") | ✅ | ❌ [^cursor-chrome] | ❌ | ❌ | ❌ |
| Session-start dynamic context injection | ✅ | ⚠ [^cursor-session] | ❌ | ❌ | ❌ |
| Session-start context after compaction | ✅ | ❌ [^cursor-compact] | ❌ | ❌ | ❌ |
| Stop-hook reflection nudges | ✅ | ✅ [^cursor-followup] | ❌ | ❌ | ❌ |
| Correction detection (UserPromptSubmit / beforeSubmitPrompt) | ✅ | ⚠ [^cursor-correction] | ❌ | ❌ | ❌ |
| Pre-search nudge on Grep | ✅ | ✅ | ❌ | ❌ | ❌ |
| Pre-search nudge on Glob | ✅ | ❌ [^cursor-glob] | ❌ | ❌ | ❌ |
| Auto-regenerated rule file on memory/config writes | ⚠ [^cc-regen] | ✅ | ❌ | ❌ | ❌ |

[^mcp-manual]: Cursor's MCP config is generated at init. Codex / Copilot /
Windsurf ship a rules template only — if you add aide-memory as an MCP
server manually in the editor's own MCP config, the seven tools work
identically to Claude Code.

[^cursor-soft]: Cursor's `preToolUse` hook output has no
`additionalContext` field (feature request [#157231](https://forum.cursor.com/t/add-additional-context-to-beforesubmitprompt-hook-output/157231)).
After the first hard-block-and-recall on a file, subsequent re-reads are
**silent** — no middle nudge. Claude Code's soft middle tier is missing.

[^cursor-chrome]: Cursor has no user-visible surface for non-deny hook
events. `user_message` renders only on `permission: deny`; `agent_message`
is broken in v2.0.77+ ([regression #142589](https://forum.cursor.com/t/regression-hook-response-fields-user-message-agent-message-still-ignored-in-windows-v2-0-77/142589));
extensions cannot inject chat UI ([#115748](https://forum.cursor.com/t/webview-panel-keeps-being-automatically-closed-when-using-an-extension-that-uses-webviewpanel-api/115748),
[#121400](https://forum.cursor.com/t/request-for-dedicated-ai-features-extension-api/121400)).
Users infer state from the agent's natural tool-call chrome.

[^cursor-session]: `sessionStart.additional_context` is broken on Cursor
([#158452](https://forum.cursor.com/t/sessionstart-hook-additional-context-is-never-injected-into-agents-initial-system-context/158452)
— staff-confirmed, no workaround). aide-memory delivers the same content
via a **dynamically regenerated `.cursor/rules/aide-memory.mdc`** (with
`alwaysApply: true`) — Cursor staff's officially-endorsed workaround.
Content identical, channel different.

[^cursor-compact]: Cursor's `sessionStart` hook does not re-fire after
context compaction ([#158873](https://forum.cursor.com/t/sessionstart-hook-should-fire-after-compact/158873)).
The regenerated rules file partially covers this since Cursor re-reads
`alwaysApply: true` rules each turn, but the dedicated session-start
pipeline (that Claude Code gets) isn't available.

[^cursor-followup]: Stop-hook nudges use Cursor's `followup_message`
channel instead of Claude Code's `systemMessage`. Same effect, different
transport.

[^cursor-correction]: Cursor detects corrections via `beforeSubmitPrompt`
and writes the same correction-pending flag Claude Code does, but Cursor's
`beforeSubmitPrompt` hook output supports only `continue` + `user_message`
— no context injection channel. The user-visible "store this correction"
reminder therefore arrives **one turn later** via the next Stop hook's
`followup_message`, rather than in-turn the way Claude Code delivers it.

[^cursor-glob]: Cursor's documented matcher vocabulary is
`Shell, Read, Write, Grep, Delete, Task, MCP:<tool>` — no `Glob` matcher.
The adapter skips Glob silently. Grep coverage is unaffected.

[^cc-regen]: Claude Code does not need rules regeneration because its
SessionStart hook can inject dynamic context directly. The regen pipeline
exists for Cursor specifically; Claude Code's `.claude/rules/aide-memory.md`
is a static template.

## Current state

**Claude Code** is the reference adapter. Every capability listed here
works as designed. aide-memory's development cadence validates against
Claude Code first; other adapters catch up.

**Cursor** ships with aide-memory 0.5.0 at ~80% parity with Claude Code.
`aide-memory init` writes `.cursor/hooks.json`, `.cursor/mcp.json`, and
`.cursor/rules/aide-memory.mdc` (the last one auto-regenerates on memory
and config changes). Five gaps are documented above; each maps to an
upstream Cursor bug we are tracking in
[editors/cursor.md](./editors/cursor.md) — when Cursor fixes a thread, we
upgrade the adapter and remove the workaround.

**Codex, Copilot, Windsurf** ship a curated rule template (same canonical
body as Claude Code and Cursor, plus editor-specific frontmatter) but
`aide-memory init` does **not** yet generate hook or MCP config files for
these editors. The rule template alone gives agents the instruction to
use the seven MCP tools, but automatic capture (hooks) is not wired. Full
adapter onboarding is tracked in
[`docs/specs/EDITOR_ONBOARDING_GUIDE.md`](../specs/EDITOR_ONBOARDING_GUIDE.md)
as a post-0.5.0 task.

## Per-editor pages

- [editors/claude-code.md](./editors/claude-code.md) — reference UX, branded
  chrome, in-turn correction detection, full hook parity
- [editors/cursor.md](./editors/cursor.md) — hard-block then silent,
  rules-file session context, one-turn-delay corrections, 7 bug threads
- [editors/windsurf.md](./editors/windsurf.md) — rule template only
- [editors/codex.md](./editors/codex.md) — rule template only
- [editors/copilot.md](./editors/copilot.md) — rule template only
