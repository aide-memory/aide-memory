#!/bin/bash
# SessionStart hook — manage session tracking + inject session context.
# Fires when Claude Code starts, resumes, clears, or compacts a session.
#
# Cleanup rules:
#   - start/resume: DON'T touch anything. Other sessions might be concurrent.
#     No reliable way to know if another session ended or crashed.
#   - clear: Clear THIS session's tracking (agent loses context, must re-recall).
#     Don't touch other sessions.
#   - compact: PreCompact hook handles clearing. SessionStart just re-injects.
#
# Orphaned files from crashed sessions are harmless (tiny txt files).
# Users can clean manually: rm .aide/cache/*.txt

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
SOURCE=$(echo "$INPUT" | jq -r '.source // empty')

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
CACHE_DIR="$PROJECT_ROOT/.aide/cache"

if [ -d "$CACHE_DIR" ]; then
  SID="${SESSION_ID:-default}"

  if [ "$SOURCE" = "clear" ]; then
    # Clear: THIS session's agent loses context — clear only THIS session's tracking.
    # Other concurrent sessions keep their tracking intact.
    rm -f "$CACHE_DIR/recalled-paths-${SID}.txt" 2>/dev/null
    rm -f "$CACHE_DIR/searched-queries-${SID}.txt" 2>/dev/null
    rm -f "$CACHE_DIR/correction-pending-${SID}.txt" 2>/dev/null
    rm -f "$CACHE_DIR/compact-pending-${SID}.txt" 2>/dev/null
  fi
  # start/resume/compact: don't clean anything.
  # start/resume: nothing to clean (fresh or continuing).
  # compact: PreCompact hook already cleared this session's tracking.
fi

# Inject preferences + guidelines as session context
INJECTED=$(node "$SCRIPT_DIR/session-inject.js" "$PROJECT_ROOT" 2>/dev/null)
if [ -n "$INJECTED" ]; then
  echo "$INJECTED"
fi

exit 0
