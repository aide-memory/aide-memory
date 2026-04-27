# CLI Reference

All commands use the `aide-memory` binary (aliased as `aide`).

```
aide-memory <command> [arguments] [flags]
```

---

## init

Initialize a new `.aide/` project directory.

```
aide-memory init [flags]
```

**Flags:**

| Flag | Description |
|------|-------------|
| `--scan` | Run pre-train scan to generate initial memories from project files |
| `--update-rules` | Only refresh rules files (idempotent, always overwrites) |
| `--force` | Overwrite existing files |

**Examples:**

```bash
# Standard init
aide-memory init

# Init with pre-train scan
aide-memory init --scan

# Refresh rules files only (safe to re-run)
aide-memory init --update-rules
```

**Output:**
```
Project initialized for aide-memory.

Created:
  + .aide
  + .aide/memories
  + .aide/memories/preferences
  + .aide/config.json
  + .claude/rules/aide-memory.md
  + .cursor/rules/aide-memory.mdc
  + .git/hooks/post-checkout
  + .gitignore entry: .aide/memories/preferences/personal/
  + .gitignore entry: .aide/cache/

Generated 18 memories from pre-train scan.
```

**Error:** If run again without `--force`, existing files are skipped.

---

## recall

Recall memories scoped to a file or directory path.

```
aide-memory recall <path>
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `path` | string, required | File or directory path to recall context for |

**Example:**

```bash
aide-memory recall src/auth/
```

**Output:**
```
Recalled 4 memories for "src/auth/":

## Area Context
  [12] Auth tokens expire after 24 hours, refresh tokens after 30 days [src/auth/**]

## Technical Context
  [5] Project uses JWT with RS256 signing

## Preferences
  [8] Prefers explicit error messages over generic "unauthorized" (from ahmed)

## Guidelines
  [1] All API responses use camelCase keys
```

**Error:** `No .aide/ directory found. Run aide-memory init first.`

---

## remember

Store a new memory.

```
aide-memory remember <what> --layer <layer> [flags]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `what` | string, required | The knowledge to remember |

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--layer` | string, required | -- | Memory layer: `preferences`, `technical`, `area_context`, `guidelines` |
| `--scope` | string | project-wide | Glob pattern for the code area (e.g., `src/components/**`) |
| `--tags` | string | -- | Comma-separated tags / context label |
| `--why` | string | -- | Context for why this is worth remembering |
| `--contributor` | string | git user.name | Who this knowledge came from |

**Examples:**

```bash
# Project-wide guideline
aide-memory remember "All API responses use camelCase keys" --layer guidelines

# Scoped technical fact
aide-memory remember "SQLite WAL mode required for concurrent access" \
  --layer technical \
  --scope "src/db/**" \
  --why "Without WAL, concurrent reads block writes"

# Preference with contributor
aide-memory remember "Prefers composition over inheritance" \
  --layer preferences \
  --contributor "ahmed"
```

**Output:**
```
Stored memory (id: 3):
  Layer: technical
  What:  SQLite WAL mode required for concurrent access
  Scope: src/db/**
  Why:   Without WAL, concurrent reads block writes
```

**Error:** `Invalid layer "foo". Must be one of: preferences, technical, area_context, guidelines`

---

## update

Update an existing memory.

```
aide-memory update <id> [flags]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `id` | number, required | Memory ID to update |

**Flags:**

| Flag | Type | Description |
|------|------|-------------|
| `--what` | string | New content |
| `--why` | string | New reason |
| `--scope` | string | New scope |
| `--tags` | string | New tags / context label |

**Example:**

```bash
aide-memory update 3 --what "SQLite WAL mode is mandatory" --scope "src/memory/**"
```

**Output:**
```
Updated memory (id: 3):
  Layer: technical
  What:  SQLite WAL mode is mandatory
  Scope: src/memory/**
```

**Errors:**
- `Invalid memory ID: "abc". Must be a number.`
- `Memory 99 not found.`
- `No changes specified. Use --what, --why, --scope, or --tags.`

---

## forget

Permanently delete a memory.

```
aide-memory forget <id>
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `id` | number, required | Memory ID to delete |

**Example:**

```bash
aide-memory forget 3
```

**Output:**
```
Deleted memory 3: "SQLite WAL mode is mandatory"
```

**Errors:**
- `Invalid memory ID: "abc". Must be a number.`
- `Memory 99 not found.`

---

## search

Search memories by keyword. Uses FTS5 (BM25 ranking) when available, falls back to case-insensitive LIKE matching.

```
aide-memory search <query> [flags]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `query` | string, required | Text to search for |

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--layer` | string | all | Filter by layer |
| `--limit` | number | 50 | Maximum results |

**Example:**

```bash
aide-memory search "authentication"
```

**Output:**
```
Found 3 matching "authentication":

  Area Context
  [12] Auth tokens expire after 24 hours [src/auth/**]
      Why: Security policy set in sprint 3 planning

  Technical Context
  [5] Project uses JWT with RS256 signing
```

```bash
aide-memory search "testing" --layer guidelines --limit 10
```

**Error:** `No memories found matching "foo".`

---

## list

List memories with optional filters.

```
aide-memory list [flags]
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--layer` | string | all | Filter by layer |
| `--scope` | string | all | Filter by exact scope |
| `--contributor` | string | all | Filter by contributor |
| `--limit` | number | all | Maximum results |
| `--tag` | string | all | Filter by tag / context label |

**Examples:**

```bash
# List all memories
aide-memory list

# Filter by layer
aide-memory list --layer preferences

# Filter by contributor
aide-memory list --contributor ahmed

# Combine filters
aide-memory list --layer area_context --scope "src/auth/**"
```

**Output:**
```
Showing 12 of 45 memories:

  [1] API responses must use camelCase keys | recalled 8x
  [2] Dashboard uses skeleton loading [src/components/dashboard/**] (from ahmed) | recalled 3x
  [5] Project uses JWT with RS256 signing | recalled 12x
```

---

## stats

Show memory analytics summary.

```
aide-memory stats
```

**Output:**
```
Memory Statistics

  Total memories: 45

  By Layer:
    Preferences: 8
    Technical Context: 15
    Area Context: 18
    Guidelines: 4

  Most Recalled:
    [5] Project uses JWT with RS256 signing (12x)
    [1] API responses must use camelCase keys (8x)
    [12] Auth tokens expire after 24 hours (5x)

  By Source:
    conversation: 20
    hook: 12
    agent_discovery: 8
    import: 5
```

---

## recall-log

Tail the recall-log to see recent recall events. Useful for debugging what the agent fetched and when.

```
aide-memory recall-log [flags]
```

**Flags:**

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--limit` | number | 20 | Max log entries to show, most recent first |
| `--since` | string | -- | ISO timestamp; only show entries after this point |

**Example:**

```bash
aide-memory recall-log --limit 50
```

**Output:**
```
[2026-04-27T14:21:08Z] aide_recall paths=[src/api/routes.ts] returned 4 memories
[2026-04-27T14:21:53Z] aide_recall paths=[src/auth/middleware.ts] returned 7 memories
[2026-04-27T14:22:11Z] aide_search keyword="token" returned 3 memories
```

The recall-log is written by the MCP server alongside `memory.db` for diagnostic purposes. Safe to delete; recreated on the next recall event.

---

## config

Get or set configuration using dot-notation keys.

```
aide-memory config <key> [value]
```

**Scope:** Configuration is **per-project**. Values live in
`<project>/.aide/config.json`, next to the project's memories. A global
user config (`~/.aide/config.json`) is planned for Phase 2 so preferences
can persist across projects — for now every project carries its own
overrides.

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `key` | string, required | Configuration key in dot-notation |
| `value` | string, optional | Value to set (omit to read current value) |

**Key validation:** Unknown keys are rejected with a list of valid keys
and (if possible) near-matching suggestions. The full set of keys comes
from two sources:

- Hook/recall/injection knobs — see `scripts/hooks/defaults.json` (19 keys
  covering hook behavior, recall, scope-matching, SessionStart injection,
  and memory-storage visibility).
- Integration schema: `contributor` (default `"auto"`, override with a
  team handle), `embeddings.backend` / `embeddings.model`
  (auto / transformers / ollama / none), `tags.presets`,
  `memories.defaultShared` (default `true`, controls per-preferences
  shared-vs-personal default), `updates.check`, `version`. (The legacy
  `telemetry.enabled` key only gates the local-only analytics writer —
  PostHog opt-in is via the `AIDE_TELEMETRY` env var, default off.)

**Removed in 0.4.3:** `capture.*` family (5 keys) + `nudge.visible` were
listed as valid but had no runtime effect. They're rejected now. See
`docs/user/configuration.md` for equivalent `hooks.*` replacements.

Every public setting is seeded into `.aide/config.json` on `aide-memory init`
and on MCP-server auto-update, so you can `cat .aide/config.json` to see
every knob and its default.

**When do changes take effect?**

| How the change was made | When it applies |
|---|---|
| `aide-memory config KEY VALUE` (this command) | Immediately. The command also syncs any derived files on disk (e.g. `.ignore` when you toggle `memories.hideFromGrep`). |
| Direct edit of `.aide/config.json` (any text editor) | Picked up on the next hook fire in any running Claude Code session (file read, edit, user prompt, etc.). No restart required. If you want instant propagation across all running sessions, reconnect the MCP server (`/mcp` → reconnect in Claude Code) — that also reruns the drift-repair check. |
| New Claude Code session | `autoUpdateIfNeeded` runs on MCP startup and applies any pending setting-derived changes before the agent sees its first prompt. |

**Tip:** when in doubt after a settings change, run `/mcp` in your Claude
Code session and pick reconnect — it guarantees the MCP server and all
derived files (`.ignore`, etc.) are in sync with `.aide/config.json`.

**Examples:**

```bash
# Read a value
aide-memory config memories.defaultShared
# Output: true

# Set a boolean — flip new preferences to default to personal/private
aide-memory config memories.defaultShared false
# Output: Set memories.defaultShared = false

# Read a nested value
aide-memory config hooks.read.maxBlocks
# Output: 1

# Disable the correction-detection nudge
aide-memory config hooks.correction.enabled false

# Set a JSON array value (e.g. custom Stop-hook schedule)
aide-memory config hooks.stop.schedule '[{"every":5}]'

# Hide aide-memory's own systemMessage lines (hooks still function, agent behavior unchanged)
aide-memory config hooks.visible false

# Override contributor (default 'auto' uses git user.name)
aide-memory config contributor "TeamBot"

# Restore pre-0.4.3 narrow scope-matching behavior
aide-memory config recall.minScopeDepth 1
```

**Note on `memories.defaultShared`:** controls the default `shared` value for new `preferences` memories when the agent doesn't pass one. `true` (default) writes to `preferences/shared/` (committed); `false` writes to `preferences/personal/` (gitignored). Per-call `shared: true|false` always overrides this default.

Values are auto-parsed: `true`/`false` become booleans, integers and
floats become numbers, JSON objects and arrays (`{...}` / `[...]`) are
parsed as JSON, and everything else stays a string.

**Errors:**

- `Unknown config key: "..."` — the key wasn't in defaults.json or the
  legacy AideConfig schema. The error lists suggestions and the full
  key set. Exits non-zero.
- `(not set)` — the key is valid but you haven't assigned a value yet;
  reads fall back to the default from `scripts/hooks/defaults.json`.

---

## sync import

Rebuild the SQLite cache from JSON memory files.

```
aide-memory sync import
```

**Example:**

```bash
aide-memory sync import
```

**Output:**
```
Import complete: 5 imported, 2 updated, 1 removed.
```

Or if nothing changed:
```
Import: everything up to date.
```

Conflicts (local SQLite has newer data than the JSON file) are logged:
```
  Conflict: memory abc-123 has local edits newer than incoming file. Keeping newer version.
```

---

## sync export

Ensure all memories in SQLite have corresponding JSON files. Never overwrites existing files.

```
aide-memory sync export
```

**Output:**
```
Export complete: 3 exported.
```

---

## migrate

Migrate from the legacy `memory.db` format.

```
aide-memory migrate
```

**Status:** Not yet implemented. Placeholder for future migration from the old single-database format to the current file-per-memory architecture.

## cleanup

Remove stale session tracking files from `.aide/cache/`.

Each Claude Code session creates small tracking files (`recalled-paths-{session_id}.txt`, `searched-queries-*`, `correction-pending-*`) to manage in-session state. These are normally cleared by PreCompact and SessionStart, but crashed or abnormally-exited sessions leave orphaned files. This command removes them.

```
aide-memory cleanup
```

By default removes files older than 7 days.

**Options:**

- `--older-than <duration>` — TTL threshold. Formats: `7d`, `24h`, `30m`, `60s`. Default: `7d`.
- `--all` — Remove all tracking files regardless of age. Use with care: may affect concurrent sessions.
- `--dry-run` — Show which files would be deleted without actually deleting.

**Examples:**

```bash
aide-memory cleanup                      # Remove files older than 7 days (default)
aide-memory cleanup --older-than 24h     # Remove files older than 24 hours
aide-memory cleanup --dry-run            # Preview what would be deleted
aide-memory cleanup --all                # Remove all tracking files
```

**Note:** Removing an active session's tracking file is not destructive — the session will simply re-block on the next read and re-populate tracking via aide_recall. No memory data is lost.
