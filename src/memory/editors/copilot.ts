/**
 * CopilotAdapter — GitHub Copilot integration.
 *
 * Phase C1 scope: inert. Rule template exists
 * (`src/templates/rules/copilot.md`) but init does NOT render it today —
 * matches pre-refactor behavior.
 *
 * See src/memory/editors/codex.ts for the pattern notes. When onboarding
 * Copilot for real, follow docs/specs/EDITOR_ONBOARDING_GUIDE.md.
 */

import { EditorAdapter, HookConfigArgs, McpConfigArgs, HookEmit } from './types';

export const copilotAdapter: EditorAdapter = {
  id: 'copilot',
  displayName: 'GitHub Copilot',

  hookConfigPath: '.github/copilot/hooks.json',
  mcpConfigPath: '.github/copilot/mcp.json',
  rules: [
    { template: 'copilot.md', dest: '.github/copilot-instructions.md' },
  ],

  ruleFrontmatter: '',
  ruleNotes: '',
  ruleToolId: 'copilot',

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
    return {};
  },

  buildMcpConfig(_args: McpConfigArgs): object {
    return {};
  },

  detectRuntime(_env: NodeJS.ProcessEnv): boolean {
    return false;
  },

  translateInput(raw: Record<string, unknown>): Record<string, unknown> {
    return raw;
  },

  translateOutput(_emit: HookEmit): string {
    return '';
  },
};
