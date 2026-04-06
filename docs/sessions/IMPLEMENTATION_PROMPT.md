# Implementation Planning Prompt — Phase 0 + 1

Use this prompt to kick off a new session for creating the technical spec.

---

## Prompt

Read these files in order before doing anything else:

1. `docs/sessions/HANDOFF_APRIL2.md` — session handoff with key decisions and what NOT to re-debate
2. `docs/PRODUCT_VISION.md` — full product vision (1,653 lines). This is the source of truth for all capabilities, phases, pricing, architecture, competitive landscape, and free/pro gating decisions.
3. Call `aide_recall` or `aide_search` to pull stored memories from this project — there are 40+ memories covering every architectural and product decision.
4. Read the existing codebase: `src/memory/store.ts`, `src/memory/recall.ts`, `src/memory/server.ts`, `src/memory/types.ts`, `scripts/hooks/` — understand what's already built and working (47 tests passing).

After reading all of the above, create a consolidated Phase 0 + Phase 1 technical spec at `docs/specs/PHASE_0_1_SPEC.md`.

The spec should include:

### 1. Component Breakdown
For each component/feature in Phase 0 + 1 (from the PRODUCT_VISION.md Phase 0 and Phase 1 tables), break it down into:
- What needs to be built vs what already exists
- Dependencies between components (what must be built first)
- Estimated effort per component (S/M/L)

### 2. Build Order
Sequence the components based on dependencies. What gets built first, second, third. Group into sprints or milestones if helpful. Consider what can be built in parallel by spinning off separate agents for independent components.

### 3. Acceptance Criteria (AC)
For EVERY component/feature, write explicit acceptance criteria:
- What does "done" look like?
- What are the edge cases?
- What inputs/outputs are expected?
- What should happen on failure/error?

### 4. Testing Plan — Unit Tests
For each component, specify:
- What unit tests are needed
- What to mock vs test directly
- Coverage targets
- Key test cases (happy path + edge cases)

### 5. Testing Plan — Integration Tests  
For each feature area, specify:
- End-to-end flows to test (capture → store → recall loop, hook → MCP tool → SQLite → response)
- Cross-component integration points
- Multi-tool testing (Claude Code + Cursor minimum)
- Pre-ship validation: how to prove recall actually improves agent output

### 6. Agent Strategy
For implementation, identify which components can be built by spinning off separate agents in parallel:
- Which components are independent enough for parallel agent work?
- Which must be sequential?
- What context does each agent need?
- How to merge parallel work without conflicts?

### 7. Branching & Commit Strategy
- Create `feature/phase-1` off main
- Per-component feature branches off phase-1 (e.g., `feature/phase-1/fts5-search`, `feature/phase-1/file-per-memory`)
- Commit conventions (conventional commits? scope prefixes?)
- When to merge back to phase-1, when to merge phase-1 to main
- How to handle the existing code migration (current single SQLite → one-file-per-memory architecture)

### 8. Migration Plan
The existing codebase uses a single SQLite store. Phase 1 moves to one-file-per-memory with SQLite as cached index. Plan:
- How to migrate existing tests
- How to migrate existing schema
- Backward compatibility (or clean break?)
- Data migration for any existing memory.db files

### 9. Open Questions
Flag anything that needs a decision before implementation can start. Don't re-debate decided items (see HANDOFF_APRIL2.md "What NOT To Do") but flag genuinely new implementation questions.

### Key Constraints
- All reasoning uses the native model (MCP returns data, agent reasons). No separate LLM.
- Proprietary freeware — code should be minifiable/bundleable. No source in public repo.
- Phase 1 is FREE tier only. Pro features are deferred. But the architecture must support adding pro gating later (contributor field from day one, binary license check pattern).
- Ship the foundation correctly from the start — don't build something that needs to be rebuilt for Phase 2.
- Rules files for ALL tools written at init (no detection of installed tools).
- 3 hooks: PreToolUse (nudge), Stop (prompt to remember), UserPromptSubmit (correction detection).
- Hidden nudging via additionalContext (invisible in terminal).
- Default telemetry ON (opt-out).
