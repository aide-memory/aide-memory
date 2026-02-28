# AIDE Memory — Implementation Progress

> Tracking what's built, what's tested, and real findings as we go.
> Updated: Feb 28, 2026

---

## Build Status

| Component | Status | Tests | Notes |
|-----------|--------|-------|-------|
| SQLite schema + store | Done | 20/20 | `src/memory/store.ts` — CRUD, WAL mode, migrations |
| Recall engine | Done | 18/18 | `src/memory/recall.ts` — path scoping, glob inheritance, keyword boost, layer ordering |
| MCP server (5 tools) | Done | 9/9 | `src/memory/server.ts` — aide_recall, aide_remember, aide_forget, aide_memories, aide_import |
| CLI entry point | Done | manual | `src/memory/cli.ts` — stdio verified working |
| E2E comparison | Pending | — | ConPort vs mcp-memory-service vs AIDE on real scenarios |

**Total: 47 tests passing. Zero type errors.**

---

## Architecture

```
src/memory/
├── types.ts        # MemoryLayer, RecallQuery, Memory, etc.
├── store.ts        # SQLite CRUD — MemoryStore class
├── recall.ts       # Path-scoped matching + scoring
├── server.ts       # MCP server with 5 tools + markdown import
├── cli.ts          # Stdio entry point
├── index.ts        # Public exports
└── __tests__/
    ├── store.test.ts    # 20 tests
    ├── recall.test.ts   # 18 tests
    └── server.test.ts   # 9 tests
```

No dependencies on old AIDE modules (brain, analysis, orchestration, etc.). Clean module with its own types, store, and server.

---

## How to Run

### As MCP server (for Claude Code, Cursor, etc.)

Add to your MCP config:
```json
{
  "mcpServers": {
    "aide-memory": {
      "command": "npx",
      "args": ["ts-node", "/path/to/aide-v0/src/memory/cli.ts", "/path/to/your/project"]
    }
  }
}
```

### Tools available to agents

| Tool | Purpose |
|------|---------|
| `aide_recall` | Get context for a code area (paths, query, layers) |
| `aide_remember` | Store a decision, preference, or fact |
| `aide_forget` | Archive or delete a memory |
| `aide_memories` | List what's stored |
| `aide_import` | Seed from markdown docs |

---

## Key Design Decisions

1. **Path-scoped recall is the core retrieval model.** Agent provides file paths → gets everything relevant to that subtree. No manual tagging needed.

2. **Layer ordering on output.** area_context first (most specific), then technical, then preferences, then guidelines. Agent gets the most relevant context at the top.

3. **Parent scope inheritance.** Memory scoped to `src/components/dashboard/**` also shows up when querying `src/components/` — because the dashboard is within components.

4. **Keyword boosting, not semantic search.** v1 uses simple word matching. Embeddings can be added later without schema changes (just add a column).

5. **47 tests > 0 tests.** Unlike ConPort and mcp-memory-service, which we'll compare against, every layer of our stack is tested with vitest.

---

## E2E Comparison (Pending)

### Test Matrix

| # | Setup | Platform |
|---|-------|----------|
| A | No memory tools (bare) | Claude Code |
| B | No memory tools (bare) | Cursor |
| C | ConPort installed | Claude Code |
| D | ConPort installed | Cursor |
| E | mcp-memory-service installed | Claude Code |
| F | mcp-memory-service installed | Cursor |
| G | AIDE memory installed | Claude Code |
| H | AIDE memory installed | Cursor |

### Scenarios

1. Style continuity across sessions
2. Planning details survive context loss
3. Technical knowledge retention
4. Proactive discovery
5. New contributor simulation

### Results

_Results will be added as each scenario is tested. Each entry will include:_
- _The actual agent interaction (what was said, what the agent did)_
- _What the agent got right/wrong_
- _Raw tool call logs where applicable_
- _Score (1-5) with justification_

---

## What's Next

1. Test AIDE memory on this codebase (self-host — use aide-memory while building aide-memory)
2. Install ConPort + mcp-memory-service for comparison
3. Run scenario 1 (style continuity) across all 8 setups
4. Document real results with actual agent output
