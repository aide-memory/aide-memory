#!/bin/bash
# PreToolUse:Read hook shim.
# Logic lives in the bundled CLI at dist/cli/aide-memory.js — `hook pre-read`.
PKG_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
exec node "$PKG_ROOT/dist/cli/aide-memory.js" hook pre-read
