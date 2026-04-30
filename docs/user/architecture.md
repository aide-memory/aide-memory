# Architecture

**Canonical version: https://aide-memory.dev/docs/architecture**

Storage shape: file-per-memory JSON files under `.aide/memories/<layer>/` are the source of truth; SQLite at `~/.aide/projects/<hash>/memory.db` is a rebuildable cache (FTS5 search, recall stats, scope-matching index).

Recall flow:
1. PreToolUse hook fires with memory count for the path
2. Agent calls `aide_recall({paths: [...]})`
3. Recall engine filters by scope match, scores by query relevance, sorts by layer priority, caps at `recall.limit` (default 20)

Search pipeline (three-tier fallback): FTS5 BM25 → LIKE substring → semantic embeddings (cosine similarity, score threshold 0.3) when an embedding backend is installed.

Sync: git is the sync layer. `post-checkout` hook rebuilds the SQLite cache after branch switches. Hook installation walks up to find `.git/` (so monorepo subdirectories work), and stops if it crosses into a different project's `.aide/` directory. Conflicts resolve by `updated_at` (newer wins).

For the full design, layer priorities, scope-matching rules, conflict-resolution mechanics, and analytics surface, see [aide-memory.dev/docs/architecture](https://aide-memory.dev/docs/architecture).
