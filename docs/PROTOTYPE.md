# AIDE — Prototype

> The idea, the problems it solves, the solution, and how to build it.

---

## What AIDE Is

**Short:** The architectural knowledge layer that sits between the codebase and every agent/developer, so the right thing gets built the first time.

**Full:** The system that knows how your codebase works, how you want it to work, and what you've decided along the way — and makes sure every agent and every developer has that knowledge at the moment they need it, even when the conversation resets.

**Problem framing:** "Works on my machine" was Docker's problem. **"Works with my agent"** is the new problem. `.cursorrules` and `CLAUDE.md` are the markdown files of 2026 — they work until they don't, nobody keeps them updated, agents follow them inconsistently.

---

## The Problems (All From Lived Experience)

### 1. Agent doesn't learn you over time
You teach the agent your style — simpler as default, components under 100-150 lines, split even if used once, reduce conditionals, think about reusability upfront. It gets somewhat better within a session, then resets. Next session: same corrections. It should have organically learned your patterns by now.

### 2. Context compaction kills planning details
Mid-session, context fills up. Details you agreed on vanish. The skeleton loading decision ("remove ALL legacy loaders including the disabled toggle") gets reversed. You re-explain. Plan requirements like backward compatibility get silently dropped.

### 3. Plan details get lost even BEFORE coding
During planning phase, specific things you asked to incorporate don't make it into the plan. The agent needs to re-explore the codebase just to understand what you mean well enough to incorporate it. It either misses details or has to go spelunking through files mid-planning.

### 4. Agent doesn't proactively surface relevant context
The legacy feature flag off-flow has other queries that shouldn't be called in the flag-on flow. You had to notice this yourself. The agent should have explored enough to flag it — "hey, there are 3 other queries tied to this flag, do we need them?"

### 5. New dev/agent starts from zero
A new developer onboards. They could get up to speed faster if their agent already knew how things are done in each area — not just the code, but the decisions, preferences, and domain knowledge of whoever built it.

### 6. Code quality / architecture evaluation could speed up planning
Knowing "this module has high coupling" or "42/45 components use composition" is planning context that makes the agent smarter. Not a separate product — an additional context source.

### 7. SOLID drift with no pushback
Some devs (and agents) are okay with more complexity. They prioritize getting requirements done over design principles. Nobody pushes back consistently. The staff engineer can't be in every PR.

### 8. Config files don't really work
.cursorrules, CLAUDE.md — there's only so much you can put in there that will be reliably followed. The format is unstructured — no schema, no priority, no scoping to specific code areas. Agents acknowledge them, then drift toward task completion.

### 9. Guidelines that can't be linted
"Don't use waitFor unless really needed" — not enforceable via lint, but a real team convention that agents should know about. Currently lives in docs nobody reads.

---

## The Solution: MCP Memory Server

An MCP server that gives agents the context that ISN'T in the code. Agents already have good tools for reading code (Read, Grep, Glob). The gap is everything around it — decisions, preferences, domain knowledge, guidelines.

**Cost model flip:** Today: nothing persists (cheap storage) → re-explore and re-learn every session (expensive retrieval). Should be: capture and organize context once (invest in storage) → retrieval is fast and permanent (cheap, always there).

---

## Memory Layers

### Refined boundaries:

| Layer | What it captures | Example | Scope |
|-------|-----------------|---------|-------|
| **Preferences** | How contributors to this area like to work. Style, patterns, conventions from the people who built it. | "Under 150 lines, split even if used once, composition over conditionals" | Flows with the code area — if meky built `src/components/`, new contributors get meky's preferences for that area |
| **Technical context** | Facts about the stack, integrations, and infrastructure that aren't obvious from reading code. | "Apollo queries need useGraphQLGateway: true", "billing service has 30s timeout, retry with idempotency key" | Project or area scoped. Factual, not opinionated. |
| **Area context** | Decisions and conventions for a specific area — both active work and historical. What was built, how, and why. Stays relevant when new features are added later. | "Add App modal uses composition pattern", "Skeleton loading replaces ALL legacy loaders in dashboard", "DataTable columns configurable via schema, backward compatible with GroupTable" | Package/feature area. Active decisions AND historical record. |
| **Guidelines** | Team/project principles that apply broadly. Can be seeded from docs, elevated from repeated decisions, or manually added. | "Don't use waitFor unless really needed", "Separate component variants, don't use if/else", "All services need error boundaries" | Project-wide or broad area. |

**Why this split works better than domain/decisions:**
- "Technical context" = facts about how things work (objective)
- "Area context" = choices made for this part of the codebase (can be active or historical — the "Add App" feature decisions are still relevant when someone adds features there later)
- No ambiguity: "useGraphQLGateway: true" is a technical fact. "Skeleton replaces legacy loaders" is an area decision. Clear boundary.

---

## The Tools

### `aide_recall` — Get context for an area

Primary tool. Agent calls before planning, proposing, or writing code.

```
aide_recall({ paths: ["src/components/dashboard/"] })

→ preferences:  "Under 150 lines, split even if used once" (meky, primary contributor)
→ technical:    (none for this area)
→ area_context: "Skeleton replaces ALL legacy loading — no disabled toggle fallback"
                "DashboardSkeleton is its own file even though used in one place"
→ guidelines:   "Separate component variants, don't use if/else"
```

Tool description (for the agent): *"Retrieve architectural context for an area of the codebase before planning or making changes. Returns contributor preferences, technical knowledge, area decisions, and project guidelines. Call this when starting work in a codebase area, before proposing plans, or when you may have lost earlier context."*

### `aide_remember` — Store something worth keeping

Agent calls when:
- Developer corrects the agent's approach
- A decision is made during planning
- Developer teaches something codebase-specific
- Agent itself discovers something relevant during exploration

```
aide_remember({
  what: "Legacy fg-off flow has 3 queries (getUserLegacy, getPermissionsLegacy,
        getSettingsLegacy) — redundant when flag is on",
  why: "Discovered while exploring feature flag usage during planning",
  scope: "src/features/dashboard/**",
  layer: "area_context"
})
```

Tool description: *"Store knowledge that should persist beyond this conversation. Call when the developer corrects your approach, makes a decision during planning, teaches you something about the codebase, or when you discover something relevant during exploration. Store the specific knowledge — do not over-generalize from a single instance."*

### `aide_import` — Seed from existing docs

Import guidelines or technical context from existing docs.

```
aide_import({ source: "docs/TESTING_GUIDELINES.md", layer: "guidelines" })
```

### `aide_forget` — Remove outdated knowledge

### `aide_memories` — See what's stored (transparency)

---

## Competitive Landscape (Short)

**Nobody does codebase-scoped, layered memory via MCP.**

| Tool | What it is | Why it's not this |
|------|-----------|-------------------|
| Claude Code Auto-Memory | Flat markdown summary, prompt-injected | No structure, no scoping, degrades at scale |
| Cursor rules / Memory Bank | Manual markdown files, no cross-session memory | Entirely manual. Agent must be told to read them. |
| Windsurf Cascade Memories | Auto-capture of style, commands, edits. Black box. | Proprietary, no structure visible to user, workspace-locked |
| Mem0 OpenMemory | Semantic vector store via MCP | No structure — text blobs. No code awareness. |
| ConPort (Context Portal) | Structured SQLite + MCP. Typed entities. | Closest competitor. But agent-written only, no code analysis, no contributor tracking, no layering |
| mcp-memory-service | 5 memory types, 21 subtypes, embeddings | Best taxonomy. Same gap — agent fills it manually, no codebase understanding |

**Our differentiation:** Layered (not flat), scoped to code areas (not global), contributor-aware (preferences flow with who built it), seedable from docs (not just conversation capture), agent proactively stores discoveries (not just corrections).

**Closest competitor:** ConPort. Structured and MCP-native, but an empty bucket. We'd be the bucket with intelligence.

**Risk:** Platform-native memory (Claude, Windsurf) improves. Mitigated by: cross-platform, user-controlled, structured in ways they aren't.

---

## Implementation Spec (High Level)

### What we reuse from existing AIDE
- **SQLite infrastructure** — connection management, WAL mode, migrations
- **MCP server framework** — stdio JSON-RPC, tool registration (existing `aide mcp`)
- **CLI framework** — commander.js for `aide memories`, `aide import`, etc.
- **Embedding pipeline** (later) — SemanticSearchEngine if recall needs semantic matching

### What we set aside
- Tree-sitter analysis, knowledge graph, health scoring, rules engine, orchestrator, all 17 existing commands
- These could come back as a "codebase intelligence" layer if memory alone isn't enough

### Branch
New branch `ideas` off `main` (clean, no existing pivot code).

### Storage

```sql
-- ~/.aide/projects/<hash>/memory.db

CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  layer TEXT NOT NULL,           -- 'preferences' | 'technical' | 'area_context' | 'guidelines'
  what TEXT NOT NULL,            -- the content
  why TEXT,                      -- reasoning / context
  scope TEXT,                    -- glob: 'src/components/dashboard/**' or 'project'
  context_label TEXT,            -- feature grouping: 'dashboard skeleton loading', 'Add App modal'
  contributor TEXT,              -- who this came from (for preferences)
  status TEXT DEFAULT 'active',  -- 'active' | 'completed' | 'archived'
  source TEXT,                   -- 'conversation' | 'import' | 'agent_discovery' | 'elevated'
  derived_from TEXT,             -- JSON array of memory IDs (for elevated guidelines)
  created_at TEXT NOT NULL,
  recalled_count INTEGER DEFAULT 0,
  last_recalled_at TEXT
);

CREATE INDEX idx_memories_scope ON memories(scope);
CREATE INDEX idx_memories_layer ON memories(layer);
CREATE INDEX idx_memories_status ON memories(status);
CREATE INDEX idx_memories_context ON memories(context_label);
```

### Recall matching (v1 — simple)
1. Scope overlap: memory scoped to `src/components/dashboard/**` matches work in `src/components/dashboard/Sidebar.tsx`
2. Parent scope: memory scoped to `src/components/**` also matches
3. Project-wide: `project` scope always matches
4. Text relevance: if task description provided, keyword match against `what` and `context_label`
5. Layer ordering: area_context first, then technical, then preferences, then guidelines
6. Cap: ~20 memories per recall

### Recall matching (later — if simple isn't enough)
- Add embedding column to memories table
- Use existing SemanticSearchEngine for cosine similarity matching
- The infrastructure exists, it's a switch not a rebuild

### Build order
1. SQLite schema + basic CRUD
2. `aide_recall` (read path — test this first)
3. `aide_remember` (write path)
4. MCP tool registration
5. `aide_import` (seed from docs)
6. `aide_forget` + `aide_memories` (management)
7. CLI commands for browsing/pruning
8. Test with real sessions

---

## Success Criteria

| What | "Working" looks like | How to test |
|------|---------------------|-------------|
| Recall reduces corrections | Agent proposes plan matching your style without correction | Count correction rounds before vs. after |
| Decisions survive compaction | Context compaction doesn't lose planning details | Reproduce skeleton/toggle scenario in new session |
| Domain knowledge sticks | Agent knows useGraphQLGateway without being retold | New session, work in graphql area |
| New contributor gets context | Different session/tool gets stored knowledge | Simulate new session with no prior conversation |
| Agent calls tools reliably | Agent calls aide_recall >80% of the time before planning | Track call frequency |
| Noise manageable | After 2 weeks, recall returns <20 relevant items | Check memory count and relevance |

**Critical e2e test:** Take a real feature. Use AIDE for first half. Start new session (simulating compaction). See if agent picks up without re-explaining.

---

## Risks

1. **Agents might not call the tools** — existential. Tool descriptions matter. May need bootstrap via CLAUDE.md one-liner.
2. **Noise accumulation** — pruning and relevance scoring needed after initial testing.
3. **Wrong abstraction level** — agent over-generalizes from one instance. Tool description mitigates but doesn't eliminate.
4. **Platform competition** — Claude/Windsurf native memory improves. Mitigated by cross-platform, structured, user-controlled.
5. **Multi-developer conflicts** — whose preferences win for shared areas? Need contribution-weighted resolution.
