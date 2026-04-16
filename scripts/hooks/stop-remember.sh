#!/bin/bash
# Stop hook — dynamic interval: 3→5→10 (every 3 for turns 1-9, every 5 for 10-29, every 10 for 30+).
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
source "$SCRIPT_DIR/read-config.sh"
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

# Dynamic interval from config schedule
# Schedule format: [{"until":9,"every":3},{"until":29,"every":5},{"every":10}]
SCHEDULE=$(get_setting_json "hooks.stop.schedule")
SHOULD_BLOCK=false

# Parse schedule phases from JSON array
PHASE_COUNT=$(echo "$SCHEDULE" | jq 'length' 2>/dev/null)
if [ -z "$PHASE_COUNT" ] || [ "$PHASE_COUNT" = "0" ]; then
  # Fallback: block every 5 if schedule is missing
  if [ $((STOP_COUNT % 5)) -eq 0 ]; then
    SHOULD_BLOCK=true
  fi
else
  PREV_UNTIL=0
  MATCHED=false
  for i in $(seq 0 $((PHASE_COUNT - 1))); do
    PHASE_UNTIL=$(echo "$SCHEDULE" | jq -r ".[$i].until // 0" 2>/dev/null)
    PHASE_EVERY=$(echo "$SCHEDULE" | jq -r ".[$i].every // 5" 2>/dev/null)

    if [ "$PHASE_UNTIL" = "0" ] || [ "$PHASE_UNTIL" = "null" ]; then
      # Last phase (no until) — applies to all remaining turns
      if [ "$MATCHED" = "false" ]; then
        OFFSET=$((STOP_COUNT - PREV_UNTIL))
        if [ $((OFFSET % PHASE_EVERY)) -eq 0 ]; then
          SHOULD_BLOCK=true
        fi
        MATCHED=true
      fi
    elif [ "$STOP_COUNT" -le "$PHASE_UNTIL" ] && [ "$MATCHED" = "false" ]; then
      # This phase applies
      OFFSET=$((STOP_COUNT - PREV_UNTIL))
      if [ $((OFFSET % PHASE_EVERY)) -eq 0 ]; then
        SHOULD_BLOCK=true
      fi
      MATCHED=true
    fi

    # Track previous until for offset calculation
    if [ "$PHASE_UNTIL" != "0" ] && [ "$PHASE_UNTIL" != "null" ]; then
      PREV_UNTIL=$PHASE_UNTIL
    fi
  done
fi

PROMPT="Any decisions, technical constraints, preferences, or guidelines worth persisting? Store in the right place — aide_remember for cross-session context, relevant project docs for plans and decisions. If nothing, stop."

if [ "$SHOULD_BLOCK" = "true" ]; then
  echo "$PROMPT" | jq -Rs '{
    decision: "block",
    reason: .
  }'
fi
# Non-block turns: silent. Agent has proactive saving rule in rules file —
# no Stop hook output needed. Block turns provide explicit checkpoints.

exit 0
