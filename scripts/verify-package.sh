#!/bin/bash
set -e

# Verify aide-memory package contents before publish
# Usage: ./scripts/verify-package.sh

echo "Verifying aide-memory package contents..."

# Run npm pack --dry-run and capture output
PACK_OUTPUT=$(npm pack --dry-run 2>&1)

# Check package size (extract from npm pack output)
SIZE_LINE=$(echo "$PACK_OUTPUT" | grep -i "unpacked size" || true)
if [ -z "$SIZE_LINE" ]; then
  echo "WARNING: Could not determine package size"
else
  echo "Package size: $SIZE_LINE"
  # Extract numeric size - check if it exceeds 5MB
  SIZE_KB=$(echo "$SIZE_LINE" | grep -oE '[0-9]+(\.[0-9]+)?\s*(kB|KB)' || true)
  SIZE_MB=$(echo "$SIZE_LINE" | grep -oE '[0-9]+(\.[0-9]+)?\s*(MB|mB)' || true)
  if [ -n "$SIZE_MB" ]; then
    SIZE_NUM=$(echo "$SIZE_MB" | grep -oE '[0-9]+(\.[0-9]+)?')
    if (( $(echo "$SIZE_NUM > 5" | bc -l 2>/dev/null || echo 0) )); then
      echo "FAIL: Package size exceeds 5MB limit"
      exit 1
    fi
  fi
fi

ERRORS=0

# Check no test files included
if echo "$PACK_OUTPUT" | grep -qE '\.test\.(ts|js)'; then
  echo "FAIL: Test files found in package"
  ERRORS=$((ERRORS + 1))
fi

# Check no source maps included
if echo "$PACK_OUTPUT" | grep -qE '\.map$'; then
  echo "FAIL: Source maps found in package"
  ERRORS=$((ERRORS + 1))
fi

# Check no docs included
if echo "$PACK_OUTPUT" | grep -qE '^docs/'; then
  echo "FAIL: docs/ directory found in package"
  ERRORS=$((ERRORS + 1))
fi

# Check no .claude/ included
if echo "$PACK_OUTPUT" | grep -qE '\.claude/'; then
  echo "FAIL: .claude/ directory found in package"
  ERRORS=$((ERRORS + 1))
fi

# Check no src/ included (should only ship dist/)
if echo "$PACK_OUTPUT" | grep -qE '^\s*src/' | grep -v 'src/templates'; then
  echo "FAIL: src/ directory found in package (excluding templates)"
  ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -eq 0 ]; then
  echo "PASS: Package contents look correct"
else
  echo "FAIL: $ERRORS issue(s) found"
  exit 1
fi
