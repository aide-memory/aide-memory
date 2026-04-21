#!/bin/bash
# Integration smoke test — asserts that for every seeded path, the integer
# count from recall-for-path.js agrees with the layer-breakdown sum and
# the scoped_ids length.
#
# This guards the bug reported on /tmp/aide-l-test: integer "2" + preview
# breakdown "(1 area_context, 1 technical, 1 preferences, 1 guidelines)" = 4.
# That mismatch happens when one count is taken from the focused-scope set
# and the other from the unfiltered matching set. After the fix, all count
# fields derive from computeScopedForPath() — the single source of truth.
#
# Run from anywhere; PROJECT_ROOT of the worktree is auto-detected.

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_ROOT="$(cd "$HOOKS_DIR/../.." && pwd)"
RECALL_JS="$HOOKS_DIR/recall-for-path.js"
PRE_READ_SH="$HOOKS_DIR/pre-read-recall.sh"

if ! command -v jq >/dev/null 2>&1; then
  echo "SKIP: jq not installed"
  exit 0
fi

if [ ! -f "$PROJECT_ROOT/dist/memory/store.js" ]; then
  echo "SKIP: dist/ not built (run: npm run build)"
  exit 0
fi

# Seed a throwaway project so we control the memory set.
TMPROOT=$(mktemp -d "${TMPDIR:-/tmp}/aide-count-parity-XXXXXX")
trap 'rm -rf "$TMPROOT"' EXIT

mkdir -p "$TMPROOT/src/auth" "$TMPROOT/src/api"
touch "$TMPROOT/src/auth/login.ts" "$TMPROOT/src/api/routes.ts" "$TMPROOT/src/api/users.ts"

# Initialize .aide/ store by invoking the CLI.
cd "$TMPROOT"
AIDE_CLI="$PROJECT_ROOT/dist/cli/aide-memory.js"
node "$AIDE_CLI" init --force >/dev/null 2>&1 || true

# Seed five memories matching the validation scenario:
#   src/auth/**, src/api/**, src/**, exact src/api/routes.ts, no-scope project-wide
node "$AIDE_CLI" remember "auth rule" --layer guidelines   --scope "src/auth/**"        >/dev/null
node "$AIDE_CLI" remember "api tech"  --layer technical    --scope "src/api/**"         >/dev/null
node "$AIDE_CLI" remember "src pref"  --layer preferences  --scope "src/**"             >/dev/null
node "$AIDE_CLI" remember "routes"    --layer area_context --scope "src/api/routes.ts"  >/dev/null
node "$AIDE_CLI" remember "project"   --layer guidelines                                >/dev/null

fail=0

check_parity() {
  local probe="$1"
  local expected_count="$2"

  out=$(node "$RECALL_JS" "$probe" "$TMPROOT")
  if [ -z "$out" ] || [ "$out" = "0" ]; then
    actual_count=0
    scoped_count=0
    layers_sum=0
    scoped_ids_len=0
  else
    actual_count=$(echo "$out" | jq -r '.count // 0')
    scoped_count=$(echo "$out" | jq -r '.scoped_count // 0')
    layers_sum=$(echo "$out" | jq -r '[.layers | to_entries[].value] | add // 0')
    scoped_ids_len=$(echo "$out" | jq -r '.scoped_ids // [] | length')
  fi

  echo "  probe: $probe"
  echo "    count=$actual_count scoped_count=$scoped_count layers_sum=$layers_sum scoped_ids_len=$scoped_ids_len (expected=$expected_count)"

  if [ "$actual_count" != "$scoped_count" ] \
     || [ "$actual_count" != "$layers_sum" ] \
     || [ "$actual_count" != "$scoped_ids_len" ]; then
    echo "    FAIL: counts disagree"
    fail=1
  fi

  if [ -n "$expected_count" ] && [ "$actual_count" != "$expected_count" ]; then
    echo "    FAIL: got $actual_count, expected $expected_count"
    fail=1
  fi
}

echo "=== Count parity across 4 probe paths ==="
# src/api/routes.ts: focused = immediate-parent src/api/** (1) + exact file (1) = 2.
# src/** is grandparent → excluded. project-wide → excluded. src/auth/** sibling → no match.
check_parity "$TMPROOT/src/api/routes.ts" 2

# src/api/users.ts: only immediate-parent src/api/** matches (1).
check_parity "$TMPROOT/src/api/users.ts" 1

# src/auth/login.ts: only src/auth/** (1).
check_parity "$TMPROOT/src/auth/login.ts" 1

# src/api/ (dir query, effectiveParent=src/api, depth=2):
# src/api/** (depth 2) included, exact file (depth 3, child) included, src/auth/** sibling excluded,
# src/** (depth 1) grandparent excluded, project-wide excluded → 2.
check_parity "$TMPROOT/src/api/" 2

if [ $fail -ne 0 ]; then
  echo
  echo "FAIL: count-parity smoke test"
  exit 1
fi

echo
echo "PASS: count-parity smoke test"
