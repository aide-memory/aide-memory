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

## Competitive Landscape (Honest Assessment)

### The Field

| Tool | What it actually does | Scoping | Contributor tracking |
|------|----------------------|---------|---------------------|
| **ConPort** | Structured SQLite + MCP. 9 entity types (decisions, patterns, custom_data, etc.), 31 tools. FTS5 + ChromaDB semantic search. Markdown import/export. | Workspace-level only. One DB per project. No path/area scoping within a project. | None. Explicitly single-user. |
| **mcp-memory-service** | Semantic memory store. 5 base types / 25 subtypes. SQLite-vec for vectors, hybrid BM25+semantic retrieval. Knowledge graph with 6 edge types. Dashboard UI. | Global store with optional `proj:` tag. No path scoping. | None. `client_hostname` only. |
| **Claude Code Auto-Memory** | Flat markdown summary, prompt-injected | Per-project MEMORY.md | None |
| **Cursor rules / Memory Bank** | Manual markdown files | Per-project | None |
| **Windsurf Cascade Memories** | Auto-capture of style, commands, edits. Best auto-learning. | Workspace-locked | Black box |
| **Mem0 OpenMemory** | Semantic vector store via MCP | Global | None |

### ConPort Deep Dive (Closest Competitor)

ConPort is the most similar tool. Same foundational stack: SQLite, MCP, structured entities, workspace-scoped DB. We'd be building a more opinionated version of the same infrastructure approach. Being honest about what's the same and what's different:

**What ConPort already does that we'd also do:**
- Structured memory with typed categories (decisions, patterns, custom_data ≈ our layers)
- SQLite storage per project
- MCP tool interface
- Seedable from docs (`import_markdown_to_conport`)
- FTS search across stored content

**What we'd do that ConPort doesn't:**
1. **Path-scoped recall with glob inheritance** — the biggest real differentiator. `aide_recall({ paths: ["src/components/dashboard/"] })` returns everything relevant to that subtree, with parent scope inheritance. ConPort has no mechanism for this — everything is workspace-flat. You'd have to manually tag things "dashboard" and hope you're consistent.
2. **Contributor-aware preferences** — who stored what matters for the preferences layer. "meky built src/components/ so new contributors get meky's style preferences for that area." ConPort has zero attribution.
3. **Layer-ordered retrieval** — area_context first, then technical, then preferences, then guidelines. ConPort returns results sorted by semantic similarity. Ours is intentionally ordered by relevance type.

**Where our differentiation is weaker than it sounds:**
- Our 4 layers vs. ConPort's entity types are different vocabularies for similar concepts. `decisions` ≈ `area_context`. `system_patterns` ≈ `guidelines`. The structure is similar; the naming is different.
- ConPort could add a `scope TEXT` column and close the path-scoping gap in an afternoon. The schema isn't the moat.

### mcp-memory-service Deep Dive

Genuinely different from what we're building. They're a flat semantic store with a great taxonomy but no structure that maps to how codebases are organized.

- `retrieve_memory("dashboard skeleton loading")` returns similar-sounding text from anywhere
- `aide_recall({ paths: ["src/components/dashboard/"] })` returns everything scoped to that subtree

These are different retrieval models. mcp-memory-service is closer to a general-purpose AI memory; we'd be codebase-specific.

Their strengths over us: mature embedding pipeline, hybrid BM25+semantic search, knowledge graph with typed edges, autonomous consolidation of old memories, dashboard UI. If we later need semantic search, we'd be rebuilding what they already have.

### Where We Actually Win

1. **Path-based scoping** — novel retrieval model for code context. Neither competitor has it.
2. **Contributor attribution** — real for multi-developer teams. Neither has it.
3. **Opinionated layer ordering** — small but meaningful UX improvement on retrieval.
4. **Focused scope** — we solve one problem (agent memory for code) vs. general-purpose memory. This means simpler tool descriptions, which means agents call them more reliably.

### Where We Don't Win

- **Taxonomy breadth** — mcp-memory-service has 25 subtypes, knowledge graph edges, consolidation. We'd be simpler.
- **Seedable from docs** — ConPort already does this. Not a differentiator from them.
- **Semantic search** — both competitors are ahead. We'd start with keyword matching and add embeddings later.
- **Maturity** — ConPort has 31 tools, battle-tested. We'd have 5.

### The Real Moat Question

The moat isn't the schema — it's:
1. **Adoption** — do agents reliably call the tools?
2. **Quality of stored content** — does useful stuff actually get captured?
3. **Tool descriptions** — are they specific enough that agents use them at the right time?

ConPort could add path scoping easily. mcp-memory-service could add codebase structure. The question is whether our focused, opinionated approach gets adopted faster than their general-purpose flexibility.

### Real Risk

**Platform-native memory** (Claude's auto-memory, Windsurf's Cascade Memories) is the actual long-term threat, not ConPort. When Claude/Cursor/Windsurf build structured persistent memory natively, every MCP memory tool becomes less relevant. Mitigation: cross-platform, user-controlled, structured in ways platform memory won't be (platforms optimize for general use, not codebase-specific scoping).

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

### E2E Test Plan (Real Scenarios on AIDE Codebase)

Use the AIDE codebase itself as the test project. Run each scenario 3 ways:
- **Baseline:** Agent with no memory tools (plain Claude Code / Cursor)
- **Existing tools:** Agent with ConPort or mcp-memory-service installed
- **AIDE memory:** Agent with aide_recall / aide_remember

#### Scenario 1: Style Continuity Across Sessions

**Setup:** In session 1, work on a feature in `src/rules/`. During the work, establish preferences: "keep files under 150 lines," "split checker functions into separate files even if used once," "composition over conditionals for rule matching." Correct the agent 2-3 times to establish the pattern.

**Test:** Start session 2. Ask the agent to add a new rule type (e.g., "naming conventions") to `src/rules/`.

**Measure:**
- Does the agent propose splitting the new checker into its own file? (Baseline: probably puts it all in rulesChecker.ts)
- Does it keep the implementation under 150 lines?
- How many corrections needed before the agent matches the style?

**What we expect:**
- Baseline: 3-5 corrections, agent defaults to monolithic approach
- Existing tools: depends on whether agent stored the preferences in session 1 (likely didn't without prompting)
- AIDE memory: 0-1 corrections — `aide_recall({ paths: ["src/rules/"] })` returns the stored preferences

#### Scenario 2: Planning Details Survive Context Loss

**Setup:** Start planning a refactor of `src/analysis/treeSitterAnalyzer.ts` (1100+ lines). During planning, agree on specific decisions:
1. "Split into 3 files: parser, relation-extractor, symbol-analyzer"
2. "Keep the TreeSitterAnalyzer class as a facade that delegates"
3. "Don't change the public API — same function signatures"

Let the agent write the plan. Then simulate context compaction by starting a new session.

**Test:** In the new session, say "continue the treeSitterAnalyzer refactor we planned."

**Measure:**
- Does the agent know the 3-file split decision?
- Does it preserve the facade pattern decision?
- Does it remember the "don't change public API" constraint?
- How much re-explaining is needed?

**What we expect:**
- Baseline: agent has no idea, re-explores the file, proposes its own split strategy
- Existing tools: partial recall if agent happened to log decisions
- AIDE memory: `aide_recall({ paths: ["src/analysis/"] })` returns all 3 decisions as area_context

#### Scenario 3: Technical Knowledge Retention

**Setup:** Work in the AIDE codebase. During session 1, the agent should learn (or be told):
- "SQLite uses WAL mode — never switch to DELETE journal mode"
- "better-sqlite3 is synchronous, not async — don't use await"
- "Vitest, not Jest — use `describe`/`it` from vitest, not `@jest` globals"

**Test:** In a new session, ask the agent to "add a migration to the SQLite store for a new table."

**Measure:**
- Does it use synchronous better-sqlite3 API? (Not `await db.run(...)`)
- Does it respect WAL mode?
- If it writes a test, does it use vitest patterns?

**What we expect:**
- Baseline: 50/50 — might guess right on some, wrong on others
- AIDE memory: `aide_recall({ paths: ["src/brain/"] })` returns technical context about SQLite patterns

#### Scenario 4: Proactive Discovery

**Setup:** Seed the memory with area context for `src/mcp/server.ts`: "MCP server uses stdio transport. When adding tools, register them with `server.tool()` not `server.setRequestHandler()`."

**Test:** Ask the agent to "add a new MCP tool called `get_memory_stats`."

**Measure:**
- Does the agent call `aide_recall` before starting?
- Does it use `server.tool()` instead of the raw handler pattern?
- Does it proactively flag anything it discovers during exploration (e.g., "I noticed the existing tools don't validate input schemas — should I add validation to the new one?")?

#### Scenario 5: New Contributor Simulation

**Setup:** Over several sessions, build up memory for `src/cli/commands/`: preferences (imperative style, commander.js action pattern), technical context (commands auto-register via index.ts import), area context (each command gets its own file, options defined inline not in separate config).

**Test:** Give a fresh agent (no prior conversation) access to the AIDE memory. Ask it to "add a new CLI command `aide prune` that removes old memories."

**Measure:**
- Does it follow the file-per-command pattern without being told?
- Does it match the option definition style?
- Compare output quality vs. an agent that only has the source code to reference

#### Comparison Framework

For each scenario, score on 1-5 scale:

| Dimension | 1 (Bad) | 5 (Good) |
|-----------|---------|----------|
| Corrections needed | 5+ corrections | 0 corrections |
| Context retained | No prior context visible | All decisions/prefs recalled |
| Style match | Generic/wrong style | Matches established patterns |
| Proactive surfacing | Agent waits to be told everything | Agent flags relevant discoveries |
| Tool usage | Never calls memory tools | Calls recall before planning, remember after decisions |

**Pass threshold:** AIDE memory should score 4+ on at least 4/5 scenarios to justify building this over just using ConPort with good prompting.

---

## Risks

1. **Agents might not call the tools** — existential. Tool descriptions matter. May need bootstrap via CLAUDE.md one-liner.
2. **Noise accumulation** — pruning and relevance scoring needed after initial testing.
3. **Wrong abstraction level** — agent over-generalizes from one instance. Tool description mitigates but doesn't eliminate.
4. **Platform competition** — Claude/Windsurf native memory improves. Mitigated by cross-platform, structured, user-controlled.
5. **Multi-developer conflicts** — whose preferences win for shared areas? Need contribution-weighted resolution.
