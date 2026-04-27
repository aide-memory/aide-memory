#!/usr/bin/env bash
# Smoke test: memories.defaultShared config key (shipped 0.5.0 per memory #373).
#
# Verifies CLI integration of the config-driven default. The per-call
# override (shared:true|false) is MCP-only (aide_remember tool param) and
# is unit-tested in store.test.ts. This smoke covers the CLI `remember`
# path end-to-end.
#
# What's verified:
#   1. With memories.defaultShared:true (default), aide-memory remember
#      lands in .aide/memories/preferences/shared/.
#   2. With memories.defaultShared:false, same call lands in
#      .aide/memories/preferences/personal/.
#   3. Other layers (technical/area_context/guidelines) ignore the
#      shared/personal split — they always live directly under the layer
#      dir (preferences-only split per memory #374).
#
# Run as:
#   bash scripts/hooks/__tests__/memories-default-shared.smoke.test.sh
#
# Exits 0 on success, 1 on any FAIL.

set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
CLI="$ROOT/dist/cli/aide-memory.js"

if [[ ! -f "$CLI" ]]; then
  echo "FAIL: $CLI missing — run npm run build:dist first"
  exit 1
fi

PASS=0
FAIL=0
TEST_DIR=""

cleanup() {
  if [[ -n "${TEST_DIR:-}" && -d "$TEST_DIR" ]]; then
    rm -rf "$TEST_DIR"
  fi
}
trap cleanup EXIT

# ---------------------------------------------------------------------------
# Test 1: default (no config) → preferences/shared/
# ---------------------------------------------------------------------------
TEST_DIR=$(mktemp -d -t aide-defshared-test1-XXXXXX)
cd "$TEST_DIR"
git init -q && git config user.name t && git config user.email t@t.com
node "$CLI" init >/dev/null 2>&1

OUT=$(node "$CLI" remember --layer preferences "test1: default shared" 2>&1)
SHARED_FILES=$(find .aide/memories/preferences/shared -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
PERSONAL_FILES=$(find .aide/memories/preferences/personal -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')

if [[ "$SHARED_FILES" -ge 1 && "$PERSONAL_FILES" -eq 0 ]]; then
  echo "PASS  Test 1: default (no config) → preferences/shared/ (${SHARED_FILES} shared / ${PERSONAL_FILES} personal)"
  PASS=$((PASS+1))
else
  echo "FAIL  Test 1: expected 1+ in shared/ + 0 in personal/, got ${SHARED_FILES} shared / ${PERSONAL_FILES} personal"
  echo "       remember output: $OUT"
  FAIL=$((FAIL+1))
fi
cd "$ROOT"
cleanup

# ---------------------------------------------------------------------------
# Test 2: memories.defaultShared:false → preferences/personal/
# ---------------------------------------------------------------------------
TEST_DIR=$(mktemp -d -t aide-defshared-test2-XXXXXX)
cd "$TEST_DIR"
git init -q && git config user.name t && git config user.email t@t.com
node "$CLI" init >/dev/null 2>&1
node "$CLI" config memories.defaultShared false >/dev/null 2>&1

OUT=$(node "$CLI" remember --layer preferences "test2: default personal" 2>&1)
SHARED_FILES=$(find .aide/memories/preferences/shared -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')
PERSONAL_FILES=$(find .aide/memories/preferences/personal -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')

if [[ "$PERSONAL_FILES" -ge 1 && "$SHARED_FILES" -eq 0 ]]; then
  echo "PASS  Test 2: defaultShared:false → preferences/personal/ (${PERSONAL_FILES} personal / ${SHARED_FILES} shared)"
  PASS=$((PASS+1))
else
  echo "FAIL  Test 2: expected 1+ in personal/ + 0 in shared/, got ${PERSONAL_FILES} personal / ${SHARED_FILES} shared"
  echo "       remember output: $OUT"
  FAIL=$((FAIL+1))
fi
cd "$ROOT"
cleanup

# ---------------------------------------------------------------------------
# Test 3: non-preferences layer ignores the shared/personal folder split
# ---------------------------------------------------------------------------
TEST_DIR=$(mktemp -d -t aide-defshared-test3-XXXXXX)
cd "$TEST_DIR"
git init -q && git config user.name t && git config user.email t@t.com
node "$CLI" init >/dev/null 2>&1
node "$CLI" config memories.defaultShared false >/dev/null 2>&1

OUT=$(node "$CLI" remember --layer technical "test3: technical fact" 2>&1)
TECH_FILES=$(find .aide/memories/technical -type f -name '*.json' 2>/dev/null | wc -l | tr -d ' ')

if [[ "$TECH_FILES" -ge 1 ]]; then
  echo "PASS  Test 3: technical layer ignores defaultShared:false (lands in technical/, ${TECH_FILES} file)"
  PASS=$((PASS+1))
else
  echo "FAIL  Test 3: expected 1+ in technical/, got ${TECH_FILES}"
  echo "       remember output: $OUT"
  FAIL=$((FAIL+1))
fi
cd "$ROOT"
cleanup
TEST_DIR=""

echo "────────────────────────────────────────"
echo "  PASS: $PASS"
echo "  FAIL: $FAIL"
echo "────────────────────────────────────────"

exit $FAIL
