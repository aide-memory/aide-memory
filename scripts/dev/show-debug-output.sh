#!/usr/bin/env bash
# show-debug-output.sh — developer-facing helper that fires each instrumented
# code path with AIDE_DEBUG enabled so you can eyeball the diagnostic output
# in seconds without standing up a real editor session.
#
# What it does:
#   1. Stands up a throwaway fixture in /tmp (cleaned on exit)
#   2. Runs `aide-memory recall` with each AIDE_DEBUG category in turn
#   3. Pipes a fake hook input through `aide-memory hook pre-edit`
#   4. Induces a loudError by passing an unknown event name
#
# Each section is clearly delimited so you can see exactly what shows up under
# what category. Use this when:
#   - You're developing a new debug call site and want to verify it fires
#   - A user reported "I don't see anything" and you want to remember what
#     each category looks like
#   - You're prepping a doc update and need a screenshot/paste of real output
#
# Usage: bash scripts/dev/show-debug-output.sh
#        AIDE_CLI=/path/to/aide-memory.js bash scripts/dev/show-debug-output.sh

set -e

CLI="${AIDE_CLI:-$(cd "$(dirname "$0")/../.." && pwd)/dist/cli/aide-memory.js}"
FIXTURE="$(mktemp -d -t aide-debug-show.XXXXXX)"
trap 'rm -rf "$FIXTURE"' EXIT

if [ ! -f "$CLI" ]; then
  echo "ERROR: CLI not built: $CLI"
  echo "Run: npm run build && npm run build:dist"
  exit 1
fi

cd "$FIXTURE"
mkdir -p src/api
echo "// stub" > src/api/routes.ts
mkdir -p .aide
node "$CLI" remember "Demo memory for show-debug-output.sh" \
  --layer technical --scope 'src/api/**' > /dev/null 2>&1

section() {
  echo
  echo "════════════════════════════════════════════════════════════════════"
  echo "  $1"
  echo "════════════════════════════════════════════════════════════════════"
}

run() {
  local label="$1"; shift
  echo "▸ $label"
  echo "  cmd: $*"
  echo "  ──────"
  # shellcheck disable=SC2068
  $@ 2>&1 1>/dev/null | sed 's/^/  /'
  echo
}

echo "Fixture: $FIXTURE"
echo "CLI:     $CLI"
echo "Node:    $(node --version) (ABI $(node -e 'console.log(process.versions.modules)'))"

section "1) DEFAULT (AIDE_DEBUG unset) — quiet by design, no diagnostic noise"
run "happy-path recall" \
  env -u AIDE_DEBUG -u AIDE_DEBUG_HOOK node "$CLI" recall src/api/routes.ts
echo "  (expected: empty above; aide-memory is silent unless AIDE_DEBUG is set)"

section "2) AIDE_DEBUG=recall — only the recall path narrates itself"
run "recall with single-category debug" \
  env AIDE_DEBUG=recall node "$CLI" recall src/api/routes.ts

section "3) AIDE_DEBUG=binding — observe native library load"
run "recall with binding-only debug" \
  env AIDE_DEBUG=binding node "$CLI" recall src/api/routes.ts

section "4) AIDE_DEBUG=hooks — pipe a fake preEdit input to the dispatcher"
hook_input='{"session_id":"demo","cwd":"'"$FIXTURE"'","tool_input":{"file_path":"'"$FIXTURE"'/src/api/routes.ts"},"hook_event_name":"PreToolUse","tool_name":"Edit"}'
echo "▸ hooks dispatch (AIDE_DEBUG=hooks)"
echo "  cmd: echo \$hook_input | AIDE_DEBUG=hooks node \$CLI hook pre-edit"
echo "  ──────"
echo "$hook_input" | AIDE_DEBUG=hooks node "$CLI" hook pre-edit 2>&1 1>/dev/null | sed 's/^/  /'
echo

echo "▸ hooks dispatch via legacy AIDE_DEBUG_HOOK=1 (back-compat)"
echo "  cmd: echo \$hook_input | AIDE_DEBUG_HOOK=1 node \$CLI hook pre-edit"
echo "  ──────"
echo "$hook_input" | AIDE_DEBUG_HOOK=1 node "$CLI" hook pre-edit 2>&1 1>/dev/null | sed 's/^/  /'
echo

section "5) AIDE_DEBUG=all — every applicable category emits in one run"
run "recall with all categories" \
  env AIDE_DEBUG=all node "$CLI" recall src/api/routes.ts

section "6) [AIDE_ERROR] always-on path — induce unknown hook event"
echo "▸ unknown event name (no AIDE_DEBUG required)"
echo "  cmd: echo \$hook_input | node \$CLI hook this-event-does-not-exist"
echo "  ──────"
echo "$hook_input" | node "$CLI" hook this-event-does-not-exist 2>&1 1>/dev/null | sed 's/^/  /'
echo
echo "  (expected: one [AIDE_ERROR] line — actionable hint included; agent flow not interrupted)"

echo
echo "════════════════════════════════════════════════════════════════════"
echo "Done. Fixture removed on exit."
echo "════════════════════════════════════════════════════════════════════"
