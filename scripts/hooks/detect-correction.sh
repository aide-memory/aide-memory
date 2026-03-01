#!/bin/bash
# UserPromptSubmit hook — detect correction patterns in user messages.
# When a user corrects the agent, inject context telling it to store the
# correction via aide_remember so it persists across sessions.

INPUT=$(cat)
USER_MESSAGE=$(echo "$INPUT" | jq -r '.prompt // empty')

# Exit early if no message
if [ -z "$USER_MESSAGE" ]; then
  exit 0
fi

# Pattern match for corrections — common phrases when users fix agent behavior
if echo "$USER_MESSAGE" | grep -qiE "(no[, ]+(don.t|do not|use|instead|that.s wrong)|actually[, ]|wrong[, ]|not like that|I prefer|always use|never use|stop using|I told you|I said|use .+ instead|don.t use)"; then
  cat <<'HOOK_OUTPUT'
{
  "hookSpecificOutput": {
    "hookEventName": "UserPromptSubmit",
    "additionalContext": "The user appears to be correcting you. After addressing their feedback, call aide_remember to store this correction so it persists across sessions. Use layer 'preferences' for style/approach preferences, or 'technical' for factual corrections about the codebase."
  }
}
HOOK_OUTPUT
fi

exit 0
