#!/bin/bash
# PreToolUse hook — nudge agent that memories match a search query.
# Fires before Grep and Glob tool calls. Calls search-preview.js to
# check if aide memories match the search pattern.
#
# Blocking if aide_search has NOT been called for this query in this session.
# Soft nudge if already searched (tracked via session-scoped searched-queries file).

INPUT=$(cat)
TOOL_NAME=$(echo "$INPUT" | jq -r '.tool_name // empty')
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$(dirname "$0")/../.." && pwd)}"

# Extract search query from tool_input — both Grep and Glob use .pattern
QUERY=$(echo "$INPUT" | jq -r '.tool_input.pattern // empty')

# No query = nothing to search
if [ -z "$QUERY" ]; then
  exit 0
fi

# Get memory search results via direct store access
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/read-config.sh"

# Check search mode — "soft" (default), "off" (disabled), or "block".
SEARCH_MODE=$(get_setting "hooks.search.mode")
if [ "$SEARCH_MODE" = "off" ]; then
  exit 0
fi

RESULT=$(node "$SCRIPT_DIR/search-preview.js" "$QUERY" "$PROJECT_ROOT" 2>/dev/null)

# No result or zero count = nothing to nudge about
if [ -z "$RESULT" ] || [ "$RESULT" = "0" ]; then
  exit 0
fi

# Parse JSON result
COUNT=$(echo "$RESULT" | jq -r '.count // 0' 2>/dev/null)
if [ "$COUNT" = "0" ] || [ -z "$COUNT" ]; then
  exit 0
fi

# Build top matches preview string
TOP_MATCHES=$(echo "$RESULT" | jq -r '.topMatches | join(", ")' 2>/dev/null)

# Session-scoped tracking
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
SID="${SESSION_ID:-default}"
SEARCHED_FILE="$PROJECT_ROOT/.aide/cache/searched-queries-${SID}.txt"

# Normalize query for dedup (lowercase, trimmed)
NORMALIZED_QUERY=$(echo "$QUERY" | tr '[:upper:]' '[:lower:]' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

# Check if this query was already searched in this session
ALREADY_SEARCHED=false
if [ -f "$SEARCHED_FILE" ]; then
  if grep -qFx "$NORMALIZED_QUERY" "$SEARCHED_FILE" 2>/dev/null; then
    ALREADY_SEARCHED=true
  fi
fi

# NOTE: Do NOT write to tracking file here. Tracking is written by
# track-search.sh (PostToolUse:aide_search) so grep keeps blocking
# until aide_search is actually called. Same pattern as read hooks.

if [ "$ALREADY_SEARCHED" = "true" ]; then
  # Already searched in this session — soft nudge only
  NUDGE="${COUNT} aide memories match '${QUERY}' (${TOP_MATCHES}). Call aide_search({keyword: '${QUERY}'})."
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
  exit 0
fi

# Not yet searched. Mode decides between soft (default) and block.
NUDGE="${COUNT} aide memories match '${QUERY}' (${TOP_MATCHES}). Call aide_search({keyword: '${QUERY}'}) if not already in context."

if [ "$SEARCH_MODE" = "block" ]; then
  echo "$NUDGE" | jq -Rs '{
    decision: "block",
    reason: .
  }'
else
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
fi

exit 0
