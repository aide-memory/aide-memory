#!/usr/bin/env bash
# Smoke test: version update notification + telemetry config
# Runs against the INSTALLED aide-memory (not dev tree)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(mktemp -d)"
trap 'rm -rf "$PROJECT_DIR"' EXIT

echo "=== Setup ==="
cd "$PROJECT_DIR"
npm init -y > /dev/null 2>&1
git init > /dev/null 2>&1
git config user.name "Test" 2>/dev/null
git config user.email "test@test.com" 2>/dev/null

# Find the installed aide-memory
AIDE_BIN="$(which aide-memory 2>/dev/null || echo "")"
if [ -z "$AIDE_BIN" ]; then
  echo "SKIP: aide-memory not installed globally"
  exit 0
fi

AIDE_VERSION="$(aide-memory --version)"
echo "Testing aide-memory v${AIDE_VERSION}"

# Init
aide-memory init > /dev/null 2>&1

PASS=0
FAIL=0

# --- Test 1: Version update notice in SessionStart hook output ---
echo "--- Test 1: Version update notice in SessionStart ---"
# Fake a newer version in cache
mkdir -p ~/.aide
ORIG_CACHE=""
if [ -f ~/.aide/update-check.json ]; then
  ORIG_CACHE="$(cat ~/.aide/update-check.json)"
fi
echo '{"lastCheck":1745960000000,"latestVersion":"9.9.9"}' > ~/.aide/update-check.json

HOOK_CMD="$(python3 -c "import json; d=json.load(open('.claude/settings.json')); print(d['hooks']['SessionStart'][0]['hooks'][0]['command'].split(' ',1)[1])")"
HOOK_OUTPUT="$(echo '{"tool_name":"SessionStart","session_id":"smoke-ver","source":"start"}' | bash "$HOOK_CMD" 2>/dev/null || true)"

if echo "$HOOK_OUTPUT" | grep -q "9.9.9"; then
  echo "  PASS: Version notice found in SessionStart output"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Version notice NOT found in SessionStart output"
  echo "  Output: $HOOK_OUTPUT"
  FAIL=$((FAIL + 1))
fi

# Check systemMessage includes update notice
if echo "$HOOK_OUTPUT" | grep -q "update available"; then
  echo "  PASS: systemMessage includes update notice"
  PASS=$((PASS + 1))
else
  echo "  FAIL: systemMessage missing update notice"
  FAIL=$((FAIL + 1))
fi

# Restore cache
if [ -n "$ORIG_CACHE" ]; then
  echo "$ORIG_CACHE" > ~/.aide/update-check.json
else
  rm -f ~/.aide/update-check.json
fi

# --- Test 2: No version notice when up to date ---
echo "--- Test 2: No false positive when up to date ---"
echo "{\"lastCheck\":$(date +%s)000,\"latestVersion\":\"${AIDE_VERSION}\"}" > ~/.aide/update-check.json

HOOK_OUTPUT2="$(echo '{"tool_name":"SessionStart","session_id":"smoke-ver2","source":"start"}' | bash "$HOOK_CMD" 2>/dev/null || true)"

if echo "$HOOK_OUTPUT2" | grep -q "update available"; then
  echo "  FAIL: False positive version notice when already on latest"
  FAIL=$((FAIL + 1))
else
  echo "  PASS: No false positive when up to date"
  PASS=$((PASS + 1))
fi

# Restore cache
if [ -n "$ORIG_CACHE" ]; then
  echo "$ORIG_CACHE" > ~/.aide/update-check.json
else
  rm -f ~/.aide/update-check.json
fi

# --- Test 3: Telemetry config disables ---
echo "--- Test 3: Telemetry config ---"
aide-memory config telemetry.enabled false > /dev/null 2>&1
VAL="$(aide-memory config telemetry.enabled 2>&1)"
if echo "$VAL" | grep -q "false"; then
  echo "  PASS: telemetry.enabled set to false"
  PASS=$((PASS + 1))
else
  echo "  FAIL: telemetry.enabled not false, got: $VAL"
  FAIL=$((FAIL + 1))
fi

# Re-enable
aide-memory config telemetry.enabled true > /dev/null 2>&1
VAL2="$(aide-memory config telemetry.enabled 2>&1)"
if echo "$VAL2" | grep -q "true"; then
  echo "  PASS: telemetry.enabled re-enabled to true"
  PASS=$((PASS + 1))
else
  echo "  FAIL: telemetry.enabled not re-enabled, got: $VAL2"
  FAIL=$((FAIL + 1))
fi

# --- Test 4: AIDE_TELEMETRY=off env var ---
echo "--- Test 4: AIDE_TELEMETRY env var ---"
# Store a memory with telemetry off, should succeed (local still works)
AIDE_TELEMETRY=off aide-memory remember "telemetry off test" --layer technical > /dev/null 2>&1
SEARCH="$(aide-memory search "telemetry off test" 2>&1)"
if echo "$SEARCH" | grep -q "telemetry off test"; then
  echo "  PASS: Memory stored with AIDE_TELEMETRY=off"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Memory not found after AIDE_TELEMETRY=off store"
  FAIL=$((FAIL + 1))
fi

# --- Test 5: Cursor rules file version notice ---
echo "--- Test 5: Cursor rules file version notice ---"
echo '{"lastCheck":1745960000000,"latestVersion":"9.9.9"}' > ~/.aide/update-check.json
aide-memory init --force > /dev/null 2>&1

if grep -q "Update available" .cursor/rules/aide-memory.mdc 2>/dev/null; then
  echo "  PASS: Cursor rules file contains version notice"
  PASS=$((PASS + 1))
else
  echo "  FAIL: Cursor rules file missing version notice"
  FAIL=$((FAIL + 1))
fi

# No notice when up to date
echo "{\"lastCheck\":$(date +%s)000,\"latestVersion\":\"${AIDE_VERSION}\"}" > ~/.aide/update-check.json
aide-memory init --force > /dev/null 2>&1

if grep -q "Update available" .cursor/rules/aide-memory.mdc 2>/dev/null; then
  echo "  FAIL: Cursor rules file has false positive version notice"
  FAIL=$((FAIL + 1))
else
  echo "  PASS: Cursor rules file clean when up to date"
  PASS=$((PASS + 1))
fi

# Restore cache
if [ -n "$ORIG_CACHE" ]; then
  echo "$ORIG_CACHE" > ~/.aide/update-check.json
else
  rm -f ~/.aide/update-check.json
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
