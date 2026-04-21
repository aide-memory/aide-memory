#!/bin/bash
# Shared config reader. Two layers:
# 1. defaults.json (private, ships with package) — always used unless overridden
# 2. .aide/config.json (user overrides, only honored when setting is public)
#
# The `pro` field on each default is reserved for future gating but is NOT
# enforced in Phase 1 — every setting is free. `public: false` still forces
# the default (used for settings that aren't ready for user tuning yet).
#
# IMPORTANT: `.aide/config.json` uses nested JSON (e.g.
# {"hooks":{"correction":{"enabled":false}}}) but defaults.json keys are
# flat dot-paths (e.g. "hooks.correction.enabled"). The reader splits the
# flat key on '.' and walks the nested user config via jq's getpath.
#
# Sourcing this file ALSO triggers a best-effort drift-repair for derived
# artifacts (currently `.ignore`): if `.aide/config.json`'s mtime differs
# from the cached value in `.aide/cache/config-mtime.txt`, spawn a
# background resync. This is the mid-session sync path — sessions running
# when the config file is edited directly pick up the change on their
# next hook fire without needing a restart.
#
# Usage: source "$SCRIPT_DIR/read-config.sh"
#        MAX_BLOCKS=$(get_setting "hooks.read.maxBlocks")

# --- Derived-artifact drift check (config.json mtime → background resync) ---
# Runs at source-time. Cheap: stat + file read + compare. Only triggers the
# node-based resync when mtime actually changed. Backgrounded so hook
# execution is never blocked.
_aide_drift_check() {
  local config_file="$PROJECT_ROOT/.aide/config.json"
  local mtime_cache="$PROJECT_ROOT/.aide/cache/config-mtime.txt"
  [ -f "$config_file" ] || return 0

  local cur_mtime
  cur_mtime=$(stat -f "%m" "$config_file" 2>/dev/null || stat -c "%Y" "$config_file" 2>/dev/null)
  [ -z "$cur_mtime" ] && return 0

  local cached_mtime
  cached_mtime=$(cat "$mtime_cache" 2>/dev/null || echo "")

  if [ "$cur_mtime" != "$cached_mtime" ]; then
    # Package root = two levels up from this script (scripts/hooks/).
    local pkg_root
    pkg_root=$(cd "$SCRIPT_DIR/../.." 2>/dev/null && pwd)
    if [ -n "$pkg_root" ] && [ -f "$pkg_root/dist/memory/init.js" ]; then
      # Background, non-blocking. Silently swallows errors — the worst case
      # is the user runs `aide-memory config` or restarts, which already
      # resync cleanly.
      mkdir -p "$(dirname "$mtime_cache")" 2>/dev/null
      (node -e "require('$pkg_root/dist/memory/init').resyncDerivedArtifacts('$PROJECT_ROOT')" >/dev/null 2>&1 &) 2>/dev/null
      echo "$cur_mtime" > "$mtime_cache" 2>/dev/null
    fi
  fi
}
# PROJECT_ROOT and SCRIPT_DIR are set by the sourcing hook script — safe
# to reference here because sourcing is synchronous.
_aide_drift_check

# Emit the user-override for $1 from .aide/config.json as JSON (`null` when
# absent). Uses path-existence via `getpath(...) // null` + a `paths()` check
# so we distinguish "missing" from "explicitly set to false/null/0".
#
# Returns:
#   "__MISSING__"  when the key is not present in the user config
#   a JSON value   (`true`, `false`, `null`, `3`, `"soft"`, `[...]`, `{...}`)
_user_override_json() {
  local user_config="$1"
  local key="$2"
  [ -f "$user_config" ] || { echo __MISSING__; return; }

  # Use a jq output that round-trips through bash string compare:
  # - Missing key → the raw sentinel "__MISSING__" (printed via -r)
  # - Present key → compact JSON (via @json so each value gets one line)
  # Running with -r makes the sentinel unquoted; present values still come
  # through as JSON scalars ("soft", 3, true, [...]).
  jq -r --arg k "$key" '
    ($k | split(".")) as $path
    | if any(paths; . == $path) then (getpath($path) | @json) else "__MISSING__" end
  ' "$user_config" 2>/dev/null || echo __MISSING__
}

get_setting() {
  local key="$1"
  local defaults_file="$SCRIPT_DIR/defaults.json"
  local user_config="$PROJECT_ROOT/.aide/config.json"

  # Get default entry
  local entry=$(jq -r ".\"$key\" // empty" "$defaults_file" 2>/dev/null)
  if [ -z "$entry" ]; then
    echo ""
    return
  fi

  local default_val=$(echo "$entry" | jq -r '.value')
  local is_public=$(echo "$entry" | jq -r '.public')

  # Private setting → always use default (ignore user override)
  if [ "$is_public" != "true" ]; then
    echo "$default_val"
    return
  fi

  # Public setting → check for user override using nested lookup
  local override=$(_user_override_json "$user_config" "$key")
  if [ "$override" = "__MISSING__" ]; then
    echo "$default_val"
    return
  fi

  # Strip quotes from JSON string (so "soft" → soft) for bash consumption.
  # Non-string scalars (numbers, bools) come through as-is.
  echo "$override" | jq -r '.' 2>/dev/null || echo "$default_val"
}

# Helper for JSON array/object values — returns compact JSON for jq piping.
get_setting_json() {
  local key="$1"
  local defaults_file="$SCRIPT_DIR/defaults.json"
  local user_config="$PROJECT_ROOT/.aide/config.json"

  local entry=$(jq -c ".\"$key\" // empty" "$defaults_file" 2>/dev/null)
  if [ -z "$entry" ] || [ "$entry" = "" ]; then
    echo "{}"
    return
  fi

  local default_val=$(echo "$entry" | jq -c '.value')
  local is_public=$(echo "$entry" | jq -r '.public')

  if [ "$is_public" != "true" ]; then
    echo "$default_val"
    return
  fi

  local override=$(_user_override_json "$user_config" "$key")
  if [ "$override" = "__MISSING__" ]; then
    echo "$default_val"
    return
  fi

  echo "$override"
}
