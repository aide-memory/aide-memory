/**
 * CursorAdapter — Cursor IDE integration.
 *
 * Phase C1 scope (zero behavior change):
 *   - Rules metadata present (matches current behavior: init writes
 *     `.cursor/rules/aide-memory.mdc`).
 *   - `supportsHooks` + `supportsMcp` are FALSE in C1 — init skips
 *     hook/MCP generation for Cursor today. Translation maps + buildHookConfig
 *     / buildMcpConfig are defined so Phase C2 can flip the flags + start
 *     writing `.cursor/hooks.json` + `.cursor/mcp.json` without re-designing
 *     the adapter shape.
 *
 * Phase C2 activates:
 *   - Set supportsHooks = true, supportsMcp = true
 *   - Wire init.ts to call buildHookConfig + buildMcpConfig alongside claude-code
 *   - Add cursor-init-smoke.test.sh
 *
 * Scope gaps documented in docs/specs/CURSOR_ONBOARDING.md §1:
 *   - `glob` matcher not supported → matcherMap['glob'] = null
 *   - preToolUse has no soft-nudge additionalContext channel (handled at
 *     envelope/translateOutput layer, not in this file)
 *   - beforeReadFile is a separate event from preToolUse matcher=Read —
 *     mapped to pre-read for now; Phase C3 empirical testing decides final
 *     wiring
 *
 * References: memory #328 (hook semantics), #330 (operational quirks).
 */

import { EditorAdapter, HookConfigArgs, McpConfigArgs, HookEmit } from './types';
import { groupByEvent, translateEvents } from './build';

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

    return out;
  },

  translateOutput(emit: HookEmit): string {
    // Cursor's hook output contract (per memory #328 + CURSOR_ONBOARDING.md
    // §1 gap list):
    //   - HARD BLOCK  → {permission: "deny", user_message} — shows reason in
    //                   chat, blocks the tool call.
    //   - additionalContext on preToolUse/sessionStart → NO CHANNEL EXISTS.
    //                   Cursor's preToolUse has no additional_context field;
    //                   sessionStart.additional_context is broken (forum
    //                   #158452). Workaround: dynamic rules-file regen
    //                   (Phase C4 ships that). For now, these emits fall
    //                   silent in Cursor — return ''.
    //   - systemMessage → no inline branded channel in Cursor. Return '' —
    //                   gap documented in CURSOR_ONBOARDING.md §5.
    //   - silent → '' (same as Claude Code).
    switch (emit.kind) {
      case 'block': {
        // Cursor's output shape depends on WHICH hook event fired the block.
        // preToolUse → {permission: "deny", user_message}; stop →
        // {followup_message} (reprompt channel); userPromptSubmit →
        // {continue: false, user_message} (beforeSubmitPrompt block).
        // event defaults to 'preToolUse' when omitted for back-compat with
        // pre-C5 emit sites.
        const event = emit.event ?? 'preToolUse';
        if (event === 'stop') {
          // Stop hook: followup_message reprompts the agent with our nudge.
          // See CURSOR_ONBOARDING.md §1 "Stop-hook reflection nudges via
          // followup_message" + memory #328.
          return JSON.stringify({ followup_message: emit.reason }, null, 2);
        }
        if (event === 'userPromptSubmit') {
          // beforeSubmitPrompt: continue:false + user_message BLOCKS the
          // user's prompt submission. aide-memory rarely blocks here (we
          // want corrections to flow through and be caught by the Stop
          // hook via the one-turn-delay pattern), but the shape is here
          // for completeness + future use.
          return JSON.stringify({
            continue: false,
            user_message: emit.reason,
          }, null, 2);
        }
        // Default: preToolUse block shape.
        return JSON.stringify({
          permission: 'deny',
          user_message: emit.reason,
        }, null, 2);
      }
      case 'additionalContext':
        // Cursor has no equivalent channel. Content is lost — this is the
        // documented 20% parity gap. Rules-file regeneration (Phase C4)
        // covers the sessionStart case; other events (preToolUse soft
        // nudges, userPromptSubmit correction hints) fall silent.
        return '';
      case 'systemMessage':
        // Cursor has no inline branded channel for non-deny events.
        return '';
      case 'silent':
        return '';
    }
  },
};
