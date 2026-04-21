#!/bin/bash
# Verify aide-memory package contents before publish.
# Usage: ./scripts/verify-package.sh   (from repo root, with package.json being the publish manifest)
# Fails non-zero if any .ts source, .map, or unbundled src/ file would leak.

set +e  # collect all errors, exit at the end

echo "Verifying aide-memory package contents..."

# Capture the list of files npm pack would ship
PACK_OUTPUT=$(npm pack --dry-run --json 2>&1)
# Fallback to text mode if --json not available
if ! echo "$PACK_OUTPUT" | grep -q '"files"'; then
  PACK_OUTPUT=$(npm pack --dry-run 2>&1)
  FILE_LINES=$(echo "$PACK_OUTPUT" | grep -E '^npm notice' | grep -E '[0-9]+\s*([kKMmGg]?[bB])\s+\S' | sed -E 's/npm notice\s+[0-9.]+\s*[kKMmGg]?[bB]\s+//')
else
  FILE_LINES=$(echo "$PACK_OUTPUT" | python3 -c 'import json,sys; d=json.loads(sys.stdin.read()); [print(f["path"]) for f in d[0]["files"]]' 2>/dev/null || echo "")
fi

if [ -z "$FILE_LINES" ]; then
  echo "FAIL: could not determine tarball contents from npm pack output"
  exit 1
fi

echo "Files that would ship:"
echo "$FILE_LINES" | sed 's/^/  /'
echo ""

ERRORS=0

# 1. No raw TypeScript sources
if echo "$FILE_LINES" | grep -qE '\.ts$'; then
  echo "FAIL: raw .ts source files found in tarball:"
  echo "$FILE_LINES" | grep -E '\.ts$' | sed 's/^/  /'
  ERRORS=$((ERRORS + 1))
fi

# 2. No source maps
if echo "$FILE_LINES" | grep -qE '\.map$'; then
  echo "FAIL: source map (.map) files found in tarball:"
  echo "$FILE_LINES" | grep -E '\.map$' | sed 's/^/  /'
  ERRORS=$((ERRORS + 1))
fi

# 3. No test files
if echo "$FILE_LINES" | grep -qE '\.test\.(ts|js)$|__tests__/'; then
  echo "FAIL: test files found in tarball:"
  echo "$FILE_LINES" | grep -E '\.test\.(ts|js)$|__tests__/' | sed 's/^/  /'
  ERRORS=$((ERRORS + 1))
fi

# 4. No docs / .claude / .aide / .github / .git
if echo "$FILE_LINES" | grep -qE '^docs/|\.claude/|\.aide/|\.github/|\.git/'; then
  echo "FAIL: dev-only directories found in tarball:"
  echo "$FILE_LINES" | grep -E '^docs/|\.claude/|\.aide/|\.github/|\.git/' | sed 's/^/  /'
  ERRORS=$((ERRORS + 1))
fi

# 5. No src/ files except src/templates/rules (templates are intentionally shipped)
SRC_LEAKS=$(echo "$FILE_LINES" | grep -E '^src/' | grep -vE '^src/templates/rules/')
if [ -n "$SRC_LEAKS" ]; then
  echo "FAIL: src/ files outside src/templates/rules/ found in tarball:"
  echo "$SRC_LEAKS" | sed 's/^/  /'
  ERRORS=$((ERRORS + 1))
fi

# 6. No dev configs
if echo "$FILE_LINES" | grep -qE '^tsconfig\.json$|^vitest\.config|^package\.aide-memory\.json$'; then
  echo "FAIL: dev configuration files found in tarball:"
  echo "$FILE_LINES" | grep -E '^tsconfig\.json$|^vitest\.config|^package\.aide-memory\.json$' | sed 's/^/  /'
  ERRORS=$((ERRORS + 1))
fi

# 7. The bundled CLI and library MUST be present
if ! echo "$FILE_LINES" | grep -qE '^dist/cli/aide-memory\.js$'; then
  echo "FAIL: dist/cli/aide-memory.js (bundled CLI) missing from tarball"
  ERRORS=$((ERRORS + 1))
fi
if ! echo "$FILE_LINES" | grep -qE '^dist/memory/index\.js$'; then
  echo "FAIL: dist/memory/index.js (bundled library) missing from tarball"
  ERRORS=$((ERRORS + 1))
fi
if ! echo "$FILE_LINES" | grep -qE '^dist/memory/cli\.js$'; then
  echo "FAIL: dist/memory/cli.js (bundled MCP server entry) missing from tarball"
  ERRORS=$((ERRORS + 1))
fi

# 8. The bundled CLI must look minified (single file, no leading JSDoc block)
# Extract the actual file from the tarball to verify
TARBALL=$(ls aide-memory-*.tgz 2>/dev/null | head -1)
if [ -z "$TARBALL" ]; then
  npm pack --silent >/dev/null 2>&1
  TARBALL=$(ls aide-memory-*.tgz | head -1)
fi
if [ -n "$TARBALL" ] && [ -f "$TARBALL" ]; then
  TMPDIR=$(mktemp -d)
  tar -xzf "$TARBALL" -C "$TMPDIR" 2>/dev/null
  for BUNDLE in "$TMPDIR/package/dist/cli/aide-memory.js" "$TMPDIR/package/dist/memory/index.js" "$TMPDIR/package/dist/memory/cli.js"; do
    if [ ! -f "$BUNDLE" ]; then continue; fi
    BNAME=$(basename "$BUNDLE")

    # 9a. Minification sanity: no long comment blocks in head
    COMMENT_LINES=$(head -100 "$BUNDLE" | grep -cE '^\s*(/\*| \* |//)' || true)
    if [ "$COMMENT_LINES" -gt 5 ]; then
      echo "FAIL: bundle $BNAME has $COMMENT_LINES comment lines in head — was --minify applied?"
      ERRORS=$((ERRORS + 1))
    fi

    # 9b. Embedded source-map sentinel — bundle must not reference a sourcemap
    if grep -q 'sourceMappingURL' "$BUNDLE"; then
      echo "FAIL: bundle $BNAME contains sourceMappingURL reference (strip --sourcemap)"
      ERRORS=$((ERRORS + 1))
    fi

    # 9c. Legacy/dev-monorepo leak — these strings should NEVER appear in a
    # published bundle. If they do, the bundle inlined the dev-monorepo
    # package.json (e.g., via require('../../package.json')) instead of the
    # clean aide-memory publish manifest. See src/cli/aide-memory.ts runtime
    # read pattern.
    for LEAK in "aide-v0" "aide-legacy" "graph-based retrieval" "ts-morph" "tree-sitter-typescript" "web-tree-sitter" "marked-terminal"; do
      if grep -q "$LEAK" "$BUNDLE"; then
        echo "FAIL: bundle $BNAME contains dev-monorepo leak: '$LEAK'"
        ERRORS=$((ERRORS + 1))
      fi
    done
  done
  rm -rf "$TMPDIR" "$TARBALL"
fi

if [ $ERRORS -eq 0 ]; then
  echo ""
  echo "PASS: Package contents look correct (no source/map/test/dev leaks)"
  exit 0
else
  echo ""
  echo "FAIL: $ERRORS issue(s) found"
  exit 1
fi
