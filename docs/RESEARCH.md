# AIDE — Problems & Research

> All the problems we explored, the research behind them, and why we landed where we did.

---

## Problems Explored (From Founder's Experience)

### The "Works With My Agent" Problem
AI agents write 35% more code but create 30% more defects, 8x more duplication. `.cursorrules` and `CLAUDE.md` work until they don't. Nobody scales their architectural vision — they scale code volume. The new coordination problem isn't "works on my machine" — it's "works with my agent."

### Agent Doesn't Learn Developer Style
The founder's agent doesn't retain: component size preferences, composition over conditionals, reusability mindset, codebase-specific knowledge (useGraphQLGateway). Gets somewhat better in a session, then resets. Each session pays the re-learning tax.

### Context Compaction Destroys Planning
Mid-session compaction loses details already agreed on. The skeleton loading / legacy toggle example: explicitly decided to remove legacy loaders, agent puts them back after compaction. Plan requirements (like backward compatibility) get silently dropped.

### Planning Phase Is Inefficient
Even before coding, the agent drops details during planning. It needs to re-explore the codebase to understand what the developer means. Things the developer asked to incorporate into the plan don't make it in.

### Agent Doesn't Proactively Surface Relevant Context
The agent didn't notice legacy feature flag queries that would be redundant in the new flow. Developer had to spot it. Agent should explore enough to flag these things during planning.

### Staff Engineer Knowledge Doesn't Scale
Architectural knowledge lives in one person's head. Transferable 1:1 but not 1:many. "How do I remove the extra layer of context-giving so the dev knows what to prompt and the agent already has insight on how things should be structured?"

### New Code Gets Built With Wrong Design Philosophy
Not a duplication problem — the modal component was new. The problem was HOW it was built: conditionals instead of composition, tightly coupled to today's use cases. Even after giving a doc explaining the approach, it was misinterpreted. (Caveat: understanding existing components and extending them is still valuable — the problem is that alone doesn't solve it.)

### SOLID Drift Tolerated
Some devs/agents okay with more complexity. Prioritize requirements over design. Nobody pushes back consistently. Architecture degrades gradually.

### Config Files Have Limits
.cursorrules, CLAUDE.md — unstructured, no schema, no priority, no scoping. Only so much you can put in that agents will reliably follow. More markdown files ≠ better.

### Guidelines That Can't Be Linted
"Don't use waitFor unless really needed" — real team convention, not lint-enforceable. Lives in docs nobody reads.

---

## Research: What Exists Today

### Codebase-Aware AI Tools
- **Sourcegraph Cody/Amp** — RAG over codebases, good multi-repo. No opinion layer — finds code, doesn't judge design.
- **Augment Code** — 400K+ file repos, near-real-time sync. Rules require manual writing, no convention discovery.
- **Greptile** — 82% review catch rate, 30+ languages. Read-only, no persistent memory of decisions.

### Developer Style Learning
- **Pieces LTM-2** — OS-level capture, 9 months history. Unstructured, no inference from behavior.
- **Tabnine** — Org-level fine-tuning. Static, no drift detection.
- **Windsurf Cascade** — Auto-captures preferences from corrections. Black box, workspace-locked, not portable.

### Qualitative Code Analysis
- **CodeScene** — Behavioral analysis, hotspot detection. Peer-reviewed impact data. No architectural intent.
- **Designite** — OOP design smells, principle-violation mapping. Java/C#/Python only.
- **SonarQube** — Cognitive complexity. Necessary but not sufficient for "is this well-designed?"

### Convention/Pattern Enforcement
- **Cursor Rules / Copilot Instructions** — Manual markdown, no enforcement, no discovery.
- **Semgrep** — True enforcement via AST patterns. Manual rule authoring, no auto-discovery.
- **Mault** — Real-time IDE enforcement during AI coding. Early stage, TS/JS/Python only.
- **Drift (GitHub)** — Tree-sitter + MCP, auto-discovers patterns. Single developer project.

### AI Agent Memory (Most Relevant)
- **Claude Code Auto-Memory** — Flat markdown summary, prompt-injected. No structure, degrades at scale.
- **Cursor Memory Bank** (community) — Structured MD files, fully manual, agent must be prompted.
- **Windsurf Cascade Memories** — Best auto-capture. Black box, proprietary, workspace-locked.
- **Mem0 OpenMemory** — Semantic vector store via MCP. No structure, just text blobs.
- **ConPort** — Structured SQLite + MCP, typed entities. Closest competitor. But agent-written only, no code awareness, no contributor tracking.
- **mcp-memory-service** — Best taxonomy (5 types, 21 subtypes). Same gap — manual, no codebase understanding.
- **Anthropic server-memory** — JSON knowledge graph. General purpose scratchpad.

### Key Competitive Gaps
1. **No codebase-scoped, layered memory via MCP** — everything is either flat blobs or platform-locked
2. **No auto-discovery of conventions from code** — every enforcement tool requires manual rules
3. **No write-time architectural feedback** — enforcement is prompt-based (weak) or CI-based (too late)
4. **No convention migration** — nobody manages baseline → target transition
5. **Memory infrastructure exists; intelligence to fill it doesn't** — ConPort/Mem0 are empty buckets

---

## Research: Market Data

- AI agents: 35% more code, 30% more defects, 8x duplication, 4x maintenance costs at 18 months
- Mem0: $24M raised, 14M downloads — validates memory is a real need
- MCP: OpenAI adopted March 2025, Linux Foundation donation Dec 2025 — ecosystem momentum
- Convention as Code: emerging pattern (arxiv.org/html/2602.20478)
- CodeScene: peer-reviewed — unhealthy code 2x slower, 15x more defects

---

## Ideas Explored But Deprioritized

| Idea | Why deprioritized |
|------|-------------------|
| Health score dashboard | Scores don't change behavior |
| Config file generation (CLAUDE.md, .cursorrules) | Automating creation of files agents already ignore |
| Architecture linting (boundary rules) | Narrow — real pain is design philosophy, not import direction |
| AI code review bot | Saturated (Copilot, CodeRabbit, Greptile) |
| Convention discovery from code | Valuable but additive — memory layer is the foundation |
| Design philosophy evaluation | Build on top of memory + conventions later |
| Personal style learning (structured profiles) | Interesting but technically hardest — build toward it |
| Convention direction (baseline → target) | Nobody thinks in these terms yet — unvalidated category |
| General-purpose AI memory | Mem0's space, don't compete head-on |
| Standalone visualization | Crowded (Madge, NX Graph, CodeSee) |

---

## Sources

- [Convention as Code](https://dev.to/monarchwadia/convention-as-code-enforcing-architecture-with-scripts-ci-and-ai-agents-hgd)
- [Codified Context (arxiv)](https://arxiv.org/html/2602.20478)
- [AI defects study](https://www.prnewswire.com/news-releases/ai-coding-assistants-increase-defect-risk-by-30-302672355.html)
- [AI duplication study](https://www.infoq.com/news/2025/11/ai-code-technical-debt/)
- [Mem0 Series A](https://www.prnewswire.com/news-releases/mem0-raises-24m-series-a-302597157.html)
- [ConPort](https://github.com/GreatScottyMac/context-portal)
- [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service)
- [Windsurf Cascade Memories](https://docs.windsurf.com/windsurf/cascade/memories)
- [Mem0 OpenMemory](https://mem0.ai/openmemory)
- [Cursor Memory Bank](https://github.com/vanzan01/cursor-memory-bank)
