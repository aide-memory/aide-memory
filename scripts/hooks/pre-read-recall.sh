#!/bin/bash
# PreToolUse hook — nudge agent that memories exist for a file path.
# Fires before Read tool. Calls recall-for-path.js to get layer counts,
# dir/file split, topic keywords, and per-layer topics for the file being read.
#
# Blocking if aide_recall has NOT been called for this path in this session.
# Soft nudge if already recalled (tracked via session-scoped recalled-paths file).
# Also triggers directory-level recall when >=2 files from same parent dir are read.

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

# Skip non-existent files — no useful recall for files that dont exist
if [ ! -f "$FILE_PATH" ] && [ ! -d "$FILE_PATH" ]; then
  exit 0
fi

# Detect reads of .aide/memories/ files — log analytics nudge
if echo "$FILE_PATH" | grep -q '\.aide/memories/'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"memory_file_direct_read: You are reading a raw memory file. Use aide_recall for structured context."}}' | jq .
  exit 0
fi

# Get memory info via direct store access
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/read-config.sh"
MAX_BLOCKS=$(get_setting "hooks.read.maxBlocks")
MAX_BLOCKS=${MAX_BLOCKS:-1}
RESULT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" "$PROJECT_ROOT" 2>/dev/null)

# No result or zero count = nothing to recall
if [ -z "$RESULT" ] || [ "$RESULT" = "0" ]; then
  exit 0
fi

# Parse JSON result
COUNT=$(echo "$RESULT" | jq -r '.count // 0' 2>/dev/null)
if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  exit 0
fi

# Parse dir/file split
FILE_COUNT=$(echo "$RESULT" | jq -r '.file_count // 0' 2>/dev/null)
DIR_COUNT=$(echo "$RESULT" | jq -r '.dir_count // 0' 2>/dev/null)
SUGGESTED_PATH=$(echo "$RESULT" | jq -r '.suggested_path // empty' 2>/dev/null)

# Build layer breakdown string
LAYERS=$(echo "$RESULT" | jq -r '[.layers | to_entries[] | "\(.value) \(.key)"] | join(", ")' 2>/dev/null)

# Build topics string
TOPICS=$(echo "$RESULT" | jq -r '.topics | join(", ")' 2>/dev/null)

# Parse scoped vs project-wide counts for block/soft decision
SCOPED_COUNT=$(echo "$RESULT" | jq -r '.scoped_count // 0' 2>/dev/null)
TOTAL_MEMORIES=$(echo "$RESULT" | jq -r '.total_memories // 0' 2>/dev/null)

# Compute parent directory display name from suggested_path or file path
PARENT_DIR=""
if [ -n "$SUGGESTED_PATH" ] && [ "$SUGGESTED_PATH" != "null" ]; then
  PARENT_DIR="$SUGGESTED_PATH"
else
  PARENT_DIR=$(dirname "$FILE_PATH")/
fi

# Format the nudge message with dir/file split
NUDGE="${COUNT} memories (${FILE_COUNT} file-specific, ${DIR_COUNT} from ${PARENT_DIR}) (${LAYERS})"
if [ -n "$TOPICS" ] && [ "$TOPICS" != "null" ] && [ "$TOPICS" != "" ]; then
  NUDGE="${NUDGE} — topics: ${TOPICS}"
fi
NUDGE="${NUDGE}. Call aide_recall if results not already in this conversation."

# Check session-scoped tracking file
SID="${SESSION_ID:-default}"
RECALLED_FILE="$PROJECT_ROOT/.aide/cache/recalled-paths-${SID}.txt"

# Check if path (or a parent directory) was already recalled in this session
# Handles both file|path and dir|path entry formats
ALREADY_RECALLED=false
if [ -f "$RECALLED_FILE" ]; then
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
      # dir| entries: skip for file-level check — handled by directory trigger below
      continue
    else
      # Legacy format (no prefix): exact match only
      if [ "$recalled_path" = "$FILE_PATH" ]; then
        ALREADY_RECALLED=true
        break
      fi
    fi
  done < "$RECALLED_FILE"

  # ID-based check: if this file's scoped memory IDs are ALL already in the
  # ids| tracking line (from a previous directory or file recall), the agent
  # already has the context — no need to block again.
  if [ "$ALREADY_RECALLED" = "false" ] && [ "$SCOPED_COUNT" -gt 0 ] 2>/dev/null; then
    SCOPED_IDS=$(echo "$RESULT" | jq -r '.scoped_ids // [] | map(tostring) | .[]' 2>/dev/null)
    if [ -n "$SCOPED_IDS" ]; then
      # Get all recalled IDs from tracking
      RECALLED_IDS=""
      if [ -f "$RECALLED_FILE" ]; then
        RECALLED_IDS=$(grep "^ids|" "$RECALLED_FILE" | tail -1 | sed 's/^ids|//')
      fi
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

# Directory trigger: only if current file is NOT already recalled
if [ "$ALREADY_RECALLED" = "false" ]; then
# If >=2 files from same parent dir have been read,
# and dir|{parent} is NOT in tracking, suggest a directory-level recall
if [ -f "$RECALLED_FILE" ] && [ -n "$PARENT_DIR" ]; then
  # Get absolute parent dir for matching
  ABS_PARENT=$(dirname "$FILE_PATH")
  # Count distinct file|path entries from the same parent directory
  SIBLING_COUNT=0
  DIR_RECALLED=false
  while IFS= read -r recalled_entry; do
    if [[ "$recalled_entry" == dir\|"$ABS_PARENT"* ]]; then
      DIR_RECALLED=true
      break
    fi
    if [[ "$recalled_entry" == file\|"$ABS_PARENT/"* ]]; then
      SIBLING_COUNT=$((SIBLING_COUNT + 1))
    fi
    # Also handle legacy format (no prefix) for backward compat
    if [[ "$recalled_entry" != file\|* ]] && [[ "$recalled_entry" != dir\|* ]] && [[ "$recalled_entry" != ids\|* ]]; then
      if [[ "$recalled_entry" == "$ABS_PARENT/"* ]]; then
        SIBLING_COUNT=$((SIBLING_COUNT + 1))
      fi
    fi
  done < "$RECALLED_FILE"

  if [ "$DIR_RECALLED" = "false" ] && [ "$SIBLING_COUNT" -ge 1 ]; then
    DIR_NUDGE="You're reading multiple files in ${PARENT_DIR}. Call aide_recall({paths: ['${PARENT_DIR}']}) for broader context."
    echo "$DIR_NUDGE" | jq -Rs '{
      decision: "block",
      reason: .
    }'
    exit 0
  fi
fi
fi

if [ "$ALREADY_RECALLED" = "true" ]; then
  # Already recalled in this session — soft nudge only
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
  exit 0
fi

# Not yet recalled — decide block vs soft based on scoped memories + project size
# Block only if: scoped memories exist (file/dir-specific) AND total memories >= threshold
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

    # Scoped memories + mature project → block
    echo "$NUDGE" | jq -Rs '{
      decision: "block",
      reason: .
    }'
  fi
else
  # Project-wide only OR new project (<10 mems) → soft nudge
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
fi

exit 0
