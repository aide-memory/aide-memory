#!/bin/bash
# PreCompact hook — two-phase blocking to force aide_remember before compaction.
# Fires before both manual /compact and auto-compact.
# Input includes: session_id, transcript_path, trigger (manual|auto)
#
# This is a high-value hook — context loss from compaction is a major
# pain point (350+ GitHub comments document this). We block compaction
# until the agent has had a chance to save context via aide_remember.
#
# Two-phase flow:
#   Phase 1 (no flag): Block compaction (exit 2), agent saves via aide_remember.
#   Phase 2 (flag exists): Allow compaction (exit 0), clear session tracking.
#
# IMPORTANT: exit code is what controls blocking, NOT the JSON "decision" field.
# exit 0 = allow, exit 2 = block. Previous bug: exit 0 with {"decision":"block"}
# did NOT actually block — compaction proceeded and agent never called aide_remember.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
SID="${SESSION_ID:-default}"

FLAG_FILE="$PROJECT_ROOT/.aide/cache/compact-pending-${SID}.txt"

if [ -f "$FLAG_FILE" ]; then
  # Phase 2: flag exists — agent already had a chance to save.
  # Allow compaction, clear session tracking (agent loses context).
  rm -f "$FLAG_FILE"
  rm -f "$PROJECT_ROOT/.aide/cache/recalled-paths-${SID}.txt" 2>/dev/null
  rm -f "$PROJECT_ROOT/.aide/cache/searched-queries-${SID}.txt" 2>/dev/null
  rm -f "$PROJECT_ROOT/.aide/cache/correction-pending-${SID}.txt" 2>/dev/null

  cat <<'HOOK_OUTPUT'
{
  "decision": "allow",
  "reason": "Compaction proceeding. Session tracking cleared."
}
HOOK_OUTPUT
  exit 0
else
  # Phase 1: no flag — block compaction, prompt agent to save first.
  mkdir -p "$PROJECT_ROOT/.aide/cache"
  echo "pending" > "$FLAG_FILE"

  cat <<'HOOK_OUTPUT'
{
  "decision": "block",
  "reason": "BEFORE compacting: save any key decisions, technical constraints, preferences, or guidelines via aide_remember (source: hook). Store in the right place — aide_remember for cross-session context, relevant project docs for plans and decisions. If aide_remember unavailable, write JSON lines to .aide/pending-memories.jsonl and tell user to start the MCP server. If nothing worth storing, proceed — compaction will continue on next attempt."
}
HOOK_OUTPUT
  exit 2
fi
