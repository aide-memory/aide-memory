#!/bin/bash
# UserPromptSubmit hook shim.
PKG_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$PKG_ROOT/dist/cli/aide-memory.js" hook pre-prompt
