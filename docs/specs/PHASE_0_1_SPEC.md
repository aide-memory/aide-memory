# Phase 0 + Phase 1 Technical Spec

> Source of truth: `docs/PRODUCT_VISION.md` (1,653 lines, Apr 2, 2026).
> Decided items NOT re-debated: storage architecture (one-file-per-memory), free/pro gating (layered soft gates), naming (AIDE Memory). See `docs/sessions/HANDOFF_APRIL2.md`.
> Created: April 6, 2026. Updated: April 6, 2026 (feedback pass — added documentation, demos, update mechanism, sync commands, agent protocol; resolved all open questions; removed status field from schema; clarified hook behavior).
>
> **Living document.** This spec is updated as implementation progresses. Agents mark checkboxes in Section 3 as work completes and add implementation notes inline.

---

## Implementation Progress

> Updated by tech lead as implementation proceeds. If session is interrupted, resume from here.

| Sprint | Status | Components | Notes |
|--------|--------|-----------|-------|
| Sprint 1 | IN PROGRESS | P1.1 Storage, P1.2 Types, P1.3 FTS5, P1.8 Rules | Agents launched |
| Sprint 2 | PENDING | P1.5 Hooks, P1.6 aide_update, P1.7 CLI, P1.9 Cursor, P1.11 Config, P1.20 Update | Blocked on Sprint 1 |
| Sprint 3 | PENDING | P1.4 Embeddings, P1.10 Sync, P1.12+P1.13 Analytics | Blocked on Sprint 1 |
| Sprint 4 | PENDING | P1.14 Init, P1.15 Scan, P1.16 Package, P1.18 Plugin | Blocked on Sprint 2-3 |
| Sprint 5 | PENDING | P1.17 Validation, P1.19 Demos, P1.21 Docs | Blocked on Sprint 4 |
| Phase 0 | MANUAL | P0.1-P0.6 Domain, Legal, Repo, npm, Landing, Docs | Requires human action |

### Manual Intervention Needed (for human)
- [ ] P0.1: Register domain (aide-memory.dev or useaide.dev) via Cloudflare Registrar
- [ ] P0.2: Trademark search (USPTO TESS for "AIDE"), EULA draft, Terms & Conditions, company registration decision
- [ ] P0.3: Create `aide-memory` public GitHub repo (docs + issues only, no source)
- [ ] P0.4: Reserve `aide-memory` on npm (`npm init --scope=aide-memory`)
- [ ] P0.5: Deploy landing page (Nextra + Vercel)
- [ ] P0.6: Set up docs site (markdown from GitHub repo)
- [ ] P1.17: Manual validation testing (run 5 scenarios across Claude Code + Cursor)
- [ ] P1.18: Submit Claude Code plugin listing, Cursor marketplace listing
- [ ] P1.19: Record demo videos/GIFs

---

## Table of Contents

1. [Component Breakdown](#1-component-breakdown)
2. [Build Order](#2-build-order)
3. [Acceptance Criteria](#3-acceptance-criteria)
4. [Testing Plan — Unit Tests](#4-testing-plan--unit-tests)
5. [Testing Plan — Integration Tests](#5-testing-plan--integration-tests)
6. [Agent Strategy](#6-agent-strategy)
7. [Branching & Commit Strategy](#7-branching--commit-strategy)
8. [Migration Plan](#8-migration-plan)
9. [Open Questions](#9-open-questions)

---

## 1. Component Breakdown

### Phase 0 — Foundation ("Ready to launch")

Phase 0 is business/legal infrastructure with no engineering dependencies. Can run fully in parallel with Phase 1 engineering work.

| ID | Component | What needs to be built | Already exists | Effort | Dependencies |
|----|-----------|----------------------|----------------|--------|-------------|
| P0.1 | Domain Registration | Register `aide-memory.dev` or `useaide.dev`. DNS setup. | Nothing | S | None |
| P0.2 | Legal | Trademark search for AIDE. Proprietary freeware EULA. Terms & Conditions for landing page/npm. Explore company registration. | Nothing | M | None (external/async) |
| P0.3 | Public GitHub Repo | `aide-memory` on GitHub. README, issue tracker, release templates. No source code. | Nothing | S | P0.2 (license text for README) |
| P0.4 | npm Package Reservation | Reserve `aide-memory` on npm. Set up publish workflow. | Nothing | S | P0.3 |
| P0.5 | Landing Page | Simple page: what it does, install command, waitlist. No Phase 2+ roadmap revealed. | Nothing | S-M | P0.1 (domain) |
| P0.6 | User Documentation | Quick start guide, CLI command reference, MCP tool reference, configuration guide. Hosted on public GitHub repo + linked from landing page. ALL aide commands and MCP tools documented with examples. | Nothing | M | P0.3 (repo to host docs) |

**Note:** PRODUCT_VISION lists basic telemetry infrastructure as a Phase 0 item. The engineering work (event tracking, telemetry transport) is in P1.12. Phase 0 telemetry is limited to: choosing a telemetry provider (PostHog recommended — self-hosted option, 1M free events/month), setting up the account, and defining the event schema. No code needed until Phase 1.

**Phase 0 total estimate:** 1-2 weeks. All items are parallelizable. P0.2 (legal) is the only long-lead item.

---

### Phase 1 — Individual Memory Engine ("My agent remembers")

#### Existing codebase (what we're building on)

| File | What it does | Tests | Status |
|------|-------------|-------|--------|
| `src/memory/store.ts` | SQLite store: CRUD, WAL mode, search (LIKE), recalled_count tracking, prune. Auto-increment integer IDs. Schema v1. 262 lines. | 20 (store.test.ts) | Working |
| `src/memory/recall.ts` | Path-scoped recall: glob matching, parent inheritance, layer priority ordering, keyword scoring. 129 lines. | 18 (recall.test.ts + scopes.test.ts) | Working |
| `src/memory/server.ts` | MCP server: 6 tools (aide_recall, aide_remember, aide_forget, aide_memories, aide_import, aide_search). 309 lines. | 9 (server.test.ts) | Working |
| `src/memory/types.ts` | Types: Memory, CreateMemory, MemoryLayer, MemoryStatus, MemorySource, RecallQuery, RecallResult. 42 lines. | N/A | Working |
| `scripts/hooks/pre-read-recall.sh` | PreToolUse hook: calls recall-for-path.js, injects all matched memories via additionalContext. | Manual only | Working (needs refactor to nudge) |
| `scripts/hooks/stop-remember.sh` | Stop hook: blocks first stop, prompts agent to reflect and call aide_remember. | Manual only | Working |
| `scripts/hooks/detect-correction.sh` | UserPromptSubmit hook: regex detects correction patterns, injects context to store correction. | Manual only | Working |
| `scripts/hooks/recall-for-path.js` | Direct SQLite query for PreToolUse hook. Bypasses MCP. 43 lines. | Manual only | Working |

**Total existing: ~785 lines of source, 47+ tests across 6 test files, zero type errors.**

#### Phase 1 Components

| ID | Component | What needs to be built | Already exists | Effort | Dependencies |
|----|-----------|----------------------|----------------|--------|-------------|
| P1.1 | Storage Migration | JSON file-per-memory in `.aide/memories/<layer>/`. SQLite becomes cached index. UUID-based IDs. Hash-based cache rebuild. Directory structure with gitignore. | MemoryStore class, schema, all CRUD methods | **L** | None (critical path) |
| P1.2 | Type System Update | UUID field, `tags: string[]`, `shared: boolean`, `updated_at`. Remove `status` field entirely (file exists = active, file deleted = gone). MemorySource adds `hook`. Contributor becomes required. | Current Memory/CreateMemory types | S | Co-evolves with P1.1 |
| P1.3 | FTS5 Search | FTS5 virtual table, BM25 ranking, replace LIKE-based search. Sync FTS index with memory table. | LIKE-based search in store.search() | S | P1.1 (needs new schema) |
| P1.4 | Embedding Pipeline | sqlite-vec extension, local embedding model download, embedding generation on store, cosine similarity fallback search. | Old semantic search in src/retrieval/ (different architecture) | M | P1.1 |
| P1.5 | Hook Refactoring | ALL hooks nudge/prompt only — NEVER dump memory content. **4 hooks:** PreToolUse (count nudge), Stop (reflection prompt), UserPromptSubmit (correction + decision + preference detection), **PreCompact (extract decisions before context loss)**. All hidden via additionalContext. Dedup across hooks. Source tagging (`source: hook`). | 3 working hooks + recall-for-path.js | S-M | P1.1 (hooks query new store) |
| P1.6 | aide_update MCP Tool | New MCP tool for editing existing memories. Contributor ownership convention. Update `what`, `why`, `scope`, `tags`, `status`. | store.update() method exists | S | P1.1, P1.2 |
| P1.7 | CLI Framework | New entry point: `aide-memory` binary. Full parity with MCP tools. Commands: `aide-memory init`, `recall`, `remember`, `search`, `list`, `stats`, `config`, `update`, `forget`, `sync import`, `sync export`. Commander.js. | Old CLI framework (different commands) | M | P1.1 |
| P1.8 | Rules Files | `.claude/rules/aide-memory.md` for Claude Code. `.cursor/rules/aide-memory.mdc` for Cursor. Written for ALL supported tools at init (Copilot, Windsurf, Codex). Rules guide model on when/how to call MCP tools. | Current `.claude/rules/aide-memory.md` (for this project, not production) | S | None (just text files) |
| P1.9 | Cursor Support | `.cursor/hooks.json` config for Cursor hooks. MCP server config for Cursor (`~/.cursor/mcp.json` or project-level). | Nothing | S | P1.8 |
| P1.10 | Sync (Post-checkout + Manual) | Git post-checkout hook for auto-import. ALSO manual commands: `aide-memory sync import` (rebuild SQLite from JSON) and `aide-memory sync export` (ensure all memories have JSON files). Compares by UUID + `updated_at` (newer wins). Sync safety: JSON files are ALWAYS source of truth; SQLite is rebuildable. | Nothing | M | P1.1 |
| P1.11 | Config System | `.aide/config.json` schema. `aide config` CLI subcommand. Settings: nudge visibility (default OFF), capture (default ON), tag presets, cleanup thresholds. | Nothing | M | P1.7 (CLI framework) |
| P1.12 | Analytics & Telemetry | Local `analytics` table in SQLite (event, value, tool, timestamp). Default-ON anonymous telemetry (opt-out via `aide config telemetry off`). Events: install, init, memory_stored, memory_recalled, hook_triggered, tool_used. | recalled_count in store | M | P1.1, P1.11 (opt-out config) |
| P1.13 | aide stats | CLI command displaying: memory count by layer, most-recalled, stale candidates, capture source breakdown, hook effectiveness. | Nothing | S | P1.12 (reads analytics) |
| P1.14 | aide-memory init | One-command setup: creates `.aide/` directory tree, writes rules files for all tools, sets up hooks, **auto-configures MCP server in tool allowlists** (Claude Code settings.json, Cursor mcp.json), creates config.json with defaults, downloads embedding model, configures `.gitignore`, installs post-checkout hook. Also: `aide-memory init --update-rules` to refresh rules without touching config/memories. | Nothing | M | P1.1, P1.4, P1.8, P1.9, P1.10, P1.11 |
| P1.15 | Pre-train Scan | `aide-memory init --scan` scans codebase: detects project type, stack, frameworks, key patterns, existing docs. Generates ~20-30 structural memories. **The aide-memory tool itself scans (reads package.json, directory structure, config files). No LLM needed.** | Old tree-sitter analysis (different purpose) | M | P1.14 (init command) |
| P1.16 | npm Package | Clean package.json for `aide-memory`. Build: tsc + bundle/minify. npx support. Binary entry point. Exclude old aide-v0 code. | Current aide-v0 package.json | M | All code complete |
| P1.17 | Pre-ship Validation | Controlled comparison: **realistic general coding tasks** (not "remember X" — agent shouldn't know it's being tested for recall). Measurable quality difference. At least 5 scenarios across Claude Code + Cursor. Prove value within single session AND across sessions. | E2E comparison test exists (different format) | M | Everything working |
| P1.18 | Plugin/Marketplace | Claude Code plugin listing (marketplace discovery). Cursor extension/adapter listing if applicable. Increases visibility alongside npm distribution. | Nothing | S | P1.16 (package ready) |
| P1.19 | Demo & Marketing Assets | Individual feature demo snippets (capture, recall, nudge, search, init). One full-flow demo showing end-to-end value. Used for landing page, blog posts, social media, HN launch. | Nothing | M | P1.17 (validation proves value) |
| P1.20 | Update Mechanism | Code updates via `npm update aide-memory`. Rules refresh via `aide-memory init --update-rules` (refreshes rules without touching config/memories). Startup version check: if newer version available, print one-line suggestion (opt-in, not auto-install). | Nothing | S | P1.16 |
| P1.21 | User Documentation | All CLI commands documented with examples. All MCP tools documented. Configuration guide. Troubleshooting guide. Quick start (2-minute install → first recall). Architecture overview for contributors. Hosted on public GitHub repo. | Nothing | M | P0.6 (doc structure), all code |

**Phase 1 total estimate:** 4-6 weeks.

---

## 2. Build Order

### Dependency Graph

```
P1.2 (Types) ──┐
               ├── P1.1 (Storage) ──┬── P1.3 (FTS5)
               │                    ├── P1.4 (Embeddings) ──┐
               │                    ├── P1.5 (Hooks)        │
               │                    ├── P1.6 (aide_update)   │
P1.8 (Rules) ──┤                    ├── P1.10 (Post-checkout)│
               │                    │                        │
               │    P1.7 (CLI) ─────┼── P1.11 (Config) ─────┤
               │                    │                        │
               │    P1.9 (Cursor) ──┘                        │
               │                                             │
               │    P1.12 (Analytics) ── P1.13 (Stats)       │
               │                                             │
               └── P1.14 (Init) ─────────────────────────────┘
                       │
                   P1.15 (Pre-train)
                       │
                   P1.16 (npm Package)
                       │
                   P1.17 (Validation)
```

### Sprint Schedule

#### Sprint 1 — Storage Foundation (Week 1-2)

**Goal:** New file-per-memory architecture passes all existing tests.

| Order | Component | Can parallel? | Notes |
|-------|-----------|--------------|-------|
| 1 | P1.2 Type System Update | Start here | ~1 hour. Update types.ts first — everything imports from it. |
| 2 | P1.1 Storage Migration | Sequential after P1.2 | **Critical path.** New MemoryFileStore wrapping JSON files + SQLite cache. All existing tests must pass against new store. |
| 3 | P1.3 FTS5 Search | Parallel with late P1.1 | Independent SQLite addition. Can build FTS5 module separately, integrate once P1.1 is stable. |
| 4 | P1.8 Rules Files | Parallel (independent) | Pure text files. No code deps. Write all tool rules in parallel with P1.1. |

**End of Sprint 1 deliverable:** `MemoryStore` writes JSON files to `.aide/memories/<layer>/`, SQLite is a cached index rebuilt from files, FTS5 search works, rules files ready for all tools.

#### Sprint 2 — Core Features (Week 2-3)

**Goal:** Hooks working with new architecture, MCP server updated, CLI framework started.

| Order | Component | Can parallel? | Notes |
|-------|-----------|--------------|-------|
| 5 | P1.5 Hook Refactoring | After P1.1 | Change PreToolUse from dump to nudge. Update recall-for-path.js for new store. |
| 6 | P1.6 aide_update Tool | After P1.1 | Simple MCP tool addition. |
| 7 | P1.7 CLI Framework | Parallel | New entry point, basic commands (init, recall, remember, list). |
| 8 | P1.9 Cursor Support | Parallel with P1.8 | Hook config + MCP config for Cursor. |
| 9 | P1.11 Config System | Parallel | .aide/config.json + aide config CLI. |

**End of Sprint 2 deliverable:** Full capture-store-recall loop working with nudge hooks, CLI commands for basic operations, Cursor config ready.

#### Sprint 3 — Search, Sync, Analytics (Week 3-4)

**Goal:** Full search stack, git sync, analytics pipeline.

| Order | Component | Can parallel? | Notes |
|-------|-----------|--------------|-------|
| 10 | P1.4 Embedding Pipeline | After P1.1 | sqlite-vec, local model, cosine similarity. |
| 11 | P1.10 Post-checkout Hook | After P1.1 | Git hook, file import logic. |
| 12 | P1.12 Analytics & Telemetry | After P1.11 | Analytics table, event logging, telemetry transport. |
| 13 | P1.13 aide stats | After P1.12 | Display command for analytics data. |

**End of Sprint 3 deliverable:** FTS5 + semantic search working, post-checkout sync working, analytics tracking and display.

#### Sprint 4 — Init & Distribution (Week 4-5)

**Goal:** One-command install experience, npm package ready.

| Order | Component | Can parallel? | Notes |
|-------|-----------|--------------|-------|
| 14 | P1.14 aide init | After Sprint 2-3 | Orchestrates all setup: dirs, rules, hooks, config, model download, gitignore. |
| 15 | P1.15 Pre-train Scan | After P1.14 | `--scan` flag on init. Lightweight codebase analysis. |
| 16 | P1.16 npm Package | After all code | Package.json cleanup, build pipeline, npx support. |

**End of Sprint 4 deliverable:** `npx aide-memory init` works end-to-end, pre-train populates initial memories.

#### Sprint 5 — Validation & Polish (Week 5-6)

**Goal:** Ship-ready. Proven quality improvement.

| Order | Component | Notes |
|-------|-----------|-------|
| 17 | P1.17 Pre-ship Validation | 5 scenarios, Claude Code + Cursor, with vs without memories. |
| 18 | Polish | Error handling, graceful degradation, startup time optimization, edge cases. |

**End of Sprint 5 deliverable:** Validated, polished, ready for npm publish.

---

## 3. Acceptance Criteria

### P0.1 — Domain Registration

- [ ] Domain registered and DNS resolving
- [ ] HTTPS configured
- [ ] Email forwarding set up (hello@aide-memory.dev or equivalent)

### P0.2 — Legal

- [ ] USPTO TESS trademark search completed for "AIDE" in software class
- [ ] AiDE(R) trademark conflict assessed by legal counsel
- [ ] Proprietary freeware EULA drafted (free to use, no modification/redistribution)
- [ ] Company registration decision made (register vs defer)
- [ ] EULA reviewed by legal counsel

### P0.3 — Public GitHub Repo

- [ ] `aide-memory` repo created on GitHub
- [ ] README with: product description, install command, feature overview, license
- [ ] Issue templates: bug report, feature request
- [ ] Release workflow configured (GitHub Actions)
- [ ] No source code in the public repo

### P0.4 — npm Package Reservation

- [ ] `aide-memory` package reserved on npm
- [ ] `npx aide-memory` resolves (even if it's a placeholder)
- [ ] Publish workflow tested (dry-run)
- [ ] Package metadata: description, keywords, homepage, repository

### P0.5 — Landing Page

- [ ] Live at registered domain
- [ ] Content: one-sentence pitch, install command (`npx aide-memory init`), feature bullets, waitlist signup
- [ ] No Phase 2/3/4 roadmap revealed
- [ ] Mobile-responsive
- [ ] Analytics (page views, waitlist signups)

---

### P1.1 — Storage Migration

**Done looks like:** Memories are stored as individual JSON files. SQLite is a cache that can be deleted and rebuilt. All existing functionality preserved.

- [ ] `.aide/memories/` directory structure created:
  ```
  .aide/memories/
  ├── preferences/
  │   ├── personal/        ← gitignored
  │   └── shared/          ← tracked
  ├── technical/           ← tracked
  ├── area_context/        ← tracked
  └── guidelines/          ← tracked
  ```
- [ ] Each memory is one JSON file with UUID filename (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890.json`)
- [ ] JSON file schema:
  ```json
  {
    "uuid": "string (UUIDv4)",
    "layer": "preferences|technical|area_context|guidelines",
    "what": "string",
    "why": "string|null",
    "scope": "string|null (glob pattern)",
    "context_label": "string|null",
    "contributor": "string (required, auto-detected from git config user.name)",
    "tags": ["string"],
    "source": "conversation|import|agent_discovery|elevated|hook",
    "shared": "boolean (true for all layers except preferences/personal)",
    "generated_by": {
      "tool": "string|null (claude-code, cursor, cli, etc.)",
      "model": "string|null (claude-opus-4, gpt-4, etc. — auto-detected if possible)",
      "author_type": "human|ai (human = user typed aide remember, ai = agent called aide_remember)"
    },
    "created_at": "ISO 8601 string",
    "updated_at": "ISO 8601 string"
  }
  ```
- [ ] `generated_by` tracks provenance of HOW the memory was created. `contributor` (always required) tracks WHO — the human developer, from git config. Both are always present. A memory created by Claude Code for developer "meky" has `contributor: "meky"` AND `generated_by: { tool: "claude-code", model: "claude-opus-4", author_type: "ai" }`. A memory typed manually via CLI has `contributor: "meky"` AND `generated_by: { tool: "cli", model: null, author_type: "human" }`. This enables analytics: which tool/model produces the most-recalled memories, human-authored vs AI-discovered quality comparison.
- [ ] **No `status` field.** A memory either exists (file present = active) or is deleted (file removed). Tags like `outdated` or `deprecated` are used for soft-flagging without removal. Git history preserves deleted memories if recovery is needed.
- [ ] `recalled_count` and `last_recalled_at` are SQLite-only (local tracking, not in JSON files)
- [ ] `add()` creates a new JSON file in the correct layer directory and inserts into SQLite cache
- [ ] `get()` reads from SQLite cache (not from JSON file on every access)
- [ ] `update()` modifies the JSON file and updates SQLite cache
- [ ] `remove()` deletes the JSON file and removes from SQLite cache
- [ ] `list()` queries SQLite cache (not filesystem scan)
- [ ] SQLite cache rebuild: on startup, hash `.aide/memories/` directory state. If hash differs from stored hash, rebuild by scanning JSON files. Typical rebuild < 200ms for 500 files.
- [ ] Deleting the SQLite cache file and restarting produces identical behavior (full rebuild from files)
- [ ] All 47+ existing tests pass against new storage layer (or are updated to match new types)
- [ ] JSON file write is atomic (write to temp file, rename) to prevent corruption on crash

**Edge cases:**
- Malformed JSON file: log warning, skip, continue with remaining files
- Missing layer directory: create on first write
- UUID collision: statistically impossible (UUIDv4), but check on insert and regenerate if somehow collides
- Concurrent writes: not an issue for single-developer use; file-per-memory means no write conflicts
- Empty `.aide/memories/` on first run: works, zero memories recalled

**Failure modes:**
- Disk full on write: return error from add(), do not leave partial JSON files
- Read-only filesystem: fail gracefully on write, still serve reads from SQLite cache
- Corrupted SQLite cache: delete and rebuild from JSON files (self-healing)

### P1.2 — Type System Update

- [ ] `Memory` interface updated:
  - `uuid: string` added (primary identifier)
  - `id: number` retained (SQLite row ID, cache-only)
  - `contributor: string` (required, not nullable — auto-detected from git config user.name, overridable via env `AIDE_CONTRIBUTOR` or `.aide/config.json`)
  - `tags: string[]` added
  - `shared: boolean` added
  - `updated_at: string` added
  - `derived_from: string[] | null` (UUIDs, not numbers)
- [ ] `MemoryStatus` type **removed entirely**. No status field. File exists = active, file removed = deleted.
- [ ] `MemorySource` adds `'hook'` option
- [ ] `CreateMemory` updated to match (uuid auto-generated, contributor auto-detected)
- [ ] `MemoryFile` type added (JSON file content, excludes SQLite-only fields like recalled_count)
- [ ] `RecallQuery` adds optional `contributor` filter
- [ ] All imports compile with zero type errors

### P1.3 — FTS5 Search

**Done looks like:** `aide_search` uses FTS5 full-text search with BM25 ranking instead of LIKE.

- [ ] FTS5 virtual table `memories_fts` created: `CREATE VIRTUAL TABLE memories_fts USING fts5(what, why, context_label, content=memories, content_rowid=id)`
- [ ] Triggers keep FTS index in sync with `memories` table (INSERT, UPDATE, DELETE)
- [ ] `store.search()` uses FTS5 MATCH with BM25 ranking: `SELECT * FROM memories WHERE id IN (SELECT rowid FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank)`
- [ ] Search supports multi-word queries
- [ ] Search results ranked by BM25 relevance (most relevant first)
- [ ] Layer and status filters still work alongside FTS5
- [ ] FTS5 index rebuilt during cache rebuild (same trigger as main table)
- [ ] Graceful fallback: if FTS5 is unavailable (custom SQLite build), fall back to LIKE-based search with a logged warning
- [ ] Performance: search across 2,000 memories completes in < 50ms

**Edge cases:**
- Empty query string: return empty results
- Special characters in query (quotes, parentheses): escape for FTS5 syntax
- Very long query strings (>500 chars): truncate to first 500 chars

### P1.4 — Embedding Pipeline

**Done looks like:** Semantic search works as a fallback when FTS5 returns no results or when the query is conceptual.

- [ ] sqlite-vec extension loaded into SQLite database
- [ ] Embedding model downloaded during `aide init` (local, no API keys)
- [ ] Model choice documented and justified (size vs quality tradeoff for local use)
- [ ] `embeddings` table: `uuid TEXT PRIMARY KEY, vector BLOB` (sqlite-vec format)
- [ ] Embedding generated on `add()` and stored in embeddings table
- [ ] `store.semanticSearch(query, limit)` method: embed query, cosine similarity via sqlite-vec, return top-N
- [ ] **System decides search method, not the model.** Recall flow: FTS5 first → if < 3 results, system automatically supplements with semantic search. The model does NOT choose which search method to use — it calls `aide_search(query)` and the system handles routing internally. Model CAN pass `method: "semantic"` to force semantic-only search for conceptual queries, but this is optional.
- [ ] Model download is interruptible and resumable
- [ ] Model size documented (target: < 100MB for usability)
- [ ] Embedding generation performance: < 50ms per memory on typical hardware

**Edge cases:**
- Model not yet downloaded: skip semantic search, FTS5 only, log info message
- Corrupted model file: re-download on next init
- Memory too short to embed meaningfully (< 10 chars): skip embedding, mark as unembedded

**Failure modes:**
- sqlite-vec not available on platform: semantic search disabled, FTS5 + LIKE used. Log warning once.
- Out of memory during embedding: skip that memory, continue with remaining

### P1.5 — Hook Refactoring

**Done looks like:** ALL hooks are nudge/prompt-only. They NEVER dump memory content into the context. The agent always decides whether to call `aide_recall` to fetch actual memories.

**Core principle: hooks tell the agent memories exist, the agent decides whether to retrieve them.**

- [ ] PreToolUse hook (pre-read-recall.sh) — **NUDGE ONLY:**
  - Counts memories matching the file path via fast SQL query
  - Output: `"N memories exist for <path>. Call aide_recall if relevant."` (~20 tokens)
  - Injected via `additionalContext` (invisible in terminal)
  - **Never includes memory content** — only the count
- [ ] Stop hook (stop-remember.sh) — **PROMPT ONLY:**
  - Prompts agent to reflect: "Anything worth remembering?"
  - Output via `additionalContext` (hidden from terminal)
  - **Never reads or dumps stored memories**
- [ ] UserPromptSubmit hook (detect-correction.sh) — **PROMPT ONLY:**
  - Detects **corrections, decisions, and preferences** in user message
  - Patterns for Phase 1:
    - Corrections: "no, don't use...", "actually...", "wrong...", "not like that", "instead use..." (existing)
    - Decisions: "let's use...", "we should...", "go with...", "the approach is...", "decided to..."
    - Preferences: "I prefer...", "always use...", "never use...", "I like...", "my style is..."
  - Prompts agent with appropriate layer suggestion: corrections → technical/preferences, decisions → area_context, preferences → preferences
  - Output via `additionalContext` (hidden from terminal)
  - **Never reads or dumps stored memories** — only prompts to store new ones
  - Phase 2+ exploration: expand to more generic capture, smarter filtering, potentially all user prompts with model-based relevance scoring
- [ ] **PreCompact hook (NEW) — EXTRACT BEFORE LOSS:**
  - Fires before both manual /compact and auto-compact (Claude Code provides this hook with `session_id`, `transcript_path`, `trigger` type)
  - Prompts agent: "Context is about to be compacted. Extract any key decisions, plans, or constraints worth persisting via aide_remember before they are lost."
  - Output via `additionalContext` (hidden from terminal)
  - This is a high-value hook — 350+ GitHub comments document context loss pain from compaction
  - **Never blocks compaction** — observability only, prompt to save before loss
  - Note: Cursor equivalent hook name may differ — verify during Cursor integration testing
- [ ] recall-for-path.js updated to work with new storage architecture (reads SQLite cache, not old DB path)
- [ ] Dedup logic: within a single interaction, if PreToolUse already triggered and Stop also fires, the agent should not store the same memory twice. Implemented via session-scoped dedup check (hash of what + scope stored in temp file, checked before each store)
- [ ] Source tagging: memories captured via hooks get `source: "hook"` in the JSON file
- [ ] **Memory file read tracking:** When the hook detects a Read of a `.aide/memories/` file, log an analytics event (`memory_file_direct_read`). Optionally nudge: "You're reading a raw memory file. Use aide_recall for structured context." This lets us track how often tools read memory files directly.
- [ ] Hook scripts exit cleanly (exit 0) on any error — never break the agent

**Future hook candidates (Phase 1.5 or Phase 2):**
- PreToolUse on Write/Edit: "You're about to modify this file. N memories exist about it." — nudge before modifications, not just reads. Heavier weight (fires more often), evaluate after Phase 1 launch.
- UserPromptSubmit patterns beyond corrections: decisions ("let's use X"), preferences ("I prefer Y"), confirmations ("perfect, that's right" — signals the approach should be remembered). Extend the regex in detect-correction.sh.

**Edge cases:**
- File path not under project root: skip recall, exit 0
- SQLite cache doesn't exist yet (first run before init): exit 0, no error
- Very large number of memories for a path (100+): nudge says "100+ memories", doesn't change behavior

### P1.6 — aide_update MCP Tool

**Done looks like:** Agent can update an existing memory's content, scope, tags, or status.

- [ ] New MCP tool `aide_update` registered in server.ts
- [ ] Parameters: `uuid` (required), `what`, `why`, `scope`, `tags`, `context_label` (all optional — update only provided fields). No `status` parameter — use aide_forget to delete.
- [ ] Tool description guides the model: "Update an existing memory. Use when information has changed, scope needs adjusting, or tags need updating. You can only update your own memories."
- [ ] Contributor ownership: tool checks that the memory's `contributor` matches the current user. If not, returns error: "You can only update your own memories."
- [ ] `updated_at` field set to current timestamp on every update
- [ ] JSON file updated (atomic write)
- [ ] SQLite cache updated
- [ ] Returns: updated memory content with confirmation message

**Edge cases:**
- UUID not found: return "Memory not found"
- No fields provided to update: return current memory unchanged
- To delete a memory, use aide_forget (which deletes the file), not aide_update

### P1.7 — CLI Framework

**Done looks like:** `aide-memory` CLI binary runs all Phase 1 commands with full MCP tool parity.

- [ ] New CLI entry point at `src/cli/aide-memory.ts` (separate from old aide CLI)
- [ ] Binary name: `aide-memory` (avoids conflicts with other AIDE products or old aide binary)
- [ ] Commander.js command structure:
  ```
  aide-memory init [--scan] [--update-rules]   Create .aide/, write rules, set up hooks, configure MCP
  aide-memory recall <path>                     Recall memories for a file/directory path
  aide-memory remember <what>                   Store a memory (--layer, --scope, --tags, --why)
  aide-memory update <uuid>                     Update an existing memory (--what, --why, --scope, --tags)
  aide-memory forget <uuid>                     Delete a memory (removes JSON file)
  aide-memory search <query>                    Search memories by keyword (FTS5)
  aide-memory list                              List memories (--layer, --scope, --contributor, --limit)
  aide-memory stats                             Show memory analytics
  aide-memory config <key> [value]              Get or set configuration
  aide-memory sync import                       Rebuild SQLite cache from JSON files
  aide-memory sync export                       Ensure all memories have JSON files
  aide-memory migrate                           Migrate from legacy memory.db format
  ```
- [ ] **Full MCP ↔ CLI parity table:**
  | MCP Tool | CLI Command | Notes |
  |----------|-------------|-------|
  | aide_recall | `aide-memory recall` | Same output format |
  | aide_remember | `aide-memory remember` | Same fields |
  | aide_update | `aide-memory update` | Same fields |
  | aide_forget | `aide-memory forget` | Deletes JSON file |
  | aide_search | `aide-memory search` | Same FTS5 search |
  | aide_memories | `aide-memory list` | Same filters |
  | aide_import | `aide-memory sync import` | Manual cache rebuild |
  | — | `aide-memory sync export` | CLI-only (cache → files) |
  | — | `aide-memory init` | CLI-only (setup) |
  | — | `aide-memory stats` | CLI-only (analytics) |
  | — | `aide-memory config` | CLI-only (settings) |
- [ ] All commands read from the same `.aide/` directory and SQLite cache
- [ ] `aide-memory recall` output: formatted markdown with layer grouping (same format as MCP tool)
- [ ] `aide-memory remember` prompts for required fields not provided as flags
- [ ] `aide-memory list` supports filtering by layer, scope, contributor, tags
- [ ] `aide-memory search` uses FTS5 (same as MCP tool)
- [ ] All commands exit 0 on success, exit 1 on error with useful error message
- [ ] `--help` works for every command
- [ ] `--version` outputs package version

**Edge cases:**
- No `.aide/` directory: suggest running `aide-memory init` first
- Empty store: "No memories stored yet. Use aide-memory remember or let hooks capture context during work."

### P1.8 — Rules Files

**Done looks like:** Rules files for all supported tools are ready to be written during `aide init`.

- [ ] Claude Code rules file (`.claude/rules/aide-memory.md`):
  - When to call `aide_recall` (on file reads, starting new tasks, after context loss)
  - When to call `aide_remember` (corrections, decisions, discoveries, task completion)
  - How to format memories (layer selection heuristics, scope patterns, tag assignment)
  - When to call `aide_update` (information changed, scope needs adjusting)
  - Never store: secrets, temporary state, obvious facts derivable from code
  - Contributor: auto-detect from git config user.name
  - Hidden: rules about memory management should not be mentioned to user unless asked
- [ ] Cursor rules file (`.cursor/rules/aide-memory.mdc`):
  - Same content adapted to Cursor's MDC format (with frontmatter: description, globs)
  - Instructions for calling MCP tools in Cursor's agent mode
- [ ] Copilot instructions (`copilot-instructions.md` section):
  - Lightweight: point to MCP tools, basic recall/remember guidance
- [ ] Windsurf rules (`.windsurfrules` section):
  - Same as Copilot: lightweight MCP guidance
- [ ] Codex agent instructions (`AGENTS.md` section):
  - Lightweight MCP guidance
- [ ] All rules files are templates stored in `src/templates/rules/`
- [ ] Each template is < 2,000 tokens (minimize MCP overhead)
- [ ] Rules tested: model reads file and correctly calls aide_recall on file reads (manual validation)

### P1.9 — Cursor Support

- [ ] `.cursor/hooks.json` configuration template:
  - PreToolUse hook pointing to pre-read-recall.sh
  - Stop hook pointing to stop-remember.sh (if Cursor supports Stop hooks)
  - Document any Cursor hook limitations vs Claude Code
- [ ] MCP server configuration for Cursor:
  - Project-level `.cursor/mcp.json` or user-level `~/.cursor/mcp.json`
  - Points to aide-memory MCP server binary
  - Correct stdio transport config
- [ ] Verified: Cursor agent reads `.cursor/rules/aide-memory.mdc` on session start
- [ ] Verified: Cursor agent can call aide_recall and aide_remember MCP tools

### P1.10 — Sync (Post-checkout + Manual Import/Export)

**Done looks like:** Automatic sync on git pull/checkout. Manual sync available anytime via CLI. JSON files are ALWAYS source of truth — SQLite cache is always rebuildable.

#### Automatic: Post-checkout Git Hook

- [ ] Git hook script installed via `aide-memory init` to `.git/hooks/post-checkout`
- [ ] On trigger: scan `.aide/memories/` for JSON files
- [ ] For each file: check if UUID exists in local SQLite
  - New file (UUID not in SQLite): insert into cache
  - Changed file (UUID exists, file's `updated_at` > SQLite's `updated_at`): update cache
  - Unchanged: skip
  - Deleted file (UUID in SQLite but file gone): remove from cache
- [ ] Skip files in `preferences/personal/` (gitignored, should never appear)
- [ ] Performance: < 500ms for 100 changed files
- [ ] Hook exits 0 on any error (never block git operations)
- [ ] Hook is idempotent (running twice produces same result)

#### Manual: `aide-memory sync import` and `aide-memory sync export`

- [ ] `aide-memory sync import`: Full rebuild of SQLite cache from JSON files. Equivalent to deleting the cache and letting it rebuild. Safe, idempotent. Use when: post-checkout hook didn't fire, debugging, manual pull without hooks.
- [ ] `aide-memory sync export`: Scan SQLite for any memories without corresponding JSON files and create them. In normal operation this never happens (add() writes both), but serves as a safety net and debugging tool.
- [ ] Both commands print summary: "Imported N new, updated M, removed K memories."

#### Sync Safety Protocol

- [ ] JSON files are the canonical source of truth. SQLite can ALWAYS be deleted and rebuilt.
- [ ] **Every `add()`, `update()`, `remove()` writes to BOTH JSON file and SQLite simultaneously.** In normal operation, they are always in sync. Manual import/export is a safety net, not a regular operation.
- [ ] Import (JSON → SQLite): newer wins by `updated_at` timestamp. Never overwrites newer SQLite data with older JSON data.
- [ ] **Conflict detection on import:** If SQLite has a memory with `updated_at` NEWER than the incoming JSON file (meaning local edits exist that haven't been committed to git), warn the user: "Local edits to memory <uuid> would be overwritten by incoming version. Keep local (l) or accept incoming (i)?" In non-interactive mode (post-checkout hook), keep the newer version and log a warning.
- [ ] Export (SQLite → JSON): only creates MISSING JSON files. Never overwrites existing JSON files.
- [ ] No scenario where import destroys data without warning.
- [ ] No scenario where export destroys data — it only fills gaps.
- [ ] Concurrent operations: file-per-memory means different UUIDs = different files = no write conflicts.

**Edge cases:**
- First checkout (no SQLite cache): full rebuild from all files
- Merge conflict in a memory JSON file: git handles it (UUID filenames make conflicts extremely unlikely)
- Hook not installed (user didn't run `aide-memory init`): no-op, user is just using git normally
- User manually edits a JSON file: next import picks up the change (file's `updated_at` should be updated by user)

### P1.11 — Config System

**Done looks like:** `.aide/config.json` controls all customizable behavior.

- [ ] Default config created during `aide init`:
  ```json
  {
    "version": 1,
    "capture": {
      "enabled": true,
      "hooks": {
        "preToolUse": true,
        "stop": true,
        "userPromptSubmit": true
      }
    },
    "nudge": {
      "visible": false
    },
    "tags": {
      "presets": ["architecture", "testing", "security", "style", "integration", "config", "migration", "performance", "api-contract"]
    },
    "telemetry": {
      "enabled": true
    },
    "contributor": "auto"
  }
  ```
- [ ] `aide config <key>` prints current value
- [ ] `aide config <key> <value>` sets value (dot notation: `aide config capture.enabled false`)
- [ ] `aide config tags.add <tag>` adds custom tag to presets
- [ ] `aide config tags.remove <tag>` removes tag from presets
- [ ] `aide config --list` prints all current config
- [ ] `aide config --reset` restores defaults
- [ ] Config file is JSON (not YAML, not TOML) for simplicity and tooling
- [ ] Invalid config values rejected with helpful error message
- [ ] Config changes take effect immediately (no restart needed — hooks re-read config on each invocation)

**Edge cases:**
- Missing config file: use defaults, create file on first `aide config set`
- Corrupted config file: log warning, use defaults, offer to reset
- Unknown config key: error "Unknown config key: X. Run aide config --list to see available options."

### P1.12 — Analytics & Telemetry

**Done looks like:** Local analytics power `aide stats`. Anonymous telemetry helps us make go/no-go decisions.

- [ ] Local `analytics` table in SQLite cache:
  ```sql
  CREATE TABLE analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    value TEXT,
    tool TEXT,
    timestamp TEXT NOT NULL
  );
  ```
- [ ] Events logged locally (always, regardless of telemetry setting):
  - `memory_stored` (layer, source, tool)
  - `memory_recalled` (count, path, tool)
  - `memory_updated` (uuid, tool)
  - `memory_deleted` (uuid, tool)
  - `hook_triggered` (hook_name, tool)
  - `search_performed` (method: fts5/semantic/like, result_count)
  - `init_completed` (tool_count, scan_used)
- [ ] Anonymous telemetry (when enabled):
  - Sends: event type, memory count by layer, tool used, error types
  - Never sends: memory content, file paths, scope patterns, embedding vectors
  - Transport: HTTPS POST to telemetry endpoint
  - Opt-out: `aide config telemetry off`
  - On first run, inform user: "AIDE Memory collects anonymous usage data to improve the product. Run `aide config telemetry off` to disable."
- [ ] Telemetry endpoint spec defined (URL, payload format, auth)

**Edge cases:**
- Telemetry endpoint unreachable: silently skip, never block operations
- Analytics table grows very large (10K+ rows): prune events older than 90 days on startup

### P1.13 — aide stats

- [ ] `aide stats` output includes:
  ```
  AIDE Memory Stats
  ─────────────────
  Memories: 47 total (12 area_context, 15 technical, 8 preferences, 12 guidelines)
  Status: 45 active, 2 deleted
  
  Recall: 234 total recalls, 18 unique memories recalled
  Most recalled: "Use datetime() for SQLite dates" (recalled 23x) [technical]
  
  Capture sources:
    conversation: 28 (60%)
    hook: 15 (32%)
    import: 4 (8%)
  
  Hooks triggered: 156 total
    PreToolUse: 120 (77%)
    Stop: 24 (15%)
    UserPromptSubmit: 12 (8%)
  
  Stale candidates: 5 memories with 0 recalls after 30+ days
  ```
- [ ] `aide stats --json` outputs machine-readable JSON
- [ ] Stats computed from SQLite cache (fast, no file scanning)
- [ ] Works with empty store: "No memories stored yet."

### P1.14 — aide-memory init

**Done looks like:** `npx aide-memory init` takes a project from zero to fully configured in under 2 minutes.

- [ ] Creates `.aide/` directory structure (memories, config, cache)
- [ ] Creates `.aide/memories/<layer>/` directories (preferences/personal, preferences/shared, technical, area_context, guidelines)
- [ ] Writes **separate** rules files for ALL supported tools (never touches existing CLAUDE.md or .cursorrules):
  - `.claude/rules/aide-memory.md` — tells Claude Code how to use aide-memory
  - `.cursor/rules/aide-memory.mdc` — tells Cursor how to use aide-memory
  - Does NOT modify existing CLAUDE.md, .cursorrules, copilot-instructions.md, etc.
  - Rules files explain: when to call aide_recall, when to aide_remember, how to assign layers/tags
- [ ] **Auto-configures MCP server in tool allowlists:**
  - Claude Code: adds aide-memory to `.claude/settings.json` mcpServers + allowed tools
  - Cursor: adds aide-memory to `.cursor/mcp.json`
  - User doesn't need to manually configure MCP — it's ready to use immediately
- [ ] Sets up hooks:
  - Claude Code: configures in `.claude/settings.json` hooks section
  - Cursor: configures in `.cursor/hooks.json` (if supported)
- [ ] Creates `.aide/config.json` with defaults
- [ ] Downloads embedding model (with progress bar)
- [ ] Updates `.gitignore`:
  - Adds `.aide/memories/preferences/personal/`
  - Adds `.aide/cache/` (SQLite cache files)
- [ ] Installs post-checkout git hook (non-destructive: appends to existing hook if present)
- [ ] Detects `git config user.name` for default contributor
- [ ] Prints summary: what was created, next steps
- [ ] Idempotent: running twice doesn't duplicate or overwrite (checks for existing files)
- [ ] Completes in < 2 minutes (most time is model download)
- [ ] `aide-memory init --update-rules`: refreshes rules files only, without touching config, memories, or hooks. For when aide-memory ships updated/improved rules in a new version.
- [ ] `aide-memory init --scan`: see P1.15

**Design note — tool onboarding framework:** All rules files, hook configs, and MCP configs are generated from templates in `src/templates/`. Adding support for a new tool = adding a new template set (file paths, formatting conventions, hook event names). Same memory data, different output format per tool. Target: one-day effort per new tool.

**Edge cases:**
- Already initialized: "AIDE Memory is already initialized in this project. Use --force to re-initialize."
- Not a git repo: warn "Not a git repo — team sync features won't work. Continue anyway? (y/n)"
- No write permission to project root: error with clear message
- Rules file already exists (from previous init): update it (replace contents), don't create duplicate
- Network unavailable (can't download model): init succeeds without embeddings, log warning "Embedding model not downloaded — semantic search disabled. Run `aide-memory init --download-model` later."

### P1.15 — Pre-train Scan

**Done looks like:** `aide init --scan` populates ~20-30 structural memories from codebase analysis.

- [ ] Detects project type: Node.js, Python, Go, Rust, Java, etc. (from package.json, go.mod, Cargo.toml, pyproject.toml, etc.)
- [ ] Detects frameworks: React, Next.js, Express, Django, FastAPI, etc.
- [ ] Detects testing framework: Vitest, Jest, pytest, Go testing, etc.
- [ ] Detects build system: tsc, webpack, vite, esbuild, etc.
- [ ] Detects existing docs: CLAUDE.md, .cursorrules, CONTRIBUTING.md, README.md
- [ ] Detects monorepo structure: packages/, apps/, workspace config
- [ ] Generates memories as `technical` layer with appropriate scopes:
  - "Project uses TypeScript with Vitest for testing" [project-wide]
  - "React components in src/components/ use functional components with hooks" [src/components/**]
  - "Express API routes in src/api/" [src/api/**]
- [ ] Generated memories tagged with `source: "agent_discovery"`
- [ ] Memory count: 15-30 (enough to be useful, not so many they're noise)
- [ ] Scan completes in < 30 seconds for a typical project
- [ ] Scan does NOT read file contents in detail — reads package.json, directory structure, file extensions, config files. Not a full AST analysis.
- [ ] User shown summary: "Generated 23 structural memories from codebase scan. Run `aide list` to review."

**Edge cases:**
- Empty project (no files): generate 0 memories, inform user
- Monorepo: scan root + each detected package, scope memories appropriately
- Very large project (10K+ files): scan only top-level structure and key config files, don't traverse deeply

### P1.16 — npm Package

- [ ] Package name: `aide-memory`
- [ ] `package.json` fields: name, version (0.1.0), description, bin (aide), main, files, engines (>=18), keywords, license (proprietary)
- [ ] `bin` entry: `"aide": "./dist/cli/aide-memory.js"` 
- [ ] Build: `tsc` → `dist/`, then bundle/minify for distribution
- [ ] `npx aide-memory init` works (package has `postinstall` or `bin` that handles init flow)
- [ ] Exclude from package: test files, source maps, old aide-v0 code, docs, .aide/
- [ ] Dependencies cleaned: only include what aide-memory needs (better-sqlite3, commander, @modelcontextprotocol/sdk, zod, uuid)
- [ ] Remove old dependencies not needed: axios, express, chokidar, marked, ts-morph, web-tree-sitter, ws
- [ ] `npm pack --dry-run` shows only necessary files
- [ ] Package size: < 5MB (excluding embedding model, which downloads separately)
- [ ] README in package: quick start, feature list, links to docs

### P1.17 — Pre-ship Validation

**Done looks like:** Documented evidence that recall measurably improves agent output.

- [ ] 5 test scenarios run across Claude Code + Cursor (minimum). **Critical: these must be realistic general coding tasks. The agent should NOT know it's being tested for memory recall. No prompts like "remember that thing I said."**
  1. **Style continuity:** Session 1: work on a feature, correct the agent's style 3 times (line length, naming, component structure). Session 2: ask agent to build a similar feature in a different area. Score: does it follow the corrected patterns without being told? (With vs without AIDE Memory)
  2. **Planning persistence:** Session 1: plan a multi-file refactor with specific steps and constraints. Session 2: say "continue the refactor." Score: does it know the plan or start from scratch? (With vs without)
  3. **Technical knowledge:** Session 1: agent discovers a non-obvious codebase convention during work (e.g., a custom date format, a specific test pattern). Session 2: give a general task in the same area. Score: does it follow the convention? (With vs without)
  4. **Proactive discovery:** Pre-seed area context for a code area. Give the agent a general task in that area ("add pagination to the data table"). Score: does it respect the existing architectural decisions it was told about, or does it violate them? (With vs without)
  5. **New contributor sim:** Populated memory store vs empty. Ask agent to "fix the flaky test in src/auth/". Score: does the agent with memories approach it with relevant context, or does it explore blindly like the bare agent?
- [ ] **Also verify: within-session value.** Start a fresh session, work for 30+ minutes, then start a second session. Does AIDE Memory capture and recall useful context from the first session?
- [ ] Each scenario scored on a rubric:
  - Did the agent recall relevant context? (yes/no)
  - Did the agent's output reflect the recalled context? (yes/partial/no)
  - Was there a measurable quality difference vs bare agent? (yes/no)
- [ ] Results documented in `docs/validation/PHASE_1_RESULTS.md`
- [ ] Decision criteria: if AIDE Memory setups score at or below bare setups, core value prop is NOT working — do not ship
- [ ] Rules file validation: verify model reads rules and calls aide_recall appropriately in both Claude Code and Cursor

### P0.6 — User Documentation

- [ ] Quick start guide: install → first recall in under 2 minutes
- [ ] CLI command reference: every command with flags, examples, expected output
- [ ] MCP tool reference: every tool with parameters, examples, expected response
- [ ] Configuration guide: all config keys, defaults, examples
- [ ] Troubleshooting guide: common issues and solutions
- [ ] Architecture overview (for contributors): how storage, recall, hooks work together
- [ ] All docs hosted on public GitHub repo (`aide-memory/docs/`) and linked from landing page
- [ ] Docs cover the full CLI ↔ MCP parity table (what to use when)

### P1.18 — Plugin/Marketplace Distribution

- [ ] Claude Code: plugin listing submitted to marketplace (README, install command, feature description)
- [ ] Cursor: extension/adapter listing if Cursor marketplace supports MCP tool listings
- [ ] Both listings point to `npx aide-memory init` as install command
- [ ] Listings include feature screenshots/descriptions from demo assets (P1.19)

### P1.19 — Demo & Marketing Assets

- [ ] Individual feature demo snippets (30-60 seconds each, screen recording or GIF):
  - Init experience (`aide-memory init` → ready in 2 min)
  - Auto-capture via hooks (correction detected → memory stored silently)
  - Nudge + recall (PreToolUse fires → agent recalls → uses context)
  - Cross-session persistence (session 1 teaches → session 2 remembers)
  - Search (FTS5 keyword search finding relevant memories)
  - Pre-train scan (init --scan populates structural memories)
- [ ] Full-flow demo (3-5 minutes): init → work on a feature → correction captured → new session → context recalled → better output
- [ ] All demos show realistic coding tasks, not contrived "remember X" scenarios
- [ ] Assets usable in: landing page, README, blog posts, HN launch, social media

### P1.20 — Update Mechanism

- [ ] Version check on CLI startup: compare installed vs latest npm version (at most once per day, cached)
- [ ] One-line non-blocking suggestion: "aide-memory vX.Y.Z available. Run `npm update -g aide-memory`."
- [ ] Disable via `aide-memory config updates.check false`
- [ ] `aide-memory init --update-rules`: refreshes rules files from latest templates, preserves config/memories
- [ ] Rules files include version comment (`<!-- aide-memory rules v0.1.0 -->`), only updated if installed version is newer
- [ ] Schema migration: if JSON file format changes between versions, handle automatically on startup (check version in `.aide/config.json`)

### P1.21 — User Documentation (Detailed)

- [ ] Full CLI reference page:
  | Command | Description | Example |
  |---------|-------------|---------|
  | `aide-memory init` | Set up project | `aide-memory init --scan` |
  | `aide-memory recall` | Get context for a path | `aide-memory recall src/auth/` |
  | `aide-memory remember` | Store knowledge | `aide-memory remember "Use datetime()" --layer technical` |
  | `aide-memory update` | Edit a memory | `aide-memory update <uuid> --tags security` |
  | `aide-memory forget` | Delete a memory | `aide-memory forget <uuid>` |
  | `aide-memory search` | Find memories | `aide-memory search "authentication"` |
  | `aide-memory list` | List all memories | `aide-memory list --layer guidelines` |
  | `aide-memory stats` | View analytics | `aide-memory stats --json` |
  | `aide-memory config` | Manage settings | `aide-memory config nudge.visible false` |
  | `aide-memory sync import` | Rebuild cache | `aide-memory sync import` |
  | `aide-memory sync export` | Ensure JSON files | `aide-memory sync export` |
  | `aide-memory migrate` | Migrate legacy DB | `aide-memory migrate` |
- [ ] MCP tool reference with parameter docs and example responses
- [ ] "How it works" page explaining the nudge flow, hook behavior, and storage architecture

---

## 4. Testing Plan — Unit Tests

### Coverage Targets

| Module | Current tests | Target tests | Target coverage |
|--------|-------------|-------------|-----------------|
| store.ts (new: file-store.ts) | 20 | 35-40 | 90%+ lines |
| recall.ts | 18 | 22-25 | 90%+ lines |
| server.ts | 9 | 15-18 | 85%+ lines |
| types.ts | 0 | 2-3 | Type assertion tests |
| fts5.ts (new) | 0 | 8-10 | 90%+ |
| embeddings.ts (new) | 0 | 6-8 | 80%+ |
| config.ts (new) | 0 | 8-10 | 90%+ |
| analytics.ts (new) | 0 | 5-7 | 85%+ |
| init.ts (new) | 0 | 8-10 | 80%+ |
| scan.ts (new) | 0 | 5-7 | 80%+ |
| cli/*.ts (new) | 0 | 10-15 | 75%+ |
| **Total** | **47** | **~110-140** | **85%+ overall** |

### Test Strategy

**What to mock:**
- Filesystem operations in store tests: use temp directories (already done in existing tests)
- Embedding model in embedding tests: mock the model, test the pipeline
- Git operations in post-checkout tests: mock git commands
- Network in telemetry tests: mock HTTP transport
- System time in analytics tests: mock Date.now()

**What to test directly (no mocks):**
- SQLite operations: use in-memory or temp-file databases (existing pattern)
- JSON file I/O: use temp directories
- FTS5 queries: real SQLite with FTS5 extension
- Recall logic: real store with test data
- Config parsing: real JSON files in temp dirs

### Key Test Cases Per Module

#### P1.1 — Storage (file-store.test.ts)

**Happy path:**
- `add()` creates JSON file in correct layer directory with valid UUID filename
- `add()` inserts row into SQLite cache
- `get(uuid)` returns memory from cache
- `update(uuid, changes)` modifies JSON file and cache
- `remove(uuid)` deletes JSON file and cache row
- `list()` returns memories from cache, sorted by created_at DESC
- Cache rebuild from files: delete SQLite, call rebuild(), verify all memories restored
- Hash-based cache check: no rebuild when directory unchanged
- Hash-based cache check: rebuild triggered when file added/removed/modified

**Edge cases:**
- `add()` with all optional fields null
- `add()` with very long `what` field (10K chars)
- `get()` with nonexistent UUID returns null
- `update()` with nonexistent UUID returns null
- `remove()` with nonexistent UUID returns false
- `list()` on empty store returns []
- `list()` with all filter options combined
- Malformed JSON file skipped during rebuild (other files still imported)
- File with missing required fields skipped during rebuild
- Concurrent add() calls produce unique UUIDs and unique files
- `add()` sets `updated_at` equal to `created_at`
- `update()` sets `updated_at` to current time, preserves `created_at`
- Atomic write: process killed mid-write doesn't leave partial JSON (temp file + rename)
- Preferences personal/ memories get `shared: false`
- Other layer memories get `shared: true` by default

#### P1.2 — Types (types.test.ts)

- Type guard: `isValidMemoryLayer()` accepts valid layers, rejects invalid
- Type guard: `isValidMemoryStatus()` accepts 'active'|'deleted', rejects 'completed'|'archived'
- UUID validation: `isValidUUID()` accepts valid UUIDv4, rejects garbage

#### P1.3 — FTS5 (fts5.test.ts)

**Happy path:**
- Single-word search returns matching memories
- Multi-word search returns BM25-ranked results
- Search with layer filter returns only that layer
- Search with status filter defaults to 'active'
- FTS5 index updated on insert
- FTS5 index updated on update (content change)
- FTS5 index updated on delete

**Edge cases:**
- Empty query returns empty results
- Query with FTS5 special characters (quotes, asterisks) escaped properly
- Very long query (>500 chars) truncated
- No matches returns empty results (not error)
- Search across 2,000 memories completes in < 50ms
- Rebuild: FTS5 index rebuilt correctly from memories table

#### P1.4 — Embeddings (embeddings.test.ts)

**Happy path (with mocked model):**
- `generateEmbedding(text)` returns vector of correct dimensions
- `storeEmbedding(uuid, vector)` persists to embeddings table
- `semanticSearch(query, limit)` returns top-N by cosine similarity
- Embedding generated on add()
- Embedding updated on update() if `what` changed
- Embedding deleted on remove()

**Edge cases:**
- Model not downloaded: `semanticSearch()` returns empty with info log
- Text too short (< 10 chars): skip embedding, store null
- sqlite-vec not available: graceful degradation, functions return empty

#### P1.5 — Hooks (hooks.test.ts)

**Note:** Hook scripts are bash — test via shell execution in temp directories.

- PreToolUse hook returns JSON with additionalContext containing memory count nudge
- PreToolUse hook returns nothing when no memories match the path
- PreToolUse hook exits 0 when SQLite cache doesn't exist
- Stop hook blocks first stop with reflection prompt
- Stop hook allows second stop (stop_hook_active = true)
- UserPromptSubmit detects correction patterns (test each regex group)
- UserPromptSubmit exits silently for non-correction messages
- All hooks exit 0 on any error (never break agent)
- recall-for-path.js converts absolute path to relative for scope matching

#### P1.6 — aide_update (server.test.ts additions)

- aide_update with valid UUID updates memory and returns confirmation
- aide_update with nonexistent UUID returns "not found"
- aide_update with no change fields returns unchanged memory
- aide_update sets updated_at to current time
- aide_update does not change created_at
- Multiple fields updated in single call

#### P1.7 — CLI (cli.test.ts)

- `aide recall src/memory/` outputs formatted memories
- `aide remember "test" --layer technical` stores memory
- `aide search "authentication"` returns matching memories
- `aide list` displays all active memories
- `aide list --layer guidelines` filters by layer
- `aide stats` displays analytics summary
- `aide config capture.enabled` prints current value
- `aide config capture.enabled false` updates config
- All commands exit 1 with error when .aide/ not initialized

#### P1.11 — Config (config.test.ts)

- Load default config when no file exists
- Load config from .aide/config.json
- Set nested value via dot notation
- Get nested value via dot notation
- Add tag to presets
- Remove tag from presets
- Reset to defaults
- Invalid key rejected with error
- Invalid value type rejected with error
- Config survives malformed JSON (resets to defaults with warning)

#### P1.12 — Analytics (analytics.test.ts)

- Log event writes to analytics table
- Query events by type
- Query events by time range
- Count events by type
- Prune events older than 90 days
- Telemetry payload contains only allowed fields (no content, no paths)

#### P1.15 — Scan (scan.test.ts)

- Detect Node.js project from package.json
- Detect Python project from pyproject.toml
- Detect React from package.json dependencies
- Detect test framework from config files
- Generate appropriate memories with correct layers and scopes
- Skip scan when no recognizable project files
- Monorepo detection from workspaces config

---

## 5. Testing Plan — Integration Tests

### E2E Flows

#### Flow 1: Capture → Store → Recall Loop

**Goal:** Verify that memories survive the full lifecycle: creation → JSON file → SQLite cache → recall → cache rebuild → recall again. Proves the JSON-as-source-of-truth architecture works.

**Setup:** Fresh `.aide/` directory, populated with 5 test memories via aide_remember.

**Test steps:**
1. Store 5 memories via MCP tool (aide_remember) with different layers and scopes
2. Verify JSON files created in correct directories
3. Verify SQLite cache matches JSON files
4. Delete SQLite cache
5. Trigger cache rebuild
6. Verify all 5 memories recoverable via aide_recall
7. Verify recall order matches layer priority (area_context → technical → preferences → guidelines)
8. Verify recalled_count incremented in SQLite (not in JSON files)

**Pass criteria:** All memories survive cache deletion and rebuild. Recall order correct. Count tracking works.

#### Flow 2: Hook → MCP Tool → SQLite → Response

**Goal:** Verify the full hook-driven recall loop: PreToolUse nudges (count only, no content), agent calls aide_recall, gets memories, Stop hook prompts storage. Proves hooks never dump content and the nudge-then-query pattern works end-to-end.

**Setup:** Fresh `.aide/` with 3 memories scoped to `src/components/**`.

**Test steps:**
1. Simulate PreToolUse hook input for `src/components/Button.tsx`
2. Verify hook outputs additionalContext with nudge (count only, not full memories)
3. Call aide_recall via MCP with path `src/components/Button.tsx`
4. Verify response contains the 3 scoped memories
5. Simulate Stop hook input
6. Verify hook outputs block decision with reflection prompt
7. Call aide_remember via MCP to store a new memory
8. Verify JSON file created and SQLite updated
9. Simulate PreToolUse again for same path
10. Verify nudge count incremented to 4

**Pass criteria:** Full hook → MCP → store → hook loop works. Nudge reflects latest memory count.

#### Flow 3: FTS5 + Semantic Search Fallback

**Goal:** Verify the system-decides search strategy: FTS5 handles keyword matches, semantic search supplements when FTS5 returns few results. Proves the model doesn't need to choose the search method.

**Setup:** Store 20 memories with varied content.

**Test steps:**
1. Search via FTS5 for a keyword present in 5 memories
2. Verify 5 results returned, BM25 ranked
3. Search for a conceptual query not matching any keywords literally
4. Verify semantic search fallback triggers (if model available)
5. Verify combined results: FTS5 first, then semantic supplement

**Pass criteria:** FTS5 returns keyword matches ranked by relevance. Semantic fallback supplements when FTS5 has few results.

#### Flow 4: Post-checkout Sync + Manual Import/Export

**Goal:** Verify that git-based sync works automatically AND manually. Proves add/update/delete sync correctly, and `aide-memory sync import/export` commands work as documented.

**Setup:** Two temp directories simulating two developers.

**Test steps:**
1. Dev A: store 3 memories, commit JSON files to git
2. Dev B: clone/pull, verify post-checkout hook triggers
3. Dev B: verify 3 memories imported into their SQLite cache
4. Dev A: update memory 1, commit
5. Dev B: pull, verify memory 1 updated (newer timestamp wins)
6. Dev A: delete memory 2 (remove file), commit
7. Dev B: pull, verify memory 2 removed from their cache

**Pass criteria:** Add, update, and delete sync correctly via git + post-checkout hook.

#### Flow 5: Init → First Session → Recall

**Goal:** Verify the complete first-time user experience: init creates everything, MCP is auto-configured, scan generates useful memories, first file read triggers nudge. Proves zero-config install works end-to-end.

**Setup:** An existing Node.js project with package.json, src/ directory, existing CLAUDE.md.

**Test steps:**
1. Run `aide init --scan`
2. Verify .aide/ directory structure created
3. Verify rules files written for all tools
4. Verify config.json created with defaults
5. Verify .gitignore updated
6. Verify post-checkout hook installed
7. Verify scan generated 15+ structural memories
8. Simulate a PreToolUse hook call for a file in the project
9. Verify nudge includes scan-generated memories
10. Verify existing CLAUDE.md was NOT modified (only rules files in .claude/rules/ created)

**Pass criteria:** Full init → scan → recall flow works in under 2 minutes.

#### Flow 6: Within-Session and Cross-Session Value

**Goal:** Prove that AIDE Memory provides value both WITHIN a single session (memories captured early are recalled later) and ACROSS sessions (memories from session 1 improve session 2). This is the core value proposition test.

**Setup:** A real project with existing code.

**Test steps — within session:**
1. Start fresh session with AIDE Memory initialized
2. Work on feature A in `src/feature-a/` — agent discovers a constraint and stores it
3. Later in same session, work on feature B in `src/feature-b/` that touches shared code
4. Verify: agent is nudged about the constraint from step 2 when it reads shared code
5. Verify: agent's output respects the constraint without being explicitly reminded

**Test steps — across sessions:**
1. Session 1: work on a task, make 3 corrections to agent behavior, teach a convention
2. End session 1
3. Session 2: give a related task in the same code area
4. Verify: agent recalls corrections and convention WITHOUT being told about them
5. Score: compare session 2 output quality with vs without AIDE Memory

**Pass criteria:** Within-session: at least 1 captured memory is recalled and used within the same session. Cross-session: agent in session 2 demonstrably uses knowledge from session 1.

---

### Cross-Component Integration Points

| Integration | Components | What to verify |
|-------------|-----------|----------------|
| Hook → Store | P1.5 + P1.1 | Hooks read from new SQLite cache path, handle missing cache |
| Store → FTS5 | P1.1 + P1.3 | FTS5 index stays in sync on add/update/delete |
| Store → Embeddings | P1.1 + P1.4 | Embeddings generated on add, deleted on remove |
| Config → Hooks | P1.11 + P1.5 | Hook behavior changes when config changes (e.g., nudge disabled) |
| Config → Telemetry | P1.11 + P1.12 | Telemetry stops when config set to off |
| Init → Everything | P1.14 + all | Init creates correct state for all components |
| CLI → Store | P1.7 + P1.1 | CLI commands produce same results as MCP tools |
| Post-checkout → Store | P1.10 + P1.1 | Hook imports trigger correct cache updates |

### Multi-Tool Testing (Claude Code + Cursor minimum)

| Scenario | Claude Code | Cursor | What to verify |
|----------|------------|--------|---------------|
| Same memory store | aide_recall via MCP | aide_recall via MCP | Both tools return same memories for same path |
| Cross-tool capture | Store memory in CC session | Recall in Cursor session | Memory persists across tools |
| Rules file behavior | .claude/rules/aide-memory.md | .cursor/rules/aide-memory.mdc | Both models call aide_recall on file reads |
| Hook behavior | PreToolUse nudge works | PreToolUse nudge works (if hooks supported) | Nudge format matches tool expectations |

### Pre-ship Validation: Proving Recall Improves Output

This is the most critical test. If this fails, do not ship.

**Methodology:**

For each of the 5 scenarios (style continuity, planning persistence, technical knowledge, proactive discovery, new contributor sim):

1. **Control group (bare agent):** Fresh session, no AIDE Memory installed. Perform the task.
2. **Treatment group (AIDE Memory):** Same task, AIDE Memory installed with relevant memories pre-populated.
3. **Score both** on a rubric (see P1.17 AC above).
4. **Document differences** with concrete examples.

**Minimum success criteria:**
- Treatment group scores higher on 4/5 scenarios
- At least 2 scenarios show clear, unambiguous improvement
- No scenario where AIDE Memory makes output worse

---

## 6. Agent Strategy

### Parallel Agent Opportunities

The following components can be built by separate agents working in parallel, because they modify different files with minimal overlap:

#### Parallel Group A — Sprint 1

| Agent | Component | Files touched | Context needed |
|-------|-----------|-------------|----------------|
| Agent 1 | P1.1 + P1.2 Storage Migration | `src/memory/store.ts`, `src/memory/types.ts`, new `src/memory/file-store.ts`, all test files | Full architecture knowledge. This is the primary agent. |
| Agent 2 | P1.3 FTS5 | New `src/memory/fts5.ts`, `src/memory/fts5.test.ts` | Store interface only (adds FTS5 table to existing SQLite) |
| Agent 3 | P1.8 Rules Files | `src/templates/rules/*.md`, `src/templates/rules/*.mdc` | PRODUCT_VISION.md capabilities section, existing rules file |

#### Parallel Group B — Sprint 2

| Agent | Component | Files touched | Context needed |
|-------|-----------|-------------|----------------|
| Agent 4 | P1.5 Hook Refactoring | `scripts/hooks/*.sh`, `scripts/hooks/recall-for-path.js` | New store API, nudge format spec |
| Agent 5 | P1.6 aide_update Tool | `src/memory/server.ts` | New store API, existing MCP tool patterns |
| Agent 6 | P1.11 Config System | New `src/memory/config.ts`, `src/memory/config.test.ts` | Config schema from AC |
| Agent 7 | P1.7 CLI (first pass) | New `src/cli/aide-memory.ts`, `src/cli/commands/*.ts` | Store API, config API |

#### Parallel Group C — Sprint 3

| Agent | Component | Files touched | Context needed |
|-------|-----------|-------------|----------------|
| Agent 8 | P1.4 Embedding Pipeline | New `src/memory/embeddings.ts` | Store interface, sqlite-vec docs |
| Agent 9 | P1.10 Post-checkout Hook | New `scripts/hooks/post-checkout.sh`, `src/memory/sync.ts` | File store format, JSON schema |
| Agent 10 | P1.12 Analytics | New `src/memory/analytics.ts` | Store interface, config API |

### Sequential Components (cannot parallelize)

| Component | Why sequential | Depends on |
|-----------|---------------|------------|
| P1.14 Init | Orchestrates all other components | Everything in Sprint 1-3 |
| P1.15 Pre-train Scan | Needs init command | P1.14 |
| P1.16 npm Package | Needs all code finalized | Everything |
| P1.17 Validation | Needs everything working end-to-end | Everything |

### Context Each Agent Needs

**Every agent needs:**
- `docs/PRODUCT_VISION.md` (relevant sections only, not all 1,653 lines)
- `src/memory/types.ts` (updated types)
- This spec document (their component's AC and test plan)

**Agent 1 (Storage) additionally needs:**
- Full existing `src/memory/store.ts`, `recall.ts`, `server.ts`
- All existing test files
- Understanding of JSON file format and SQLite cache architecture

**Agent 2 (FTS5) additionally needs:**
- SQLite FTS5 documentation
- Current `store.search()` implementation

**Agent 4 (Hooks) additionally needs:**
- All existing hook scripts
- Claude Code hooks documentation
- Cursor hooks documentation (if available)

### Merging Parallel Work

- Each agent works on a dedicated feature branch (see Section 7)
- Agents modifying the SAME file (e.g., two agents both touching server.ts) must be sequenced, not parallelized
- After each parallel group completes, merge all branches to `feature/phase-1` and run full test suite
- Merge conflicts should be rare because agents touch different files
- If conflicts occur: the agent working on the "foundation" component (storage > hooks > tools) takes precedence

---

## 7. Branching & Commit Strategy

### Branch Structure

```
main
 └── feature/phase-1                     ← integration branch for all Phase 1 work
      ├── feature/phase-1/storage        ← P1.1 + P1.2 (storage migration + types)
      ├── feature/phase-1/fts5           ← P1.3 (FTS5 search)
      ├── feature/phase-1/embeddings     ← P1.4 (embedding pipeline)
      ├── feature/phase-1/hooks          ← P1.5 (hook refactoring)
      ├── feature/phase-1/update-tool    ← P1.6 (aide_update MCP tool)
      ├── feature/phase-1/cli            ← P1.7 (CLI framework)
      ├── feature/phase-1/rules          ← P1.8 + P1.9 (rules files + Cursor)
      ├── feature/phase-1/sync           ← P1.10 (post-checkout hook)
      ├── feature/phase-1/config         ← P1.11 (config system)
      ├── feature/phase-1/analytics      ← P1.12 + P1.13 (analytics + stats)
      ├── feature/phase-1/init           ← P1.14 + P1.15 (init + scan)
      └── feature/phase-1/package        ← P1.16 (npm package)
```

### Commit Conventions

**Format:** Conventional Commits with scope prefix.

```
<type>(<scope>): <description>

Types: feat, fix, refactor, test, docs, chore
Scopes: storage, fts5, embeddings, hooks, mcp, cli, rules, sync, config, analytics, init, package
```

**Examples:**
```
feat(storage): implement file-per-memory JSON storage
feat(storage): add hash-based cache rebuild
test(storage): add cache rebuild edge case tests
feat(fts5): add FTS5 virtual table and BM25 search
refactor(hooks): change PreToolUse from dump to nudge mode
feat(mcp): add aide_update tool
feat(cli): add aide init command with rules file generation
fix(storage): handle malformed JSON during rebuild
chore(package): clean dependencies for aide-memory
```

### Merge Strategy

1. **Feature branch → `feature/phase-1`:** Squash merge (clean history on integration branch). Run full test suite before merge.
2. **`feature/phase-1` → `main`:** Regular merge (preserves integration history). Only when phase is complete and validated.
3. **Merge order within a sprint:** Foundation components first (storage before hooks, types before everything).

### When to Merge

- **Feature → phase-1:** When the feature's tests pass AND integration tests with existing code pass.
- **phase-1 → main:** After P1.17 (pre-ship validation) passes. This is the "Phase 1 is done" merge.

### How to Handle Existing Code Migration

The existing `src/memory/store.ts` is the foundation. The migration approach:

1. Create new `src/memory/file-store.ts` implementing the file-per-memory architecture
2. `file-store.ts` wraps the SQLite cache (still uses `better-sqlite3` internally)
3. Update `src/memory/store.ts` to be a thin interface that delegates to `file-store.ts`
4. OR: refactor `store.ts` in place (simpler, but riskier for parallel work)
5. **Recommendation:** Refactor in place on the `feature/phase-1/storage` branch. The interface stays the same (`add`, `get`, `list`, `update`, `remove`, `search`), the implementation changes internally.

---

## 8. Migration Plan

### Context

The existing codebase uses a single SQLite database at `~/.aide/projects/<hash>/memory.db`. Phase 1 moves to one-file-per-memory with SQLite as cached index. There are no external users — only internal testing data (133 aide-memory memories stored for this project).

### Decision: Clean Break

**Rationale:** No external users exist. The product hasn't shipped. A clean break is simpler than backward compatibility.

### Existing Test Migration

**What changes:**
- `Memory.id` is no longer the primary identifier — `Memory.uuid` is
- `MemoryStatus` loses 'completed' and 'archived', keeps 'active' and 'deleted'
- `MemorySource` adds 'hook'
- `contributor` becomes required (not null)
- `tags: string[]` added (default: [])
- `shared: boolean` added
- `updated_at: string` added

**Migration steps for test files:**

1. **store.test.ts (20 tests):**
   - Update `CreateMemory` calls: add contributor (use test default like "test-user")
   - Change assertions from `memory.id` to `memory.uuid` where checking identity
   - Update status assertions: 'archived' → 'deleted'
   - Add assertions for new fields: tags, shared, updated_at
   - Add test for JSON file creation (verify file exists after add())
   - Update cleanup: delete temp `.aide/memories/` directories
   - **Estimate:** ~15 of 20 tests need minor updates, 5 need moderate rewrites

2. **recall.test.ts (varies):**
   - Minimal changes — recall logic is the same, just working with updated types
   - Update test data setup to include new required fields
   - **Estimate:** Minor updates only

3. **scopes.test.ts (varies):**
   - No changes — scope matching logic is unchanged
   - Test data setup needs new required fields
   - **Estimate:** Trivial updates

4. **server.test.ts (9 tests):**
   - Update MCP tool assertions for new fields
   - Add tests for aide_update tool
   - Update aide_forget: 'archive' mode → 'delete' mode (no more archive)
   - **Estimate:** 5-6 tests need updates, 3-4 new tests added

5. **e2e-comparison.test.ts:**
   - Update to use new store API
   - May need restructuring depending on test approach

6. **mcp-smoke.test.ts:**
   - Update for new fields in MCP responses

### Schema Migration

**Old schema (memory.db):**
```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer TEXT NOT NULL,
  what TEXT NOT NULL,
  why TEXT,
  scope TEXT,
  context_label TEXT,
  contributor TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'conversation',
  derived_from TEXT,
  created_at TEXT NOT NULL,
  recalled_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TEXT
);
```

**New schema (SQLite cache — not source of truth):**
```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  layer TEXT NOT NULL,
  what TEXT NOT NULL,
  why TEXT,
  scope TEXT,
  context_label TEXT,
  contributor TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  source TEXT NOT NULL DEFAULT 'conversation',
  shared INTEGER NOT NULL DEFAULT 1,  -- boolean
  derived_from TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  recalled_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TEXT
);
-- No status column. File exists = in cache. File deleted = removed from cache.

CREATE UNIQUE INDEX idx_memories_uuid ON memories(uuid);
CREATE INDEX idx_memories_scope ON memories(scope);
CREATE INDEX idx_memories_layer ON memories(layer);
CREATE INDEX idx_memories_status ON memories(status);
CREATE INDEX idx_memories_contributor ON memories(contributor);

-- FTS5 index
CREATE VIRTUAL TABLE memories_fts USING fts5(
  what, why, context_label,
  content=memories, content_rowid=id
);

-- FTS5 sync triggers
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, what, why, context_label)
  VALUES (new.id, new.what, new.why, new.context_label);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, what, why, context_label)
  VALUES ('delete', old.id, old.what, old.why, old.context_label);
END;

CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, what, why, context_label)
  VALUES ('delete', old.id, old.what, old.why, old.context_label);
  INSERT INTO memories_fts(rowid, what, why, context_label)
  VALUES (new.id, new.what, new.why, new.context_label);
END;

-- Embeddings table (sqlite-vec)
CREATE VIRTUAL TABLE memory_embeddings USING vec0(
  uuid TEXT PRIMARY KEY,
  embedding float[384]  -- dimension depends on model choice
);

-- Analytics table
CREATE TABLE analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  value TEXT,
  tool TEXT,
  timestamp TEXT NOT NULL
);

-- Cache metadata
CREATE TABLE cache_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Stores: schema_version, last_rebuild_hash, last_rebuild_at
```

### Data Migration for Existing memory.db Files

**One-time migration script** (`src/memory/migrate.ts`):

1. Rename old `memory.db` to `memory.db.bak`
2. Read all memories from `memory.db.bak`
3. For each memory:
   - Generate UUID
   - Set `contributor` to git config user.name (or "unknown" if not available)
   - Set `tags` to `[]`
   - Set `shared` to `true` (except preferences → `false`)
   - Set `updated_at` to `created_at`
   - Skip memories with status 'completed' or 'archived' (they were effectively deleted)
   - Write JSON file to `.aide/memories/<layer>/`
4. Rebuild SQLite cache from JSON files
5. Print summary: "Migrated N memories from legacy store to file-per-memory format. Old database preserved at memory.db.bak."

**When to run:** `aide-memory init` detects old `memory.db` and offers to migrate. Can also be run manually: `aide-memory migrate`.

**Backward compatibility:** None. Old `memory.db` is left in place (not deleted) but no longer read by the new system. Users can delete it manually.

### Migration Sequence

```
1. Update types.ts (new fields, new status values)
2. Create file-store.ts (JSON file I/O + SQLite cache)
3. Update store.ts to use new architecture (or replace with file-store.ts)
4. Update all test files for new types and behavior
5. Run tests — all must pass
6. Create migrate.ts for legacy data
7. Update server.ts MCP tools for new types
8. Update hooks for new store paths
9. Update recall.ts if needed (minimal changes expected)
```

---

## 9. Open Questions — Resolved

All questions from the original spec have been resolved. Decisions are documented here for future reference.

### Architecture — DECIDED

**Q1: Where does the SQLite cache live?** → **DECIDED: `.aide/cache/index.db` inside the project (gitignored).**
Each `.aide/` directory is self-contained per project. The cache lives inside it. Simple mental model: everything aide-memory = inside `.aide/`. The `.aide/` directory is the suite directory — future AIDE products (AIDE Map, AIDE Skills) would use `.aide/map/`, `.aide/skills/`, etc. The top-level `.aide/` is shared infrastructure.

**Q2: What happens to old `memory.db`?** → **DECIDED: Rename to `memory.db.bak`, then migrate.**
Safe — preserves data, signals it's no longer active. Migration reads from the `.bak` file and creates JSON files in `.aide/memories/`.

**Q3: Embedding model choice?** → **DECIDED: `bge-small-en-v1.5` (default). User-configurable.**

Objective comparison (MTEB benchmarks, no vendor bias):

| Model | Size | Dims | License | MTEB Score | Verdict |
|-------|------|------|---------|------------|---------|
| all-MiniLM-L6-v2 | 80MB | 384 | Apache 2.0 | 56.3 | **Outdated.** Fast inference but lowest accuracy. Skip. |
| gte-small | 67MB | 384 | MIT | ~61-62 | Good all-rounder. Alibaba DAMO. |
| **bge-small-en-v1.5** | **67MB** | **384** | **MIT** | **~62-64** | **Best balance: smallest, highest accuracy in tier, strong on retrieval.** |
| nomic-embed-text-v1.5 | 274MB | 768 | Apache 2.0 | ~62.39 | Higher dims capture code nuance better. 4x larger download. |

**Default: `bge-small-en-v1.5`** — 67MB, MIT license, company-safe, best MTEB score in the small model tier, strong on retrieval/similarity tasks relevant to code. Downloaded via `@huggingface/transformers` JS library to `~/.cache/aide-memory/models/`. No API keys. No phone-home.

Users can switch: `aide config embeddings.model nomic-embed-text-v1.5` (or any HuggingFace model name or local path). Download happens during `aide init` with progress bar. If download fails, init succeeds without embeddings — FTS5 keyword search still works. Retry: `aide init --download-model`.

Sources: MTEB Leaderboard (HuggingFace), BAAI/bge-small-en-v1.5 benchmarks.

**Q4: Should `aide-memory init` modify existing CLAUDE.md?** → **DECIDED: No. Separate rules files only.**
Init writes ONLY to `.claude/rules/aide-memory.md` and `.cursor/rules/aide-memory.mdc`. Never touches existing CLAUDE.md, .cursorrules, or copilot-instructions.md. These rules files tell the tool's model how to use aide-memory (when to call aide_recall, how to format aide_remember, etc.). Config generation that writes to CLAUDE.md is a Phase 2 pro feature.

### Implementation — DECIDED

**Q5: How does the PreToolUse nudge determine memory count?** → **DECIDED: Fast SQL COUNT query on SQLite cache.**
`SELECT COUNT(*) FROM memories WHERE <scope matches path>` — sub-millisecond. The "current path" is the file path passed by the tool's PreToolUse hook (e.g., the `file_path` from Claude Code's Read tool input). The hook always knows which file is being read. If the agent asks a question about a different path, it calls `aide_recall` directly with that path — the nudge only fires on file reads.

**Q6: Contributor auto-detection?** → **DECIDED: git config user.name as default, config as override, env var for CI.**
Priority: `AIDE_CONTRIBUTOR` env var > `.aide/config.json` contributor field > `git config user.name`.

**Q7: Should aide_forget delete the file?** → **DECIDED: Yes, delete the file. No "deleted" status.**
The `status` field is removed entirely from the schema. A memory exists (file present) or is deleted (file gone). For soft-flagging, use tags: `outdated`, `deprecated`, `needs-review`. Git history preserves deleted memories if recovery is needed. When a teammate pulls and the file is gone, their post-checkout hook removes it from their SQLite cache.

**Q8: Atomic file writes?** → **DECIDED: Temp file + rename.**
Write to `<uuid>.json.tmp`, then rename to `<uuid>.json`. Atomic on all modern filesystems. Prevents corruption on crash.

**Q8b: Sync safety — preventing import/export overwrites?** → **DECIDED: JSON files are ALWAYS source of truth.**
- Import (JSON → SQLite): Rebuilds cache from files. Uses `updated_at` timestamp — newer wins. Never overwrites newer cache data with older file data.
- Export (SQLite → JSON): Only creates MISSING JSON files. Never overwrites existing files.
- Normal operation: `add()` writes both JSON file and SQLite simultaneously, so they're always in sync.
- Edge case — SQLite has memories not in JSON: shouldn't happen (every add writes both), but `aide-memory sync export` creates the missing files as a safety net.
- Edge case — JSON has memories not in SQLite: `aide-memory sync import` (or post-checkout hook) imports them.
- No scenario where one operation must precede the other. Both are idempotent and safe to run in any order.

### Distribution — DECIDED

**Q9: Old aide-v0 code during npm publish?** → **DECIDED: Use `"files"` field in package.json.**
Standard npm approach. Include only `dist/memory/`, `dist/cli/aide-memory.js`, `scripts/hooks/`, templates. No repo restructuring needed.

**Q10: CLI binary naming?** → **DECIDED: `aide` as default binary, `aide-memory` as npm package name and fallback.**
npm package is `aide-memory`. Binary registered as both `aide` and `aide-memory` in package.json `bin` field. Users use `aide init`, `aide recall`, etc. by default. If a conflict is detected during init (another `aide` binary exists on PATH), warn: "Another `aide` binary found at <path>. Use `aide-memory` instead, or remove the conflicting binary." The `aide-memory` binary always works as a safe fallback. `npx aide-memory init` works for first-time install.

### Testing — DECIDED

**Q11: Cursor hook support?** → **RESOLVED: Cursor 1.7+ supports all needed hooks.**
Research findings (April 6, 2026):
- **PreToolUse hooks:** YES. Cursor 1.7+ supports PreToolUse hooks via `.cursor/hooks.json`. Hooks receive JSON via stdin, return allow/deny/ask decisions.
- **Stop hooks:** YES. Cursor supports Stop lifecycle hooks.
- **Configuration:** `.cursor/hooks.json` (separate from MCP config).
- **Context injection:** Cursor uses `agent_message` field (injected into agent context) and `user_message` (displayed in UI). This is equivalent to Claude Code's `additionalContext` but with different field names.
- **MCP:** `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (user-level).
- **Key implementation note:** Our hook scripts must output BOTH Claude Code format (`additionalContext`) and Cursor format (`agent_message`) — OR detect which tool is calling them and output the correct format. Simpler approach: maintain separate hook configs per tool that point to the same underlying script but format output differently.
- Sources: [Cursor Hooks Docs](https://cursor.com/docs/hooks), [Cursor MCP Docs](https://cursor.com/docs/mcp), [GitButler deep dive](https://blog.gitbutler.com/cursor-hooks-deep-dive)

**Q12: Validation scoring?** → **DECIDED: Developer scoring (a) + automated metrics (c).**
Developer scores the rubric for qualitative assessment. Automated metrics captured during integration tests for quantitative evidence (recall count, memory usage, task completion). Both used in demo materials and launch posts.

### New Questions (from feedback)

**Q13: Metrics for direct file reads?** → **KNOWN LIMITATION.**
If a tool or user reads `.aide/memories/*.json` files directly (bypassing hooks and MCP), we can't track the read. We CAN track: MCP-based recalls (aide_recall calls), hook-triggered nudges (PreToolUse events), CLI recalls. Direct file reads are invisible by design — the files are meant to be human-readable. Document this as a known limitation. Not worth building filesystem watchers to track.

**Q14: Plugin/marketplace timing?** → **DECIDED: Phase 1 (Sprint 4, alongside npm package).**
Claude Code plugin listing and Cursor marketplace/adapter listing are distribution channels, not features. Low effort, high visibility. Ship alongside the npm package.

**Q15: How do users get updates?** → **DECIDED: npm update + rules refresh command.**
- Code updates: `npm update -g aide-memory` (standard npm)
- Rules updates: `aide-memory init --update-rules` refreshes rules files without touching config, memories, or hooks. For when aide-memory ships improved rules in a new version.
- Version check: on startup, if a newer version is available on npm, print one-line suggestion: "aide-memory vX.Y.Z available. Run `npm update -g aide-memory` to update." (Non-blocking, informational only.)
- No auto-update. No forced updates. User controls when to update.

**Q16: Demo creation?** → **DECIDED: Post-validation, pre-launch.**
Individual feature demo snippets (30-60 seconds each): capture, recall, nudge, search, init, cross-session persistence. One full-flow demo (3-5 minutes): init → work → recall → cross-session. Used for: landing page, README, blog posts, HN launch, social media. See P1.19.

---

## Appendix A: JSON File Format Reference

```json
{
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "layer": "area_context",
  "what": "Skeleton loading replaces ALL legacy loaders in this module",
  "why": "Performance and UX consistency — the old shimmer loaders caused layout shifts",
  "scope": "src/components/dashboard/**",
  "context_label": "dashboard skeleton loading",
  "contributor": "meky",
  "tags": ["architecture", "performance"],
  "source": "conversation",
  "shared": true,
  "generated_by": {
    "tool": "claude-code",
    "model": "claude-opus-4",
    "author_type": "ai"
  },
  "created_at": "2026-04-06T12:00:00.000Z",
  "updated_at": "2026-04-06T12:00:00.000Z"
}
```

**No `status` field.** File exists = active. File deleted = gone. Use tags (`outdated`, `deprecated`) for soft-flagging.

**`generated_by`** tracks provenance:
- `tool`: which AI coding tool was active (claude-code, cursor, cli, null for manual)
- `model`: which LLM model (auto-detected from tool if possible, null if unknown)
- `author_type`: `"human"` = user explicitly invoked `aide remember` CLI or instructed agent. `"ai"` = agent decided to store via hook prompt or own initiative.
- Human-only memories (user ran CLI directly): `{ tool: "cli", model: null, author_type: "human" }`

**Fields NOT in JSON file (SQLite cache only):**
- `id` (auto-increment row ID)
- `recalled_count` (local tracking)
- `last_recalled_at` (local tracking)

**Filename:** `<uuid>.json` (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890.json`)

**Location:** `.aide/memories/<layer>/<uuid>.json`

---

## Appendix B: Telemetry Event Schema

```json
{
  "event": "memory_stored",
  "properties": {
    "layer": "technical",
    "source": "hook",
    "tool": "claude-code",
    "memory_count_total": 47
  },
  "timestamp": "2026-04-06T12:00:00.000Z",
  "client_id": "anonymous-hash",
  "version": "0.1.0"
}
```

**Events sent (when telemetry enabled):**

| Event | Properties | Never sent |
|-------|-----------|------------|
| `install` | version, platform, node_version | - |
| `init` | tool_count, scan_used, existing_config_count | file paths |
| `memory_stored` | layer, source, tool | memory content |
| `memory_recalled` | count, tool | paths, content |
| `search` | method (fts5/semantic), result_count | query text |
| `error` | error_type, component | stack trace |

---

## Appendix C: Sprint Calendar (Estimated)

```
Week 1-2:  Sprint 1 — Storage foundation + FTS5 + Rules files
Week 2-3:  Sprint 2 — Hooks (4: PreToolUse, Stop, UserPromptSubmit, PreCompact) + aide_update + CLI + Config + Cursor + Update mechanism
Week 3-4:  Sprint 3 — Embeddings + Sync + Analytics
Week 4-5:  Sprint 4 — Init + Pre-train + npm package + Plugin listings + User docs
Week 5-6:  Sprint 5 — Validation + Demo creation + Polish + Final docs + Launch prep

Phase 0 runs in parallel throughout (weeks 1-4).
```

**Critical path:** P1.1 (Storage) → P1.5 (Hooks) → P1.14 (Init) → P1.17 (Validation) → P1.19 (Demos)

Any delay in storage migration delays everything. This is the one component that cannot be descoped or deferred.

---

## Appendix D: Unified Agent Protocol

When spinning off parallel agents for implementation, ALL agents follow this protocol.

### Pre-work: What Every Agent Reads

1. **This spec** (`docs/specs/PHASE_0_1_SPEC.md`) — their assigned component's section
2. **Types** (`src/memory/types.ts`) — the updated type definitions
3. **Existing code** for their component (listed in their component breakdown)
4. **PRODUCT_VISION.md** — only the section relevant to their component (not all 1,653 lines)

### During Work: What Every Agent Does

1. **Work on their feature branch** (e.g., `feature/phase-1/storage`) — never commit to `feature/phase-1` directly
2. **Write tests first** (or alongside) — no code ships without tests
3. **Follow conventional commits** with scope prefix: `feat(storage): ...`, `test(fts5): ...`
4. **Mark checkboxes in this spec** as items complete (edit the spec file directly)
5. **Add implementation notes** inline in this spec under their component's AC section if they make judgment calls or encounter gaps

### After Work: What Every Agent Reports

Each agent produces a **standardized completion report** as a comment block at the end of their component's AC section in this spec:

```markdown
<!-- AGENT REPORT: P1.X — Component Name
Status: COMPLETE | PARTIAL | BLOCKED
Files created: list
Files modified: list
Tests: N passing, M failing
Judgment calls:
  - [description of any decisions made that weren't in the spec]
Gaps found:
  - [anything the spec didn't cover that needed a decision]
Issues encountered:
  - [bugs, unexpected behavior, things that need attention]
Unresolved:
  - [anything left undone and why]
-->
```

### Merge Protocol

1. Agent completes work on feature branch
2. Agent runs full test suite (`npm test`) — all tests must pass
3. Agent creates PR to `feature/phase-1` with completion report
4. PR merged (squash) to `feature/phase-1`
5. After merge: run full test suite on `feature/phase-1` to catch integration issues
6. If integration issues: the agent whose component caused the issue fixes it
7. This spec is updated with progress after each merge

### Conflict Resolution

- If two agents need the same file: the "foundation" agent takes precedence (storage > hooks > tools > CLI)
- If an agent discovers the spec is ambiguous: make a judgment call, document it in the report, continue. Don't block.
- If an agent discovers the spec is wrong: fix the issue, document the correction in the report.

---

## Appendix E: Update Mechanism

### How Users Get Updates

| What | How | User action |
|------|-----|-------------|
| New aide-memory version (code) | Published to npm | `npm update -g aide-memory` |
| Updated rules files | Shipped in new version | `aide-memory init --update-rules` |
| New hooks or hook improvements | Shipped in new version | `aide-memory init --update-rules` (re-configures hooks too) |
| New tool support (e.g., Windsurf adapter) | Shipped in new version | `aide-memory init --update-rules` (writes new tool's rules file) |
| Schema changes to JSON format | Handled by migration logic | Automatic on startup (version check in config) |

### Version Check (Non-blocking)

On any CLI command, if the installed version is older than the latest npm version:
```
aide-memory v0.1.0 → v0.2.0 available. Run `npm update -g aide-memory` to update.
```
- Check at most once per day (cache last check timestamp)
- Never block operations
- Disable via `aide-memory config updates.check false`

### Rules File Versioning

Rules files include a version comment at the top:
```markdown
<!-- aide-memory rules v0.1.0 — generated by aide-memory init -->
```
`aide-memory init --update-rules` checks this version and only updates if the installed version is newer. Never overwrites user modifications unless `--force` is used.

---

## Appendix F: Known Limitations

| Limitation | Why | Mitigation |
|-----------|-----|------------|
| Direct file reads not tracked | If a tool reads `.aide/memories/*.json` directly (bypassing hooks/MCP), we can't track the recall | Track via MCP tools (aide_recall) and hooks (PreToolUse). Document limitation. Not worth filesystem watchers. |
| Subagent hooks don't fire | Claude Code's Plan/Explore subagents don't trigger PreToolUse hooks | Known Claude Code limitation (documented in hooks test findings). Subagents miss nudges. Main agent still gets them. |
| Semantic search requires model download | ~50-100MB download during init | Download is optional. FTS5 works without it. Warn user if model missing. |
| Git history grows over time | Hundreds of memory files committed/deleted over months | ~500 bytes per file. 2,000 memories = ~1MB. Acceptable for years. Monitor in practice. |

---

## Appendix G: Embedding Model Download

**Default model:** `bge-small-en-v1.5` (MIT, ~67MB, 384 dims, MTEB ~62-64)

**Download mechanism:** Uses `@huggingface/transformers` JS library which downloads models from HuggingFace Hub.

```
aide init
  → Downloading embedding model (bge-small-en-v1.5, ~67MB)...
  → [████████████████████████████████] 100%
  → Model saved to ~/.cache/aide-memory/models/bge-small-en-v1.5/
```

**Cache location:** `~/.cache/aide-memory/models/` (shared across all projects, downloaded once).

**Offline / failed download:**
- Init succeeds without the model — semantic search disabled, FTS5 keyword search works fine
- User can retry: `aide init --download-model`
- Warning printed once per session if model missing: "Semantic search unavailable — run `aide init --download-model` to enable."

**Custom model:** `aide config embeddings.model <model-name-or-path>` — supports HuggingFace model names or local file paths.

**Using Ollama or other providers (optional, better quality):**
Users who want higher-quality embeddings can configure Ollama or other local providers:
```
aide config embeddings.backend ollama
aide config embeddings.model nomic-embed-text    # or any Ollama model
```
This requires Ollama installed and running (`ollama serve`). The default (`@huggingface/transformers` in-process) requires no external service. Other backends (OpenAI API, Gemini API) are possible but send data off-machine — document the privacy tradeoff clearly.

---

## Appendix H: Landing Page & Documentation Deployment

**Domain:** Register via Cloudflare Registrar (cheapest, includes free DNS/SSL) or Namecheap.

**Docs site stack:** Markdown source files live in the public `aide-memory` GitHub repo under `docs/`. Rendered as a website using one of:
- **Nextra** (Next.js-based, markdown → React, simple) — recommended for starting fast
- **Fumadocs** (Next.js, similar to Nextra but newer)
- **Docusaurus** (React, feature-rich, used by many OSS projects)

Source of truth is always the markdown in GitHub. Website auto-deploys from GitHub on push.

**Hosting:** Vercel (free tier, auto-deploy from GitHub, works natively with Next.js/Nextra).

**Landing page content (from P0.5):**
- Hero: one-sentence pitch + `npx aide-memory init` install command
- Feature bullets (6-8, from Phase 1 capabilities)
- Demo GIF/video (from P1.19)
- Waitlist signup (simple email form → PostHog or Mailchimp)
- Links to docs, GitHub issues
- No Phase 2+ roadmap revealed

**Stack recommendation for now:** Nextra + Vercel. Minimal setup, markdown-native, auto-deploy. Can migrate to something fancier later if needed.

---

## Appendix I: Phase 1.5+ Hook Exploration

Phase 1 ships with **4 hooks**: PreToolUse (read nudge), Stop (reflection), UserPromptSubmit (corrections + decisions + preferences), PreCompact (extract before compaction loss).

Future hooks for Phase 1.5+ exploration:

| Hook | When it fires | What it would do | Priority |
|------|--------------|-----------------|----------|
| PreToolUse (Write/Edit) | Before agent writes or edits a file | Nudge: "N memories exist about this file. Call aide_recall before modifying." | Medium — evaluate overhead from real usage first |
| UserPromptSubmit (generic) | All user prompts | Model-based relevance scoring to determine if anything is memory-worthy | Phase 2 — needs smarter filtering to avoid noise |
| UserPromptSubmit (confirmations) | User says "perfect", "exactly right" | Signal to store the confirmed approach | Low — harder to detect reliably |
| PostToolUse | After agent edits code | Flag when edits contradict existing memories (stale context detection) | Phase 2 (per PRODUCT_VISION) |
| PostCompact | After compaction completes | Log what was compacted for analytics | Low priority |
