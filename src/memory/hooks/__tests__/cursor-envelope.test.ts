import { describe, it, expect } from 'vitest';
import { cursorAdapter, claudeCodeAdapter, detectActiveAdapter, ADAPTERS } from '../../editors';
import { HookEmit } from '../../editors/types';

/**
 * Phase C3 gate: runtime dispatcher + envelope translation.
 *
 * Tests the adapter-layer translations that make Cursor's hook execution
 * work end-to-end. Before these translations existed, `.cursor/hooks.json`
 * would be written correctly by init (C2) but actual hook dispatch would
 * silently no-op because Cursor's stdin envelope uses different field names
 * than Claude Code's.
 *
 * See src/memory/editors/cursor.ts for the full translation rationale +
 * CURSOR_ONBOARDING.md §3 for design context.
 */

describe('detectActiveAdapter', () => {
  it('picks cursor when CURSOR_VERSION env var is set', () => {
    const adapter = detectActiveAdapter({ CURSOR_VERSION: '0.43.0' } as NodeJS.ProcessEnv);
    expect(adapter.id).toBe('cursor');
  });

  it('picks cursor when CURSOR_PROJECT_DIR is set even without CURSOR_VERSION', () => {
    const adapter = detectActiveAdapter({ CURSOR_PROJECT_DIR: '/workspace' } as NodeJS.ProcessEnv);
    expect(adapter.id).toBe('cursor');
  });

  it('picks claude-code when CLAUDECODE=1 is set', () => {
    const adapter = detectActiveAdapter({ CLAUDECODE: '1' } as NodeJS.ProcessEnv);
    expect(adapter.id).toBe('claude-code');
  });

  it('falls back to claude-code when no adapter claims the runtime', () => {
    const adapter = detectActiveAdapter({} as NodeJS.ProcessEnv);
    expect(adapter.id).toBe('claude-code');
  });

  it('prefers cursor when BOTH CURSOR_VERSION and CLAUDECODE are set', () => {
    // Claude-code's detectRuntime yields to cursor's stronger signal when
    // both are present. Real-world trigger: developer running `claude`
    // inside a Cursor workspace (Cursor exported CURSOR_VERSION
    // globally). Also covers test environments spawned under a Claude
    // Code wrapper where CLAUDECODE is set but a cursor smoke run
    // explicitly sets CURSOR_VERSION.
    const adapter = detectActiveAdapter({
      CURSOR_VERSION: '0.43.0',
      CLAUDECODE: '1',
    } as NodeJS.ProcessEnv);
    expect(adapter.id).toBe('cursor');
  });
});

describe('cursorAdapter.translateInput', () => {
  it('renames conversation_id → session_id', () => {
    const out = cursorAdapter.translateInput({ conversation_id: 'abc-123' });
    expect(out.session_id).toBe('abc-123');
  });

  it('copies workspace_roots[0] → cwd', () => {
    const out = cursorAdapter.translateInput({ workspace_roots: ['/my/project', '/other'] });
    expect(out.cwd).toBe('/my/project');
  });

  it('preserves existing session_id/cwd if caller already provided them', () => {
    const out = cursorAdapter.translateInput({
      session_id: 'existing',
      cwd: '/existing',
      conversation_id: 'new',
      workspace_roots: ['/new'],
    });
    expect(out.session_id).toBe('existing');
    expect(out.cwd).toBe('/existing');
  });

  it('passes through unrelated fields unchanged', () => {
    const out = cursorAdapter.translateInput({
      conversation_id: 'c',
      tool_name: 'Read',
      tool_input: { file_path: '/x' },
      custom_cursor_field: 'hello',
    });
    expect(out.tool_name).toBe('Read');
    expect(out.tool_input).toEqual({ file_path: '/x' });
    expect(out.custom_cursor_field).toBe('hello');
  });

  it('handles empty workspace_roots array gracefully (no cwd populated)', () => {
    const out = cursorAdapter.translateInput({ workspace_roots: [] });
    expect(out.cwd).toBeUndefined();
  });

  it('handles non-string workspace_roots entries gracefully', () => {
    const out = cursorAdapter.translateInput({ workspace_roots: [null, '/fallback'] } as any);
    // Only the first entry is consulted. null → cwd stays undefined.
    expect(out.cwd).toBeUndefined();
  });

  it('copies tool_output → tool_response (Cursor postToolUse field-name remap)', () => {
    // Regression test for memory #364: trackRecallPost reads
    // input.tool_response to parse [N] memory IDs from the recall response,
    // but Cursor sends the field as `tool_output`. Without this remap,
    // IDs never get tracked on Cursor and per-Read soft nudges fire
    // redundantly after the agent has already recalled.
    const cursorPostToolUse = {
      conversation_id: 'abc',
      tool_name: 'MCP:aide_recall',
      tool_input: { paths: ['src/api/routes.ts'] },
      tool_output: '{"content":[{"type":"text","text":"## Technical Context\\n- [7] Rate limit\\n- [6] Error responses"}],"isError":false}',
    };
    const out = cursorAdapter.translateInput(cursorPostToolUse);
    expect(out.tool_response).toBe(cursorPostToolUse.tool_output);
    // Original tool_output is preserved (don't drop, just copy).
    expect(out.tool_output).toBe(cursorPostToolUse.tool_output);
  });

  it('does NOT clobber tool_response if already present (Claude Code envelope passes through)', () => {
    // Claude Code envelopes already have tool_response. Don't overwrite
    // them with tool_output if both happen to be present (defensive).
    const out = cursorAdapter.translateInput({
      tool_response: 'canonical-shape',
      tool_output: 'cursor-shape',
    });
    expect(out.tool_response).toBe('canonical-shape');
  });

  it('claude-code adapter translateInput is identity', () => {
    const input = { session_id: 'x', cwd: '/y', tool_input: { file_path: '/z' } };
    expect(claudeCodeAdapter.translateInput(input)).toEqual(input);
  });
});

describe('cursorAdapter.translateOutput', () => {
  it('translates block → {permission: "deny", user_message}', () => {
    const emit: HookEmit = { kind: 'block', reason: '4 memories for /x — call aide_recall' };
    const out = cursorAdapter.translateOutput(emit);
    const parsed = JSON.parse(out);
    expect(parsed.permission).toBe('deny');
    expect(parsed.user_message).toBe('4 memories for /x — call aide_recall');
  });

  it('block emit IGNORES systemMessage (Cursor has no equivalent channel)', () => {
    const emit: HookEmit = {
      kind: 'block',
      reason: 'blocked',
      systemMessage: 'aide-memory · branded',
    };
    const out = cursorAdapter.translateOutput(emit);
    const parsed = JSON.parse(out);
    expect(parsed).not.toHaveProperty('systemMessage');
    expect(parsed.permission).toBe('deny');
  });

  it('translates additionalContext for preToolUse → {permission:"allow", agent_message} (audience-mapping per memory #359)', () => {
    // Cursor's preToolUse exposes `agent_message` as the agent-context
    // channel — equivalent to Claude Code's hookSpecificOutput.additionalContext.
    // Earlier framing of this as a "documented gap" was bias-driven (memory
    // #358) — the channel exists; we just weren't using it.
    const emit: HookEmit = { kind: 'additionalContext', event: 'PreToolUse', context: 'nudge' };
    const out = cursorAdapter.translateOutput(emit);
    const parsed = JSON.parse(out);
    expect(parsed.permission).toBe('allow');
    expect(parsed.agent_message).toBe('nudge');
    expect(parsed).not.toHaveProperty('user_message'); // no chrome → no user_message
  });

  it('additionalContext for preToolUse with systemMessage → emits user_message anyway (forward-compat + diagnostic, even though Cursor 3.2.11 doesn\'t render under allow)', () => {
    // Empirically Cursor doesn't render user_message under permission:"allow"
    // today (verified 2026-04-27). We still emit it because:
    //   (a) It surfaces in Cursor's Hooks Output panel as part of the
    //       OUTPUT JSON — useful for diagnostic / dev visibility.
    //   (b) Forward-compat: if Cursor adds soft user_message rendering
    //       later, chrome surfaces automatically without an adapter update.
    const emit: HookEmit = {
      kind: 'additionalContext',
      event: 'PreToolUse',
      context: 'Call aide_recall({paths: [...]}).',
      systemMessage: 'aide-memory · prompting aide_recall for scoped memories',
    };
    const out = cursorAdapter.translateOutput(emit);
    const parsed = JSON.parse(out);
    expect(parsed.permission).toBe('allow');
    expect(parsed.agent_message).toBe('Call aide_recall({paths: [...]}).');
    expect(parsed.user_message).toBe('aide-memory · prompting aide_recall for scoped memories');
  });

  it('additionalContext for sessionStart → empty (Cursor additional_context is broken per forum #158452; rules-file regen is the workaround)', () => {
    const emit: HookEmit = {
      kind: 'additionalContext',
      event: 'SessionStart',
      context: 'project-wide preferences + guidelines',
    };
    expect(cursorAdapter.translateOutput(emit)).toBe('');
  });

  it('translates standalone systemMessage → empty (no Cursor channel for non-deny chrome, per #359 revised)', () => {
    // Cursor's user_message only renders when paired with permission:"deny"
    // or continue:false. Standalone systemMessage emit has no event-anchored
    // render path on Cursor — drop entirely. Compare to Claude Code, which
    // surfaces standalone systemMessage as inline status chrome.
    const emit: HookEmit = { kind: 'systemMessage', text: 'aide-memory · hello' };
    expect(cursorAdapter.translateOutput(emit)).toBe('');
  });

  it('block with systemMessage on preToolUse → splits chrome (user_message) from instruction (agent_message)', () => {
    const out = cursorAdapter.translateOutput({
      kind: 'block',
      reason: 'Call aide_recall({ids: [7,6]}).',
      systemMessage: 'aide-memory · prompting aide_recall for scoped memories (expected flow)',
    });
    const parsed = JSON.parse(out);
    expect(parsed.permission).toBe('deny');
    expect(parsed.user_message).toBe('aide-memory · prompting aide_recall for scoped memories (expected flow)');
    expect(parsed.agent_message).toBe('Call aide_recall({ids: [7,6]}).');
  });

  it('translates silent → empty string', () => {
    expect(cursorAdapter.translateOutput({ kind: 'silent' })).toBe('');
  });

  it('translates block with event:"stop" → {followup_message} (Cursor reprompt channel)', () => {
    const out = cursorAdapter.translateOutput({
      kind: 'block',
      event: 'stop',
      reason: 'A correction from this turn wasnt stored. Call aide_remember.',
    });
    const parsed = JSON.parse(out);
    expect(parsed.followup_message).toBe('A correction from this turn wasnt stored. Call aide_remember.');
    expect(parsed).not.toHaveProperty('permission');
    expect(parsed).not.toHaveProperty('user_message');
  });

  it('translates block with event:"userPromptSubmit" → {continue:false, user_message}', () => {
    const out = cursorAdapter.translateOutput({
      kind: 'block',
      event: 'userPromptSubmit',
      reason: 'prompt blocked',
    });
    const parsed = JSON.parse(out);
    expect(parsed.continue).toBe(false);
    expect(parsed.user_message).toBe('prompt blocked');
  });

  it('block without event defaults to preToolUse shape (back-compat)', () => {
    const out = cursorAdapter.translateOutput({
      kind: 'block',
      reason: 'blocked',
    });
    const parsed = JSON.parse(out);
    expect(parsed.permission).toBe('deny');
    expect(parsed.user_message).toBe('blocked');
  });
});

describe('correction one-turn-delay flow (Phase C5)', () => {
  // Integration-ish test: simulate beforeSubmitPrompt correction detection +
  // next Stop hook delivery. The flow:
  //   1. Cursor fires beforeSubmitPrompt → detectCorrection handler writes
  //      correction-pending flag. Cursor drops our additionalContext emit
  //      (no channel), so agent doesn't see the nudge THIS turn.
  //   2. Agent completes turn WITHOUT calling aide_remember.
  //   3. Next Stop hook fires → sees flag → emits reminder via Cursor's
  //      followup_message channel (NOT preToolUse-style deny).
  // This test validates step 3's emit shape is correct for Cursor.

  it('Stop hook with systemMessage prepends chrome into followup_message (per #359 revised — user_message not rendered on stop)', () => {
    // Empirically verified 2026-04-27: Cursor accepts user_message on stop
    // but does NOT render it in chat. Only followup_message renders (as
    // the next-turn prompt). To surface chrome to the user we prepend it
    // into followup_message: "<chrome> — <reason>".
    const reminder = "A correction from this turn wasn't stored. Call aide_remember...";
    const emitDescriptor = {
      kind: 'block' as const,
      event: 'stop' as const,
      reason: reminder,
      systemMessage: 'aide-memory · correction reminder',
    };
    const out = cursorAdapter.translateOutput(emitDescriptor);
    const parsed = JSON.parse(out);
    expect(parsed.followup_message).toBe(`aide-memory · correction reminder — ${reminder}`);
    // No user_message emitted — Cursor doesn't render it on stop.
    expect(parsed).not.toHaveProperty('user_message');
    expect(parsed).not.toHaveProperty('permission');
    expect(parsed).not.toHaveProperty('systemMessage');
  });

  it('Stop hook without systemMessage emits followup_message-only (back-compat)', () => {
    const reminder = 'Something to consider.';
    const out = cursorAdapter.translateOutput({
      kind: 'block',
      event: 'stop',
      reason: reminder,
    });
    const parsed = JSON.parse(out);
    expect(parsed.followup_message).toBe(reminder);
    expect(parsed).not.toHaveProperty('user_message');
  });

  it('ANSI escape codes in systemMessage are stripped when routed to Cursor user_message (chat does not render terminal ANSI)', () => {
    // Brand-color sequence per memory #324: [38;2;0;194;203m...[0m
    const ansiChrome = '[38;2;0;194;203maide-memory · [0mprompting aide_recall';
    const out = cursorAdapter.translateOutput({
      kind: 'block',
      event: 'preToolUse',
      reason: 'Call aide_recall({ids: [7,6]}).',
      systemMessage: ansiChrome,
    });
    const parsed = JSON.parse(out);
    expect(parsed.user_message).toBe('aide-memory · prompting aide_recall');
    expect(parsed.user_message).not.toContain('');
    expect(parsed.user_message).not.toMatch(/\[\d/);
  });

  it('same Stop emit under Claude Code adapter produces decision:block (unchanged)', () => {
    const reminder = "A correction from this turn wasn't stored. Call aide_remember...";
    const out = claudeCodeAdapter.translateOutput({
      kind: 'block',
      event: 'stop',
      reason: reminder,
      systemMessage: 'aide-memory · correction reminder',
    });
    const parsed = JSON.parse(out);
    expect(parsed.decision).toBe('block');
    expect(parsed.reason).toBe(reminder);
    expect(parsed.systemMessage).toBe('aide-memory · correction reminder');
    // Claude Code ignores the event field — same shape regardless.
  });
});

describe('claudeCodeAdapter.translateOutput — byte-identical to pre-C3', () => {
  // These assertions pin the exact pre-C3 output shape so the C3 refactor
  // (routing emits through the adapter) didn't drift Claude Code behavior.

  it('block emit produces {decision, reason, systemMessage?}', () => {
    const out = claudeCodeAdapter.translateOutput({
      kind: 'block',
      reason: 'blocked',
      systemMessage: 'aide-memory · info',
    });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      decision: 'block',
      reason: 'blocked',
      systemMessage: 'aide-memory · info',
    });
  });

  it('block without systemMessage omits the systemMessage key', () => {
    const out = claudeCodeAdapter.translateOutput({ kind: 'block', reason: 'blocked' });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({ decision: 'block', reason: 'blocked' });
    expect(parsed).not.toHaveProperty('systemMessage');
  });

  it('additionalContext emit produces {hookSpecificOutput: {hookEventName, additionalContext}}', () => {
    const out = claudeCodeAdapter.translateOutput({
      kind: 'additionalContext',
      event: 'PreToolUse',
      context: 'N memories for path...',
    });
    const parsed = JSON.parse(out);
    expect(parsed).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: 'N memories for path...',
      },
    });
  });

  it('additionalContext with systemMessage adds the systemMessage sibling key', () => {
    const out = claudeCodeAdapter.translateOutput({
      kind: 'additionalContext',
      event: 'SessionStart',
      context: 'content',
      systemMessage: 'aide-memory · injected',
    });
    const parsed = JSON.parse(out);
    expect(parsed.systemMessage).toBe('aide-memory · injected');
    expect(parsed.hookSpecificOutput.additionalContext).toBe('content');
  });

  it('silent emit produces empty string', () => {
    expect(claudeCodeAdapter.translateOutput({ kind: 'silent' })).toBe('');
  });
});

describe('inert adapters (codex/copilot/windsurf) never claim runtime', () => {
  const INERT_IDS = ['codex', 'copilot', 'windsurf'];
  for (const id of INERT_IDS) {
    it(`${id} detectRuntime returns false even with every env var set`, () => {
      // Simulate a malformed env where many vars are set — inert adapters
      // should still return false, deferring to claude-code/cursor.
      const env = {
        CURSOR_VERSION: '0.43.0',
        CLAUDECODE: '1',
        CODEX_HOME: '/c',
        COPILOT_ACTIVE: '1',
        WINDSURF_PROJECT: '/w',
      } as unknown as NodeJS.ProcessEnv;
      // Direct adapter lookup — don't go through detectActiveAdapter since
      // that picks the first match and we want to assert the inert ones'
      // detectRuntime itself always returns false.
      const adapter = ADAPTERS.find((a) => a.id === id);
      expect(adapter).toBeDefined();
      expect(adapter!.detectRuntime(env)).toBe(false);
    });
  }
});
