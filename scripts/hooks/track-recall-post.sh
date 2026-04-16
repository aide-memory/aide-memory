#!/bin/bash
# PostToolUse hook — track memory IDs returned by aide_recall.
# Fires AFTER mcp__aide-memory__aide_recall returns results.
# Extracts memory IDs from the response and stores them in the
# session-scoped tracking file for deduplication.

#
# ID tracking format: ids|{id1},{id2},{id3},...

INPUT=$(cat)

SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
# tool_response is an array of {type, text} objects
RESPONSE=$(echo "$INPUT" | jq -r '.tool_response[]?.text // .tool_response // empty' 2>/dev/null)

if [ -z "$RESPONSE" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
CACHE_DIR="$PROJECT_ROOT/.aide/cache"
mkdir -p "$CACHE_DIR" 2>/dev/null

SID="${SESSION_ID:-default}"
RECALLED_FILE="$CACHE_DIR/recalled-paths-${SID}.txt"

# Extract memory IDs from the response text
# aide_recall output uses [N] patterns for memory IDs (e.g., [1], [42], [103])
NEW_IDS=$(echo "$RESPONSE" | grep -oE '\[([0-9]+)\]' | grep -oE '[0-9]+' | sort -un)

if [ -z "$NEW_IDS" ]; then
  exit 0
fi

# Read existing IDs from the tracking file (if any)
EXISTING_IDS=""
if [ -f "$RECALLED_FILE" ]; then
  # Find the ids| line and extract current IDs
  IDS_LINE=$(grep '^ids|' "$RECALLED_FILE" 2>/dev/null | head -1)
  if [ -n "$IDS_LINE" ]; then
    EXISTING_IDS="${IDS_LINE#ids|}"
  fi
fi

# Merge existing IDs with new IDs, deduplicate
ALL_IDS=""
if [ -n "$EXISTING_IDS" ]; then
  # Convert comma-separated to newline, merge with new, sort unique
  ALL_IDS=$(printf '%s\n%s' "$(echo "$EXISTING_IDS" | tr ',' '\n')" "$NEW_IDS" | sort -un | tr '\n' ',' | sed 's/,$//')
else
  ALL_IDS=$(echo "$NEW_IDS" | tr '\n' ',' | sed 's/,$//')
fi

# Update the tracking file: remove old ids| line, append new one
if [ -f "$RECALLED_FILE" ]; then
  # Remove existing ids| line(s) — use a temp file for portability
  TMPFILE=$(mktemp)
  grep -v '^ids|' "$RECALLED_FILE" > "$TMPFILE" 2>/dev/null
  mv "$TMPFILE" "$RECALLED_FILE"
fi

# Append merged IDs line
echo "ids|${ALL_IDS}" >> "$RECALLED_FILE"

exit 0
