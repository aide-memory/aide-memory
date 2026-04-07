#!/bin/bash
# Post-checkout hook — auto-import new/changed memory files after git pull/checkout
#
# Installed by `aide-memory init` to .git/hooks/post-checkout
# Scans .aide/memories/ for JSON files and syncs them to SQLite cache.
# Exits 0 on any error — never blocks git operations.
# Performance target: < 500ms for 100 files.

set -e
trap 'exit 0' ERR

# Only run on branch checkout (flag=1), not file checkout (flag=0)
# $3 is the flag: 1 for branch checkout, 0 for file checkout
CHECKOUT_FLAG="${3:-1}"
if [ "$CHECKOUT_FLAG" = "0" ]; then
  exit 0
fi

MEMORIES_DIR=".aide/memories"

# Quick exit if no memories directory
if [ ! -d "$MEMORIES_DIR" ]; then
  exit 0
fi

# Count JSON files (excluding .tmp)
FILE_COUNT=$(find "$MEMORIES_DIR" -name '*.json' ! -name '*.tmp' 2>/dev/null | wc -l | tr -d ' ')

if [ "$FILE_COUNT" = "0" ]; then
  exit 0
fi

# Run the sync via node — uses MemorySync.syncFromGit()
# The script finds the aide-memory module relative to this hook's installed location,
# but also checks the project's node_modules.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"

# Try to find the sync runner
SYNC_SCRIPT=""
if [ -f "$PROJECT_ROOT/dist/memory/sync-runner.js" ]; then
  SYNC_SCRIPT="$PROJECT_ROOT/dist/memory/sync-runner.js"
elif [ -f "$PROJECT_ROOT/node_modules/aide-v0/dist/memory/sync-runner.js" ]; then
  SYNC_SCRIPT="$PROJECT_ROOT/node_modules/aide-v0/dist/memory/sync-runner.js"
fi

if [ -z "$SYNC_SCRIPT" ]; then
  # Sync module not available — skip silently
  exit 0
fi

# Run sync with timeout (500ms budget)
# Use node directly — fast startup, no npm overhead
node "$SYNC_SCRIPT" "$PROJECT_ROOT" 2>/dev/null &
SYNC_PID=$!

# Wait up to 2 seconds (generous limit; target is <500ms)
TIMEOUT=2
if command -v timeout &>/dev/null; then
  timeout "$TIMEOUT" wait "$SYNC_PID" 2>/dev/null || true
else
  # macOS doesn't have timeout by default
  ( sleep "$TIMEOUT"; kill "$SYNC_PID" 2>/dev/null ) &
  WATCHDOG_PID=$!
  wait "$SYNC_PID" 2>/dev/null || true
  kill "$WATCHDOG_PID" 2>/dev/null || true
fi

# Always exit 0 — never block git
exit 0
