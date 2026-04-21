#!/bin/bash
# Bash unit tests for detect-correction.sh
#
# Pipes JSON payloads into the hook via stdin and asserts that the stdout
# either contains the expected nudge (correction/decision/preference) or is
# empty (skipped). Non-zero exit if any case fails.
#
# Run directly:
#   bash scripts/hooks/__tests__/detect-correction.test.sh
#
# Exit codes:
#   0 -- all cases passed
#   1 -- at least one case failed

set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOK="$SCRIPT_DIR/../detect-correction.sh"

if [ ! -x "$HOOK" ] && [ ! -f "$HOOK" ]; then
  echo "FATAL: hook not found at $HOOK" >&2
  exit 2
fi

PASS=0
FAIL=0
FAILURES=()

# run_hook <prompt> — pipes {"prompt": "..."} into the hook, echoes stdout
run_hook() {
  local prompt="$1"
  # Use jq to safely encode the prompt as JSON (handles apostrophes, quotes)
  local payload
  payload=$(jq -nc --arg p "$prompt" '{prompt: $p}')
  echo "$payload" | bash "$HOOK" 2>/dev/null
}

# assert_contains <label> <prompt> <expected_substring>
# Expected substring options:
#   "correction" -- expects nudge with "preferences or technical"
#   "decision"   -- expects nudge with "area_context or technical"
#   "preference" -- expects nudge with "preferences, source"
#   "skip"       -- expects empty stdout
assert_case() {
  local label="$1"
  local prompt="$2"
  local expect="$3"

  local out
  out=$(run_hook "$prompt")

  local ok=0
  case "$expect" in
    correction)
      if echo "$out" | grep -q "preferences or technical"; then ok=1; fi
      ;;
    decision)
      if echo "$out" | grep -q "area_context or technical"; then ok=1; fi
      ;;
    preference)
      # Preference branch says "layer: preferences, source"
      if echo "$out" | grep -q "layer: preferences, source"; then ok=1; fi
      ;;
    skip)
      if [ -z "$out" ]; then ok=1; fi
      ;;
    *)
      echo "UNKNOWN EXPECTATION: $expect" >&2
      return 2
      ;;
  esac

  if [ "$ok" = "1" ]; then
    PASS=$((PASS + 1))
    echo "  PASS: $label"
  else
    FAIL=$((FAIL + 1))
    FAILURES+=("$label | prompt=\"$prompt\" | expected=$expect | got=${out:-<empty>}")
    echo "  FAIL: $label"
    echo "    prompt:   $prompt"
    echo "    expected: $expect"
    echo "    got:      ${out:-<empty>}"
  fi
}

echo "Running detect-correction.sh unit tests..."
echo

echo "Corrections (should nudge → preferences/technical):"
assert_case "apostrophized correction with 'spaces over tabs'" \
  "no, use spaces instead of tabs" "correction"
assert_case "non-apostrophized 'dont' (the gap)" \
  "no, dont use tabs" "correction"
assert_case "actually-style correction" \
  "actually we use camelCase" "correction"
assert_case "non-apostrophized 'cant'" \
  "no, cant do that" "correction"
assert_case "apostrophized 'can\\'t'" \
  "no, can't do that" "correction"

echo
echo "Decisions (should nudge → area_context/technical):"
assert_case "non-apostrophized 'lets go with'" \
  "lets go with option B" "decision"

echo
echo "Preferences (should nudge → preferences):"
assert_case "I prefer" \
  "I prefer spaces over tabs" "preference"

echo
echo "False-positive filters (should skip):"
assert_case "'no I mean' filter" \
  "no I mean something else" "skip"
assert_case "single-word / too short" \
  "ok" "skip"

echo
echo "─────────────────────────────────────"
echo "Passed: $PASS"
echo "Failed: $FAIL"

if [ "$FAIL" -gt 0 ]; then
  echo
  echo "Failures:"
  for f in "${FAILURES[@]}"; do
    echo "  - $f"
  done
  exit 1
fi

exit 0
