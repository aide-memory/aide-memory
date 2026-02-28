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

## Competitive Landscape (End-User Experience)

What does each tool actually feel like to use day-to-day? Not schemas and columns — what happens when you sit down, open your editor, and start working?

### The Developer Experience Comparison

#### Claude Code Auto-Memory / Cursor Rules (What You Have Today)

**What it feels like:** You write a MEMORY.md or .cursorrules file manually. The agent reads it at the start of each session. It helps for broad stuff ("use vitest not jest") but:
- You have to write and maintain it yourself
- It's one flat file — everything for the whole project in one blob
- No structure — the agent gets the whole thing every time, even stuff irrelevant to what you're working on
- When it's too long, the agent starts ignoring parts of it
- Nothing gets stored automatically — if you correct the agent 5 times about the same thing, you still have to manually add it to the file

**Honest take:** This is free and already works. For a solo dev on a small project, it might be enough. The question is whether something structured actually improves on "I wrote some notes in a markdown file."

#### ConPort (Closest MCP Competitor)

**What it feels like:** You install it as an MCP server. The agent gets 31 tools. You (or the agent) can log decisions, patterns, progress, and custom data. It persists across sessions.

**Day-to-day experience:**
- You're working on the dashboard. You tell the agent "skeleton loading replaces all legacy loaders." The agent calls `log_decision({ summary: "skeleton replaces legacy loaders", tags: ["dashboard"] })`. Good — it's stored.
- Next session, you're working on dashboard again. Does the agent know to search for dashboard-related decisions? **Only if it searches by tag or does a semantic search.** There's no "give me everything about this code area" — the agent has to know what to search for.
- You correct the agent about component style. Does it store that as a preference? **Not really** — it would go into `custom_data` or `system_patterns`, but there's no concept of "this is meky's preference for this area." It's just another entry in the same flat bucket.
- A new dev starts working in your area. **They get nothing area-specific.** They'd have to know to search for the right tags.

**Where ConPort is better than us (honestly):**
- It exists and works today. 31 tools, battle-tested, active development.
- Semantic search (ChromaDB embeddings) — can find related context even with vague queries. We'd start with keyword matching only.
- Import/export to markdown — can seed from existing docs. (We'd have this too, but they have it now.)
- Knowledge graph with explicit links between items — richer relationship modeling.
- More general purpose — can track progress, link items together, version history on project context.

**Where ConPort falls short (the actual user pain):**
- When you say "I'm working in `src/components/dashboard/`", ConPort can't give you everything scoped to that subtree. It's workspace-flat. You have to tag things consistently and search by tag. In practice, tags are inconsistent and things get lost.
- No concept of "who built this area" — if meky's preferences should flow to the next person working in that area, ConPort can't express that.
- 31 tools is a lot of surface area for an agent to navigate. More tools = more chances for the agent to call the wrong one or not call any.

#### mcp-memory-service (General-Purpose MCP Memory)

**What it feels like:** A smarter notebook. You store memories with types (observation, decision, learning, error, pattern) and tags. It finds related memories via embeddings.

**Day-to-day experience:**
- You tell the agent about WAL mode in SQLite. It stores a "learning" with tags. Good.
- Next session, you ask it to add a migration. Does it recall the WAL mode note? **Only if the agent queries something semantically similar.** "Add a migration" might not surface "use WAL mode" because they're not semantically close. You'd need "SQLite" in the query.
- It has great taxonomy (25 subtypes) and auto-consolidation of old memories. But it's not codebase-aware — it doesn't know that `src/brain/sqliteStore.ts` is related to SQLite memories.

**Where mcp-memory-service is better than us:**
- Mature embedding pipeline — hybrid BM25 + semantic search with quality scoring. Finds fuzzy matches we'd miss.
- Knowledge graph with typed edges (causes, fixes, contradicts). Richer model than flat memories.
- Auto-consolidation — old memories get compressed automatically. We'd have manual pruning.
- Dashboard UI for browsing and managing memories.

**Where it falls short:**
- It's a general-purpose memory tool, not a codebase tool. Asking "what should I know about the dashboard area?" returns semantically similar text, not path-scoped context. Two very different retrieval models.
- No structure that maps to how code is organized. Everything is global with optional project tags.

#### AIDE Memory (What We'd Build)

**What it would feel like:** You install one MCP server. The agent gets 5 tools. When you start working in an area, the agent calls `aide_recall` with the file paths — and gets back everything relevant to that specific part of the codebase, organized by type.

**Day-to-day experience:**
- You start working on `src/components/dashboard/`. Agent calls `aide_recall({ paths: ["src/components/dashboard/"] })`. It gets back: your style preferences for that area, the skeleton loading decision, the fact that DashboardSkeleton is split into its own file, and the project-wide guideline about composition over conditionals. **Automatically, without the agent having to know what to search for.**
- You correct the agent's approach — "split that into a separate file." Agent calls `aide_remember` — stores it as a preference scoped to that area, attributed to you.
- New dev works in the same area next week. Their agent calls `aide_recall` on the same paths — gets your preferences. They benefit from your decisions without ever talking to you.

**Where we'd be better:**
- The recall experience. "What do I need to know to work here?" is the natural question, and path-based scoping answers it directly. No tag hunting, no semantic query crafting.
- Simpler — 5 tools, not 31. Easier for agents to learn and call reliably.
- Contributor-aware — preferences track who established them and flow to whoever works in that area next.

**Where we'd be worse (honestly):**
- **No semantic search at launch.** If someone stores "use composition pattern" and the agent queries about "component structure," we might miss it. ConPort and mcp-memory-service would catch it via embeddings.
- **Less mature.** Both competitors have been in production, have communities, have edge cases ironed out. We'd be starting fresh.
- **Less general purpose.** If you want to track task progress, link decisions together, or build a knowledge graph — use ConPort. We're narrowly focused on the recall-at-a-path problem.
- **Noise management is unsolved.** After 100 sessions, how many memories per path? We don't have auto-consolidation like mcp-memory-service.

### The Honest Bottom Line

**Are we building something genuinely different, or just worse ConPort?**

The honest answer: it depends on whether path-scoped recall matters more than semantic search in practice.

- If developers mostly work in specific areas and want "everything relevant to this part of the codebase" → path scoping is a better retrieval model and worth building.
- If developers mostly ask vague questions like "what do we know about authentication?" → semantic search wins and ConPort/mcp-memory-service are better.

Our bet is that the codebase-aware, path-scoped model matches how developers actually work (you open a file, you're in a directory, you want context for that area). But this is an assumption we need to validate with the e2e tests below.

**Could you get 80% of AIDE's value by using ConPort with consistent tagging?** Probably yes, if you're disciplined about tags. The question is whether anyone actually is. Path scoping removes the discipline requirement — it works based on where you're working, not how carefully you tagged things.

### Risk: Platform-Native Memory

The real long-term threat isn't ConPort or mcp-memory-service — it's Claude/Cursor/Windsurf building structured persistent memory natively. When that happens, every MCP memory tool loses relevance. Mitigation: cross-platform, user-controlled, codebase-structured in ways platform memory won't be (platforms optimize for general use).

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
`feature/agent-memory` off `main`.

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

### E2E Test Plan (Real Scenarios on AIDE Codebase)

Use the AIDE codebase itself as the test project. Each scenario gets run **4 ways** across **2 platforms**:

| # | Setup | Platform |
|---|-------|----------|
| A | No memory tools (bare) | Claude Code |
| B | No memory tools (bare) | Cursor |
| C | ConPort or mcp-memory-service installed | Claude Code |
| D | AIDE memory installed | Claude Code |

This gives us the real comparison: does AIDE improve on the baseline, does it improve on existing MCP memory tools, and does any of this even matter if Cursor's built-in features already handle it?

#### Scenario 1: Style Continuity Across Sessions

**Session 1:** Work on a feature in `src/rules/`. During the work, establish preferences: "keep files under 150 lines," "split checker functions into separate files even if used once," "composition over conditionals for rule matching." Correct the agent 2-3 times to establish the pattern.

**Session 2 (new session, no prior conversation):** Ask the agent to add a new rule type (e.g., "naming conventions") to `src/rules/`.

**What to measure:**
- Does the agent propose splitting the new checker into its own file?
- Does it keep the implementation under 150 lines?
- How many corrections needed before the agent matches the style?

**What tells us something useful:**
- If **B (Cursor bare)** already gets this right because it looks at existing file patterns → the problem isn't memory, it's code-reading. Building a memory tool wouldn't help.
- If **C (ConPort)** gets this right because the agent stored preferences in session 1 → ConPort solves this already. We'd need to be better, not just different.
- If **C (ConPort)** fails because the agent didn't know to store preferences or couldn't retrieve them for the right area → that's the gap we're filling.

#### Scenario 2: Planning Details Survive Context Loss

**Session 1:** Plan a refactor of `src/analysis/treeSitterAnalyzer.ts` (1100+ lines). Agree on specific decisions:
1. "Split into 3 files: parser, relation-extractor, symbol-analyzer"
2. "Keep the TreeSitterAnalyzer class as a facade that delegates"
3. "Don't change the public API — same function signatures"

**Session 2 (new session):** Say "continue the treeSitterAnalyzer refactor we planned."

**What to measure:**
- Does the agent know the 3-file split decision?
- Does it preserve the facade pattern decision?
- Does it remember the "don't change public API" constraint?
- How much re-explaining is needed?

**What tells us something useful:**
- If **A (Claude Code bare)** remembers via auto-memory → Claude's built-in memory is already handling this. We lose the reason to build.
- If **C (ConPort)** remembers because agent logged decisions → ConPort's decision logging works. Do we add anything?
- If nobody remembers except **D (AIDE)** → we've found our value.

#### Scenario 3: Technical Knowledge Retention

**Session 1:** During work, the agent should learn (or be told):
- "SQLite uses WAL mode — never switch to DELETE journal mode"
- "better-sqlite3 is synchronous, not async — don't use await"
- "Vitest, not Jest — use `describe`/`it` from vitest, not `@jest` globals"

**Session 2 (new session):** Ask the agent to "add a migration to the SQLite store for a new table."

**What to measure:**
- Does it use synchronous better-sqlite3 API? (Not `await db.run(...)`)
- Does it respect WAL mode?
- If it writes a test, does it use vitest patterns?

**What tells us something useful:**
- Good agents might get vitest and better-sqlite3 right just by reading existing code (no memory needed). If **A** and **B** pass → this isn't a memory problem.
- WAL mode is the harder test — it's a constraint that's not always obvious from reading code. If only memory-equipped setups catch it → memory adds value for non-obvious technical context.

#### Scenario 4: Proactive Discovery

**Session 1:** Seed context (however each tool supports it) about `src/mcp/server.ts`: "MCP server uses stdio transport. When adding tools, register them with `server.tool()` not `server.setRequestHandler()`."

**Session 2 (new session):** Ask the agent to "add a new MCP tool called `get_memory_stats`."

**What to measure:**
- Does the agent recall the stored context before starting?
- Does it use `server.tool()` instead of the raw handler pattern?
- Does it proactively flag anything it discovers during exploration?

**What tells us something useful:**
- An agent can figure out the `server.tool()` pattern by reading existing code. If **A** gets this right → memory doesn't help for pattern matching, only for non-obvious constraints.
- The real test: does the agent call the memory tool unprompted? If even **D (AIDE)** doesn't call `aide_recall` without being told → we have a tool adoption problem, not a data problem.

#### Scenario 5: New Contributor Simulation

**Setup:** Over several sessions on setups C and D, build up memories for `src/cli/commands/`: style preferences, technical context (commands auto-register via index.ts import), area decisions (each command gets its own file, options defined inline).

**Test:** Give a completely fresh agent (no prior conversation, different user) access to the same memory store. Ask it to "add a new CLI command `aide prune` that removes old memories."

**What to measure:**
- Does it follow the file-per-command pattern without being told?
- Does it match the option definition style?
- How does it compare to **A** (agent that just reads the existing code)?

**What tells us something useful:**
- This is the multi-developer test. If the fresh agent with memory produces better code than one without → memory transfers knowledge between contributors. That's real value.
- If reading existing code gets the agent 90% of the way → the 10% memory adds isn't worth the complexity.

#### Scoring & Comparison Matrix

For each scenario × setup combination, score on 1-5:

| Dimension | 1 (Bad) | 5 (Good) |
|-----------|---------|----------|
| Corrections needed | 5+ corrections | 0 corrections |
| Context retained | No prior context visible | All decisions/prefs recalled |
| Style match | Generic/wrong style | Matches established patterns |
| Proactive surfacing | Agent waits to be told everything | Agent flags relevant discoveries |

**Decision criteria:**
- If **D (AIDE)** scores ≤ **C (ConPort)** on most scenarios → don't build, just use ConPort
- If **D (AIDE)** scores ≤ **A/B (bare)** → memory tools don't help for this problem, rethink the whole approach
- If **D (AIDE)** scores meaningfully higher than C on path-scoped scenarios (1, 2, 4) → path scoping justifies building
- If **B (Cursor bare)** scores close to **D** → platform-native features are already solving this, MCP memory tools aren't needed

---

## Risks

1. **Agents might not call the tools** — existential. Tool descriptions matter. May need bootstrap via CLAUDE.md one-liner.
2. **Noise accumulation** — pruning and relevance scoring needed after initial testing.
3. **Wrong abstraction level** — agent over-generalizes from one instance. Tool description mitigates but doesn't eliminate.
4. **Platform competition** — Claude/Windsurf native memory improves. Mitigated by cross-platform, structured, user-controlled.
5. **Multi-developer conflicts** — whose preferences win for shared areas? Need contribution-weighted resolution.
