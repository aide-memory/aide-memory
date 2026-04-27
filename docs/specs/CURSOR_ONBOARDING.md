# Cursor Onboarding — bringing Cursor to ~80% Claude Code parity

## 🛑 Resumption instructions (read this FIRST if you're a fresh session)

If you are starting this work after a context compaction or a new session, **do this before doing anything else:**

1. Call `aide_recall({ids: [328, 329, 330, 331, 332, 333, 334]})` to load the 7 memories capturing all locked decisions from the planning session (Cursor hook I/O semantics, user's 10 directives, operational quirks, rejected/chosen approaches, refinement round 2, cross-cutting insights, pre-compaction state). These are also stored as `priority: "always"` for auto-inject, but the explicit recall ensures you get full content without truncation.
2. Also call `aide_recall({ids: [314]})` for the 10-step pre-ship validation sequence every code-changing phase must run.
3. Read this document end-to-end. It's ~600 lines; takes ~2 minutes.
4. Read [`EDITOR_ONBOARDING_GUIDE.md`](./EDITOR_ONBOARDING_GUIDE.md) end-to-end (~200 lines).
5. Run `git status` + `git log --oneline -5` to confirm branch state. Plan expects: branch `feature/phase-1` at 0.4.3 release HEAD (commit `9858236` or similar). No Cursor-specific code yet.
6. Create `feature/phase-1-cursor-support` off `feature/phase-1` before beginning Phase C1.
7. Begin Phase C1 per §6. No additional user input needed to start — all decisions locked.

**Why both explicit recall AND priority:always?** priority:always memories auto-inject at SessionStart, but they compete for `injection.maxChars=1200` budget with preferences/guidelines and may truncate when there are many priority:always entries. Explicit `aide_recall({ids})` sidesteps the cap and guarantees full content.

---

**Status:** PLAN v2 (2026-04-23). Scoped to what Cursor reliably supports today + documented gaps for what it doesn't. Revised after 3 verification research passes confirmed platform limitations are real.

**Phase status (2026-04-27 — 0.5.0 ship-ready):**
- **C1–C6 COMPLETE** — adapter scaffolding, shared-rules, runtime dispatcher, envelope translation, dynamic rules-file regen, correction one-turn-delay flow, all bash smoke + unit tests green. See memory #336 + handoff `docs/sessions/HANDOFF_APRIL27_AUDIENCE_MAPPING_AND_READ_GAP.md`.
- **C7–C8 (docs)** — IN PROGRESS as of 2026-04-27: this doc + `docs/validation/E2E_VALIDATION.md` + `docs/user/editors/cursor.md` updated to reflect verified findings. `docs/user/supported-editors.md` capability matrix update pending.
- **C9 (release 0.5.0)** — pending docs closeout + commit split.
- **0.5.0 critical adapter fixes (2026-04-27):**
  - **libsql migration** (memory #354) — eliminated the Node ABI mismatch bug class that originally surfaced as "Cursor doesn't honor permission:deny" but was actually our better-sqlite3 binding silently failing across Node majors.
  - **Audience-mapping translateOutput v3.1** (memory #358 + #359) — Cursor `preToolUse` HAS `agent_message` (soft) + `user_message` (chrome). The earlier "no soft channel" assertion was an adapter bias bug, fixed.
  - **Per-Read editor-open coverage gap** (memory #363) — discovered + documented + mitigated via `body.md` rules-file injection. Verified empirically.
  - **Templates path-resolution bug** — `__dirname/../...` math broke in esbuild bundle; fixed via `src/memory/internal/paths.ts` package.json walk-up.
  - **Diagnostic surface** — `AIDE_DEBUG=hooks|mcp|binding|recall|all` env + `loudError()` always-on stderr for failure surfacing. Memory #355.
- **preToolUse:Read vs beforeReadFile decided** — `pre-read` routes to `preToolUse` matcher=Read (NOT beforeReadFile). Confirmed via deep research 2026-04-23: agent_message support, open beforeReadFile deny-bug #150520, "first hook per event" quirk all point to preToolUse. Rationale captured inline in `src/memory/editors/cursor.ts`. Reconfirmed during 2026-04-27 verification — `beforeReadFile`-as-tracking-fallback was analyzed + rejected (would corrupt encountered-state semantic).
- **Shared-rules scope nuance** — `src/templates/rules/shared/body.md` is now canonical source (per-editor body unification shipped). Claude Code rendered output byte-identical to pre-refactor. Cursor.mdc gains detail (benign — inherits fuller body, all Cursor-specific nuance preserved via adapter fields). Bonus: fixed silent drift where the 3 compressed templates claimed `aide_forget` supports archive mode. New 2026-04-27: added "Even when a file is visible to you, call aide_recall — UNLESS already recalled this session" bullet to mitigate the per-Read editor-open gap.



**Related docs:**
- [`EDITOR_ONBOARDING_GUIDE.md`](./EDITOR_ONBOARDING_GUIDE.md) — evolving playbook for onboarding any new editor (Cursor, Windsurf, Codex, Copilot, Cline, Aider). Updated after each new editor lands.
- [`PHASE_0_1_SPEC.md`](./PHASE_0_1_SPEC.md) P1.9, P1.17 — unblocked by this plan.
- [`PHASE_0_1_VALIDATION_FOLLOWUPS.md`](./PHASE_0_1_VALIDATION_FOLLOWUPS.md) — 7 tracked Cursor bug threads + plugin-marketplace follow-ups.
- [`VALIDATION_HOOK_VISIBILITY.md`](./VALIDATION_HOOK_VISIBILITY.md) — the hook-visibility work we shipped in 0.4.x.
- The new consolidated validation doc replacing MANUAL_E2E + PHASE_1_RESULTS + per-scenario follow-ups (see §7).

---

## 1. Scope — honest about what we ship

**Goal: 0.5.0 ships Cursor at ~80% parity with Claude Code. Clear docs on the 20% gap. Ship when validation passes; 1.0 comes after real-user soak.**

> **Status update 2026-04-27** (per memories #358, #359, #363) — the gap
> table below was originally written under an adapter-bias bug. Empirical
> verification on Cursor 3.2.11 found that:
>
> 1. **Cursor's `preToolUse` HAS a soft-context channel** —
>    `agent_message` is the equivalent of Claude Code's `additionalContext`.
>    The earlier "no soft channel" assertion was our adapter not using a
>    field that was always available. Fixed in adapter v3.1
>    (audience-mapping). See `src/memory/editors/cursor.ts` `translateOutput`.
> 2. **Cursor `permission:"deny"` honors `user_message` for chat-visible
>    chrome AND `agent_message` for agent-context.** We now emit both fields
>    on every deny.
> 3. **NEW gap discovered (replaces the old "no soft channel" gap):**
>    `preToolUse:Read` does NOT fire when the file is already open in the
>    Cursor editor pane — the per-Read hard-block + soft-nudge safety net
>    has a coverage hole when the user has the file open. Verified
>    empirically. `preToolUse:Write` (Edit) fires reliably regardless.
>    Mitigated by: per-Edit safety net + rules-file injection
>    (`src/templates/rules/shared/body.md` "Even when a file is visible to
>    you, call aide_recall" bullet, added 2026-04-27).
>
> The §1 table below has been updated. Sections §3.3 + §5 carry the same
> correction.

### What Cursor users WILL get (confident)

- `aide-memory init` generates `.cursor/hooks.json` + `.cursor/mcp.json` + `.cursor/rules/aide-memory.mdc` (already working) alongside the existing Claude Code files.
- Hard-block on first read/edit of a file with scoped memories (`permission: "deny"` + `user_message` — equivalent to Claude Code's `decision: "block"`).
- MCP tool surface: `aide_recall`, `aide_remember`, `aide_update`, `aide_forget`, `aide_search`, `aide_memories`, `aide_import` all work.
- Stop-hook reflection nudges via `followup_message`.
- Passive tracking (postToolUse writes to `.aide/cache/recalled-paths-{sid}.txt` etc.).
- Dynamic session-start context via **regenerated `.cursor/rules/aide-memory.mdc`** — rules reload every turn with `alwaysApply: true`, so top-N preferences + guidelines bake into the file at init/config-change time and inject on every turn. **This is Cursor staff's officially-endorsed workaround** for the broken `sessionStart.additional_context` bug (forum #157141, #158452).
- Correction detection via `beforeSubmitPrompt` — detects correction patterns, writes `correction-pending-{sid}.txt` flag, next Stop hook delivers the "correction wasn't stored" prompt. (Detection fires immediately; user-visible nudge arrives one turn later.)

### What Cursor users will NOT get (documented gaps)

| Gap | Why | Claude Code alternative | Cursor behavior |
|---|---|---|---|
| ~~Soft-nudge `additionalContext` on re-reads~~ | ~~`preToolUse` output has NO `additional_context` field~~ — **CORRECTED 2026-04-27**: Cursor's `preToolUse` HAS `agent_message` for soft context; we now emit `{permission:"allow", agent_message:<reason>, user_message:<chrome>}`. Was an adapter bias bug, not a platform gap. | CC shows "N memories for path… call aide_recall" as a non-blocking nudge after first recall | **PASSES** — soft path delivered via `agent_message` (verified empirically). |
| **Per-Read hook does not fire when file is open in editor pane** (NEW 2026-04-27) | Verified empirically (memory #363): when the target file is already open in the Cursor editor, `preToolUse:Read` does NOT fire. Cause unverified — could be editor-cache content serving, design, or bug. Filed as feature request candidate. `preToolUse:Write` fires regardless. | CC's Read tool always agent-mediated; hook always fires. | Hard-block coverage gap when user has file open. **Mitigation empirically verified** (memory #364, 4-cell matrix 2026-04-27): rules-file `body.md` bullet ("Even when a file is visible to you, call aide_recall") makes the agent call `aide_recall` proactively in 100% of file-open reads under typical prompts. Floor of coverage = file open AND user explicitly suppresses aide-memory tools — adversarial scenario only. |
| Inline "aide-memory · …" branded status (under `permission:"allow"`) | `user_message` under allow is logged in the Hooks output panel but does NOT render in Cursor 3.2.11 chat (only renders inline on `permission:"deny"`). We keep emitting `user_message` on allow for forward-compat. ANSI escapes stripped for Cursor. | CC shows branded status inline on every fire (block + soft) with ANSI color | Cursor shows chrome inline ONLY on hard-block (`permission:"deny"`). On soft (allow), chrome lives in the Hooks output panel; agent context is delivered via `agent_message` so the user-doesn't-see-it doesn't break the safety net. |
| Dynamic SessionStart context via hook | `sessionStart.additional_context` broken — staff confirmed "no workaround" (#158452, #157141) | CC injects top-15 prefs + guidelines as context at session start | Rules file reads every turn with `alwaysApply: true` — we regenerate it with current content so agent sees the same data, just via a different channel |
| `Glob` + `codebase_search` nudge coverage | Cursor docs list matchers `Shell, Read, Write, Grep, Delete, Task, MCP:<tool>` only (no `Glob`, no `Search`, no `codebase_search`) | CC fires `PreToolUse` with matcher=Grep OR Glob | Only `Grep` triggers aide-memory search nudge in Cursor; Glob + semantic search go uncovered |
| `beforeSubmitPrompt` in-turn correction nudge | Event accepts only `continue`+`user_message` — no context injection | CC's `UserPromptSubmit` injects "store this correction" nudge in-turn | Correction flag still gets written; user-visible nudge delivered next turn via Stop |

**All gaps are documented in external docs (§8). No fragile workarounds that break when Cursor fixes bugs.**

---

## 2. Cursor bug tracker — 7 threads we depend on

When any of these get fixed, we upgrade Cursor support + remove a workaround. Checked weekly per the onboarding-guide protocol.

| Thread | Status (2026-04-23) | Impact if fixed |
|---|---|---|
| [#158452](https://forum.cursor.com/t/sessionstart-hook-additional-context-is-never-injected-into-agents-initial-system-context/158452) `sessionStart.additional_context` dropped | Staff-confirmed, **"no workaround"**, no ETA | Switch SessionStart from rules-file regeneration to native hook injection |
| [#157141](https://forum.cursor.com/t/sessionstart-hook-output-is-accepted-and-merged-but-the-injected-context-does-not-reach-agent-window/157141) related sessionStart bug | Staff-confirmed race condition | Same as #158452 |
| [#158168](https://forum.cursor.com/t/posttooluse-hooks-additional-context-not-injected-into-agent-model-context/158168) `postToolUse.additional_context` not injected | Staff-confirmed TODAY (2026-04-23), no ETA | Post-tool-use context injection becomes usable |
| [#138691](https://forum.cursor.com/t/include-mcp-server-name-as-part-of-the-payload-for-beforemcpexecution-cursor-hook/138691) MCP server name in matcher | Feature request, no staff response | Disambiguate aide-memory's `aide_recall` from other servers' same-named tools |
| [#157231](https://forum.cursor.com/t/add-additional-context-to-beforesubmitprompt-hook-output/157231) `additional_context` on `beforeSubmitPrompt` | Feature request, no staff response | Deliver correction-detection nudge in-turn (eliminate one-turn delay) |
| [#153966](https://forum.cursor.com/t/no-mechanism-to-trigger-hooks-or-inject-messages-into-cursor-when-agent-is-idle/153966) idle-trigger hook | Feature request | Enables cross-session memory propagation to running Cursor sessions |
| [#158873](https://forum.cursor.com/t/sessionstart-hook-should-fire-after-compact/158873) `sessionStart` after compact | Feature request | Re-inject context after compaction (currently rules-file-only fills this gap) |

**Extra quirks worth tracking** (not bugs per se, but behavior we design around):
- MCP server NO hot reload ([#3887](https://github.com/cursor/cursor/issues/3887), [#55723](https://forum.cursor.com/t/refresh-mcp-server-via-command/55723)) — users must restart Cursor after `aide-memory init` or version upgrade. Document in init output.
- MCP tool list needs manual toggle to refresh ([#122421](https://forum.cursor.com/t/mcp-tool-list-only-updates-after-manually-toggling-server-off-on/122421)).
- Disabled MCP servers re-enable on restart ([#141009](https://forum.cursor.com/t/disabled-mcp-servers-become-enabled-after-each-restart/141009)).
- MCP orphan process leak ([#156478](https://forum.cursor.com/t/mcp-process-leak-orphaned-children-on-restart/156478)) — aide-memory should have PID-file cleanup in server startup.
- **Only first hook in array executes** ([#141996](https://forum.cursor.com/t/cursor-hooks-bug-multiple-hooks-in-array-only-execute-first-hook/141996)) — if another tool shares `.cursor/hooks.json`, its hooks may silently not run. Init should warn on collision.
- `AskUserQuestion` tool doesn't trigger hooks ([#152230](https://forum.cursor.com/t/askquestion-tool-does-not-trigger-cursor-hooks/152230)).
- `beforeReadFile` vs `preToolUse` matcher=Read — ordering/co-firing unspecified; empirical test needed.

---

## 3. Architecture — single-source-of-truth hook manifest

### 3.1 Why this architecture (user directive #2)

Earlier draft: each editor adapter enumerated events + matchers in its `hookConfig()` method. Adding a new hook = updating every adapter (~20 lines each).

**Better:** a single `HOOK_EVENTS` const is the authoritative list of aide-memory's hook events. Every adapter reads from it and provides only **editor-specific translations** (event-name, matcher-name). Adding a hook = append one manifest entry + every adapter picks it up automatically.

### 3.2 The manifest

**New file: `src/memory/hooks/events.ts`**

```ts
export interface HookEvent {
  /** aide-memory's internal name (dispatcher handler key). */
  id: 'pre-read' | 'pre-edit' | 'pre-search' | 'pre-prompt' | 'pre-recall'
    | 'post-tool-use-recall' | 'post-remember' | 'post-search'
    | 'stop' | 'pre-compact' | 'session-start';

  /** What aide-memory does at this event. */
  purpose: string;

  /** Default timeout in seconds. */
  timeout: number;

  /** True if this event needs a tool matcher. */
  hasMatcher: boolean;

  /**
   * Canonical matcher tokens for aide-memory. Each editor adapter maps these
   * to its own matcher vocabulary in `matcherMap`.
   */
  matchers?: Array<'read' | 'edit' | 'write' | 'search' | 'glob'
    | 'mcp-aide-recall' | 'mcp-aide-remember' | 'mcp-aide-update'
    | 'mcp-aide-forget' | 'mcp-aide-search'>;
}

export const HOOK_EVENTS: HookEvent[] = [
  { id: 'session-start', purpose: 'Inject top-N preferences + guidelines at session start', timeout: 10, hasMatcher: false },
  { id: 'pre-compact',   purpose: 'Clear session tracking before compaction',               timeout: 30, hasMatcher: false },
  { id: 'stop',          purpose: 'Reflection nudge on schedule + correction-pending flag', timeout: 30, hasMatcher: false },
  { id: 'pre-prompt',    purpose: 'Detect correction/decision/preference in user prompt',   timeout: 5,  hasMatcher: false },
  { id: 'pre-read',      purpose: 'Block/soft on file read with scoped memories',           timeout: 10, hasMatcher: true,
    matchers: ['read'] },
  { id: 'pre-edit',      purpose: 'Block/soft on file edit with scoped memories',           timeout: 10, hasMatcher: true,
    matchers: ['edit', 'write'] },
  { id: 'pre-search',    purpose: 'Nudge aide_search when matching memories exist',         timeout: 10, hasMatcher: true,
    matchers: ['search', 'glob'] },
  { id: 'pre-recall',    purpose: 'Track paths on aide_recall pre-tool-use',                timeout: 5,  hasMatcher: true,
    matchers: ['mcp-aide-recall'] },
  { id: 'post-tool-use-recall', purpose: 'Record recalled ids post-tool-use',               timeout: 5,  hasMatcher: true,
    matchers: ['mcp-aide-recall'] },
  { id: 'post-remember', purpose: 'Clear correction-pending flag on aide_remember/update/forget', timeout: 5, hasMatcher: true,
    matchers: ['mcp-aide-remember', 'mcp-aide-update', 'mcp-aide-forget'] },
  { id: 'post-search',   purpose: 'Mark query as searched post aide_search',                 timeout: 5, hasMatcher: true,
    matchers: ['mcp-aide-search'] },
];
```

### 3.3 Editor adapter — translation-only

**Each adapter provides ONLY the editor-specific translation maps.** The heavy lifting (iterating events, generating config shape) is done by a shared `buildHookConfig(adapter, events)` function.

```ts
export interface EditorAdapter {
  id: 'claude-code' | 'cursor' | 'windsurf' | ...;
  displayName: string;

  // File destinations
  hookConfigPath: string;    // '.claude/settings.json' | '.cursor/hooks.json'
  mcpConfigPath: string;     // '.mcp.json' | '.cursor/mcp.json'
  ruleTemplate: string;      // 'claude-code.md' | 'cursor.mdc'
  ruleDestination: string;   // '.claude/rules/aide-memory.md' | ...

  // Event -> editor-specific name. Keys are HOOK_EVENTS ids; values are
  // editor-specific event names. Null means "editor doesn't support this
  // event - skip silently."
  eventNameMap: Record<HookEvent['id'], string | null>;

  // Canonical matcher -> editor-specific matcher. Null means "editor has no
  // matcher for this tool type - skip silently."
  matcherMap: Record<NonNullable<HookEvent['matchers']>[number], string | null>;

  // Top-level config-file shape
  wrapHookConfig(events: ResolvedEvent[]): object;

  // MCP config file shape (slight schema differences per editor)
  mcpConfig(opts: { cliEntry: string; serverEntry: string; projectRoot: string }): object;

  // Runtime translation (stdin/stdout envelope differences)
  detectRuntime?: (env: NodeJS.ProcessEnv) => boolean;
  translateInput?: (raw: unknown) => HookInput;
  translateOutput?: (emit: HookEmit) => string;
}
```

**CursorAdapter example** (skeleton — full in src/memory/editors/cursor.ts):

```ts
export const cursorAdapter: EditorAdapter = {
  id: 'cursor',
  displayName: 'Cursor',
  hookConfigPath: '.cursor/hooks.json',
  mcpConfigPath: '.cursor/mcp.json',
  ruleTemplate: 'cursor.mdc',
  ruleDestination: '.cursor/rules/aide-memory.mdc',

  eventNameMap: {
    'session-start': 'sessionStart',
    'pre-compact':   'preCompact',
    'stop':          'stop',
    'pre-prompt':    'beforeSubmitPrompt',
    'pre-read':      'beforeReadFile',
    'pre-edit':      'preToolUse',
    'pre-search':    'preToolUse',
    'pre-recall':    'preToolUse',
    'post-tool-use-recall': 'postToolUse',
    'post-remember': 'postToolUse',
    'post-search':   'postToolUse',
  },

  matcherMap: {
    'read':  'Read',
    'edit':  'Write',
    'write': 'Write',
    'search':'Grep',
    'glob':  null,     // Cursor has no Glob matcher
    'mcp-aide-recall':   'MCP:aide_recall',
    'mcp-aide-remember': 'MCP:aide_remember',
    'mcp-aide-update':   'MCP:aide_update',
    'mcp-aide-forget':   'MCP:aide_forget',
    'mcp-aide-search':   'MCP:aide_search',
  },

  wrapHookConfig(events) { return { version: 1, hooks: groupByEvent(events) }; },

  mcpConfig({ serverEntry }) {
    return {
      mcpServers: {
        'aide-memory': {
          type: 'stdio',
          command: 'node',
          args: [serverEntry, '${workspaceFolder}'],
        },
      },
    };
  },

  detectRuntime(env) { return Boolean(env.CURSOR_PROJECT_DIR && !env.CLAUDECODE); },
  translateInput(raw) { /* conversation_id -> session_id, workspace_roots[0] -> cwd, etc */ },
  translateOutput(emit) {
    // ⚠ HISTORICAL SKELETON. The original draft (below as comments) reflected
    // the bias bug corrected 2026-04-27 (memory #358). The actual adapter in
    // `src/memory/editors/cursor.ts` uses AUDIENCE-MAPPING (v3.1):
    //
    //   - block (preToolUse:deny): { permission:"deny",
    //       user_message: <chrome>,    // chat-visible
    //       agent_message: <reason> }  // agent-context (was `decision:block` reason on CC)
    //
    //   - additionalContext (preToolUse:allow): { permission:"allow",
    //       agent_message: <context>,  // agent receives the soft nudge
    //       user_message: <chrome> }   // logged in Hooks panel; not currently
    //                                  //   chat-rendered under allow on Cursor 3.2.11
    //                                  //   but kept for forward-compat
    //
    //   - stop: { followup_message: "<chrome> — <reason>" }  // chrome prefixed
    //                                                        //   inline because
    //                                                        //   Cursor stop only
    //                                                        //   accepts one field
    //
    //   - userPromptSubmit (deny path): { continue: false, user_message: <reason> }
    //   - silent / systemMessage standalone: ""
    //
    // ANSI escape codes are stripped for Cursor (Cursor doesn't render terminal
    // ANSI like Claude Code does). See cursor-envelope.test.ts for the full
    // matrix (35 tests covering audience-mapping + ANSI strip + stop chrome).
    //
    // ORIGINAL bias-bug skeleton (kept as historical reference):
    // switch (emit.kind) {
    //   case 'block':            return JSON.stringify({ permission: 'deny', user_message: emit.reason });
    //   case 'additionalContext': return '';  // ← WRONG: agent_message exists; use it
    //   case 'systemMessage':    return '';   // ← partially-right: no anchored render path under allow
    //   case 'silent':           return '';
    // }
  },
};
```

### 3.4 Init orchestration

`src/memory/init.ts` loops through `ADAPTERS`, calling `buildHookConfig(adapter, HOOK_EVENTS)` + `adapter.mcpConfig()` + `buildRules(adapter, SHARED_TEMPLATES)` for each. Adding a new editor = register it in `ADAPTERS` — done.

### 3.5 Shared rules + shared MCP refactor (part of Phase C1, NOT a follow-up)

**Today:** each editor has a near-duplicate rule template in `src/templates/rules/<editor>.<ext>` — 5 files to keep in sync when tool-use guidance changes. MCP config is similar — each adapter's `mcpConfig()` has mostly-identical content with per-editor envelope quirks.

**After C1 refactor:**

```
src/templates/rules/
  ├── shared/
  │   ├── body.md              (identical tool-use guidance across editors — ONE file)
  │   ├── layer-guidance.md    (preferences/technical/area_context/guidelines — when to use)
  │   └── _editor-notes.md.hbs (template with editor-specific caveat inserts)
  └── editors/
      ├── claude-code.frontmatter
      ├── cursor.frontmatter        (alwaysApply: true, globs: **/*)
      ├── codex.frontmatter
      ├── copilot.frontmatter
      └── windsurf.frontmatter
```

`buildRules(adapter) = frontmatter + sharedBody + layerGuidance + editorNotes(adapter)`. One change to `shared/body.md` → all 5 editor rules updated.

MCP config follows the same pattern:

```ts
const MCP_SERVER = { command: 'node', serverEntry: 'dist/memory/cli.js' };

claudeCodeAdapter.mcpConfig() = {
  mcpServers: { 'aide-memory': { command: 'node', args: [path, absProjectRoot] } }
};
cursorAdapter.mcpConfig() = {
  mcpServers: { 'aide-memory': { type: 'stdio', command: 'node', args: [path, '${workspaceFolder}'] } }
};
```

**Testing (C1 gate):** golden-fixture tests (`src/memory/editors/__tests__/<editor>-rules.test.ts` + `<editor>-mcp.test.ts`) assert byte-level equivalence with checked-in fixtures. Phase C1 gate: post-refactor byte-matches pre-refactor output for every existing editor (claude-code, cursor, codex, copilot, windsurf). Zero behavior change.

---

## 4. Dynamic rules-file regeneration (session-start workaround)

**Staff-endorsed workaround** for broken `sessionStart.additional_context` (forum #157141).

### 4.1 Behavior

- On `aide-memory init`, on subsequent `aide-memory config` changes, and on memory writes affecting session-start content, regenerate `.cursor/rules/aide-memory.mdc`.
- Rules file has `alwaysApply: true` — injected on every agent turn — no tool-call trigger needed, no broken hook involved.
- Content baked in: top-N preferences (sorted by `recalled_count desc, updated_at desc`), all guidelines, priority-always memories. Same data Claude Code's SessionStart handler injects.

### 4.2 Token budget

Cursor community best-practice: keep cumulative `alwaysApply: true` content under ~2K tokens or agent response quality degrades.

- `injection.preferences: 15` (default) × ~30 tokens = ~450 tokens
- All guidelines (typical 5-15) × ~20 tokens = ~100-300 tokens
- Priority-always memories (typical 0-3) × ~50 tokens = 0-150 tokens
- Static section headers + formatting ~100 tokens
- **Total ~650-1000 tokens** — under budget.

`injection.maxChars` already caps combined session-start text at 1200 chars. Rules-file generation respects the same cap.

### 4.3 Regeneration triggers

Files rewritten on:
1. `aide-memory init` + `--force` + `--update-rules` — fresh generation.
2. `aide-memory config <key> <value>` when key affects session-start content (injection.*, memories.softening.threshold).
3. `aide_remember` / `aide_update` / `aide_forget` when the memory is priority:"always" OR in preferences/guidelines layer.
4. `aide-memory sync import`.

Regeneration is fire-and-forget (same pattern as drift-repair). If user has Cursor running, the next agent turn picks up the new rules file automatically.

### 4.4 Graceful upgrade path when Cursor fixes #158452

When `sessionStart.additional_context` is fixed:
- CursorAdapter's `translateOutput({kind: 'additionalContext', event: 'sessionStart', ...})` starts emitting `{additional_context: ...}`.
- Rules-file content narrows to static guidance (goes back to shipping as a template, not regenerated).
- Remove the `.gitignore` entry + header comment. Remove the file from user projects via `aide-memory init --update-rules`.
- Zero user impact — same content, different channel.

### 4.5 The regenerated rules file is git-ignored

Because `.cursor/rules/aide-memory.mdc` is a derived artifact (content regenerates from the SQLite store + `.aide/config.json`), it's treated like `.aide/cache/*.txt` — not canonical content, not committed.

**`aide-memory init` adds to `.gitignore`:**

```gitignore
# aide-memory: autogenerated Cursor rules (workaround for Cursor bug #157141 —
# sessionStart.additional_context not injected into agent context). Regenerates
# on aide-memory init + config change + memory write affecting session-start
# content (preferences, guidelines, priority-always). Safe to delete;
# will be regenerated on next aide-memory run. Remove this entry + stop regen
# once Cursor fixes the upstream bug.
.cursor/rules/aide-memory.mdc
```

**File header (inside the generated `.mdc`):**

```markdown
---
description: AIDE Memory — persistent context for AI coding agents (AUTOGENERATED)
globs: **/*
alwaysApply: true
---

<!-- AUTOGENERATED by aide-memory. Do not edit by hand — changes will be
     overwritten on the next regeneration trigger.

     This file is a workaround for Cursor bug #157141
     (https://forum.cursor.com/t/sessionstart-hook-output-is-accepted-and-merged-but-the-injected-context-does-not-reach-agent-window/157141).
     When Cursor fixes native sessionStart context injection,
     aide-memory will narrow this file back to a static template
     + stop regenerating it. -->

# aide-memory...
```

**External-doc treatment** (`docs/user/editors/cursor.md`): plain-language explanation of why the file is gitignored + why it regenerates + when it'll stop regenerating.

### 4.6 Multi-session behavior

One rules file per project, shared across all Cursor sessions. Because Cursor reads rules every turn (alwaysApply: true), ALL concurrent sessions on the project read the same current content on their respective next turns. No per-session file; no divergence.

**Scenario:** Session A adds a memory → regen fires → file updated. On Session A's next turn it reads updated rules. On Session B's next turn (happens whenever) it reads the same updated rules. Both sessions converge on current store state.

**Atomic write during regen:** `rulesGen.ts` writes to `.cursor/rules/aide-memory.mdc.tmp` then `fs.rename()` to the final path. Rename is atomic on POSIX. Zero chance of torn read even under concurrent writers from parallel `aide_remember` invocations.

**Token-budget cost:** file is injected every turn. Keeping it under `injection.maxChars=1200` means ~300 tokens added per turn, per session. Community soft-cap across ALL `alwaysApply: true` rules is ~2000 tokens. `aide-memory init` will warn if cumulative alwaysApply content across `.cursor/rules/*.mdc` exceeds this — user's pre-existing rules might need adjustment.

### 4.7 Regeneration vs injection — two different costs, don't conflate

Easy to confuse. Spelled out:

| Event | When | Computational cost | Token cost |
|---|---|---|---|
| **Regeneration** (aide-memory writing to `.mdc` on disk) | Only on memory/config changes — maybe 5-20 times per session | Microseconds (SQLite read + template render + atomic write) | — |
| **Injection** (Cursor reading the `.mdc` + including it in system prompt) | EVERY TURN in EVERY session — platform behavior | — | ~300 tokens/turn at `injection.maxChars=1200` |

**Regen cost is trivial** — runs on user's local machine, <10ms per fire, <0.5s total per session at 50 regens. Zero user-observable lag.

**Injection cost IS real** but:
- It's Cursor's `alwaysApply: true` rules-engine behavior — would happen with ANY tool using `alwaysApply: true` rules, not just aide-memory.
- Bounded by `injection.maxChars` (default 1200 = ~300 tokens).
- Cacheable via Anthropic's prompt cache — steady-state sessions benefit from ~90% cache hits, dropping effective cost to ~10%.
- Survives compaction (system-prompt content doesn't compact), so no post-compact recovery needed.

**Compared to Claude Code's SessionStart handler approach:** roughly equivalent per-turn cost because LLMs are stateless — session-start content STILL gets re-sent every API call as part of the conversation history. The real differences: (a) Claude Code's SessionStart content DOES compact (lossy but cheaper post-compact), (b) rules files live in system prompt which caches better, (c) SessionStart re-fires post-compact in Claude Code but Cursor's doesn't (bug #158873) — our rules-file approach sidesteps that.

Net: aide-memory's token overhead in Cursor is roughly equivalent to Claude Code's, NOT dramatically more. Users concerned about Cursor's overall per-turn cost should look at Cursor's Composer / background indexing / inline completions — they're the dominant factors, not aide-memory.

### 4.8 `injection.enabled` master switch + token-budget recipe

**New config:** `injection.enabled` (boolean, default `true`). Single switch for all session-start injection behavior:
- `true` (default): SessionStart handler runs in Claude Code; rules-file regen runs in Cursor; static rules + priority-always still surface.
- `false`: SessionStart handler skips injection entirely; rules file reverts to static template (no dynamic content baked in); user controls rules content via direct edits to the template.

Wired alongside the existing per-layer knobs:

| Knob | Effect | Default |
|---|---|---|
| `injection.enabled` | Master on/off for session-start injection | `true` |
| `injection.preferences` | Preferences count or false | `15` |
| `injection.technical` | Technical injection | `false` |
| `injection.area_context` | Area context injection | `false` |
| `injection.guidelines` | Guidelines injection | `'all'` |
| `injection.priorityAlwaysOverride` | Priority:"always" auto-inject | `true` |
| `injection.maxChars` | Overall char cap | `1200` |
| `injection.excludeScopedPreferences` | Filter scoped prefs | `false` |

**When `injection.enabled=false`:** short-circuit at handler entry — no SQLite read, no template render, no rules-file regen write. Rules file holds static content only. Zero per-turn overhead from aide-memory's dynamic injection pipeline.

**Token-budget recipe (documented in `docs/user/editors/cursor.md`):**

```bash
# Option 1: full disable — static rules only, no dynamic content at all
aide-memory config injection.enabled false

# Option 2: granular tune — keep some layers, skip others
aide-memory config injection.preferences false      # skip preferences
aide-memory config injection.guidelines false       # skip guidelines
aide-memory config injection.maxChars 300           # tight cap for what remains

# Option 3: aggressive cap — keep everything but small
aide-memory config injection.maxChars 400
```

Implementation: adds ~5 lines to `src/memory/hooks/handlers.ts` sessionStart handler + `src/memory/rulesGen.ts` generator — early-return if `injection.enabled === false`. Tested as part of `all-configs-behavior.test.sh` with a PASS case verifying full disable. Phase C1 scope (alongside the other schema additions).

---

## 5. Visibility in Cursor — partial parity, document clearly

**User directive #3 rejected the stderr-to-Output-panel approach.** The
goal is inline visibility on par with Claude Code where channels exist.

**Updated 2026-04-27 (memory #358 + #359):** the original "accept the gap"
framing was based on an adapter-bias bug. Empirical verification on Cursor
3.2.11 found:

- **`user_message` on `permission:"deny"` renders inline in Cursor chat.**
  We use this for hard-block chrome (e.g. `aide-memory · prompting aide_recall
  for scoped memories (expected flow)`).
- **`user_message` on `permission:"allow"` is logged in the Hooks Output
  panel** but does NOT render inline in Cursor 3.2.11 chat. We still emit it
  for forward-compat and panel observability.
- **`agent_message` (both allow + deny) reaches the agent's context** —
  equivalent to Claude Code's `additionalContext`. The earlier "agent_message
  broken" claim was based on Windows 2.0.77 regression #142589; verified
  working in Cursor 3.2.11 macOS. We use this as the agent-side soft channel.
- **ANSI escape codes are stripped** for Cursor in the adapter (Cursor
  doesn't render terminal ANSI like Claude Code does — chrome reads as
  garbage if left intact).

**Corrected research findings:**
- No plugin/extension path (webview broken #115748, no chat contribution API #121400, no AI-feature API #1307). _Still true._
- ~~`agent_message` broken~~ — that was the Windows 2.0.77 regression #142589; Cursor 3.2.11 macOS works correctly.
- `user_message` renders inline only on `permission:"deny"`. _Still true._
- No standalone systemMessage channel (not paired with a hook fire) — _still true._

**What Cursor users see today:**
- MCP tool-call chrome (when agent calls `aide_recall`, user sees the tool call in Cursor's standard chrome).
- Agent's natural-language response (may reference what it recalled).
- Hard-block `user_message` chrome inline when pre-read/pre-edit fires on a file with scoped mems.
- Hooks Output panel shows `user_message` lines for soft fires (allow path) — observable, but the user has to open the panel to see them.

**What the agent sees on every fire (allow + deny):**
- `agent_message` content — same payload Claude Code's `additionalContext`
  carries (reason + IDs + recommended tool call).

**What's still missing vs Claude Code:**
- Inline chrome on `permission:"allow"` soft fires — chrome lives in the
  Hooks Output panel, not in chat. Filed as Cursor FR (track in §2 bug list
  if not already there).
- **NEW gap (2026-04-27, memory #363):** `preToolUse:Read` does not fire
  when the file is open in the Cursor editor pane. Mitigated via per-Edit
  safety net + rules-file `body.md` injection.

**External-docs treatment:**
- `docs/user/editors/cursor.md` states the corrected state: hard-block chrome inline (visible), soft-nudge agent context delivered via `agent_message` (agent receives, user doesn't see inline), per-Read editor-open coverage gap documented under "Per-Read coverage gap on Cursor".
- Feature request filed with Cursor for inline `system_message` output field on `permission:"allow"` (tracked as follow-up).
- Future work: when Cursor adds a chat-visible channel for allow fires, switch from "agent_message only" to "agent_message + chat-visible chrome" in the adapter.

---

## 6. Implementation plan — phased commits

New branch: `feature/phase-1-cursor-support` off `feature/phase-1`.

**Phase C1 — hook-events manifest + adapter skeleton.** New `src/memory/hooks/events.ts`, `src/memory/editors/types.ts`, `editors/index.ts`, `editors/claude-code.ts`, `editors/cursor.ts`. Shared `buildHookConfig(adapter, HOOK_EVENTS)` generator. Refactor `init.ts` to loop through adapters. All 665 existing unit tests stay green. **Gate:** byte-identical Claude Code config output compared to pre-refactor.

**Phase C2 — Cursor init file generation.** `CursorAdapter.wrapHookConfig` + `mcpConfig` produce correct `.cursor/hooks.json` + `.cursor/mcp.json`. `aide-memory init` creates 7 files (4 editor-specific + 3 shared). **Gate:** new `scripts/hooks/__tests__/cursor-init-smoke.test.sh` validates every field + matcher.

**Phase C3 — runtime dispatcher + envelope translation.** Implement `detectRuntimeAdapter(env)` + `CursorAdapter.translateInput/translateOutput`. Claude Code path unchanged (identity translations). **Gate:** new `src/memory/hooks/__tests__/cursor-envelope.test.ts` covers stdin rename + stdout shape conversion.

**Phase C4 — dynamic rules-file regeneration.** New `src/memory/rulesGen.ts` reading store + config, rendering content into `.cursor/rules/aide-memory.mdc` template. Hooked into: init, config write path, aide_remember/update/forget for priority-always + preferences/guidelines mems. **Gate:** unit test verifies regeneration after each trigger; integration test spawns Cursor-style session and checks rules file contents.

**Phase C5 — correction-pending one-turn-delay flow (Cursor mode).** `pre-prompt` handler in Cursor mode writes flag + returns silent (no additional_context attempt). `stop` handler already reads flag. **Gate:** unit test simulates Cursor `beforeSubmitPrompt` correction → flag set → next `stop` emits "correction wasn't stored" via `followup_message`.

**Phase C6 — tests + smokes.** Extend `install-from-tarball.smoke.sh` to verify Cursor files generated correctly. New `all-configs-behavior.test.sh` runs every config toggle in BOTH Claude Code AND Cursor runtime envs. **Gate:** 21+ per editor, 3 SKIP, 0 FAIL.

**Phase C7 — docs (internal consolidation).** Update PHASE_0_1_SPEC cross-refs. File all 7 Cursor bug threads in `PHASE_0_1_VALIDATION_FOLLOWUPS.md` with status-check protocol. **Execute the validation-doc consolidation per §7** (merge MANUAL_E2E + PHASE_1_RESULTS + fixed items from follow-ups → one `E2E_VALIDATION.md` matrix doc). Audit PRODUCT_VISION + spec for overlapping validation content.

**Phase C8 — docs (external) + validation.** Restructure per §8 (new `docs/user/editors/<editor>.md` per-tool pages + `supported-editors.md` matrix). Run validation matrix for Claude Code + Cursor manually in each editor's local chat. Fill in the consolidated `E2E_VALIDATION.md` per-tool columns with observed results.

**Phase C9 — release 0.5.0 + final cleanup.** Bump version, tag, publish. Then:
- Unpublish pre-0.5.0 versions per `HANDOFF_MINIFIED_PUBLISH.md` protocol.
- Re-verify the new tarball has zero source leaks: `scripts/verify-package.sh` (existing checks) PLUS manual grep for dev-manifest strings, `.ts`/`.map` files, source-map comments (`sourceMappingURL`), readable original identifiers. If any gaps found, extend `verify-package.sh` before the next release.

Estimate: ~9 focused commits, ~4-6 days implementation + 1 day validation + 0.5-1 day cleanup.

### 6.1 Per-phase validation gate — applied memory #314

Each **code-changing** phase (C1-C6, C9) runs the full 10-check pre-ship validation sequence from memory #314. Every phase must prove Claude Code still works exactly as before (anti-regression guard) in addition to its phase-specific new work.

| Phase | Gate-check additions beyond the 10-step baseline |
|---|---|
| C1 | Byte-identical Claude Code config output compared to pre-refactor; byte-identical rule-file output for every existing editor |
| C2 | New `scripts/hooks/__tests__/cursor-init-smoke.test.sh` (all 7 files generated) + Claude Code re-run unchanged |
| C3 | New `src/memory/hooks/__tests__/cursor-envelope.test.ts` (stdin rename + stdout shape) + Claude Code handler paths unchanged |
| C4 | `src/memory/__tests__/rulesGen.test.ts` covers all 4 regen triggers + atomic-write + token-budget-warning check |
| C5 | Cursor env simulation: `beforeSubmitPrompt` correction → flag → next `stop` fires "wasn't stored" |
| C6 | `all-configs-behavior.test.sh` parametrized: 21+ PASS per editor, 3 SKIP, 0 FAIL |
| C7 | Doc-only: verify no broken links + redirect stubs work + cross-refs correct |
| C8 | Full validation matrix manually run in each editor — fills the runs table |
| C9 | 10-check + source-audit checklist (§6.2) + post-publish install smoke + npm-unpublish execution |

**Every phase re-runs:**
- `npm run build` (tsc clean)
- `npm test -- --run --exclude '**/.claude/worktrees/**' --exclude '**/.cursor/worktrees/**'` (baseline tests stay green)
- `scripts/hooks/__tests__/settings-behavior.test.sh`
- `scripts/hooks/__tests__/detect-correction.test.sh`
- `scripts/hooks/__tests__/all-configs-behavior.test.sh`
- `scripts/hooks/__tests__/e2e-autonomous.sh`
- `scripts/hooks/__tests__/install-from-tarball.smoke.sh` (when Cursor files change)
- In-depth code review of each changed file
- Full 17-step hook simulation against `/tmp/aide-e2e` via stdin pipe to dispatcher
- Manual Claude Code walk of at least scenarios 3, 4, 6, 8 to verify zero regression

### 6.2 Phase C9 source-audit checklist (agent executes after publish)

Ship 0.5.0 → run this audit before unpublishing prior versions to ensure we don't leave evidence of source code in the shipped tarball.

**On the installed `node_modules/aide-memory/` (from live npm):**

1. `find node_modules/aide-memory -name '*.ts' -o -name '*.map'` → must return zero.
2. `grep -r 'sourceMappingURL' node_modules/aide-memory/dist/` → must return zero.
3. `grep -r 'aide-v0\|aide-legacy' node_modules/aide-memory/` → must return zero (dev-monorepo strings).
4. Manual spot-check of each bundle's first 200 lines — expected format is `#!/usr/bin/env node` + one long minified line. If multiple lines or readable identifiers, fail.
5. Grep bundles for known original identifiers that should be mangled: `detectCorrection`, `computeScopedForPath`, `maybeTriggerDriftResync`, `rulesGen`, `EditorAdapter` — must not appear recognizably in minified output (minifier should rename locals to `a`, `b`, etc.).
6. **Intentionally visible, NOT a leak:** rules templates (`src/templates/rules/**/*.md`, `*.mdc`) — user-facing content, not source. `LICENSE.md`, `package.json`, `README.md`, `README.npm.md` — intentionally shipped.

**If any step fails:** do NOT unpublish prior versions yet. Fix the packaging issue in a 0.5.1 release first, then re-audit.

**Only after audit passes:** proceed with `npm unpublish aide-memory@<version>` for each pre-0.5.0 version (0.1.1, 0.2.0, 0.3.0, 0.4.0, 0.4.1, 0.4.2, 0.4.3). Unpublish removes the version from the registry entirely per `HANDOFF_MINIFIED_PUBLISH.md` — the 3-condition exception applies (no reverse deps + <300 weekly downloads + single maintainer).

---

## 7. Consolidated validation doc (user directive #1)

### 7.1 Current state — three artifacts drift

- `docs/validation/MANUAL_E2E_VALIDATION.md` — step-by-step runbook (17 steps).
- `docs/validation/PHASE_1_RESULTS.md` — run-log (dated observations).
- `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` — deferred bugs + FIXED items already addressed.

**Problem:** bugs fixed during validation stayed in the follow-ups file without being reflected back in the runbook. The runbook's "Expected" column drifted from reality. When a new editor column needs adding, three files need editing. Splitting risks coverage gaps.

### 7.2 Consolidated structure

**One file: `docs/validation/E2E_VALIDATION.md`** replaces all three for validation scenarios. Follow-ups doc stays but only for non-validation follow-ups (Cursor bug tracker, plugin-marketplace planning, Phase 2+ design items).

Per-scenario structure:

```markdown
## Step 4 — A: path-based recall, full ID-based blocking flow

Action: read src/api/routes.ts

| # | Expected (Claude Code) | Expected (Cursor) | Expected (<next editor>) |
|---|---|---|---|
| A1 | `decision: block` with path-based message | `permission: deny` + `user_message` with path-based message | ... |
| A3 | Silent re-read | Silent re-read (same — ids\| tracking covers) | ... |
| A5 | `decision: block` for auth-scoped mems | `permission: deny` for auth-scoped mems | ... |
| A6 | Silent (no matching scope) | Silent | ... |

### Runs

| Run | Date | Tool | Result | Notes + follow-up links |
|---|---|---|---|---|
| 1 | 2026-04-21 | Claude Code | ✅ A1/A3/A5/A6 PASS | Prior Round 2 |
| 2 | 2026-04-22 | Claude Code (0.4.2) | ✅ PASS | Handoff doc §manual walk |
| 3 | 2026-04-23 | Claude Code (0.4.3) | ✅ PASS | Post-0.4.3 re-verification |
| 4 | TBD | Cursor | — | Blocked on CURSOR_ONBOARDING Phase C8 |

### Issues found during validation (resolved inline)

- ~~Step 10 E1 failure (2026-04-19): aide_forget rejected string ID, required number~~ — fixed in `fbb872c`, regression test added. See CHANGELOG 0.4.0.
```

**Properties:**
- Expected behavior + per-tool columns — no coverage gaps when adding an editor (add a column; every scenario evaluated for the new editor).
- Runs table — dated history inline; no separate "results" file.
- Issues found — inline + struck-through when resolved. Still-open issues link to an external tracker row (Cursor bug #158168, etc.).
- Single source of truth — no drift.

### 7.3 Migration path (Phase C7 work)

1. Create `docs/validation/E2E_VALIDATION.md` with the matrix structure.
2. Fill Claude Code column from MANUAL_E2E steps 0-17.
3. Fill runs table from PHASE_1_RESULTS.md history.
4. Extract "FIXED" items from PHASE_0_1_VALIDATION_FOLLOWUPS.md and inline them as strikethrough "Issues found during validation (resolved)" rows on the relevant scenario.
5. Leave Cursor column as `Expected: <fill during C8>` placeholders.
6. Delete MANUAL_E2E_VALIDATION.md and PHASE_1_RESULTS.md. Add redirect stub files: `Moved to docs/validation/E2E_VALIDATION.md`.
7. Trim PHASE_0_1_VALIDATION_FOLLOWUPS.md to non-validation follow-ups only (Cursor bug tracker, plugin-marketplace, Phase 2+ items). Keep file under 200 lines.

### 7.4 Audit of other docs for overlap

- `docs/PRODUCT_VISION.md` — currently says "validated end-to-end via manual scenarios." Point to the single validation doc.
- `docs/specs/PHASE_0_1_SPEC.md` P1.17 section has detailed scenario list (~200 lines). Replace with pointer: "Scenarios + expected behavior + run history in `docs/validation/E2E_VALIDATION.md`." Keep only high-level acceptance criteria in the spec.

---

## 8. External docs restructure (user directive #7)

### 8.1 Goal

Reader's journey:
1. **What aide-memory is** (holistic — memories, layers, scopes, hooks, MCP tools, philosophy).
2. **How to install + use it** (editor-agnostic quick-start).
3. **What their experience will be in each editor** (per-editor sections with explicit gap callouts).

Today: docs are Claude-Code-first with occasional "also Cursor" mentions. Doesn't scale to 4+ editors.

### 8.2 Proposed structure

```
docs/user/
  ├── index.md                 (landing page — what aide-memory is, value prop)
  ├── quick-start.md           (install + aide-memory init — editor-agnostic)
  ├── concepts.md              (memories, layers, scopes, hooks, MCP — the mental model)
  ├── supported-editors.md     (capability matrix: feature × editor. Honest gaps.)
  ├── editors/
  │   ├── claude-code.md       (CC experience — branded chrome, session-start inject, soft nudges)
  │   ├── cursor.md            (Cursor experience — hard blocks, silent soft, rules-file context)
  │   ├── windsurf.md          (placeholder — fill when onboarded)
  │   ├── codex.md             (placeholder)
  │   └── copilot.md           (placeholder)
  ├── configuration.md         (all configs. Per-key: which editors honor it)
  ├── cli-reference.md         (editor-agnostic)
  ├── troubleshooting.md       (top-level common issues; per-editor subsections)
  └── architecture.md          (internals — hooks/MCP/store/adapters)
```

### 8.3 Content migration

- `README.md` + `docs/PUBLIC_README.md` — lead with value prop (holistic), then a "Works with" section naming Claude Code AND Cursor (drop the "un-validated for Cursor" hedge from memory #183 once C8 validates).
- `docs/LANDING_PAGE_CONTENT.md` — marketing copy updated to match.
- `supported-editors.md` — authoritative source for which editor does what. Referenced from per-editor pages + configuration.md.

### 8.4 Per-editor page template

Each `docs/user/editors/<editor>.md` has identical sections for predictable comparison:

```markdown
# aide-memory in <editor>

## What you'll see
- Init creates <editor-specific files>
- When you read a file with scoped mems: <expected UI>
- When you call aide_recall: <expected UI>
- When you type a correction: <expected UI>
- When session starts: <expected UI>

## What's different from Claude Code
- <explicit gap list with workarounds>

## Troubleshooting
- <editor-specific issues>

## Platform issues we're tracking
- <bug tracker numbers for this editor>
```

Consistent with the onboarding-guide's research-driven fill-in pattern (see `EDITOR_ONBOARDING_GUIDE.md`).

---

## 9. Decisions locked

| Item | Decision |
|---|---|
| Branch | `feature/phase-1-cursor-support` off current `feature/phase-1` |
| Release gate | **0.5.0** (Cursor support) → soak with real users → **1.0** later |
| Visibility in Cursor | No stderr; accept gap, document in per-editor doc + supported-editors matrix |
| Session-start dynamic injection | Rules-file regeneration (staff-endorsed via #157141) |
| Cloud-agent testing | Phase 2+ follow-up |
| Validation driver | Manual in each editor's local chat |
| Scope | ~80% parity; 5 documented gaps |
| Plugin/marketplace | Filed as 1.0 scope candidate; separate tracking |
| Validation doc consolidation | Single `docs/validation/E2E_VALIDATION.md` matrix; Phase C7 migration |
| External docs structure | New `docs/user/editors/<editor>.md` per-tool pages + `supported-editors.md` matrix |
| Bug-thread monitoring | 7 Cursor threads + 6 quirk threads listed in §2; agent re-checks weekly per onboarding-guide |
| Final release cleanup | Audit → if pass unpublish pre-0.5.0 versions; if fail ship 0.5.1 first, re-audit, then unpublish |
| Token-cost parity | Cursor rules-file approach ≈ Claude Code SessionStart approach in per-turn cost (see §4.7). Not a 50× difference. |
| Session-start disable | New `injection.enabled` master switch (default `true`) + preserved granular knobs + documented recipe in per-editor Cursor doc (see §4.8) |

---

## 10. Open items before implementation starts

None — all decisions are locked. Awaiting user greenlight to begin Phase C1.

---

*End of plan v2.*
