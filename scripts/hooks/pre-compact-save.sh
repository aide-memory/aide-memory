#!/bin/bash
# PreCompact hook — prompt agent to extract key context before compaction.
# Fires before both manual /compact and auto-compact.
# Input includes: session_id, transcript_path, trigger (manual|auto)
#
# This is a high-value hook — context loss from compaction is a major
# pain point (350+ GitHub comments document this). We prompt the agent
# to save anything worth persisting before context is lost.
#
# Never blocks compaction — observability only, prompt to save.

# Output extraction prompt via additionalContext (hidden from terminal)
cat <<'HOOK_OUTPUT'
{
  "hookSpecificOutput": {
    "hookEventName": "PreCompact",
    "additionalContext": "Context compacting. Save key decisions/constraints via aide_remember (source: hook) before they are lost. If aide_remember unavailable, write JSON lines to .aide/pending-memories.jsonl and tell user to start the MCP server."
  }
}
HOOK_OUTPUT

exit 0
