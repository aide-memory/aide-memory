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
    "additionalContext": "Context is about to be compacted. Extract any key decisions, plans, or constraints worth persisting via aide_remember before they are lost. Use source: \"hook\" to tag these as hook-captured.\n\nIf aide_remember is not available (MCP server not running), append the memories as JSON lines to .aide/pending-memories.jsonl (fields: layer, what, why, scope, tags, source, timestamp) and tell the user: \"aide-memory MCP server is not running. Saved to .aide/pending-memories.jsonl — run aide-memory serve then aide-memory import --pending to store them.\""
  }
}
HOOK_OUTPUT

exit 0
