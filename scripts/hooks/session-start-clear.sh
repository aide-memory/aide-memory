#!/bin/bash
# SessionStart hook — clear recalled-paths tracking on new session.
# Fires when Claude Code starts, resumes, or clears a session.
# Ensures new sessions force aide_recall on first file read.

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# Clear recalled paths — new session means new context
rm -f "$PROJECT_ROOT/.aide/cache/recalled-paths.txt" 2>/dev/null

exit 0
