# AIDE Consolidated Research & Findings

> Consolidated February 27, 2026 from five source documents:
> - **PIVOT_PLAN.md** (strategic plan, competitive analysis, moat strategy, expansion research)
> - **NEXT_STEPS.md** (prioritized action plan from product evaluation + audit)
> - **PRODUCT_EVALUATION.md** (hands-on evaluation of AIDE v0.3.0 against 4 real repos)
> - **PRODUCT_CHANGES_SUMMARY.md** (product refinements after competitive research)
> - **IMPLEMENTATION_REPORT.md** (technical capabilities of AIDE v0.3.0)
>
> All data points are preserved. Source doc cited in brackets after each item.

---

## 1. Market Data

### AI-Generated Code Creates Technical Debt

- AI coding agents write 35% more code but create 30% more defects. [PIVOT_PLAN]
  - Source: [CodeScene peer-reviewed research](https://www.prnewswire.com/news-releases/ai-coding-assistants-increase-defect-risk-by-30-in-unhealthy-code-new-peer-reviewed-research-finds-302672355.html)
- AI agents create 8x more duplicated code blocks. Copy-pasted code up 48%. [PIVOT_PLAN]
  - Source: [InfoQ report](https://www.infoq.com/news/2025/11/ai-code-technical-debt/)
- Companies using AI agents heavily hit 4x maintenance costs within 18 months. [PIVOT_PLAN]
  - Source: [Pixelmojo research](https://www.pixelmojo.io/blogs/vibe-coding-technical-debt-crisis-2026-2027)
- AI coding agents increased PR volume 29% YoY; code churn doubling. [PIVOT_PLAN]
- 40-62% of AI-generated code contains security vulnerabilities or design flaws. [PIVOT_PLAN]
- Teams waste 23-42% of development time on tech debt. [PIVOT_PLAN]
- 75% of tech decision-makers face moderate to severe technical debt by 2026. [PIVOT_PLAN]
- Stack Overflow: "AI can 10x developers in creating tech debt." [PIVOT_PLAN]
  - Source: [Stack Overflow blog, Jan 2026](https://stackoverflow.blog/2026/01/23/ai-can-10x-developers-in-creating-tech-debt)

### Market Sizes and Revenue Benchmarks

- Dependency mapping market: $2.14B in 2025, projected $6.25B by 2035. [PIVOT_PLAN]
  - 66% of enterprises report increased complexity; 74% of DevOps teams adopting these tools.
  - Source: [Global Growth Insights](https://www.globalgrowthinsights.com/market-reports/application-dependency-mapping-tools-market-118759)
- Code quality market: SonarSource at $242M/yr revenue with 120K+ organizations, 500-1000 employees. [PIVOT_PLAN]
  - Source: [Growjo](https://growjo.com/company/SonarSource)
- SonarQube survived 17 years against GitHub, Microsoft, and Google due to CI/CD pipeline lock-in and quality gates that block merges. [PIVOT_PLAN]

### MCP Ecosystem (as of Feb 2026)

- All major vendors converged on MCP as universal standard in Jan 2026. [PIVOT_PLAN]
- Marketplaces growing rapidly: Cline marketplace, Glama.ai, mcpservers.org, Apify with 36K+ monthly developers. [PIVOT_PLAN]
- MCP monetization models: Pay-per-event, tiered subscriptions ($15-30% transaction fees), freemium. Still nascent -- most MCP servers are free. [PIVOT_PLAN]
- Apify: pay-per-event, 130K+ monthly signups. [PIVOT_PLAN]
- MCP Hive: transparent pricing, providers earn per response. [PIVOT_PLAN]
- Outcome-based pricing emerging (Moesif): charge only for successful/valuable responses. [PIVOT_PLAN]

### Convention as Code / Codified Context (Emerging Pattern)

- "Convention as Code" pattern: encoding architecture conventions as executable infrastructure, not markdown docs. [PIVOT_PLAN]
  - Source: [dev.to article](https://dev.to/monarchwadia/convention-as-code-enforcing-architecture-with-scripts-ci-and-ai-agents-hgd)
- "Codified Context" paper (arxiv 2602.20478, Feb 24, 2026): 3-tier infrastructure for AI agents in a 108K-line C# distributed system. [PIVOT_PLAN]
  - Component 1: Hot-memory "constitution" -- conventions, retrieval hooks, orchestration protocols (always loaded)
  - Component 2: 19 specialized domain-expert agents
  - Component 3: Cold-memory knowledge base -- 34 on-demand specification documents
  - Tested across 283 development sessions
  - Key finding: Documentation becomes infrastructure, not artifact. Specifications as inter-session coordination.
- "Agent READMEs Study" (arxiv 2511.12884): empirical study of context files for agentic coding. Examines how .cursorrules, CLAUDE.md, AGENTS.md are used in practice. [PIVOT_PLAN]
- Martin Fowler on context engineering: rules, retrieval hooks, and orchestration protocols as first-class concerns. [PIVOT_PLAN]
- AGENTS.md 29% runtime reduction study. [PIVOT_PLAN]
  - Source: [GitHub Gist analysis](https://gist.github.com/0xdevalias/f40bc5a6f84c4c5ad862e314894b2fa6)

### AI Agent Governance

- 80% of Fortune 500 use active AI agents (Microsoft, Feb 2026). [PIVOT_PLAN]
- 29% of employees use unsanctioned AI agents. [PIVOT_PLAN]
- CIOs/CISOs worried about prompt injection, over-permissioned agents, lack of traceability. [PIVOT_PLAN]
  - Source: [Microsoft Security Blog](https://www.microsoft.com/en-us/security/blog/2026/02/10/80-of-fortune-500-use-active-ai-agents-observability-governance-and-security-shape-the-new-frontier/)

### Developer Onboarding and Productivity

- Developer onboarding takes 3-6 months to full productivity. [PIVOT_PLAN]
  - Source: [Growin blog](https://www.growin.com/blog/developer-retention-costs-onboarding/)
- 20 workdays lost per year to tech issues. Context switching across 6+ tools. [PIVOT_PLAN]
  - Source: [ITPro](https://www.itpro.com/software/development/clunky-tech-is-costing-developers-20-working-days-a-year-these-are-the-leading-productivity-drains-impacting-teams)
- Entelligence AI claims 80% reduction in onboarding time. [PIVOT_PLAN]
- Nearly 40% of engineering time is spent on integrations; nobody wants to redo CI/CD gate logic. [PIVOT_PLAN]

### AI Coding Tool Personalization

- Tabnine is the only tool that learns from the actual codebase (not just manual rules files), but learns coding patterns for completion, not architectural style. [PIVOT_PLAN]
- Packmind extracts coding practices from code review discussions, not from code itself. [PIVOT_PLAN]
- Research shows 95% accuracy in identifying code authors from style analysis using AST structural features and naming patterns. [PIVOT_PLAN]
  - Source: [Cyber Defense Magazine](https://www.cyberdefensemagazine.com/the-invisible-fingerprint-in-code/)
- Research on adoption and evolution of code style in open-source projects shows teams converge on shared conventions over time but organically and slowly. [PIVOT_PLAN]
  - Source: [arxiv 2601.09832](https://arxiv.org/html/2601.09832)

### LLM SOLID Evaluation Research

- A 2026 study ("LLMs as Code Review Agents") developed a 12-metric framework for code quality evaluation. Claude Sonnet showed strongest correlation with human expert review on SOLID assessment. However, LLMs systematically overrate complex principles like Liskov Substitution. [PIVOT_PLAN]
  - Source: [Springer](https://link.springer.com/chapter/10.1007/978-3-032-09318-9_24)

### Context Loss / Compaction in AI Tools

- Claude Code: SDK injects summary prompt at ~80-95% of context window. Entire history replaced with summary. Auto-compact can trigger at 8-12% remaining instead of 95%+. Context management can become permanently corrupted after failed compaction. Anthropic introduced "context editing" and "memory tool" (Sept 2025) but memory auto-synthesizes ~every 24h, not real-time. [PIVOT_PLAN]
- Cursor: when context fills, AI "becomes a stranger." One developer lost 200KB of code work when compaction failed mid-session. /compress command exists for manual summarization. Jan 2026: new context discovery principles published but about discovery, not persistence. [PIVOT_PLAN]
- Core issue: compaction erodes trust. Developers hold back from establishing deep context. [PIVOT_PLAN]

---

## 2. Competitive Landscape

### Primary Competitor Table

| Competitor | What They Do | What AIDE Does Differently | Source |
|-----------|-------------|---------------------------|--------|
| [CodeScene](https://codescene.com/) | File-level code health metrics, change coupling, knowledge distribution, hotspot analysis | System-level architecture health scoring, not file-level | PIVOT_PLAN |
| [SonarQube](https://www.sonarsource.com/) ($242M/yr) | Lint, security, code smells, 5000+ rules, quality gates | Architecture structure, dependency rules, team-specific philosophy | PIVOT_PLAN |
| [Greptile](https://www.greptile.com/) ($25M raised, $180M val) | AI code review with codebase understanding | Deterministic graph-based rule enforcement vs AI opinions | PIVOT_PLAN |
| [ArchUnit](https://www.archunit.org/) | Architecture rules in Java unit tests | Multi-language rules in YAML config, auto-detected from graph | PIVOT_PLAN |
| [Serena MCP](https://github.com/oraios/serena) | LSP + tree-sitter code navigation for AI (30+ languages), session memory | Architecture rules enforcement for AI, not just navigation. Serena in beta. | PIVOT_PLAN |
| [Potpie](https://github.com/potpie-ai/potpie) ($2.2M raised) | Knowledge graph context for AI agents (Neo4j). 5K GitHub stars. Requires Docker + Redis + Celery + FastAPI + Neo4j. | Graph-based architecture ENFORCEMENT (SQLite, local-first), lightweight | PIVOT_PLAN |
| [vFunction](https://vfunction.com/) | Java/.NET architectural modernization. "Agentic modernization" in 2026. Enterprise pricing. | Multi-language, lightweight, open source | PIVOT_PLAN |
| [drift CLI](https://dev.to/eduardbar/drift-an-open-source-cli-that-detects-silent-technical-debt-in-ai-generated-typescript-code-4ll7) | TS-only basic AI debt scoring, 0-100, no graph | Multi-language graph-based architecture scoring | PIVOT_PLAN |
| [Agent RuleZ](https://medium.com/@richardhightower/agent-rulez-a-deterministic-policy-engine-for-ai-coding-agents-9489e0561edf) | Deterministic policy engine for CLI commands (Rust). YAML rules, sub-10ms eval. Blocks dangerous CLI ops. | Architecture-level code understanding, not CLI policy. Complementary. | PIVOT_PLAN |
| [CodeScene MCP](https://github.com/codescene-oss/codescene-mcp-server) | Code health scores via MCP, 3-level safeguards (per-snippet, pre-commit, pre-PR) | Architecture rules, not file metrics | PIVOT_PLAN |
| `.cursorrules`/`CLAUDE.md`/`AGENTS.md` | Static text AI may or may not follow | Machine-readable rules AI must check via MCP tools. Deterministic, not suggestions. | PIVOT_PLAN |
| [CodeRabbit](https://www.coderabbit.ai/) (2M+ repos, 13M+ PRs) | AI PR review bot for code quality, security, performance | Rule-based architecture enforcement, not AI opinions | PIVOT_PLAN |
| [Graphite](https://graphite.dev/) | PR workflow optimization. Shopify: 33% more PRs merged/dev. Asana: 7 hrs/week saved. | Architecture health, not PR workflow | PIVOT_PLAN |
| [Qodo](https://www.qodo.ai/) | Agentic code integrity, 15+ specialized review agents, architecture rules | Deterministic graph analysis vs probabilistic LLM review | PIVOT_PLAN |
| [Augment Code](https://augmentcode.com/) | AI coding for complex codebases, enterprise, multi-repo context | Different focus -- architecture enforcement vs coding assistance | PIVOT_PLAN |

### Architecture Rules Format Comparison

| Tool | Format | Language Support | Enforcement | Auto-Detection | Source |
|------|--------|-----------------|-------------|----------------|--------|
| [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) | `.dependency-cruiser.json` | JS/TS only | CI-enforceable | No -- manual rules | PIVOT_PLAN |
| [ArchUnit](https://github.com/TNG/ArchUnit) | Java test classes | Java/Kotlin only | JUnit test failures | No -- manual test writing | PIVOT_PLAN |
| [Teamscale](https://teamscale.com/) | Visual diagrams in UI | Multi-language | UI-based checking | No -- manual diagramming | PIVOT_PLAN |
| `.cursorrules` | Markdown in `.cursor/rules/` | Language-agnostic | None -- AI suggestions only | No -- manual writing | PIVOT_PLAN |
| `CLAUDE.md` | Markdown | Language-agnostic | None -- AI may or may not follow | No -- manual writing | PIVOT_PLAN |
| **`.aide/rules.yaml`** | **YAML in repo** | **Language-agnostic** | **CI-enforceable** | **Yes -- auto-detected from graph** | PIVOT_PLAN |

### CI Gate Comparison

| Tool | What It Gates | Architecture-Aware? | In Repo? | Source |
|------|-------------|---------------------|----------|--------|
| SonarQube Quality Gates | Bugs, coverage, duplication, security | No -- code quality, not architecture | Config in SonarQube server | PIVOT_PLAN |
| GitHub Branch Protection | Required approvals, code owners | No -- file-path based (CODEOWNERS) | Partial | PIVOT_PLAN |
| dependency-cruiser CI | Dependency rule violations | Partial -- JS/TS only | Yes | PIVOT_PLAN |
| [Checkov](https://github.com/bridgecrewio/checkov) | Infrastructure-as-code security | No -- IaC only | Yes | PIVOT_PLAN |
| **aide check** | Architecture rule violations | **Yes** | **Yes** | PIVOT_PLAN |

### MCP Server Landscape

| MCP Category | Examples | AIDE's Position | Source |
|-------------|---------|----------------|--------|
| Utility MCPs | File ops, API calls, data lookups | Not competing here | PIVOT_PLAN |
| Code context MCPs | Serena, Potpie | Adjacent -- they provide context, AIDE provides enforcement | PIVOT_PLAN |
| Code health MCPs | CodeScene MCP (3-level safeguards) | Different -- CodeScene scores file complexity, AIDE enforces architecture rules | PIVOT_PLAN |
| Architecture MCPs | None exist | Open field | PIVOT_PLAN |

### PR Review Bot Market (Saturated)

| Tool | Users/Scale | Focus | Source |
|------|-----------|-------|--------|
| GitHub Copilot Code Review | 1M+ users (first month GA) | Code quality, security, style | PIVOT_PLAN |
| CodeRabbit | 2M+ repos, 13M+ PRs | Code quality, security, performance | PIVOT_PLAN |
| Greptile | $25M raised, $180M valuation | Org-wide rule application | PIVOT_PLAN |
| Graphite | Shopify: 33% more PRs merged/dev | PR workflow optimization | PIVOT_PLAN |

### Visualization Tool Market (Saturated)

| Tool | Languages | Unique Feature | Source |
|------|----------|---------------|--------|
| [Madge](https://github.com/pahen/madge) | JS/TS | Fast, SVG/DOT output, circular dep detection | PIVOT_PLAN |
| [Emerge](https://github.com/glato/emerge) | 12+ languages | Browser-based interactive, code quality metrics | PIVOT_PLAN |
| [NX Graph](https://nx.dev/docs/features/explore-graph) | Monorepo | Interactive workspace graph, composite nodes | PIVOT_PLAN |
| [CodeCharta](https://github.com/MaibornWolff/codecharta) | Multi-language | 3D interactive architecture maps | PIVOT_PLAN |
| [CodeSee](https://www.codesee.io/) | Multi-language | Function-level flowcharts, requires SDK | PIVOT_PLAN |

### Onboarding Tool Market

| Tool | What It Does | Architecture-Aware? | Proactive Guidance? | Source |
|------|-------------|---------------------|-------------------|--------|
| [Swimm](https://swimm.io/) | AI-powered code understanding, module discovery, docs | Yes -- relational ranking | Partial -- docs, not enforcement | PIVOT_PLAN |
| [Entelligence AI](https://www.entelligence.ai/) | Codebase mapping, interactive exploration, 3 learning modes | Yes -- architectural overviews | Partial -- exploration, not enforcement | PIVOT_PLAN |
| [CodeQA](https://www.codeqa.ai/) | Multi-repo code search, knowledge graph maps file/function/repo relationships | Yes -- cross-repo knowledge graph | Yes -- "find existing before writing new" | PIVOT_PLAN |
| [Packmind](https://packmind.com/) (113 GitHub stars, open source) | Engineering playbook from code reviews, auto-syncs conventions | Partially -- conventions, not structure | Yes -- governance and drift detection | PIVOT_PLAN |
| [Qodo Aware](https://www.qodo.ai/blog/introducing-qodo-aware-deep-codebase-intelligence-for-enterprise-development/) | Deep codebase intelligence, multi-repo, downstream impact | Yes -- architecture rules on every change | Yes -- active enforcement | PIVOT_PLAN |
| [DocuWriter.ai](https://www.docuwriter.ai/) | Swagger-compliant API docs | No -- API docs only | No | PIVOT_PLAN |
| [Doxygen](https://www.doxygen.nl/) | Docs from code comments | No -- comment-based | No | PIVOT_PLAN |
| [DAUT](https://github.com/daut/daut) | AI-powered docs with MCP | No -- general documentation | No | PIVOT_PLAN |

### MCP Memory Server Landscape (Crowded)

| Tool | Approach | Differentiator | Source |
|------|----------|---------------|--------|
| [Mem0 / OpenMemory MCP](https://mem0.ai/openmemory) | Semantic vector memory (Qdrant), local-first. Docker + Postgres + Qdrant. 11 MCP tools. | Fine-grained access control, app-specific memory filters | PIVOT_PLAN |
| [Anthropic Memory MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/memory) | Knowledge graph (entities, relations, observations) in local JSONL file | Official Anthropic server, simple, lightweight | PIVOT_PLAN |
| [Pieces LTM-2.7](https://pieces.app/features/mcp) | Long-Term Memory Engine, code snippets, browser history, notes | "9-month context window", cross-tool memory, fully on-device | PIVOT_PLAN |
| [SaveContext](https://savecontext.dev/) | SQLite-based session management, semantic search. MCP + CLI. | Multi-agent coordination, no cloud dependency | PIVOT_PLAN |
| [OneContext](https://supergok.com/onecontext-persistent-context-layer-ai-coding-agents/) | Persistent context layer wrapping AI agents. Session boundaries dissolve. | Shareable context via hyperlink, multi-agent same-context | PIVOT_PLAN |
| [Memory Keeper MCP](https://github.com/mkreyman/mcp-memory-keeper) | Checkpoint/restore for Claude Code. Smart compaction. | Direct compaction workaround with git integration | PIVOT_PLAN |
| [mcp-ai-memory](https://github.com/scanadi/mcp-ai-memory) | Production-ready semantic memory management | Clean API for memory CRUD | PIVOT_PLAN |
| [Cognee](https://www.cognee.ai/blog/deep-dives/model-context-protocol-cognee-llm-memory-made-simple) | LLM memory via knowledge graphs | Graph-based memory retrieval | PIVOT_PLAN |
| [Mantra](https://dev.to/gonewx/the-5-minute-setup-that-saves-hours-of-lost-ai-coding-work-1hlb) | Auto-snapshots session files before compaction | Visual timeline replay of sessions | PIVOT_PLAN |

### Design Quality / SOLID Analysis Tools

| Tool | What It Evaluates | Limitations | Source |
|------|-------------------|-------------|--------|
| [Designite](https://www.designite-tools.com/) / DesigniteJava | 19 design smells + 11 implementation smells (OO principles: abstraction, encapsulation, hierarchy, modularity). Dependency Structure Matrix. | C# and Java only. No configurable philosophies. No CI integration. Academic tool. | PIVOT_PLAN |
| [NDepend](https://www.ndepend.com/) | .NET code quality with dependency analysis, code rules | .NET only. Implementation smells more than design/architecture. | PIVOT_PLAN |
| [SonarQube](https://www.sonarsource.com/) | 5000+ rules. Bugs, vulnerabilities, code smells, coverage. | Purely quantitative. No SOLID evaluation. Rules universal, not team-specific. | PIVOT_PLAN |
| [Qodo](https://www.qodo.ai/) | 15+ specialized review agents. Architecture rules enforcement. | AI-opinion based (probabilistic). LLM judgment, not deterministic graph. | PIVOT_PLAN |
| [Packmind](https://packmind.com/) | Captures team coding conventions from code reviews. Auto-extracts practices. | Convention capture, not principle evaluation. Extracts what teams DO, not whether it follows SOLID. | PIVOT_PLAN |

### AI Coding Tool Personalization Comparison

| Tool | Personalization Method | Scope | Learns from Code? | Source |
|------|----------------------|-------|-------------------|--------|
| Claude Code | CLAUDE.md (manual). Memory feature (24h auto-summarize). /init generates initial config. | Per-project | Partially -- /init scans for tech stack | PIVOT_PLAN |
| Cursor | .cursorrules files (manual). Path-scoped rules. Context discovery. | Per-project, per-dir | No -- manual | PIVOT_PLAN |
| GitHub Copilot | copilot-instructions.md (manual) | Per-project | No -- manual | PIVOT_PLAN |
| [Tabnine Enterprise](https://docs.tabnine.com/main/welcome/readme/personalization) | Trains on org's private repos. Local code awareness. RAG on open files. | Per-org, per-dev | YES -- actual codebase patterns | PIVOT_PLAN |
| Windsurf | .windsurf/rules (manual) | Per-project | No | PIVOT_PLAN |
| [Packmind](https://packmind.com/) | Extracts practices from code review discussions | Per-team | Partially -- reviews, not code itself | PIVOT_PLAN |

### AI Config File Generation Tools

| Tool | What It Does | Limitation | Source |
|------|-------------|-----------|--------|
| [ClaudeMDEditor](https://www.claudemdeditor.com/) | Manages AI config files across projects | Doesn't generate from code analysis | PIVOT_PLAN |
| [AI Instruction File Generator](https://ai-agent-md.com/) | Generates CLAUDE.md etc | From user input, not automated code analysis | PIVOT_PLAN |
| Claude Code `/init` | Generates basic CLAUDE.md from codebase scan | Shallow -- tech stack + folder structure, not architecture patterns | PIVOT_PLAN |
| [HowYouCode](https://howyoucode.dev/) | Developer fingerprinting: comment ratio, function size, error handling, naming. Scores 0-10/dimension. Runs in-browser. | Profile card only, not actionable rules | PIVOT_PLAN |

### Scoring Tool Comparison

| Tool | What It Does | What It Doesn't Do | Source |
|------|-------------|-------------------|--------|
| [Lighthouse](https://developer.chrome.com/docs/lighthouse) | Weighted scoring for web performance (6 metrics, percentile distribution) | Web only -- doesn't touch code architecture | PIVOT_PLAN |
| [CodeScene](https://codescene.com/) | Hotspot analysis, change coupling, knowledge distribution | File-level, observational/historical, not predictive | PIVOT_PLAN |
| [CodeCharta](https://github.com/MaibornWolff/codecharta) | 3D visualization of code metrics (LoC, complexity, churn) | No health score, no pattern detection, visualization only | PIVOT_PLAN |
| [Teamscale](https://teamscale.com/) | Architecture conformance checking vs pre-defined model | Requires manual architecture modeling | PIVOT_PLAN |

### Linting / Framework Rule Tools

| Tool | Coverage | Architecture-Level? | Source |
|------|---------|-------------------|--------|
| [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react) | 100+ React rules | No -- single-file only | PIVOT_PLAN |
| [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks) | Hook rules | No -- hook correctness, not architecture | PIVOT_PLAN |
| ESLint `complexity` rule | Cyclomatic complexity per function | No -- per-function, not per-component | PIVOT_PLAN |
| [Biome](https://biomejs.dev/) | 423+ lint rules, type-aware (v2.3). Extremely fast. | Limited -- evolving cross-file but still mostly single-file | PIVOT_PLAN |

### Threats That Triggered the Pivot

| Threat | Description | Status | Source |
|--------|------------|--------|--------|
| [OpenCode](https://github.com/opencode-ai/opencode) | 100K+ GitHub stars, Go-based, fully open source, free. Supports 75+ models. Multi-agent system, LSP, session persistence, MCP. | Already IS what AIDE CLI was planning to become, but further along and free. | PIVOT_PLAN |
| [GitHub Copilot Coding Agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) | Autonomous background agent from GitHub issues. Spins up secure isolated environments via Actions. GA since Sept 2025. All paid subscribers. Feb 2026: added model picker. | Deep platform lock-in -- they own GitHub (100M+ devs). | PIVOT_PLAN |
| [Warp Oz](https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents) | Cloud orchestration for coding agents at scale. Docker sandboxes, multi-repo, hundreds of parallel agents, CLI/API/SDK, scheduling, agent-human handoff. Launched Feb 10, 2026. | "THIS IS THE FULL AIDE VISION -- already shipped." | PIVOT_PLAN |

### Where AIDE Has Zero Competition

1. Graph-based SOLID principle detection -- nobody does deterministic SRP/DIP/ISP analysis from a knowledge graph. [PIVOT_PLAN]
2. Auto-generated AI agent configs from codebase analysis -- nobody generates .cursorrules/CLAUDE.md from graph analysis of actual code patterns. [PIVOT_PLAN]
3. Architecture-linked decision memory -- nobody stores architecture decisions linked to a knowledge graph (modules, boundaries, patterns). [PIVOT_PLAN]
4. Proactive duplicate prevention at architecture level -- CodeQA does search, but nobody blocks PRs that create semantically duplicate components. [PIVOT_PLAN]
5. Configurable philosophy evaluation -- nobody lets teams configure WHICH design philosophy to evaluate against in machine-readable YAML. [PIVOT_PLAN]

### Where AIDE Should NOT Compete

1. General AI memory -- Mem0, Pieces, SaveContext are ahead and the market is commoditizing. [PIVOT_PLAN, NEXT_STEPS]
2. Single-file lint rules -- ESLint, Biome are too mature and too fast. [PIVOT_PLAN, NEXT_STEPS]
3. AI code review -- Copilot (1M+ users), CodeRabbit (2M+ repos), Greptile ($25M) are entrenched. [PIVOT_PLAN, NEXT_STEPS]
4. Code completions/suggestions -- Copilot, Cursor, Tabnine own this space. [PIVOT_PLAN]
5. Generic documentation generation -- Swimm, Entelligence have head starts. [PIVOT_PLAN]
6. Standalone visualization product -- Madge, Emerge, NX Graph, CodeCharta, CodeSee. Don't build a full interactive graph explorer. [NEXT_STEPS]

---

## 3. Product Evaluation Results (4 Real Repos)

> Evaluated February 26, 2026 against Hono (TS, 392 files, 2324 symbols), Express (JS, 146 files, 227 symbols), Flask (Python, 92 files, 1940 symbols), Bubbletea (Go, 152 files, 1676 symbols). [PRODUCT_EVALUATION]

### Cross-Language Relation Detection Results

| Repo | Language | Relations Detected | Symbols | Score | Meaningful? | Source |
|------|----------|-------------------|---------|-------|------------|--------|
| Hono | TypeScript | 2,188 | 2,324 | 59/100 | Yes -- deep analysis | PRODUCT_EVALUATION |
| Express | JavaScript | 118 | 227 | 42/100 | Partially -- no `require()` support | PRODUCT_EVALUATION |
| Flask | Python | 162 | 1,940 | 83/100 | No -- mostly blind to coupling | PRODUCT_EVALUATION |
| Bubbletea | Go | 0 | 1,676 | 93/100 | No -- completely blind | PRODUCT_EVALUATION |

### Product-by-Product Evaluation

#### `aide scan` -- Health Score

- **Value Rating**: Medium [PRODUCT_EVALUATION]
- **Hono (TS)**: Score 59/100 is plausible. 2,188 relations, 35 circular dep cycles. Breakdown: coupling 25/30 (fine), circular deps 2/20 (killing score). Actionable information. [PRODUCT_EVALUATION]
- **Flask (Python)**: Score 83/100 is MISLEADING. Only 162 relations for 1,940 symbols. High score because ctags can't detect Python imports deeply. False confidence. [PRODUCT_EVALUATION]
- **Bubbletea (Go)**: Score 93/100 is BROKEN. Zero relations. 100% cohesion everywhere because no cross-module deps visible. False positive. [PRODUCT_EVALUATION]
- **Missing**: A "confidence" indicator. If relations/symbols < 0.05, score should say "LOW CONFIDENCE." [PRODUCT_EVALUATION]
- **Hono breakdown**: Module Cohesion 17/30, Low Coupling 25/30, No Circular Deps 2/20, Module Balance 8/10, Test Coverage 7/10. Modules: jsx (640 symbols, 77% cohesion), (root) (414, 56%), utils (317, 79%), middleware (208, 28% -- low), helper (196, 37% -- low), client (194, 58%), adapter (168, 43%). 35 circular dependency cycles. [PRODUCT_EVALUATION]

#### `aide rules` -- Architecture as Code

- **Value Rating**: Low [PRODUCT_EVALUATION]
- Rules are purely descriptive, not prescriptive. [PRODUCT_EVALUATION]
- Example: middleware allowed to import from 7 modules because it currently does. Bad architecture gets codified. [PRODUCT_EVALUATION]
- A new dependency to an unlisted module triggers violation (good), but more coupling between already-connected modules does not (bad). [PRODUCT_EVALUATION]
- Module descriptions are stats ("640 symbols, cohesion: 77%"), not purpose-oriented. [PRODUCT_EVALUATION]
- Needed: intelligent tightening (skip low-count relations), detect layering patterns, add `deny` rules, add comments telling users to edit. [PRODUCT_EVALUATION, NEXT_STEPS]

#### `aide check` -- Architecture Enforcement

- **Value Rating**: Medium-High -- best product [PRODUCT_EVALUATION]
- Finds real violations with specific file names. [PRODUCT_EVALUATION]
- Coupling warnings name exact top-contributing files. [PRODUCT_EVALUATION]
- "Weakest link" for circular deps tells which edge has fewest relations (easiest to break). [PRODUCT_EVALUATION]
- Incremental mode (`--changed`, `--since`) filters to affected modules only. [PRODUCT_EVALUATION]
- **Problems**: 35 circular dep errors is too noisy. Fix suggestions are templated, not contextual. No line numbers (violation `line` field exists but never populated). Doesn't show which specific import statements create cycles. [PRODUCT_EVALUATION]
- **AIDE vs ESLint**: AIDE differentiates on module-level architectural view, coupling quantification, weakest-link analysis, git-aware incremental checking. ESLint better for exact import/line-level precision. [PRODUCT_EVALUATION]

#### `aide mcp` -- AI Agent Layer

- **Value Rating**: Unknown (never tested with real AI agent) [PRODUCT_EVALUATION]
- 6 tools: check_compliance, find_similar, get_architecture, scan_health, get_module_info, suggest_fix [PRODUCT_EVALUATION]
- `check_compliance` `files` parameter is a NO-OP BUG -- ignores the parameter, checks whole project. [PRODUCT_EVALUATION, NEXT_STEPS]
- `find_similar` does SUBSTRING MATCHING, not semantic search. Embeddings table exists and has data but MCP handler doesn't use it. [PRODUCT_EVALUATION, NEXT_STEPS]
- `get_architecture` is the best tool -- full project context. [PRODUCT_EVALUATION]
- `scan_health` is redundant subset of `get_architecture`. [PRODUCT_EVALUATION]
- Protocol works: JSON-RPC 2.0, stdio, initializes correctly, responds to `tools/list`. Server info: aide-architecture v0.3.0. [PRODUCT_EVALUATION]
- Tool quality: 4/10. [PRODUCT_EVALUATION]
- **Missing tools**: check_file/check_diff, get_imports_for_file, find_where_used, get_conventions. [PRODUCT_EVALUATION]

#### `aide map` -- Dependency Visualization

- **Value Rating**: Medium [PRODUCT_EVALUATION]
- Mermaid output is genuinely useful -- paste into README/PR. Color coding (green/yellow/red by cohesion) intuitive. Arrow thickness by relation count. [PRODUCT_EVALUATION]
- On Hono (13 modules): readable, shows hot spots. On smaller projects: dependency matrix is clean. [PRODUCT_EVALUATION]
- Missing: interactive version. Static Mermaid/ASCII useful for docs. Web-based drill-down would be the real product. [PRODUCT_EVALUATION]
- Shows: module names, symbol counts, cohesion percentages, weighted edges between modules. [PRODUCT_EVALUATION]

#### `aide onboard` -- Architecture Guide

- **Value Rating**: Low [PRODUCT_EVALUATION]
- "This is a data dump, not an architecture guide." [PRODUCT_EVALUATION]
- Lists modules with metrics and key symbols. Technically accurate. [PRODUCT_EVALUATION]
- Missing: narrative ("start by looking at src/hono.ts"), pattern descriptions, "how to navigate" guidance. [PRODUCT_EVALUATION]
- Key sections mentioned in source code comments but NEVER GENERATED: "Key Entry Points" and "Architecture Patterns." [PRODUCT_EVALUATION]
- Structurally identical to `aide stats -v` but longer. [PRODUCT_EVALUATION]

#### `aide stats` -- Quick Overview

- **Value Rating**: Supporting. Only valuable if core (scan/check) is valuable. [PRODUCT_EVALUATION]

#### `aide trend` -- Health Tracking

- **Value Rating**: Supporting. Requires `--record` to save data points. No data in demos (fresh repos). Sparkline chart nice for long-running projects. [PRODUCT_EVALUATION]

#### `aide diff` -- Baseline Comparison

- **Value Rating**: Supporting. Useful for CI ("did this PR worsen architecture?"). No demo possible without saved baseline. [PRODUCT_EVALUATION]

#### `aide export` -- Stakeholder Reports

- **Value Rating**: Supporting. Compiles other products into stakeholder-ready markdown with Mermaid graphs, health breakdown, violations. Just packaging. [PRODUCT_EVALUATION]

### Cross-Cutting Evaluation Issues

#### Circular Deps: AIDE vs Existing Tools

- `eslint-plugin-import/no-cycle`, `madge`, and `dependency-cruiser` all detect circular deps at file level. AIDE detects at module level. [PRODUCT_EVALUATION]
- AIDE adds: module-level grouping and weakest-link analysis. [PRODUCT_EVALUATION]
- AIDE missing: specific import statements. ESLint says "line 5: circular import." AIDE says "these two modules are circular" without pointing to exact imports. [PRODUCT_EVALUATION]
- Net: AIDE is a COMPLEMENT to ESLint, not replacement. Value is architectural view, not per-file precision. [PRODUCT_EVALUATION]

#### Rules Continue Bad Practices Problem

- Auto-generated rules from bad architecture just codify bad architecture. [PRODUCT_EVALUATION]
- Intended workflow (not communicated to user): auto-generate -> human edits to set INTENDED architecture -> machine enforces. Tool never tells users to edit. [PRODUCT_EVALUATION]

### Overall Evaluation Verdict

- **One product delivers clear value**: `aide check` in CI for TypeScript projects. [PRODUCT_EVALUATION]
- **Two products deliver moderate value**: `aide scan` (breakdown is useful), `aide map` (visualization is useful). [PRODUCT_EVALUATION]
- **Everything else**: broken (MCP files param), misleading (non-TS scores), data dump (onboard), or self-defeating (rules codify bad practices). [PRODUCT_EVALUATION]

---

## 4. Technical Capabilities (AIDE v0.3.0)

### Architecture Overview

- AIDE: Architecture Intelligence Platform providing automated architecture analysis, enforcement, visualization. [IMPLEMENTATION_REPORT]
- Indexes codebases into knowledge graph, detects architecture patterns, enforces rules deterministically. [IMPLEMENTATION_REPORT]
- SQLite-backed knowledge graph (better-sqlite3, WAL mode). [IMPLEMENTATION_REPORT]
- Tree-sitter WASM for code analysis (deep: TS/JS/TSX/JSX only). [IMPLEMENTATION_REPORT]
- Universal Ctags for broad analysis: Python, Go, Rust, Java, Ruby, C/C++, C#, Swift, Kotlin, Scala, PHP, Lua, Dart, Shell, Elixir, Haskell, and 150+ more. [IMPLEMENTATION_REPORT]
- Commander.js CLI, Vitest for tests. [IMPLEMENTATION_REPORT]
- Build: `tsc` -> `dist/`, dev: `npm run dev -- [args]`. [IMPLEMENTATION_REPORT]
- DB location: `~/.aide/projects/<hash>/brain.db`. [IMPLEMENTATION_REPORT]

### CLI Commands (17 total)

**Core**: aide init, aide scan, aide check (with --changed, --since, --fail-below, --report-only), aide stats (-v). [IMPLEMENTATION_REPORT]

**Architecture**: aide rules init, aide rules show, aide map, aide onboard, aide diff (--save, --name), aide trend (--record), aide export. [IMPLEMENTATION_REPORT]

**Integration**: aide mcp, aide hook install, aide hook uninstall. [IMPLEMENTATION_REPORT]

**AI Assistant (pre-existing)**: aide ask, aide (REPL), aide web. [IMPLEMENTATION_REPORT]

### MCP Server (5 tools via JSON-RPC 2.0)

- check_compliance -- validate code against rules (files param is broken, see evaluation)
- find_similar -- search for similar code (substring matching, not semantic, see evaluation)
- get_architecture -- full project overview
- scan_health -- health score
- get_module_info -- detailed module info
[IMPLEMENTATION_REPORT]

### Health Scoring (0-100, 5 categories)

- Module Cohesion (0-30): weighted by module size [IMPLEMENTATION_REPORT]
- Low Coupling (0-30): soft penalty curve (40% external = full marks) [IMPLEMENTATION_REPORT]
- No Circular Deps (0-20): based on ratio of affected modules [IMPLEMENTATION_REPORT]
- Module Balance (0-10): penalizes only extreme outliers [IMPLEMENTATION_REPORT]
- Test Coverage (0-10): base credit + detected tests bonus [IMPLEMENTATION_REPORT]

### Multi-Language Support

- **Deep analysis (tree-sitter)**: TypeScript, JavaScript, TSX, JSX [IMPLEMENTATION_REPORT]
- **Broad analysis (Universal Ctags)**: 150+ languages [IMPLEMENTATION_REPORT]
- **Multi-language import resolution**: Python module paths, Go package paths, Java class paths [IMPLEMENTATION_REPORT]

### Tree-sitter Language Status (pre-pivot baseline)

| Language | WASM Available | Query File (tags.scm) | Relation Inference | Source |
|----------|---------------|----------------------|-------------------|--------|
| TypeScript | Yes | Yes (vendored from nvim-treesitter) | Working (post-Phase 0 fix) | PIVOT_PLAN |
| JavaScript | Yes | Yes (vendored) | Working (post-Phase 0 fix) | PIVOT_PLAN |
| TSX/JSX | Yes (uses TS/JS) | Uses parent | Working | PIVOT_PLAN |
| Python | Yes | Yes (vendored) | Not implemented (ctags fallback) | PIVOT_PLAN |
| Go | Yes | No (heuristic fallback) | Not implemented (ctags fallback) | PIVOT_PLAN |
| Rust | Yes | No (heuristic fallback) | Not implemented | PIVOT_PLAN |
| Java | Yes | No (heuristic fallback) | Not implemented | PIVOT_PLAN |
| Ruby | Yes | No (heuristic fallback) | Not implemented | PIVOT_PLAN |
| C | Yes | No (heuristic fallback) | Not implemented | PIVOT_PLAN |
| C++ | Yes | No (heuristic fallback) | Not implemented | PIVOT_PLAN |

### Violation Detection

- Boundary violations: suggest updating allow list or restructuring [IMPLEMENTATION_REPORT]
- Circular dependencies: identify weakest link to break cycle [IMPLEMENTATION_REPORT]
- Coupling violations: suggest extracting interfaces/facades, show top files [IMPLEMENTATION_REPORT]
- Cohesion violations: suggest module decomposition [IMPLEMENTATION_REPORT]
- File-level evidence: shows specific files and symbols creating violations [IMPLEMENTATION_REPORT]
- **Missing**: line numbers (violation `line` field exists but never populated). [PRODUCT_EVALUATION, NEXT_STEPS]

### CI/CD Integration

- GitHub Actions workflow template (templates/github-actions-check.yml) [IMPLEMENTATION_REPORT]
- Git pre-commit hook (aide hook install) [IMPLEMENTATION_REPORT]
- --fail-below threshold for CI gates [IMPLEMENTATION_REPORT]
- --changed / --since for incremental checks [IMPLEMENTATION_REPORT]
- JSON output for all commands [IMPLEMENTATION_REPORT]

### Database Schema (8 tables, 24 indexes)

| Table | Purpose | Key Fields | Source |
|-------|---------|-----------|--------|
| files | Source files | id, path, language, content_hash, summary, indexed_at | PIVOT_PLAN |
| symbols | Functions/classes/interfaces/types/variables | id, file_id, name, kind, start_line, end_line, signature, doc_comment | PIVOT_PLAN |
| content_blocks | Code snippets, imports, comments, chunks | id, file_id, kind, content, symbol_id, is_chunk, chunk_index, full_block_id, signature, metadata | PIVOT_PLAN |
| relations | Directed edges between symbols | id, source_symbol_id, target_symbol_id, kind. UNIQUE on (source, target, kind) | PIVOT_PLAN |
| notes | Annotations on symbols/files | id, symbol_id, file_id, content, source ('system'/'model'/'user'), created_at | PIVOT_PLAN |
| tags | Key-value pairs on symbols | id, symbol_id, name, value. UNIQUE on (symbol_id, name) | PIVOT_PLAN |
| embeddings | Vector embeddings for semantic search | id, file_path, content, start_line, end_line, content_hash, embedding (BLOB), model, created_at | PIVOT_PLAN |
| conversation_embeddings | Session-level conversation embeddings | id, session_id, exchange_index, role, embedding (BLOB) | PIVOT_PLAN |

FTS5: content_blocks_fts virtual table with auto-sync triggers. [PIVOT_PLAN]

### Type Definitions

```
SymbolKind: 'function' | 'class' | 'interface' | 'type' | 'variable' | 'module' | 'method' | 'property'
RelationKind: 'CALLS' | 'IMPORTS' | 'TESTS' | 'CONFIGURES' | 'EXTENDS' | 'IMPLEMENTS'
BlockKind: 'code' | 'import' | 'export' | 'comment' | 'docstring' | 'todo' | 'markdown' | 'prose' | 'config' | 'data' | 'cell' | 'output'
```
[PIVOT_PLAN]

### Files Created/Modified (30+)

Key new files: importResolver.ts, graphAnalysis.ts, ctagsAnalyzer.ts, rules/types.ts, rules/rulesParser.ts, rules/rulesGenerator.ts, rules/rulesChecker.ts, mcp/server.ts, and CLI commands for scan, rules, check, map, onboard, hook, diff, stats, trend, export. [IMPLEMENTATION_REPORT]

Modified: brain/types.ts, analysis/treeSitterAnalyzer.ts, project/indexer.ts, cli/index.ts, package.json. [IMPLEMENTATION_REPORT]

### Test Results

- 4 test files, 106 tests passing, ~500ms duration. [IMPLEMENTATION_REPORT]
- 18 relation extraction tests, 14 import resolution tests. [IMPLEMENTATION_REPORT]

### AIDE Self-Assessment (v0.3.0 scanning itself)

- Files: 90, Symbols: 715, Relations: 1095, Modules: 14, Health: 40/100. [IMPLEMENTATION_REPORT]
- Languages: TypeScript(77), Markdown(7), JSON(5), YAML(1). [IMPLEMENTATION_REPORT]
- Circular deps: 10 cycles. [IMPLEMENTATION_REPORT]
- Breakdown: Module Cohesion 13/30, Low Coupling 10/30, No Circular Deps 2/20, Module Balance 10/10, Test Coverage 5/10. [IMPLEMENTATION_REPORT]

### Known Limitations

1. CALLS matching is fuzzy: resolves by name only, causing false positives for common names. [IMPLEMENTATION_REPORT]
2. ctags requires system install: `brew install universal-ctags` (not pure npm). [IMPLEMENTATION_REPORT]
3. Module detection is directory-based: first dir under src/ as module name. [IMPLEMENTATION_REPORT]
4. No CommonJS support: require() calls not detected. [IMPLEMENTATION_REPORT]
5. No dynamic imports: import() expressions not handled. [IMPLEMENTATION_REPORT]
6. Single-repo only: no monorepo/multi-repo support. [IMPLEMENTATION_REPORT]

### Pre-Pivot Technical State

- 55 TypeScript source files, ~16.6K total lines, package.json v0.2.0. [PIVOT_PLAN]
- Dependencies: better-sqlite3, tree-sitter-* (11 languages), ts-morph, express, ws, commander, chokidar, chalk. [PIVOT_PLAN]
- Existing CLI commands (pre-pivot): init, reindex, watch, ask, web, config, default REPL. [PIVOT_PLAN]
- Orchestration pipeline: Reasoning Model -> ToolExecutor (15+ tools) -> Context Model -> loop max 5 iterations -> final answer. Config: maxToolCallsPerBatch=10, enableContextStripping=true, maxReasoningLoops=2. [PIVOT_PLAN]
- Config: ~/.aide/projects/{SHA1(rootPath).slice(0,12)}/config.json. Default models: reasoning=gpt-5.2, context=gpt-5.2, embedding=mxbai-embed-large. Token budget: 16K global, 128K max model input, 4K reserved for response. [PIVOT_PLAN]
- Sessions: max 10 focus symbols, 5 focus files (LRU), 50 chat history messages. [PIVOT_PLAN]
- Web server: Express + WebSocket, default port 3000. [PIVOT_PLAN]

### Critical Blocker (Phase 0 -- Fixed)

- `inferRelations()` in treeSitterAnalyzer.ts returned `[]` always. Relations table was always empty. [PIVOT_PLAN]
- Impact: getOutgoingRelations(), getIncomingRelations(), neighbors(), findRelations() all returned empty. toolBasedRetrieval.ts lines 1432, 1463 also hardcoded `relations: []`. [PIVOT_PLAN]
- Fix required: IMPORTS detection (parse import/require, resolve to target file), CALLS detection (parse function calls, match against known symbols), EXTENDS/IMPLEMENTS detection (parse heritage clauses). [PIVOT_PLAN]
- Status: Fixed in Phase 0. Relations now populated (792 on AIDE codebase, 2188 on Hono). [PRODUCT_EVALUATION]

---

## 5. Feature Ideas Evaluated

### Product 1: `aide scan` -- Architecture Health Score

- **Classification**: Essential [PIVOT_PLAN, PRODUCT_CHANGES_SUMMARY]
- **Concept**: "Lighthouse for codebases" -- scan any codebase, auto-detect patterns, produce 0-100 health score, output .aide/rules.yaml. [PIVOT_PLAN]
- **Competitive validation**: No equivalent tool exists. CodeScene is file-level/observational. Teamscale requires manual modeling. Lighthouse is web-only. Auto-detect -> score -> generate-rules pipeline is genuinely unique. [PRODUCT_CHANGES_SUMMARY]
- **Refinements after research**: Lighthouse-style percentile scoring. 4 core metrics (Module Coupling, Dependency Health, Cycle Risk, Pattern Consistency). Show trends. --json output for CI. [PRODUCT_CHANGES_SUMMARY]
- **Current state**: Built and working for TS. Misleading for non-TS. [PRODUCT_EVALUATION]
- **Needed**: Confidence indicator for non-TS languages. [PRODUCT_EVALUATION, NEXT_STEPS]
- **Effort for confidence fix**: Small (1-2 days). [NEXT_STEPS]

### Product 2: `aide rules` -- Architecture as Code

- **Classification**: Essential [PIVOT_PLAN, PRODUCT_CHANGES_SUMMARY]
- **Concept**: "ESLint for architecture, but auto-detected." Machine-readable YAML rules. Auto-detect -> developer refines -> machine enforces. [PIVOT_PLAN]
- **Format**: The "Dockerfile of architecture" -- positioned as an open standard other tools can read. [PRODUCT_CHANGES_SUMMARY]
- **Three rule types**: boundaries (module imports), patterns (code conventions), constraints (metric thresholds). [PRODUCT_CHANGES_SUMMARY]
- **Added features**: SARIF output for VS Code/IntelliJ inline violations. Decision records (optional `reason:` field). Open spec positioning. [PRODUCT_CHANGES_SUMMARY]
- **Current state**: Built but rules are purely descriptive (codify bad architecture). [PRODUCT_EVALUATION]
- **Needed**: Intelligent tightening (skip low-count relations), detect layering patterns, add deny rules, purpose-oriented descriptions, comments telling users to edit. Threshold: only add to `allow` if relation count >= 5. [NEXT_STEPS]
- **Effort**: Medium (3-5 days). [NEXT_STEPS]

### Product 3: `aide check` -- Architecture Enforcement

- **Classification**: Essential [PIVOT_PLAN, PRODUCT_CHANGES_SUMMARY]
- **Concept**: CI gate for architecture health. `--fail-below` for threshold. [PIVOT_PLAN]
- **Three enforcement modes**: --fail-on error (strict), --report-only (warnings), --auto-fix (suggest fixes). [PRODUCT_CHANGES_SUMMARY]
- **Added features**: SARIF output for GitHub Advanced Security / GitLab SAST. Native GitHub Action: aide-check@v1. Score delta reporting. Diff context in violations. [PRODUCT_CHANGES_SUMMARY]
- **Current state**: Best product. Finds real violations, names files. Incremental mode works. [PRODUCT_EVALUATION]
- **Needed**: Group circular deps into root cycles (show "3 root cycles causing 35 total paths"). Show specific import statements. Severity tiers (direct A-B-A = error, transitive = warning, long chains = info). Contextual suggestions naming specific files/imports/line numbers. Populate violation `line` field. [NEXT_STEPS]
- **Effort for line numbers**: Small (1-2 days). For contextual suggestions: Medium-High (5-7 days). For cycle grouping: Medium (3-5 days). [NEXT_STEPS]

### Product 4: `aide mcp` -- Architecture-Aware AI Agent Layer

- **Classification**: Changed from Essential to Premium (wrapper, not core) [PRODUCT_CHANGES_SUMMARY]
- **Concept**: MCP server exposing architecture tools to any AI agent. Agents call tools and get deterministic PASS/FAIL, not suggestions. [PIVOT_PLAN]
- **Three tools defined**: check_architecture (pass/fail), find_similar (duplicate detection), get_rules (what's allowed here). [PRODUCT_CHANGES_SUMMARY]
- **Market**: No architecture-specific MCP exists. Open field. [PIVOT_PLAN]
- **Monetization**: Freemium. Consider outcome-based pricing (charge when agent follows a rule that prevents violation). [PRODUCT_CHANGES_SUMMARY]
- **Current state**: 6 tools over JSON-RPC 2.0. Protocol works. Quality 4/10. [PRODUCT_EVALUATION]
- **Critical bugs**: `files` parameter is a no-op (fix effort: 2-3 days). `find_similar` does substring not semantic search (fix effort: 2-3 days, infrastructure exists in semanticSearch.ts). [NEXT_STEPS]
- **Why different from competitors**: vs Serena (LSP navigation) -- AIDE does rule enforcement. vs CodeScene MCP (file metrics) -- AIDE does architecture rules. vs Potpie (graph context) -- AIDE gives RULES not just context. vs Agent RuleZ (CLI policy) -- AIDE understands code architecture. vs .cursorrules/CLAUDE.md -- AIDE is CALLABLE, not just text. [PIVOT_PLAN]

### Product 5: `aide review` -- PR Architecture Gate

- **Classification**: Changed from "primary monetization" to "valuable but watch redundancy" [PRODUCT_CHANGES_SUMMARY]
- **Concept**: GitHub App that runs aide check on PRs, shows violations as comments, blocks merges. [PIVOT_PLAN]
- **Revenue model**: $30-50/repo/mo (Team tier). Enterprise: multi-repo, SSO, custom rules, compliance. [PIVOT_PLAN]
- **Saturation warning**: PR review bot market is heavily saturated. [PRODUCT_CHANGES_SUMMARY]
- **Scope narrowed**: DON'T compete on code review quality. ONLY do architecture enforcement in PRs. [PRODUCT_CHANGES_SUMMARY]
- **Redundancy acknowledged**: If aide check runs in CI, the GitHub App is "UI sugar" -- making violations visible in PR conversation vs buried in CI logs. [PRODUCT_CHANGES_SUMMARY]

### Product 6: `aide map` -- Dependency Visualization

- **Classification**: Changed from expansion product to heavily de-scoped [PRODUCT_CHANGES_SUMMARY]
- **Concept**: Dependency graph visualization with rule violation overlay. [PIVOT_PLAN]
- **Market**: $2.14B dependency mapping market, but heavily saturated with tools. [PIVOT_PLAN]
- **De-scoped**: Don't build standalone visualization tool. Overlay violations on graph (red=violation, green=allowed, blue=pattern). One command: `aide map --open` -> HTML file. [PRODUCT_CHANGES_SUMMARY]
- **Current state**: Mermaid output genuinely useful. ASCII format clean. Renders in GitHub. [PRODUCT_EVALUATION]

### Product 7: `aide onboard` -- Auto-Generated Architecture Guide

- **Classification**: Valuable, build after core. Slightly upgraded -- confirmed underserved gap. [PRODUCT_CHANGES_SUMMARY]
- **Concept**: Auto-generate architecture docs from graph + rules. Not manual -- always current. [PIVOT_PLAN]
- **Identified as underserved**: Swimm, DocuWriter, Doxygen, DAUT exist but none do architecture-specific onboarding docs. [PRODUCT_CHANGES_SUMMARY]
- **Structured output**: Module map -> Rules & boundaries -> Patterns -> Conventions -> Decision history. [PRODUCT_CHANGES_SUMMARY]
- **Auto-update**: Re-generates when rules/patterns change. [PRODUCT_CHANGES_SUMMARY]
- **LLM integration**: Use Claude/GPT for narrative, AIDE provides structural facts. [PRODUCT_CHANGES_SUMMARY]
- **Current state**: Data dump, not an architecture guide. Missing narrative, entry points, patterns. "Key Entry Points" and "Architecture Patterns" mentioned in source code comments but never generated. [PRODUCT_EVALUATION]
- **Needed**: Identify main exports/CLI entry points/API routes via export analysis and high fan-in symbols. Detect and describe patterns. Add narrative guidance. Use highest fan-in as "start here." [NEXT_STEPS]
- **Effort**: Medium (3-5 days). [NEXT_STEPS]

### Product 8: `aide suggest` -- Architecture Improvement Recommendations

- **Concept**: AI-powered architecture coaching. Uses graph + rules to suggest refactoring targets, coupling reduction, pattern inconsistency fixes. [PIVOT_PLAN]
- **Bridges**: enforcement (reactive) with coaching (proactive). [PIVOT_PLAN]
- **Could leverage**: existing orchestration loop (reasoning model + graph tools). [PIVOT_PLAN]
- **Phase**: 3+ (expansion). [PIVOT_PLAN]
- **Addressed user's stated interest** in architecture suggestions/planning, not just enforcement. [PIVOT_PLAN]

### NEW: `aide style` + `aide generate-config` -- STRONGEST New Opportunity

- **Classification**: Priority 1 new capability [NEXT_STEPS]
- **Concept**: Analyze codebase graph to extract naming conventions, structural patterns, abstraction preferences, error handling style, testing patterns. Output `.aide/style.yaml`. Then generate CLAUDE.md, .cursorrules, copilot-instructions.md, AGENTS.md from rules.yaml + style.yaml. [NEXT_STEPS, PIVOT_PLAN]
- **Why #1 priority**: [NEXT_STEPS]
  - Differentiation: ZERO competitors generate AI agent config files from actual codebase graph analysis. HowYouCode generates a profile card (not actionable). ClaudeMDEditor manages files (doesn't generate). Claude's /init scans shallowly.
  - Demand: Config file fragmentation is real and growing. Every AI tool has a different format but content is the same. Developers maintain 3-5 files with duplicate info.
  - Feasibility: HIGH. Knowledge graph already has raw data (symbol names, IMPORTS graph, module structure, test files). Analysis + templating, not new infra.
- **Effort**: 2-3 weeks. [NEXT_STEPS]
- **The "config file fragmentation" problem**: .cursorrules, CLAUDE.md, AGENTS.md, copilot-instructions.md, .windsurf/rules -- same content, 5+ files. [PIVOT_PLAN]

### NEW: Quantitative SOLID Rules from Graph -- Priority 2

- **Classification**: Strong differentiator [NEXT_STEPS]
- **What**: Graph-based SOLID principle detection as rule categories: [NEXT_STEPS, PIVOT_PLAN]
  - Single Responsibility: measure symbol fan-out via CALLS graph. Flag classes/modules calling 5+ unrelated modules.
  - Dependency Inversion: detect high-level modules importing low-level implementation directly via IMPORTS graph.
  - Interface Segregation: detect large interfaces where implementers use only a subset via IMPLEMENTS + CALLS.
  - Open/Closed: detect modification frequency of core abstractions (with git integration).
- **Differentiation**: Nobody does deterministic SOLID from a knowledge graph. Designite = C#/Java only. SonarQube = universal rules, not team-configurable. LLMs = probabilistic. [NEXT_STEPS]
- **Feasibility**: HIGH for SRP + DIP (direct graph queries). MEDIUM for ISP (needs IMPLEMENTS data). LOW for Liskov Substitution (behavioral understanding needed). [NEXT_STEPS]
- **Effort**: 2 weeks for SRP + DIP. Another week for ISP. [NEXT_STEPS]
- **Hybrid approach**: AIDE provides structural facts (graph), LLM provides qualitative interpretation against configured philosophy. Philosophy configured in rules.yaml. [PIVOT_PLAN]

### NEW: Framework Presets -- Priority 3

- **Classification**: Useful extension [NEXT_STEPS]
- **What**: Auto-detect framework (React, Vue, NestJS, Express) from package.json and load framework-specific rule presets. Focus on cross-file rules linters cannot catch. [NEXT_STEPS]
- **Differentiation**: MEDIUM. ESLint handles single-file. AIDE adds value for cross-file architectural rules. [NEXT_STEPS]
- **Demand**: HIGH. User's core example (monolithic modal) is React-specific. [NEXT_STEPS]
- **Example rules**: max_props, max_conditional_branches, prefer_composition, require_existing_check, hooks max_domain_imports, state_management pattern enforcement. [PIVOT_PLAN]
- **Effort**: 1-2 weeks per framework. [NEXT_STEPS]
- **Key insight**: AIDE should NOT reimplement single-file lint rules. Only rules requiring the knowledge graph. If ESLint can catch it, AIDE should not try. [NEXT_STEPS]

### NEW: Proactive Duplicate Prevention -- Priority 4

- **Concept**: In aide check, flag new code with >80% semantic similarity to existing code. [NEXT_STEPS]
- **Differentiation**: MEDIUM-HIGH. CodeQA does cross-repo search but doesn't block PRs. Nobody gates on semantic duplication. [NEXT_STEPS]
- **Demand**: HIGH. AI agents create 8x more duplicated code. [NEXT_STEPS]
- **Dependency**: Requires semantic search to actually work (fix find_similar first). [NEXT_STEPS]
- **Effort**: 1 week after semantic search is fixed. [NEXT_STEPS]

### NEW: Architecture Decision Memory -- Priority 5

- **Concept**: Capture structured decisions linked to knowledge graph when AI agents discuss architecture with developers. [NEXT_STEPS, PIVOT_PLAN]
- **Differentiation**: MEDIUM. "Linked to knowledge graph" is unique, but memory MCP space is crowded (8+ active projects). [NEXT_STEPS]
- **Demand**: MEDIUM. High switching cost/moat value, but user-facing demand lower than enforcement. [NEXT_STEPS]
- **Verdict**: Build as module within aide mcp, NOT standalone product. [PIVOT_PLAN]
- **Effort**: 1-2 weeks. [NEXT_STEPS]

### Future Phase Products (Not Yet Built)

- **Decision memory + learning from corrections** (Phase 4): ADR tracking, rule history with "why" fields. System remembers when developers override rules and adapts. [PRODUCT_CHANGES_SUMMARY]
- **Cross-company benchmarking** (Phase 5): "Your score vs industry median." Network effect play. [PRODUCT_CHANGES_SUMMARY]
- **Compliance mappings** (Phase 5): SOC2/HIPAA/ISO rule mappings for regulatory lock-in. [PRODUCT_CHANGES_SUMMARY]
- **Per-developer style profiles** (Phase 4): Individual style analysis from git blame. "Developer A prefers composition, Developer B prefers inheritance." [PIVOT_PLAN]
- **Team dashboard** (Phase 4): Which developers/agents generate the most violations. Where alignment is weakest. [PIVOT_PLAN]
- **Qualitative LLM-based rules** (Phase 3): Philosophy-based evaluation ("does this follow Clean Architecture?"). Optional, configurable. Risk: LLMs overrate complex principles. [PIVOT_PLAN, NEXT_STEPS]
- **Performance optimization** for repos with 10K+ symbols. [IMPLEMENTATION_REPORT]
- **Tree-sitter WASM parsers for Python/Go/Rust** (deeper analysis than ctags). [IMPLEMENTATION_REPORT]

### Ideas Explicitly Rejected

- **General-purpose AI memory server**: Market has 8+ competitors (Mem0, Pieces, SaveContext, etc.). Build architecture decision memory as small module, not standalone. [NEXT_STEPS]
- **AI code review bot**: Saturated (Copilot 1M+, CodeRabbit 2M+, Greptile $25M). aide review should be architecture-only, complementary. [NEXT_STEPS]
- **Single-file lint rules**: ESLint has 100+ React rules. Biome does it at 10x speed. AIDE's value is exclusively cross-file/cross-module/pattern-level. [NEXT_STEPS]
- **Standalone visualization product**: Market has Madge, Emerge, NX Graph, CodeCharta, CodeSee. At most overlay violations on existing graph. [NEXT_STEPS]
- **Qualitative LLM-based rules (not yet)**: LLMs overrate complex principles. Build deterministic graph-based SOLID checks first. LLM layer is Phase 3+ and optional. [NEXT_STEPS]
- **Competing on the original AIDE CLI plan** (general AI coding assistant -> agent orchestration): OpenCode (100K+ stars), GitHub Copilot Agent (GA), Warp Oz (launched Feb 2026) already occupy this space. Not viable. [PIVOT_PLAN]

---

## 6. Strategic Context

### Core Product Thesis

"You can get AI agents to make great architecture decisions on individual features 1:1. The problem is: how does this SCALE?" [PIVOT_PLAN]

Answer: `.aide/rules.yaml` as "Architecture as Code" -- auto-detected from graph, machine-enforced in CI, exposed via MCP to AI agents. [PIVOT_PLAN]

### The "Works With My Agent" Problem

- Docker solved "works on my machine" by creating a standard format (Dockerfile).
- In 2026, the new problem is "works with my agent." AI agents ignore architecture in markdown files.
- .cursorrules tells AI "try to follow these" -- model drifts toward task completion. No enforcement.
- CLAUDE.md loads at session start -- users beg for enforcement (GitHub issue #18660, unaddressed).
- GitHub Copilot structurally cannot block code.
- AIDE's answer: .aide/rules.yaml as cross-language, git-versionable, CI-enforceable standard. Infrastructure, not suggestions.
[PIVOT_PLAN]

### Why Big Players Structurally Cannot Do This

1. Enforcement is friction; their business model is velocity (sell tokens/subscriptions/platform usage). [PIVOT_PLAN]
2. Architecture is team-specific; they build for the general case. [PIVOT_PLAN]
3. AI tools are stateless per session; enforcement requires persistent rules surviving across sessions/devs/agents. [PIVOT_PLAN]
4. Evidence: Cursor 2026 roadmap mentions enterprise features but zero architecture enforcement. Anthropic CLAUDE.md has no enforcement roadmap. Copilot Code Review checks quality/security, not architecture. [PIVOT_PLAN]

### Four Layers of Defensibility

| Layer | What | Moat Type | Timeline | Source |
|-------|------|-----------|----------|--------|
| 1. Format | .aide/rules.yaml as standard | Standard moat | Month 1-3 | PIVOT_PLAN |
| 2. Pipeline | aide check in CI/CD | Infrastructure lock-in | Month 2-4 | PIVOT_PLAN |
| 3. Memory | ADRs + rule history with "why" | Switching cost | Month 4-8 | PIVOT_PLAN |
| 4. Intelligence | Learning from corrections + cross-codebase benchmarks | Data moat + network effects | Month 6-12+ | PIVOT_PLAN |

### What Will NOT Create a Moat

- CLI tools alone (copied in weeks). MCP server alone (Cursor/Claude will build own). "Better graph technology." Open source without data/enterprise layer. "Better AI" claims. UI/UX excellence alone. [PIVOT_PLAN]

### Risk Assessment

| Risk | Likelihood | Mitigation | Source |
|------|-----------|------------|--------|
| Cursor adds architecture enforcement | Medium (2-3 years, IDE-only) | AIDE works in CI/CD -- complementary | PIVOT_PLAN |
| SonarQube adds graph-based architecture | Medium | AIDE is lighter, open source, AI-native | PIVOT_PLAN |
| Anthropic makes CLAUDE.md enforceable | Low (structural conflict) | AIDE is tool-agnostic via MCP | PIVOT_PLAN |
| Someone else creates rule format standard | Medium | Move fast, get adoption, make it open | PIVOT_PLAN |
| Market doesn't care about architecture enforcement | Low (SonarQube = $242M/yr) | Start with consulting | PIVOT_PLAN |

### Revenue Projections

| Revenue Stream | Timeline | Price | Target | Source |
|---------------|----------|-------|--------|--------|
| Architecture audits | Immediate | $5K-20K/engagement | 2-4/month | PIVOT_PLAN |
| CLI (open source) | Month 2 | Free | 500+ users | PIVOT_PLAN |
| GitHub App / CI | Month 3 | $30-50/repo/mo | 10-50 repos | PIVOT_PLAN |
| Enterprise | Month 4+ | $500+/mo | 2-5 companies | PIVOT_PLAN |
| Modernization consulting | Month 4+ | $10K-50K/project | 1-2/month | PIVOT_PLAN |

### Launch Strategy ("Open Claw")

1. Scan 100 popular open-source repos. Generate architecture health scores. [PIVOT_PLAN]
2. Publish: "The State of Architecture Health in AI-Assisted Codebases 2026." [PIVOT_PLAN]
3. Post on HN/Reddit/Twitter with specific findings and scores. [PIVOT_PLAN]
4. Open source the CLI. [PIVOT_PLAN]
5. Offer free scans to companies (lead gen for consulting + paid tiers). [PIVOT_PLAN]
6. Hook: "What's your architecture health score? Run `npx aide-arch scan` and find out in 60 seconds." [PIVOT_PLAN]

### Updated hook (from NEXT_STEPS): "What is your architecture health score? Run `npx aide-arch scan` and find out in 60 seconds. Then run `aide style` to auto-generate your CLAUDE.md from your actual codebase." [NEXT_STEPS]

### Priority Changes Summary

| Product | Original Priority | New Priority | Change | Source |
|---------|------------------|-------------|--------|--------|
| aide scan | Phase 1 (Essential) | Phase 1a (Essential) | No change | PRODUCT_CHANGES_SUMMARY |
| aide rules | Phase 1 (Essential) | Phase 1a (Essential) | No change | PRODUCT_CHANGES_SUMMARY |
| aide check | Phase 1 (Essential) | Phase 1b (Essential) | No change | PRODUCT_CHANGES_SUMMARY |
| aide mcp | Phase 1b (Essential) | Phase 1c (Premium) | Downgraded -- wrapper not core | PRODUCT_CHANGES_SUMMARY |
| aide review | Phase 2 (Primary monetization) | Phase 2 (Valuable) | Softened -- saturated, redundant with check | PRODUCT_CHANGES_SUMMARY |
| aide map | Phase 3 (Expansion) | Phase 3b (De-scoped) | Downgraded -- saturated market | PRODUCT_CHANGES_SUMMARY |
| aide onboard | Phase 3 (Expansion) | Phase 3a (Valuable) | Slightly upgraded -- confirmed gap | PRODUCT_CHANGES_SUMMARY |
| Decision memory | Not in plan | Phase 4 | New -- moat layer | PRODUCT_CHANGES_SUMMARY |
| Learning from corrections | Not in plan | Phase 4 | New -- moat layer | PRODUCT_CHANGES_SUMMARY |
| Cross-company benchmarking | Not in plan | Phase 5 | New -- moat layer | PRODUCT_CHANGES_SUMMARY |
| Compliance mappings | Not in plan | Phase 5 | New -- moat layer | PRODUCT_CHANGES_SUMMARY |

### Evolution of Thinking

1. Started: "Can AIDE compete with OpenCode/GitHub/Warp?" -> No on original vision. [PIVOT_PLAN]
2. First pivot idea: "MCP code intelligence server" -> Rejected (too crowded). [PIVOT_PLAN]
3. Second pivot: "AI Architecture Guardian / PR review bot" -> Refined (review saturated, enforcement open). [PIVOT_PLAN]
4. Third pivot: "Architecture Health Score (Lighthouse for codebases)" -> Strong, validated by SonarSource $242M. [PIVOT_PLAN]
5. Fourth: "Migration Dependency Mapper" -> Also strong, $2.14B market. [PIVOT_PLAN]
6. Final convergence: User's pain point ("how does architecture scale beyond markdown?") -> .aide/rules.yaml as Architecture as Code. [PIVOT_PLAN]

### Open Questions (Preserved)

- Brand name? "AIDE" feels generic for new direction. [PIVOT_PLAN]
- Open source strategy: fully open, open core, or proprietary? [PIVOT_PLAN]
- Lead buyer: individual dev, tech lead, VP Eng, CTO? [PIVOT_PLAN]
- Preserve aide ask/REPL or deprecate? Repurpose as aide onboard/suggest? [PIVOT_PLAN]
- Consulting service connection to product -- separate brand? [PIVOT_PLAN]
- Go-to-market: HN post content, which repos to scan? [PIVOT_PLAN]
- Cost optimization domain: could aide scan report estimated cost of tech debt? [PIVOT_PLAN]
- aide suggest: use existing orchestration loop or simpler approach? [PIVOT_PLAN]
- Relations blocker: implement from scratch or use ts-morph? [PIVOT_PLAN]
- aide style: separate command or integrated into aide scan? [PIVOT_PLAN]
- Config file fragmentation: generate all formats or universal format + converters? [PIVOT_PLAN]
- SOLID quantitative rules: on by default or opt-in? [PIVOT_PLAN]
- Team dashboard pricing: per-seat, per-repo, or per-org? [PIVOT_PLAN]
- Architecture decision memory: automatic or manual? [PIVOT_PLAN]
- Packmind overlap: compete or integrate? [PIVOT_PLAN]

---

## 7. Source Links (Complete)

### Market Data Sources
- [AI Defect Risk +30%](https://www.prnewswire.com/news-releases/ai-coding-assistants-increase-defect-risk-by-30-in-unhealthy-code-new-peer-reviewed-research-finds-302672355.html)
- [8x Duplication](https://www.infoq.com/news/2025/11/ai-code-technical-debt/)
- [18-Month Wall / 4x Maintenance](https://www.pixelmojo.io/blogs/vibe-coding-technical-debt-crisis-2026-2027)
- [AI Tech Debt -- Stack Overflow](https://stackoverflow.blog/2026/01/23/ai-can-10x-developers-in-creating-tech-debt)
- [Dependency Mapping $2.14B Market](https://www.globalgrowthinsights.com/market-reports/application-dependency-mapping-tools-market-118759)
- [SonarSource $242M/yr](https://growjo.com/company/SonarSource)
- [AI Agent Governance (Microsoft)](https://www.microsoft.com/en-us/security/blog/2026/02/10/80-of-fortune-500-use-active-ai-agents-observability-governance-and-security-shape-the-new-frontier/)
- [Developer Onboarding 3-6 Months](https://www.growin.com/blog/developer-retention-costs-onboarding/)
- [20 Workdays Lost/Year](https://www.itpro.com/software/development/clunky-tech-is-costing-developers-20-working-days-a-year-these-are-the-leading-productivity-drains-impacting-teams)

### Research Papers
- [Codified Context (arxiv 2602.20478)](https://arxiv.org/html/2602.20478)
- [Agent READMEs Study (arxiv 2511.12884)](https://arxiv.org/html/2511.12884v1)
- [Context Engineering for Multi-Agent Systems (arxiv 2508.08322)](https://arxiv.org/html/2508.08322v1)
- [LLMs as Code Review Agents](https://link.springer.com/chapter/10.1007/978-3-032-09318-9_24)
- [Code Fingerprinting 95% Accuracy](https://www.cyberdefensemagazine.com/the-invisible-fingerprint-in-code/)
- [Code Style Evolution in OSS (arxiv 2601.09832)](https://arxiv.org/html/2601.09832)
- [Human AI Reliance (arxiv 2601.17055)](https://arxiv.org/abs/2601.17055)
- [AI Governance Debate (arxiv 2601.04175)](https://arxiv.org/abs/2601.04175)
- [AGENTS.md Runtime Reduction Study](https://gist.github.com/0xdevalias/f40bc5a6f84c4c5ad862e314894b2fa6)
- [Convention as Code](https://dev.to/monarchwadia/convention-as-code-enforcing-architecture-with-scripts-ci-and-ai-agents-hgd)
- [Martin Fowler -- Context Engineering](https://martinfowler.com/articles/exploring-gen-ai/context-engineering-coding-agents.html)

### Competitor / Tool Links
- [CodeScene](https://codescene.com/) | [CodeScene MCP](https://github.com/codescene-oss/codescene-mcp-server)
- [SonarQube](https://www.sonarsource.com/) | [SonarQube Quality Gates](https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/)
- [Greptile](https://www.greptile.com/) | [CodeRabbit](https://www.coderabbit.ai/) | [Graphite](https://graphite.dev/)
- [ArchUnit](https://www.archunit.org/) | [dependency-cruiser](https://github.com/sverweij/dependency-cruiser)
- [Serena MCP](https://github.com/oraios/serena) | [Potpie](https://github.com/potpie-ai/potpie)
- [vFunction](https://vfunction.com/) | [drift CLI](https://dev.to/eduardbar/drift-an-open-source-cli-that-detects-silent-technical-debt-in-ai-generated-typescript-code-4ll7)
- [Agent RuleZ](https://medium.com/@richardhightower/agent-rulez-a-deterministic-policy-engine-for-ai-coding-agents-9489e0561edf)
- [Qodo](https://www.qodo.ai/) | [Qodo Aware](https://www.qodo.ai/blog/introducing-qodo-aware-deep-codebase-intelligence-for-enterprise-development/)
- [Augment Code](https://augmentcode.com/)
- [OpenCode](https://github.com/opencode-ai/opencode) | [Warp Oz](https://www.warp.dev/blog/oz-orchestration-platform-cloud-agents)
- [GitHub Copilot Agent](https://docs.github.com/en/copilot/concepts/agents/coding-agent/about-coding-agent) | [Copilot Code Review](https://docs.github.com/en/copilot)
- [Madge](https://github.com/pahen/madge) | [Emerge](https://github.com/glato/emerge) | [NX Graph](https://nx.dev/docs/features/explore-graph) | [CodeCharta](https://github.com/MaibornWolff/codecharta) | [CodeSee](https://www.codesee.io/)
- [Swimm](https://swimm.io/) | [Entelligence AI](https://www.entelligence.ai/) | [CodeQA](https://www.codeqa.ai/)
- [Packmind](https://packmind.com/) | [Designite](https://www.designite-tools.com/) | [NDepend](https://www.ndepend.com/)
- [Teamscale](https://teamscale.com/) | [Checkov](https://github.com/bridgecrewio/checkov)
- [Lighthouse](https://developer.chrome.com/docs/lighthouse)
- [Mem0 / OpenMemory](https://mem0.ai/openmemory) | [Pieces](https://pieces.app/features/mcp) | [SaveContext](https://savecontext.dev/) | [OneContext](https://supergok.com/onecontext-persistent-context-layer-ai-coding-agents/) | [Memory Keeper MCP](https://github.com/mkreyman/mcp-memory-keeper) | [Cognee](https://www.cognee.ai/) | [Anthropic Memory MCP](https://github.com/modelcontextprotocol/servers/tree/main/src/memory)
- [Tabnine](https://docs.tabnine.com/main/welcome/readme/personalization) | [HowYouCode](https://howyoucode.dev/) | [ClaudeMDEditor](https://www.claudemdeditor.com/) | [AI Instruction File Generator](https://ai-agent-md.com/)
- [Biome](https://biomejs.dev/) | [eslint-plugin-react](https://github.com/jsx-eslint/eslint-plugin-react)

### Moat / Strategy Sources
- [Claude Code Issue #18660](https://github.com/anthropics/claude-code/issues/18660)
- [Cursor Rules Guide 2026](https://promptxl.com/cursor-ai-rules-guide-2026/) | [Cursor Changelog](https://blog.promptlayer.com/cursor-changelog-whats-coming-next-in-2026/)
- [SonarQube Gartner Reviews](https://www.gartner.com/reviews/market/application-security-testing/vendor/sonarsource/product/sonarqube)
- [UK Gov ADR Framework](https://technology.blog.gov.uk/2025/12/08/the-architecture-decision-record-adr-framework-making-better-technology-decisions-across-the-public-sector/)
- [Microsoft ADR Framework](https://learn.microsoft.com/en-us/azure/well-architected/architect-role/architecture-decision-record)
- [The "SaaSpocalypse" vs Real-World Moats](https://alignba.com/2026/02/05/the-saaspocalypse-versus-real-world-moats/amp/)
- [The New New Moats -- Greylock](https://greylock.com/greymatter/the-new-new-moats/)
- [Data and Defensibility -- Pivotal](https://pivotal.substack.com/p/data-and-defensibility)
- [SARIF Spec](https://docs.oasis-open.org/sarif/sarif/v2.1.0/sarif-v2.1.0.html)
- [Apify MCP](https://apify.com/mcp/developers) | [MCP Hive](https://mcp-hive.com/)
- [Moesif Outcome-Based Pricing](https://www.moesif.com/)
- [GitHub Copilot Policies](https://docs.github.com/en/copilot/concepts/policies)
- [UC Research](https://www.universityofcalifornia.edu/news/11-things-ai-experts-are-watching-2026) | [Clarifai AI Risks](https://www.clarifai.com/blog/ai-risks) | [IBM 2026 AI Predictions](https://www.ibm.com/think/news/ai-tech-trends-predictions-2026)
- [Claude Compacting Explained](https://unmarkdown.com/blog/claude-compacting-explained) | [Context Loss Hidden Cost](https://dev.to/gonewx/the-hidden-cost-of-ai-coding-context-loss-and-how-developers-are-fixing-it-4b0d)
- [Potpie $2.2M](https://techfundingnews.com/the-startup-building-a-knowledge-graph-for-code-raises-2-2m-to-make-ai-agents-actually-useful/) | [Greptile $25M](https://siliconangle.com/2025/09/23/greptile-bags-25m-funding-take-coderabbit-graphite-ai-code-validation/)
