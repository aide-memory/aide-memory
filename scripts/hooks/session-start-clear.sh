#!/bin/bash
# SessionStart hook — manage session tracking + inject session context.
# Fires when Claude Code starts, resumes, clears, or compacts a session.
#
# Cleanup rules:
#   - start/resume: DON'T touch anything. Other sessions might be concurrent.
#     No reliable way to know if another session ended or crashed.
#   - clear/compact: Clear THIS session's tracking (agent loses context, must re-recall).
#     Don't touch other sessions. PreCompact also clears on compact
#     (belt-and-suspenders for reliability).
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

  if [ "$SOURCE" = "clear" ] || [ "$SOURCE" = "compact" ]; then
    # Clear/compact: THIS session's agent loses context — clear only THIS session's tracking.
    # Other concurrent sessions keep their tracking intact.
    source "$SCRIPT_DIR/clear-tracking.sh"
    clear_session_tracking "$CACHE_DIR" "$SID"
  fi
  # start/resume: don't clean anything (fresh or continuing).
fi

# Inject preferences + guidelines as session context (all sources)
INJECTED=$(node "$SCRIPT_DIR/session-inject.js" "$PROJECT_ROOT" 2>/dev/null)
if [ -n "$INJECTED" ]; then
  echo "$INJECTED"
fi

exit 0
