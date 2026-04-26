/**
 * ClaudeCodeAdapter — reference implementation of the EditorAdapter contract.
 *
 * Output contract:
 *   - `.claude/settings.json` hooks key matches the pre-refactor
 *     `generateHookConfig(packageRoot).hooks` shape byte-for-byte.
 *   - `.mcp.json` matches `{mcpServers: {'aide-memory': {command: 'node',
 *     args: [absServerEntry, absProjectRoot]}}}`.
 *   - Rules file: renders src/templates/rules/claude-code.md to
 *     `.claude/rules/aide-memory.md` with {{contributor}} + {{tools_list}}
 *     substitutions.
 *
 * These exact shapes are verified by golden-fixture tests so post-refactor
 * output stays byte-identical with the pre-refactor hardcoded generator.
 */

import { EditorAdapter, HookConfigArgs, McpConfigArgs, HookEmit } from './types';
import { groupByEvent, translateEvents } from './build';

export const claudeCodeAdapter: EditorAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',

  hookConfigPath: '.claude/settings.json',
  mcpConfigPath: '.mcp.json',
  rules: [
    { template: 'claude-code.md', dest: '.claude/rules/aide-memory.md' },
  ],

  // Claude Code has no YAML frontmatter + no editor-specific caveats — the
  // shared body renders as-is with tool_id=claude-code.
  ruleFrontmatter: '',
  ruleNotes: '',
  ruleToolId: 'claude-code',

  supportsHooks: true,
  supportsMcp: true,
  supportsRules: true,

  eventNameMap: {
    'session-start':         'SessionStart',
    'pre-compact':           'PreCompact',
    'stop':                  'Stop',
    'pre-prompt':            'UserPromptSubmit',
    'pre-read':              'PreToolUse',
    'pre-edit':              'PreToolUse',
    'pre-search':            'PreToolUse',
    'pre-recall':            'PreToolUse',
    'post-tool-use-recall':  'PostToolUse',
    'post-remember':         'PostToolUse',
    'post-search':           'PostToolUse',
  },

  matcherMap: {
    'read':              'Read',
    'edit':              'Edit',
    'write':             'Write',
    'search':            'Grep',
    'glob':              'Glob',
    'mcp-aide-recall':   'mcp__aide-memory__aide_recall',
    'mcp-aide-remember': 'mcp__aide-memory__aide_remember',
    'mcp-aide-update':   'mcp__aide-memory__aide_update',
    'mcp-aide-forget':   'mcp__aide-memory__aide_forget',
    'mcp-aide-search':   'mcp__aide-memory__aide_search',
  },

  buildHookConfig(args: HookConfigArgs): object {
    const entries = translateEvents(claudeCodeAdapter, args);
    const grouped = groupByEvent(entries);

    // Claude Code shape:
    //   hooks: {
    //     SessionStart: [{ hooks: [{ type, command, timeout }] }],
    //     PreToolUse: [
    //       { matcher: 'Read', hooks: [{ type, command, timeout }] },
    //       { matcher: 'Edit', hooks: [{ type, command, timeout }] },
    //       ...
    //     ],
    //     ...
    //   }
    //
    // Each event-group is an array of single-hook wrappers. When any entry in
    // the group has a matcher, ALL entries in the group carry `matcher` keys
    // (e.g. PreToolUse). When no entry has a matcher (e.g. SessionStart), the
    // wrapper has only `hooks` — no `matcher` key.
    const hooks: Record<string, unknown[]> = {};
    for (const [eventName, eventEntries] of grouped) {
      const anyMatchered = eventEntries.some((e) => e.matcher !== null);
      hooks[eventName] = eventEntries.map((e) => {
        const hookCommand = { type: 'command', command: e.command, timeout: e.timeout };
        if (anyMatchered) {
          return { matcher: e.matcher, hooks: [hookCommand] };
        }
        return { hooks: [hookCommand] };
      });
    }

    return { hooks };
  },

  buildMcpConfig({ serverEntry, projectRoot }: McpConfigArgs): object {
    return {
      mcpServers: {
        'aide-memory': {
          command: 'node',
          args: [serverEntry, projectRoot],
        },
      },
    };
  },

  detectRuntime(env: NodeJS.ProcessEnv): boolean {
    // Claude Code sets CLAUDECODE=1 (and CLAUDE_PROJECT_DIR) when spawning
    // hook commands. Treat presence of CLAUDECODE as the positive signal —
    // BUT yield to cursor's stronger signal when present. Concrete case: a
    // developer running `claude` inside a Cursor workspace (where Cursor
    // already exported CURSOR_VERSION) would otherwise double-match; we
    // prefer the more specific adapter. Also ensures that test environments
    // running inside a Claude Code wrapper (which sets CLAUDECODE globally)
    // correctly dispatch to cursor when a cursor smoke test sets
    // CURSOR_VERSION=x explicitly.
    if (env.CURSOR_VERSION || env.CURSOR_PROJECT_DIR) return false;
    return Boolean(env.CLAUDECODE);
  },

  translateInput(raw: Record<string, unknown>): Record<string, unknown> {
    // Claude Code IS the canonical HookInput shape. No translation needed.
    return raw;
  },

  translateOutput(emit: HookEmit): string {
    // Claude Code output shapes — these are the formats handlers historically
    // wrote directly to stdout. Centralizing them here so all editor-specific
    // output construction lives in the adapter layer.
    switch (emit.kind) {
      case 'block': {
        const payload: Record<string, unknown> = {
          decision: 'block',
          reason: emit.reason,
        };
        if (emit.systemMessage) payload.systemMessage = emit.systemMessage;
        return JSON.stringify(payload, null, 2);
      }
      case 'additionalContext': {
        const payload: Record<string, unknown> = {
          hookSpecificOutput: {
            hookEventName: emit.event,
            additionalContext: emit.context,
          },
        };
        if (emit.systemMessage) payload.systemMessage = emit.systemMessage;
        return JSON.stringify(payload, null, 2);
      }
      case 'systemMessage': {
        return JSON.stringify({ systemMessage: emit.text }, null, 2);
      }
      case 'silent':
        return '';
    }
  },
};
