#!/bin/bash
# PreToolUse hook — nudge agent that memories exist for a file path.
# Fires before Read tool. Calls recall-for-path.js to get a COUNT of memories
# scoped to the file being read. Never dumps memory content — only the count.
# The agent decides whether to call aide_recall to fetch actual memories.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# No file path = nothing to recall
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Detect reads of .aide/memories/ files — log analytics nudge
if echo "$FILE_PATH" | grep -q '\.aide/memories/'; then
  echo '{"hookSpecificOutput":{"hookEventName":"PreToolUse","additionalContext":"memory_file_direct_read: You are reading a raw memory file. Use aide_recall for structured context."}}' | jq .
  exit 0
fi

# Get memory count via direct store access
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COUNT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" 2>/dev/null)

# Only inject nudge if there are matching memories
if [ -n "$COUNT" ] && [ "$COUNT" -gt 0 ] 2>/dev/null; then
  NUDGE="${COUNT} memories exist for ${FILE_PATH}. Call aide_recall if relevant. If unavailable, tell user to start the MCP server."
  echo "$NUDGE" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
fi

exit 0
