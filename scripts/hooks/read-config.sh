#!/bin/bash
# Shared config reader. Three layers:
# 1. defaults.json (private, ships with package)
# 2. .aide/config.json (user overrides, only for public settings)
# 3. Pro gate (pro-only settings ignored unless pro=true)
#
# Usage: source "$SCRIPT_DIR/read-config.sh"
#        MAX_BLOCKS=$(get_setting "hooks.read.maxBlocks")

get_setting() {
  local key="$1"
  local defaults_file="$SCRIPT_DIR/defaults.json"
  local user_config="$PROJECT_ROOT/.aide/config.json"

  # Get default value + metadata
  local entry=$(jq -r ".\"$key\" // empty" "$defaults_file" 2>/dev/null)
  if [ -z "$entry" ]; then
    echo ""
    return
  fi

  local default_val=$(echo "$entry" | jq -r '.value')
  local is_public=$(echo "$entry" | jq -r '.public')
  local is_pro=$(echo "$entry" | jq -r '.pro')

  # Private setting → always use default
  if [ "$is_public" != "true" ]; then
    echo "$default_val"
    return
  fi

  # Public setting → check user override
  if [ ! -f "$user_config" ]; then
    echo "$default_val"
    return
  fi

  local user_val=$(jq -r ".\"$key\" // empty" "$user_config" 2>/dev/null)
  if [ -z "$user_val" ]; then
    echo "$default_val"
    return
  fi

  # Pro-gated → check pro flag
  if [ "$is_pro" = "true" ]; then
    local pro=$(jq -r '.pro // false' "$user_config" 2>/dev/null)
    if [ "$pro" != "true" ]; then
      echo "$default_val"
      return
    fi
  fi

  echo "$user_val"
}

# Helper for JSON array/object values
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
  local is_pro=$(echo "$entry" | jq -r '.pro')

  if [ "$is_public" != "true" ]; then
    echo "$default_val"
    return
  fi

  if [ ! -f "$user_config" ]; then
    echo "$default_val"
    return
  fi

  local user_val=$(jq -c ".\"$key\" // empty" "$user_config" 2>/dev/null)
  if [ -z "$user_val" ] || [ "$user_val" = "" ]; then
    echo "$default_val"
    return
  fi

  if [ "$is_pro" = "true" ]; then
    local pro=$(jq -r '.pro // false' "$user_config" 2>/dev/null)
    if [ "$pro" != "true" ]; then
      echo "$default_val"
      return
    fi
  fi

  echo "$user_val"
}
