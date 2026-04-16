#!/bin/bash
# PreToolUse hook — nudge agent that memories exist before editing a file.
# Fires before Edit and Write tools. Calls recall-for-path.js to check
# if memories exist for the file being modified.
#
# Blocking if aide_recall has NOT been called for this path in this session.
# Soft nudge if already recalled (tracked via session-scoped recalled-paths file).

# Max times a file can be blocked before switching to soft nudge
# Read from config (defaults to 1)
# MAX_BLOCKS read after SCRIPT_DIR is set and read-config.sh is sourced (below)

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$(dirname "$0")/../.." && pwd)}"

# No file path = nothing to recall
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Set up paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/read-config.sh"
MAX_BLOCKS=$(get_setting "hooks.edit.maxBlocks")
MAX_BLOCKS=${MAX_BLOCKS:-1}
SID="${SESSION_ID:-default}"
RECALLED_FILE="$PROJECT_ROOT/.aide/cache/recalled-paths-${SID}.txt"

# Check if path (or a parent directory) was already recalled in this session
# Handles both file|path and dir|path entry formats
ALREADY_RECALLED=false
DIR_MATCH=false
if [ -f "$RECALLED_FILE" ]; then
  # Compute parent directory for dir| prefix matching
  ABS_PARENT=$(dirname "$FILE_PATH")

  while IFS= read -r recalled_entry; do
    # Extract path from entry (strip file| or dir| prefix if present)
    recalled_path="${recalled_entry}"
    if [[ "$recalled_entry" == file\|* ]]; then
      recalled_path="${recalled_entry#file|}"
    elif [[ "$recalled_entry" == dir\|* ]]; then
      recalled_path="${recalled_entry#dir|}"
    elif [[ "$recalled_entry" == ids\|* ]]; then
      continue  # skip ID tracking lines
    fi

    # Exact file match
    if [ "$recalled_path" = "$FILE_PATH" ]; then
      ALREADY_RECALLED=true
      break
    fi
    # Directory prefix match — file is under a recalled directory
    if [[ "$recalled_entry" == dir\|* ]] && [[ "$FILE_PATH" == "$recalled_path"* ]]; then
      DIR_MATCH=true
      break
    fi
  done < "$RECALLED_FILE"

  # If dir match found, check IDs for precise coverage
  if [ "$DIR_MATCH" = "true" ]; then
    RESULT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" "$PROJECT_ROOT" 2>/dev/null)
    IDS_LINE=$(grep '^ids|' "$RECALLED_FILE" 2>/dev/null | tail -1)
    if [ -n "$IDS_LINE" ] && [ -n "$RESULT" ]; then
      RECALLED_IDS="${IDS_LINE#ids|}"
      FILE_SCOPED_IDS=$(echo "$RESULT" | jq -r '.scoped_ids // [] | map(tostring) | .[]' 2>/dev/null)
      if [ -n "$FILE_SCOPED_IDS" ]; then
        ALL_COVERED=true
        for sid in $FILE_SCOPED_IDS; do
          if ! echo ",$RECALLED_IDS," | grep -qF ",$sid,"; then
            ALL_COVERED=false
            break
          fi
        done
        if [ "$ALL_COVERED" = "true" ]; then
          ALREADY_RECALLED=true
        fi
      else
        ALREADY_RECALLED=true
      fi
    else
      # No ids| tracking yet — trust directory prefix match
      ALREADY_RECALLED=true
    fi
  fi
fi

# Check if memories exist for this path (if not already fetched)
if [ -z "$RESULT" ]; then
  RESULT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" "$PROJECT_ROOT" 2>/dev/null)
fi

if [ "$ALREADY_RECALLED" = "true" ]; then
  # Already recalled — soft nudge only (non-blocking)
  exit 0
fi

# No result or zero count = nothing to recall, exit silently
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

# Format the block message
NUDGE="${COUNT} memories for ${FILE_PATH} (${LAYERS})"
if [ -n "$TOPICS" ] && [ "$TOPICS" != "null" ] && [ "$TOPICS" != "" ]; then
  NUDGE="${NUDGE} — topics: ${TOPICS}"
fi
NUDGE="${NUDGE}. Call aide_recall({paths: ['${FILE_PATH}']}) before editing."

# Parse scoped vs project-wide counts for block/soft decision
SCOPED_COUNT=$(echo "$RESULT" | jq -r '.scoped_count // 0' 2>/dev/null)
TOTAL_MEMORIES=$(echo "$RESULT" | jq -r '.total_memories // 0' 2>/dev/null)

# Block only if: scoped memories exist AND total memories >= threshold
SOFTENING_THRESHOLD=$(get_setting "memories.softening.threshold")
if [ "$SCOPED_COUNT" -gt 0 ] 2>/dev/null && [ "$TOTAL_MEMORIES" -ge "${SOFTENING_THRESHOLD:-10}" ] 2>/dev/null; then
  # Check block count for this file — block-once-then-soft
  BLOCK_COUNT=0
  if [ -f "$RECALLED_FILE" ]; then
    while IFS= read -r entry; do
      if [[ "$entry" == "block-count|${FILE_PATH}|"* ]]; then
        BLOCK_COUNT="${entry##*|}"
        break
      fi
    done < "$RECALLED_FILE"
  fi

  if [ "$BLOCK_COUNT" -ge "$MAX_BLOCKS" ]; then
    # Already blocked enough times — switch to soft with remaining count
    SOFT_MSG="${SCOPED_COUNT} more scoped memories for this file haven't been recalled yet. Call aide_recall if needed."
    echo "$SOFT_MSG" | jq -Rs '{
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: .
      }
    }'
  else
    # First block — write/increment block count entry
    NEW_BLOCK_COUNT=$((BLOCK_COUNT + 1))
    mkdir -p "$(dirname "$RECALLED_FILE")" 2>/dev/null
    # Remove old block-count entry if exists, then write new one
    if [ -f "$RECALLED_FILE" ]; then
      grep -Fv "block-count|${FILE_PATH}|" "$RECALLED_FILE" > "${RECALLED_FILE}.tmp" 2>/dev/null
      mv "${RECALLED_FILE}.tmp" "$RECALLED_FILE"
    fi
    echo "block-count|${FILE_PATH}|${NEW_BLOCK_COUNT}" >> "$RECALLED_FILE"

    echo "$NUDGE" | jq -Rs '{
      decision: "block",
      reason: .
    }'
  fi
else
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
fi

exit 0
