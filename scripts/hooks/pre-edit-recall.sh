#!/bin/bash
# PreToolUse hook — nudge agent that memories exist before editing a file.
# Fires before Edit and Write tools. Calls recall-for-path.js to check
# if memories exist for the file being modified.
#
# Blocking if aide_recall has NOT been called for this path in this session.
# Soft nudge if already recalled (tracked via session-scoped recalled-paths file).

# Max times a file can be blocked before switching to soft nudge
# Read from config (defaults to 1)
MAX_BLOCKS=$(get_setting "hooks.edit.maxBlocks")
MAX_BLOCKS=${MAX_BLOCKS:-1}

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
SID="${SESSION_ID:-default}"
RECALLED_FILE="$PROJECT_ROOT/.aide/cache/recalled-paths-${SID}.txt"

# Check if path (or a parent directory) was already recalled in this session
# Handles both file|path and dir|path entry formats
ALREADY_RECALLED=false
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

    # file| entries: exact match only
    if [[ "$recalled_entry" == file\|* ]]; then
      if [ "$recalled_path" = "$FILE_PATH" ]; then
        ALREADY_RECALLED=true
        break
      fi
    elif [[ "$recalled_entry" == dir\|* ]]; then
      # dir| entries: skip — handled by directory trigger logic (read hook only)
      continue
    else
      # Legacy format (no prefix): exact match only
      if [ "$recalled_path" = "$FILE_PATH" ]; then
        ALREADY_RECALLED=true
        break
      fi
    fi
  done < "$RECALLED_FILE"
fi

# Not yet recalled by file — check if memories exist for this path
# (need RESULT for ID-based check below)
RESULT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" "$PROJECT_ROOT" 2>/dev/null)

# ID-based check: if this file's scoped memory IDs are ALL already in the
# ids| tracking line (from a previous directory or file recall), the agent
# already has the context — no need to block again.
if [ "$ALREADY_RECALLED" = "false" ] && [ -n "$RESULT" ] && [ "$RESULT" != "0" ]; then
  SCOPED_COUNT_CHECK=$(echo "$RESULT" | jq -r '.scoped_count // 0' 2>/dev/null)
  if [ "$SCOPED_COUNT_CHECK" -gt 0 ] 2>/dev/null; then
    SCOPED_IDS=$(echo "$RESULT" | jq -r '.scoped_ids // [] | map(tostring) | .[]' 2>/dev/null)
    if [ -n "$SCOPED_IDS" ] && [ -f "$RECALLED_FILE" ]; then
      RECALLED_IDS=$(grep "^ids|" "$RECALLED_FILE" | tail -1 | sed 's/^ids|//')
      if [ -n "$RECALLED_IDS" ]; then
        ALL_COVERED=true
        for sid in $SCOPED_IDS; do
          if ! echo ",$RECALLED_IDS," | grep -q ",$sid,"; then
            ALL_COVERED=false
            break
          fi
        done
        if [ "$ALL_COVERED" = "true" ]; then
          ALREADY_RECALLED=true
        fi
      fi
    fi
  fi
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
