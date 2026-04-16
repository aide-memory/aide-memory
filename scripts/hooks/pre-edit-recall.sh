#!/bin/bash
# PreToolUse hook — ID-based blocking for file edits.
# Same logic as pre-read-recall.sh but for Edit/Write tools.
#
# BLOCK: new file + unrecalled IDs (NONE or SOME covered)
# SOFT: encountered file + unrecalled IDs
# SILENT: all scoped IDs covered OR no scoped memories

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$(dirname "$0")/../.." && pwd)}"

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if [ ! -f "$FILE_PATH" ] && [ ! -d "$FILE_PATH" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/read-config.sh"
RESULT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" "$PROJECT_ROOT" 2>/dev/null)

if [ -z "$RESULT" ] || [ "$RESULT" = "0" ]; then
  exit 0
fi

COUNT=$(echo "$RESULT" | jq -r '.count // 0' 2>/dev/null)
if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  exit 0
fi

SCOPED_COUNT=$(echo "$RESULT" | jq -r '.scoped_count // 0' 2>/dev/null)
if [ "$SCOPED_COUNT" = "0" ] || [ -z "$SCOPED_COUNT" ]; then
  exit 0
fi

SCOPED_IDS=$(echo "$RESULT" | jq -r '.scoped_ids // [] | map(tostring) | .[]' 2>/dev/null)
if [ -z "$SCOPED_IDS" ]; then
  exit 0
fi

SID="${SESSION_ID:-default}"
RECALLED_FILE="$PROJECT_ROOT/.aide/cache/recalled-paths-${SID}.txt"

RECALLED_IDS=""
if [ -f "$RECALLED_FILE" ]; then
  IDS_LINE=$(grep '^ids|' "$RECALLED_FILE" 2>/dev/null | tail -1)
  if [ -n "$IDS_LINE" ]; then
    RECALLED_IDS="${IDS_LINE#ids|}"
  fi
fi

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

if [ "$COVERED_COUNT" -eq "$TOTAL_SCOPED" ]; then
  exit 0
fi

ENCOUNTERED=false
if [ -f "$RECALLED_FILE" ]; then
  if grep -qF "file|${FILE_PATH}" "$RECALLED_FILE" 2>/dev/null; then
    ENCOUNTERED=true
  fi
fi

MISSING_COUNT=$((TOTAL_SCOPED - COVERED_COUNT))
SOFTENING_THRESHOLD=$(get_setting "memories.softening.threshold")
SOFTENING_THRESHOLD=${SOFTENING_THRESHOLD:-10}
TOTAL_MEMORIES=$(echo "$RESULT" | jq -r '.total_memories // 0' 2>/dev/null)

FORCE_SOFT=false
if [ "$TOTAL_MEMORIES" -lt "$SOFTENING_THRESHOLD" ] 2>/dev/null; then
  FORCE_SOFT=true
fi

if [ "$COVERED_COUNT" -eq 0 ]; then
  NUDGE="${SCOPED_COUNT} memories for ${FILE_PATH}. Call aide_recall({paths: ['${FILE_PATH}']}) before editing."
else
  NUDGE="${MISSING_COUNT} memories for ${FILE_PATH} not yet recalled. Call aide_recall({ids: [${MISSING_IDS}]}) before editing."
fi

if [ "$FORCE_SOFT" = "true" ] || [ "$ENCOUNTERED" = "true" ]; then
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
else
  echo "$NUDGE" | jq -Rs '{
    decision: "block",
    reason: .
  }'
fi

exit 0
