#!/usr/bin/env bash
# Smoke test: aide_search semantic backend works end-to-end.
#
# Pins the production path: store.add stores embeddings under memory.uuid,
# searchWithEmbeddings retrieves them via getByUuid, semantic results
# include the right memory. Bug found 2026-04-28 (semantic key was
# String(memory.id), wrong key for getByUuid lookup) is regression-tested
# at unit-test level via mocks; this smoke exercises the real backend.
#
# Behavior:
#   - SKIP cleanly if neither Ollama (http://localhost:11434) nor an
#     installed @huggingface/transformers package is available. Smoke
#     returns 0 with a clear "SKIP, infra unavailable" message.
#   - PASS if a real backend produces non-keyword semantic matches that
#     resolve through getByUuid to the correct memory.
#   - FAIL if backends are present but the lookup chain breaks.

set -u
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
PROBE="$ROOT/scripts/dev/verify-semantic-search.ts"

if [[ ! -f "$PROBE" ]]; then
  echo "FAIL: $PROBE missing"
  exit 1
fi

# Cheap availability probe before we spin up ts-node + libsql.
HAS_OLLAMA=0
HAS_TRANSFORMERS=0

if curl -sf -m 2 http://localhost:11434/api/tags >/dev/null 2>&1; then
  HAS_OLLAMA=1
fi

if [[ -f "$ROOT/node_modules/@huggingface/transformers/package.json" ]]; then
  HAS_TRANSFORMERS=1
fi

if [[ "$HAS_OLLAMA" -eq 0 && "$HAS_TRANSFORMERS" -eq 0 ]]; then
  echo "SKIP semantic-search.smoke: neither Ollama (port 11434) nor @huggingface/transformers available."
  echo "      install @huggingface/transformers OR run Ollama with an embedding model"
  echo "      (e.g. \`ollama pull nomic-embed-text\`) to exercise this smoke."
  exit 0
fi

echo "running semantic search probe via $PROBE"
cd "$ROOT"
OUT=$(npx ts-node "$PROBE" 2>&1)
RC=$?

# The probe prints a final VERDICT line. Surface it + propagate exit code.
echo "$OUT" | tail -20
if [[ "$RC" -eq 0 ]]; then
  echo "PASS semantic-search.smoke"
  exit 0
fi

echo "FAIL semantic-search.smoke (exit $RC)"
exit "$RC"
