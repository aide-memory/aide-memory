#!/bin/bash
# PreCompact hook — prompt agent to extract key context before compaction.
# Fires before both manual /compact and auto-compact.
# Input includes: session_id, transcript_path, trigger (manual|auto)
#
# This is a high-value hook — context loss from compaction is a major
# pain point (350+ GitHub comments document this). We prompt the agent
# to save anything worth persisting before context is lost.
#
# Blocks compaction until agent saves key context.

# Output blocking prompt
cat <<'HOOK_OUTPUT'
{
  "decision": "block",
  "reason": "Context compacting. Save key decisions/constraints via aide_remember (source: hook) before they are lost. If aide_remember unavailable, write JSON lines to .aide/pending-memories.jsonl and tell user to start the MCP server. If nothing to store, stop."
}
HOOK_OUTPUT

exit 0
