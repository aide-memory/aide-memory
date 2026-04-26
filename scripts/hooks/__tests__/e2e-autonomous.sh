#!/bin/bash
# End-to-end autonomous smokes — cover scenarios that require spawning the
# actual MCP server process against a dirty state (H auto-update, J pending-
# memory recovery, drift-repair on direct config.json edits).
#
# Unit tests can simulate most things, but these three specifically require
# `startServer()` to run against a real filesystem state. This script exercises
# them in isolated /tmp projects so it's safe to re-run anywhere.
#
# Part of the pre-flight block in docs/validation/E2E_VALIDATION.md.
# All scenarios must pass before the manual walk begins.

set -u
PASS=0
FAIL=0
REPO_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CLI="node $REPO_ROOT/dist/cli/aide-memory.js"
MCP="node $REPO_ROOT/dist/memory/cli.js"

check() {
  if [ "$1" = "ok" ]; then
    echo "  PASS: $2"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $2"
    FAIL=$((FAIL + 1))
  fi
}

# ----------------------------------------------------------------------------
# Helper: hash a resolved project path the way the MemoryStore does, so we
# can wipe the correct ~/.aide/projects/<hash>/memory.db.
# ----------------------------------------------------------------------------
project_hash() {
  node -e "console.log(require('crypto').createHash('sha1').update(require('fs').realpathSync('$1')).digest('hex').slice(0,12))"
}

wipe_project_db() {
  local root="$1"
  local h
  h=$(project_hash "$root")
  rm -rf "$HOME/.aide/projects/$h"
}

# ----------------------------------------------------------------------------
# H — auto-update on MCP server start
# Corrupts settings.json to stale v0.1.5 with a missing hook + user key, spawns
# MCP, verifies version bumped, hook restored, user key preserved.
# ----------------------------------------------------------------------------
echo "=== H: auto-update restores stale settings.json on MCP start ==="
TMP="$(mktemp -d -t aide-e2e-h-XXX)"
(
  cd "$TMP" && git init -q
  $CLI init > /dev/null 2>&1
  # Corrupt: downgrade version, remove Grep matcher, add user custom key
  python3 <<PY > /dev/null
import json, pathlib
p = pathlib.Path('.claude/settings.json')
s = json.loads(p.read_text())
s['_aideMemoryVersion'] = '0.1.5'
s['_userCustomKey'] = 'preserve-me'
s['hooks']['PreToolUse'] = [h for h in s['hooks']['PreToolUse'] if h.get('matcher') != 'Grep']
p.write_text(json.dumps(s, indent=2))
PY
) > /dev/null 2>&1

# Spawn MCP briefly to trigger autoUpdateIfNeeded
$MCP "$TMP" > /dev/null 2>&1 &
PID=$!; sleep 2; kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null

AFTER=$(python3 <<PY
import json
s = json.loads(open('$TMP/.claude/settings.json').read())
grep = [h for h in s['hooks']['PreToolUse'] if h.get('matcher') == 'Grep']
print('version=' + s['_aideMemoryVersion'])
print('user_key=' + str(s.get('_userCustomKey')))
print('grep_count=' + str(len(grep)))
PY
)
echo "$AFTER" | grep -q "version=0.2.0\|version=0.3\|version=0.4\|version=0.5\|version=0.6\|version=0.7\|version=0.8\|version=0.9\|version=1"
check $(echo $?  | sed 's/0/ok/;s/[1-9].*/fail/') "version bumped past 0.1.5 after MCP start"
echo "$AFTER" | grep -q "user_key=preserve-me" && check ok "_userCustomKey preserved" || check fail "_userCustomKey preserved"
echo "$AFTER" | grep -q "grep_count=1" && check ok "Grep matcher restored" || check fail "Grep matcher restored"

rm -rf "$TMP"
wipe_project_db "$TMP" 2>/dev/null || true
echo ""

# ----------------------------------------------------------------------------
# J — MCP-down + pending-memory recovery
# Writes a pending-memories.jsonl, spawns MCP, verifies ingest + archive.
# ----------------------------------------------------------------------------
echo "=== J: pending-memories.jsonl ingested on MCP start + archived ==="
TMP="$(mktemp -d -t aide-e2e-j-XXX)"
(
  cd "$TMP" && git init -q
  $CLI init > /dev/null 2>&1
  cat > .aide/pending-memories.jsonl <<'PENDING'
{"layer":"preferences","source":"hook","contributor":"smoke-test","tags":["style"],"content":"Use tabs (smoke)","generated_by":{"tool":"claude-code","author_type":"human"}}
PENDING
) > /dev/null 2>&1

# Spawn MCP briefly to trigger ingestPendingMemories
STDERR=$($MCP "$TMP" 2>&1 >/dev/null &
PID=$!; sleep 2; kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null
) 2>&1

# Verify stderr message
if $MCP "$TMP" 2>&1 >/dev/null & PID=$!; sleep 1; kill "$PID" 2>/dev/null; wait "$PID" 2>/dev/null; then :; fi > /dev/null 2>&1

# Run once more with stderr capture
SESSION_OUT=$(timeout 2 $MCP "$TMP" 2>&1 >/dev/null || true)
echo "$SESSION_OUT" | head -3 > /dev/null  # for reference

# Now check filesystem state post-ingest
if [ -f "$TMP/.aide/pending-memories.jsonl" ]; then
  check fail "pending-memories.jsonl archived (still present at original path)"
else
  check ok "pending-memories.jsonl archived (removed from original path)"
fi

ARCHIVED=$(ls "$TMP/.aide/"pending-memories.jsonl.imported-* 2>/dev/null | head -1)
if [ -n "$ARCHIVED" ]; then
  check ok "archive file created at .aide/pending-memories.jsonl.imported-*"
else
  check fail "archive file created at .aide/pending-memories.jsonl.imported-*"
fi

# Verify memory landed in store
(cd "$TMP" && $CLI list --layer preferences 2>/dev/null | grep -qi "tabs (smoke)") \
  && check ok "ingested memory visible via aide-memory list" \
  || check fail "ingested memory visible via aide-memory list"

rm -rf "$TMP"
wipe_project_db "$TMP" 2>/dev/null || true
echo ""

# ----------------------------------------------------------------------------
# Drift-repair — direct edit of .aide/config.json → next hook fire re-syncs
# ----------------------------------------------------------------------------
echo "=== Drift-repair: direct config.json edit → hook mtime-check → .ignore resync ==="
TMP="$(mktemp -d -t aide-e2e-drift-XXX)"
(
  cd "$TMP" && git init -q
  $CLI init > /dev/null 2>&1
) > /dev/null 2>&1

# Initial: .ignore has the managed block
if grep -q 'aide-memory-managed' "$TMP/.ignore" 2>/dev/null; then
  check ok "initial .ignore has aide-memory-managed block"
else
  check fail "initial .ignore has aide-memory-managed block"
fi

# Manually flip hideFromGrep to false (bypassing the CLI)
python3 <<PY > /dev/null 2>&1
import json, pathlib
p = pathlib.Path('$TMP/.aide/config.json')
c = json.loads(p.read_text())
c.setdefault('memories', {})['hideFromGrep'] = False
p.write_text(json.dumps(c, indent=2))
PY

# Wait for the mtime to change
sleep 1

# Fire detect-correction.sh with a valid 4-word prompt so it doesn't early-exit,
# sources read-config.sh, which triggers _aide_drift_check
echo "{\"session_id\":\"drift-smoke\",\"cwd\":\"$TMP\",\"prompt\":\"some four word prompt here\"}" \
  | bash "$REPO_ROOT/scripts/hooks/detect-correction.sh" > /dev/null 2>&1

# Give the background resync time to run
sleep 2

if [ ! -f "$TMP/.ignore" ]; then
  check ok ".ignore removed after config.json edit + hook fire"
elif ! grep -q 'aide-memory-managed' "$TMP/.ignore" 2>/dev/null; then
  check ok ".ignore stripped of managed block after hook fire"
else
  check fail ".ignore stripped of managed block after hook fire"
fi

rm -rf "$TMP"
wipe_project_db "$TMP" 2>/dev/null || true
echo ""

# ----------------------------------------------------------------------------
# Summary
# ----------------------------------------------------------------------------
echo "───────────────────────────────"
echo "Passed: $PASS   Failed: $FAIL"
if [ "$FAIL" -gt 0 ]; then
  echo "FAIL: end-to-end autonomous smoke suite"
  exit 1
fi
echo "PASS: end-to-end autonomous smoke suite"
