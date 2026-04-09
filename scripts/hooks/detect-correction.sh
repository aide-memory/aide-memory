#!/bin/bash
# UserPromptSubmit hook — detect corrections, decisions, and preferences
# in user messages. When detected, inject context telling the agent to store
# the information via aide_remember so it persists across sessions.
#
# Three detection categories:
#   1. Corrections → suggest layer: technical or preferences
#   2. Decisions   → suggest layer: area_context
#   3. Preferences → suggest layer: preferences

INPUT=$(cat)
USER_MESSAGE=$(echo "$INPUT" | jq -r '.prompt // empty')

# Exit early if no message
if [ -z "$USER_MESSAGE" ]; then
  exit 0
fi

# Shared fallback instruction (appended to all nudges)
FALLBACK="If aide_remember unavailable, write JSON lines to .aide/pending-memories.jsonl and tell user to start the MCP server."

# Pattern 1: Corrections — user is fixing agent behavior
if echo "$USER_MESSAGE" | grep -qiE "(no[, ]+(don.t|do not|use|instead|that.s wrong)|actually[, ]|wrong[, ]|not like that|use .+ instead|don.t use|stop using|I told you|I said)"; then
  cat <<HOOK_OUTPUT
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "User correction detected. Store via aide_remember (layer: preferences or technical, source: hook). ${FALLBACK}"
  }
}
HOOK_OUTPUT
  exit 0
fi

# Pattern 2: Decisions — user is making a choice or direction
if echo "$USER_MESSAGE" | grep -qiE "(let.s (use|go with)|we should|go with|the approach is|decided to|decision is|we.re going|from now on)"; then
  cat <<HOOK_OUTPUT
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "User decision detected. Store via aide_remember (layer: area_context or technical, source: hook). ${FALLBACK}"
  }
}
HOOK_OUTPUT
  exit 0
fi

# Pattern 3: Preferences — user is expressing style or approach preferences
if echo "$USER_MESSAGE" | grep -qiE "(I prefer|always use|never use|I like|my style is|I want you to|don.t ever|make sure to always|I always)"; then
  cat <<HOOK_OUTPUT
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "User preference detected. Store via aide_remember (layer: preferences, source: hook). ${FALLBACK}"
  }
}
HOOK_OUTPUT
  exit 0
fi

exit 0
