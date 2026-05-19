/**
 * Claude Code hook output protocol — schema constants.
 *
 * SINGLE SOURCE OF TRUTH for "what fields can each hook event produce in its
 * stdout JSON." Every conformance test (TS + bash) validates against this
 * file. The constants are HAND-MAINTAINED from the official docs.
 *
 * Source: https://code.claude.com/docs/en/hooks
 * LAST_VERIFIED: 2026-05-06
 *
 * Drift defense:
 *   - On every release (per docs/RELEASING.md step 0), re-fetch the docs URL
 *     and reconcile any field changes here. Bump LAST_VERIFIED.
 *   - If a field set changed, update both this file AND the conformance
 *     test fixtures so the tests fail loudly until the new shape is
 *     implemented (or rejected) deliberately.
 *   - Static schema files always go stale eventually. The release-time
 *     re-verification + the empirical side-by-side run on real Claude Code
 *     are the human gates that catch undocumented platform changes.
 *
 * What this file is NOT:
 *   - Not a full JSON Schema (deliberate — keeps the diff against the docs
 *     readable). Just per-event whitelists/forbids.
 *   - Not Cursor's protocol (different doc, different shape — handled in
 *     adapter-level tests, not here).
 *
 * Why this exists at all:
 *   0.5.17 first attempt emitted `hookSpecificOutput.hookEventName: "Stop"
 *   + additionalContext: "..."` from the Stop handler. Claude Code rejected
 *   the JSON at runtime with "Invalid input" because Stop hooks do not
 *   support `hookSpecificOutput`. The class of bug is "we shipped output
 *   that doesn't match the platform's accepted schema." This file +
 *   conformance tests catch that class before users ever run it.
 */

export const LAST_VERIFIED = '2026-05-19';
export const PROTOCOL_DOCS_URL = 'https://code.claude.com/docs/en/hooks';

/** Fields allowed at the top level of ANY hook output. */
const COMMON_TOP_LEVEL = [
  'continue',
  'suppressOutput',
  'stopReason',
  'systemMessage',
  'decision', // legacy/optional on most events; required for Stop block
  'reason', // pairs with decision
] as const;

export type HookEventName =
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PostToolBatch'
  | 'UserPromptSubmit'
  | 'SessionStart'
  | 'Stop'
  | 'PreCompact';

export interface ProtocolSpec {
  /** Top-level JSON keys this event accepts. */
  allowedTopLevel: readonly string[];
  /**
   * Top-level keys that MUST NOT appear (catches "we used a field meant for
   * a different event"). Most often: `hookSpecificOutput` on Stop.
   */
  forbiddenTopLevel?: readonly string[];
  /**
   * If `hookSpecificOutput` is allowed, what `hookEventName` it must set
   * and what nested fields it permits. Absent = `hookSpecificOutput` not
   * supported for this event.
   */
  hookSpecificOutput?: {
    requiredHookEventName: HookEventName;
    allowedFields: readonly string[];
  };
}

export const HOOK_PROTOCOL: Record<HookEventName, ProtocolSpec> = {
  PreToolUse: {
    allowedTopLevel: [...COMMON_TOP_LEVEL, 'hookSpecificOutput'],
    hookSpecificOutput: {
      requiredHookEventName: 'PreToolUse',
      allowedFields: [
        'hookEventName',
        'permissionDecision',
        'permissionDecisionReason',
        'updatedInput',
        'additionalContext',
      ],
    },
  },
  PostToolUse: {
    allowedTopLevel: [...COMMON_TOP_LEVEL, 'hookSpecificOutput'],
    hookSpecificOutput: {
      requiredHookEventName: 'PostToolUse',
      allowedFields: ['hookEventName', 'additionalContext'],
    },
  },
  PostToolBatch: {
    allowedTopLevel: [...COMMON_TOP_LEVEL, 'hookSpecificOutput'],
    hookSpecificOutput: {
      requiredHookEventName: 'PostToolBatch',
      allowedFields: ['hookEventName', 'additionalContext'],
    },
  },
  UserPromptSubmit: {
    allowedTopLevel: [...COMMON_TOP_LEVEL, 'hookSpecificOutput'],
    hookSpecificOutput: {
      requiredHookEventName: 'UserPromptSubmit',
      // 2026-05-19 re-verification: Claude Code added `sessionTitle` (lets hooks
      // auto-name sessions based on the prompt). aide-memory doesn't use it but
      // the conformance test allows it so a future emit doesn't trip.
      allowedFields: ['hookEventName', 'additionalContext', 'sessionTitle'],
    },
  },
  SessionStart: {
    allowedTopLevel: [...COMMON_TOP_LEVEL, 'hookSpecificOutput'],
    hookSpecificOutput: {
      requiredHookEventName: 'SessionStart',
      allowedFields: ['hookEventName', 'additionalContext'],
    },
  },
  /**
   * Stop hooks do NOT accept `hookSpecificOutput`. The platform schema rejects
   * any output containing it — no `additionalContext` channel exists for Stop.
   * Text reaches the agent only via `decision: "block" + reason` or
   * `continue: false + stopReason`. Verified against schema-validation error
   * on Claude Code 2.1.x (2026-05-06).
   */
  Stop: {
    allowedTopLevel: [...COMMON_TOP_LEVEL],
    forbiddenTopLevel: ['hookSpecificOutput'],
  },
  PreCompact: {
    // PreCompact in our codebase is cleanup-only (silent). Platform allows
    // top-level fields but we don't emit any.
    allowedTopLevel: [...COMMON_TOP_LEVEL],
    forbiddenTopLevel: ['hookSpecificOutput'],
  },
};

/** Result of validating a parsed hook-output JSON against the protocol. */
export interface ProtocolViolation {
  field: string;
  reason: string;
}

/**
 * Validate a parsed JSON object against the protocol for a given event.
 * Returns an empty array if conformant; otherwise lists every offending
 * field with a reason.
 *
 * `output` is expected to be the *parsed* JSON (an object) that the hook
 * wrote to stdout. Empty or null = silent emit, always valid.
 */
export function validateHookOutput(
  event: HookEventName,
  output: unknown,
): ProtocolViolation[] {
  if (output === null || output === undefined) return [];
  if (typeof output !== 'object' || Array.isArray(output)) {
    return [{ field: '(root)', reason: 'output is not a JSON object' }];
  }

  const spec = HOOK_PROTOCOL[event];
  const obj = output as Record<string, unknown>;
  const violations: ProtocolViolation[] = [];

  // Forbidden top-level
  for (const forbidden of spec.forbiddenTopLevel ?? []) {
    if (forbidden in obj) {
      violations.push({
        field: forbidden,
        reason: `event '${event}' forbids top-level '${forbidden}'`,
      });
    }
  }

  // Allowed top-level (anything else is unknown / forbidden)
  const allowed = new Set([
    ...spec.allowedTopLevel,
    ...(spec.hookSpecificOutput ? ['hookSpecificOutput'] : []),
  ]);
  for (const key of Object.keys(obj)) {
    if (!allowed.has(key)) {
      violations.push({
        field: key,
        reason: `event '${event}' does not permit top-level '${key}'`,
      });
    }
  }

  // hookSpecificOutput nested validation
  if (spec.hookSpecificOutput && obj.hookSpecificOutput !== undefined) {
    const hso = obj.hookSpecificOutput;
    if (typeof hso !== 'object' || hso === null || Array.isArray(hso)) {
      violations.push({
        field: 'hookSpecificOutput',
        reason: 'hookSpecificOutput must be a JSON object',
      });
    } else {
      const hsoObj = hso as Record<string, unknown>;
      const expectedName = spec.hookSpecificOutput.requiredHookEventName;
      if (hsoObj.hookEventName !== expectedName) {
        violations.push({
          field: 'hookSpecificOutput.hookEventName',
          reason: `must be '${expectedName}', got '${String(hsoObj.hookEventName)}'`,
        });
      }
      const allowedNested = new Set(spec.hookSpecificOutput.allowedFields);
      for (const key of Object.keys(hsoObj)) {
        if (!allowedNested.has(key)) {
          violations.push({
            field: `hookSpecificOutput.${key}`,
            reason: `event '${event}' nested 'hookSpecificOutput' does not permit '${key}'`,
          });
        }
      }
    }
  }

  return violations;
}
