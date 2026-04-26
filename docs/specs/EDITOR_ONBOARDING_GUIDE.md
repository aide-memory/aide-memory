# Editor Onboarding Guide — the playbook for adding a new AI editor

**Status:** LIVING DOC (updated after each editor lands).

**Resuming Cursor onboarding work after a compaction?** Start at [`CURSOR_ONBOARDING.md`](./CURSOR_ONBOARDING.md) — its top-of-file "🛑 Resumption instructions" section tells you exactly which memory IDs to recall, what branch state to verify, and where to pick up. Do NOT rely only on priority:always auto-inject — it truncates. Explicit `aide_recall({ids: [...]})` gives you the full content.

This guide is the authoritative step-by-step for bringing a new AI-editor tool (Windsurf, Codex, Copilot, Cline, Aider, future editors) to aide-memory feature parity. It evolves — every time we onboard an editor, we come back here with what we learned and tighten the playbook.

---

## 1. Onboarding principle

**Every editor is an adapter.** aide-memory's architecture (single `HOOK_EVENTS` manifest + `EditorAdapter` interface + shared `buildHookConfig` generator — see [`CURSOR_ONBOARDING.md`](./CURSOR_ONBOARDING.md) §3) means onboarding a new editor is mostly **translation-map definition** + a deep-research pass to discover platform-specific caveats. No forking the core hook dispatcher, no duplicating generator code.

**Budget target:** ≤ 1 day of implementation per editor + 0.5-1 day of research + 0.5 day of validation = ~2 days end-to-end.

---

## 2. Step-by-step playbook

### Step 1 — Deep research (0.5-1 day)

**Single most important step.** Before writing code, do 2-3 verification research passes (general-purpose Agent) to catch platform-specific caveats before you bake wrong assumptions into the adapter.

Research questions (see `CURSOR_ONBOARDING.md` §2 for the exact template):

1. **Hooks / lifecycle events** — does the editor expose hook registration? What events (session start, pre-tool, post-tool, stop, pre-compact, pre-submit-prompt)? Input schema? Output schema? Exit codes? Config file path?
2. **MCP support** — how are MCP servers registered? Schema differences from `.mcp.json`? Tool-call display UI? Auto-approval behavior?
3. **Tool-call display** — how does the editor surface MCP tool calls? Chrome / expandable / summarized / hidden?
4. **Rules files** — file format (`.md`, `.mdc`, something else)? Frontmatter fields? Reload cadence (every turn vs session-start)? Recommended size limit?
5. **Compaction / session lifecycle** — does the editor have context compaction? Any lifecycle event for compaction? What about session start?
6. **Verbose / debug logging** — is there a debug mode? Where do hook logs go? Can users see soft-nudge content?
7. **Config / settings discovery** — where do editor-specific config files live? Project vs user scope?
8. **Known integrations / patterns** — find 2-3 real developer tools that integrate with this editor. How do they handle it? Are there community libraries?
9. **Background agents vs chat mode** — does the editor have "autonomous remote" agents (like Cursor Cloud Agents)? Do hooks + MCP work there?
10. **Limits / caveats** — what CAN'T be done via hooks? What requires a plugin/extension? What's documented-but-broken in current versions? (Search the editor's forum for open bugs filed in the last 6 months.)

**Follow-up research pass** focuses on claims that sound restrictive. "No way to do X" is suspicious — verify by:
- Searching the editor's docs for ANY mention of an alternative path.
- Searching their forum for feature requests (if users are requesting X, it likely doesn't exist).
- Searching their changelog for recent additions.
- Checking third-party blogs / community discussions for workarounds.
- Asking "does the editor have an extension / plugin API that exposes more than hooks?"

**Deliverable:** a research summary filed as `docs/specs/<EDITOR>_ONBOARDING.md` section §2 ("Platform capability deep-dive"). Cite URLs.

### Step 2 — Gap analysis (0.5 day)

Compare the editor's capabilities to Claude Code's + aide-memory's feature list. Identify:

- **What works 1:1 via hooks** (easy — translate event names + matchers).
- **What's broken / unavailable** (document the gap, pick a workaround).
- **What's different enough to need special handling** (e.g., Cursor's `beforeSubmitPrompt` is informational-only — correction detection needs a one-turn-delayed nudge path).

Deliverable: a per-editor gap table in the onboarding doc's `§1 Scope` section showing "What Cursor/Windsurf/etc. users get vs what's missing vs workarounds."

### Step 3 — Adapter implementation (~4 hours)

Create `src/memory/editors/<editor>.ts` with:

1. `id` + `displayName` + path constants (`hookConfigPath`, `mcpConfigPath`, `ruleTemplate`, `ruleDestination`).
2. `eventNameMap` — keys from `HOOK_EVENTS` → editor-specific event names (or `null` if editor doesn't support).
3. `matcherMap` — canonical matchers (`read`, `write`, `search`, `glob`, `mcp-aide-*`) → editor-specific (or `null`).
4. `wrapHookConfig(events)` — editor's top-level config shape (groups by event name, handles matcher structure).
5. `mcpConfig()` — editor's MCP registration shape (fields, interpolation tokens, protocol version).
6. `detectRuntime(env)` — tell the dispatcher "I'm running under this editor" based on env vars.
7. `translateInput(raw)` — if the editor renames stdin fields (e.g. Cursor's `conversation_id` → Claude Code's `session_id`).
8. `translateOutput(emit)` — editor's stdout shape for block/allow/silent/systemMessage. If editor has no channel for a given emit kind, return `''` (silent).

Register in `src/memory/editors/index.ts` ADAPTERS array.

### Step 4 — Rule template (~1 hour)

Create `src/templates/rules/<editor>.<ext>` (extension matches editor convention — `.mdc` for Cursor, `.md` for most others).

Start from `src/templates/rules/cursor.mdc` or `claude-code.md` as baseline. Adjust:
- Frontmatter to match editor's format.
- Note about hook-specific quirks (e.g. "Cursor uses agent_message for hook responses rather than additionalContext").
- `{{tools_list}}` + `{{contributor}}` template variables remain.

Keep under the editor's soft size limit (Cursor: ~500 lines / ~2K tokens for `alwaysApply: true` rules).

### Step 5 — Unit tests (~2 hours)

New files:
- `src/memory/editors/__tests__/<editor>-adapter.test.ts` — adapter contract tests:
  - `hookConfigPath` / `mcpConfigPath` / rule paths are correct relative-to-project paths.
  - `eventNameMap` covers every `HOOK_EVENTS` id (value can be `null` for unsupported events).
  - `matcherMap` covers every canonical matcher (value can be `null`).
  - `wrapHookConfig` + `mcpConfig` return expected shapes against golden fixtures.
  - `detectRuntime` returns true for the editor's env vars, false for others.
  - `translateInput` handles the editor's stdin shape → HookInput correctly.
  - `translateOutput` handles every emit kind correctly.

- `src/memory/hooks/__tests__/<editor>-envelope.test.ts` — dispatcher integration tests:
  - Simulate editor stdin envelope → dispatcher routes to correct handler.
  - Simulate handler emit → adapter translates to editor-specific stdout.

### Step 6 — Integration smoke (~1 hour)

Extend `scripts/hooks/__tests__/install-from-tarball.smoke.sh` to verify init generates `<editor>` files correctly in a fresh scratch directory.

Add a new dedicated smoke: `scripts/hooks/__tests__/<editor>-init-smoke.test.sh`:
- Fresh `aide-memory init` in a temp dir.
- Assert all editor-specific files created with expected structure.
- Assert each event entry has correct command + matcher.
- Assert MCP server config has correct fields.
- Assert rule file was rendered with `{{tools_list}}` / `{{contributor}}` replaced.

### Step 7 — Validation column (~0.5 day)

Add the editor as a new column in `docs/validation/E2E_VALIDATION.md`. Fill `Expected (<editor>)` entries for every scenario based on research + implementation intent.

Manually run every scenario (A-G, IDB-1..8, U1-U3, K, etc.) in the editor's local chat. Record outcomes in the runs table. Gap scenarios (e.g., Cursor's no-soft-nudge) get explicit "N/A — see §X" entries rather than blank.

Update `docs/user/supported-editors.md` feature matrix with the editor's column populated.

### Step 8 — Per-editor user doc (~2 hours)

Create `docs/user/editors/<editor>.md` following the template:
```markdown
# aide-memory in <editor>

## What you'll see
## What's different from Claude Code
## Troubleshooting
## Platform issues we're tracking
```

Bug thread numbers go in "Platform issues we're tracking" with status + impact notes. Keep the list visible so readers understand current state.

### Step 9 — Bug-tracker maintenance (weekly)

For every forum thread the adapter depends on (platform bugs, feature requests), spawn a weekly agent-task:

```
Check status of these <editor> forum threads as of today: <list>
For each, report:
- Any new staff/community post since the last check
- Is it fixed / still open / feature-request status
- Would fixing it change aide-memory's implementation?
```

When a bug gets fixed upstream:
1. Remove the workaround from the adapter.
2. Update the per-editor user doc.
3. Update the gap table in the editor's onboarding doc.
4. Regression-test in the editor.

---

## 3. Lessons learned per editor (updated after each onboarding)

### Cursor (onboarded 2026-04-__ — TBD)

**Surprise findings:**
- `preToolUse` has NO `additional_context` output field — only `permission`, `user_message`, `agent_message`, `updated_input`. No soft-nudge channel exists for pre-tool hooks.
- `sessionStart.additional_context` is broken (staff confirmed, no ETA). Workaround: regenerate `.cursor/rules/aide-memory.mdc` dynamically — rules with `alwaysApply: true` inject every turn. Staff-endorsed.
- `agent_message` is broken (regression #142589).
- `user_message` renders only on `permission: deny` — no user-visible surface for allow events.
- Extensions can't inject content into the chat stream (webview broken #115748, no chat contribution API #121400).
- `beforeSubmitPrompt` is not purely informational — DOES accept `continue` + `user_message`, but not `additional_context` or `updated_prompt`. Can block submission.
- Only 6 preToolUse matchers documented: `Shell`, `Read`, `Write`, `Grep`, `Delete`, `Task` + `MCP:<tool>`. No `Glob`, no `codebase_search`.
- MCP server has NO hot reload (#3887). Users must restart Cursor after `aide-memory init`.
- `MCP:<tool>` matcher has no server-name segment — collision risk across servers.

**What this adds to the playbook:**
- [NEW] Step 1 research MUST include a forum bug-search — Cursor had 6+ open threads affecting our integration that weren't in the official docs.
- [NEW] When researching MCP support, explicitly check hot-reload behavior — if it doesn't hot-reload, init output needs a "restart editor" reminder.
- [NEW] Don't trust blog posts / deep-dives alone; the GitButler post we relied on in pass 1 had stale "informational-only beforeSubmitPrompt" info that the follow-up pass corrected.

### Windsurf (not yet onboarded)

TBD.

### Codex (not yet onboarded)

TBD.

### Copilot (not yet onboarded)

TBD.

---

## 4. Current ADAPTERS registry

| Editor | id | State | Phase/Version |
|---|---|---|---|
| Claude Code | `claude-code` | ✅ Shipping | 0.1.0+ (reference implementation) |
| Cursor | `cursor` | 🚧 Plan approved, impl in progress | CURSOR_ONBOARDING.md Phase C1-C9, 0.5.0 |
| Windsurf | `windsurf` | 📋 Rule template exists; no adapter | Post-0.5.0 |
| Codex | `codex` | 📋 Rule template exists; no adapter | Post-0.5.0 |
| Copilot | `copilot` | 📋 Rule template exists; no adapter | Post-0.5.0 |
| Cline | `cline` | ❌ Not yet | Post-0.5.0 |
| Aider | `aider` | ❌ Not yet | Post-0.5.0 |

---

## 5. Anti-patterns to avoid

From lessons-learned:

- ❌ **Enumerating hook events per adapter.** Single `HOOK_EVENTS` manifest in `src/memory/hooks/events.ts` is the source of truth. Adapters translate, don't redeclare.
- ❌ **Assuming editor docs are complete.** Always check the forum for open bugs + feature requests. Cursor had 7 material bugs not in the main docs.
- ❌ **Trusting one source.** Third-party deep-dives go stale. Always verify against live docs + recent forum activity.
- ❌ **Inventing workarounds before checking staff recommendations.** Cursor staff explicitly pointed to rules-file regeneration for #157141 — don't invent something novel when the platform team has an endorsed answer.
- ❌ **Hiding platform gaps from users.** External docs must clearly state "X is Claude-Code-only" when it's not coverable in another editor. Don't pretend parity where none exists.
- ❌ **Scoping up via fragile workarounds.** If a feature requires emitting to `stderr`-to-Output-panel or other hacky channels that users hate, scope the feature out instead. Ship less, ship cleanly, document the gap.
- ❌ **Silent failure when an editor doesn't support an event.** `eventNameMap[id] = null` is explicit; `buildHookConfig` skips it; test asserts the skip. Never silently omit without a test.

---

## 6. Checklist (copy to a PR description or onboarding ticket)

- [ ] **Research pass 1** — general capabilities (hooks, MCP, rules, compaction, logging)
- [ ] **Research pass 2** — verify restrictive claims, check forum bugs + feature requests
- [ ] **Research pass 3** — confirm gaps are real; rule out plugin/extension paths
- [ ] `docs/specs/<EDITOR>_ONBOARDING.md` created with §1 scope table + §2 capability deep-dive + §3 bug tracker + §9 locked decisions
- [ ] `src/memory/editors/<editor>.ts` implements EditorAdapter
- [ ] Registered in `src/memory/editors/index.ts` ADAPTERS
- [ ] `src/templates/rules/<editor>.<ext>` rule template (frontmatter correct for editor)
- [ ] `src/memory/editors/__tests__/<editor>-adapter.test.ts` — adapter contract tests
- [ ] `src/memory/hooks/__tests__/<editor>-envelope.test.ts` — runtime translation tests
- [ ] `scripts/hooks/__tests__/<editor>-init-smoke.test.sh` — fresh-init integration smoke
- [ ] `install-from-tarball.smoke.sh` extended to verify editor files
- [ ] `docs/validation/E2E_VALIDATION.md` — new editor column added, every scenario filled
- [ ] Every scenario manually run in the editor's local chat; runs table updated
- [ ] `docs/user/supported-editors.md` feature matrix updated
- [ ] `docs/user/editors/<editor>.md` user doc created per template
- [ ] Bug-tracker threads listed in PHASE_0_1_VALIDATION_FOLLOWUPS.md + per-editor doc
- [ ] Weekly bug-status-check agent-task scheduled
- [ ] This file (§3) updated with "Surprise findings" + "What this adds to the playbook"
- [ ] Memory stored (`priority: "always"`) with the editor's platform capabilities + caveats

---

*End of guide. Update this doc as we learn.*
