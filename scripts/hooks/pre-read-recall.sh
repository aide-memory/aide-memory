#!/bin/bash
# PreToolUse hook — nudge agent that memories exist for a file path.
# Fires before Read tool. Calls recall-for-path.js to get layer counts
# and topic keywords for memories scoped to the file being read.
#
# Blocking if aide_recall has NOT been called for this path in this session.
# Soft nudge if already recalled (tracked via session-scoped recalled-paths file).

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

# No file path = nothing to recall
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Detect reads of .aide/memories/ files — log analytics nudge
if echo "$FILE_PATH" | grep -q '\.aide/memories/'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"memory_file_direct_read: You are reading a raw memory file. Use aide_recall for structured context."}}' | jq .
  exit 0
fi

# Get memory info via direct store access
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RESULT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" 2>/dev/null)

# No result or zero count = nothing to recall
if [ -z "$RESULT" ] || [ "$RESULT" = "0" ]; then
  exit 0
fi

# Parse JSON result
COUNT=$(echo "$RESULT" | jq -r '.count // 0' 2>/dev/null)
if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  exit 0
fi

# Build layer breakdown string
LAYERS=$(echo "$RESULT" | jq -r '[.layers | to_entries[] | "\(.value) \(.key)"] | join(", ")' 2>/dev/null)

# Build topics string
TOPICS=$(echo "$RESULT" | jq -r '.topics | join(", ")' 2>/dev/null)

# Format the nudge message
NUDGE="${COUNT} memories for ${FILE_PATH} (${LAYERS})"
if [ -n "$TOPICS" ] && [ "$TOPICS" != "null" ] && [ "$TOPICS" != "" ]; then
  NUDGE="${NUDGE} — topics: ${TOPICS}"
fi
NUDGE="${NUDGE}. Call aide_recall if results not already in this conversation."

# Check session-scoped tracking file
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SID="${SESSION_ID:-default}"
RECALLED_FILE="$PROJECT_ROOT/.aide/cache/recalled-paths-${SID}.txt"

# Check if path was already recalled in this session — if so, soft nudge
if [ -f "$RECALLED_FILE" ] && grep -qF "$FILE_PATH" "$RECALLED_FILE" 2>/dev/null; then
  # Already recalled in this session — soft nudge only
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
  exit 0
fi

# Not yet recalled in this session — block until agent calls aide_recall
echo "$NUDGE" | jq -Rs '{
  decision: "block",
  reason: .
}'

exit 0
