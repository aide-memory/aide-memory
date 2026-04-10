#!/bin/bash
# PreToolUse hook — track when aide_recall is called.
# Fires before mcp__aide-memory__aide_recall tool.
# Writes recalled paths to session-scoped tracking file so the
# Read hook knows not to block again for these paths.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
# aide_recall's paths parameter is an array
PATHS=$(echo "$INPUT" | jq -r '.tool_input.paths // [] | .[]' 2>/dev/null)

if [ -z "$PATHS" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CACHE_DIR="$PROJECT_ROOT/.aide/cache"
mkdir -p "$CACHE_DIR" 2>/dev/null

# Use session_id for isolation, fall back to "default" if unavailable
SID="${SESSION_ID:-default}"
RECALLED_FILE="$CACHE_DIR/recalled-paths-${SID}.txt"

# Write each path to the session-scoped tracking file (resolved to absolute)
while IFS= read -r p; do
  if [[ "$p" = /* ]]; then
    echo "$p" >> "$RECALLED_FILE"
  else
    echo "$PROJECT_ROOT/$p" >> "$RECALLED_FILE"
  fi
done <<< "$PATHS"

exit 0
