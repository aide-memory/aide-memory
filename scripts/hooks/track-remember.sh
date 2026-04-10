#!/bin/bash
# PostToolUse hook — track when aide_remember is called.
# Fires after mcp__aide-memory__aide_remember tool succeeds.
# Clears the correction-pending flag so the stop hook knows
# the correction was stored.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SID="${SESSION_ID:-default}"

# Delete the correction-pending flag file
rm -f "$PROJECT_ROOT/.aide/cache/correction-pending-${SID}.txt" 2>/dev/null

exit 0
