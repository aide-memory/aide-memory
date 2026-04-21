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
# Usage: source "$SCRIPT_DIR/read-config.sh"
#        MAX_BLOCKS=$(get_setting "hooks.read.maxBlocks")

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
