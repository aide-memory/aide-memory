# Session Handoff — April 2, 2026

## Where We Are

Product vision is complete and on main. Ready for Phase 0 + Phase 1 implementation planning.

## What To Read First

1. `docs/PRODUCT_VISION.md` — the source of truth (1,653 lines). Has all capabilities, phases, pricing, architecture, competitive landscape, free/pro gating.
2. Call `aide_recall` or `aide_search` for stored memories — 40+ memories covering every decision from this session.

## What To Build Next

### Phase 0 (1-2 weeks, overlaps Phase 1)
- Domain + landing page (aide-memory.dev or useaide.dev)
- Legal (trademark search, EULA for proprietary freeware, explore company registration)
- GitHub repo (docs + issues + releases only, no source code)
- npm package reserved
- Website with copy-paste install command

### Phase 1 (4-6 weeks from existing codebase)
- Capture → store → recall loop (core engine)
- One file per memory in .aide/memories/<layer>/ (JSON files, SQLite as cached index)
- 3 hooks (PreToolUse nudge, Stop prompt, UserPromptSubmit correction detection)
- FTS5 + sqlite-vec for search
- Claude Code + Cursor support (rules files for all tools by default)
- aide config, aide_update MCP tool, aide stats
- aide init --scan (pre-train mode)
- Default telemetry ON
- Pre-ship validation: prove recall improves agent output

### Existing Code to Build On
- `src/memory/store.ts` — SQLite store (20 tests)
- `src/memory/recall.ts` — Path-scoped recall engine (18 tests)
- `src/memory/server.ts` — MCP server with 5 tools (9 tests)
- `scripts/hooks/` — 3 working hooks
- 47 tests passing, zero type errors

### Key Architecture Decisions (don't re-debate)
- One file per memory (UUID JSON), SQLite as cached index
- Git IS the sync (post-checkout hook)
- Native model for all reasoning (MCP returns data, agent reasons)
- Slash commands = primary UX, CLI = fallback
- Rules files written for ALL tools at init (no detection)
- Proprietary freeware licensing
- Free: capture + recall + basic stats (YOUR memories only)
- Pro: config gen, cleanup, team recall, packs, import, privacy, analytics, session handoff
- Layered soft gates in compiled binary (gate intelligence, not data)
- Contributor field from day one (free and pro)

### What NOT To Do
- Don't re-debate storage architecture (decided: one-file-per-memory)
- Don't re-debate free/pro gating (decided: layered soft gates)
- Don't re-debate naming (decided: AIDE Memory, aide = helper)
- Don't build team features yet (Phase 2, driven by Phase 1 user feedback)
- Don't build Import, Privacy, extra tools yet (deferred to Phase 2+)

## Output Expected
- `docs/specs/PHASE_0_SPEC.md` — what to do, in what order
- `docs/specs/PHASE_1_SPEC.md` — implementation plan, component breakdown, what to build first
