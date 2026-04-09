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
  "reason": "Before finishing: Did you learn anything non-obvious during this task? Constraints, patterns, decisions, or corrections worth persisting? If so, try calling aide_remember with the appropriate layer (preferences, technical, area_context, or guidelines) and scope. Use source: \"hook\" to tag hook-captured memories.\n\nIf aide_remember is not available (MCP server not running), do TWO things:\n1. Append the memory content as a JSON line to .aide/pending-memories.jsonl (create if needed) with fields: layer, what, why, scope, tags, source, timestamp\n2. Tell the user: \"aide-memory MCP server is not running. I saved pending memories to .aide/pending-memories.jsonl — run `aide-memory serve` then `aide-memory import --pending` to store them.\"\n\nIf nothing worth storing, you may stop."
}
HOOK_OUTPUT
