#!/bin/bash
# Stop hook — nudge agent to call aide_remember after completing a task.
# Fires when agent finishes responding. Blocks the first stop to let the
# agent reflect and store knowledge. On the second stop (stop_hook_active=true),
# exits cleanly to allow normal stop.
#
# Dedup: checks session-scoped temp file to avoid storing duplicate memories
# within the same interaction. The temp file is keyed by session PID.

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# Prevent infinite loop — if already in a stop-hook continuation, let it stop
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# Check if a correction-pending flag exists for this session
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SID="${SESSION_ID:-default}"
FLAG_FILE="$PROJECT_ROOT/.aide/cache/correction-pending-${SID}.txt"

if [ -f "$FLAG_FILE" ]; then
  # Correction was detected but not yet stored — block with stronger message
  cat <<'HOOK_OUTPUT'
{
  "decision": "block",
  "reason": "A correction from this turn wasn't stored. Call aide_remember for it. Also: any decisions, technical constraints, preferences, or guidelines worth persisting? Store in the right place — aide_remember for cross-session context, relevant project docs for plans and decisions. If nothing, stop."
}
HOOK_OUTPUT
else
  # No pending correction — standard reflection prompt
  cat <<'HOOK_OUTPUT'
{
  "decision": "block",
  "reason": "Any decisions, technical constraints, preferences, or guidelines worth persisting? Store in the right place — aide_remember for cross-session context, relevant project docs for plans and decisions. If nothing, stop."
}
HOOK_OUTPUT
fi
