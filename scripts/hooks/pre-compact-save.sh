#!/bin/bash
# PreCompact hook — cleanup only. Clears session tracking before compaction.
# Fires before both manual /compact and auto-compact.
#
# LIMITATION: PreCompact hooks cannot give the agent an agentic turn to make
# tool calls (confirmed — Claude Code architectural constraint). Neither exit 0
# nor exit 2 allows aide_remember calls before compaction.
#
# Save strategy relies on:
# - Stop hook: fires every turn, prompts aide_remember with full context
# - Proactive saving rule: agent saves throughout session per rules template
# - User guidance: "ask Claude to save before /compact" (in docs)
#
# PreCompact just clears session tracking so hooks re-block after compaction.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
SID="${SESSION_ID:-default}"

# Clear ALL session tracking — agent is about to lose context
source "$SCRIPT_DIR/clear-tracking.sh"
clear_session_tracking "$PROJECT_ROOT/.aide/cache" "$SID"

exit 0
