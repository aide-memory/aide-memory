#!/bin/bash
# Install-from-tarball smoke: packs the current tarball, installs into a fresh
# temp dir, runs full lifecycle, asserts zero source leaks and all commands
# work. Catches bugs that dev-mode testing misses because dev has the full
# node_modules + tsc output (per memory #163).
#
# Run as:
#   bash scripts/hooks/__tests__/install-from-tarball.smoke.sh
#
# Exit 0 if every check passes, 1 on any failure.

set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
PASS=0
FAIL=0

check() {
  if [ "$1" = "ok" ]; then
    echo "  PASS: $2"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $2"
    FAIL=$((FAIL + 1))
  fi
}

echo "=== Install-from-tarball smoke ==="
echo

# Build fresh
echo "Building..."
(cd "$ROOT" && npm run build >/dev/null 2>&1 && npm run build:dist >/dev/null 2>&1) || {
  echo "FAIL: build"
  exit 1
}

# Swap to publish manifest + pack
WORK=$(mktemp -d -t aide-tarball-smoke-XXX)
trap "rm -rf $WORK" EXIT

cp "$ROOT/package.json" "$WORK/dev-package.json.bak"
cp "$ROOT/package.aide-memory.json" "$ROOT/package.json"

# Pack
cd "$ROOT"
TARBALL=$(npm pack 2>/dev/null | tail -1)
if [ -z "$TARBALL" ] || [ ! -f "$ROOT/$TARBALL" ]; then
  echo "FAIL: npm pack did not produce a tarball"
  mv "$WORK/dev-package.json.bak" "$ROOT/package.json"
  exit 1
fi

# Restore dev manifest immediately
mv "$WORK/dev-package.json.bak" "$ROOT/package.json"

# Install in clean dir
cp "$ROOT/$TARBALL" "$WORK/"
cd "$WORK"
npm init -y >/dev/null 2>&1
npm install "$WORK/$TARBALL" >/dev/null 2>&1 || {
  echo "FAIL: npm install of tarball failed"
  rm -f "$ROOT/$TARBALL"
  exit 1
}

# Zero source leaks
find node_modules/aide-memory -name "*.ts" -o -name "*.map" 2>/dev/null | grep -q . \
  && check fail "no source leaks (.ts / .map)" \
  || check ok "no source leaks (.ts / .map)"

# CLI version works
VERSION=$(./node_modules/.bin/aide-memory --version 2>/dev/null)
[ -n "$VERSION" ] && check ok "aide-memory --version ($VERSION)" || check fail "aide-memory --version"

# Full lifecycle in a fresh project
mkdir project
cd project
git init -q
../node_modules/.bin/aide-memory init >/dev/null 2>&1 \
  && check ok "init succeeds" || check fail "init succeeds"

[ -f .aide/config.json ] && check ok ".aide/config.json created" || check fail ".aide/config.json created"
[ -f .ignore ] && check ok ".ignore created" || check fail ".ignore created"
[ -f .mcp.json ] && check ok ".mcp.json created" || check fail ".mcp.json created"

# Use scope with ≥2 fixed segments so it matches under the 0.4.3 default
# recall.minScopeDepth=2. Single-segment scopes like src/** are filtered as
# too-broad for path-recall (they'd live at SessionStart injection instead).
../node_modules/.bin/aide-memory remember "smoke test" --layer technical --scope "src/api/**" >/dev/null 2>&1 \
  && check ok "remember succeeds" || check fail "remember succeeds"

mkdir -p src/api && touch src/api/x.ts
../node_modules/.bin/aide-memory recall src/api/x.ts 2>/dev/null | grep -q "smoke test" \
  && check ok "recall returns seeded memory" || check fail "recall returns seeded memory"

../node_modules/.bin/aide-memory search smoke 2>/dev/null | grep -q "smoke test" \
  && check ok "search finds seeded memory" || check fail "search finds seeded memory"

../node_modules/.bin/aide-memory list 2>/dev/null | grep -q "smoke test" \
  && check ok "list shows seeded memory" || check fail "list shows seeded memory"

# Drift-repair: edit config.json, fire hook, verify .ignore resyncs
python3 -c "
import json
c = json.load(open('.aide/config.json'))
c.setdefault('memories', {})['hideFromGrep'] = False
json.dump(c, open('.aide/config.json','w'), indent=2)
" 2>/dev/null

sleep 1
echo "{\"session_id\":\"tarball-smoke\",\"cwd\":\"$PWD\",\"tool_input\":{\"file_path\":\"$PWD/src/api/x.ts\"}}" \
  | bash ../node_modules/aide-memory/scripts/hooks/pre-read-recall.sh >/dev/null 2>&1
sleep 3

if [ ! -f .ignore ] || ! grep -q "aide-memory-managed" .ignore 2>/dev/null; then
  check ok "drift-repair removed .aide/memories/ from .ignore after config edit"
else
  check fail "drift-repair did not re-sync .ignore"
fi

# Cleanup the tarball
rm -f "$ROOT/$TARBALL"

echo
echo "───────────────────────────────"
echo "Passed: $PASS   Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: install-from-tarball smoke"
  exit 1
fi
echo "PASS: install-from-tarball smoke"
