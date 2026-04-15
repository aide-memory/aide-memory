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

# Advisory: compaction proceeds (exit 0), but inject a system message
# reminding the agent to save. Post-compact SessionStart is the backup.
# Blocking (exit 2) doesn't give the agent an agentic turn — confirmed.
cat <<'HOOK_OUTPUT'
{
  "decision": "approve",
  "reason": "Compaction proceeding. Session tracking cleared.",
  "systemMessage": "IMPORTANT: Context was just compacted. Review the summary for any key decisions, technical constraints, preferences, or guidelines worth persisting. Call aide_remember for anything important — after compaction you only have a summary. Save what matters."
}
HOOK_OUTPUT

exit 0
