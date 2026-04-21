#!/bin/bash
# Bash integration test: toggle 5 representative settings and assert the
# corresponding hook's visible behavior changes. Run as:
#   bash scripts/hooks/__tests__/settings-behavior.test.sh
#
# Exits non-zero on any failure. The vitest hook tests cover per-hook
# unit behavior; this file specifically exercises the settings <-> hook
# wiring end-to-end against a real `.aide/config.json`.

set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
HOOKS="$ROOT/scripts/hooks"
AIDE_CLI="node $ROOT/dist/cli/aide-memory.js"
WORKDIR=$(mktemp -d)
trap 'rm -rf "$WORKDIR"' EXIT

# Initialize a temp project with all knobs seeded.
(cd "$WORKDIR" && git init -q && git config user.name "Test" && git config user.email "t@t.com")
(cd "$WORKDIR" && $AIDE_CLI init) >/dev/null 2>&1

failures=0

expect() {
  local name="$1" cond="$2" info="$3"
  if [ "$cond" = "true" ]; then
    echo "  PASS  $name"
  else
    echo "  FAIL  $name — $info"
    failures=$((failures + 1))
  fi
}

set_cfg() {
  (cd "$WORKDIR" && $AIDE_CLI config "$1" "$2") >/dev/null 2>&1
}

# ─── 1. hooks.read.maxBlocks toggle ──────────────────────────────────────
# Seed a scoped memory so the read hook has something to fire on.
mkdir -p "$WORKDIR/.aide/memories/area_context" "$WORKDIR/src/seeded"
cat > "$WORKDIR/.aide/memories/area_context/seed.json" <<'J'
{"uuid":"s1-test-1234","layer":"area_context","what":"integration test seed memory","why":"for hook verification","scope":"src/seeded/**","context_label":null,"contributor":"test","tags":[],"source":"conversation","shared":true,"generated_by":null,"derived_from":null,"created_at":"2026-04-20T00:00:00Z","updated_at":"2026-04-20T00:00:00Z"}
J
echo "x" > "$WORKDIR/src/seeded/f.ts"
(cd "$WORKDIR" && $AIDE_CLI sync import) >/dev/null 2>&1 || true

set_cfg hooks.read.maxBlocks 0
out_off=$(echo "{\"tool_input\":{\"file_path\":\"$WORKDIR/src/seeded/f.ts\"},\"session_id\":\"t1\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/pre-read-recall.sh")
set_cfg hooks.read.maxBlocks 1
out_on=$(echo "{\"tool_input\":{\"file_path\":\"$WORKDIR/src/seeded/f.ts\"},\"session_id\":\"t2\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/pre-read-recall.sh")
if [ -z "$out_off" ] && [ -n "$out_on" ]; then
  expect "hooks.read.maxBlocks=0 silences read hook" "true" ""
else
  expect "hooks.read.maxBlocks=0 silences read hook" "false" "off='$out_off' on_len=${#out_on}"
fi

# ─── 2. hooks.correction.enabled toggle ──────────────────────────────────
set_cfg hooks.correction.enabled false
out_off=$(echo "{\"prompt\":\"No, dont use X instead\",\"session_id\":\"tc1\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/detect-correction.sh")
set_cfg hooks.correction.enabled true
out_on=$(echo "{\"prompt\":\"No, dont use X instead\",\"session_id\":\"tc2\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/detect-correction.sh")
if [ -z "$out_off" ] && [ -n "$out_on" ]; then
  expect "hooks.correction.enabled=false silences correction hook" "true" ""
else
  expect "hooks.correction.enabled=false silences correction hook" "false" "off='$out_off' on_len=${#out_on}"
fi

# ─── 3. hooks.search.mode (off/block) ────────────────────────────────────
set_cfg hooks.search.mode off
out_off=$(echo "{\"tool_input\":{\"pattern\":\"seed\"},\"session_id\":\"ts1\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/pre-search-nudge.sh")
set_cfg hooks.search.mode block
out_block=$(echo "{\"tool_input\":{\"pattern\":\"seed\"},\"session_id\":\"ts2\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/pre-search-nudge.sh")
if [ -z "$out_off" ] && echo "$out_block" | grep -q '"block"'; then
  expect "hooks.search.mode=off/block honored" "true" ""
else
  expect "hooks.search.mode=off/block honored" "false" "off='$out_off' block=${out_block:0:40}"
fi

# ─── 4. hooks.precompact.mode=off skips cleanup ──────────────────────────
mkdir -p "$WORKDIR/.aide/cache"
echo "ids|1,2,3" > "$WORKDIR/.aide/cache/recalled-paths-tpc.txt"
set_cfg hooks.precompact.mode off
echo "{\"session_id\":\"tpc\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/pre-compact-save.sh"
off_kept=false
[ -f "$WORKDIR/.aide/cache/recalled-paths-tpc.txt" ] && off_kept=true

echo "ids|1,2,3" > "$WORKDIR/.aide/cache/recalled-paths-tpc.txt"
set_cfg hooks.precompact.mode cleanup
echo "{\"session_id\":\"tpc\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/pre-compact-save.sh"
cleanup_cleared=false
[ ! -f "$WORKDIR/.aide/cache/recalled-paths-tpc.txt" ] && cleanup_cleared=true

if [ "$off_kept" = "true" ] && [ "$cleanup_cleared" = "true" ]; then
  expect "hooks.precompact.mode=off preserves tracking; cleanup clears" "true" ""
else
  expect "hooks.precompact.mode=off preserves tracking; cleanup clears" "false" "off_kept=$off_kept cleanup_cleared=$cleanup_cleared"
fi

# ─── 5. hooks.stop.schedule toggle ───────────────────────────────────────
rm -f "$WORKDIR/.aide/cache/stop-count-tss.txt" "$WORKDIR/.aide/cache/correction-pending-tss.txt"
set_cfg hooks.stop.schedule '[{"every":1}]'
o1=$(echo "{\"stop_hook_active\":false,\"session_id\":\"tss\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/stop-remember.sh")

rm -f "$WORKDIR/.aide/cache/stop-count-tss2.txt"
set_cfg hooks.stop.schedule '[{"every":100}]'
o2=$(echo "{\"stop_hook_active\":false,\"session_id\":\"tss2\",\"cwd\":\"$WORKDIR\"}" | bash "$HOOKS/stop-remember.sh")
if echo "$o1" | grep -q '"block"' && [ -z "$o2" ]; then
  expect "hooks.stop.schedule every:1 blocks; every:100 silent" "true" ""
else
  expect "hooks.stop.schedule every:1 blocks; every:100 silent" "false" "o1=${o1:0:40} o2=${o2:0:40}"
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "All 5 settings behaviors verified."
  exit 0
else
  echo "$failures failures."
  exit 1
fi
