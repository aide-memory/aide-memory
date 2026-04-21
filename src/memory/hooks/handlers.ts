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
  // Match the bash fallback: PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
  // When the hook dispatcher runs from dist/cli/aide-memory.js, __dirname/../..
  // resolves to the package root (where the .aide/ directory lives during
  // development/testing of the package itself). In production this is
  // node_modules/aide-memory/ but hooks should always carry a real `cwd`
  // field so this fallback is test-only.
  return path.resolve(__dirname, '..', '..');
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
  const filePath = input.tool_input?.file_path;
  if (!filePath) return;

  // Skip non-existent paths
  if (!fs.existsSync(filePath)) return;

  // Skip direct reads of .aide/memories/ files — nudge to use aide_recall
  if (filePath.includes('.aide/memories/')) {
    emitAdditionalContext(
      'PreToolUse',
      'memory_file_direct_read: You are reading a raw memory file. Use aide_recall for structured context.',
    );
    return;
  }

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

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

  if (coveredCount === result.scoped_ids.length) return;

  const encountered = hasRecalledFile(projectRoot, sessionId, filePath);
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

  if (forceSoft || encountered) {
    emitAdditionalContext('PreToolUse', nudge);
  } else {
    emitBlockDecision(nudge);
  }
}

// ---------------------------------------------------------------------------
// PreToolUse:Edit/Write — pre-edit-recall
// ---------------------------------------------------------------------------

export async function preEdit(input: HookInput): Promise<void> {
  const filePath = input.tool_input?.file_path;
  if (!filePath) return;
  if (!fs.existsSync(filePath)) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

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

  if (coveredCount === result.scoped_ids.length) return;

  const encountered = hasRecalledFile(projectRoot, sessionId, filePath);
  const missingCount = result.scoped_ids.length - coveredCount;
  const softeningThreshold = Number(getSetting(projectRoot, 'memories.softening.threshold') ?? 10);
  const forceSoft = result.total_memories < softeningThreshold;

  let nudge: string;
  if (coveredCount === 0) {
    nudge = `${result.scoped_count} memories for ${filePath}. Call aide_recall({paths: ['${filePath}']}) before editing.`;
  } else {
    nudge = `${missingCount} memories for ${filePath} not yet recalled. Call aide_recall({ids: [${missingIds.join(',')}]}) before editing.`;
  }

  if (forceSoft || encountered) {
    emitAdditionalContext('PreToolUse', nudge);
  } else {
    emitBlockDecision(nudge);
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

  if (alreadySearched) {
    emitAdditionalContext(
      'PreToolUse',
      `${count} aide memories match '${query}' (${topStr}). Call aide_search({keyword: '${query}'}).`,
    );
    return;
  }

  const nudge = `${count} aide memories match '${query}' (${topStr}). Call aide_search({keyword: '${query}'}) if not already in context.`;
  if (searchMode === 'block') {
    emitBlockDecision(nudge);
  } else {
    emitAdditionalContext('PreToolUse', nudge);
  }
}

// ---------------------------------------------------------------------------
// UserPromptSubmit — detect-correction
// ---------------------------------------------------------------------------

const CORRECTION_PATTERN = new RegExp(
  '(no[, ]+(don\'?t|do not|can\'?t|won\'?t|isn\'?t|wasn\'?t|weren\'?t|shouldn\'?t|didn\'?t|couldn\'?t|wouldn\'?t|mustn\'?t|haven\'?t|hadn\'?t|aren\'?t|use|instead|that\'?s wrong)|actually[, ]|wrong[, ]|not like that|use .+ instead|don\'?t use|stop using|I told you|I said)',
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
const FALSE_POSITIVE_PATTERN = new RegExp(
  '^(no (I mean|but|actually I|I think|not sure)|I don\'?t (think|know|get|understand)|what I mean)',
  'i',
);

const FALLBACK =
  'If aide_remember unavailable, write JSON lines to .aide/pending-memories.jsonl and tell user to start the MCP server.';

export async function detectCorrection(input: HookInput): Promise<void> {
  const message = input.prompt || '';
  if (!message) return;

  const wordCount = message.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount < 3) return;

  if (FALSE_POSITIVE_PATTERN.test(message)) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  const enabled = getSetting(projectRoot, 'hooks.correction.enabled');
  if (enabled === false) return;

  if (CORRECTION_PATTERN.test(message)) {
    emitAdditionalContext(
      'UserPromptSubmit',
      `BEFORE doing anything else, store via aide_remember (layer: preferences or technical, source: hook). ${FALLBACK}`,
    );
    writeCorrectionPending(projectRoot, sessionId, 'correction');
    return;
  }

  if (DECISION_PATTERN.test(message)) {
    emitAdditionalContext(
      'UserPromptSubmit',
      `BEFORE doing anything else, store via aide_remember (layer: area_context or technical, source: hook). ${FALLBACK}`,
    );
    writeCorrectionPending(projectRoot, sessionId, 'decision');
    return;
  }

  if (PREFERENCE_PATTERN.test(message)) {
    emitAdditionalContext(
      'UserPromptSubmit',
      `BEFORE doing anything else, store via aide_remember (layer: preferences, source: hook). ${FALLBACK}`,
    );
    writeCorrectionPending(projectRoot, sessionId, 'preference');
    return;
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
  'Any decisions, technical constraints, preferences, or guidelines worth persisting? Store in the right place — aide_remember for cross-session context, relevant project docs for plans and decisions. If nothing, stop.';

export async function stop(input: HookInput): Promise<void> {
  if (input.stop_hook_active) return;

  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  const currentCount = readStopCount(projectRoot, sessionId);
  const newCount = currentCount + 1;
  writeStopCount(projectRoot, sessionId, newCount);

  // Correction-pending flag always blocks, regardless of interval.
  if (hasCorrectionPending(projectRoot, sessionId)) {
    clearCorrectionPending(projectRoot, sessionId);
    emitBlockDecision(
      "A correction from this turn wasn't stored. Call aide_remember for it. Also: any decisions, technical constraints, preferences, or guidelines worth persisting? Store in the right place — aide_remember for cross-session context, relevant project docs for plans and decisions. If nothing, stop.",
    );
    return;
  }

  // Dynamic interval from config schedule.
  type Phase = { until?: number; every?: number };
  const schedule = (getSetting(projectRoot, 'hooks.stop.schedule') as Phase[] | undefined) || [];

  let shouldBlock = false;
  if (!Array.isArray(schedule) || schedule.length === 0) {
    if (newCount % 5 === 0) shouldBlock = true;
  } else {
    let prevUntil = 0;
    let matched = false;
    for (const phase of schedule) {
      const every = phase.every ?? 5;
      if (phase.until === undefined || phase.until === null) {
        if (!matched) {
          const offset = newCount - prevUntil;
          if (offset % every === 0) shouldBlock = true;
          matched = true;
        }
      } else if (newCount <= phase.until && !matched) {
        const offset = newCount - prevUntil;
        if (offset % every === 0) shouldBlock = true;
        matched = true;
      }
      if (phase.until !== undefined && phase.until !== null) {
        prevUntil = phase.until;
      }
    }
  }

  if (shouldBlock) {
    emitBlockDecision(DEFAULT_PROMPT);
  }
  // Non-block turns: silent (agent has proactive saving rule in rules file).
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

const MAX_INJECT_CHARS = 1200;

function loadLayer(
  store: MemoryStore,
  layer: 'preferences' | 'technical' | 'area_context' | 'guidelines',
  setting: any,
): Memory[] {
  if (setting === false || setting === 0) return [];
  const all = store.list({ layer });
  all.sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''));
  if (setting === 'all') return all;
  if (typeof setting === 'number' && setting > 0) return all.slice(0, setting);
  return all;
}

export async function sessionStart(input: HookInput): Promise<void> {
  const projectRoot = resolveProjectRoot(input);
  const sessionId = resolveSessionId(input);

  const aideDir = path.join(projectRoot, '.aide');
  if (!fs.existsSync(aideDir)) return;

  // Cleanup: clear/compact/resume → drop THIS session's tracking. start → no-op.
  const source = input.source;
  if (source === 'clear' || source === 'compact' || source === 'resume') {
    clearSessionTracking(projectRoot, sessionId);
  }

  // Inject preferences / guidelines / priority-always.
  const prefLimit = getSetting(projectRoot, 'injection.preferences') ?? 15;
  const techEnabled = getSetting(projectRoot, 'injection.technical') ?? false;
  const areaEnabled = getSetting(projectRoot, 'injection.area_context') ?? false;
  const guidelinesMode = getSetting(projectRoot, 'injection.guidelines') ?? 'all';
  const priorityOverride = getSetting(projectRoot, 'injection.priorityAlwaysOverride') ?? true;

  const store = new MemoryStore({ projectRoot });
  let output = '';
  const allInjectedIds: (string | number)[] = [];
  try {
    const preferences = loadLayer(store, 'preferences', prefLimit);
    const technical = loadLayer(store, 'technical', techEnabled);
    const areaContext = loadLayer(store, 'area_context', areaEnabled);
    const guidelines = loadLayer(store, 'guidelines', guidelinesMode);
    const alwaysPriority = priorityOverride ? (store as any).list({ priority: 'always' }) : [];

    const seen = new Set<string>();
    const add = (memories: Memory[], bucket: string[]) => {
      for (const m of memories) {
        const key = (m as any).uuid || String(m.id);
        if (!seen.has(key)) {
          seen.add(key);
          bucket.push(m.what);
          allInjectedIds.push(m.id as any);
        }
      }
    };

    const deduped = {
      preferences: [] as string[],
      technical: [] as string[],
      area_context: [] as string[],
      guidelines: [] as string[],
      always: [] as string[],
    };
    add(preferences, deduped.preferences);
    add(technical, deduped.technical);
    add(areaContext, deduped.area_context);
    add(guidelines, deduped.guidelines);
    add(alwaysPriority, deduped.always);

    const total =
      deduped.preferences.length +
      deduped.technical.length +
      deduped.area_context.length +
      deduped.guidelines.length +
      deduped.always.length;
    if (total === 0) return;

    const lines: string[] = [];
    if (deduped.preferences.length > 0) {
      lines.push('## Session Preferences');
      for (const w of deduped.preferences) lines.push(`- ${w}`);
    }
    if (deduped.technical.length > 0) {
      lines.push('## Technical Context');
      for (const w of deduped.technical) lines.push(`- ${w}`);
    }
    if (deduped.area_context.length > 0) {
      lines.push('## Area Context');
      for (const w of deduped.area_context) lines.push(`- ${w}`);
    }
    if (deduped.guidelines.length > 0) {
      lines.push('## Guidelines');
      for (const w of deduped.guidelines) lines.push(`- ${w}`);
    }
    if (deduped.always.length > 0) {
      lines.push('## Always');
      for (const w of deduped.always) lines.push(`- ${w}`);
    }
    output = lines.join('\n');
    if (output.length > MAX_INJECT_CHARS) output = output.slice(0, MAX_INJECT_CHARS) + '\n...truncated';
  } finally {
    store.close();
  }

  if (!output) return;

  // Write injected IDs to tracking so Read/Edit hooks don't redundantly block.
  if (allInjectedIds.length > 0) {
    mergeTrackedIds(projectRoot, sessionId, allInjectedIds.map(String));
  }

  // SessionStart historically emitted plain text to stdout, not the JSON
  // additionalContext envelope, because Claude Code's session-start hook reads
  // raw stdout as the initial context injection. Preserve that contract.
  process.stdout.write(output);
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
