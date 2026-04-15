#!/bin/bash
# Stop hook — dynamic interval: block every 3 turns for first 9, every 5 after.
# Soft nudge on non-block turns (agent always sees reminder).
# Correction-pending flag always blocks regardless of interval.
#
# Based on data: avg Claude Code session = ~4 human prompts (Anthropic, 200K
# transcripts). Mid-task interruptions 62% dismissed (ProAIDE study).
# Dynamic interval reduces noise while ensuring short sessions get save points.

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# Prevent infinite loop — if already in a stop-hook continuation, let it stop
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
SID="${SESSION_ID:-default}"
CACHE_DIR="$PROJECT_ROOT/.aide/cache"

# Read and increment stop count for this session
COUNT_FILE="$CACHE_DIR/stop-count-${SID}.txt"
STOP_COUNT=0
if [ -f "$COUNT_FILE" ]; then
  STOP_COUNT=$(cat "$COUNT_FILE" 2>/dev/null || echo 0)
fi
STOP_COUNT=$((STOP_COUNT + 1))
mkdir -p "$CACHE_DIR" 2>/dev/null
echo "$STOP_COUNT" > "$COUNT_FILE"

# Check correction-pending flag — always block if exists
FLAG_FILE="$CACHE_DIR/correction-pending-${SID}.txt"

if [ -f "$FLAG_FILE" ]; then
  # Clear flag after presenting — agent gets one chance to store.
  # If it doesn't call aide_remember, the correction was a false positive.
  # No infinite nagging.
  rm -f "$FLAG_FILE"
  cat <<'HOOK_OUTPUT'
{
  "decision": "block",
  "reason": "A correction from this turn wasn't stored. Call aide_remember for it. Also: any decisions, technical constraints, preferences, or guidelines worth persisting? Store in the right place — aide_remember for cross-session context, relevant project docs for plans and decisions. If nothing, stop."
}
HOOK_OUTPUT
  exit 0
fi

# Dynamic interval: block every 3 for first 9 turns, every 5 after
SHOULD_BLOCK=false
if [ "$STOP_COUNT" -le 9 ]; then
  # First 9 turns: block every 3
  if [ $((STOP_COUNT % 3)) -eq 0 ]; then
    SHOULD_BLOCK=true
  fi
else
  # After 9 turns: block every 5
  if [ $(( (STOP_COUNT - 9) % 5 )) -eq 0 ]; then
    SHOULD_BLOCK=true
  fi
fi

PROMPT="Any decisions, technical constraints, preferences, or guidelines worth persisting? Store in the right place — aide_remember for cross-session context, relevant project docs for plans and decisions. If nothing, stop."

if [ "$SHOULD_BLOCK" = "true" ]; then
  echo "$PROMPT" | jq -Rs '{
    decision: "block",
    reason: .
  }'
else
  # Soft: agent sees the reminder as context but doesn't have to respond.
  # suppressOutput hides from user view — agent still sees systemMessage.
  echo "$PROMPT" | jq -Rs '{
    decision: "approve",
    suppressOutput: true,
    systemMessage: .
  }'
fi

exit 0
