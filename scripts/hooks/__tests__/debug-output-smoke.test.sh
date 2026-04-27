#!/usr/bin/env bash
# debug-output-smoke.test.sh — verifies the AIDE_DEBUG / [AIDE_ERROR]
# diagnostic surface (src/memory/internal/debug.ts + binding-loader.ts +
# instrumentation in hooks/index.ts, server.ts, recall.ts).
#
# Quick-look proof for the diagnostic system:
#   - AIDE_DEBUG=hooks   produces [AIDE_DEBUG/hooks] lines on hook dispatch
#   - AIDE_DEBUG=binding produces [AIDE_DEBUG/binding] lines on store init
#   - AIDE_DEBUG=recall  produces [AIDE_DEBUG/recall] lines on recall calls
#   - AIDE_DEBUG=all     fires every category
#   - default (unset)    produces NO debug lines (opt-in only)
#   - loudError() lines  always emit, no env required
#
# Not part of vitest surface because it spawns the built CLI as a subprocess.
# Uses a minimal fixture (no `init` call) so it's robust to any template-path
# wrinkles in the bundled CLI — we're testing the diagnostic surface, not
# initialization.
#
#   bash scripts/hooks/__tests__/debug-output-smoke.test.sh
#
# Exit 0 on success, non-zero on first failure.

set -e

CLI="${AIDE_CLI:-$(cd "$(dirname "$0")/../../.." && pwd)/dist/cli/aide-memory.js}"
FIXTURE="$(mktemp -d -t aide-debug-smoke.XXXXXX)"
trap 'rm -rf "$FIXTURE"' EXIT

if [ ! -f "$CLI" ]; then
  echo "ERROR: CLI not built: $CLI"
  echo "Run: npm run build && npm run build:dist"
  exit 1
fi

echo "────────────────────────────────────────"
echo "AIDE_DEBUG / [AIDE_ERROR] surface smoke"
echo "  CLI:     $CLI"
echo "  Fixture: $FIXTURE"
echo "  Node:    $(node --version) (ABI $(node -e 'console.log(process.versions.modules)'))"
echo "────────────────────────────────────────"

cd "$FIXTURE"
mkdir -p src/api
echo "// stub" > src/api/routes.ts

# Minimal seed: create .aide/ + one memory so the recall CLI happy-path works
# without needing a full `aide-memory init` (which has template-path
# requirements unrelated to what we're testing here). `aide-memory remember`
# auto-creates .aide/ via the file-per-memory store.
mkdir -p .aide
node "$CLI" remember "smoke fixture memory for diagnostic surface verification" \
  --layer technical --scope 'src/api/**' > /dev/null 2>&1

pass=0; fail=0
check() {
  local desc="$1"; local cond="$2"; local detail="$3"
  if eval "$cond"; then
    printf '  PASS  %s\n' "$desc"
    pass=$((pass+1))
  else
    printf '  FAIL  %s — %s\n' "$desc" "$detail"
    fail=$((fail+1))
  fi
}

# Construct a fake preEdit input we can pipe to `aide-memory hook ...`.
hook_input='{"session_id":"smoke","cwd":"'"$FIXTURE"'","tool_input":{"file_path":"'"$FIXTURE"'/src/api/routes.ts"},"hook_event_name":"PreToolUse","tool_name":"Edit"}'

# ---------------------------------------------------------------------------
# 1. Default (no env): NO debug lines on a clean recall call.
# ---------------------------------------------------------------------------
echo
echo "[1] default (AIDE_DEBUG unset) — quiet by design"

unset AIDE_DEBUG
unset AIDE_DEBUG_HOOK
out=$(node "$CLI" recall src/api/routes.ts 2>&1 1>/dev/null || true)
check "recall produces no [AIDE_DEBUG/...] lines" \
  '! echo "$out" | grep -q "\[AIDE_DEBUG/"' \
  "got: $out"
check "recall produces no [AIDE_ERROR] lines on happy path" \
  '! echo "$out" | grep -q "\[AIDE_ERROR\]"' \
  "got: $out"

# ---------------------------------------------------------------------------
# 2. AIDE_DEBUG=recall — recall path emits, others stay silent.
# ---------------------------------------------------------------------------
echo
echo "[2] AIDE_DEBUG=recall — only recall category emits"

out=$(AIDE_DEBUG=recall node "$CLI" recall src/api/routes.ts 2>&1 1>/dev/null || true)
check "stderr contains [AIDE_DEBUG/recall] enter" \
  'echo "$out" | grep -q "\[AIDE_DEBUG/recall\] enter"' \
  "got: $out"
check "stderr contains [AIDE_DEBUG/recall] exit with duration" \
  'echo "$out" | grep -qE "\[AIDE_DEBUG/recall\] exit.*duration=[0-9]"' \
  "got: $out"
check "stderr does NOT contain [AIDE_DEBUG/binding] (not enabled)" \
  '! echo "$out" | grep -q "\[AIDE_DEBUG/binding\]"' \
  "got: $out"

# ---------------------------------------------------------------------------
# 3. AIDE_DEBUG=binding — binding load message fires when store opens.
# ---------------------------------------------------------------------------
echo
echo "[3] AIDE_DEBUG=binding — binding load is observable"

out=$(AIDE_DEBUG=binding node "$CLI" recall src/api/routes.ts 2>&1 1>/dev/null || true)
check "stderr contains [AIDE_DEBUG/binding] loaded lib=libsql" \
  'echo "$out" | grep -q "\[AIDE_DEBUG/binding\] loaded lib=libsql"' \
  "got: $out"
check "binding log includes node + abi + platform" \
  'echo "$out" | grep -qE "\[AIDE_DEBUG/binding\] loaded.*node=.*abi=.*platform="' \
  "got: $out"

# ---------------------------------------------------------------------------
# 4. AIDE_DEBUG=hooks via direct hook dispatch + AIDE_DEBUG_HOOK=1 back-compat.
# ---------------------------------------------------------------------------
echo
echo "[4] AIDE_DEBUG=hooks via direct hook dispatch"

out=$(echo "$hook_input" | AIDE_DEBUG=hooks node "$CLI" hook pre-edit 2>&1 1>/dev/null || true)
check "hooks dispatch emits [AIDE_DEBUG/hooks] enter" \
  'echo "$out" | grep -q "\[AIDE_DEBUG/hooks\] enter hook=pre-edit"' \
  "got: $out"
check "hooks dispatch emits [AIDE_DEBUG/hooks] exit with duration" \
  'echo "$out" | grep -qE "\[AIDE_DEBUG/hooks\] exit.*duration=[0-9]"' \
  "got: $out"

out=$(echo "$hook_input" | AIDE_DEBUG_HOOK=1 node "$CLI" hook pre-edit 2>&1 1>/dev/null || true)
check "AIDE_DEBUG_HOOK=1 (legacy) still enables hooks category" \
  'echo "$out" | grep -q "\[AIDE_DEBUG/hooks\] enter hook=pre-edit"' \
  "got: $out"

# ---------------------------------------------------------------------------
# 5. AIDE_DEBUG=all — multiple categories fire on a single recall.
# ---------------------------------------------------------------------------
echo
echo "[5] AIDE_DEBUG=all — every applicable category emits"

out=$(AIDE_DEBUG=all node "$CLI" recall src/api/routes.ts 2>&1 1>/dev/null || true)
check "stderr contains [AIDE_DEBUG/binding]" \
  'echo "$out" | grep -q "\[AIDE_DEBUG/binding\]"' \
  "got: $out"
check "stderr contains [AIDE_DEBUG/recall]" \
  'echo "$out" | grep -q "\[AIDE_DEBUG/recall\]"' \
  "got: $out"

# ---------------------------------------------------------------------------
# 6. [AIDE_ERROR] always-on path — induce unknown hook event name.
# ---------------------------------------------------------------------------
echo
echo "[6] loudError fires on unknown hook event (no env required)"

unset AIDE_DEBUG
unset AIDE_DEBUG_HOOK
out=$(echo "$hook_input" | node "$CLI" hook this-event-does-not-exist 2>&1 1>/dev/null || true)
check 'stderr contains [AIDE_ERROR] aide-memory hook: unknown event' \
  'echo "$out" | grep -q "\[AIDE_ERROR\] aide-memory hook: unknown event"' \
  "got: $out"
check "loudError includes actionable hint about settings.json/hooks.json" \
  'echo "$out" | grep -q "settings.json or .cursor/hooks.json"' \
  "got: $out"

# ---------------------------------------------------------------------------
# 7. Loud-error format: single line per failure (no multi-line stack dumps).
# ---------------------------------------------------------------------------
echo
echo "[7] [AIDE_ERROR] format is a single line"

err_lines=$(echo "$hook_input" | node "$CLI" hook bogus 2>&1 1>/dev/null | grep -c "\[AIDE_ERROR\]" || true)
check "exactly one [AIDE_ERROR] line for one failure" \
  '[ "$err_lines" = "1" ]' \
  "got $err_lines lines"

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo
echo "────────────────────────────────────────"
echo "  PASS: $pass"
echo "  FAIL: $fail"
echo "────────────────────────────────────────"

if [ "$fail" -gt 0 ]; then
  exit 1
fi
exit 0
