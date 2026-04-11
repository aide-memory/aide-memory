#!/bin/bash
# SessionStart hook — clean up stale tracking files and inject session context.
# Fires when Claude Code starts, resumes, or clears a session.
# 1. Removes tracking files from OTHER sessions (stale), keeps current.
# 2. Injects preferences + guidelines as session context via stdout.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
CACHE_DIR="$PROJECT_ROOT/.aide/cache"

if [ -d "$CACHE_DIR" ]; then
  # Remove all session-scoped tracking files EXCEPT current session's
  for f in "$CACHE_DIR"/recalled-paths-*.txt "$CACHE_DIR"/searched-queries-*.txt "$CACHE_DIR"/correction-pending-*.txt; do
    [ -f "$f" ] || continue
    if [ -n "$SESSION_ID" ] && echo "$f" | grep -q "${SESSION_ID}"; then
      continue  # Keep current session's file
    fi
    rm -f "$f" 2>/dev/null
  done
fi

# Inject preferences + guidelines as session context
INJECTED=$(node "$SCRIPT_DIR/session-inject.js" 2>/dev/null)
if [ -n "$INJECTED" ]; then
  echo "$INJECTED"
fi

exit 0
