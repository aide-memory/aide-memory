# AIDE Memory — Phase 1 Agent Master Prompt

> This is the unified instruction set for ALL implementation agents. Each agent receives this document plus their component-specific assignment.

## Context

You are implementing Phase 1 of AIDE Memory — a persistent memory layer for AI coding agents. The full spec is at `docs/specs/PHASE_0_1_SPEC.md`. The product vision is at `docs/PRODUCT_VISION.md`.

## Before You Start

1. Read `docs/specs/PHASE_0_1_SPEC.md` — find YOUR component's section (Section 1 for breakdown, Section 3 for acceptance criteria, Section 4/5 for test plan)
2. Read `src/memory/types.ts` — the type definitions you must work with
3. Read the existing code files listed in your component's "Already exists" column
4. Call `aide_recall` for any file paths you're about to work on — there are 150+ stored memories about this codebase

## Key Architecture Rules (non-negotiable)

- **JSON files are source of truth.** SQLite is a cached index, rebuildable from files.
- **No status field.** File exists = active. File deleted = gone. Tags for soft-flagging.
- **Hooks NEVER dump memory content.** Nudge/prompt only. Agent decides whether to recall.
- **All reasoning uses the native model.** MCP tools do data retrieval. Zero extra API cost.
- **Every store write goes to BOTH JSON file and SQLite simultaneously.**
- **contributor (human) + generated_by (tool/model) always both present on every memory.**
- **CLI binary is `aide`, npm package is `aide-memory`.**

## Your Workflow

1. Create your feature branch: `git checkout -b feature/phase-1/<component> feature/phase-1`
2. Write code + tests together (not code first, tests later)
3. Use conventional commits: `feat(<scope>): ...`, `test(<scope>): ...`, `fix(<scope>): ...`
4. Run `npm test` before considering yourself done — all tests must pass
5. When done, add your completion report to the spec (see format below)

## What to Flag for Human Decision

If you encounter something the spec doesn't cover, make a judgment call and document it. Use this marker in your completion report:

```
<!-- NEEDS_DECISION: [description of what needs deciding and your recommendation] -->
```

Do NOT block on unclear items. Make the best call, document it, continue.

## Completion Report Format

Add this to the spec file under your component's AC section when done:

```markdown
<!-- AGENT REPORT: P1.X — Component Name
Status: COMPLETE | PARTIAL | BLOCKED
Branch: feature/phase-1/<component>
Files created:
  - path/to/new/file.ts
Files modified:
  - path/to/existing/file.ts
Tests: N passing, M total
Judgment calls:
  - [what you decided and why]
Gaps found:
  - [anything the spec didn't cover]
Issues encountered:
  - [bugs, unexpected behavior]
NEEDS_DECISION:
  - [anything requiring human input]
-->
```

## What NOT to Do

- Don't re-debate storage architecture (decided: one-file-per-memory)
- Don't re-debate naming (decided: AIDE Memory, aide binary)
- Don't build team/pro features (Phase 2)
- Don't modify files outside your component's scope unless absolutely necessary
- Don't add dependencies without documenting why
- Don't skip tests — every feature needs tests
- Don't create CLAUDE.md or README files

## Component Assignments

Each agent receives ONE of these assignments appended to this master prompt:

### Sprint 1 Agents (can run in parallel)

**Agent A — Storage Migration (P1.1 + P1.2)**
- Scope: `src/memory/store.ts`, `src/memory/types.ts`, new `src/memory/file-store.ts`
- Read: Full spec Section 3 for P1.1 and P1.2 acceptance criteria
- Key: UUID generation, JSON file I/O, SQLite cache rebuild, hash-based cache check, directory structure, atomic writes
- Tests: Update all existing store/recall/server tests + add new file-store tests
- This is the CRITICAL PATH — everything else depends on this

**Agent B — FTS5 Search (P1.3)**
- Scope: new `src/memory/fts5.ts`, updates to `src/memory/store.ts` search method
- Read: Spec Section 3 for P1.3
- Key: FTS5 virtual table, BM25 ranking, triggers for sync, graceful fallback
- Tests: 8-10 new tests
- Can work against current store interface, integrate with new store after Agent A

**Agent C — Rules Files (P1.8)**
- Scope: new `src/templates/rules/` directory
- Read: Spec Section 3 for P1.8, PRODUCT_VISION capabilities section
- Key: Claude Code `.claude/rules/aide-memory.md`, Cursor `.cursor/rules/aide-memory.mdc`, templates for all tools
- Tests: Validate templates are valid markdown/MDC, under 2000 tokens each
- Fully independent — no code dependencies

### Sprint 2 Agents (after Sprint 1 merges)

**Agent D — Hooks (P1.5)**
- Scope: `scripts/hooks/*.sh`, `scripts/hooks/recall-for-path.js`
- 4 hooks: PreToolUse (nudge), Stop (reflection), UserPromptSubmit (corrections+decisions+preferences), PreCompact (extract before loss)

**Agent E — aide_update MCP Tool (P1.6)**
- Scope: `src/memory/server.ts`

**Agent F — CLI Framework (P1.7)**
- Scope: new `src/cli/aide-memory.ts`, `src/cli/commands/*.ts`

**Agent G — Config System (P1.11)**
- Scope: new `src/memory/config.ts`

**Agent H — Cursor Support (P1.9)**
- Scope: Cursor hook configs, MCP configs
