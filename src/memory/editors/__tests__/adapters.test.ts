import { describe, it, expect } from 'vitest';
import {
  claudeCodeAdapter,
  cursorAdapter,
  codexAdapter,
  copilotAdapter,
  windsurfAdapter,
  ADAPTERS,
  adaptersWithRules,
  adaptersWithHooks,
  adaptersWithMcp,
} from '../index';
import { HOOK_EVENTS, HookEventId, HookMatcher } from '../../hooks/events';
import { translateEvents } from '../build';

/**
 * Golden-fixture tests for the editor adapters. Complements
 * `src/templates/__tests__/rules.test.ts` (rule-rendering) and
 * `src/memory/__tests__/hooks.test.ts` (dispatcher). The assertions here
 * pin the adapters' CONFIG OUTPUT SHAPES so any future change to HOOK_EVENTS,
 * adapter maps, or build.ts accidentally producing different output fires an
 * obvious red.
 *
 * Byte-identical invariant context: when the adapter pattern was extracted
 * in Phase C1, the pre-refactor `init.ts` generated .claude/settings.json
 * with a specific hooks shape (see docs/specs/CURSOR_ONBOARDING.md §3.2).
 * The `expected` hardcoded fixtures below capture that exact shape. If these
 * tests break, either the refactor drifted OR you intentionally changed
 * editor config output — in which case update the fixtures AND bump the
 * auto-update version stamp in init.ts so existing projects pick it up.
 */

const PACKAGE_ROOT = '/pkg-root'; // dummy path — all tests assert relative shape

describe('ADAPTERS registry', () => {
  it('exports 5 adapters in a known order', () => {
    expect(ADAPTERS).toHaveLength(5);
    expect(ADAPTERS.map((a) => a.id)).toEqual([
      'claude-code',
      'cursor',
      'codex',
      'copilot',
      'windsurf',
    ]);
  });

  it('every adapter declares all HookEventId keys in eventNameMap (null or string)', () => {
    const hookIds: HookEventId[] = HOOK_EVENTS.map((e) => e.id);
    for (const adapter of ADAPTERS) {
      for (const id of hookIds) {
        expect(adapter.eventNameMap).toHaveProperty(id);
        const v = adapter.eventNameMap[id];
        expect(v === null || typeof v === 'string').toBe(true);
      }
    }
  });

  it('every adapter declares all HookMatcher keys in matcherMap', () => {
    const seenMatchers = new Set<HookMatcher>();
    for (const event of HOOK_EVENTS) {
      if (event.matchers) for (const m of event.matchers) seenMatchers.add(m);
    }
    for (const adapter of ADAPTERS) {
      for (const m of seenMatchers) {
        expect(adapter.matcherMap).toHaveProperty(m);
      }
    }
  });

  it('capability-flag helpers partition ADAPTERS correctly (C2 baseline)', () => {
    // C2 baseline (post-2026-04-23 cursor activation): Cursor joins hooks +
    // mcp. Codex/Copilot/Windsurf still inert. If this test breaks because
    // another adapter flipped a flag, update the expected arrays here +
    // document in CURSOR_ONBOARDING.md § phase status.
    expect(adaptersWithHooks().map((a) => a.id)).toEqual(['claude-code', 'cursor']);
    expect(adaptersWithMcp().map((a) => a.id)).toEqual(['claude-code', 'cursor']);
    expect(adaptersWithRules().map((a) => a.id)).toEqual(['claude-code', 'cursor']);
  });
});

describe('claudeCodeAdapter.buildHookConfig — byte-identical shape', () => {
  it('produces the exact shape .claude/settings.json hooks key has always had', () => {
    const output = claudeCodeAdapter.buildHookConfig({ packageRoot: PACKAGE_ROOT });

    const expected = {
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/session-start-clear.sh`, timeout: 10 }] },
        ],
        PreCompact: [
          { hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/pre-compact-save.sh`, timeout: 30 }] },
        ],
        Stop: [
          { hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/stop-remember.sh`, timeout: 30 }] },
        ],
        UserPromptSubmit: [
          { hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/detect-correction.sh`, timeout: 5 }] },
        ],
        PreToolUse: [
          { matcher: 'Read',  hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/pre-read-recall.sh`, timeout: 10 }] },
          { matcher: 'Edit',  hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/pre-edit-recall.sh`, timeout: 10 }] },
          { matcher: 'Write', hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/pre-edit-recall.sh`, timeout: 10 }] },
          { matcher: 'Grep',  hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/pre-search-nudge.sh`, timeout: 10 }] },
          { matcher: 'Glob',  hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/pre-search-nudge.sh`, timeout: 10 }] },
          { matcher: 'mcp__aide-memory__aide_recall', hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/track-recall.sh`, timeout: 5 }] },
        ],
        PostToolUse: [
          { matcher: 'mcp__aide-memory__aide_recall',   hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/track-recall-post.sh`, timeout: 5 }] },
          { matcher: 'mcp__aide-memory__aide_remember', hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/track-remember.sh`, timeout: 5 }] },
          { matcher: 'mcp__aide-memory__aide_update',   hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/track-remember.sh`, timeout: 5 }] },
          { matcher: 'mcp__aide-memory__aide_forget',   hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/track-remember.sh`, timeout: 5 }] },
          { matcher: 'mcp__aide-memory__aide_search',   hooks: [{ type: 'command', command: `bash ${PACKAGE_ROOT}/scripts/hooks/track-search.sh`, timeout: 5 }] },
        ],
      },
    };

    expect(output).toEqual(expected);
  });
});

describe('claudeCodeAdapter.buildMcpConfig', () => {
  it('produces standard {mcpServers: {"aide-memory": {command, args}}} shape', () => {
    const output = claudeCodeAdapter.buildMcpConfig({
      serverEntry: '/pkg/dist/memory/cli.js',
      projectRoot: '/my/project',
    });
    expect(output).toEqual({
      mcpServers: {
        'aide-memory': {
          command: 'node',
          args: ['/pkg/dist/memory/cli.js', '/my/project'],
        },
      },
    });
  });
});

describe('cursorAdapter.buildHookConfig — shape for Phase C2 activation', () => {
  // Cursor is `supportsHooks: false` in C1 so init doesn't write this output
  // today. Pinning the shape now means C2 can flip the flag + immediately
  // exercise a known contract.
  it('produces {version: 1, hooks: {...}} with Cursor event-name + matcher conventions', () => {
    const output = cursorAdapter.buildHookConfig({ packageRoot: PACKAGE_ROOT }) as {
      version: number;
      hooks: Record<string, Array<{ matcher?: string; type: string; command: string; timeout: number }>>;
    };

    expect(output.version).toBe(1);
    expect(output.hooks).toBeTypeOf('object');

    // Cursor event names (camelCase)
    expect(output.hooks.sessionStart).toBeDefined();
    expect(output.hooks.preCompact).toBeDefined();
    expect(output.hooks.stop).toBeDefined();
    expect(output.hooks.beforeSubmitPrompt).toBeDefined();
    expect(output.hooks.preToolUse).toBeDefined();
    expect(output.hooks.postToolUse).toBeDefined();

    // Critical: pre-read routes to preToolUse matcher=Read (NOT beforeReadFile).
    // See cursor.ts docstring + forum #150520 for rationale.
    const readEntry = output.hooks.preToolUse.find((e) => e.matcher === 'Read');
    expect(readEntry).toBeDefined();
    expect(readEntry?.command).toContain('pre-read-recall.sh');

    // Cursor Glob is unsupported → no Glob matcher should appear.
    const globEntries = output.hooks.preToolUse.filter((e) => e.matcher === 'Glob');
    expect(globEntries).toHaveLength(0);

    // MCP matchers use Cursor's `MCP:<tool>` syntax (no server-name segment).
    const mcpRecall = output.hooks.preToolUse.find((e) => e.matcher === 'MCP:aide_recall');
    expect(mcpRecall).toBeDefined();
  });

  it('sessionStart entry has no matcher key (Cursor session-level event)', () => {
    const output = cursorAdapter.buildHookConfig({ packageRoot: PACKAGE_ROOT }) as {
      hooks: Record<string, Array<{ matcher?: string; command: string }>>;
    };
    expect(output.hooks.sessionStart[0]).not.toHaveProperty('matcher');
  });
});

describe('cursorAdapter.buildMcpConfig — shape for Phase C2 activation', () => {
  it('adds type: "stdio" and uses ${workspaceFolder} interpolation', () => {
    const output = cursorAdapter.buildMcpConfig({
      serverEntry: '/pkg/dist/memory/cli.js',
      projectRoot: '/my/project', // ignored — Cursor uses workspaceFolder
    });
    expect(output).toEqual({
      mcpServers: {
        'aide-memory': {
          type: 'stdio',
          command: 'node',
          args: ['/pkg/dist/memory/cli.js', '${workspaceFolder}'],
        },
      },
    });
  });
});

describe('inert adapters (codex, copilot, windsurf)', () => {
  const INERT = [codexAdapter, copilotAdapter, windsurfAdapter];
  for (const adapter of INERT) {
    it(`${adapter.id} supportsHooks/supportsMcp/supportsRules all false`, () => {
      expect(adapter.supportsHooks).toBe(false);
      expect(adapter.supportsMcp).toBe(false);
      expect(adapter.supportsRules).toBe(false);
    });

    it(`${adapter.id} buildHookConfig returns empty (no matching maps)`, () => {
      // All eventNameMap values are null → translateEvents returns [], so
      // groupByEvent produces empty Map, so wrapped object has empty hooks.
      const entries = translateEvents(adapter, { packageRoot: PACKAGE_ROOT });
      expect(entries).toHaveLength(0);
    });

    it(`${adapter.id} declares a rule template + destination`, () => {
      expect(adapter.rules).toHaveLength(1);
      expect(adapter.rules[0].template).toBeTruthy();
      expect(adapter.rules[0].dest).toBeTruthy();
      expect(adapter.ruleToolId).toBe(adapter.id);
    });
  }
});
