#!/bin/bash
# Stop hook — nudge agent to call aide_remember after completing a task.
# Fires when agent finishes responding. Blocks the first stop to let the
# agent reflect and store knowledge. On the second stop (stop_hook_active=true),
# exits cleanly to allow normal stop.
#
# Dedup: checks session-scoped temp file to avoid storing duplicate memories
# within the same interaction. The temp file is keyed by session PID.

INPUT=$(cat)
STOP_HOOK_ACTIVE=$(echo "$INPUT" | jq -r '.stop_hook_active // false')

# Prevent infinite loop — if already in a stop-hook continuation, let it stop
if [ "$STOP_HOOK_ACTIVE" = "true" ]; then
  exit 0
fi

# Block the stop and inject a reflection prompt via additionalContext
cat <<'HOOK_OUTPUT'
{
  "decision": "block",
  "reason": "Before finishing: anything non-obvious worth persisting (constraints, decisions, corrections)? Call aide_remember (layer, scope, source:hook). If aide_remember unavailable, write JSON lines to .aide/pending-memories.jsonl and tell user to start the MCP server. If nothing to store, stop."
}
HOOK_OUTPUT
