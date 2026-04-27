/**
 * CursorAdapter — Cursor IDE integration.
 *
 * Phase C1-C6: COMPLETE. Cursor support is feature-complete; we ship .cursor/
 * hooks.json, .cursor/mcp.json, .cursor/rules/aide-memory.mdc on init, with
 * runtime envelope translation in translateInput / translateOutput.
 *
 * 0.5.0 update (2026-04-27): translateOutput now follows the audience-
 * mapping pattern (memory #359) — `user_message` plays the same role on
 * Cursor that Claude Code's `systemMessage` plays (user-visible chrome),
 * and `agent_message` plays the same role as Claude Code's
 * `additionalContext` (agent-only instruction). Earlier framing of
 * "Cursor has no soft-nudge channel" was wrong (memory #358 — bias
 * directive) — `agent_message` is the channel; we now use it.
 *
 * Genuine platform gaps that survive after the audience-mapping fix:
 *   - sessionStart `additional_context` is broken (forum #158452) — rules-
 *     file regen with `alwaysApply: true` is the staff-endorsed workaround.
 *   - `Glob` matcher undocumented (forum #138691) → matcherMap['glob'] = null.
 *   - `MCP:<tool>` syntax has no server-name segment → collision risk if
 *     two MCP servers expose same-named tools.
 *   - No inline branded chrome equivalent to Claude Code's per-event
 *     `systemMessage` rendering — `user_message` exists but renders as
 *     normal chat content, not a styled "aide-memory · ..." badge line.
 *
 * References: memory #328 (hook semantics, corrected), #330 (operational
 * quirks), #358 (bias directive — verify before claiming gaps), #359
 * (audience-mapping pattern).
 */

import { EditorAdapter, HookConfigArgs, McpConfigArgs, HookEmit } from './types';
import { groupByEvent, translateEvents } from './build';

/**
 * Strip ANSI SGR escape sequences (the `[…m` color codes) from a
 * string. Used when routing chrome text into Cursor's `user_message` /
 * `followup_message` — Cursor's chat doesn't render terminal ANSI like
 * Claude Code does, and leaving the codes in either renders them as
 * literal garbage or hides the line entirely. Verified empirically in
 * Cursor 3.2.11: with ANSI present, the chrome line did not surface in
 * chat UI for the user; stripping makes the brand prefix render plainly.
 *
 * Claude Code's adapter does NOT strip — terminal ANSI is the right
 * format for Claude Code's render path (per memory #324).
 */
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\[[0-9;]*m/g;
function stripAnsi(s: string): string {
  return s.replace(ANSI_REGEX, '');
}

export const cursorAdapter: EditorAdapter = {
  id: 'cursor',
  displayName: 'Cursor',

  hookConfigPath: '.cursor/hooks.json',
  mcpConfigPath: '.cursor/mcp.json',
  rules: [
    { template: 'cursor.mdc', dest: '.cursor/rules/aide-memory.mdc' },
  ],

  // Cursor requires a YAML frontmatter block for .mdc files. `alwaysApply:
  // true` ensures the rule injects on every agent turn (this also provides
  // the session-start-injection workaround per CURSOR_ONBOARDING.md §4).
  ruleFrontmatter: `---
description: AIDE Memory - persistent context for AI coding agents
globs: **/*
alwaysApply: true
---

`,

  // Inserted at {{editor_notes}} in the shared body (just after the Hooks
  // section). Captures Cursor's hook-response channel difference vs Claude
  // Code's additionalContext. See memory #328 for platform semantics.
  ruleNotes: `
Note: Cursor uses \`agent_message\` for hook responses rather than \`additionalContext\`. The nudge content appears directly in the agent message flow.
`,

  ruleToolId: 'cursor',

  // Phase C2 activation (2026-04-23): Cursor now contributes hooks + MCP
  // config at init. Dynamic regeneration of .cursor/rules/aide-memory.mdc
  // (workaround for broken sessionStart.additional_context per CURSOR_
  // ONBOARDING.md §4) still comes in C4 — for now the rules file holds
  // static template content just like Claude Code's rule file.
  supportsHooks: true,
  supportsMcp: true,
  supportsRules: true,

  eventNameMap: {
    'session-start':         'sessionStart',
    'pre-compact':           'preCompact',
    'stop':                  'stop',
    'pre-prompt':            'beforeSubmitPrompt',
    // pre-read → preToolUse (matcher: Read), NOT beforeReadFile. Decision
    // recorded 2026-04-23 after deep research. Rationale:
    //   1. aide-memory gates agent tool calls, not raw file content — the
    //      preToolUse envelope (tool_use_id, tool_input) matches our use
    //      case. beforeReadFile is a content-level gate (secret scanning,
    //      redaction).
    //   2. preToolUse supports `agent_message` output — lets us tell the
    //      model WHY it was denied. beforeReadFile has no agent_message.
    //   3. beforeReadFile has an acknowledged bug where `permission: deny`
    //      isn't always honored by the agent loop (forum #150520, staff-
    //      confirmed Feb 2026). preToolUse is the path Cursor is
    //      positioning as the generic tool gate and will stabilize first.
    //   4. Cursor's "only first hook per event runs" quirk (#141996) is
    //      less likely to conflict if aide-memory clusters on preToolUse
    //      where it already registers Edit/Write/Grep matchers. Secret
    //      scanners tend to claim beforeReadFile.
    //   5. @-file attachments + Tab context pulls bypass preToolUse — that's
    //      fine; our nudge is about agent-planned reads, not attachments.
    'pre-read':              'preToolUse',
    'pre-edit':              'preToolUse',
    'pre-search':            'preToolUse',
    'pre-recall':            'preToolUse',
    'post-tool-use-recall':  'postToolUse',
    'post-remember':         'postToolUse',
    'post-search':           'postToolUse',
  },

  matcherMap: {
    'read':              'Read',
    'edit':              'Write',  // Cursor has no Edit matcher; Write covers both
    'write':             'Write',
    'search':            'Grep',
    // Cursor does not document a Glob matcher (see CURSOR_ONBOARDING.md §1
    // gap #4) — skipped silently via null.
    'glob':              null,
    // Cursor's MCP matcher syntax has no server-name segment — collision risk
    // tracked as forum #138691. If another MCP server exposes a same-named
    // tool, our matcher will fire for theirs too. Accepted in C1 scope.
    'mcp-aide-recall':   'MCP:aide_recall',
    'mcp-aide-remember': 'MCP:aide_remember',
    'mcp-aide-update':   'MCP:aide_update',
    'mcp-aide-forget':   'MCP:aide_forget',
    'mcp-aide-search':   'MCP:aide_search',
  },

  buildHookConfig(args: HookConfigArgs): object {
    const entries = translateEvents(cursorAdapter, args);
    const grouped = groupByEvent(entries);

    // Cursor hook config shape:
    //   { version: 1, hooks: { sessionStart: [...], preToolUse: [...], ... } }
    //
    // Per-entry shape for events WITHOUT matcher:
    //   { command: 'bash ...', type: 'command', timeout: N }
    //
    // Per-entry shape for events WITH matcher (e.g. preToolUse):
    //   { matcher: 'Read', command: 'bash ...', type: 'command', timeout: N }
    //
    // Cursor's field order + key spelling differs from Claude Code — Cursor
    // uses camelCase event names + puts `command`/`type`/`timeout` at the
    // top level per entry rather than Claude Code's nested { hooks: [...] }.
    const hooks: Record<string, unknown[]> = {};
    for (const [eventName, eventEntries] of grouped) {
      hooks[eventName] = eventEntries.map((e) => {
        const base: Record<string, unknown> = {
          type: 'command',
          command: e.command,
          timeout: e.timeout,
        };
        if (e.matcher !== null) base.matcher = e.matcher;
        return base;
      });
    }

    return { version: 1, hooks };
  },

  buildMcpConfig({ serverEntry }: McpConfigArgs): object {
    // Cursor's MCP config adds `type: 'stdio'` + uses ${workspaceFolder}
    // interpolation so the project root resolves at runtime (memory #332).
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

  detectRuntime(env: NodeJS.ProcessEnv): boolean {
    // Cursor sets CURSOR_PROJECT_DIR + CURSOR_VERSION when spawning hook
    // commands (memory #328 + #330). Cursor ALSO sets CLAUDE_PROJECT_DIR as
    // an alias — so we cannot use that alone to disambiguate. CURSOR_VERSION
    // is the most reliable positive signal — it's always set by Cursor and
    // Claude Code does not set it.
    return Boolean(env.CURSOR_VERSION) || Boolean(env.CURSOR_PROJECT_DIR);
  },

  translateInput(raw: Record<string, unknown>): Record<string, unknown> {
    // Normalize Cursor's stdin envelope into the canonical HookInput shape
    // our handlers expect. Cursor differences (per memory #328):
    //   - sessionStart uses `conversation_id`; Claude Code uses `session_id`
    //   - sessionStart uses `workspace_roots[]`; Claude Code uses `cwd`
    //   - postToolUse uses `tool_output`; Claude Code uses `tool_response`
    //     (memory #364 — found via 4-cell file-open validation 2026-04-27;
    //     handlers.ts:trackRecallPost reads `input.tool_response` to parse
    //     [N] memory IDs from the recall response — without this remap
    //     IDs never get tracked on Cursor and per-Read soft nudges fire
    //     redundantly after the agent has already recalled)
    //   - preToolUse already has `cwd` + `tool_input` — no remap needed
    //   - beforeSubmitPrompt has `prompt` — matches Claude Code
    //
    // Policy: COPY, don't replace. If both forms are present (unusual),
    // prefer the canonical shape. Means Claude Code envelopes pass through
    // this translator untouched.
    const out: Record<string, unknown> = { ...raw };

    if (typeof out.session_id !== 'string' && typeof raw.conversation_id === 'string') {
      out.session_id = raw.conversation_id;
    }

    if (typeof out.cwd !== 'string' && Array.isArray(raw.workspace_roots) && raw.workspace_roots.length > 0) {
      const first = raw.workspace_roots[0];
      if (typeof first === 'string') out.cwd = first;
    }

    if (out.tool_response === undefined && raw.tool_output !== undefined) {
      out.tool_response = raw.tool_output;
    }

    return out;
  },

  translateOutput(emit: HookEmit): string {
    // Cursor's hook output contract (verified against cursor.com/docs/hooks
    // 2026-04-27 + empirical testing same day; per memory #359 audience-
    // mapping pattern WITH revisions):
    //
    //   user_message  → user-visible chat content, but ONLY when paired with
    //                   `permission:"deny"` or `continue:false`. Under
    //                   `permission:"allow"` or events without permission
    //                   (stop), Cursor accepts user_message in JSON but
    //                   doesn't render it in chat. So we drop it on those
    //                   paths and prefix chrome into the rendering field
    //                   (followup_message for stop) instead.
    //   agent_message → agent-context only (Claude Code's additionalContext
    //                   equivalent). Reaches agent regardless of permission.
    //   permission    → "allow" / "deny" — controls whether the tool runs.
    //   followup_message → stop-hook reprompt channel; visible as next prompt.
    //   continue + user_message → beforeSubmitPrompt block channel.
    //
    // ANSI handling: Claude Code renders 24-bit ANSI in systemMessage
    // (memory #324 brand-color verified) but Cursor's chat doesn't. We
    // strip ANSI from any text routed to Cursor's user-rendering fields
    // so the chrome surfaces as plain text instead of garbage.
    switch (emit.kind) {
      case 'block': {
        // Block shape depends on WHICH hook event fired the block.
        const event = emit.event ?? 'preToolUse';
        if (event === 'stop') {
          // Stop hook: followup_message is the only user-visible field on
          // this event in Cursor 3.2.11 (empirically verified — user_message
          // accepted but ignored). Prepend chrome into followup_message so
          // the brand prefix surfaces in the user's next-turn prompt.
          if (emit.systemMessage) {
            return JSON.stringify({
              followup_message: `${stripAnsi(emit.systemMessage)} — ${emit.reason}`,
            }, null, 2);
          }
          return JSON.stringify({ followup_message: emit.reason }, null, 2);
        }
        if (event === 'userPromptSubmit') {
          // beforeSubmitPrompt: continue:false + user_message BLOCKS the
          // user's prompt submission. user_message renders here (continue
          // is the rendering trigger like deny is on preToolUse). Prepend
          // chrome if present so brand surfaces in chat.
          const text = emit.systemMessage
            ? `${stripAnsi(emit.systemMessage)} — ${stripAnsi(emit.reason)}`
            : stripAnsi(emit.reason);
          return JSON.stringify({
            continue: false,
            user_message: text,
          }, null, 2);
        }
        // preToolUse hard block — audience split renders correctly under
        // permission:"deny":
        //   user_message: branded chrome (if emit.systemMessage present)
        //   agent_message: the call-aide_recall instruction
        // If no systemMessage was emitted (legacy emit-sites), put the
        // reason in user_message so the user always sees SOMETHING.
        const out: Record<string, unknown> = { permission: 'deny' };
        if (emit.systemMessage) {
          out.user_message = stripAnsi(emit.systemMessage);
          out.agent_message = emit.reason;
        } else {
          out.user_message = stripAnsi(emit.reason);
        }
        return JSON.stringify(out, null, 2);
      }
      case 'additionalContext': {
        // Cursor's preToolUse exposes `agent_message` for soft context
        // injection (verified). Empirically (2026-04-27), Cursor 3.2.11
        // does NOT render user_message in chat under permission:"allow"
        // — only under "deny" or continue:false. So the chrome line
        // doesn't surface to the user on soft preToolUse today.
        //
        // We STILL emit user_message on soft preToolUse anyway because:
        //   1. It's visible in Cursor's Hooks Output panel as part of
        //      the OUTPUT JSON — useful for diagnostic / dev-mode.
        //   2. Forward-compat: if Cursor adds soft user_message
        //      rendering later, chrome surfaces automatically without
        //      an adapter update.
        //   3. The cost is ~30 bytes per hook fire — negligible.
        //
        // sessionStart's additional_context is broken in Cursor (forum
        // #158452) — rules-file regen handles that delivery; we emit
        // empty here for sessionStart.
        const evt = String(emit.event ?? '').toLowerCase();
        if (evt === 'pretooluse') {
          const out: Record<string, unknown> = {
            permission: 'allow',
            agent_message: emit.context,
          };
          if (emit.systemMessage) out.user_message = stripAnsi(emit.systemMessage);
          return JSON.stringify(out, null, 2);
        }
        // postToolUse / sessionStart / other: no event-specific handling
        // wired (tracking-only handlers don't emit content here today;
        // rules-file regen covers sessionStart's static-content needs).
        return '';
      }
      case 'systemMessage':
        // Standalone chrome line, no agent instruction, no associated
        // event with a render path. Cursor has no general "show this in
        // chat" channel for non-deny / non-continue:false events. Drop.
        return '';
      case 'silent':
        return '';
    }
  },
};
