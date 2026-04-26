/**
 * CodexAdapter — OpenAI Codex CLI integration.
 *
 * Phase C1 scope: inert. Rule template exists (`src/templates/rules/codex.md`)
 * but init does NOT render it today — matches pre-refactor behavior.
 *
 * supportsHooks/supportsMcp both false; translation maps kept empty but
 * typed-correct so a future Codex onboarding phase can fill them in without
 * re-designing the adapter shape.
 *
 * When onboarding Codex for real, follow docs/specs/EDITOR_ONBOARDING_GUIDE.md
 * — that playbook defines the deep-research steps + validation matrix.
 */

import { EditorAdapter, HookConfigArgs, McpConfigArgs, HookEmit } from './types';

export const codexAdapter: EditorAdapter = {
  id: 'codex',
  displayName: 'OpenAI Codex',

  hookConfigPath: '.codex/hooks.json',
  mcpConfigPath: '.codex/mcp.json',
  rules: [
    { template: 'codex.md', dest: '.codex/rules/aide-memory.md' },
  ],

  ruleFrontmatter: '',
  ruleNotes: '',
  ruleToolId: 'codex',

  supportsHooks: false,
  supportsMcp: false,
  supportsRules: false,

  eventNameMap: {
    'session-start':         null,
    'pre-compact':           null,
    'stop':                  null,
    'pre-prompt':            null,
    'pre-read':              null,
    'pre-edit':              null,
    'pre-search':            null,
    'pre-recall':            null,
    'post-tool-use-recall':  null,
    'post-remember':         null,
    'post-search':           null,
  },

  matcherMap: {
    'read':              null,
    'edit':              null,
    'write':             null,
    'search':            null,
    'glob':              null,
    'mcp-aide-recall':   null,
    'mcp-aide-remember': null,
    'mcp-aide-update':   null,
    'mcp-aide-forget':   null,
    'mcp-aide-search':   null,
  },

  buildHookConfig(_args: HookConfigArgs): object {
    // Inert: all events map to null so translateEvents returns empty. Return
    // an empty object shape so tests that exercise this path don't crash.
    return {};
  },

  buildMcpConfig(_args: McpConfigArgs): object {
    return {};
  },

  detectRuntime(_env: NodeJS.ProcessEnv): boolean {
    // Inert adapter — never claims the runtime. Real detection logic lands
    // when Codex onboarding happens (follow EDITOR_ONBOARDING_GUIDE.md).
    return false;
  },

  translateInput(raw: Record<string, unknown>): Record<string, unknown> {
    return raw;
  },

  translateOutput(_emit: HookEmit): string {
    return '';
  },
};
