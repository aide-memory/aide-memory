#!/bin/bash
# PreToolUse hook — track when aide_recall is called.
# Fires before mcp__aide-memory__aide_recall tool.
# Writes recalled paths to session-scoped tracking file so the
# Read/Edit hooks know not to block again for these paths.
#
# Entry format: file|{path} for file paths, dir|{path} for directories.

INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // empty')
# aide_recall's paths parameter is an array
PATHS=$(echo "$INPUT" | jq -r '.tool_input.paths // [] | .[]' 2>/dev/null)

if [ -z "$PATHS" ]; then
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
CWD=$(echo "$INPUT" | jq -r '.cwd // empty')
PROJECT_ROOT="${CWD:-$(cd "$SCRIPT_DIR/../.." && pwd)}"
CACHE_DIR="$PROJECT_ROOT/.aide/cache"
mkdir -p "$CACHE_DIR" 2>/dev/null

# Use session_id for isolation, fall back to "default" if unavailable
SID="${SESSION_ID:-default}"
RECALLED_FILE="$CACHE_DIR/recalled-paths-${SID}.txt"

# Write each path to the session-scoped tracking file (resolved to absolute)
# Use file| prefix for file paths, dir| prefix for directory paths
while IFS= read -r p; do
  # Resolve to absolute path
  if [[ "$p" = /* ]]; then
    abs_path="$p"
  else
    abs_path="$PROJECT_ROOT/$p"
  fi

  # Determine if path is a directory:
  #   - ends with /
  #   - ends with /** or /*  (literal glob suffix)
  #   - is an existing directory on disk
  is_dir=false
  if [[ "$abs_path" == */ ]]; then
    is_dir=true
  elif [[ "$abs_path" =~ /\*\*$ ]] || [[ "$abs_path" =~ /\*$ ]]; then
    is_dir=true
  elif [ -d "$abs_path" ]; then
    is_dir=true
  fi

  if [ "$is_dir" = "true" ]; then
    # Strip trailing /** or /* for clean dir path
    clean_dir="${abs_path%/\*\*}"
    clean_dir="${clean_dir%/\*}"
    # Ensure trailing slash
    [[ "$clean_dir" != */ ]] && clean_dir="${clean_dir}/"
    echo "dir|${clean_dir}" >> "$RECALLED_FILE"
  else
    echo "file|${abs_path}" >> "$RECALLED_FILE"
  fi
done <<< "$PATHS"

exit 0
