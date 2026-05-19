#!/usr/bin/env bash
# Smoke test: 0.5.17 soft+visible hook defaults — drive each hook event with
# stdin-piped JSON in a default-config project and assert the correct output
# shape per the spec (PHASE_1_HOOK_DEFAULTS_0_5_17.md §6.2).
#
# Verifies that an EXISTING USER who upgrades to 0.5.17 with no config edits
# automatically gets the new defaults (no flag write on correction, soft
# additionalContext on Stop, silent on resume).
#
# Run:
#   bash scripts/hooks/__tests__/hooks-soft-default.smoke.test.sh
#
# Exits 0 on full pass, 1 on any FAIL.

set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
CLI="$ROOT/dist/cli/aide-memory.js"

if [ ! -f "$CLI" ]; then
  echo "ERROR: $CLI missing — run 'npm run build' first." >&2
  exit 2
fi

PASS=0
FAIL=0
FAILURES=()

record_pass() { PASS=$((PASS + 1)); echo "  PASS: $1"; }
record_fail() {
  FAIL=$((FAIL + 1))
  echo "  FAIL: $1"
  echo "    detail: $2"
  FAILURES+=("$1: $2")
}

new_project() {
  local dir
  dir=$(mktemp -d -t aide-soft-default-XXXX)
  (cd "$dir" && git init -q && git config user.name "Test" && git config user.email "t@t.com")
  (cd "$dir" && node "$CLI" init) >/dev/null 2>&1
  echo "$dir"
}

fire_hook() {
  local script="$1"
  local payload="$2"
  echo "$payload" | bash "$ROOT/scripts/hooks/$script.sh" 2>/dev/null
}

echo "──────────────────────────────────────────"
echo "0.5.17 soft+visible default smoke"
echo "──────────────────────────────────────────"

# ── 1. Correction → soft additionalContext + chrome, no flag ─────────────
project=$(new_project)
sid="soft-correction"
out=$(fire_hook detect-correction "{\"session_id\":\"$sid\",\"cwd\":\"$project\",\"prompt\":\"no, dont use that approach use the new API instead\"}")
flag_path="$project/.aide/cache/correction-pending-$sid.txt"

if [ -n "$out" ] \
   && echo "$out" | grep -q '"hookEventName": "UserPromptSubmit"' \
   && echo "$out" | grep -q 'correction or convention' \
   && echo "$out" | grep -q '"systemMessage"' \
   && ! echo "$out" | grep -q '"decision"' \
   && [ ! -f "$flag_path" ]; then
  record_pass "default correction: soft + chrome, no flag"
else
  record_fail "default correction: soft + chrome, no flag" \
    "out='${out:0:120}' flag_exists=$([ -f "$flag_path" ] && echo true || echo false)"
fi
rm -rf "$project"

# ── 2. Scheduled Stop → decision:block + chrome (no hookSpecificOutput) ──
# Default mode is 'block' because Claude Code doesn't accept
# hookSpecificOutput.additionalContext on Stop (see claude-code-protocol.ts).
project=$(new_project)
sid="soft-stop"
# Override schedule to fire every turn so we don't have to drive count to 3.
(cd "$project" && node "$CLI" config hooks.stop.schedule '[{"every":1}]') >/dev/null 2>&1

out=$(fire_hook stop-remember "{\"session_id\":\"$sid\",\"cwd\":\"$project\",\"stop_hook_active\":false}")

if [ -n "$out" ] \
   && echo "$out" | grep -q '"decision".*"block"' \
   && echo "$out" | grep -q 'worth persisting' \
   && echo "$out" | grep -q '"systemMessage"' \
   && ! echo "$out" | grep -q '"hookSpecificOutput"'; then
  record_pass "default Stop scheduled fire: decision:block + chrome (no hookSpecificOutput)"
else
  record_fail "default Stop scheduled fire: decision:block + chrome (no hookSpecificOutput)" \
    "out='${out:0:200}'"
fi
rm -rf "$project"

# ── 3. Stop with stale correction-pending flag (escalate=off): silent clear ─
project=$(new_project)
sid="stale-flag"
mkdir -p "$project/.aide/cache"
echo "correction" > "$project/.aide/cache/correction-pending-$sid.txt"
# off-schedule turn (count=0 → turn 1, not in schedule by default)
out=$(fire_hook stop-remember "{\"session_id\":\"$sid\",\"cwd\":\"$project\",\"stop_hook_active\":false}")
flag_path="$project/.aide/cache/correction-pending-$sid.txt"

if [ -z "$out" ] && [ ! -f "$flag_path" ]; then
  record_pass "stale correction flag (escalate=off): silent clear"
else
  record_fail "stale correction flag (escalate=off): silent clear" \
    "out='${out:0:120}' flag_exists=$([ -f "$flag_path" ] && echo true || echo false)"
fi
rm -rf "$project"

# ── 4. SessionStart source=resume: silent + tracking preserved ──────────
project=$(new_project)
sid="session-resume"
mkdir -p "$project/.aide/cache"
echo "file|/tmp/example.ts" > "$project/.aide/cache/recalled-paths-$sid.txt"
echo "ids|1,2,3" >> "$project/.aide/cache/recalled-paths-$sid.txt"

out=$(fire_hook session-start-clear "{\"session_id\":\"$sid\",\"cwd\":\"$project\",\"source\":\"resume\"}")
tracking_path="$project/.aide/cache/recalled-paths-$sid.txt"

if [ -z "$out" ] && [ -f "$tracking_path" ] && grep -q "file|/tmp/example.ts" "$tracking_path"; then
  record_pass "SessionStart source=resume: silent + tracking preserved"
else
  record_fail "SessionStart source=resume: silent + tracking preserved" \
    "out='${out:0:120}' tracking_exists=$([ -f "$tracking_path" ] && echo true || echo false)"
fi
rm -rf "$project"

# ── 5. SessionStart source=clear: tracking cleared ──────────────────────
project=$(new_project)
sid="session-clear"
mkdir -p "$project/.aide/cache"
echo "file|/tmp/example.ts" > "$project/.aide/cache/recalled-paths-$sid.txt"

fire_hook session-start-clear "{\"session_id\":\"$sid\",\"cwd\":\"$project\",\"source\":\"clear\"}" >/dev/null
tracking_path="$project/.aide/cache/recalled-paths-$sid.txt"

if [ ! -f "$tracking_path" ]; then
  record_pass "SessionStart source=clear: tracking cleared"
else
  record_fail "SessionStart source=clear: tracking cleared" \
    "tracking still exists at $tracking_path"
fi
rm -rf "$project"

# ── 6. Correction META_PATTERN: meta-references skip ───────────────────
project=$(new_project)
sid="meta-skip"
out=$(fire_hook detect-correction "{\"session_id\":\"$sid\",\"cwd\":\"$project\",\"prompt\":\"the correction prompt has been firing too often during the session\"}")

if [ -z "$out" ]; then
  record_pass "META_PATTERN skip: correction-discussing prompt is silent"
else
  record_fail "META_PATTERN skip: correction-discussing prompt is silent" \
    "out='${out:0:120}'"
fi
rm -rf "$project"

echo
echo "──────────────────────────────────────────"
printf "Passed: %d   Failed: %d\n" "$PASS" "$FAIL"
echo "──────────────────────────────────────────"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
