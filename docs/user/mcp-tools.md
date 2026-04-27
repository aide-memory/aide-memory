# MCP Tools Reference

AIDE Memory exposes 7 MCP tools. These are called by your AI coding agent (Claude Code, Cursor, etc.) during conversations. You do not call these directly -- the agent does.

The MCP server runs over stdio and is registered in your editor's MCP configuration.

---

## aide_recall

Retrieve context for an area of the codebase before planning or making changes.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `paths` | string[] | no | -- | File or directory paths you are working in. Returns memories scoped to these areas plus project-wide context. |
| `query` | string | no | -- | Optional text to boost relevant results (e.g., "skeleton loading"). |
| `layers` | string[] | no | all | Filter to specific layers: `preferences`, `technical`, `area_context`, `guidelines`. |
| `contributor` | string | no | -- | Filter to a specific contributor. |
| `limit` | number | no | 20 | Max memories to return. |

**Example call:**
```json
{
  "tool": "aide_recall",
  "arguments": {
    "paths": ["src/components/dashboard/"],
    "query": "skeleton loading"
  }
}
```

**Example response:**
```
## Area Context
- Dashboard uses skeleton loading, not spinners (from ahmed) [src/components/dashboard/**]
  _Why: Decided in sprint 3 planning_

## Technical Context
- Project uses React 18 with Suspense boundaries

## Guidelines
- All components must have loading states
```

**When no memories exist:**
```
No memories found for this area. As you work and make decisions, use aide_remember to store context that should persist.
```

**When to use:** Before starting work in a code area, before proposing plans, after context compaction, or when the PreToolUse hook nudges that memories exist.

---

## aide_remember

Store knowledge that should persist beyond this conversation.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `what` | string | yes [^remember-what] | -- | The specific knowledge to remember. |
| `content` | string | yes [^remember-what] | -- | Alias for `what`. Either field is accepted; provided because LLMs frequently reach for `content` first (matches OpenAI/Anthropic tool-call conventions). If both are passed, `what` wins. |
| `layer` | enum | yes | -- | `preferences`, `technical`, `area_context`, or `guidelines`. |
| `scope` | string | no | project-wide | Glob pattern for the code area (e.g., `src/components/dashboard/**`). |
| `why` | string | no | -- | Context for why this is worth remembering. |
| `context_label` | string | no | -- | Feature grouping label (e.g., "dashboard skeleton loading"). |
| `contributor` | string | no | -- | Who this knowledge came from. |
| `tags` | string[] | no | -- | Tags for categorization. |
| `source` | enum | no | `conversation` | How captured: `conversation`, `import`, `agent_discovery`, `elevated`, `hook`. |
| `shared` | boolean | no | `memories.defaultShared` (default `true`) | Whether the memory is shared (committed to git) or personal (gitignored). Only affects `preferences` layer. When omitted, the project-level config key `memories.defaultShared` decides; flip with `aide-memory config memories.defaultShared false`. |
| `priority` | enum | no | `normal` | `always` = auto-injected at session start. `normal` = standard recall. |

[^remember-what]: Exactly one of `what` or `content` must be provided. Both fields point at the same underlying memory text — see `src/memory/server.ts:152-153` for the alias resolution.

**Example call:**
```json
{
  "tool": "aide_remember",
  "arguments": {
    "what": "Dashboard uses skeleton loading, not spinners",
    "layer": "area_context",
    "scope": "src/components/dashboard/**",
    "why": "Decided in sprint 3 planning",
    "contributor": "ahmed"
  }
}
```

**Example response:**
```
Stored: "Dashboard uses skeleton loading, not spinners" as area_context [src/components/dashboard/**] (id: 12, uuid: a1b2c3d4-...)
```

**When to use:** After corrections, decisions, non-obvious discoveries, or when the Stop/UserPromptSubmit hook prompts.

---

## aide_update

Update an existing memory's content, scope, or context.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `id` | number | yes | -- | ID of the memory to update. |
| `what` | string | no | -- | Updated knowledge text. |
| `content` | string | no | -- | Alias for `what`. Either field is accepted; provided because LLMs frequently reach for `content` first. If both are passed, `what` wins. See `src/memory/server.ts:197-198`. |
| `why` | string | no | -- | Updated context. |
| `scope` | string | no | -- | Updated scope pattern. |
| `context_label` | string | no | -- | Updated feature label. |
| `priority` | enum | no | -- | Update priority: `always` or `normal`. |

**Example call:**
```json
{
  "tool": "aide_update",
  "arguments": {
    "id": 12,
    "what": "Dashboard uses skeleton loading with 200ms delay threshold",
    "scope": "src/components/dashboard/**"
  }
}
```

**Example response:**
```
Updated memory 12: "Dashboard uses skeleton loading with 200ms delay threshold" [src/components/dashboard/**]
```

**Error responses:**
- `Memory 99 not found.`
- `No changes provided. Current memory: ...`

**When to use:** When a convention has evolved, code has moved (scope change), or context needs correction.

---

## aide_forget

Permanently delete a memory.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | number | yes | The memory ID to delete. |

**Example call:**
```json
{
  "tool": "aide_forget",
  "arguments": { "id": 12 }
}
```

**Example response:**
```
Deleted: "Dashboard uses skeleton loading" (id: 12)
```

**Error response:** `Memory 99 not found.`

**When to use:** Information is wrong, decision was reversed, or duplicate memories exist. Deletion is permanent -- there is no archive.

---

## aide_search

Search memories by keyword. Uses FTS5 BM25 ranking when available, otherwise falls back to case-insensitive substring matching on the `what` and `why` fields.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `keyword` | string | yes | -- | Text to search for (case-insensitive). |
| `layer` | enum | no | all | Filter to a specific layer. |
| `limit` | number | no | 50 | Max results. |

**Example call:**
```json
{
  "tool": "aide_search",
  "arguments": {
    "keyword": "authentication",
    "layer": "technical"
  }
}
```

**Example response:**
```
Found 2 matching "authentication":

## Technical Context
- [5] Project uses JWT with RS256 signing
  _Why: Required by security audit_
- [14] Auth middleware validates tokens on every request [src/middleware/**]
```

**Error response:** `No memories found matching "foo".`

**When to use:** When looking for specific stored knowledge, e.g., "what do we know about testing?" or "any memories about the payment flow?"

---

## aide_memories

List stored memories for transparency and management.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `layer` | enum | no | all | Filter by layer. |
| `scope` | string | no | all | Filter by exact scope. |
| `contributor` | string | no | all | Filter by contributor. |
| `limit` | number | no | 50 | Max results. |

**Example call:**
```json
{
  "tool": "aide_memories",
  "arguments": { "layer": "preferences", "contributor": "ahmed" }
}
```

**Example response:**
```
Showing 3 of 45 memories:

[8] preferences | Prefers composition over inheritance (ahmed) | recalled 5x
[9] preferences | Always use named exports, never default exports (ahmed) [src/**] | recalled 3x
[15] preferences | Prefers explicit error messages over generic ones (ahmed) | recalled 1x
```

**Error response:** `No memories found.`

**When to use:** To see what context is available, audit stored knowledge, or find memory IDs for update/delete operations.

---

## aide_import

Import guidelines or technical context from a markdown document. Each bullet point, numbered item, or paragraph (>20 chars) becomes a separate memory.

**Parameters:**

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `content` | string | yes | -- | The markdown content to import. |
| `layer` | enum | yes | -- | Which layer to import into. |
| `scope` | string | no | project-wide | Scope for all imported memories. |
| `context_label` | string | no | -- | Label for the import batch. |

**Example call:**
```json
{
  "tool": "aide_import",
  "arguments": {
    "content": "# Testing Guidelines\n- Always mock external API calls\n- Use factories for test data, never raw objects\n- Integration tests go in __tests__/integration/",
    "layer": "guidelines",
    "context_label": "testing guidelines"
  }
}
```

**Example response:**
```
Imported 3 memories as guidelines:
- [20] Always mock external API calls
- [21] Use factories for test data, never raw objects
- [22] Integration tests go in __tests__/integration/
```

**Error response:** `No importable items found in the content.`

**When to use:** To seed knowledge from existing documentation like `TESTING_GUIDELINES.md`, `ARCHITECTURE.md`, or `CONTRIBUTING.md`. Headings, code blocks, and table rows are skipped -- only bullet points, numbered items, and paragraphs are imported.
