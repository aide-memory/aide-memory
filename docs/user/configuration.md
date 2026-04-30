# Configuration

**Canonical version: https://aide-memory.dev/docs/configuration**

aide-memory is configured via `.aide/config.json` and `aide-memory config <key> [value]`. Common keys:

- `hooks.read.maxBlocks` / `hooks.edit.maxBlocks`, max hard-blocks per session (default `1`, `0` to disable)
- `hooks.search.mode`, `"off" | "soft" | "block"` for the Grep nudge
- `hooks.correction.enabled`, detect "no, use X instead" patterns
- `hooks.precompact.mode`, `"cleanup"` clears tracking on `/compact`, `"off"` preserves it
- `hooks.stop.schedule`, phased reflection nudge cadence
- `hooks.visible`, show/hide `aide-memory · ...` lines in your terminal
- `recall.minScopeDepth`, scope-breadth dial; `1` permissive (default), `2`+ stricter
- `injection.preferences` / `injection.guidelines` / `injection.maxChars`, SessionStart budgets
- `memories.softening.threshold`, hard-blocks become soft below this total-memory count (default `10`)
- `memories.defaultShared`, default `shared` value for new `preferences` memories
- `embeddings.backend` / `embeddings.model`, semantic-search backend (`auto` / `transformers` / `ollama` / `none`)
- `contributor`, default `"auto"` reads `git config user.name`

Telemetry is on by default. To turn it off: `AIDE_TELEMETRY=off` or `aide-memory config telemetry.enabled false`. Only event types and machine-anonymous counts are sent (event name, hash of `hostname:username` for deduplication, platform, arch, Node version). Code, memory content, file paths, query strings, and the sender IP are never transmitted.

For the full schema, visualized walkthroughs, and per-key examples, see [aide-memory.dev/docs/configuration](https://aide-memory.dev/docs/configuration).
