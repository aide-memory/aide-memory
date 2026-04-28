# Concepts

**Canonical version: https://aide-memory.dev/docs/concepts**

aide-memory keeps structured knowledge about your project in a local store and feeds the right bits to the agent at the right moments via editor hooks and MCP tools.

Quick mental model:

- **Memories** are JSON files under `.aide/memories/<layer>/`
- **Four layers**: `preferences`, `technical`, `area_context`, `guidelines`
- **Scopes** are glob patterns (`src/auth/**`, `packages/api/**`) with inheritance
- **Hooks** capture context automatically at six lifecycle events
- **Seven MCP tools** let the agent recall, store, update, search, list, import, and forget memories
- **Git is the sync layer** for shared memories; personal preferences are gitignored

For the full mental model with examples, see [aide-memory.dev/docs/concepts](https://aide-memory.dev/docs/concepts).
