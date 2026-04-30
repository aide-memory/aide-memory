/**
 * EditorAdapter — per-editor translation contract for aide-memory's hooks, MCP
 * config, and rules file. Adapters provide ONLY editor-specific translations
 * (event-name map, matcher map, output wrappers); the heavy lifting of
 * iterating HOOK_EVENTS and writing files lives in shared helpers
 * (src/memory/editors/build.ts + src/memory/init.ts).
 *
 * Design context: see docs/specs/CURSOR_ONBOARDING.md §3 + memory #329 point
 * #2 (single-source manifest + adapter translation maps).
 *
 * Phase C1 invariant (zero behavior change):
 *   - Only `claude-code` adapter's `hookConfig` + `mcpConfig` are invoked from
 *     init today. The others provide rules metadata only.
 *   - Cursor/codex/copilot/windsurf `hookConfig`/`mcpConfig` fields are present
 *     for future phases (C2+ wires Cursor, later phases the rest). Callers
 *     that invoke them today should check `supportsHooks` / `supportsMcp` if
 *     they want to stay inside the C1 behavior contract.
 */

import { HookEventId, HookMatcher } from '../hooks/events';

/**
 * Stable set of editor identifiers known to aide-memory. Adding a new editor
 * = add an id here + register an adapter in src/memory/editors/index.ts.
 */
export type EditorId =
  | 'claude-code'
  | 'cursor'
  | 'codex'
  | 'copilot'
  | 'windsurf';

/**
 * One rule template + destination pair. Each adapter may declare zero or more
 * (today all 5 declare exactly one). An empty array means "this adapter does
 * not write a rule file in current phase" — useful as a future-scope marker.
 */
export interface RuleSpec {
  /** Template filename under src/templates/rules/ (e.g. 'claude-code.md'). */
  template: string;
  /** Destination path relative to projectRoot (e.g. '.claude/rules/aide-memory.md'). */
  dest: string;
}

/**
 * Arguments passed to an adapter's mcpConfig() so it can interpolate paths.
 * All paths are absolute; adapters may rewrite to workspace-relative tokens
 * (e.g. Cursor's `${workspaceFolder}`) in their own mcpConfig output.
 */
export interface McpConfigArgs {
  /** Absolute path to the compiled MCP server entry (dist/memory/cli.js). */
  serverEntry: string;
  /** Absolute path to the user project root. */
  projectRoot: string;
}

/**
 * Arguments passed to an adapter's hookConfig() so it can produce absolute
 * `bash /path/to/script.sh` invocations or equivalent.
 */
export interface HookConfigArgs {
  /** Absolute path to aide-memory's package root (parent of scripts/hooks/). */
  packageRoot: string;
}

export interface EditorAdapter {
  /** Stable editor identifier — matches EditorId union. */
  id: EditorId;
  /** Human-readable name for logs / docs. */
  displayName: string;

  // ── File destinations ────────────────────────────────────────────────────
  /** Relative path for editor's hook config file ('.claude/settings.json'). */
  hookConfigPath: string;
  /** Relative path for editor's MCP config file ('.mcp.json'). */
  mcpConfigPath: string;
  /**
   * Rule file specs. Currently a single entry per editor, but modelled as an
   * array to support future editors that install multiple rule files.
   *
   * `template` field is historical — post-C1.5c the shared body at
   * src/templates/rules/shared/body.md is the canonical source. The
   * `template` field is retained for identification/debugging only; the
   * actual render uses buildRules() with shared/body.md + adapter's
   * rule{Frontmatter,Notes,ToolId} below.
   */
  rules: RuleSpec[];

  /**
   * Editor-specific content prepended to the shared body during buildRules().
   * Used for YAML frontmatter (e.g. Cursor's `---\ndescription: ...\n---\n`).
   * Empty string for editors without frontmatter (most of them).
   *
   * Kept inline on the adapter rather than in a separate file because the
   * content is small (cursor's is 5 lines) and co-locating it with the rest
   * of the adapter's editor-specific config is clearer than file shuffling.
   */
  ruleFrontmatter: string;

  /**
   * Editor-specific caveats appended into the shared body's {{editor_notes}}
   * placeholder (which lives just after the Hooks section). Used for
   * per-editor behavioral quirks that agents should know about. Empty for
   * editors without quirks.
   *
   * Example: Cursor needs a note about agent_message vs additionalContext.
   */
  ruleNotes: string;

  /**
   * Editor token used as the `tool` value in memories' generated_by field.
   * Substituted into the shared body at {{tool_id}}. Distinct from `id`
   * because `id` is the internal adapter identifier while this is the
   * string that appears in stored memory JSON and guides how memories
   * attribute their origin.
   */
  ruleToolId: string;

  // ── Capability flags ─────────────────────────────────────────────────────
  /**
   * True if this adapter currently contributes a hook config file on init.
   * False means init skips its buildHookConfig() — used in C1 to keep Cursor/
   * codex/copilot/windsurf rules-only until later phases wire their hooks.
   *
   * These flags are intentionally NOT about platform capability — they're
   * about whether the current aide-memory phase wires init for this concern.
   * Flipping a flag is the opt-in signal when onboarding a new phase
   * (e.g. C2 flips cursor's supportsHooks + supportsMcp to true).
   */
  supportsHooks: boolean;
  /** Same contract as supportsHooks, for MCP config. */
  supportsMcp: boolean;
  /**
   * Same contract as supportsHooks, for rule files. Only adapters with this
   * flag true have their `rules` entries rendered at init today.
   *
   * C1 defaults:
   *   - claude-code: true (existing behavior)
   *   - cursor:      true (existing behavior)
   *   - codex/copilot/windsurf: false (templates exist but not rendered today)
   */
  supportsRules: boolean;
  /**
   * True if this adapter needs the dynamic "## Current memory context"
   * section (priority:always memories + injection content + version notice)
   * appended to its rules file on every memory/config write.
   *
   * Cursor: true — its `sessionStart.additional_context` is broken
   * (forum #158452, staff-confirmed), so the rules file with `alwaysApply: true`
   * is the only viable channel for session-start content.
   *
   * Claude Code: false — `SessionStart` hook works, content is injected as
   * `additionalContext`. Baking the same content into the rules file would
   * duplicate it (and inflate the static teaching content unnecessarily).
   */
  needsDynamicRules?: boolean;

  // ── Translation maps ────────────────────────────────────────────────────
  /**
   * Map from canonical HOOK_EVENTS id → editor-specific event name (or null
   * if the editor doesn't support that event — it'll be silently skipped).
   * All HookEventIds must be present as keys even when value is null, so the
   * TypeScript compiler catches additions to the manifest.
   */
  eventNameMap: Record<HookEventId, string | null>;

  /**
   * Map from canonical matcher token → editor-specific matcher (or null if
   * the editor has no matcher for this tool type — skipped). All HookMatcher
   * values must appear as keys so the compiler catches manifest additions.
   */
  matcherMap: Record<HookMatcher, string | null>;

  // ── Output builders ─────────────────────────────────────────────────────
  /**
   * Build the adapter's hook config object given the expanded entries. Called
   * by build.ts buildHookConfig(). Adapters decide the shape (Claude Code
   * uses `hooks: { SessionStart: [...], PreToolUse: [...], ... }` with per-
   * event arrays; Cursor uses `version: 1, hooks: { sessionStart: [...], ... }`
   * with different matcher grouping).
   *
   * Implementations MUST filter out entries whose event/matcher maps return
   * null — this is the single place where "unsupported" entries get dropped.
   */
  buildHookConfig(args: HookConfigArgs): object;

  /**
   * Build the adapter's MCP config object. Claude Code returns `{mcpServers:
   * {'aide-memory': {command, args}}}`; Cursor adds `type: 'stdio'` + uses
   * `${workspaceFolder}` interpolation.
   */
  buildMcpConfig(args: McpConfigArgs): object;

  // ── Runtime translation (Phase C3) ──────────────────────────────────────
  /**
   * Return true if this adapter believes it's the one running the current
   * hook invocation. Based on env vars the host editor sets when spawning
   * the hook command. The dispatcher iterates ADAPTERS and picks the first
   * whose detectRuntime returns true; falls back to claude-code as the
   * default (most common case + historical behavior).
   *
   * Keep these checks CHEAP and ENV-ONLY — called once per hook fire, should
   * not do filesystem IO. See memory #328 for Cursor's env vars.
   */
  detectRuntime(env: NodeJS.ProcessEnv): boolean;

  /**
   * Translate the host editor's stdin envelope to aide-memory's canonical
   * HookInput shape. Claude Code IS the canonical shape, so its adapter is
   * identity. Cursor renames `conversation_id` → `session_id` and
   * `workspace_roots[0]` → `cwd` so handlers can stay editor-agnostic.
   *
   * Receives raw parsed JSON from stdin; returns a normalized object the
   * handlers in handlers.ts can consume directly.
   */
  translateInput(raw: Record<string, unknown>): Record<string, unknown>;

  /**
   * Translate aide-memory's canonical HookEmit descriptor to the host
   * editor's expected stdout shape. Claude Code's adapter produces the
   * shapes handlers historically wrote directly (decision:block envelope,
   * hookSpecificOutput.additionalContext, plain SessionStart text, etc).
   * Cursor remaps: block → `{permission: "deny", user_message}`; soft/
   * additionalContext / systemMessage → empty string (Cursor has no
   * channel for those — see CURSOR_ONBOARDING.md §5 "accept the gap").
   *
   * Returning '' is the signal to the dispatcher that no stdout should be
   * emitted (silent success). Returning a non-empty string means emit it
   * verbatim to stdout.
   */
  translateOutput(emit: HookEmit): string;
}

/**
 * Canonical emission descriptor produced by handlers + translated by the
 * active adapter's translateOutput. Discriminated by `kind`.
 *
 * Phase C3 introduces this type — before C3, handlers wrote Claude Code
 * stdout shapes directly. Post-C3, handlers build these descriptors and the
 * dispatcher routes through the adapter.
 */
export type HookEmit =
  | {
      kind: 'block';
      /** Message shown to agent + rendered as user_message on Cursor deny. */
      reason: string;
      /**
       * Source hook event. Affects how adapters render the block:
       *   - 'preToolUse' (default): Cursor emits `{permission: "deny",
       *     user_message}`; Claude Code emits `{decision: "block", reason}`.
       *   - 'stop': Cursor emits `{followup_message}` (its reprompt channel);
       *     Claude Code still emits `{decision: "block", reason}`.
       *   - 'userPromptSubmit': Cursor emits `{continue: false, user_message}`
       *     (beforeSubmitPrompt can block the submission); Claude Code emits
       *     `{decision: "block", reason}`.
       *
       * Claude Code's adapter ignores this field (always emits the same
       * decision:block shape regardless of source — Claude Code's hook
       * protocol is unified). Only Cursor differentiates because its hook
       * protocol has per-event output shapes.
       */
      event?: 'preToolUse' | 'stop' | 'userPromptSubmit';
      /** Optional branded status line (Claude Code only — ignored by Cursor). */
      systemMessage?: string;
    }
  | {
      kind: 'additionalContext';
      /** Hook event name (e.g. 'PreToolUse', 'SessionStart') — Claude Code wrapper. */
      event: string;
      /** Context payload injected into the agent's conversation. */
      context: string;
      /** Optional branded status line (Claude Code only). */
      systemMessage?: string;
    }
  | {
      kind: 'systemMessage';
      /** Branded status line only — used when nothing else needs emitting. */
      text: string;
    }
  | {
      /** Explicit no-op. Emit nothing to stdout. */
      kind: 'silent';
    };
