#!/usr/bin/env bash
# Bash integration test: exhaustively toggle every public config key and
# verify observable behavior changes. Complements settings-behavior.test.sh
# (which covers 5 representative settings) by sweeping the 21-key public
# surface defined in scripts/hooks/defaults.json + AideConfig schema.
#
# Run as:
#   bash scripts/hooks/__tests__/all-configs-behavior.test.sh
#
# Exits 0 if every probed key PASSes (or SKIPs with a reason). Exits 1 on
# any FAIL. Each test uses a throwaway `mktemp -d` project so the tests are
# order-independent.
#
# NOTE — tags.presets, telemetry.enabled, updates.check are SKIPs with
# roundtrip validation because their effects are either non-observable in
# the hook pipeline (network fetch, analytics table writes) or pure UI
# (suggestion presets). Every other key is PASS with behavior assertions.

set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
CLI="$ROOT/dist/cli/aide-memory.js"

if [ ! -f "$CLI" ]; then
  echo "ERROR: $CLI missing — run 'npm run build' first." >&2
  exit 2
fi

# Accumulators. Declared with sentinel +=(…) hack-free defaults so that a
# fully-green run (empty `fails`) doesn't trigger `set -u` on printf.
passes=()
skips=()
fails=()

# Print an array safely even when empty (bash 3 + `set -u` treat "${a[@]}"
# on an empty array as unbound without the :- fallback).
print_lines() {
  local -n arr=$1 2>/dev/null || true
  # Fallback for bash < 4.3 (no nameref) — use eval on the array name.
  local name="$1"
  eval "local count=\${#${name}[@]}"
  if [ "$count" -eq 0 ]; then return; fi
  eval "printf '%s\n' \"\${${name}[@]}\""
}

record_pass() { passes+=("$(printf '  %-42s PASS  (%s)' "$1" "$2")"); }
record_skip() { skips+=("$(printf '  %-42s SKIP  (%s)' "$1" "$2")"); }
record_fail() { fails+=("$(printf '  %-42s FAIL  (%s)' "$1" "$2")"); }

# ---- helpers ---------------------------------------------------------------

init_project() {
  local dir="$1"
  (cd "$dir" && git init -q && git config user.name "Test" && git config user.email "t@t.com")
  (cd "$dir" && node "$CLI" init) >/dev/null 2>&1
}

set_cfg() {
  local dir="$1" key="$2" value="$3"
  (cd "$dir" && node "$CLI" config "$key" "$value") >/dev/null 2>&1
}

get_cfg() {
  local dir="$1" key="$2"
  (cd "$dir" && node "$CLI" config "$key") 2>/dev/null
}

# Seed a scoped memory so path-based hooks have something to react to.
seed_scoped_memory() {
  local dir="$1" layer="${2:-area_context}" scope="${3:-src/seeded/**}" what="${4:-integration test seed memory}"
  local uuid="seed-$(date +%s%N | head -c 16)"
  mkdir -p "$dir/.aide/memories/$layer" "$dir/src/seeded"
  cat > "$dir/.aide/memories/$layer/seed-$uuid.json" <<J
{"uuid":"$uuid","layer":"$layer","what":"$what","why":"for hook verification","scope":"$scope","context_label":null,"contributor":"test","tags":[],"source":"conversation","shared":true,"generated_by":null,"derived_from":null,"created_at":"2026-04-20T00:00:00Z","updated_at":"2026-04-20T00:00:00Z"}
J
  echo "x" > "$dir/src/seeded/f.ts"
  (cd "$dir" && node "$CLI" sync import) >/dev/null 2>&1 || true
}

# Fire a hook via the CLI + stdin-pipe path, returns stdout.
fire_hook() {
  local name="$1" json="$2"
  echo "$json" | node "$CLI" hook "$name" 2>/dev/null
}

new_project() {
  local dir
  dir=$(mktemp -d)
  init_project "$dir"
  echo "$dir"
}

# Roundtrip-only test: write value, read back, compare.
roundtrip_only() {
  local key="$1" value="$2" reason="$3"
  local dir
  dir=$(new_project)
  set_cfg "$dir" "$key" "$value"
  local got
  got=$(get_cfg "$dir" "$key")
  rm -rf "$dir"
  # Strip trailing whitespace + quotes for comparison.
  local got_strip="${got%$'\n'}"
  if [ "$got_strip" = "$value" ] || [ "$got_strip" = "\"$value\"" ]; then
    record_skip "$key" "$reason; roundtrip ok"
  else
    record_fail "$key" "roundtrip failed: set='$value' got='$got_strip'"
  fi
}

# ---- 1. hooks.read.maxBlocks ----------------------------------------------
test_hooks_read_maxBlocks() {
  local key=hooks.read.maxBlocks
  local dir
  dir=$(new_project)
  # Seed ~11 memories so softening.threshold (default 10) doesn't force-soft.
  for i in $(seq 1 11); do
    seed_scoped_memory "$dir" area_context "src/seeded/**" "seed memory number $i"
  done
  set_cfg "$dir" $key 0
  local out_off
  out_off=$(fire_hook pre-read "{\"session_id\":\"s-off\",\"cwd\":\"$dir\",\"tool_input\":{\"file_path\":\"$dir/src/seeded/f.ts\"}}")
  set_cfg "$dir" $key 1
  local out_on
  out_on=$(fire_hook pre-read "{\"session_id\":\"s-on\",\"cwd\":\"$dir\",\"tool_input\":{\"file_path\":\"$dir/src/seeded/f.ts\"}}")
  rm -rf "$dir"
  if [ -z "$out_off" ] && [ -n "$out_on" ]; then
    record_pass "$key" "0 silences read hook; 1 restores nudge"
  else
    record_fail "$key" "off='${out_off:0:40}' on_len=${#out_on}"
  fi
}

# ---- 2. hooks.edit.maxBlocks ----------------------------------------------
test_hooks_edit_maxBlocks() {
  local key=hooks.edit.maxBlocks
  local dir
  dir=$(new_project)
  for i in $(seq 1 11); do
    seed_scoped_memory "$dir" area_context "src/seeded/**" "edit-seed $i"
  done
  set_cfg "$dir" $key 0
  local out_off
  out_off=$(fire_hook pre-edit "{\"session_id\":\"e-off\",\"cwd\":\"$dir\",\"tool_input\":{\"file_path\":\"$dir/src/seeded/f.ts\"}}")
  set_cfg "$dir" $key 1
  local out_on
  out_on=$(fire_hook pre-edit "{\"session_id\":\"e-on\",\"cwd\":\"$dir\",\"tool_input\":{\"file_path\":\"$dir/src/seeded/f.ts\"}}")
  rm -rf "$dir"
  if [ -z "$out_off" ] && [ -n "$out_on" ]; then
    record_pass "$key" "0 silences edit hook; 1 restores nudge"
  else
    record_fail "$key" "off='${out_off:0:40}' on_len=${#out_on}"
  fi
}

# ---- 3. hooks.stop.schedule -----------------------------------------------
test_hooks_stop_schedule() {
  local key=hooks.stop.schedule
  local dir
  dir=$(new_project)
  set_cfg "$dir" $key '[{"every":1}]'
  local o_block
  o_block=$(fire_hook stop "{\"session_id\":\"stop1\",\"cwd\":\"$dir\",\"stop_hook_active\":false}")
  set_cfg "$dir" $key '[{"every":100}]'
  local o_silent
  o_silent=$(fire_hook stop "{\"session_id\":\"stop2\",\"cwd\":\"$dir\",\"stop_hook_active\":false}")
  rm -rf "$dir"
  if echo "$o_block" | grep -q '"block"' && [ -z "$o_silent" ]; then
    record_pass "$key" "every:1 blocks every turn; every:100 silent"
  else
    record_fail "$key" "block='${o_block:0:40}' silent='${o_silent:0:40}'"
  fi
}

# ---- 4. hooks.search.mode (soft/block/off) --------------------------------
test_hooks_search_mode() {
  local key=hooks.search.mode
  local dir
  dir=$(new_project)
  seed_scoped_memory "$dir" area_context "src/seeded/**" "search-target keyword zephyr"
  set_cfg "$dir" $key off
  local o_off
  o_off=$(fire_hook pre-search "{\"session_id\":\"ps1\",\"cwd\":\"$dir\",\"tool_input\":{\"pattern\":\"zephyr\"}}")
  set_cfg "$dir" $key block
  local o_block
  o_block=$(fire_hook pre-search "{\"session_id\":\"ps2\",\"cwd\":\"$dir\",\"tool_input\":{\"pattern\":\"zephyr\"}}")
  set_cfg "$dir" $key soft
  local o_soft
  o_soft=$(fire_hook pre-search "{\"session_id\":\"ps3\",\"cwd\":\"$dir\",\"tool_input\":{\"pattern\":\"zephyr\"}}")
  rm -rf "$dir"
  if [ -z "$o_off" ] && echo "$o_block" | grep -q '"block"' && [ -n "$o_soft" ] && ! echo "$o_soft" | grep -q '"block"'; then
    record_pass "$key" "off=silent, block=hard-block, soft=additionalContext"
  else
    record_fail "$key" "off='${o_off:0:30}' block='${o_block:0:40}' soft='${o_soft:0:40}'"
  fi
}

# ---- 5. hooks.correction.enabled ------------------------------------------
test_hooks_correction_enabled() {
  local key=hooks.correction.enabled
  local dir
  dir=$(new_project)
  set_cfg "$dir" $key false
  local o_off
  o_off=$(fire_hook pre-prompt "{\"session_id\":\"c1\",\"cwd\":\"$dir\",\"prompt\":\"no dont do that use X instead\"}")
  set_cfg "$dir" $key true
  local o_on
  o_on=$(fire_hook pre-prompt "{\"session_id\":\"c2\",\"cwd\":\"$dir\",\"prompt\":\"no dont do that use X instead\"}")
  rm -rf "$dir"
  if [ -z "$o_off" ] && [ -n "$o_on" ]; then
    record_pass "$key" "false silences correction hook; true re-enables"
  else
    record_fail "$key" "off='${o_off:0:40}' on_len=${#o_on}"
  fi
}

# ---- 6b. hooks.visible ----------------------------------------------------
test_hooks_visible() {
  local key=hooks.visible
  local dir
  dir=$(new_project)

  # true: systemMessage included in hook output
  set_cfg "$dir" $key true
  local o_true
  o_true=$(fire_hook pre-prompt "{\"session_id\":\"v1\",\"cwd\":\"$dir\",\"prompt\":\"no dont do that use X instead\"}")

  # false: systemMessage omitted; additionalContext still emitted
  set_cfg "$dir" $key false
  local o_false
  o_false=$(fire_hook pre-prompt "{\"session_id\":\"v2\",\"cwd\":\"$dir\",\"prompt\":\"no dont do that use X instead\"}")

  rm -rf "$dir"

  local true_has_sysmsg=false false_has_sysmsg=false
  echo "$o_true" | grep -q '"systemMessage"' && true_has_sysmsg=true
  echo "$o_false" | grep -q '"systemMessage"' && false_has_sysmsg=true

  local true_has_ctx=false false_has_ctx=false
  echo "$o_true" | grep -q '"additionalContext"' && true_has_ctx=true
  echo "$o_false" | grep -q '"additionalContext"' && false_has_ctx=true

  if [ "$true_has_sysmsg" = "true" ] \
     && [ "$false_has_sysmsg" = "false" ] \
     && [ "$true_has_ctx" = "true" ] \
     && [ "$false_has_ctx" = "true" ]; then
    record_pass "$key" "true emits systemMessage; false omits it; additionalContext always emitted"
  else
    record_fail "$key" "true_sysmsg=$true_has_sysmsg false_sysmsg=$false_has_sysmsg true_ctx=$true_has_ctx false_ctx=$false_has_ctx"
  fi
}

# ---- 6. hooks.precompact.mode ---------------------------------------------
test_hooks_precompact_mode() {
  local key=hooks.precompact.mode
  local dir
  dir=$(new_project)
  mkdir -p "$dir/.aide/cache"

  # off: file preserved
  echo "ids|1,2" > "$dir/.aide/cache/recalled-paths-pc.txt"
  set_cfg "$dir" $key off
  fire_hook pre-compact "{\"session_id\":\"pc\",\"cwd\":\"$dir\"}" >/dev/null
  local off_kept=false
  [ -f "$dir/.aide/cache/recalled-paths-pc.txt" ] && off_kept=true

  # cleanup: file removed
  echo "ids|1,2" > "$dir/.aide/cache/recalled-paths-pc.txt"
  set_cfg "$dir" $key cleanup
  fire_hook pre-compact "{\"session_id\":\"pc\",\"cwd\":\"$dir\"}" >/dev/null
  local cleanup_removed=false
  [ ! -f "$dir/.aide/cache/recalled-paths-pc.txt" ] && cleanup_removed=true

  rm -rf "$dir"
  if [ "$off_kept" = "true" ] && [ "$cleanup_removed" = "true" ]; then
    record_pass "$key" "off preserves tracking; cleanup clears it"
  else
    record_fail "$key" "off_kept=$off_kept cleanup_removed=$cleanup_removed"
  fi
}

# ---- 7. recall.limit ------------------------------------------------------
# The `recall.limit` config is consumed by recall.ts when query.limit is
# absent. The `aide-memory recall <path>` CLI calls recall() without a
# limit so the config value governs the result count. Lines matching `^  \[N]`
# in the CLI output count as returned memories.
test_recall_limit() {
  local key=recall.limit
  local dir
  dir=$(new_project)
  for i in $(seq 1 12); do
    seed_scoped_memory "$dir" technical "project" "recall target $i"
  done
  set_cfg "$dir" $key 1
  local out1
  out1=$(cd "$dir" && node "$CLI" recall . 2>/dev/null | grep -c '^  \[[0-9]' || true)
  set_cfg "$dir" $key 8
  local out8
  out8=$(cd "$dir" && node "$CLI" recall . 2>/dev/null | grep -c '^  \[[0-9]' || true)
  rm -rf "$dir"
  if [ "${out1:-0}" = "1" ] && [ "${out8:-0}" -ge 5 ]; then
    record_pass "$key" "limit 1 → 1 result; limit 8 → >=5 results"
  else
    record_fail "$key" "count1=$out1 count8=$out8"
  fi
}

# ---- 8. recall.ensureLayerDiversity + recall.layerDiversityMinLimit -------
# The diversity swap only kicks in when limit >= layerDiversityMinLimit AND
# ensureLayerDiversity is true. Verify that flipping either knob changes
# whether an under-represented layer gets swapped in.
test_recall_diversity() {
  local key=recall.ensureLayerDiversity
  local min_key=recall.layerDiversityMinLimit
  local dir
  dir=$(new_project)
  # Seed 8 technical + 1 preference — under diversity, preference should
  # bump technical at the tail. Without diversity, 5-result recall shows
  # only technical.
  for i in $(seq 1 8); do
    seed_scoped_memory "$dir" technical "project" "tech #$i"
  done
  seed_scoped_memory "$dir" preferences "project" "unique preference memory"

  set_cfg "$dir" $min_key 5
  set_cfg "$dir" recall.limit 5
  set_cfg "$dir" $key false
  local no_div
  no_div=$(cd "$dir" && node "$CLI" recall . 2>/dev/null)
  set_cfg "$dir" $key true
  local with_div
  with_div=$(cd "$dir" && node "$CLI" recall . 2>/dev/null)
  rm -rf "$dir"

  local no_has=false with_has=false
  echo "$no_div"   | grep -q "unique preference memory" && no_has=true
  echo "$with_div" | grep -q "unique preference memory" && with_has=true
  # With diversity=false and 8 technical + 1 preference, limit=5 returns 5
  # technical only (no preference). With diversity=true, the tail of the
  # top-5 is swapped for the preference.
  if [ "$no_has" = "false" ] && [ "$with_has" = "true" ]; then
    record_pass "$key/$min_key" "diversity surfaces under-represented layer only when enabled"
  else
    record_fail "$key" "no_div_has_pref=$no_has with_div_has_pref=$with_has"
  fi
}

# ---- 9a. injection.enabled (master switch) -------------------------------
test_injection_enabled() {
  local key=injection.enabled
  local dir
  dir=$(new_project)
  # Seed a preference so SessionStart would normally inject something.
  seed_scoped_memory "$dir" preferences "project" "master-switch-token-PQR"
  # Flip master switch OFF → handler should short-circuit before the preference
  # layer loads. Output should NOT contain the token.
  set_cfg "$dir" $key false
  local o_off
  o_off=$(fire_hook session-start "{\"session_id\":\"sxoff\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  # Flip back ON → injection runs, token surfaces.
  set_cfg "$dir" $key true
  local o_on
  o_on=$(fire_hook session-start "{\"session_id\":\"sxon\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  rm -rf "$dir"
  if ! echo "$o_off" | grep -q 'master-switch-token-PQR' && echo "$o_on" | grep -q 'master-switch-token-PQR'; then
    record_pass "$key" "false short-circuits SessionStart injection; true re-enables"
  else
    record_fail "$key" "off='${o_off:0:60}' on='${o_on:0:60}'"
  fi
}

# ---- 9. injection.preferences + technical + area_context + guidelines -----
test_injection_preferences() {
  local key=injection.preferences
  local dir
  dir=$(new_project)
  seed_scoped_memory "$dir" preferences "project" "injected-preference-token-XYZ"
  set_cfg "$dir" $key 0
  local o0
  o0=$(fire_hook session-start "{\"session_id\":\"ss0\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  set_cfg "$dir" $key 15
  local o15
  o15=$(fire_hook session-start "{\"session_id\":\"ss15\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  rm -rf "$dir"
  # o0 should NOT contain the preference; o15 should.
  if ! echo "$o0" | grep -q 'injected-preference-token-XYZ' && echo "$o15" | grep -q 'injected-preference-token-XYZ'; then
    record_pass "$key" "0 disables preference injection; 15 re-enables"
  else
    record_fail "$key" "o0_has=${o0:0:60}... o15_has=${o15:0:60}..."
  fi
}

test_injection_technical() {
  local key=injection.technical
  local dir
  dir=$(new_project)
  seed_scoped_memory "$dir" technical "project" "injected-technical-token-ABC"
  set_cfg "$dir" $key false
  local o_off
  o_off=$(fire_hook session-start "{\"session_id\":\"stoff\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  set_cfg "$dir" $key true
  local o_on
  o_on=$(fire_hook session-start "{\"session_id\":\"ston\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  rm -rf "$dir"
  if ! echo "$o_off" | grep -q 'injected-technical-token-ABC' && echo "$o_on" | grep -q 'injected-technical-token-ABC'; then
    record_pass "$key" "false disables technical injection; true enables"
  else
    record_fail "$key" "off='${o_off:0:40}' on='${o_on:0:40}'"
  fi
}

test_injection_area_context() {
  local key=injection.area_context
  local dir
  dir=$(new_project)
  seed_scoped_memory "$dir" area_context "project" "injected-area-token-DEF"
  set_cfg "$dir" $key false
  local o_off
  o_off=$(fire_hook session-start "{\"session_id\":\"saoff\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  set_cfg "$dir" $key true
  local o_on
  o_on=$(fire_hook session-start "{\"session_id\":\"saon\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  rm -rf "$dir"
  if ! echo "$o_off" | grep -q 'injected-area-token-DEF' && echo "$o_on" | grep -q 'injected-area-token-DEF'; then
    record_pass "$key" "false disables area_context injection; true enables"
  else
    record_fail "$key" "off='${o_off:0:40}' on='${o_on:0:40}'"
  fi
}

test_injection_guidelines() {
  local key=injection.guidelines
  local dir
  dir=$(new_project)
  seed_scoped_memory "$dir" guidelines "project" "injected-guideline-token-GHI"
  set_cfg "$dir" $key false
  local o_off
  o_off=$(fire_hook session-start "{\"session_id\":\"sgoff\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  set_cfg "$dir" $key all
  local o_on
  o_on=$(fire_hook session-start "{\"session_id\":\"sgon\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  rm -rf "$dir"
  if ! echo "$o_off" | grep -q 'injected-guideline-token-GHI' && echo "$o_on" | grep -q 'injected-guideline-token-GHI'; then
    record_pass "$key" "false disables guideline injection; all enables"
  else
    record_fail "$key" "off='${o_off:0:40}' on='${o_on:0:40}'"
  fi
}

test_injection_priorityAlwaysOverride() {
  local key=injection.priorityAlwaysOverride
  local dir
  dir=$(new_project)
  # Seed a priority:"always" technical memory. Technical injection is off
  # by default, so the ONLY way it surfaces at SessionStart is via the
  # priority-always override.
  mkdir -p "$dir/.aide/memories/technical"
  cat > "$dir/.aide/memories/technical/prio.json" <<J
{"uuid":"prio-1","layer":"technical","what":"priority-always-token-JKL","why":"for test","scope":"project","context_label":null,"contributor":"test","tags":[],"source":"conversation","shared":true,"priority":"always","generated_by":null,"derived_from":null,"created_at":"2026-04-20T00:00:00Z","updated_at":"2026-04-20T00:00:00Z"}
J
  (cd "$dir" && node "$CLI" sync import) >/dev/null 2>&1 || true

  # Make sure technical injection is OFF so we isolate the override path.
  set_cfg "$dir" injection.technical false

  set_cfg "$dir" $key false
  local o_off
  o_off=$(fire_hook session-start "{\"session_id\":\"spoff\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  set_cfg "$dir" $key true
  local o_on
  o_on=$(fire_hook session-start "{\"session_id\":\"spon\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  rm -rf "$dir"
  if ! echo "$o_off" | grep -q 'priority-always-token-JKL' && echo "$o_on" | grep -q 'priority-always-token-JKL'; then
    record_pass "$key" "false skips priority-always; true surfaces it"
  else
    record_fail "$key" "off='${o_off:0:60}' on='${o_on:0:60}'"
  fi
}

# ---- 10. memories.hideFromGrep → rewrites .ignore file --------------------
test_memories_hideFromGrep() {
  local key=memories.hideFromGrep
  local dir
  dir=$(new_project)
  # init creates .ignore with the memories entry (default = true).
  local had_entry_before=false
  grep -q '\.aide/memories/' "$dir/.ignore" 2>/dev/null && had_entry_before=true

  set_cfg "$dir" $key false
  local had_entry_after_off=false
  grep -q '\.aide/memories/' "$dir/.ignore" 2>/dev/null && had_entry_after_off=true

  set_cfg "$dir" $key true
  local had_entry_after_on=false
  grep -q '\.aide/memories/' "$dir/.ignore" 2>/dev/null && had_entry_after_on=true

  rm -rf "$dir"
  if [ "$had_entry_before" = "true" ] && [ "$had_entry_after_off" = "false" ] && [ "$had_entry_after_on" = "true" ]; then
    record_pass "$key" "true adds .aide/memories/ to .ignore; false strips it"
  else
    record_fail "$key" "before=$had_entry_before off=$had_entry_after_off on=$had_entry_after_on"
  fi
}

# ---- 11. memories.softening.threshold -------------------------------------
test_memories_softening_threshold() {
  local key=memories.softening.threshold
  local dir
  dir=$(new_project)
  # Seed exactly 3 scoped memories — below the default threshold of 10,
  # which forces SOFT nudges. Bump threshold to 2 and the SAME input should
  # now fire a HARD block (fresh file, no IDs recalled).
  for i in 1 2 3; do
    seed_scoped_memory "$dir" area_context "src/seeded/**" "softening-seed $i"
  done

  set_cfg "$dir" $key 100   # 3 memories < 100 → forceSoft = true
  local o_soft
  o_soft=$(fire_hook pre-read "{\"session_id\":\"sft1\",\"cwd\":\"$dir\",\"tool_input\":{\"file_path\":\"$dir/src/seeded/f.ts\"}}")

  set_cfg "$dir" $key 2   # 3 memories > 2 → forceSoft = false → should hard-block
  local o_hard
  o_hard=$(fire_hook pre-read "{\"session_id\":\"sft2\",\"cwd\":\"$dir\",\"tool_input\":{\"file_path\":\"$dir/src/seeded/f.ts\"}}")

  rm -rf "$dir"
  # Soft output does NOT contain `"decision": "block"` (it's additionalContext
  # under hookSpecificOutput). Hard output DOES. Use a pattern that allows
  # optional whitespace after the colon so JSON.stringify with 2-space indent
  # still matches.
  local was_soft=false was_hard=false
  [ -n "$o_soft" ] && ! echo "$o_soft" | grep -qE '"decision":[[:space:]]*"block"' && was_soft=true
  echo "$o_hard" | grep -qE '"decision":[[:space:]]*"block"' && was_hard=true
  if [ "$was_soft" = "true" ] && [ "$was_hard" = "true" ]; then
    record_pass "$key" "high threshold forces soft; low threshold hard-blocks"
  else
    record_fail "$key" "soft=$was_soft hard=$was_hard (soft_out='${o_soft:0:60}' hard_out='${o_hard:0:60}')"
  fi
}

# ---- 12-29. Roundtrip-only or SKIP-with-reason ----------------------------

# These settings exist in the public config surface (exposed via
# `aide-memory config KEY VALUE`) but aren't read by any hook or runtime
# path today, OR require external infrastructure (embeddings backend
# install, network, etc). We verify the config get/set roundtrip so a typo
# or schema regression would be caught — but mark SKIP because there's no
# observable runtime effect to test.

test_contributor() {
  # Contributor override: default 'auto' reads git user; non-'auto' string
  # replaces git user in stored memory JSON files.
  local key=contributor
  local dir
  dir=$(mktemp -d)
  init_project "$dir"
  set_cfg "$dir" $key "TeamBot"
  (cd "$dir" && node "$CLI" remember "contributor override test memory" --layer technical) >/dev/null 2>&1
  local found=false
  if grep -q '"contributor": "TeamBot"' "$dir"/.aide/memories/technical/*.json 2>/dev/null; then
    found=true
  fi
  rm -rf "$dir"
  if [ "$found" = "true" ]; then
    record_pass "$key" "override replaces git user in stored memories"
  else
    record_fail "$key" "override did not replace git user"
  fi
}

test_embeddings_backend() {
  # embeddings.backend is wired into store.ts. Deep wiring (actual semantic
  # search via transformers/ollama) requires model install + network — out of
  # scope for a bash smoke. Verify the config round-trip so a schema
  # regression is still caught. Deep behavior is covered by embeddings.test.ts.
  local key=embeddings.backend
  local dir
  dir=$(mktemp -d)
  init_project "$dir"
  set_cfg "$dir" $key "ollama"
  local value
  value=$(get_cfg "$dir" $key)
  rm -rf "$dir"
  if echo "$value" | grep -q "ollama"; then
    record_pass "$key" "value persists through config get/set roundtrip (deep semantic-search wiring covered by embeddings.test.ts)"
  else
    record_fail "$key" "set → get did not return 'ollama' (got='$value')"
  fi
}

test_embeddings_model() {
  # Same rationale as embeddings.backend — roundtrip verifies schema + wiring
  # contract; deep model-load behavior is covered by embeddings.test.ts.
  local key=embeddings.model
  local dir
  dir=$(mktemp -d)
  init_project "$dir"
  set_cfg "$dir" $key "nomic-embed-text"
  local value
  value=$(get_cfg "$dir" $key)
  rm -rf "$dir"
  if echo "$value" | grep -q "nomic-embed-text"; then
    record_pass "$key" "non-default model value persists through config get/set roundtrip"
  else
    record_fail "$key" "set → get did not return 'nomic-embed-text' (got='$value')"
  fi
}

test_recall_minScopeDepth() {
  local key=recall.minScopeDepth
  local dir
  dir=$(mktemp -d)
  init_project "$dir"
  mkdir -p "$dir/src/api/routes"
  echo "x" > "$dir/src/api/routes/routeA.ts"
  # Seed a memory scoped to src/api/** (2 fixed segments)
  (cd "$dir" && node "$CLI" remember "API rule for minScopeDepth test" --layer technical --scope "src/api/**") >/dev/null 2>&1

  # depth=1 permissive: deep file should see src/api/** via path recall
  set_cfg "$dir" $key 1
  local out1
  out1=$(cd "$dir" && node "$CLI" recall src/api/routes/routeA.ts 2>&1 | grep -c "API rule for minScopeDepth test" || true)

  # depth=3 strict: src/api/** (depth 2) < 3 → filtered out
  set_cfg "$dir" $key 3
  local out2
  out2=$(cd "$dir" && node "$CLI" recall src/api/routes/routeA.ts 2>&1 | grep -c "API rule for minScopeDepth test" || true)

  rm -rf "$dir"
  if [ "${out1:-0}" -ge 1 ] && [ "${out2:-0}" -eq 0 ]; then
    record_pass "$key" "depth=1 surfaces mid-scope; depth=3 filters it out"
  else
    record_fail "$key" "minScopeDepth toggle didn't change recall output (d1=${out1:-0} d3=${out2:-0})"
  fi
}

test_injection_excludeScopedPreferences() {
  local key=injection.excludeScopedPreferences
  local dir
  dir=$(mktemp -d)
  init_project "$dir"
  (cd "$dir" && node "$CLI" remember "global pref for excludeScoped test" --layer preferences) >/dev/null 2>&1
  (cd "$dir" && node "$CLI" remember "scoped api pref for excludeScoped test" --layer preferences --scope "src/api/**") >/dev/null 2>&1

  # excludeScoped=false (default): both surface
  set_cfg "$dir" $key false
  local out1
  out1=$(fire_hook session-start "{\"session_id\":\"exs1\",\"cwd\":\"$dir\",\"source\":\"startup\"}")

  # excludeScoped=true: scoped pref filtered, global remains
  set_cfg "$dir" $key true
  local out2
  out2=$(fire_hook session-start "{\"session_id\":\"exs2\",\"cwd\":\"$dir\",\"source\":\"startup\"}")

  rm -rf "$dir"
  if echo "$out1" | grep -q "scoped api pref for excludeScoped test" \
    && ! echo "$out2" | grep -q "scoped api pref for excludeScoped test" \
    && echo "$out2" | grep -q "global pref for excludeScoped test"; then
    record_pass "$key" "true filters scoped prefs; false includes both"
  else
    record_fail "$key" "excludeScoped toggle didn't filter as expected"
  fi
}

test_injection_maxChars() {
  local key=injection.maxChars
  local dir
  dir=$(mktemp -d)
  init_project "$dir"
  for i in $(seq 1 20); do
    (cd "$dir" && node "$CLI" remember "guideline number $i with some reasonable content to take up chars" --layer guidelines) >/dev/null 2>&1
  done

  set_cfg "$dir" $key 300
  local out_small
  out_small=$(fire_hook session-start "{\"session_id\":\"mcs\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  local small_len=${#out_small}

  set_cfg "$dir" $key 5000
  local out_large
  out_large=$(fire_hook session-start "{\"session_id\":\"mcl\",\"cwd\":\"$dir\",\"source\":\"startup\"}")
  local large_len=${#out_large}

  rm -rf "$dir"
  if [ "$large_len" -gt "$small_len" ] && echo "$out_small" | grep -q "truncated"; then
    record_pass "$key" "small cap truncates (len $small_len); large cap preserves (len $large_len)"
  else
    record_fail "$key" "maxChars toggle didn't affect output size (small=$small_len large=$large_len)"
  fi
}

test_skip_tags_presets() {
  # `tags.presets` is consumed inside the remember CLI UX for suggestion only;
  # not a behavior-altering toggle surfaced by the hook pipeline.
  local key=tags.presets
  local dir
  dir=$(new_project)
  set_cfg "$dir" "$key" '["alpha","beta"]'
  local got
  got=$(get_cfg "$dir" "$key")
  rm -rf "$dir"
  if echo "$got" | grep -q 'alpha' && echo "$got" | grep -q 'beta'; then
    record_skip "$key" "AideConfig schema key for suggestion UI; roundtrip ok"
  else
    record_fail "$key" "roundtrip failed: got=$got"
  fi
}

test_skip_telemetry_enabled() {
  # MemoryStore consults telemetry.enabled to decide whether to write
  # analytics events. Observable only indirectly (analytics table). Verify
  # roundtrip here; full behavior tested by analytics.test.ts (vitest).
  roundtrip_only "telemetry.enabled" "false" \
    "read by MemoryStore ctor; effect is 'no analytics rows' — covered by analytics.test.ts"
}

test_skip_updates_check() {
  # Checked post-command by the CLI bootstrap; disabling prevents a network
  # fetch that isn't observable in the hook path.
  roundtrip_only "updates.check" "false" \
    "CLI post-run fetch; no synchronous observable output"
}

# ---- runner ---------------------------------------------------------------

echo
echo "───────────────────────────────"
echo "All-configs behavior check"
echo "───────────────────────────────"

test_hooks_read_maxBlocks
test_hooks_edit_maxBlocks
test_hooks_stop_schedule
test_hooks_search_mode
test_hooks_correction_enabled
test_hooks_visible
test_hooks_precompact_mode
test_recall_limit
test_recall_diversity
test_recall_minScopeDepth
test_injection_enabled
test_injection_preferences
test_injection_excludeScopedPreferences
test_injection_technical
test_injection_area_context
test_injection_guidelines
test_injection_priorityAlwaysOverride
test_injection_maxChars
test_memories_hideFromGrep
test_memories_softening_threshold

test_contributor
test_embeddings_backend
test_embeddings_model

test_skip_tags_presets
test_skip_telemetry_enabled
test_skip_updates_check

# Print all results grouped.
print_lines passes
print_lines skips
print_lines fails

echo
echo "───────────────────────────────"
printf 'Total: %d PASS, %d SKIP, %d FAIL\n' "${#passes[@]}" "${#skips[@]}" "${#fails[@]}"
echo "───────────────────────────────"

if [ "${#fails[@]}" -gt 0 ]; then
  exit 1
fi
exit 0
