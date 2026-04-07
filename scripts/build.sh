#!/bin/bash
set -e

# Build aide-memory for npm publish

echo "Building aide-memory..."

# Compile TypeScript
tsc

# Copy templates to dist (if they exist)
if [ -d "src/templates" ]; then
  cp -r src/templates dist/
  echo "Copied templates to dist/"
fi

# Copy hooks to dist
if [ -d "scripts/hooks" ]; then
  mkdir -p dist/hooks
  cp -r scripts/hooks/* dist/hooks/
  echo "Copied hooks to dist/hooks/"
fi

echo "Build complete."
