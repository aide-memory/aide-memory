#!/bin/bash
# Shared function to clear all session tracking files.
# Source this from hooks that need full cleanup (PreCompact, SessionStart).
# Usage: source "$SCRIPT_DIR/clear-tracking.sh" && clear_session_tracking "$CACHE_DIR" "$SID"

clear_session_tracking() {
  local cache_dir="$1"
  local sid="$2"
  rm -f "$cache_dir/recalled-paths-${sid}.txt" 2>/dev/null
  rm -f "$cache_dir/searched-queries-${sid}.txt" 2>/dev/null
  rm -f "$cache_dir/correction-pending-${sid}.txt" 2>/dev/null
  rm -f "$cache_dir/compact-pending-${sid}.txt" 2>/dev/null
}
