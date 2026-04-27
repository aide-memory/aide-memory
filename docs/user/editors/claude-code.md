# aide-memory in Claude Code

Claude Code is aide-memory's **reference adapter** — every feature in the
[capability matrix](../supported-editors.md) works here as designed. New
aide-memory features are validated against Claude Code first; other
adapters follow.

## What you'll see

**At init.** `aide-memory init` creates:

- `.claude/settings.json` — hook registrations (six events: SessionStart,
  PreToolUse, PostToolUse, UserPromptSubmit, Stop, PreCompact)
- `.mcp.json` — MCP server pointing at `dist/memory/cli.js`
- `.claude/rules/aide-memory.md` — agent instructions (static template)
- `.aide/config.json` — aide-memory configuration
- `.aide/memories/` — the four layer directories
- `.ignore` and `.gitignore` entries for derived artifacts

**On first read of a file with scoped memories.** The PreToolUse hook
returns `decision: "block"` with a `reason`:

```
19 memories for src/auth/middleware.ts (5 technical, 8 area_context,
4 preferences, 2 guidelines) — topics: JWT, middleware, validation.
Call aide_recall if results not already in this conversation.
```

Plus an inline branded status line via `systemMessage`:

```
aide-memory · prompting aide_recall for scoped memories (expected flow)
```

The agent calls `aide_recall({paths: [...]})`, the PostToolUse hook records
the recalled memory IDs in `.aide/cache/recalled-paths-<sid>.txt`, and the
agent retries the read. The block is one-time-per-path-per-session.

**On re-read of the same path.** The tracking file prevents the block.
The hook emits a soft nudge via `hookSpecificOutput.additionalContext` if
there is anything new worth mentioning, otherwise silent. No ceremony.

**When the agent calls `aide_recall`.** Standard Claude Code tool-call
chrome: you see the request, the response, and whatever the agent
summarizes. The branded `aide-memory · …` status line is reserved for
hook fires, not MCP tool calls.

**When you type a correction.** Patterns like "no, use X instead", "don't
do that", "actually…" trip the UserPromptSubmit hook. It injects a nudge
via `hookSpecificOutput.additionalContext`:

```
BEFORE doing anything else, store this correction via aide_remember
with layer=preferences and scope=<current area>. Confirm after storing.
```

The agent calls `aide_remember` **in the same turn**, before getting to
the rest of your message.

**When a session starts.** The SessionStart hook runs
`hookSpecificOutput.additionalContext` with the top-N preferences +
guidelines + priority-always memories (bounded by `injection.maxChars`,
default 1200). Plus a visible status line:

```
aide-memory · injected N memories at session start
```

The same hook re-fires after context compaction, so the agent gets its
preferences back automatically.

**When the agent finishes a turn.** The Stop hook prompts:

```
Anything worth remembering? Call aide_remember if this turn produced
a decision, correction, or non-obvious finding.
```

The agent decides — and if warranted, stores before ending the turn.

## What's different from other editors

Claude Code is the platform we design against. Every other editor's
integration is an exercise in mapping aide-memory's canonical events and
matchers to what that editor can actually do.

Compared to Cursor (0.5.0, ~80% parity):

- **Soft-context channel.** Both editors expose a soft channel — Claude
  Code via `hookSpecificOutput.additionalContext` on PreToolUse, Cursor
  via `agent_message` on `permission: "allow"`. The agent receives the
  same payload on every soft fire in either editor. The difference is
  user-visible chrome (next bullet).
- **Inline branded chrome.** Claude Code's `systemMessage` field renders
  branded `aide-memory · …` lines inline in chat for both hard and soft
  fires. Cursor renders inline chrome on hard-block (`permission: "deny"`)
  reliably, but `user_message` on soft fires (`permission: "allow"`)
  lives in the Hooks Output panel rather than chat. Agent context still
  reaches the agent in both cases; only user-visible soft chrome differs.
- **Per-Read coverage.** Claude Code's PreToolUse fires for every Read.
  Cursor 3.2.11's `preToolUse:Read` does NOT fire when the target file
  is already open in the editor pane (verified empirically 2026-04-27).
  The per-Edit safety net is unaffected, and the rules-file injection
  guides agents to call `aide_recall` on editor-cached reads.
- **SessionStart context injection** is native in Claude Code. Cursor's
  `sessionStart.additional_context` is broken upstream, so aide-memory
  delivers the same content via a regenerated `alwaysApply: true` rules
  file (Cursor staff's endorsed workaround).
- **In-turn correction detection.** Claude Code's UserPromptSubmit
  injects the "store this" nudge in-turn. Cursor's `beforeSubmitPrompt`
  cannot inject context, so the reminder arrives one turn later on the
  next Stop hook via `followup_message`.
- **Glob matcher coverage.** Claude Code fires PreToolUse for both Grep
  and Glob. Cursor has no Glob matcher; only Grep triggers.

See [editors/cursor.md](./cursor.md) for the full Cursor gap list, and
[supported-editors.md](../supported-editors.md) for the matrix.

## Troubleshooting

**Hook not firing.** Verify `.claude/settings.json` contains a `hooks`
key with aide-memory scripts wired to each event. If it is missing or
looks stale, run `aide-memory init --force` to re-install.

**MCP tool calls failing.** Check that `.mcp.json` exists at the project
root and points at a current `dist/memory/cli.js`. If you just ran
`aide-memory init`, restart Claude Code so it picks up the new MCP
config (Claude Code re-reads `.mcp.json` on restart, not live).

**"PreToolUse hook returned blocking error" text looks alarming.** The
red-error wording around our `decision: "block"` is hardcoded in Claude
Code's TUI and cannot be customized. Our accompanying `systemMessage`
("aide-memory · prompting aide_recall…") is the reassurance line — the
block is the expected flow, not a failure.

**Hook runs but agent doesn't call aide_recall.** Check the
`.claude/rules/aide-memory.md` file is present and up-to-date. If the
agent has strayed from the instructions, a `aide-memory init --update-rules`
re-writes the rule file to the canonical template.

**Session-start injection seems empty.** Check `injection.enabled`
(default `true`) and the per-layer knobs (`injection.preferences`,
`injection.guidelines`). `aide-memory config list` dumps the full
config. See [configuration.md](../configuration.md).

**Personal vs shared preferences.** `aide_remember` accepts a `shared`
parameter (`true` writes to `preferences/shared/`, committed; `false`
writes to `preferences/personal/`, gitignored). When the agent omits it,
the default comes from `memories.defaultShared` in `.aide/config.json`
(default `true` so new prefs are team-visible by default). Flip with
`aide-memory config memories.defaultShared false` if you'd rather have
new prefs default to personal/private. Per-call `shared: true|false`
always overrides this default.

## Platform capabilities we depend on

- **`decision: "block"` + `reason`** — hard-block a file read until the
  agent calls `aide_recall`.
- **`hookSpecificOutput.additionalContext`** — inject dynamic context
  into the agent's next turn (soft nudge, session-start content,
  correction reminder).
- **`systemMessage` top-level field** — branded inline status lines
  visible to the user in the chat transcript.
- **MCP stdio transport** — the aide-memory CLI runs as an MCP server
  over stdio, communicating with Claude Code's MCP client.

No platform bugs currently block us on Claude Code. If Anthropic ships a
breaking change to hook output shape, aide-memory treats it as a P0.
