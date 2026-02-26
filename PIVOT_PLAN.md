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

### The New Problem: "Works With My Agent"

A decade ago, the hardest coordination problem in software was **"works on my machine"** — Docker solved it by creating a standard format (Dockerfile) that made environments reproducible and enforceable.

In 2026, the new coordination problem is **"works with my agent."** AI coding agents write 35% more code but create 30% more defects, 8x more duplication, and ignore architecture conventions that live in markdown files. Every team is asking the same question: *how do I get my AI agent to follow my architecture rules consistently?*

- `.cursorrules` tells the AI "try to follow these" — the model acknowledges them, then drifts toward task completion. No enforcement.
- `CLAUDE.md` loads instructions at session start — users on [GitHub issue #18660](https://github.com/anthropics/claude-code/issues/18660) beg for enforcement mechanisms. Anthropic hasn't addressed it.
- GitHub Copilot structurally **cannot block code** — it suggests, reviews, explains, but creates no hard gates.

**AIDE's answer**: `.aide/rules.yaml` — a cross-language, git-versionable, CI-enforceable standard for architecture rules. Not suggestions. Not documentation. **Infrastructure.**

Just as Docker didn't need to be the only container runtime — it defined the FORMAT — AIDE doesn't need to be the only architecture tool. It needs to define the format that other tools integrate with.

---

### Why Big Players Structurally Can't Do This

This isn't hope — it's their architecture and incentive structure:

**1. Enforcement is friction. Their business model is velocity.**
Anthropic sells API tokens. Cursor sells IDE subscriptions. GitHub sells platform usage. Their growth metric is "help developers write MORE code." Architecture enforcement tells agents "STOP — you're violating a rule." That's counter to every growth metric they optimize for.

**2. Architecture is team-specific. They build for the general case.**
Claude Code can ship generic best practices. But YOUR team's module boundaries, dependency rules, and pattern conventions are unique to YOUR codebase. Big players won't build tooling for "your specific architecture vision" — that's inherently a niche product they can't generalize.

**3. AI tools are stateless per session. Enforcement requires persistent state.**
Cursor processes context, generates output, forgets. Architecture enforcement requires persistent, network-wide rules that survive across sessions, developers, and agents. Enterprise teams already discovered this pattern: Copilot = helpful suggestions, GitHub Actions + CodeQL = actual enforcement. Two different tools for two different jobs.

**4. Specific evidence they're NOT building this:**
- Cursor's 2026 roadmap mentions enterprise features (access controls, audit logs) but **zero mention** of architecture enforcement or pattern detection
- Anthropic's CLAUDE.md has **no roadmap** for machine-readable enforcement — the [GitHub issue](https://github.com/anthropics/claude-code/issues/18660) remains open
- GitHub Copilot Code Review (1M users) checks code quality and security, **not architecture structure**

---

### The Four Layers of Defensibility

Design the product from day one so each layer compounds on the previous:

| Layer | What | Moat Type | How It Locks In | Timeline |
|-------|------|-----------|----------------|----------|
| **1. Format** | `.aide/rules.yaml` as the standard | Standard moat | Other tools read/enforce the same format — AIDE defined it | Month 1-3 |
| **2. Pipeline** | `aide check` in CI/CD | Infrastructure lock-in | Once wired into GitHub Actions/GitLab CI, removing means rewriting gate logic across every repo | Month 2-4 |
| **3. Memory** | Architecture Decision Records + rule history with "why" | Switching cost | After 12 months, AIDE is the institutional memory. Switching = losing a year of decisions | Month 4-8 |
| **4. Intelligence** | Learning from corrections + cross-codebase benchmarks | Data moat + network effects | Tool gets better with use; benchmarks get more valuable with more users | Month 6-12+ |

#### Layer 1: Become the Architecture Rule FORMAT

How Docker, Terraform, ESLint became unkillable — three ingredients:
1. **Solves a painful coordination problem** — Docker: "works on my machine." AIDE: "works with my agent."
2. **Becomes the contract you can't avoid** — you can't ship containers without Dockerfile. Every CI pipeline needs `.aide/rules.yaml`.
3. **Other tools build around it** — 1000s of tools assume Docker format exists. If Cursor/Claude Code start READING `.aide/rules.yaml`, that's a WIN not a loss.

**No standard format exists for architecture rules.** ArchUnit = Java only. dependency-cruiser = JS/TS only. `.cursorrules` = AI suggestions, not enforcement. There's no cross-language, CI-enforceable, git-versionable architecture rule format. AIDE creates it.

#### Layer 2: Hard Enforcement in CI/CD (The SonarQube Position)

SonarQube survived **17 years** against GitHub, Microsoft, and Google. Not because of better technology. Because:
- **Quality Gates that BLOCK merges** — PRs literally cannot merge if rules are violated. Not suggestions. Not warnings. BLOCKED.
- **CI/CD pipeline integration lock** — once wired into Jenkins/GitHub Actions/GitLab CI, switching means rewriting gate logic. Nearly 40% of engineering time is spent on integrations; nobody wants to redo that.
- **Enterprise procurement friction** — once approved through security review, switching requires new approvals ($500K-$1M+ contracts).

`aide check --fail-below 75` returns exit code 1 in your GitHub Action. That's infrastructure, not a feature.

#### Layer 3: Architecture Decision Memory (The Scattered ADR Problem)

Architecture Decision Records (ADRs) are being adopted at serious scale — the UK government mandates them, Thoughtworks placed them in "Adopt," AWS and Microsoft both have frameworks. But the tooling is **terrible**: decisions scattered across spreadsheets, email threads, wikis, Confluence.

AIDE solves this: every rule links to a WHY. Over time:
- "This boundary was added after the Q3 2025 production incident"
- "We chose repository-pattern because direct DB access caused 3 outages"
- "Module X cannot import from Module Y — decision made by @lead on 2025-11-15"

After 12 months, switching to another tool means losing a year of architectural decision history. That's the Notion/Confluence effect — once you're invested, you can't leave.

#### Layer 4: Learning From Corrections (What Nobody Else Does)

Current state of "codebase-aware" tools: Tabnine stuffs more context into prompts. Cody uses embeddings for search. CodeScene analyzes file complexity. **None of them get BETTER over time on your specific codebase.** When a developer rejects a suggestion or manually fixes a violation, the tool doesn't remember.

AIDE can be different: when a developer overrides a rule, AIDE learns. "Team X considers this pattern acceptable in test files but not production." When violations are consistently dismissed for certain modules, rules adapt. After 6 months of corrections, AIDE understands YOUR team's architecture philosophy — not generic best practices. Starting over means retraining from scratch.

---

### What Will NOT Create a Moat
- CLI tools alone (get copied in weeks)
- MCP server alone (Cursor/Claude Code will build their own)
- "Better graph technology" (nobody cares about your tech stack)
- Open source community without data/enterprise layer
- "Better AI" claims (models improve constantly across all vendors)
- UI/UX excellence alone (AI + component libraries make good UI table stakes)

### Honest Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Cursor adds architecture enforcement to IDE | Medium (2-3 years, IDE-only) | AIDE works in CI/CD — IDE enforcement is complementary, not competing |
| SonarQube adds graph-based architecture analysis | Medium (they have resources) | AIDE is lighter, open source, AI-native, designed for agents |
| Anthropic makes CLAUDE.md enforceable | Low (structural conflict with growth metrics) | AIDE is tool-agnostic, works with ANY agent via MCP |
| Someone else creates the rule format standard | Medium | Move fast, get adoption first, make it open |
| Market doesn't care about architecture enforcement | Low (SonarQube = $242M/yr proves it) | Start with consulting to validate demand |

### The Bottom Line

The first 12-18 months are a **window, not a moat**. Use that window to:
1. Define the format (`.aide/rules.yaml` = the Dockerfile of architecture)
2. Get into CI/CD pipelines (infrastructure lock-in)
3. Accumulate decision history (switching cost)
4. Learn from corrections (data moat)

The architecture tools get you in the door. What keeps you there is being **too embedded to remove** — the same reason SonarQube survived 17 years despite every big player having the resources to replace it.

### Research Sources for Moat Analysis
- [Claude Code Issue #18660 — enforcement mechanisms](https://github.com/anthropics/claude-code/issues/18660)
- [Cursor Rules Guide 2026](https://promptxl.com/cursor-ai-rules-guide-2026/) | [Cursor Changelog](https://blog.promptlayer.com/cursor-changelog-whats-coming-next-in-2026/)
- [SonarQube Gartner Reviews](https://www.gartner.com/reviews/market/application-security-testing/vendor/sonarsource/product/sonarqube)
- [UK Gov ADR Framework](https://technology.blog.gov.uk/2025/12/08/the-architecture-decision-record-adr-framework-making-better-technology-decisions-across-the-public-sector/)
- [Microsoft ADR Framework](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record)
- [The "SaaSpocalypse" Versus Real-World Moats](https://alignba.com/2026/02/05/the-saaspocalypse-versus-real-world-moats/amp/)
- [The New New Moats — Greylock](https://greylock.com/greymatter/the-new-new-moats/)
- [Data and Defensibility — Pivotal](https://pivotal.substack.com/p/data-and-defensibility)
- [dependency-cruiser GitHub](https://github.com/sverweij/dependency-cruiser)
- [GitHub Copilot Policies](https://docs.github.com/en/copilot/concepts/policies)

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

## Product Refinements & Competitive Positioning

Each product below has been evaluated against existing tools to identify where AIDE fills a genuine gap vs. where the market is already saturated. Products are classified as **Essential** (build first), **Valuable** (build after core works), or **Premium** (monetization/expansion layer).

---

### Product 1: `aide scan` — Architecture Health Score | ESSENTIAL

**The "Lighthouse for codebases" — but nobody's built this yet.**

**Closest competitors and why they're not the same:**

| Tool | What It Does | What It Doesn't Do |
|------|-------------|-------------------|
| [Lighthouse](https://developer.chrome.com/docs/lighthouse) | Weighted scoring for web performance (6 metrics, percentile distribution) | Web only — doesn't touch code architecture |
| [CodeScene](https://codescene.com/) | Hotspot analysis, change coupling, knowledge distribution | File-level metrics, not architecture-level. Observational/historical, not predictive |
| [CodeCharta](https://github.com/MaibornWolff/codecharta) | 3D visualization of code metrics (LoC, complexity, churn) | No health score, no pattern detection, visualization only |
| [Teamscale](https://teamscale.com/) | Architecture conformance checking vs. a pre-defined model | Requires manual architecture modeling — doesn't auto-detect from code |

**The specific gap**: No tool auto-detects architecture patterns AND produces a weighted health score in one command. Lighthouse's scoring model (percentile-based log-normal distribution) doesn't exist for codebases. CodeScene is observational; AIDE is prescriptive (detects patterns → generates enforceable rules).

**Refinements from research:**
- Implement Lighthouse-style percentile scoring (0-100, log-normal distribution)
- Core metrics: Module Coupling, Dependency Health (layering violations), Cycle Risk, Pattern Consistency
- Show trends (↑↓→) like CodeScene, but tied to explicit rules not just historical observation
- Output auto-generated `.aide/rules.yaml` from detected patterns — this is what no competitor does
- Support `--json` output for CI integration from day one

**Phase**: Week 1-4. This is THE entry point — everything else depends on it.

---

### Product 2: `aide rules` — Architecture as Code | ESSENTIAL

**The Dockerfile of architecture — a format that becomes a standard.**

**Closest competitors and why they're incomplete:**

| Tool | Format | Language Support | Enforcement | Auto-Detection |
|------|--------|-----------------|-------------|----------------|
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | `.dependency-cruiser.json` | JS/TS only | CI-enforceable | No — manual rules |
| [ArchUnit](https://github.com/TNG/ArchUnit) | Java test classes | Java/Kotlin only | JUnit test failures | No — manual test writing |
| [Teamscale](https://teamscale.com/) | Visual diagrams in UI | Multi-language | UI-based checking | No — manual diagramming |
| `.cursorrules` | Markdown in `.cursor/rules/` | Language-agnostic | **None** — AI suggestions only | No — manual writing |
| `CLAUDE.md` | Markdown | Language-agnostic | **None** — AI may or may not follow | No — manual writing |
| **`.aide/rules.yaml`** | **YAML in repo** | **Language-agnostic** | **CI-enforceable** | **Yes — auto-detected from graph** |

**The specific gap**: No architecture-as-code format exists that is simultaneously language-agnostic, lives in the repository (version-controlled), is CI-enforceable, AND auto-detected from the actual codebase. dependency-cruiser comes closest but is JS/TS-only and requires manual rule definition.

**Refinements from research:**
- Three rule types: **boundaries** (module import restrictions), **patterns** (code conventions like error handling style), **constraints** (metric thresholds like max coupling)
- Support [SARIF output](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html) so VS Code/IntelliJ can show violations inline in editor
- Include decision records: every rule has an optional `reason:` field — "Added after Q3 production incident"
- Make the spec open so other tools can read `.aide/rules.yaml` — this is the format play

**Phase**: Week 2-4, parallel with scan development.

---

### Product 3: `aide check` — Architecture Enforcement | ESSENTIAL

**The CI gate. Where SonarQube's actual moat lives.**

**Closest competitors and the critical difference:**

| Tool | What It Gates | Architecture-Aware? | In Repo? |
|------|--------------|--------------------|---------|
| [SonarQube Quality Gates](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/) | Bugs, coverage, duplication, security | No — code quality, not architecture | Config in SonarQube server |
| GitHub Branch Protection | Required approvals, code owners | No — file-path based (CODEOWNERS) | Partial (CODEOWNERS in repo) |
| dependency-cruiser CI | Dependency rule violations | Partial — JS/TS only | Yes |
| [Checkov](https://github.com/bridgecrewio/checkov) | Infrastructure-as-code security | No — IaC only | Yes |

**The specific gap**: No tool enforces architecture rules as a primary CI gate. SonarQube gates on code quality metrics (bugs, coverage). GitHub gates on approvals. dependency-cruiser is the closest but JS/TS only. Nobody gates on "does this PR violate our module boundary rules?"

**Refinements from research:**
- Three enforcement modes: `--fail-on error` (strict), `--report-only` (warnings in PR), `--auto-fix` (suggest fixes)
- Output SARIF format for GitHub Advanced Security / GitLab SAST integration
- Show violations with diff context: "This import in `api/controller.ts:15` violates boundary rule `api.cannot_import: [ui]`"
- Native GitHub Action: `aide-check@v1` (minimal setup)
- Score delta reporting: "This PR would change score from 82 → 76 (threshold: 70)"

**Phase**: Week 4-6. Depends on scan and rules being functional.

---

### Product 4: `aide mcp` — Architecture-Aware AI Agent Layer | PREMIUM

**The bridge between enforcement and AI agents. Unique positioning but not core.**

**Market context:**

| MCP Category | Examples | AIDE's Position |
|-------------|---------|----------------|
| Utility MCPs | File ops, API calls, data lookups | Not competing here |
| Code context MCPs | [Serena](https://github.com/oraios/serena), [Potpie](https://github.com/potpie-ai/potpie) | Adjacent — they provide context, AIDE provides enforcement |
| Code health MCPs | [CodeScene MCP](https://github.com/codescene-oss/codescene-mcp-server) | Different — CodeScene scores file complexity, AIDE enforces architecture rules |
| Architecture MCPs | **None exist** | **Open field** |

**MCP monetization landscape** (nascent, 2026):
- [Apify](https://apify.com/mcp/developers): Pay-per-event, 130K+ monthly signups
- [MCP Hive](https://mcp-hive.com/): Transparent pricing, providers earn per response
- Outcome-based pricing emerging ([Moesif](https://www.moesif.com/)): charge only for successful/valuable responses

**Refinements from research:**
- Three MCP tools exposed: `check_architecture` (pass/fail), `find_similar` (duplicate detection), `get_rules` (what's allowed here?)
- Monetization: Freemium (basic checks free, advanced analysis paid)
- Consider outcome-based pricing: charge when agent follows a rule that prevents a violation
- Target all MCP-compatible agents (Cursor, Claude Code, OpenCode, Copilot)

**Phase**: Week 4-6 (parallel, ~2-3 days on top of core). The core tools must work first — MCP just wraps them.

---

### Product 5: `aide review` — PR Architecture Gate | VALUABLE (but watch redundancy)

**GitHub App for friction-free enforcement. Market is saturated for CODE review — but NOT for ARCHITECTURE review.**

**Market saturation warning:**

| Tool | Users/Scale | Focus |
|------|-----------|-------|
| [GitHub Copilot Code Review](https://docs.github.com/en/copilot) | 1M+ users (first month of GA) | Code quality, security, style |
| [CodeRabbit](https://www.coderabbit.ai/) | 2M+ repos, 13M+ PRs | Code quality, security, performance |
| [Greptile](https://www.greptile.com/) | $25M raised, $180M valuation | Org-wide rule application (closest to AIDE) |
| [Graphite](https://graphite.dev/) | Shopify: 33% more PRs merged/dev | PR workflow optimization |

**The nuance**: The PR review bot market is SATURATED for code quality review. AIDE should NOT compete on "we review your code better." But architecture-specific enforcement in PRs is an open niche — Greptile is closest but uses AI opinions, not deterministic graph-based rules.

**Refinements from research:**
- **Don't compete on code review** — you can't beat Copilot's scale or CodeRabbit's coverage
- **Architecture-only enforcement**: Show boundary violations, coupling increases, pattern drift
- Position as complementary to existing review tools, not replacing them
- Score delta in PR comment: "Architecture health: 82 → 76 (⚠️ dropped below threshold)"
- Consider: if `aide check` runs in CI, this is UI sugar. Value is making violations visible in the PR conversation rather than buried in CI logs.

**Phase**: Month 2-3. Build AFTER `aide check` proves valuable — this is the paid wrapper.

---

### Product 6: `aide map` — Dependency Visualization | VALUABLE (heavily de-scope)

**Market is saturated with visualization tools. AIDE's angle: enforcement-aware visualization.**

**What already exists (too many to compete with on features):**

| Tool | Languages | Unique Feature |
|------|----------|---------------|
| [Madge](https://github.com/pahen/madge) | JS/TS | Fast, SVG/DOT output, circular dep detection |
| [Emerge](https://github.com/glato/emerge) | 12+ languages | Browser-based interactive, code quality metrics |
| [NX Graph](https://nx.dev/docs/features/explore-graph) | Monorepo | Interactive workspace graph, composite nodes |
| [CodeCharta](https://github.com/MaibornWolff/codecharta) | Multi-language | 3D interactive architecture maps |
| [CodeSee](https://www.codesee.io/) | Multi-language | Function-level flowcharts, requires SDK |

**Refinements from research:**
- **Don't build a standalone visualization tool** — the market doesn't need another one
- **Instead**: Overlay rule violations on the dependency graph. Show which edges are violations (red), allowed (green), auto-detected patterns (blue)
- Integrate with `aide scan` output — "here's your architecture, here's what's broken"
- Use interactive HTML (similar to Madge/Emerge) — not a separate app
- Keep it minimal: one command (`aide map --open`) generates an HTML file

**Phase**: Month 3-4. Nice-to-have for understanding, but enforcement matters more.

---

### Product 7: `aide onboard` — Auto-Generated Architecture Guide | VALUABLE (emerging category)

**Most underserved category. Few tools do architecture-specific onboarding.**

**What exists (and why it's insufficient):**

| Tool | What It Generates | Architecture-Aware? |
|------|------------------|-------------------|
| [Swimm](https://swimm.io/) | Repo overview docs via GenAI + static analysis | Partial — relational ranking but not architecture-focused |
| [DocuWriter.ai](https://www.docuwriter.ai/) | Swagger-compliant API docs | No — API docs only |
| [Doxygen](https://www.doxygen.nl/) | Docs from code comments | No — comment-based, not architecture |
| [DAUT](https://github.com/daut/daut) | AI-powered docs with MCP | No — general documentation |

**The specific gap**: No tool generates architecture-specific onboarding docs that include module boundaries, dependency rules, patterns, conventions, and decision rationale — all from code analysis, not manual writing.

**Refinements from research:**
- Generate structured onboarding guide: Module map → Rules & boundaries → Patterns (how we handle X) → Conventions → Decision history (why we do it this way)
- Output as Markdown in repo (not a separate tool/wiki)
- Use LLM to write narrative explanations; AIDE provides the structural facts
- Auto-update when rules or patterns change (not a one-time doc)

**Phase**: Month 3-4. Works best AFTER scan + rules are established — needs data to generate from.

---

### Revised Phase Plan (Incorporating Refinements)

| Phase | Products | Timeline | Key Deliverable |
|-------|----------|----------|-----------------|
| **Phase 0** | Fix `inferRelations()` blocker | Week 0-1 | IMPORTS/CALLS/EXTENDS actually populated in graph |
| **Phase 1a** | `aide scan` + `aide rules` | Week 1-4 | `npx aide-arch scan` produces score + `.aide/rules.yaml` |
| **Phase 1b** | `aide check` | Week 4-6 | `aide check --fail-below 75` works in CI |
| **Phase 1c** | `aide mcp` (parallel) | Week 4-6 | MCP tools wrap scan/check for AI agents |
| **Phase 1d** | Consulting revenue (parallel) | Week 1+ | Architecture audits using AIDE manually ($5K-20K) |
| **Phase 2** | `aide review` (GitHub App) | Month 2-3 | Paid PR enforcement layer ($30-50/repo/mo) |
| **Phase 3a** | `aide onboard` | Month 3-4 | Auto-generated architecture guide |
| **Phase 3b** | `aide map` (minimal) | Month 3-4 | Enforcement-aware dependency visualization |
| **Phase 4** | Decision memory + learning | Month 4-8 | ADR tracking, correction learning (moat layers 3-4) |
| **Phase 5** | Benchmarking + compliance | Month 6-12 | Cross-company benchmarks, SOC2/HIPAA mappings |

### Product Priority Matrix

```
                    HIGH UNIQUENESS
                         │
          aide rules ────┤──── aide scan
          aide check     │
                         │
   LOW VALUE ────────────┼──────────── HIGH VALUE
                         │
          aide map ──────┤──── aide onboard
          (saturated)    │    aide review
                         │    aide mcp
                         │
                    LOW UNIQUENESS
```

**Essential (build first)**: scan → rules → check
**Valuable (build after core)**: onboard, review
**Premium (monetization)**: mcp, review (paid tier)
**De-scoped (minimal effort)**: map (just overlay violations on graph, don't build a full viz tool)

### Competitive Positioning Sources
- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | [ArchUnit](https://github.com/TNG/ArchUnit) | [Teamscale](https://teamscale.com/features/architecture-conformance-analysis)
- [Madge](https://github.com/pahen/madge) | [Emerge](https://github.com/glato/emerge) | [NX Graph](https://nx.dev/docs/features/explore-graph) | [CodeCharta](https://github.com/MaibornWolff/codecharta)
- [SonarQube Quality Gates](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/) | [Checkov](https://github.com/bridgecrewio/checkov)
- [Swimm](https://swimm.io/) | [CodeRabbit](https://www.coderabbit.ai/) | [Greptile](https://www.greptile.com/)
- [Apify MCP](https://apify.com/mcp/developers) | [MCP Hive](https://mcp-hive.com/) | [SARIF Spec](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
- [GitHub Copilot Code Review](https://docs.github.com/en/copilot) | [Lighthouse Scoring](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)

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
