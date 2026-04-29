#!/usr/bin/env bash
# Install the local dev tree as the global aide-memory.
# After this, `aide-memory --version` reflects the dev build.
# To switch back to the published version: `npm run dev:restore`.
set -euo pipefail

cd "$(dirname "$0")/../.."

echo "==> Building dev tree..."
npm run build > /dev/null
npm run build:dist > /dev/null

echo "==> Swapping to publish manifest..."
cp package.json package.json.dev-backup
cp package.aide-memory.json package.json
cp README.md README.md.dev-backup 2>/dev/null || true
cp README.npm.md README.md

trap 'mv package.json.dev-backup package.json; [ -f README.md.dev-backup ] && mv README.md.dev-backup README.md; rm -f aide-memory-*.tgz' EXIT

echo "==> Packing..."
TARBALL=$(npm pack --silent)

echo "==> Installing $TARBALL globally..."
npm install -g "./$TARBALL" > /dev/null

echo ""
echo "Dev install complete. Global aide-memory is now your dev build:"
which aide-memory
aide-memory --version
echo ""
echo "To switch back to the published version: npm run dev:restore"
