# Architecture

How AIDE Memory works internally. This document is for contributors and anyone who wants to understand the system design.

## Storage: file-per-memory + SQLite cache

Each memory is stored as a single JSON file under `.aide/memories/`:

```
.aide/memories/
  preferences/
    personal/     ← gitignored, per-developer
      <uuid>.json
    shared/       ← committed, team-shared
      <uuid>.json
  technical/
    <uuid>.json
  area_context/
    <uuid>.json
  guidelines/
    <uuid>.json
```

**JSON files are the source of truth.** SQLite is a rebuildable cache that provides indexing, FTS5 search, and recall statistics.

### Why file-per-memory?

- Git is the sync mechanism. Each file can be merged, diffed, and reviewed in PRs.
- Deletion is simple: remove the file. No status field, no soft deletes.
- Personal preferences (gitignored) stay local. Shared memories travel with the repo.
- SQLite cache can be rebuilt from files at any time (`aide-memory sync import`).

### JSON file format (MemoryFile)

```json
{
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "layer": "area_context",
  "what": "Dashboard uses skeleton loading, not spinners",
  "why": "Decided in sprint 3 planning",
  "scope": "src/components/dashboard/**",
  "context_label": "dashboard loading",
  "contributor": "ahmed",
  "tags": ["ui", "loading"],
  "source": "conversation",
  "shared": true,
  "generated_by": { "tool": "claude-code", "model": null, "author_type": "ai" },
  "derived_from": null,
  "created_at": "2026-04-06T12:00:00.000Z",
  "updated_at": "2026-04-06T12:00:00.000Z"
}
```

### SQLite cache fields (not in JSON)

The SQLite table adds three fields that only make sense as local state:

| Field | Description |
|-------|-------------|
| `id` | Auto-increment row ID (not stable across cache rebuilds) |
| `recalled_count` | How many times this memory has been recalled |
| `last_recalled_at` | Timestamp of last recall |

These are preserved during sync operations but not written to JSON files.

### SQLite location

```
~/.aide/projects/<hash>/memory.db
```

The `<hash>` is the first 12 characters of the SHA-1 hash of the absolute project path. WAL journal mode is enabled for concurrent read access.

---

## Recall flow

When the agent needs context for a code area:

```
1. PreToolUse hook fires
   → "5 memories exist for src/auth/middleware.ts"

2. Agent decides to call aide_recall
   → paths: ["src/auth/middleware.ts"]

3. Recall engine runs:
   a. Load all memories from store (no status filter -- file exists = active)
   b. Filter by scope matching against provided paths
   c. If query provided, score by keyword relevance
   d. Sort by layer priority, then relevance, then scope specificity
   e. Cap at limit (default 20)
   f. Record recall for analytics

4. Results returned grouped by layer
```

### Scope matching rules

Given a memory with scope and a query path:

| Scope | Query path | Match? | Why |
|-------|-----------|--------|-----|
| `null` or `"project"` | anything | yes | Project-wide |
| `src/auth/**` | `src/auth/middleware.ts` | yes | Path under scope |
| `src/auth/**` | `src/auth/` | yes | Exact directory |
| `src/components/**` | `src/` | yes | Scope is within query (parent inheritance) |
| `src/auth/**` | `src/db/store.ts` | no | Different subtree |

Parent inheritance means querying a broad path (like `src/`) returns memories scoped to any subdirectory under it.

### Layer priority

Results are sorted by layer in this order:

1. `area_context` -- most specific, highest priority
2. `technical` -- facts about the stack
3. `preferences` -- how someone likes to work
4. `guidelines` -- team-wide principles

Within the same layer, memories are ranked by:
1. Keyword relevance (if a query was provided)
2. Scope specificity (deeper scopes rank higher)

---

## Search pipeline

Search uses a three-tier fallback:

```
1. FTS5 (BM25 ranking)
   ↓ if unavailable or 0 results
2. LIKE matching (case-insensitive substring on what/why)
   ↓ if < 3 results and embeddings available
3. Semantic embedding search (cosine similarity)
```

**FTS5:** Full-text search using SQLite's FTS5 extension with BM25 ranking. Queries are escaped and tokenized. Index covers `what` and `why` fields.

**LIKE fallback:** Simple `WHERE what LIKE '%keyword%' OR why LIKE '%keyword%'`. Always available, no extensions needed.

**Semantic search (optional):** If an `EmbeddingService` is attached and fewer than 3 results are found, the system generates an embedding for the query and finds similar memories by cosine similarity. Results with score below 0.3 are discarded.

---

## Sync: git IS the sync

There is no separate sync service. Git handles distribution of memory files:

1. `aide-memory init` creates `.aide/memories/` directory structure
2. Shared memories are committed to git like any other file
3. Personal preferences (`.aide/memories/preferences/personal/`) are gitignored
4. The SQLite cache (`.aide/cache/`) is gitignored
5. The `post-checkout` hook rebuilds the cache after branch switches

### Sync operations

| Command | Direction | Description |
|---------|----------|-------------|
| `aide-memory sync import` | JSON -> SQLite | Full rebuild. Read all JSON files, reconcile with cache. |
| `aide-memory sync export` | SQLite -> JSON | Fill gaps. Create JSON files for any SQLite-only memories. |
| post-checkout hook | JSON -> SQLite | Incremental. Only process changed files after branch switch. |

### Conflict resolution

When JSON files and SQLite disagree, the system compares `updated_at` timestamps. The newer version always wins. Conflicts are logged but never block operations.

---

## No status field

The original design included an `active`/`archived` status field. This was removed. The rule is simpler:

- **File exists = active.** The memory is live and will be recalled.
- **File deleted = gone.** The memory no longer exists.

`aide_forget` deletes the JSON file and removes the SQLite row. There is no archive, no soft delete, no status transitions.

---

## Memory layers

| Layer | Purpose | Scope | Committed |
|-------|---------|-------|-----------|
| `preferences` | How someone likes to work | Per-contributor | shared/ yes, personal/ no |
| `technical` | Facts about the stack | Project-wide or scoped | yes |
| `area_context` | Decisions for specific code areas | Always scoped | yes |
| `guidelines` | Team principles | Project-wide | yes |

The `preferences` layer has a special directory split: `shared/` (team-visible, committed) and `personal/` (gitignored, local-only). The `shared` boolean on the memory controls which directory the file goes to.

---

## Analytics

The `analytics` SQLite table tracks events (recalls, stores, searches) with timestamps. The `aide-memory stats` command aggregates:

- Total memory count
- Count by layer
- Top 5 most-recalled memories
- Breakdown by source (conversation, hook, agent_discovery, import)
- Stale count (0 recalls, created >30 days ago)

Analytics data lives only in the SQLite cache and is not exported to JSON files.
