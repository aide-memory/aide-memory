# Show HN: AIDE Memory -- Persistent memory for AI coding agents

AI coding agents forget everything between sessions. You correct them, they adjust, you close the session, and next time they start from zero. Every existing memory tool either dumps all memories into the system prompt (~2,000 tokens wasted per interaction) or relies on the agent voluntarily saving context (we tested this -- 0% adoption rate, confirmed by the agent itself in engram's issue tracker).

AIDE Memory uses hooks instead. Four hooks fire at the right moments: before file reads (count-only nudge, ~20 tokens), on task completion (reflection prompt), on user corrections (pattern detection), and before context compaction (extract decisions before they are lost). The agent never needs to "decide" to save -- the hooks handle it. Tested adoption: 0% voluntary to 100% hook-driven.

Architecture: one JSON file per memory in `.aide/memories/<layer>/`, committed to git. No separate sync -- git IS the sync. Local SQLite is a cache index that rebuilds from the JSON files. No Docker, no Chroma, no API keys, no cloud dependency. Four structured layers (preferences, technical, area context, guidelines) with path-scoped recall using glob inheritance. BM25 search via FTS5, optional local embeddings.

Install: `npx aide-memory init`. Two minutes. Creates directory structure, installs hooks, writes editor rules, configures MCP server. Works with Claude Code and Cursor today.

This is NOT another RAG tool or vector database wrapper. It is a file-based memory layer that lives in your repo. Memories are human-readable JSON, browsable in any editor, diffable in PRs.

544 tests passing. Built in TypeScript. Open source.

Tradeoffs: Phase 1 is individual memory only (your agent remembers you). Team context sharing (Dev A's knowledge available to Dev B's agent) is the real thesis but not shipped yet. Path scoping works well for monorepos but adds complexity over flat stores. Hooks are Claude Code / Cursor specific right now -- other tools need MCP support.

GitHub: https://github.com/aide-memory/aide-memory
