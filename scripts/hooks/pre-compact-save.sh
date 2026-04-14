#!/bin/bash
# PreCompact hook — cleanup only. Clears session tracking before compaction.
# Fires before both manual /compact and auto-compact.
#
# This is a high-value touchpoint — context loss from compaction is a major
# pain point (350+ GitHub comments document this). However, PreCompact hooks
# CANNOT force agent tool calls (neither exit 0 nor exit 2 gives the agent
# an agentic turn during compaction). So we rely on the Stop hook for save
# prompts and use PreCompact purely for cleanup.
#
# The Stop hook fires on every agent turn and already prompts aide_remember.
# By the time compaction triggers, Stop has already prompted saving.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
SID="${SESSION_ID:-default}"

# Clear ALL session tracking — agent is about to lose context
rm -f "$PROJECT_ROOT/.aide/cache/recalled-paths-${SID}.txt" 2>/dev/null
rm -f "$PROJECT_ROOT/.aide/cache/searched-queries-${SID}.txt" 2>/dev/null
rm -f "$PROJECT_ROOT/.aide/cache/correction-pending-${SID}.txt" 2>/dev/null
rm -f "$PROJECT_ROOT/.aide/cache/compact-pending-${SID}.txt" 2>/dev/null

# Block compaction — prompt agent to save context first.
# With Claude Code v2.1.105+ PreCompact hook support, "decision": "block"
# should give the agent an agentic turn to call aide_remember before compaction.
cat <<'HOOK_OUTPUT'
{
  "decision": "block",
  "reason": "IMPORTANT: Context is about to be compacted and detail will be lost. BEFORE anything else, save any key decisions, technical constraints, preferences, or guidelines from this session via aide_remember (source: hook). You have full context RIGHT NOW — after compaction you will only have a summary. Save what matters. If nothing to save, proceed."
}
HOOK_OUTPUT

exit 2
