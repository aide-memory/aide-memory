# Supported editors — capability matrix

aide-memory is editor-agnostic at the core: the memory store, the seven
MCP tools, and the hook dispatcher are the same across every tool. Each
editor integration is an **adapter** that translates aide-memory's
canonical events and matchers into that editor's config shape and hook
I/O contract. This page is the honest accounting of what each adapter
ships today.

**TL;DR.** Claude Code is the reference implementation: every feature
below works there. Cursor ships with full hook + MCP wiring; a handful
of capabilities are tracked against upstream Cursor platform work and
will upgrade as Cursor ships the corresponding changes. Codex, Copilot,
and Windsurf are **rule-template only** today: their adapters write a
curated rules file but do not yet generate hooks or MCP config at
`aide-memory init`.

## Legend

- ✅ supported
- ❌ not supported
- ⚠ partial support (see footnote)
- 📝 rule template only (no hook / MCP wiring yet)

## Capability matrix

| Capability | Claude Code | Cursor | Codex | Copilot | Windsurf |
|---|---|---|---|---|---|
| `aide-memory init` generates editor config files | ✅ | ✅ | 📝 | 📝 | 📝 |
| MCP tools available in agent sessions | ✅ | ✅ [^mcp-manual] | ⚠ [^mcp-manual] | ⚠ [^mcp-manual] | ⚠ [^mcp-manual] |
| Hard-block on file read with scoped memories | ✅ | ✅ [^cursor-read-editor-open] | ❌ | ❌ | ❌ |
| Hard-block on file edit with scoped memories | ✅ | ✅ | ❌ | ❌ | ❌ |
| Soft nudge on re-read (agent-context channel) | ✅ | ✅ [^cursor-soft] | ❌ | ❌ | ❌ |
| Inline branded status on hard-block | ✅ | ✅ | ❌ | ❌ | ❌ |
| Inline branded status on soft-nudge | ✅ | ⚠ [^cursor-chrome] | ❌ | ❌ | ❌ |
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

[^cursor-soft]: Soft nudges are delivered via Cursor's `agent_message`
field on `permission: "allow"`, the equivalent of Claude Code's
`additionalContext` channel. The agent receives the same context payload
(memory IDs + recommended tool call) on every fire. Verified empirically
on Cursor 3.2.11 (2026-04-27). User-visible chrome on soft fires is the
remaining partial gap (see `[^cursor-chrome]`).

[^cursor-chrome]: On `permission: "deny"` (hard-block), Cursor renders
`user_message` chrome inline in chat: the user sees `aide-memory · …`
status lines just like Claude Code. On `permission: "allow"` (soft fire),
Cursor 3.2.11 logs `user_message` to the Hooks Output panel but does NOT
render it inline in chat (users have to open the panel to see soft
chrome). The agent still receives the soft context via `agent_message` on
every fire, so the safety net works; only the user-facing visibility for
soft fires is missing. Filed as a feature request candidate for an
inline `system_message` channel on `allow`. Extensions cannot inject
chat UI ([#115748](https://forum.cursor.com/t/webview-panel-keeps-being-automatically-closed-when-using-an-extension-that-uses-webviewpanel-api/115748),
[#121400](https://forum.cursor.com/t/request-for-dedicated-ai-features-extension-api/121400))
which is why we don't fall back to a webview surface.

[^cursor-read-editor-open]: Cursor 3.2.11's `preToolUse:Read` hook does
NOT fire when the target file is already open in the editor pane
(verified empirically 2026-04-27). The cause is unverified (could be
editor-cached content serving, design intent, or bug). Files that are
NOT open trigger the hook reliably. `preToolUse:Write` (Edit) fires
regardless of editor-open state. Mitigation: per-Edit safety net stays
reliable, and the rules-file `body.md` injection includes "Even when a
file is visible to you (open in your editor, attached, in a prior
message), call aide_recall for that path" guidance so agents pick up
memories on editor-cached reads. **The mitigation is empirically
verified** — in the 4-cell file-open validation matrix
(`docs/validation/E2E_VALIDATION.md` Scenario F-fileopen, 2026-04-27),
the agent followed the rules-file bullet and called `aide_recall`
proactively in 100% of file-open reads under typical (non-adversarial)
prompts. The only failure case is when the user explicitly suppresses
aide-memory tools AND the file is open — a deliberate adversarial
scenario, documented as the floor of coverage. Filed as a feature
request candidate for upstream Cursor.

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

**Cursor** ships with aide-memory 0.5.0 at strong parity with Claude Code.
`aide-memory init` writes `.cursor/hooks.json`, `.cursor/mcp.json`, and
`.cursor/rules/aide-memory.mdc` (the last one auto-regenerates on memory
and config changes). Soft nudges reach the agent via `agent_message`,
hard blocks render branded chrome inline. The two remaining gaps are:
(a) inline visible chrome on **soft** fires (chrome lives in the Hooks
Output panel — agent context still reaches the agent), and (b) the
per-Read hook does not fire when the file is already open in the editor
pane (mitigated via per-Edit safety net + rules-file guidance). Plus
session-start delivery via rules file rather than native hook (staff-
endorsed workaround). Each gap maps to an upstream Cursor bug or feature
request tracked in [editors/cursor.md](./editors/cursor.md) — when Cursor
fixes a thread, we upgrade the adapter and remove the workaround.

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
- [editors/cursor.md](./editors/cursor.md) — hard-block + soft-via-`agent_message`,
  rules-file session context, one-turn-delay corrections, per-Read editor-open
  coverage gap, 7 bug threads
- [editors/windsurf.md](./editors/windsurf.md) — rule template only
- [editors/codex.md](./editors/codex.md) — rule template only
- [editors/copilot.md](./editors/copilot.md) — rule template only
