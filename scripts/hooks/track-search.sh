#!/bin/bash
# PostToolUse hook — track aide_search calls to unblock grep/glob hooks.
# Fires after aide_search completes successfully.
# Writes the searched keyword to searched-queries-{session_id}.txt
# so that subsequent grep/glob for the same query gets soft (not block).
#
# This is the counterpart to pre-search-nudge.sh:
#   pre-search-nudge.sh blocks grep until aide_search is called
#   track-search.sh records that aide_search was called → unblocks

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$(dirname "$0")/../.." && pwd)}"

# Extract the keyword from the tool input
KEYWORD=$(echo "$INPUT" | jq -r '.tool_input.keyword // empty')

if [ -z "$KEYWORD" ]; then
  exit 0
fi

# Normalize (lowercase, trimmed) — must match pre-search-nudge.sh normalization
NORMALIZED=$(echo "$KEYWORD" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

# Write to session-scoped tracking file
SID="${SESSION_ID:-default}"
SEARCHED_FILE="$PROJECT_ROOT/.aide/cache/searched-queries-${SID}.txt"
mkdir -p "$PROJECT_ROOT/.aide/cache" 2>/dev/null
echo "$NORMALIZED" >> "$SEARCHED_FILE"

exit 0
