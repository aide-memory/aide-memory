# AIDE — Session Context

> Active context for continuity across sessions. Updated Feb 28, 2026.
> This is the "what we're thinking and doing RIGHT NOW" doc.

---

## Where We Are

We've pivoted from "architecture scanning/linting tool" to "persistent memory layer for AI coding agents." The core insight: agents don't need better code reading tools — they need the context that ISN'T in the code (decisions, preferences, domain knowledge, guidelines).

## Current State

- **Branch:** `ideas` (off `main`, clean start)
- **Working doc:** `docs/PROTOTYPE.md` — the thing we're building
- **No code written yet** — still refining the idea

## Key Decisions Made in This Session

1. **AIDE is a memory layer, not a linter/scanner.** Health scores, rules.yaml, config generation deprioritized.
2. **MCP server is the primary interface.** CLI is secondary.
3. **Four memory layers:** preferences, technical context, area context, guidelines.
4. **Start simple:** path + keyword matching for recall. Add embeddings later if needed.
5. **New branch off main.** Don't carry the 17 existing commands.
6. **Existing AIDE infra to reuse:** SQLite, MCP framework, CLI (commander.js).
7. **Set aside for now:** Tree-sitter, knowledge graph, rules engine, orchestrator, health scoring.
8. **Codebase graph is additive, not essential for v1.** Could come back as "codebase intelligence" layer.

## Founder's Primary Pain Point

"My agent doesn't learn me. It gets somewhat better within a session, then resets. I have to re-teach my style, re-explain decisions, re-correct the same things. And when context compacts mid-session, planning details vanish."

Specific things the agent should retain:
- Component preferences (under 150 lines, split even if used once, composition over conditionals)
- Codebase-specific knowledge (useGraphQLGateway: true)
- Planning decisions that get lost when context fills up
- Proactive discoveries (agent should flag legacy queries tied to a feature flag, not wait for dev to notice)

## What's Next

1. Review PROTOTYPE.md for completeness
2. Validate: does the tool design / memory layer structure make sense?
3. Start building — schema, recall tool, remember tool, MCP registration
4. Test with real work sessions

## Doc Map

| Doc | Purpose |
|-----|---------|
| `docs/SESSION_CONTEXT.md` | This file — active context for session continuity |
| `docs/PROTOTYPE.md` | The idea, problems, solution, competitive landscape, implementation spec |
| `docs/RESEARCH.md` | All problems explored + market research + competitive analysis |
| `docs/archive/` | Original docs from earlier exploration (PIVOT_PLAN, NEXT_STEPS, etc.) |
