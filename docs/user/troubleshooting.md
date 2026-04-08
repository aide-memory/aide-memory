# Troubleshooting

Common issues and how to resolve them.

---

## "No .aide/ directory found"

**Symptom:** Any CLI command fails with:
```
No .aide/ directory found. Run `aide-memory init` first.
```

**Cause:** You are running a command in a directory that has not been initialized, or you are in a subdirectory and the CLI cannot find `.aide/` by walking up.

**Fix:** Run `aide-memory init` from your project root:
```bash
cd /path/to/your/project
aide-memory init
```

The CLI walks up from the current directory looking for `.aide/`. If your project root is above the current directory, the command should still work. If it does not, run from the actual project root.

---

## Hooks not firing

**Symptom:** The agent never calls `aide_recall` before reading files, or never reflects on task completion.

**Possible causes:**

1. **Hooks disabled in config.** Check:
   ```bash
   aide-memory config capture.enabled
   aide-memory config capture.hooks.preToolUse
   aide-memory config capture.hooks.stop
   ```
   All should return `true`.

2. **MCP server not configured in your editor.** Ensure the MCP server is registered. For Claude Code, check your `mcp_servers` configuration. For Cursor, check your MCP settings.

3. **Rules file missing or outdated.** Regenerate:
   ```bash
   aide-memory init --update-rules
   ```

4. **Build is stale.** The `recall-for-path.js` hook requires compiled output in `dist/`. If you are developing locally:
   ```bash
   npm run build
   ```

---

## Search returns nothing

**Symptom:** `aide-memory search "keyword"` returns `No memories found matching "keyword"`.

**Possible causes:**

1. **No memories stored yet.** Check:
   ```bash
   aide-memory stats
   ```
   If total is 0, you need to store some memories first.

2. **Keyword mismatch.** Search checks `what` and `why` fields. Try broader terms or partial words.

3. **FTS5 not available.** FTS5 search falls back to LIKE matching when the SQLite extension is not available. LIKE matching is case-insensitive but requires substring matches.

4. **SQLite cache out of sync.** Rebuild:
   ```bash
   aide-memory sync import
   ```

---

## Memories not persisting across sessions

**Symptom:** Memories stored in one session are not available in the next.

**Possible causes:**

1. **JSON files not being written.** Check that `.aide/memories/` contains JSON files:
   ```bash
   ls .aide/memories/technical/
   ls .aide/memories/area_context/
   ```
   Each memory should have a `<uuid>.json` file.

2. **SQLite cache stale.** The cache may not have been rebuilt. Force a rebuild:
   ```bash
   aide-memory sync import
   ```

3. **Wrong project root.** The store uses a hash of the project root path to locate the SQLite cache. If you open the project from different paths (e.g., symlinks), the cache may differ. Stick to one canonical path.

4. **Personal preferences are gitignored.** Memories in `.aide/memories/preferences/personal/` are intentionally gitignored. They persist locally but are not shared via git. Shared preferences go in `.aide/memories/preferences/shared/`.

---

## Recall returns too many/too few results

**Symptom:** `aide recall src/auth/` returns unrelated memories or misses relevant ones.

**How scope matching works:**
- `scope: null` or `scope: "project"` matches everything (project-wide)
- `scope: "src/auth/**"` matches any path under `src/auth/`
- Parent inheritance: querying `src/` will also return memories scoped to `src/auth/**`
- Default limit is 20 memories per recall

**Fixes:**
- Use more specific paths: `aide recall src/auth/middleware.ts` instead of `aide recall src/`
- Add `--limit` via MCP: `aide_recall` accepts a `limit` parameter
- Ensure memories have appropriate scopes. Project-wide memories (no scope) always appear.

---

## Sync conflicts

**Symptom:** `aide-memory sync import` reports conflicts:
```
Conflict: memory abc-123 has local edits newer than incoming file. Keeping newer version.
```

**Cause:** The SQLite cache has a newer version of a memory than the JSON file. This happens when you edit a memory locally and then pull changes that include an older version of the same memory.

**Resolution:** Conflicts are resolved automatically -- the newer version wins (based on `updated_at` timestamp). No data is lost. If you want to force the JSON file version:
```bash
# Delete the SQLite cache and rebuild from files
rm -rf ~/.aide/projects/*/memory.db
aide-memory sync import
```

---

## Cursor integration issues

**Symptom:** Cursor does not seem to use AIDE Memory.

**Fixes:**

1. **Check rules file exists:**
   ```bash
   cat .cursor/rules/aide-memory.mdc
   ```
   If missing, regenerate: `aide-memory init --update-rules`

2. **Check MCP server is configured.** AIDE Memory runs as an MCP server. Ensure it is registered in Cursor's MCP configuration.

3. **Cursor uses different hook delivery.** Cursor uses `agent_message` for hook responses rather than `additionalContext`. The rules file template accounts for this.

---

## Update check warnings

**Symptom:** After every command, you see an update notice.

**Fix:** Update to the latest version:
```bash
npm install -g aide-memory@latest
```

Or disable update checks:
```bash
aide-memory config updates.check false
```

---

## Malformed config.json

**Symptom:** Commands behave unexpectedly, or you see:
```
[aide-config] Malformed JSON in .aide/config.json, using defaults
```

**Fix:** Delete and recreate:
```bash
rm .aide/config.json
aide-memory init
```

This creates a fresh config with defaults. Your memories are not affected.

---

## How to reset everything

If you need a clean start:

```bash
# 1. Delete the .aide directory (removes all memories and config)
rm -rf .aide/

# 2. Delete the SQLite cache
rm -rf ~/.aide/projects/

# 3. Re-initialize
aide-memory init --scan
```

This destroys all stored memories. Only do this if you want a complete fresh start.

To keep memories but reset only the cache:
```bash
# Delete just the cache, keep JSON files
rm -rf ~/.aide/projects/*/memory.db

# Rebuild cache from JSON files
aide-memory sync import
```
