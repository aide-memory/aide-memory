#!/usr/bin/env bash
# cursor-init-smoke.test.sh — Phase C2 gate.
#
# Validates that `aide-memory init` in a fresh project produces the expected
# Cursor files: .cursor/hooks.json + .cursor/mcp.json + .cursor/rules/aide-
# memory.mdc + .gitignore entry. Runs against the feature-branch binary so
# it's exercising the code about to ship (per memory #323 fixture recipe).
#
# Not part of the unit-test surface because it touches the filesystem + runs
# the real `init` CLI. Invoke manually or from CI:
#
#   bash scripts/hooks/__tests__/cursor-init-smoke.test.sh
#
# Exit 0 on success, non-zero on first failure.

set -e

CLI="${AIDE_CLI:-$(cd "$(dirname "$0")/../../.." && pwd)/dist/cli/aide-memory.js}"
FIXTURE="$(mktemp -d -t aide-cursor-smoke.XXXXXX)"
trap 'rm -rf "$FIXTURE"' EXIT

echo "────────────────────────────────────────"
echo "Cursor init-smoke (Phase C2 gate)"
echo "  CLI:     $CLI"
echo "  Fixture: $FIXTURE"
echo "────────────────────────────────────────"

cd "$FIXTURE"
git init -q
git config user.name "smoke"
git config user.email "smoke@test"
node "$CLI" init > /dev/null 2>&1

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

# File presence
check ".cursor/hooks.json exists" '[ -f .cursor/hooks.json ]' "missing"
check ".cursor/mcp.json exists" '[ -f .cursor/mcp.json ]' "missing"
check ".cursor/rules/aide-memory.mdc exists" '[ -f .cursor/rules/aide-memory.mdc ]' "missing"

# hooks.json structure
HOOKS=$(cat .cursor/hooks.json)
check "hooks.json has version: 1" 'echo "$HOOKS" | python3 -c "import json,sys; assert json.load(sys.stdin)[\"version\"] == 1"' "version missing or wrong"
check "hooks.json has _aideMemoryVersion stamp" 'echo "$HOOKS" | python3 -c "import json,sys; d=json.load(sys.stdin); assert \"_aideMemoryVersion\" in d"' "stamp missing"

# All 6 top-level events present
for event in sessionStart preCompact stop beforeSubmitPrompt preToolUse postToolUse; do
  check "hooks.json has $event event" "echo \"\$HOOKS\" | python3 -c \"import json,sys; assert '$event' in json.load(sys.stdin)['hooks']\"" "missing $event"
done

# preToolUse matchers: Read, Write, Grep, MCP:aide_recall (NOT Glob — unsupported, NOT Edit — mapped to Write)
for matcher in Read Write Grep "MCP:aide_recall"; do
  check "preToolUse has matcher: $matcher" "echo \"\$HOOKS\" | python3 -c \"import json,sys; m=[e.get('matcher') for e in json.load(sys.stdin)['hooks']['preToolUse']]; assert '$matcher' in m\"" "matcher missing"
done

# Glob must NOT appear (unsupported in Cursor)
check "preToolUse does NOT have Glob matcher (unsupported)" 'echo "$HOOKS" | python3 -c "import json,sys; m=[e.get(\"matcher\") for e in json.load(sys.stdin)[\"hooks\"][\"preToolUse\"]]; assert \"Glob\" not in m"' "Glob leaked in"

# No duplicate (matcher,command) pairs in preToolUse (dedup check)
check "preToolUse has no duplicate (matcher,command) pairs" 'echo "$HOOKS" | python3 -c "import json,sys; entries=json.load(sys.stdin)[\"hooks\"][\"preToolUse\"]; keys=[(e.get(\"matcher\"),e[\"command\"]) for e in entries]; assert len(set(keys)) == len(keys), f\"duplicates: {keys}\""' "duplicate entry found"

# postToolUse matchers: 5 MCP:aide_* entries
check "postToolUse has 5 MCP matchers" 'echo "$HOOKS" | python3 -c "import json,sys; entries=json.load(sys.stdin)[\"hooks\"][\"postToolUse\"]; assert len(entries) == 5"' "wrong count"

# mcp.json structure
MCP=$(cat .cursor/mcp.json)
check "mcp.json has aide-memory server" 'echo "$MCP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert \"aide-memory\" in d[\"mcpServers\"]"' "server missing"
check "mcp.json server has type: stdio" 'echo "$MCP" | python3 -c "import json,sys; d=json.load(sys.stdin); assert d[\"mcpServers\"][\"aide-memory\"][\"type\"] == \"stdio\""' "type missing"
check "mcp.json uses \${workspaceFolder} interpolation" 'grep -q "workspaceFolder" .cursor/mcp.json' "interpolation missing"

# Rules file has YAML frontmatter
check ".mdc rules file starts with YAML frontmatter" 'head -1 .cursor/rules/aide-memory.mdc | grep -q "^---$"' "frontmatter missing"
check ".mdc rules file has alwaysApply: true" 'grep -q "alwaysApply: true" .cursor/rules/aide-memory.mdc' "alwaysApply missing"
check ".mdc rules file mentions agent_message caveat" 'grep -q "agent_message" .cursor/rules/aide-memory.mdc' "agent_message note missing"

# Gitignore
check ".gitignore includes .cursor/rules/aide-memory.mdc" 'grep -q ".cursor/rules/aide-memory.mdc" .gitignore' "gitignore entry missing"

echo ""
echo "────────────────────"
echo "PASS: $pass  FAIL: $fail"
echo "────────────────────"
[ $fail -eq 0 ] && echo "✅ Cursor init-smoke passed" || { echo "❌ failures"; exit 1; }
