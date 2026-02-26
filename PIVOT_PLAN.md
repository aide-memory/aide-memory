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
- **vs Serena** (LSP): Serena does go-to-definition via LSP + tree-sitter AST. AIDE does architecture rule enforcement via persistent graph. Different purpose entirely.
- **vs CodeScene MCP** (code health): CodeScene scores file complexity (cognitive load, duplication). AIDE enforces architecture rules across the system. Different layer.
- **vs Potpie** (graph context): Potpie gives agents context to reason about code. AIDE gives agents RULES to follow — deterministic, not AI judgment.
- **vs Agent RuleZ** (policy engine): Agent RuleZ is a Rust binary that blocks dangerous CLI commands (e.g. prevent `git push --force`). AIDE understands code ARCHITECTURE — not just CLI safety policies. Complementary, not competitive.
- **vs .cursorrules/CLAUDE.md/AGENTS.md**: Static text the AI may or may not follow. MCP tools are CALLABLE — the agent gets explicit pass/fail on every change.

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

### Product 8 (Potential): `aide suggest` — Architecture Improvement Recommendations
**"AI-powered architecture coaching"**

Uses the graph + rules to suggest architectural improvements: refactoring targets, coupling reduction opportunities, pattern inconsistencies to resolve. This addresses the user's stated interest in not just enforcement but also architecture PLANNING and SUGGESTIONS.

This is the bridge between the "scoring/enforcement" product and the original AIDE "ask the codebase questions" experience — the AI reasoning over the graph to proactively recommend improvements.

Could leverage existing orchestration loop (reasoning model + graph tools) to generate actionable suggestions.

---

## Priority Order: What to Build When

### Phase 0 (BLOCKER — Week 0-1): Fix Relations
**The relations table is always empty.** `inferRelations()` in `src/analysis/treeSitterAnalyzer.ts:870` returns `[]`. Without CALLS/IMPORTS/EXTENDS relations, the entire architecture scoring product cannot work. This is the absolute first priority. See "Critical Blocker" section below.

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
- `aide suggest` — AI-powered architecture recommendations
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
| [Serena MCP](https://github.com/oraios/serena) | LSP code navigation for AI (30+ langs) | Architecture rules enforcement for AI |
| [Potpie](https://github.com/potpie-ai/potpie) ($2.2M) | Graph context layer for AI (Neo4j) | Graph-based architecture ENFORCEMENT (SQLite, local-first) |
| [vFunction](https://vfunction.com/) | Java/.NET modernization | Multi-language, lightweight, open source |
| [drift CLI](https://dev.to/eduardbar/drift-an-open-source-cli-that-detects-silent-technical-debt-in-ai-generated-typescript-code-4ll7) | TS-only basic debt scoring | Multi-language graph-based architecture scoring |
| [Agent RuleZ](https://medium.com/@richardhightower/agent-rulez-a-deterministic-policy-engine-for-ai-coding-agents-9489e0561edf) | Deterministic policy engine for CLI commands (Rust) | Architecture-level code understanding, not CLI policy |
| [CodeScene MCP](https://github.com/codescene-oss/codescene-mcp-server) | Code health safeguards (3-level) | Architecture rules, not file metrics |
| `.cursorrules`/`CLAUDE.md`/`AGENTS.md` | Static text AI may follow | Machine-readable rules AI must check |
| [CodeRabbit](https://www.coderabbit.ai/) (2M+ repos) | AI PR review bot | Rule-based enforcement, not AI opinions |
| [Graphite Agent](https://graphite.dev/) | PR workflow optimization | Architecture health, not PR workflow |

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
| `src/brain/sqliteStore.ts` | SQLite store (1168 lines) — add rule storage, architecture queries |
| `src/analysis/treeSitterAnalyzer.ts` | Symbol/relation extraction (974 lines) — **FIX `inferRelations()` first** |
| `src/project/indexer.ts` | Codebase indexing (335 lines) — 100% reuse |
| `src/semantic/semanticSearch.ts` | Duplicate detection (380 lines) — 100% reuse |
| `src/orchestration/toolExecutor.ts` | Tool framework (1820 lines) — extend for rule tools |
| `src/web/server.ts` | Web UI base — extend for visualization |
| `src/cli/index.ts` | CLI commands (398 lines) — add scan/check/rules commands |

**New modules needed**:
- `src/rules/` — Rule inference, parsing, validation engine
- `src/scoring/` — Architecture health scoring system
- `src/enforcement/` — Violation detection against rules
- `src/mcp/` — MCP server wrapper
- `src/integrations/github.ts` — GitHub App for PR checks

---

## Sustainability & Moat Strategy

### The Honest Assessment
Technical features alone (graph, tree-sitter, multi-language analysis) are NOT moats. Any well-funded competitor can replicate features in weeks. The architecture tools (scan/rules/check) as designed are a **feature play** — a good one, but features get copied.

**What's stopping Anthropic, OpenAI, Cursor from building this?** Nothing — technically. But:
- SonarQube survived **17 years** against GitHub, Microsoft, and Google — not because of better technology, but because it became infrastructure
- The moat isn't the tool, it's what accumulates through usage

### Layered Moat Strategy
Design the product from day one to accumulate defensibility:

| Layer | What | Moat Type | Timeline |
|-------|------|-----------|----------|
| **Entry** | aide scan/rules/check CLI | Feature (no moat) | Month 1-2 |
| **Data** | Anonymized scan data across codebases | Data moat (compounding) | Month 3-6 |
| **Switching** | Architecture Decision Records + rule history | Switching cost | Month 4-8 |
| **Compliance** | SOC2/HIPAA/ISO rule mappings | Regulatory lock-in | Month 6-12 |
| **Network** | Cross-company benchmarking | Network effects | Month 12+ |

### Phase Integration
- **Phase 1** (Weeks 1-6): Build tools, design data collection from day one
- **Phase 2** (Months 2-4): Aggregate anonymized scan data, publish "State of Architecture" reports with real data from real codebases
- **Phase 3** (Months 4-8): Add compliance framework mappings (SOC2, HIPAA) — once tied to audit workflows, switching means re-certification
- **Phase 4** (Month 8+): Cross-company benchmarking ("Your architecture health vs. industry median for your team size")

### What Creates Real Lock-In
1. **Accumulated scan data** — every `aide scan` feeds a growing dataset competitors can't shortcut. Year 2: "Teams that fixed pattern X saw 40% fewer production incidents." Year 3: "Based on 10,000 codebases analyzed, repository-pattern teams ship 2x faster."
2. **Architecture decisions with "why"** — not just rules but the reasoning behind them. Over 2 years, AIDE becomes the institutional memory: "This boundary was added because of the Q3 2025 incident." Like Notion for architecture — once invested, can't leave.
3. **Compliance mappings** — "Your architecture meets SOC2 control CC7.1." Once a company uses AIDE for compliance, switching means re-doing security reviews and re-certifying.
4. **Benchmarking data** — "Your codebase scores 73/100. The median for teams your size is 81." Each company joining makes benchmarks more valuable for everyone (network effect).

### The SonarQube Precedent (How a Small Tool Survived 17 Years)
SonarQube survived against GitHub, Microsoft, and Google because it became infrastructure:
- 17 years of accumulated code quality data (compounding advantage)
- Embedded in CI/CD workflows (switching cost — nearly 40% of engineering time spent on integrations)
- Used for compliance/audit (regulatory moat)
- Enterprise procurement friction (once approved through security review, switching requires new approvals)
- NOT because of "better technology"

### What Will NOT Create a Moat
- CLI tools alone (get copied in weeks)
- MCP server alone (Cursor/Claude Code will build their own)
- "Better graph technology" (nobody cares about your tech stack)
- Open source community without data/enterprise layer
- "Better AI" claims (models improve constantly across all vendors)
- UI/UX excellence alone (AI + component libraries make good UI table stakes)

### The Bottom Line
The architecture tools are the **entry point** — the feature that gets you in the door. The moat **emerges from usage**: accumulated data, workflow embeddedness, compliance lock-in. The first 12-18 months are a **window, not a moat** — use that window to accumulate the data and workflows that BECOME the moat.

### Research Sources for Moat Analysis
- [The "SaaSpocalypse" Versus Real-World Moats](https://alignba.com/2026/02/05/the-saaspocalypse-versus-real-world-moats/amp/)
- [The Tech Moat Is Dead: How to Build Real Defensibility in 2026](https://www.everything.design/blog/build-real-moat-2026)
- [The New New Moats — Greylock](https://greylock.com/greymatter/the-new-new-moats/)
- [Are There Any Moats in Software Anymore?](https://www.swe2vc.com/p/are-there-any-moats-in-software-anymore)
- [Data and Defensibility — Pivotal](https://pivotal.substack.com/p/data-and-defensibility)
- [Cloud Ecosystem Lock-In: Platform Dependency Economics](https://www.francescatabor.com/articles/2026/2/4/cloud-ecosystem-lock-in-platform-dependency-economics-developer-network-effects-and-switching-costs-in-enterprise-it)
- [Specialized Dominators in AI — FourWeekMBA](https://fourweekmba.com/specialized-dominators-in-ai/)

---

## Sources

- [OpenCode](https://github.com/opencode-ai/opencode) | [GitHub Copilot Agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) | [Warp Oz](https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents)
- [Potpie AI $2.2M](https://techfundingnews.com/the-startup-building-a-knowledge-graph-for-code-raises-2-2m-to-make-ai-agents-actually-useful/) | [Greptile $25M](https://siliconangle.com/2025/09/23/greptile-bags-25m-funding-take-coderabbit-graphite-ai-code-validation/)
- [SonarSource $242M/yr](https://growjo.com/company/SonarSource) | [CodeScene](https://codescene.com/) | [AI Defect Risk +30%](https://www.prnewswire.com/news-releases/ai-coding-assistants-increase-defect-risk-by-30-in-unhealthy-code-new-peer-reviewed-research-finds-302672355.html)
- [AI Tech Debt — Stack Overflow](https://stackoverflow.blog/2026/01/23/ai-can-10x-developers-in-creating-tech-debt) | [8x Duplication](https://www.infoq.com/news/2025/11/ai-code-technical-debt/) | [18-Month Wall](https://www.pixelmojo.io/blogs/vibe-coding-technical-debt-crisis-2026-2027)
- [Convention as Code](https://dev.to/monarchwadia/convention-as-code-enforcing-architecture-with-scripts-ci-and-ai-agents-hgd) | [Codified Context (arxiv)](https://arxiv.org/html/2602.20478)
- [Dependency Mapping $2.14B Market](https://www.globalgrowthinsights.com/market-reports/application-dependency-mapping-tools-market-118759) | [vFunction](https://vfunction.com/)
- [Serena MCP](https://github.com/oraios/serena) | [CodeScene MCP](https://github.com/codescene-oss/codescene-mcp-server)
- [Agent RuleZ](https://medium.com/@richardhightower/agent-rulez-a-deterministic-policy-engine-for-ai-coding-agents-9489e0561edf) | [Martin Fowler — Context Engineering](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)
- [Developer Onboarding 3-6 Months](https://www.growin.com/blog/developer-retention-costs-onboarding/) | [20 Workdays Lost/Year](https://www.itpro.com/software/development/clunky-tech-is-costing-developers-20-working-days-a-year-these-are-the-leading-productivity-drains-impacting-teams)
- [AI Agent Governance — Microsoft](https://www.microsoft.com/en-us/security/blog/2026/02/10/80-of-fortune-500-use-active-ai-agents-observability-governance-and-security-shape-the-new-frontier/)
- [Agent READMEs Study (arxiv)](https://arxiv.org/html/2511.12884v1) | [Context Engineering for Multi-Agent Systems (arxiv)](https://arxiv.org/html/2508.08322v1)

---

---

# Conversation Context & Research Summary

> This section preserves the full context of the strategic conversation that produced this plan, including the original concerns, the research conducted, competitive analysis evolution, and key pivots in thinking. It exists so future sessions can pick up without losing this background.

---

## The Original AIDE Vision (What Was Planned Before the Pivot)

The original AIDE plan was a comprehensive AI Development Environment with multiple phases:

### Problem Statement (from original plan)
AI development in 2026 faces fundamental technical, organizational, and safety challenges that impede reliable, context-aware automation in software engineering workflows. Contemporary generative models struggle with maintaining broad context over long sessions, suffer reliability and verification bottlenecks in complex reasoning tasks, and raise risks around bias, security and hallucination.

**Evidence cited**:
- [UC Research](https://www.universityofcalifornia.edu/news/11-things-ai-experts-are-watching-2026): 11 things AI experts are watching in 2026
- [arxiv 2601.17055](https://arxiv.org/abs/2601.17055): Human reliance on AI leads to systematic performance degradation on complex problems
- [Clarifai](https://www.clarifai.com/blog/ai-risks): Critical challenges including bias, privacy erosion, misinformation
- [IBM](https://www.ibm.com/think/news/ai-tech-trends-predictions-2026): 2026 defined by systems and agent orchestration, not standalone models
- [arxiv 2601.04175](https://arxiv.org/abs/2601.04175): Fragmented regulatory initiatives and AI governance debate

### Original Competitive Analysis (from plan)

| Capability | Cursor | Copilot | Claude | Rovo Dev | AIDE (target) |
|-----------|--------|---------|--------|----------|---------------|
| Context Preservation | Good per file, limited cross-session | Strong within single repo | Strong session context | Varies | Target: strong cross-session + cross-branch |
| Session Memory | Session-based, limited long memory | Minimal long memory | Good long session context | Depends | Session + persistent state |
| Agentic Workflow | Limited | Via extensions | Core Claude Agents | Partial | Core engineering agent |
| Autonomy | Moderate | Low | Moderate to High | Low | High (agentic workflows) |

### Original Current State Assessment
- Project graph: working
- Good answers with one question about the codebase
- Bad with follow ups / context gathering of session
- Key question asked: "Why is relations 0?"

### Original MVP Requirements (abridged — 30+ items listed)
- Improve AIDE as single local engine with terminal interface matching Cursor/Copilot/Claude quality
- Fix the relations = 0 issue
- Improve prompting for wider use cases
- Preserve context from previous chats
- Fix tree-sitter issues, add fallbacks, support more languages
- Add ability to run commands and make code changes
- Get model to stop exploring more than needed
- Investigate better codebase entry strategies (vectors, how Cursor does search)
- Easily swap between local and cloud models
- Add streaming, custom context, session continuation
- Add Engineering agent (create PRs, branch conventions, test config)
- Agent should produce plans for developer approval before making changes
- Support custom agents
- Framework for company workflow integration

### Original Follow-Up Features
- PR reviewer agent
- Spiking agent, senior agent, refactoring agent, DevOps agent
- Managing agent that can spin off sub-agents
- Agents filing tasks/tickets from notes
- Git history integration

### Domains of Interest
The user mentioned being interested in: **cost optimization**, **code quality**, and **good architecture principles** as the core domains.

---

## Original Situation: Why the Original AIDE Plan Was in Jeopardy

### The Three Threats Identified

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

3. **Start from scratch** — abandon AIDE's code and find a new problem. Rejected: AIDE's graph engine is real, validated technology (Potpie raised $2.2M with similar tech).

---

## Research Conducted

### Competitive Tools Analyzed (Expanded)

| Tool | What It Does | Key Finding |
|------|-------------|-------------|
| OpenCode | Terminal AI coding agent, open source | 100K stars, already the AIDE CLI but better |
| GitHub Copilot Agent | Autonomous PR creation from issues | GA, platform lock-in, unavoidable |
| Warp Oz | Cloud agent orchestration platform | Exactly the AIDE long-term vision, launched Feb 2026 |
| CodeScene | File-level code health metrics + MCP | $242M analog market, but FILE-level not ARCHITECTURE-level. Has 3-level safeguards: per-snippet, pre-commit, pre-PR. loveholidays scaled 0→50% agent-assisted code using it. |
| Greptile | AI code review via deep codebase understanding | $25M raised, $180M valuation — market validated |
| CodeRabbit | AI PR review bot | 2M+ repos, 13M+ PRs — market saturated |
| Qodo | Agentic code integrity platform | Multi-repo awareness, governance, code quality at every stage |
| Potpie | Knowledge graph context for AI agents | Open source, $2.2M raised, Neo4j-based, 5K GitHub stars, enterprise focus. Heavy infra: Docker + Redis + Celery + FastAPI + Neo4j |
| Serena MCP | LSP + tree-sitter code navigation MCP | 30+ languages, symbol-level ops, session memory, project indexing. Beta stage, active development. |
| CodeScene MCP | Code health scores via MCP | File complexity metrics. 3 safeguard levels. Used in production at loveholidays. |
| vFunction | Java/.NET architectural modernization | Java/.NET only, enterprise pricing, not lightweight. "Agentic modernization" in 2026. |
| drift CLI | TypeScript-only basic AI debt scoring | Very early, TS-only, no graph, basic AST scoring 0-100 |
| SonarQube/SonarSource | Code quality, lint, security | $242M/yr revenue, 120K+ orgs, 500-1000 employees — proves code quality is a real business |
| ArchUnit | Architecture rules in Java unit tests | Java only, no graph, manual test class writing |
| Agent RuleZ | Deterministic policy engine for AI agents | Rust binary, YAML rules, sub-10ms evaluation. Blocks dangerous CLI ops. Not architecture-level — complementary. |
| Graphite Agent | PR workflow optimization | Shopify: 33% more PRs merged/dev. Asana: 7 hrs/week saved, 21% more code shipped. |
| Augment Code | AI coding for complex codebases | Focused on enterprise, multi-repo context |

### Academic & Research Findings

**Codified Context Paper** ([arxiv 2602.20478](https://arxiv.org/html/2602.20478), Feb 24, 2026):
- 3-tier infrastructure for AI agents in a 108K-line C# distributed system
- Component 1: Hot-memory "constitution" — conventions, retrieval hooks, orchestration protocols (always loaded)
- Component 2: 19 specialized domain-expert agents
- Component 3: Cold-memory knowledge base — 34 on-demand specification documents
- Tested across 283 development sessions
- Key finding: Documentation becomes infrastructure, not artifact. Specifications as inter-session coordination.

**Agent READMEs Study** ([arxiv 2511.12884](https://arxiv.org/html/2511.12884v1)):
- Empirical study of context files for agentic coding
- Examines how `.cursorrules`, `CLAUDE.md`, `AGENTS.md` are used in practice
- Findings inform how AIDE's rules.yaml should be designed

**Context Engineering for Coding Agents** ([Martin Fowler](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)):
- Establishes "context engineering" as the key discipline for AI coding effectiveness
- Rules, retrieval hooks, and orchestration protocols as first-class concerns

### Market Data Found

- **AI tech debt crisis**: AI coding agents increased PR volume 29% YoY; code churn doubling; 8x increase in duplicated code blocks; copy-pasted code up 48%
- **AI defect risk**: CodeScene peer-reviewed research shows AI assistants increase defect risk by 30% in unhealthy code
- **40-62% of AI-generated code** contains security vulnerabilities or design flaws
- **18-month wall**: Companies using AI agents heavily hit 4x maintenance costs within 18 months (Pixelmojo research)
- **Teams waste 23-42%** of development time on tech debt
- **75% of tech decision-makers** face moderate to severe technical debt by 2026
- **Dependency mapping market**: $2.14B in 2025, projected $6.25B by 2035; 66% of enterprises report increased complexity; 74% of DevOps teams adopting these tools
- **Code quality market**: SonarSource at $242M/yr with 120K+ organizations proves the business model
- **MCP ecosystem**: All major vendors converged on MCP as universal standard in Jan 2026; marketplaces growing rapidly (Cline marketplace, Glama.ai, mcpservers.org, Apify with 36K+ monthly developers)
- **MCP monetization models**: Pay-per-event, tiered subscriptions ($15-30% transaction fees), freemium. Still nascent — most MCP servers are free.
- **Convention as Code**: Emerging pattern of encoding architectural conventions as executable infrastructure rather than markdown docs
- **AI agent governance**: 80% of Fortune 500 use active AI agents (Microsoft, Feb 2026). 29% of employees use unsanctioned AI agents. CIOs/CISOs worried about prompt injection, over-permissioned agents, lack of traceability.
- **Developer onboarding**: 3-6 months to full productivity. 20 workdays lost per year to tech issues. Context switching across 6+ tools.
- **AI refactoring landscape**: Byteable, CodeScene ACE Auto Refactor, Sourcegraph, Cursor, Augment, Refact.ai all doing AI-assisted refactoring. No one combining graph-based architecture analysis with improvement suggestions.

---

## Key Concerns Raised (and How They Were Addressed)

### Concern 1: "OpenCode, GitHub, Warp Oz already exist — is AIDE even buildable?"
**Addressed**: The original AIDE plan (general AI coding assistant → agent orchestration) is not viable. But AIDE's code intelligence engine (graph, tree-sitter, semantic search) is validated technology that competitors in adjacent spaces (Potpie, Greptile) raised millions on. The pivot is to use the engine for a different product.

### Concern 2: "Would the MCP server idea even be used by existing tools? Do they need it?"
**Addressed honestly**: Partial yes/partial no. Claude Code, Cursor, OpenCode all have built-in code understanding. An MCP server providing generic context wouldn't add much. BUT an MCP server providing deterministic ARCHITECTURE RULE ENFORCEMENT (not just context) is different — it gives AI agents something they can't get anywhere else: explicit pass/fail on architecture compliance. Unlike Agent RuleZ (which blocks CLI commands), AIDE understands code architecture.

### Concern 3: "What would AIDE be different in — no BS?"
**Addressed**: The specific differentiation is graph-based ARCHITECTURE-level analysis vs everyone else's FILE-level or LANGUAGE-specific approaches:
- CodeScene = file complexity (not architecture relationships)
- Serena = on-demand LSP navigation (not persistent graph, not rules, in beta)
- Potpie = graph context for agents (not enforcement or scoring, requires heavy infra)
- ArchUnit = Java only (not multi-language)
- Agent RuleZ = CLI policy enforcement (not code architecture understanding)
- No one = cross-language graph-based architecture scoring + enforcement + MCP for AI agents

### Concern 4: "Would it even be profitable?"
**Addressed**: Three revenue paths:
1. Architecture audits = immediate ($5K-20K, no product needed)
2. Architecture Health Score + CI/GitHub App = SonarSource model (proven at $242M/yr)
3. MCP as free funnel → paid CI/enterprise

### Concern 5: "How do you make existing tools actually USE what AIDE offers?"
**Addressed**: The key insight is that AIDE's value prop for AI agents is RULES, not just context. When AIDE exposes `check_compliance()` via MCP, agents get a deterministic answer. They don't need to "read and follow" a markdown file — they call a tool and get PASS/FAIL. This is fundamentally different from text-based context files. MCP is plug-and-play (e.g., `claude --mcp aide`). The standard handles integration.

### Concern 6: "How do I scale my architecture vision beyond a markdown file when new devs join?"
**This became the core product thesis.** The `.aide/rules.yaml` workflow:
1. `aide scan` auto-detects your existing architecture patterns from the graph
2. You refine the rules in machine-readable YAML
3. `aide check` enforces them in CI
4. `aide mcp` makes AI agents follow them automatically
5. `aide onboard` generates architecture docs from the rules + graph

Not optional, not ambiguous, not lossy, version-controlled, and AI-native.

### Concern 7: "I want not just enforcement but architecture suggestions/planning"
**Addressed**: Product 8 (`aide suggest`) added. The existing orchestration loop (reasoning model + graph tools) can generate architectural improvement recommendations. This bridges enforcement (reactive) with coaching (proactive). Also connects to the user's stated interest in "cost optimization, code quality, and good architecture principles" as core domains.

---

## What AIDE Has Today (Detailed Technical Audit)

### Overview
- **55 TypeScript source files**, ~16.6K total lines, package.json v0.2.0
- **Dependencies**: better-sqlite3, tree-sitter-* (11 languages), ts-morph, express, ws, commander, chokidar, chalk
- **Test framework**: Vitest 3.2, 2 test files with fixtures
- **Existing CLI commands**: `init`, `reindex`, `watch`, `ask`, `web`, `config`, default REPL

### Database Schema (8 tables, 24 indexes)

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `files` | Source files | id, path, language, content_hash, summary, indexed_at |
| `symbols` | Functions/classes/interfaces/types/variables | id, file_id (FK), name, kind, start_line, end_line, signature, doc_comment |
| `content_blocks` | Code snippets, imports, comments, chunks | id, file_id (FK), kind, content, symbol_id (FK), is_chunk, chunk_index, full_block_id, signature, metadata |
| `relations` | Directed edges between symbols | id, source_symbol_id (FK), target_symbol_id (FK), kind. **UNIQUE constraint on (source, target, kind)** |
| `notes` | Annotations on symbols/files | id, symbol_id (FK), file_id (FK), content, source ('system'/'model'/'user'), created_at |
| `tags` | Key-value pairs on symbols | id, symbol_id (FK), name, value. **UNIQUE on (symbol_id, name)** |
| `embeddings` | Vector embeddings for semantic search | id, file_path, content, start_line, end_line, content_hash, embedding (BLOB), model, created_at |
| `conversation_embeddings` | Session-level conversation embeddings | id (autoincrement), session_id, exchange_index, role (user/assistant), embedding (BLOB) |

**FTS5**: `content_blocks_fts` virtual table with auto-sync triggers on INSERT/DELETE/UPDATE.

### Exact Type Definitions

```typescript
type SymbolKind = 'function' | 'class' | 'interface' | 'type' | 'variable' | 'module' | 'method' | 'property'

type RelationKind = 'CALLS' | 'IMPORTS' | 'TESTS' | 'CONFIGURES' | 'EXTENDS' | 'IMPLEMENTS'

type BlockKind = 'code' | 'import' | 'export' | 'comment' | 'docstring' | 'todo' | 'markdown' | 'prose' | 'config' | 'data' | 'cell' | 'output'
```

### Tree-sitter Support

| Language | WASM Available | Query File (`tags.scm`) | Relation Inference |
|----------|---------------|------------------------|-------------------|
| TypeScript | Yes | Yes (vendored from nvim-treesitter) | **Not implemented** |
| JavaScript | Yes | Yes (vendored) | **Not implemented** |
| TSX/JSX | Yes (uses TS/JS) | Uses parent | **Not implemented** |
| Python | Yes | Yes (vendored) | **Not implemented** |
| Go | Yes | No (heuristic fallback) | **Not implemented** |
| Rust | Yes | No (heuristic fallback) | **Not implemented** |
| Java | Yes | No (heuristic fallback) | **Not implemented** |
| Ruby | Yes | No (heuristic fallback) | **Not implemented** |
| C | Yes | No (heuristic fallback) | **Not implemented** |
| C++ | Yes | No (heuristic fallback) | **Not implemented** |

**Query strategy**: Query-driven extraction first (using `@definition.*` captures), falls back to heuristic node-type matching (`function_declaration`, `class_declaration`, etc.).

### Critical Blocker: Relations Are Always Empty

**File**: `src/analysis/treeSitterAnalyzer.ts`, line 870-877

```typescript
private inferRelations(
  tree: TreeSitterTree,
  language: string,
  symbols: ExtractedSymbol[],
  fileId: string
): Relation[] {
  // Relations require cross-file analysis - handled by indexer
  return [];
}
```

**Impact**: The `relations` table in SQLite is **always empty**. This means:
- `getOutgoingRelations()` returns `[]`
- `getIncomingRelations()` returns `[]`
- `neighbors()` with edgeKinds filter returns nothing
- `findRelations()` returns `[]`
- `toolBasedRetrieval.ts` lines 1432, 1463 also return hardcoded `relations: []`
- All RetrievalResult objects have `relations: []`

**This is THE blocker for the architecture pivot.** Without CALLS/IMPORTS/EXTENDS relations populated:
- Cannot detect module boundaries from import patterns
- Cannot detect circular dependencies
- Cannot measure coupling between modules
- Cannot detect architecture bypass (layer skipping)
- Cannot enforce dependency direction rules

**To fix**: Need to implement:
1. **IMPORTS detection**: Parse `import`/`require()` statements, resolve to target file, find/create target symbol, add IMPORTS relation
2. **CALLS detection**: Parse function call expressions, match against known symbol names, add CALLS relation
3. **EXTENDS/IMPLEMENTS detection**: Parse class heritage clauses, resolve to target, add relation
4. This requires cross-file analysis — not just within a single tree-sitter parse

### Config & Session Details

**Config storage**: `~/.aide/projects/{projectId}/config.json`
- Project ID = SHA1(rootPath).slice(0,12)
- Default models: reasoning=gpt-5.2, context=gpt-5.2, embedding=mxbai-embed-large
- Token budget: 16K global, 128K max model input, 4K reserved for response

**Session storage**: `~/.aide/projects/{projectId}/sessions/{sessionId}.json`
- Max 10 focus symbols, 5 focus files (LRU)
- Max 50 chat history messages
- Latest session pointer in `latest.txt`

### Web Server
- Express + WebSocket on configurable port (default 3000)
- Single API endpoint: `GET /api/stats` → file/symbol/block/relation counts
- WebSocket messages: question, response, verbose, tool, error, status, stats, reindex_complete, sessions, session_switched

### Orchestration Pipeline

```
Reasoning Model (planning) → ToolExecutor (15+ tools, no model) → Context Model (evaluation)
  ↑                                                                        ↓
  └────────────────── loop until sufficient (max 5 iterations) ────────────┘
                                        ↓
                              Reasoning Model (final answer)
```

**Config**: maxIterations=5, maxToolCallsPerBatch=10, enableContextStripping=true, maxReasoningLoops=2

---

## Evolution of Thinking in This Conversation

1. **Started**: "Can AIDE compete with OpenCode/GitHub/Warp?"
   → Answer: No on the original vision.

2. **First pivot idea**: "AIDE as MCP code intelligence server" (Potpie/Code Pathfinder style)
   → Rejected after deeper research: too crowded (Potpie, Serena, CodeScene MCP all doing this), MCP monetization nascent. User pushed back: "do those tools even need this? What would AIDE be different in?"

3. **Second pivot idea**: "AI Architecture Guardian / PR review bot"
   → Refined after research: Greptile/CodeRabbit already in code review. But graph-based ARCHITECTURE enforcement (not review) is genuinely open. User asked to "convince me there's really a gap."

4. **Third pivot idea**: Architecture Health Score (Lighthouse for codebases)
   → Strong. Validated by SonarSource's $242M market. CodeScene does file-level; nobody does architecture-level. Compared against every competitor honestly.

5. **Fourth refinement**: Migration Dependency Mapper
   → Also strong. $2.14B market. vFunction is Java/.NET only. AIDE's multi-language graph is differentiated.

6. **User requested**: "Explore architecture health plan but also others that could be feasible and high demand." Also mentioned architecture suggestions/planning as a personal need — being able to get good architecture decisions 1:1 but needing to scale that.

7. **Final convergence**: User's pain point unlocked the real product thesis.
   → "I can get AI agents to make good architecture decisions 1:1. How does this scale to the whole codebase and to new devs without relying on a markdown file?"
   → Answer: `.aide/rules.yaml` as "Architecture as Code" — auto-detected from graph, machine-enforced in CI, exposed via MCP to AI agents.
   → This ties together: scan + rules + check + mcp + review + map + onboard + suggest as one coherent product suite.
   → Plus `aide suggest` (Product 8) for proactive architecture improvement recommendations, addressing the user's interest in architecture planning, not just enforcement.

---

## Open Questions for Future Sessions

- What brand name? "AIDE" feels generic for this new direction. Something that signals architecture intelligence.
- Open source strategy: fully open (viral), open core (free CLI + paid CI), or proprietary?
- Who is the lead buyer? Individual developer, tech lead, VP Engineering, CTO?
- Should AIDE's existing Q&A functionality (the original AIDE experience) be preserved as a separate product/mode or deprecated?
- Can the existing `aide ask` and REPL functionality be repurposed as `aide onboard` or `aide suggest`?
- How does the consulting service (architecture audits) connect to the product — is it a separate brand/service?
- What's the go-to-market for the open source launch? HN post content, which repos to scan?
- How does the "cost optimization" domain interest factor in? Could `aide scan` report estimated cost of tech debt?
- Should architecture suggestions (`aide suggest`) use the existing orchestration loop or a simpler approach?
- How to handle the relations blocker — implement from scratch or use ts-morph (already a dependency) for richer TypeScript analysis?
