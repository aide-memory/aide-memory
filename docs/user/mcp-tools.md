# MCP Tools

**Canonical version: https://aide-memory.dev/docs/mcp-tools**

aide-memory exposes 7 MCP tools (called by the agent, not directly):

| Tool | Purpose |
|---|---|
| `aide_recall` | Path-scoped memory retrieval with glob inheritance |
| `aide_remember` | Store a new memory (layer + scope + what/why + tags) |
| `aide_update` | Edit an existing memory's content, scope, or tags |
| `aide_forget` | Permanently delete a memory |
| `aide_search` | FTS5 keyword search with BM25 ranking; optional semantic supplement |
| `aide_memories` | List memories with layer, scope, contributor, tag filters |
| `aide_import` | Bulk-import from markdown bullet/numbered lists |

For each tool's parameters, examples, and error responses, see [aide-memory.dev/docs/mcp-tools](https://aide-memory.dev/docs/mcp-tools).
