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

## config

Get or set configuration using dot-notation keys.

```
aide-memory config <key> [value]
```

**Arguments:**

| Argument | Type | Description |
|----------|------|-------------|
| `key` | string, required | Configuration key in dot-notation |
| `value` | string, optional | Value to set (omit to read current value) |

**Examples:**

```bash
# Read a value
aide-memory config capture.enabled
# Output: true

# Set a value
aide-memory config capture.enabled false
# Output: Set capture.enabled = false

# Read nested value
aide-memory config capture.hooks.preToolUse
# Output: true

# Disable telemetry
aide-memory config telemetry.enabled false
```

Values are auto-parsed: `true`/`false` become booleans, numbers become numbers, everything else stays a string.

**Error:** If key is not set: `(not set)`

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
