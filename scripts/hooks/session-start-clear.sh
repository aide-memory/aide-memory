#!/bin/bash
# SessionStart hook — clean up recalled-paths tracking files.
# Fires when Claude Code starts, resumes, or clears a session.
# Removes tracking files from OTHER sessions (stale), keeps current.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CACHE_DIR="$PROJECT_ROOT/.aide/cache"

if [ -d "$CACHE_DIR" ]; then
  # Remove all recalled-paths files EXCEPT current session's
  for f in "$CACHE_DIR"/recalled-paths-*.txt; do
    [ -f "$f" ] || continue
    if [ -n "$SESSION_ID" ] && echo "$f" | grep -q "recalled-paths-${SESSION_ID}.txt"; then
      continue  # Keep current session's file
    fi
    rm -f "$f" 2>/dev/null
  done
fi

exit 0
