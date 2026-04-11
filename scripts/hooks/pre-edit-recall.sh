#!/bin/bash
# PreToolUse hook — nudge agent that memories exist before editing a file.
# Fires before Edit and Write tools. Calls recall-for-path.js to check
# if memories exist for the file being modified.
#
# Blocking if aide_recall has NOT been called for this path in this session.
# Soft nudge if already recalled (tracked via session-scoped recalled-paths file).

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

    # Exact file match
    if [ "$recalled_path" = "$FILE_PATH" ]; then
      ALREADY_RECALLED=true
      break
    fi
    # Directory prefix match (recalled src/auth/ covers src/auth/middleware.ts)
    if [[ "$FILE_PATH" == "$recalled_path"* ]]; then
      ALREADY_RECALLED=true
      break
    fi
  done < "$RECALLED_FILE"
fi

if [ "$ALREADY_RECALLED" = "true" ]; then
  # Already recalled — soft nudge only (non-blocking)
  exit 0
fi

# Not yet recalled — check if memories exist for this path
RESULT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" "$PROJECT_ROOT" 2>/dev/null)

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

# Block only if: scoped memories exist AND total memories >= 10
if [ "$SCOPED_COUNT" -gt 0 ] 2>/dev/null && [ "$TOTAL_MEMORIES" -ge 10 ] 2>/dev/null; then
  echo "$NUDGE" | jq -Rs '{
    decision: "block",
    reason: .
  }'
else
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
fi

exit 0
