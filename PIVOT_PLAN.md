# AIDE Product Suite — Architecture Intelligence Platform

## Context: Why This, Why Now

**Your pain point (the product thesis)**: You can get AI agents to make great architecture decisions on individual features 1:1. The problem is: how does this SCALE? When a new dev joins, you hand them a markdown file with your architecture vision. They may not read it. They certainly won't internalize all your ideologies. And AI agents definitely don't follow `.md` files consistently.

**The market pain**: AI coding agents write 35% more code but create [30% more defects](https://www.prnewswire.com/news-releases/ai-coding-assistants-increase-defect-risk-by-30-in-unhealthy-code-new-peer-reviewed-research-finds-302672355.html), [8x more duplication](https://www.infoq.com/news/2025/11/ai-code-technical-debt/), and [4x maintenance costs](https://www.pixelmojo.io/blogs/vibe-coding-technical-debt-crisis-2026-2027) within 18 months. Nobody scales their architectural vision — they scale code volume.

**The emerging solution pattern**: "[Convention as Code](https://dev.to/monarchwadia/convention-as-code-enforcing-architecture-with-scripts-ci-and-ai-agents-hgd)" and "[Codified Context](https://arxiv.org/html/2602.20478)" — treating architecture rules as executable infrastructure, not documentation artifacts. But current implementations are either static files (`.cursorrules`, `CLAUDE.md`, `guidelines.md`), language-specific test frameworks (ArchUnit = Java only), or AI review opinions (Greptile = probabilistic).

**What's missing**: A tool that auto-detects architecture patterns from a codebase graph, lets you refine them into machine-readable rules, and enforces them deterministically — for both humans (CI) and AI agents (MCP). Not a markdown file. Not optional. Not probabilistic.

---

## The AIDE Product Suite

All products built on the same core: AIDE's knowledge graph engine (SQLite + tree-sitter + relation detection + semantic search).

### Product 1: `aide scan` — Architecture Health Score
**"Lighthouse for codebases"**

Analyze any codebase, auto-detect architecture patterns, produce a health score.

```
$ aide scan ./my-project

Architecture Health Score: 73/100

  Module Coupling:        82/100  ↓3 from last scan
  Dependency Direction:   91/100  →0
  Pattern Consistency:    64/100  ↓8  ⚠️ 3 new patterns introduced
  Circular Dependencies:  68/100  ↓5  ⚠️ 2 new cycles detected

Auto-detected rules written to .aide/rules.yaml
```

**What it does**:
- Indexes codebase into knowledge graph (existing `aide init`)
- Analyzes CALLS/IMPORTS/EXTENDS graph to detect module boundaries, dependency patterns, code clusters
- Scores architecture health across categories
- Auto-generates initial `.aide/rules.yaml` from detected patterns

**AIDE code reuse**: `src/brain/` (100%), `src/analysis/` (100%), `src/project/indexer.ts` (100%)
**New code**: Rule inference engine, scoring system, CLI reporter

---

### Product 2: `aide rules` — Architecture as Code
**"ESLint for architecture, but auto-detected"**

Machine-readable architecture rules that live in your repo. Not a markdown file — executable, enforceable, version-controlled.

```yaml
# .aide/rules.yaml — Auto-detected, developer-refined
version: 1
modules:
  api:
    path: src/api/**
    can_import: [shared, services, models]
    cannot_import: [ui, cli]  # ← boundary enforcement
  ui:
    path: src/ui/**
    can_import: [shared, models]
    cannot_import: [api, services]
  services:
    path: src/services/**
    can_import: [models, shared]

patterns:
  error_handling: "catch-and-wrap"  # detected: 12/15 services use this
  data_access: "repository-pattern"  # detected: all DB access through repos

conventions:
  no_circular_dependencies: true
  max_module_coupling: 0.3
  require_abstraction_layer: [database, external_api]
```

**The key workflow**: Auto-detect → Developer refines → Machine enforces

This is the answer to "how do I scale my architecture beyond a markdown file":
- Not optional (machine-enforced in CI)
- Not ambiguous (explicit rules, not prose)
- Not lossy (captures actual codebase patterns, not just what you remember to write down)
- Version-controlled (evolves with the code)

**AIDE code reuse**: Graph traversal for pattern detection, relation analysis for dependency rules
**New code**: Rule DSL parser, auto-detection algorithms, config file format

---

### Product 3: `aide check` — Architecture Enforcement
**"CI gate for architecture health"**

Validate codebase (or changed files) against rules. Run locally or in CI.

```
$ aide check
  ✗ src/api/userController.ts imports from ui/components (boundary violation)
  ✗ Circular dependency: auth → session → permissions → auth
  ✗ New DB access in orders/process.ts bypasses repository layer
  ✗ Function processPayment() duplicates billing/charge.ts:45 (semantic similarity: 87%)
  ✓ No new circular dependencies in services/

  4 violations found. Score: 73/100 (threshold: 70 ✓)

$ aide check --fail-below 75
  Exit code 1 (below threshold)
```

**What it catches that nothing else does**:

| Detection | How AIDE Does It | Why Others Miss It |
|-----------|------------------|--------------------|
| Module boundary violations | IMPORTS graph vs rules.yaml boundaries | ArchUnit = Java only, markdown = not enforced |
| Circular dependencies | BFS cycle detection on relation graph | ESLint = single-file, SonarQube = line-level |
| Duplicate implementations | Semantic search across symbol graph | SonarQube = copy-paste only, not semantic |
| Architecture bypass | CALLS graph + abstraction layer rules | Nobody does this cross-language |
| Pattern drift | Detected patterns vs new code patterns | CodeScene = file complexity, not patterns |
| Coupling metrics | Quantified from CALLS/IMPORTS relations | CodeScene = per-file, not per-module |

**AIDE code reuse**: Graph engine, relation queries, semantic search
**New code**: Rule validation engine, violation reporter, exit code logic

---

### Product 4: `aide mcp` — Architecture-Aware AI Agent Layer
**"Your AI agent automatically follows your architecture"**

MCP server that exposes architecture rules and graph to any AI agent. The AI agent doesn't read a markdown file and hope — it calls tools and KNOWS.

```
# AI Agent workflow (automatic, not manual):
Agent: "I need to add a payment function"
  → Calls aide_mcp.find_similar("payment processing")
  → Gets: "billing/charge.ts:45 already has processPayment(). Reuse it."

Agent: "Adding import from ui/components to api/controller"
  → Calls aide_mcp.check_compliance(["api/controller.ts"])
  → Gets: "VIOLATION: api/ cannot import from ui/. Rule: api.cannot_import includes ui."

Agent: About to commit
  → Calls aide_mcp.pre_commit_check()
  → Gets: "2 violations. Score would drop from 82 to 76."
  → Agent self-corrects before committing.
```

**Why this is different from existing MCP servers**:
- **vs Serena** (LSP): Serena does go-to-definition. AIDE does architecture rule enforcement. Different purpose entirely.
- **vs CodeScene MCP** (code health): CodeScene scores file complexity. AIDE enforces architecture rules across the system.
- **vs Potpie** (graph context): Potpie gives agents context to reason about code. AIDE gives agents RULES to follow — deterministic, not AI judgment.
- **vs .cursorrules/CLAUDE.md**: Static text the AI may or may not follow. MCP tools are CALLABLE — the agent gets explicit pass/fail on every change.

**This is the answer to "how do I get tools to use it"**: You don't need Cursor or Claude Code to adopt anything. MCP is the standard. Any MCP-compatible agent calls `check_compliance()` and gets a deterministic answer. The rules come from your `.aide/rules.yaml`, not from AI interpretation of a markdown file.

**AIDE code reuse**: Graph engine, tool executor framework, existing MCP-ready tool definitions
**New code**: MCP server wrapper (~2-3 days), rule-aware tool implementations

---

### Product 5: `aide review` — PR Architecture Gate
**"GitHub App that blocks architecture violations"**

GitHub/GitLab integration that runs `aide check` on every PR.

- Reports violations as PR comments with file:line references
- Shows score delta (before/after PR)
- Blocks merge if score drops below threshold
- Tracks architecture health trends over time
- Links violations to specific rules in `.aide/rules.yaml`

**Revenue model (primary monetization)**:
- Free: CLI tools (aide scan, aide rules, aide check, aide mcp)
- Team ($30-50/repo/mo): GitHub App, CI integration, trend dashboards
- Enterprise: multi-repo, SSO, custom rules, compliance reports

**AIDE code reuse**: Graph engine, check logic
**New code**: GitHub App infrastructure, webhook handling, PR comment formatting

---

### Product 6: `aide map` — Dependency Visualization
**"X-ray for your codebase"**

Interactive visualization of module dependencies, coupling hotspots, and architecture structure. Built on the existing `src/web/server.ts` web UI.

Serves the [$2.14B dependency mapping market](https://www.globalgrowthinsights.com/market-reports/application-dependency-mapping-tools-market-118759). Different from vFunction (Java/.NET only, enterprise-priced) — multi-language, open source, lightweight.

**AIDE code reuse**: Graph engine, web server, relation queries
**New code**: Visualization frontend, graph layout algorithm

---

### Product 7: `aide onboard` — Auto-Generated Architecture Guide
**"The architecture document that's always current"**

Generates a comprehensive architecture guide from the graph + rules. Not a manually-written doc that goes stale — auto-generated from the actual codebase.

Includes: module map, dependency flows, key patterns, conventions, entry points.

**AIDE code reuse**: Graph engine, context assembler, existing Q&A capability
**New code**: Document generation templates, markdown formatter

---

## Priority Order: What to Build When

### Phase 1 (Weeks 1-6): Core Value — "Detect, Define, Enforce"
Build `aide scan` + `aide rules` + `aide check`

1. **Week 1-2**: Rule inference engine — analyze the graph to auto-detect module boundaries, dependency patterns, architecture conventions
2. **Week 2-3**: `.aide/rules.yaml` format — define the config DSL, parser, customization
3. **Week 3-4**: Scoring system — architecture health score with category breakdown
4. **Week 4-5**: Violation detection — validate codebase against rules, report violations
5. **Week 5-6**: CLI polish — clean output, `--fail-below` for CI, `--json` for integration

**Deliverable**: `npm install -g aide-arch && aide scan && aide check`

### Phase 1b (parallel, Week 4-6): MCP Server
Build `aide mcp` — wrap check/rules as MCP tools. 2-3 days of work on top of Phase 1.

### Phase 1c (parallel, Week 1+): Consulting Revenue
Sell architecture audits manually using AIDE. $5K-20K per engagement. Validates market. Funds development.

### Phase 2 (Weeks 7-10): Team Features — "Enforce at Scale"
Build `aide review` (GitHub App) + CI/CD integration. This is the monetization layer.

### Phase 3 (Months 3-4): Expansion
- `aide map` — dependency visualization
- `aide onboard` — auto-generated docs
- Multi-repo support

### Phase 4 (Month 5+): Based on traction
- Enterprise features, fundraising, or pivot

---

## Competitive Landscape Summary

| Competitor | What They Do | What AIDE Does Differently |
|-----------|-------------|---------------------------|
| [CodeScene](https://codescene.com/) | File-level code health metrics | System-level architecture health scoring |
| [SonarQube](https://www.sonarsource.com/) ($242M/yr) | Lint, security, code smells | Architecture structure, dependency rules |
| [Greptile](https://www.greptile.com/) ($25M raised) | AI code review opinions | Deterministic graph-based rule enforcement |
| [ArchUnit](https://www.archunit.org/) | Architecture rules in Java tests | Multi-language rules in YAML config |
| [Serena MCP](https://github.com/oraios/serena) | LSP code navigation for AI | Architecture rules enforcement for AI |
| [Potpie](https://github.com/potpie-ai/potpie) ($2.2M) | Graph context layer for AI | Graph-based architecture ENFORCEMENT |
| [vFunction](https://vfunction.com/) | Java/.NET modernization | Multi-language, lightweight, open source |
| [drift CLI](https://dev.to/eduardbar/drift-an-open-source-cli-that-detects-silent-technical-debt-in-ai-generated-typescript-code-4ll7) | TS-only basic debt scoring | Multi-language graph-based architecture scoring |
| `.cursorrules`/`CLAUDE.md` | Static text AI may follow | Machine-readable rules AI must check |

---

## The "Open Claw" Launch Strategy

**Narrative**: "AI agents write code 10x faster. Your architecture is paying the price. Here's how to fight back — in 2 minutes."

**Launch sequence**:
1. Scan 100 popular open-source repos. Generate architecture health scores.
2. Publish: "The State of Architecture Health in AI-Assisted Codebases 2026"
3. Post on HN/Reddit/Twitter with specific findings and scores
4. Open source the CLI so anyone can scan their own repos
5. Offer free scans to companies (lead gen for consulting + paid tiers)

**The hook**: "What's your architecture health score? Run `npx aide-arch scan` and find out in 60 seconds."

---

## Revenue Projections

| Revenue Stream | Timeline | Price | Target |
|---------------|----------|-------|--------|
| Architecture audits | Immediate | $5K-20K/engagement | 2-4/month |
| CLI (open source) | Month 2 | Free | 500+ users |
| GitHub App / CI | Month 3 | $30-50/repo/mo | 10-50 repos |
| Enterprise | Month 4+ | $500+/mo | 2-5 companies |
| Modernization consulting | Month 4+ | $10K-50K/project | 1-2/month |

---

## Key Files to Modify/Extend

| Existing File | Reuse For |
|--------------|-----------|
| `src/brain/projectGraph.ts` | Graph interface — add rule queries |
| `src/brain/sqliteBrainStore.ts` | SQLite store — add rule storage |
| `src/analysis/treeSitterAnalyzer.ts` | Symbol/relation extraction — 100% reuse |
| `src/project/indexer.ts` | Codebase indexing — 100% reuse |
| `src/semantic/semanticSearch.ts` | Duplicate detection — 100% reuse |
| `src/orchestration/toolExecutor.ts` | Tool framework — extend for rule tools |
| `src/web/server.ts` | Web UI base — extend for visualization |
| `src/cli/index.ts` | CLI commands — add scan/check/rules |

**New modules needed**:
- `src/rules/` — Rule inference, parsing, validation engine
- `src/scoring/` — Architecture health scoring system
- `src/enforcement/` — Violation detection against rules
- `src/mcp/` — MCP server wrapper
- `src/integrations/github.ts` — GitHub App for PR checks

---

## Sources

- [OpenCode](https://github.com/opencode-ai/opencode) | [GitHub Copilot Agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) | [Warp Oz](https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents)
- [Potpie AI $2.2M](https://techfundingnews.com/the-startup-building-a-knowledge-graph-for-code-raises-2-2m-to-make-ai-agents-actually-useful/) | [Greptile $25M](https://siliconangle.com/2025/09/23/greptile-bags-25m-funding-take-coderabbit-graphite-ai-code-validation/)
- [SonarSource $242M/yr](https://growjo.com/company/SonarSource) | [CodeScene](https://codescene.com/) | [AI Defect Risk +30%](https://www.prnewswire.com/news-releases/ai-coding-assistants-increase-defect-risk-by-30-in-unhealthy-code-new-peer-reviewed-research-finds-302672355.html)
- [AI Tech Debt — Stack Overflow](https://stackoverflow.blog/2026/01/23/ai-can-10x-developers-in-creating-tech-debt) | [8x Duplication](https://www.infoq.com/news/2025/11/ai-code-technical-debt/) | [18-Month Wall](https://www.pixelmojo.io/blogs/vibe-coding-technical-debt-crisis-2026-2027)
- [Convention as Code](https://dev.to/monarchwadia/convention-as-code-enforcing-architecture-with-scripts-ci-and-ai-agents-hgd) | [Codified Context (arxiv)](https://arxiv.org/html/2602.20478)
- [Dependency Mapping $2.14B Market](https://www.globalgrowthinsights.com/market-reports/application-dependency-mapping-tools-market-118759) | [vFunction](https://vfunction.com/)
- [Serena MCP](https://github.com/oraios/serena) | [CodeScene MCP](https://github.com/codescene-oss/codescene-mcp-server)
- [Developer Onboarding 3-6 Months](https://www.growin.com/blog/developer-retention-costs-onboarding/) | [20 Workdays Lost/Year](https://www.itpro.com/software/development/clunky-tech-is-costing-developers-20-working-days-a-year-these-are-the-leading-productivity-drains-impacting-teams)

---

---

# Conversation Context & Research Summary

> This section preserves the full context of the strategic conversation that produced this plan, including the original concerns, the research conducted, competitive analysis evolution, and key pivots in thinking. It exists so future sessions can pick up without losing this background.

---

## Original Situation: Why the Original AIDE Plan Was in Jeopardy

### The Three Threats Identified

The original AIDE plan was a broad AI Development Environment (ADE) — terminal interface → engineering agents → CI/CD integration → multi-agent orchestration → enterprise platform. During research in Feb 2026, three competitors emerged that made the original plan look extremely difficult:

**1. OpenCode** (https://github.com/opencode-ai/opencode)
- 100K+ GitHub stars, Go-based, fully open source, completely free
- Supports 75+ models via any provider (OpenAI, Anthropic, Google, Ollama, local)
- Multi-agent system (Build + Plan agents), LSP integration, session persistence, auto-compact context
- Privacy-first, no vendor lock-in, MCP support built-in
- Already IS what AIDE's CLI was planning to become — but further along and free

**2. GitHub Copilot Coding Agent** (GA since Sept 2025)
- Autonomous background agent triggered from GitHub issues or VS Code
- Spins up secure, isolated environments via GitHub Actions
- Creates draft PRs autonomously, pushes commits, runs tests, reports back
- Available to all paid Copilot subscribers (Business/Enterprise)
- Deep platform lock-in: they own GitHub (100M+ developers), no one can out-integrate them
- Feb 2026: added model picker, continued aggressive iteration

**3. Warp Oz** (Launched Feb 10, 2026)
- Cloud orchestration platform for coding agents at scale
- Docker-based sandboxed environments, multi-repo support
- Run hundreds of agents in parallel, CLI/API/SDK, built-in scheduling
- Agent-human handoff, session sharing, artifact review for output verification
- Consumption-based pricing + self-hosted enterprise option
- THIS IS THE FULL AIDE VISION — terminal → agents → environments → scale — already shipped

### The Three Options Considered

1. **Keep pursuing the original plan** — try to be better than all three through orchestration, graph architecture. Rejected: they already have massive distribution and resources; even matching quality at 50% cheaper would struggle to get adoption.

2. **Adapt AIDE into something niche but in demand** — find a specific problem where AIDE's existing tech is genuinely differentiated. Pursued.

3. **Start from scratch** — abandon AIDE's code and find a new problem. Rejected: AIDE's graph engine is real, validated technology.

---

## Research Conducted

### Competitive Tools Analyzed

| Tool | What It Does | Key Finding |
|------|-------------|-------------|
| OpenCode | Terminal AI coding agent, open source | 100K stars, already the AIDE CLI but better |
| GitHub Copilot Agent | Autonomous PR creation from issues | GA, platform lock-in, unavoidable |
| Warp Oz | Cloud agent orchestration platform | Exactly the AIDE long-term vision, launched Feb 2026 |
| CodeScene | File-level code health metrics + MCP | $242M analog market, but FILE-level not ARCHITECTURE-level |
| Greptile | AI code review via deep codebase understanding | $25M raised, $180M valuation — market validated |
| CodeRabbit | AI PR review bot | 2M+ repos, 13M+ PRs — market saturated |
| Potpie | Knowledge graph context for AI agents | Open source, $2.2M raised, Neo4j-based, enterprise focus |
| Serena MCP | LSP-based code navigation MCP server | Does navigation (go-to-def), not architecture enforcement |
| CodeScene MCP | Code health scores via MCP | File complexity metrics, NOT architectural relationships |
| vFunction | Java/.NET architectural modernization | Java/.NET only, enterprise pricing, not lightweight |
| drift CLI | TypeScript-only basic AI debt scoring | Very early, TS-only, no graph |
| SonarQube/SonarSource | Code quality, lint, security | $242M/yr revenue — proves code quality is a real business |
| ArchUnit | Architecture rules in Java unit tests | Java only, no graph, manual test class writing |

### Market Data Found

- **AI tech debt crisis**: AI coding agents increased PR volume 29% YoY; code churn doubling; 8x increase in duplicated code blocks; copy-pasted code up 48%
- **AI defect risk**: CodeScene peer-reviewed research shows AI assistants increase defect risk by 30% in unhealthy code
- **18-month wall**: Companies using AI agents heavily hit 4x maintenance costs within 18 months (Pixelmojo research)
- **Dependency mapping market**: $2.14B in 2025, projected $6.25B by 2035
- **Code quality market**: SonarSource at $242M/yr with 120K+ organizations proves the business model
- **MCP ecosystem**: All major vendors (Anthropic, OpenAI, Google) converged on MCP as universal standard in Jan 2026; marketplaces growing rapidly
- **Convention as Code**: Emerging pattern of encoding architectural conventions as executable infrastructure rather than markdown docs

---

## Key Concerns You Raised (and How They Were Addressed)

### Concern 1: "OpenCode, GitHub, Warp Oz already exist — is AIDE even buildable?"
**Addressed**: The original AIDE plan (general AI coding assistant → agent orchestration) is not viable. But AIDE's code intelligence engine (graph, tree-sitter, semantic search) is validated technology that competitors in adjacent spaces (Potpie, Greptile) raised millions on. The pivot is to use the engine for a different product.

### Concern 2: "Would the MCP server idea even be used by existing tools? Do they need it?"
**Addressed honestly**: Partial yes/partial no. Claude Code, Cursor, OpenCode all have built-in code understanding. An MCP server providing generic context wouldn't add much. BUT an MCP server providing deterministic ARCHITECTURE RULE ENFORCEMENT (not just context) is different — it gives AI agents something they can't get anywhere else: explicit pass/fail on architecture compliance.

### Concern 3: "What would AIDE be different in — no BS?"
**Addressed**: The specific differentiation is graph-based ARCHITECTURE-level analysis vs everyone else's FILE-level or LANGUAGE-specific approaches:
- CodeScene = file complexity (not architecture relationships)
- Serena = on-demand LSP navigation (not persistent graph, not rules)
- Potpie = graph context for agents (not enforcement or scoring)
- ArchUnit = Java only (not multi-language)
- No one = cross-language graph-based architecture scoring + enforcement + MCP for AI agents

### Concern 4: "Would it even be profitable?"
**Addressed**: Three revenue paths:
1. Architecture audits = immediate ($5K-20K, no product needed)
2. Architecture Health Score + CI/GitHub App = SonarSource model (proven at $242M/yr)
3. MCP as free funnel → paid CI/enterprise

### Concern 5: "How do you make existing tools actually USE what AIDE offers?"
**Addressed**: The key insight is that AIDE's value prop for AI agents is RULES, not just context. When AIDE exposes `check_compliance()` via MCP, agents get a deterministic answer. They don't need to "read and follow" a markdown file — they call a tool and get PASS/FAIL. This is fundamentally different from text-based context files.

### Concern 6: "How do I scale my architecture vision beyond a markdown file when new devs join?"
**This became the core product thesis.** The `.aide/rules.yaml` workflow:
1. `aide scan` auto-detects your existing architecture patterns from the graph
2. You refine the rules in machine-readable YAML
3. `aide check` enforces them in CI
4. `aide mcp` makes AI agents follow them automatically
5. `aide onboard` generates architecture docs from the rules + graph

Not optional, not ambiguous, not lossy, version-controlled, and AI-native.

---

## What AIDE Has Today (The Foundation)

The existing ~16.6K lines of TypeScript include:

- **Knowledge Graph**: SQLite-backed (better-sqlite3, WAL mode) with FTS5 full-text search. Stores: Files, Symbols (functions/classes/interfaces/types), Relations (CALLS/IMPORTS/EXTENDS/IMPLEMENTS/TESTS/CONFIGURES), ContentBlocks, Embeddings, Notes, Tags
- **Tree-sitter Analysis**: Full support for TS/JS/Python/Go/Rust/Java/C++; ctags fallback for Ruby/PHP/C#/Swift/Kotlin. Extracts symbols with signatures, doc comments. Detects CALLS, IMPORTS, EXTENDS, IMPLEMENTS.
- **Multi-Strategy Retrieval**: Simple (BFS), Tools (agentic), Hybrid, Semantic, SemanticAndGraph
- **15+ Tool Calls**: semantic_search, find_symbol, get_references, get_dependencies, read_file_outline, get_file_context, list_packages, search_conversation, etc.
- **Orchestration Loop**: 3-role model architecture (reasoning + context + embedding), provider-agnostic (OpenAI/Anthropic/Google/Ollama), token tracking, context evaluation loop
- **Semantic Search**: Vector embeddings stored in SQLite, cosine similarity, 800-token chunks with 20-line overlap
- **Session Persistence**: Chat history per project, focus tracking, cross-session search
- **CLI**: REPL, single-question mode, web UI, config management

**Key modules**: `src/brain/` (graph + storage), `src/analysis/` (tree-sitter), `src/orchestration/` (tools + loop), `src/retrieval/` (strategies), `src/semantic/` (embeddings), `src/session/` (persistence), `src/web/` (web server)

---

## Evolution of Thinking in This Conversation

1. **Started**: "Can AIDE compete with OpenCode/GitHub/Warp?"
   → Answer: No on the original vision.

2. **First pivot idea**: "AIDE as MCP code intelligence server" (Potpie/Code Pathfinder style)
   → Rejected after deeper research: too crowded (Potpie, Serena, CodeScene MCP all doing this), MCP monetization nascent.

3. **Second pivot idea**: "AI Architecture Guardian / PR review bot"
   → Refined after research: Greptile/CodeRabbit already in code review. But graph-based ARCHITECTURE enforcement (not review) is genuinely open.

4. **Third pivot idea**: Architecture Health Score (Lighthouse for codebases)
   → Strong. Validated by SonarSource's $242M market. CodeScene does file-level; nobody does architecture-level.

5. **Fourth refinement**: Migration Dependency Mapper
   → Also strong. $2.14B market. vFunction is Java/.NET only. AIDE's multi-language graph is differentiated.

6. **Final convergence**: Your pain point unlocked the real product thesis.
   → "I can get AI agents to make good architecture decisions 1:1. How does this scale to the whole codebase and to new devs without relying on a markdown file?"
   → Answer: `.aide/rules.yaml` as "Architecture as Code" — auto-detected from graph, machine-enforced in CI, exposed via MCP to AI agents.
   → This ties together: scan + rules + check + mcp + review + map + onboard as one coherent product suite.

---

## Open Questions for Future Sessions

- What brand name? "AIDE" feels generic for this new direction. "Archon"? "Meridian"? Something that signals architecture intelligence.
- Open source strategy: fully open (viral), open core (free CLI + paid CI), or proprietary? CodeScene and SonarQube both have open source variants.
- Who is the lead buyer? Individual developer (like you), tech lead, VP Engineering, CTO? Different products for different buyers.
- Should AIDE's existing Q&A functionality (the original AIDE experience) be preserved as a separate product/mode or deprecated?
- Can the existing `aide ask` and REPL functionality be repurposed as `aide onboard`?
- How does the consulting service (architecture audits) connect to the product — is it a separate brand/service?
- What's the go-to-market for the open source launch? HN post content, which repos to scan for the "State of Architecture Health" report?
