/**
 * Port of all scripts/hooks/*.sh logic into typed TS handlers.
 *
 * Each handler reads the Claude Code hook input JSON, applies its decision
 * logic, and emits either silent (return), additionalContext (soft), or
 * block output via the stdio helpers. Handlers never throw — they use a
 * try/catch at the dispatcher to silently exit 0 on any unexpected error,
 * matching the "never break the agent" contract of the bash hooks.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
// Inlined at bundle time by esbuild (resolveJsonModule=true in tsconfig).
// This is the single source of truth for hook defaults — same schema the
// legacy read-config.sh + read-config.js used.
import defaultsJson from '../../../scripts/hooks/defaults.json';
import { MemoryStore } from '../store';
import type { Memory } from '../types';
import {
  emitAdditionalContext,
  emitBlockDecision,
} from './stdio';
import {
  appendRecalledPath,
  appendSearchedQuery,
  clearCorrectionPending,
  clearSessionTracking,
  hasCorrectionPending,
  hasRecalledFile,
  hasSearchedQuery,
  mergeTrackedIds,
  normalizeQuery,
  readRecalledIds,
  readStopCount,
  writeCorrectionPending,
  writeStopCount,
} from './tracking';
import { computeRecallForPath } from './recallForPath';
import { buildSessionStartContent } from '../sessionStartContent';

type HookInput = {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    pattern?: string;
    paths?: string[];
    keyword?: string;
    [k: string]: any;
  };
  tool_response?: any;
  prompt?: string;
  session_id?: string;
  cwd?: string;
  source?: string;
  stop_hook_active?: boolean;
};

function resolveProjectRoot(input: HookInput): string {
  if (input.cwd) return input.cwd;
  // Fallback when Claude Code doesn't pass cwd (test-only path).
  //
  // The bash equivalent used SCRIPT_DIR/../.. where SCRIPT_DIR was
  // `scripts/hooks`, resolving to the repo root. The TS port must NOT
  // use __dirname/../.. because this handler lives at
  // `dist/memory/hooks/handlers.js` — two levels up is `dist/`, not
  // repo root. And in an npm-installed scenario that'd resolve to
  // `node_modules/aide-memory/dist/`, which is never the user's project.
  //
  // process.cwd() is where the `aide-memory` CLI (and therefore the
  // hook shim that execs into it) was invoked — the correct analogue
  // to the bash PROJECT_ROOT fallback.
  return process.cwd();
}

function resolveSessionId(input: HookInput): string {
  return input.session_id || 'default';
}

type DefaultEntry = { value: any; public?: boolean; pro?: boolean };
const HOOK_DEFAULTS = defaultsJson as Record<string, DefaultEntry>;

/**
 * Hook setting reader. Mirrors the legacy read-config.sh + read-config.js
 * semantics:
 *   1. Unknown key → undefined
 *   2. Entry with public !== true → defaults value (user override ignored)
 *   3. User config has the nested key → user value
 *   4. Otherwise → defaults value
 *
 * `.aide/config.json` uses nested JSON ({hooks:{stop:{schedule:...}}}) while
 * defaults.json keys are flat dot-paths ("hooks.stop.schedule"). We split the
 * flat key and walk the nested user config.
 */
/**
 * Resolve the `hooks.visible` config — governs whether user-facing
 * systemMessage lines are emitted by hooks. Default true so users can see
 * what aide-memory is doing. Set to false to hide all aide-memory
 * systemMessages (hooks still function, agent behavior unchanged).
 */
function isVisible(projectRoot: string): boolean {
  return getSetting(projectRoot, 'hooks.visible') !== false;
}

/**
 * User-facing brand prefix for every systemMessage we emit.
 *
 * Wrapped in a 24-bit ANSI colour escape matching the aide-memory CLI brand
 * (`chalk.hex('#00c2cb')` in `src/cli/commands/memory/utils.ts`). Claude Code
 * honors ANSI codes in systemMessage (verified empirical test Apr 22 2026).
 * Colour is applied to the `aide-memory · ` mark only; the message text
 * after the prefix stays terminal-default so it's readable on any theme.
 *
 * If Claude Code ever stops honoring ANSI in systemMessage, the escape just
 * renders as plain text prefix — no functional regression.
 */
const BRAND_COLOUR_ON = '\u001b[38;2;0;194;203m';   // #00c2cb
const BRAND_COLOUR_OFF = '\u001b[0m';
const BRAND = `${BRAND_COLOUR_ON}aide-memory · ${BRAND_COLOUR_OFF}`;

function getSetting(projectRoot: string, key: string): any {
  const entry = HOOK_DEFAULTS[key];
  if (!entry) return undefined;
  const defaultValue = entry.value;
  if (entry.public !== true) return defaultValue;

  const userConfigPath = path.join(projectRoot, '.aide', 'config.json');
  if (!fs.existsSync(userConfigPath)) return defaultValue;

  let userConfig: any;
  try {
    userConfig = JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
  } catch {
    return defaultValue;
  }

  const parts = key.split('.');
  let cur: any = userConfig;
  for (const p of parts) {
    if (cur === null || cur === undefined || typeof cur !== 'object' || Array.isArray(cur)) {
      return defaultValue;
    }
    if (!Object.prototype.hasOwnProperty.call(cur, p)) return defaultValue;
    cur = cur[p];
  }
  return cur;
}

// ---------------------------------------------------------------------------
// PreToolUse:Read — pre-read-recall
// ---------------------------------------------------------------------------

export async function preRead(input: HookInput): Promise<void> {
  const rawFilePath = input.tool_input?.file_path;
  if (!rawFilePath) return;

  // Skip non-existent paths — check raw path before resolving so we don't
  // surface confusing relative-vs-absolute errors when the file genuinely
  // doesn't exist on disk.
  if (!fs.existsSync(rawFilePath)) return;

  // Skip direct reads of .aide/memories/ files — nudge to use aide_recall
  if (rawFilePath.includes('.aide/memories/')) {
    emitAdditionalContext(
      'PreToolUse',
      'memory_file_direct_read: You are reading a raw memory file. Use aide_recall for structured context.',
    );
    return;
  }

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  // Resolve relative → absolute BEFORE downstream tracking / recall uses the
  // path. Production Claude Code always sends absolute paths, but robustness
  // matters for tests + future callers that might hand us a relative path.
  const filePath = path.isAbsolute(rawFilePath)
    ? rawFilePath
    : path.resolve(projectRoot, rawFilePath);

  const maxBlocks = getSetting(projectRoot, 'hooks.read.maxBlocks');
  if (maxBlocks === 0 || maxBlocks === '0') return;

  const result = computeRecallForPath(projectRoot, filePath);
  if (!result || result.count === 0 || result.scoped_count === 0 || result.scoped_ids.length === 0) {
    return;
  }

  const recalledIds = readRecalledIds(projectRoot, sessionId);
  const recalledSet = new Set(recalledIds.map(String));

  const missingIds: string[] = [];
  let coveredCount = 0;
  for (const sid of result.scoped_ids) {
    if (recalledSet.has(String(sid))) coveredCount++;
    else missingIds.push(String(sid));
  }

  // Compute "encountered" BEFORE we self-track below, so the first block on
  // a fresh file still goes hard (encountered=false); subsequent touches on
  // the same file — even if new memories are added mid-session — see
  // encountered=true and go soft. This fixes the repeat-hard-block case
  // where the agent's aide_recall({ids:[…]}) response didn't mark the path
  // as encountered (track-recall-post only writes IDs; paths are only
  // written when aide_recall is called with {paths: [...]}).
  const encountered = hasRecalledFile(projectRoot, sessionId, filePath);

  // Self-track the path so future pre-read/pre-edit fires on this file see
  // it as encountered. Done whether we're about to block, soft-nudge, or
  // silent — the file has been touched by the agent either way.
  appendRecalledPath(projectRoot, sessionId, 'file', filePath);

  if (coveredCount === result.scoped_ids.length) return;

  const missingCount = result.scoped_ids.length - coveredCount;
  const softeningThreshold = Number(getSetting(projectRoot, 'memories.softening.threshold') ?? 10);
  const forceSoft = result.total_memories < softeningThreshold;

  let nudge: string;
  if (coveredCount === 0) {
    const layersPairs = Object.entries(result.layers).map(([k, v]) => `${v} ${k}`).join(', ');
    const topicsStr = (result.topics || []).join(', ');
    if (topicsStr) {
      nudge =
        `${result.scoped_count} memories for ${filePath} (${layersPairs}) — topics: ${topicsStr}. ` +
        `Call aide_recall({paths: ['${filePath}']}).`;
    } else {
      nudge = `${result.scoped_count} memories for ${filePath}. Call aide_recall({paths: ['${filePath}']}).`;
    }
  } else {
    nudge = `${missingCount} memories for ${filePath} not yet recalled. Call aide_recall({ids: [${missingIds.join(',')}]}).`;
  }

  // User-facing reassurance lines (gated on hooks.visible). The reason text
  // above stays untouched — it's what Claude acts on. systemMessage is
  // user-only reassurance that this is expected aide-memory behavior.
  //
  // Soft vs hard wording differentiated (§2.3): when both fire on consecutive
  // reads of the same area, identical chrome looked like a duplicate emit. The
  // soft variant signals "more memories you haven't seen yet" while the hard
  // variant signals "first-touch enforcement (expected)" alongside the
  // platform's "blocking error" label (mem #310 — TUI hardcoded, can't
  // override).
  const visible = isVisible(projectRoot);
  const softMessage = visible
    ? `${BRAND}prompting aide_recall — additional scoped memories not yet recalled`
    : undefined;
  const hardMessage = visible
    ? `${BRAND}prompting aide_recall — scoped memories not recalled yet (expected flow)`
    : undefined;

  if (forceSoft || encountered) {
    emitAdditionalContext('PreToolUse', nudge, softMessage);
  } else {
    emitBlockDecision(nudge, hardMessage);
  }
}

// ---------------------------------------------------------------------------
// PreToolUse:Edit/Write — pre-edit-recall
// ---------------------------------------------------------------------------

export async function preEdit(input: HookInput): Promise<void> {
  const rawFilePath = input.tool_input?.file_path;
  if (!rawFilePath) return;
  if (!fs.existsSync(rawFilePath)) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  // Resolve relative → absolute BEFORE downstream tracking / recall uses the
  // path. See preRead for rationale.
  const filePath = path.isAbsolute(rawFilePath)
    ? rawFilePath
    : path.resolve(projectRoot, rawFilePath);

  const maxBlocks = getSetting(projectRoot, 'hooks.edit.maxBlocks');
  if (maxBlocks === 0 || maxBlocks === '0') return;

  const result = computeRecallForPath(projectRoot, filePath);
  if (!result || result.count === 0 || result.scoped_count === 0 || result.scoped_ids.length === 0) {
    return;
  }

  const recalledIds = readRecalledIds(projectRoot, sessionId);
  const recalledSet = new Set(recalledIds.map(String));

  const missingIds: string[] = [];
  let coveredCount = 0;
  for (const sid of result.scoped_ids) {
    if (recalledSet.has(String(sid))) coveredCount++;
    else missingIds.push(String(sid));
  }

  // Compute "encountered" BEFORE we self-track below — see preRead for
  // rationale. First edit on a fresh file still goes hard; subsequent
  // edits (even with new memories added mid-session) go soft.
  const encountered = hasRecalledFile(projectRoot, sessionId, filePath);

  // Self-track the path so future pre-read/pre-edit fires see it as
  // encountered. Mirrors preRead's fix for the repeat-hard-block case.
  appendRecalledPath(projectRoot, sessionId, 'file', filePath);

  if (coveredCount === result.scoped_ids.length) return;

  const missingCount = result.scoped_ids.length - coveredCount;
  const softeningThreshold = Number(getSetting(projectRoot, 'memories.softening.threshold') ?? 10);
  const forceSoft = result.total_memories < softeningThreshold;

  let nudge: string;
  if (coveredCount === 0) {
    nudge = `${result.scoped_count} memories for ${filePath}. Call aide_recall({paths: ['${filePath}']}) before editing.`;
  } else {
    nudge = `${missingCount} memories for ${filePath} not yet recalled. Call aide_recall({ids: [${missingIds.join(',')}]}) before editing.`;
  }

  // User-facing reassurance lines (gated on hooks.visible). See preRead
  // for rationale + the soft-vs-hard wording differentiation (§2.3).
  const visible = isVisible(projectRoot);
  const softMessage = visible
    ? `${BRAND}prompting aide_recall — additional scoped memories not yet recalled`
    : undefined;
  const hardMessage = visible
    ? `${BRAND}prompting aide_recall — scoped memories not recalled yet (expected flow)`
    : undefined;

  if (forceSoft || encountered) {
    emitAdditionalContext('PreToolUse', nudge, softMessage);
  } else {
    emitBlockDecision(nudge, hardMessage);
  }
}

// ---------------------------------------------------------------------------
// PreToolUse:Grep/Glob — pre-search-nudge
// ---------------------------------------------------------------------------

export async function preSearch(input: HookInput): Promise<void> {
  const query = input.tool_input?.pattern;
  if (!query) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  const searchMode = getSetting(projectRoot, 'hooks.search.mode');
  if (searchMode === 'off') return;

  // Direct search preview (equivalent to scripts/hooks/search-preview.js)
  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) return;

  let count = 0;
  let topMatches: string[] = [];
  const store = new MemoryStore({ projectRoot });
  try {
    const all = store.list();
    const qLower = query.toLowerCase();
    const matching = all.filter((m: Memory) => {
      const what = (m.what || '').toLowerCase();
      const why = (m.why || '').toLowerCase();
      return what.includes(qLower) || why.includes(qLower);
    });
    count = matching.length;
    if (count === 0) return;
    topMatches = matching.slice(0, 3).map((m: Memory) => {
      const what = m.what || '';
      return what.length > 30 ? what.slice(0, 30) + '...' : what;
    });
  } finally {
    store.close();
  }

  if (count === 0) return;

  const topStr = topMatches.join(', ');
  const normalized = normalizeQuery(query);
  const alreadySearched = hasSearchedQuery(projectRoot, sessionId, normalized);

  // Note: we deliberately do NOT write to tracking here. track-search handler
  // writes to tracking when aide_search is actually called (PostToolUse).

  const visible = isVisible(projectRoot);
  const userMessage = visible
    ? `${BRAND}prompting aide_search for "${query}" — ${count} matching ${count === 1 ? 'memory' : 'memories'}`
    : undefined;

  if (alreadySearched) {
    emitAdditionalContext(
      'PreToolUse',
      `${count} aide memories match '${query}' (${topStr}). Call aide_search({keyword: '${query}'}).`,
      userMessage,
    );
    return;
  }

  // No "if not already in context" qualifier — the hook already gates on
  // alreadySearched (line 374 + 384-391 branch). When this nudge fires, the
  // keyword IS not in context by construction, so the qualifier was redundant
  // defensive language that gave the agent an unnecessary out (memory #370 —
  // 2026-04-27 user observation: agent ignored nudge because phrasing was
  // permissive even when the literal-string exception didn't apply cleanly).
  const nudge = `${count} aide memories match '${query}' (${topStr}). Call aide_search({keyword: '${query}'}).`;
  if (searchMode === 'block') {
    emitBlockDecision(nudge, userMessage);
  } else {
    emitAdditionalContext('PreToolUse', nudge, userMessage);
  }
}

// ---------------------------------------------------------------------------
// UserPromptSubmit — detect-correction
// ---------------------------------------------------------------------------

const CORRECTION_PATTERN = new RegExp(
  '(no[, ]+(don\'?t|do not|can\'?t|won\'?t|isn\'?t|wasn\'?t|weren\'?t|shouldn\'?t|didn\'?t|couldn\'?t|wouldn\'?t|mustn\'?t|haven\'?t|hadn\'?t|aren\'?t|use|instead|that\'?s wrong)|no[, ]+(we|I|it|you)\\s+(use|go with|prefer|want|need|should)|no[, ]+try\\s+.+\\s+instead|actually[, ]|wrong[, ]|not like that|use .+ instead|don\'?t use|stop using|I told you|I said)',
  'i',
);
const DECISION_PATTERN = new RegExp(
  '(let\'?s (use|go with)|we should|go with|the approach is|decided to|decision is|we\'?re going|from now on)',
  'i',
);
const PREFERENCE_PATTERN = new RegExp(
  '(I prefer|always use|never use|I like|my style is|I want you to|don\'?t ever|make sure to always|I always)',
  'i',
);
// Narrow 'no I mean' filter so only reference-clarification phrasings skip
// (e.g. "no I mean the other file", "no I mean that one"). Corrections like
// "no I mean use X instead" fall through to CORRECTION_PATTERN.
const FALSE_POSITIVE_PATTERN = new RegExp(
  '^(no I mean (the|that|this|it|a|an|one|those)\\s|no (but|actually I|I think|not sure)|I don\'?t (think|know|get|understand)|what I mean)',
  'i',
);
// Meta-references — message is discussing the correction system rather than
// enacting a correction. e.g. "the correction prompt fired", "we tightened
// the correction regex". Skip detection on these.
const META_PATTERN = new RegExp(
  '(correction (prompt|regex|pattern|hook|flag|detection)|matched correction|hooks?\\.correction|correction[- ]pending)',
  'i',
);

/**
 * Strip portions of the message that shouldn't drive correction detection:
 *   - Fenced code blocks (``` ... ```)
 *   - Inline code (`...`)
 *   - Lines whose first non-whitespace character is a quote (",',`)
 *
 * The resulting string is what we run CORRECTION_PATTERN / DECISION_PATTERN /
 * PREFERENCE_PATTERN against — keeps quoted/discussed content from triggering
 * the hook when the user is referencing past corrections rather than making
 * one (memory #443: regex over-matches when discussing/quoting).
 */
function stripQuotedContent(message: string): string {
  let cleaned = message.replace(/```[\s\S]*?```/g, '');
  cleaned = cleaned.replace(/`[^`\n]*`/g, '');
  cleaned = cleaned
    .split('\n')
    .filter((line) => !/^\s*["'`]/.test(line))
    .join('\n');
  return cleaned;
}

const SOFT_CORRECTION_PROMPT =
  'Your prompt may contain a correction or convention worth persisting. If something here applies to future work in this project — across preferences (how you work), technical (stack facts, why-decisions), area_context (decisions for this code area), or guidelines (team rules) — call aide_remember on the matching layer. Otherwise respond as normal.';

export async function detectCorrection(input: HookInput): Promise<void> {
  const message = input.prompt || '';
  if (!message) return;

  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return;

  if (FALSE_POSITIVE_PATTERN.test(message)) return;
  if (META_PATTERN.test(message)) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  const enabled = getSetting(projectRoot, 'hooks.correction.enabled');
  if (enabled === false) return;

  // Strip quoted/code content before pattern-matching so messages discussing
  // past corrections (or quoting them) don't trigger a fresh detection.
  const cleaned = stripQuotedContent(message);

  let kind: 'correction' | 'decision' | 'preference' | null = null;
  if (CORRECTION_PATTERN.test(cleaned)) kind = 'correction';
  else if (DECISION_PATTERN.test(cleaned)) kind = 'decision';
  else if (PREFERENCE_PATTERN.test(cleaned)) kind = 'preference';
  if (!kind) return;

  const visible = isVisible(projectRoot);
  const userMessage = visible
    ? `${BRAND}possible ${kind} detected — consider aide_remember`
    : undefined;

  // Soft + visible by default: agent sees the prompt, no flag written, no
  // forced re-prompt. Stop reminder for unstored corrections is opt-in via
  // hooks.correction.escalate.
  emitAdditionalContext('UserPromptSubmit', SOFT_CORRECTION_PROMPT, userMessage);

  const escalate = getSetting(projectRoot, 'hooks.correction.escalate');
  if (escalate === 'soft' || escalate === 'block') {
    writeCorrectionPending(projectRoot, sessionId, kind);
  }
}

// ---------------------------------------------------------------------------
// PostToolUse:mcp aide_recall — track-recall-post
// ---------------------------------------------------------------------------

function extractResponseText(toolResponse: any): string {
  if (!toolResponse) return '';
  if (typeof toolResponse === 'string') return toolResponse;
  if (Array.isArray(toolResponse)) {
    return toolResponse.map((r) => (typeof r === 'object' && r?.text) ? r.text : '').join('\n');
  }
  if (typeof toolResponse === 'object' && toolResponse.text) return toolResponse.text;
  return '';
}

export async function trackRecallPost(input: HookInput): Promise<void> {
  const responseText = extractResponseText(input.tool_response);
  if (!responseText) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  // Extract memory IDs from [N] patterns
  const matches = responseText.match(/\[(\d+)\]/g) || [];
  const ids = Array.from(new Set(matches.map((s) => s.slice(1, -1))));
  if (ids.length === 0) return;

  mergeTrackedIds(projectRoot, sessionId, ids);
}

// ---------------------------------------------------------------------------
// Stop — stop-remember (dynamic interval, correction-pending flag)
// ---------------------------------------------------------------------------

const DEFAULT_PROMPT =
  'Anything from this turn worth persisting for future sessions in this project? Could touch preferences, technical, area_context, or guidelines. If yes, call aide_remember on the matching layer. Otherwise stop.';

const CORRECTION_PENDING_PROMPT =
  'A correction or convention from this turn was detected but no memory was stored. If it applies to future work — preferences, technical, area_context, or guidelines — call aide_remember on the matching layer. Otherwise stop.';

export async function stop(input: HookInput): Promise<void> {
  if (input.stop_hook_active) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  const currentCount = readStopCount(projectRoot, sessionId);
  const newCount = currentCount + 1;
  writeStopCount(projectRoot, sessionId, newCount);

  const visible = isVisible(projectRoot);
  const escalate = getSetting(projectRoot, 'hooks.correction.escalate');
  const stopMode = getSetting(projectRoot, 'hooks.stop.mode');

  // Cross-system precedence (§4.1): correction-pending wins over the
  // scheduled checkpoint when both fire on the same turn. Only reachable
  // when hooks.correction.escalate is 'block' — default 'off' never writes
  // the flag, so this branch is inert. (A 'soft' value existed in spec
  // drafts but was dropped — Claude Code's Stop hook does not accept
  // hookSpecificOutput.additionalContext, so soft Stop emit is impossible.)
  // event='stop' routes Cursor's adapter to followup_message instead of
  // preToolUse-style deny.
  if (hasCorrectionPending(projectRoot, sessionId)) {
    clearCorrectionPending(projectRoot, sessionId);
    if (escalate === 'block') {
      const userMessage = visible
        ? `${BRAND}correction from this turn not yet stored — prompting aide_remember`
        : undefined;
      emitBlockDecision(CORRECTION_PENDING_PROMPT, userMessage, 'stop');
      return;
    }
    // Stale flag (escalate is 'off' but flag was left from a prior session
    // when escalate was 'block'): clear silently above and fall through to
    // the scheduled-checkpoint path.
  }

  if (stopMode === 'off') return;

  // Dynamic interval from config schedule.
  type Phase = { until?: number; every?: number };
  const schedule = (getSetting(projectRoot, 'hooks.stop.schedule') as Phase[] | undefined) || [];

  let shouldFire = false;
  if (!Array.isArray(schedule) || schedule.length === 0) {
    if (newCount % 5 === 0) shouldFire = true;
  } else {
    let prevUntil = 0;
    let matched = false;
    for (const phase of schedule) {
      const every = phase.every ?? 5;
      if (phase.until === undefined || phase.until === null) {
        if (!matched) {
          const offset = newCount - prevUntil;
          if (offset % every === 0) shouldFire = true;
          matched = true;
        }
      } else if (newCount <= phase.until && !matched) {
        const offset = newCount - prevUntil;
        if (offset % every === 0) shouldFire = true;
        matched = true;
      }
      if (phase.until !== undefined && phase.until !== null) {
        prevUntil = phase.until;
      }
    }
  }

  if (!shouldFire) return;

  // Default 'block': decision:block + softened reason + chrome systemMessage.
  // The TUI collapses the 'Stop hook error:' label behind ctrl+o when
  // systemMessage is present (memory #310), so the brand chrome is what the
  // user sees inline.
  const userMessage = visible
    ? `${BRAND}checkpoint — anything worth remembering?`
    : undefined;
  emitBlockDecision(DEFAULT_PROMPT, userMessage, 'stop');
}

// ---------------------------------------------------------------------------
// PreCompact — pre-compact-save (cleanup only)
// ---------------------------------------------------------------------------

export async function preCompact(input: HookInput): Promise<void> {
  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  const mode = getSetting(projectRoot, 'hooks.precompact.mode');
  if (mode === 'off') return;

  clearSessionTracking(projectRoot, sessionId);
}

// ---------------------------------------------------------------------------
// SessionStart — session-start-clear + session-inject
// ---------------------------------------------------------------------------

// loadLayer + content-building logic moved to src/memory/sessionStartContent.ts
// in Phase C4 so both sessionStart (this file) + rulesGen (for Cursor) share
// one implementation. Single source of truth — no drift between Claude Code's
// injected content and Cursor's rules-file dynamic section.

export async function sessionStart(input: HookInput): Promise<void> {
  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) return;

  // Health check: verify hook scripts + MCP server binary still exist at
  // the paths written by init. Catches broken npx cache, Node version
  // switches, or cleaned global installs.
  try {
    const mcpConfigPath = path.join(projectRoot, '.mcp.json');
    if (fs.existsSync(mcpConfigPath)) {
      const mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, 'utf8'));
      const serverPath = mcpConfig?.mcpServers?.['aide-memory']?.args?.[0];
      if (serverPath && !fs.existsSync(serverPath)) {
        const msg = `aide-memory: MCP server path not found (${serverPath}). ` +
          'This can happen after a Node version change or cache clean. ' +
          'Fix: run "npx aide-memory init" or "npm install -g aide-memory && aide-memory init"';
        process.stderr.write(`[AIDE_HEALTH] ${msg}\n`);
        emitAdditionalContext('SessionStart', msg);
        return;
      }
    }
  } catch {
    // Non-fatal — don't break session start over a health check.
  }

  // Version update check — read cached result synchronously.
  // Collected here, appended to the final output so both show in one emit.
  let versionNotice = '';
  let versionUserMsg = '';
  try {
    const { findPackageRoot } = require('../internal/paths');
    const root = findPackageRoot();
    if (!fs.existsSync(path.resolve(root, 'src', 'cli'))) {
      const pkgPath = path.join(root, 'package.json');
      const currentVersion = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).version;
      const cachePath = path.join(os.homedir(), '.aide', 'update-check.json');
      if (fs.existsSync(cachePath)) {
        const cache = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
        if (cache.latestVersion && cache.latestVersion !== currentVersion) {
          const cv = currentVersion.replace(/^v/, '').split('.').map(Number);
          const lv = cache.latestVersion.replace(/^v/, '').split('.').map(Number);
          const isNewer = lv[0] > cv[0] || (lv[0] === cv[0] && lv[1] > cv[1]) || (lv[0] === cv[0] && lv[1] === cv[1] && lv[2] > cv[2]);
          if (isNewer) {
            versionNotice = `aide-memory v${cache.latestVersion} is available (current: v${currentVersion}). Run \`npm update -g aide-memory\` to upgrade.`;
            versionUserMsg = `${BRAND}update available: v${cache.latestVersion}`;
          }
        }
      }
    }
  } catch {
    // Non-fatal
  }

  // Source-specific behavior (§2.2 of 0.5.17 spec):
  //   - startup        → fresh session; inject as normal.
  //   - clear / compact → prior transcript wiped or summarized; clear tracking
  //                      so post-context fires re-block cleanly + inject.
  //   - resume         → prior transcript restored, including original
  //                      additionalContext and recalled-paths state. Both
  //                      injection and tracking-clear would duplicate /
  //                      regress that state, so skip the rest of the handler.
  const source = input.source;
  if (source === 'resume') return;
  if (source === 'clear' || source === 'compact') {
    clearSessionTracking(projectRoot, sessionId);
  }

  // Injection content + priority:always + layer-caps logic lives in the
  // shared buildSessionStartContent helper (extracted Phase C4). Same
  // implementation drives Cursor's rules-file regeneration so the two
  // channels never drift.
  const store = new MemoryStore({ projectRoot });
  let output = '';
  let allInjectedIds: (string | number)[] = [];
  try {
    const built = buildSessionStartContent(projectRoot, store);
    output = built.content;
    allInjectedIds = built.injectedIds;
  } finally {
    store.close();
  }

  if (!output && !versionNotice) return;

  // Write injected IDs to tracking so Read/Edit hooks don't redundantly block.
  if (allInjectedIds.length > 0) {
    mergeTrackedIds(projectRoot, sessionId, allInjectedIds.map(String));
  }

  // Route through the active adapter's translateOutput so Claude Code gets
  // its canonical hookSpecificOutput envelope (unchanged) and Cursor (when
  // sessionStart.additional_context is ever fixed, forum #158452) can map
  // to whatever shape it supports. Today Cursor's adapter returns '' here —
  // session-start injection uses the rules-file workaround (Phase C4).
  const visible = isVisible(projectRoot);
  const totalInjected = allInjectedIds.length;
  const parts: string[] = [];
  if (visible && totalInjected > 0) {
    parts.push(`${BRAND}injected ${totalInjected} ${totalInjected === 1 ? 'memory' : 'memories'} at session start`);
  }
  if (versionUserMsg) {
    parts.push(versionUserMsg);
  }
  const userMessage = parts.length > 0 ? parts.join('\n') : undefined;

  const finalOutput = versionNotice ? `${versionNotice}\n\n${output}` : output;
  emitAdditionalContext('SessionStart', finalOutput, userMessage);
}

// ---------------------------------------------------------------------------
// PreToolUse:mcp aide_recall — track-recall (record paths the agent is recalling)
// ---------------------------------------------------------------------------

export async function trackRecall(input: HookInput): Promise<void> {
  const paths = input.tool_input?.paths;
  if (!paths || !Array.isArray(paths) || paths.length === 0) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  for (const p of paths) {
    const absPath = path.isAbsolute(p) ? p : path.join(projectRoot, p);
    const endsSlash = absPath.endsWith('/');
    const endsStarStar = absPath.endsWith('/**');
    const endsStar = absPath.endsWith('/*');
    let isDir = false;
    let cleanDir = absPath;
    if (endsSlash) isDir = true;
    else if (endsStarStar) {
      isDir = true;
      cleanDir = absPath.slice(0, -3);
    } else if (endsStar) {
      isDir = true;
      cleanDir = absPath.slice(0, -2);
    } else {
      try {
        if (fs.statSync(absPath).isDirectory()) isDir = true;
      } catch {
        // not a dir
      }
    }

    if (isDir) {
      if (!cleanDir.endsWith('/')) cleanDir = cleanDir + '/';
      appendRecalledPath(projectRoot, sessionId, 'dir', cleanDir);
    } else {
      appendRecalledPath(projectRoot, sessionId, 'file', absPath);
    }
  }
}

// ---------------------------------------------------------------------------
// PostToolUse:mcp aide_remember — track-remember (clears correction-pending)
// ---------------------------------------------------------------------------

export async function trackRemember(input: HookInput): Promise<void> {
  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);
  clearCorrectionPending(projectRoot, sessionId);
}

// ---------------------------------------------------------------------------
// PostToolUse:mcp aide_search — track-search (unblocks future grep/glob)
// ---------------------------------------------------------------------------

export async function trackSearch(input: HookInput): Promise<void> {
  const keyword = input.tool_input?.keyword;
  if (!keyword) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);
  const normalized = normalizeQuery(keyword);
  appendSearchedQuery(projectRoot, sessionId, normalized);
}
