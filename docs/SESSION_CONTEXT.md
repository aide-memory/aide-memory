# AIDE — Session Context

> Active context for continuity across sessions. Updated Mar 1, 2026.
> This is the "what we're thinking and doing RIGHT NOW" doc.

---

## Where We Are

aide-memory MVP is built and tested. MCP server with 6 tools (aide_recall, aide_remember, aide_forget, aide_memories, aide_search, aide_import), SQLite-backed, path-scoped recall. Two rounds of E2E testing complete. Now pivoting to hooks-based adoption.

## Current State

- **Branch:** `feature/agent-memory` — all implementation + test results
- **Round 2 E2E results:** `docs/IMPLEMENTATION_PROGRESS.md` — comprehensive analysis
- **Hooks implementation plan:** `docs/HOOKS_IMPLEMENTATION.md` — next phase
- **82 tests passing** (74 unit + 8 smoke)
- **round2-run-b branch** preserved at `c7435d6` (Run B code: tags, stats, extra methods)
- **feature/agent-memory** has Run A code (pruneOld, ScopeResolver, aide_search, search CLI)

## Key Findings from Round 2

1. **Rules fix aide_recall adoption:** 0% → 75% proactive calls. Confirmed across separate sessions.
2. **aide_recall doesn't improve intra-session code quality.** Bare agent reads code directly and produces equivalent results. Fair test — separate sessions, same prompts.
3. **aide_remember is completely broken:** 0% across all tests, all rounds. Rules aren't enough.
4. **Cross-area isolation works:** path-scoped recall returns only relevant context.
5. **Negligible overhead:** 727 tokens (0.4%). Run B used fewer tokens than Run A (76k vs 83k).
6. **Untested value prop:** Cross-session persistence (corrections, preferences surviving session boundaries).

## Active Decision

**aide_recall works mechanically but doesn't prove value for intra-session tasks.** The real value is cross-session, but we can't test cross-session until aide_remember works (need to store knowledge in session 1 to recall in session 2). Therefore: **fix aide_remember first via hooks, then run cross-session tests.**

## What's Next (Priority Order)

1. **Implement hooks** — `Stop` hook for aide_remember nudge, `UserPromptSubmit` for correction detection, `PreToolUse` on Read for automatic aide_recall injection. See `docs/HOOKS_IMPLEMENTATION.md`.
2. **Run cross-session correction persistence test** — Session 1: teach corrections + verify aide_remember fires. Session 2: new session, does agent use stored knowledge?
3. **Test with Cursor** — hooks are Claude Code specific. Cursor integration needs different approach (MCP-only, no hooks).

## Code on feature/agent-memory (committed, worth keeping)

From Run A (bare agent, all tests pass, good quality code):
- `src/memory/store.ts` — `pruneOld()`, `search()` methods added
- `src/memory/scopes.ts` — ScopeResolver class (133 lines, 29 tests)
- `src/memory/server.ts` — `aide_search` MCP tool added
- `src/cli/commands/search.ts` — aide search CLI command (61 lines, 7 tests)
- `src/memory/index.ts` — updated exports

From round2-run-b (preserved but NOT merged — has extra unrequested code):
- `src/memory/tags.ts` — TagStore (bonus, not prompted)
- `src/cli/commands/stats.ts` — aide stats CLI (bonus, not prompted)
- `src/memory/store.ts` — `getStats()`, `mostRecalled()`, `leastRecentlyUsed()` (extra methods)

## Doc Map

| Doc | Purpose |
|-----|---------|
| `docs/SESSION_CONTEXT.md` | This file — active context |
| `docs/IMPLEMENTATION_PROGRESS.md` | Full implementation report: MVP build + Round 1 + Round 2 E2E results |
| `docs/HOOKS_IMPLEMENTATION.md` | **NEW** — Hooks phase: plan, implementation, testing |
| `docs/PROTOTYPE.md` | Original spec: problems, solution, competitive landscape |
| `docs/RESEARCH.md` | Market research summary |
| `docs/archive/` | Pre-pivot docs |
