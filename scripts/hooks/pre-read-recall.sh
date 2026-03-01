#!/bin/bash
# PreToolUse hook — auto-inject aide_recall context before file reads.
# Fires before Read tool. Calls recall-for-path.js to get memories scoped
# to the file being read, then injects them as additionalContext.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')

# No file path = nothing to recall
if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Get recall context via direct store access
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RECALL_OUTPUT=$(node "$SCRIPT_DIR/recall-for-path.js" "$FILE_PATH" "$CWD" 2>/dev/null)

# Only inject if we got something back
if [ -n "$RECALL_OUTPUT" ]; then
  # Use jq to build valid JSON with proper escaping
  CONTEXT="aide-memory context for ${FILE_PATH}:
${RECALL_OUTPUT}"
  echo "$CONTEXT" | jq -Rs '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      additionalContext: .
    }
  }'
fi

exit 0
