#!/bin/bash
# PreToolUse hook — ID-based blocking for file reads.
# Checks if the file's scoped memory IDs are already in the ids| tracking.
#
# BLOCK: new file + unrecalled IDs → path-based recall message
# BLOCK: new file + SOME IDs covered → ID-based recall message (missing only)
# SOFT: encountered file + unrecalled IDs → ID-based recall message
# SILENT: all scoped IDs covered OR no scoped memories

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$(dirname "$0")/../.." && pwd)}"

# No file path = nothing to check
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Skip non-existent files
if [ ! -f "$FILE_PATH" ] && [ ! -d "$FILE_PATH" ]; then
  exit 0
fi

# Skip direct reads of .aide/memories/ files
if echo "$FILE_PATH" | grep -q '\.aide/memories/'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"memory_file_direct_read: You are reading a raw memory file. Use aide_recall for structured context."}}' | jq .
  exit 0
fi

# Get memory info for this file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/read-config.sh"
RESULT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" "$PROJECT_ROOT" 2>/dev/null)

# No result or zero count = no memories for this path → SILENT
if [ -z "$RESULT" ] || [ "$RESULT" = "0" ]; then
  exit 0
fi

COUNT=$(echo "$RESULT" | jq -r '.count // 0' 2>/dev/null)
if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  exit 0
fi

SCOPED_COUNT=$(echo "$RESULT" | jq -r '.scoped_count // 0' 2>/dev/null)

# No scoped memories → SILENT (project-wide only, handled by SessionStart)
if [ "$SCOPED_COUNT" = "0" ] || [ -z "$SCOPED_COUNT" ]; then
  exit 0
fi

# Get this file's scoped IDs
SCOPED_IDS=$(echo "$RESULT" | jq -r '.scoped_ids // [] | map(tostring) | .[]' 2>/dev/null)
if [ -z "$SCOPED_IDS" ]; then
  exit 0
fi

# Session tracking
SID="${SESSION_ID:-default}"
RECALLED_FILE="$PROJECT_ROOT/.aide/cache/recalled-paths-${SID}.txt"

# Get recalled IDs from tracking
RECALLED_IDS=""
if [ -f "$RECALLED_FILE" ]; then
  IDS_LINE=$(grep '^ids|' "$RECALLED_FILE" 2>/dev/null | tail -1)
  if [ -n "$IDS_LINE" ]; then
    RECALLED_IDS="${IDS_LINE#ids|}"
  fi
fi

# Check ID coverage
MISSING_IDS=""
COVERED_COUNT=0
TOTAL_SCOPED=0
for sid in $SCOPED_IDS; do
  TOTAL_SCOPED=$((TOTAL_SCOPED + 1))
  if [ -n "$RECALLED_IDS" ] && echo ",$RECALLED_IDS," | grep -qF ",$sid,"; then
    COVERED_COUNT=$((COVERED_COUNT + 1))
  else
    if [ -n "$MISSING_IDS" ]; then
      MISSING_IDS="$MISSING_IDS,$sid"
    else
      MISSING_IDS="$sid"
    fi
  fi
done

# ALL covered → SILENT
if [ "$COVERED_COUNT" -eq "$TOTAL_SCOPED" ]; then
  exit 0
fi

# Check if file was encountered before (file| in tracking)
ENCOUNTERED=false
if [ -f "$RECALLED_FILE" ]; then
  if grep -qF "file|${FILE_PATH}" "$RECALLED_FILE" 2>/dev/null; then
    ENCOUNTERED=true
  fi
fi

# Build nudge message with file path context
MISSING_COUNT=$((TOTAL_SCOPED - COVERED_COUNT))
SOFTENING_THRESHOLD=$(get_setting "memories.softening.threshold")
SOFTENING_THRESHOLD=${SOFTENING_THRESHOLD:-10}
TOTAL_MEMORIES=$(echo "$RESULT" | jq -r '.total_memories // 0' 2>/dev/null)

# New project softening: < threshold total mems → always soft, never block
FORCE_SOFT=false
if [ "$TOTAL_MEMORIES" -lt "$SOFTENING_THRESHOLD" ] 2>/dev/null; then
  FORCE_SOFT=true
fi

if [ "$COVERED_COUNT" -eq 0 ]; then
  # NONE covered → path-based recall message
  LAYERS=$(echo "$RESULT" | jq -r '[.layers | to_entries[] | "\(.value) \(.key)"] | join(", ")' 2>/dev/null)
  TOPICS=$(echo "$RESULT" | jq -r '.topics | join(", ")' 2>/dev/null)
  NUDGE="${SCOPED_COUNT} memories for ${FILE_PATH}. Call aide_recall({paths: ['${FILE_PATH}']})."
  if [ -n "$TOPICS" ] && [ "$TOPICS" != "null" ] && [ "$TOPICS" != "" ]; then
    NUDGE="${SCOPED_COUNT} memories for ${FILE_PATH} (${LAYERS}) — topics: ${TOPICS}. Call aide_recall({paths: ['${FILE_PATH}']})."
  fi
else
  # SOME covered → ID-based recall message (missing only)
  NUDGE="${MISSING_COUNT} memories for ${FILE_PATH} not yet recalled. Call aide_recall({ids: [${MISSING_IDS}]})."
fi

# Determine block vs soft
if [ "$FORCE_SOFT" = "true" ]; then
  # New project → soft
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
elif [ "$ENCOUNTERED" = "true" ]; then
  # Encountered + missing IDs → SOFT
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
else
  # New + missing IDs → BLOCK
  echo "$NUDGE" | jq -Rs '{
    decision: "block",
    reason: .
  }'
fi

exit 0
