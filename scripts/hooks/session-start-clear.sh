#!/bin/bash
# SessionStart hook — manage session tracking + inject session context.
# Fires when Claude Code starts, resumes, clears, or compacts a session.
#
# Cleanup rules:
#   - start/resume: DON'T touch anything. Other sessions might be concurrent.
#     No reliable way to know if another session ended or crashed.
#   - clear/compact: Clear THIS session's tracking (agent loses context, must re-recall).
#     Don't touch other sessions. For compact, PreCompact also clears in Phase 2
#     but this is belt-and-suspenders for reliability.
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
    # For compact: PreCompact also clears in Phase 2, but this is belt-and-suspenders.
    rm -f "$CACHE_DIR/recalled-paths-${SID}.txt" 2>/dev/null
    rm -f "$CACHE_DIR/searched-queries-${SID}.txt" 2>/dev/null
    rm -f "$CACHE_DIR/correction-pending-${SID}.txt" 2>/dev/null
    rm -f "$CACHE_DIR/compact-pending-${SID}.txt" 2>/dev/null
  fi
  # start/resume: don't clean anything (fresh or continuing).
fi

# Inject preferences + guidelines as session context
INJECTED=$(node "$SCRIPT_DIR/session-inject.js" "$PROJECT_ROOT" 2>/dev/null)

# Post-compact: prompt agent to save key context from the compacted summary.
# After compaction, the agent has a fresh agentic turn with plenty of token room.
# The compacted summary retains key decisions — agent can extract and aide_remember them.
if [ "$SOURCE" = "compact" ]; then
  COMPACT_PROMPT="Context was just compacted. Review the summary above for any key decisions, technical constraints, preferences, or guidelines that should persist. Call aide_remember for anything important — this is your last chance before that context fades. If nothing worth storing, continue."
  if [ -n "$INJECTED" ]; then
    echo "${INJECTED}"$'\n\n'"${COMPACT_PROMPT}"
  else
    echo "$COMPACT_PROMPT"
  fi
else
  if [ -n "$INJECTED" ]; then
    echo "$INJECTED"
  fi
fi

exit 0
