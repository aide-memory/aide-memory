/**
 * WindsurfAdapter — Codeium Windsurf integration.
 *
 * Phase C1 scope: inert. Rule template exists
 * (`src/templates/rules/windsurf.md`) but init does NOT render it today —
 * matches pre-refactor behavior.
 *
 * See src/memory/editors/codex.ts for the pattern notes. When onboarding
 * Windsurf for real, follow docs/specs/EDITOR_ONBOARDING_GUIDE.md.
 */

import { EditorAdapter, HookConfigArgs, McpConfigArgs, HookEmit } from './types';

export const windsurfAdapter: EditorAdapter = {
  id: 'windsurf',
  displayName: 'Windsurf',

  hookConfigPath: '.windsurf/hooks.json',
  mcpConfigPath: '.windsurf/mcp.json',
  rules: [
    { template: 'windsurf.md', dest: '.windsurf/rules/aide-memory.md' },
  ],

  ruleFrontmatter: '',
  ruleNotes: '',
  ruleToolId: 'windsurf',

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
