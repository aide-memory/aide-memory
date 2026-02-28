# AIDE — Session Context

> Active context for continuity across sessions. Updated Feb 28, 2026.
> This is the "what we're thinking and doing RIGHT NOW" doc.

---

## Where We Are

We've pivoted from "architecture scanning/linting tool" to "persistent memory layer for AI coding agents." The core insight: agents don't need better code reading tools — they need the context that ISN'T in the code (decisions, preferences, domain knowledge, guidelines).

## Current State

- **Branch:** `main` has all up-to-date docs
- **Feature branch:** `feature/agent-memory` (off main, for implementation)
- **Working doc:** `docs/PROTOTYPE.md` — full spec with honest competitive analysis + e2e test plan
- **No code written yet** — still refining the idea and validating differentiation

## Key Decisions Made

1. **AIDE is a memory layer, not a linter/scanner.** Health scores, rules.yaml, config generation deprioritized.
2. **MCP server is the primary interface.** CLI is secondary.
3. **Four memory layers:** preferences, technical context, area context, guidelines.
4. **Start simple:** path + keyword matching for recall. Add embeddings later if needed.
5. **Clean branch off main.** Don't carry the 17 existing commands.
6. **Existing AIDE infra to reuse:** SQLite, MCP framework, CLI (commander.js).
7. **Set aside for now:** Tree-sitter, knowledge graph, rules engine, orchestrator, health scoring.
8. **Branch strategy:** `main` holds docs, `feature/agent-memory` for implementation.

## Competitive Position (Honest)

- **ConPort** is the closest competitor — same approach (structured SQLite + MCP), similar entity types. Our real differentiators: **path-scoped recall** (they're workspace-flat) and **contributor awareness** (they have none). Our layering is similar to their entity types under different names. They could add path scoping easily — the moat isn't the schema.
- **mcp-memory-service** is genuinely different — flat semantic store, great taxonomy but no codebase structure. Better embeddings than us.
- **Platform-native memory** (Claude, Windsurf) is the real long-term threat.
- **Key question still open:** Is our focused, opinionated approach enough to justify building vs. using ConPort with good prompting?

## Founder's Primary Pain Point

"My agent doesn't learn me. It gets somewhat better within a session, then resets. I have to re-teach my style, re-explain decisions, re-correct the same things. And when context compacts mid-session, planning details vanish."

Specific things the agent should retain:
- Component preferences (under 150 lines, split even if used once, composition over conditionals)
- Codebase-specific knowledge (useGraphQLGateway: true)
- Planning decisions that get lost when context fills up
- Proactive discoveries (agent should flag legacy queries tied to a feature flag, not wait for dev to notice)

## What's Next

1. **Validate differentiation** — does path-scoped recall actually matter in practice? Consider quick test with ConPort to see if workspace-flat recall is "good enough"
2. **If differentiation holds:** Start building — schema, recall tool, remember tool, MCP registration
3. **Run e2e test scenarios** from PROTOTYPE.md on the AIDE codebase itself
4. **Test with real work sessions** — use it during actual development

## Doc Map

| Doc | Purpose |
|-----|---------|
| `docs/SESSION_CONTEXT.md` | This file — active context for session continuity |
| `docs/PROTOTYPE.md` | Full spec: problems, solution, tools, competitive landscape, implementation, e2e test plan |
| `docs/RESEARCH.md` | Summary of all problems explored + market research (archive has full detail) |
| `docs/archive/` | Original docs: PIVOT_PLAN, NEXT_STEPS, PRODUCT_EVALUATION, PRODUCT_CHANGES_SUMMARY, IMPLEMENTATION_REPORT, CONSOLIDATED_RESEARCH |
