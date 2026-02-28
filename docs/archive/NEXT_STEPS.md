# AIDE — What To Do Next

> Synthesized February 26, 2026 from: Product Evaluation (4 real repos), Pivot Plan Research (5 expansion areas), Product Audit (source code review).

---

## 1. Executive Summary

AIDE v0.3.0 has 17 CLI commands and 6 MCP tools built on a solid SQLite-backed knowledge graph, but only one product (`aide check`) delivers clear value — and only for TypeScript projects. Non-TS languages get misleading scores (Go gets 93/100 with zero relations), MCP has broken parameters and fake semantic search, auto-generated rules codify bad architecture instead of prescribing good architecture, and `aide onboard` is a data dump with unimplemented sections. The biggest opportunity is not building new features — it is making the existing core (scan, rules, check) actually trustworthy across languages, then building `aide style` + `aide generate-config` as the unique differentiator nobody else offers: auto-generating AI agent config files (CLAUDE.md, .cursorrules, AGENTS.md) from real codebase graph analysis.

---

## 2. Critical Fixes (Do These FIRST)

These are bugs and issues that actively undermine credibility. A user who hits any of these will not come back.

### 2.1 Non-TS Languages Report Misleading Scores

**Problem**: Go gets 93/100 with zero relations. Flask gets 83/100 with only 162 relations for 1,940 symbols. Users scanning Python or Go repos get false confidence from scores that reflect AIDE's blindness, not their codebase's health.

**Fix**: Add a confidence indicator to `aide scan` output. If `relations / symbols < 0.1`, display `LOW CONFIDENCE — limited relation detection for this language` and suppress the numeric score or mark it clearly as unreliable. Never show a green "93/100" when you detected zero relationships.

**Why first**: A misleading score is worse than no score. This is a trust-destroying bug. One Go developer who sees "93/100" and then finds a circular dependency manually will never trust AIDE again.

**Effort**: Small (1-2 days). Add a confidence calculation in the scan reporter.

### 2.2 MCP `files` Parameter Is a No-Op

**Problem**: `check_compliance({ files: ["src/api/controller.ts"] })` ignores the `files` parameter entirely and checks the whole project. This is the single most important MCP tool for AI agents — an agent needs to check if its specific change violates rules.

**Fix**: Wire the `files` parameter through to the check engine so it filters violations to only the specified files' modules. This is the difference between an agent that can self-correct before committing and one that can't.

**Why first**: Without per-file checking, the entire MCP value proposition ("AI agents automatically follow your architecture") is a lie. The agent calls `check_compliance` with its changed files and gets back noise about the entire project.

**Effort**: Medium (2-3 days). The check engine already works; the handler just needs to filter.

### 2.3 `find_similar` Does Substring Matching, Not Semantic Search

**Problem**: The `find_similar` MCP tool does substring matching on symbol names. Searching for "authentication middleware" only finds symbols with those literal strings in their names. The embeddings table exists in the database and has data — it is just not used by the MCP handler.

**Fix**: Replace the substring matching with actual cosine similarity search against the embeddings table. The infrastructure is already built; it is wired to the wrong query.

**Why first**: `find_similar` is the tool that prevents the "new dev reinvents the wheel" problem. If it cannot find semantically similar code, it cannot prevent duplicate implementations. The user's core pain point (new developer creating a monolithic modal instead of extending the existing reusable one) depends on this working.

**Effort**: Medium (2-3 days). The embeddings and search infrastructure exist in `src/semantic/semanticSearch.ts`.

### 2.4 Violation `line` Field Is Never Populated

**Problem**: The `Violation` type has a `line` field but it is never set. Violations say "module middleware violates boundary" but not "line 15 of src/middleware/auth.ts imports from ui/components." Without line numbers, developers cannot act on violations without manually searching.

**Fix**: Populate the `line` field from the relation's source symbol's `start_line`. The data exists in the symbols table.

**Why first**: Line-level precision is the difference between "this is useful" and "this is a toy." ESLint gives line numbers. SonarQube gives line numbers. AIDE must give line numbers.

**Effort**: Small (1-2 days). The relation data includes source symbol IDs which map to line numbers.

---

## 3. High-Value Improvements (Do These SECOND)

These are not new features. They make existing features deliver real value.

### 3.1 Make Rules Prescriptive, Not Descriptive

**Problem**: Auto-generated rules just list every current dependency as "allowed." If middleware currently imports from 7 modules (including accidental coupling), the rules say "middleware is allowed to import from 7 modules." The rules codify bad architecture.

**Fix — Intelligent Tightening**:
- If a module has only 1-2 relations to another module, do NOT add it to `allow`. It is likely accidental coupling.
- Detect layering patterns (e.g., `brain` should never import from `cli`) and generate `deny` rules.
- Add a threshold: only add to `allow` if the relation count exceeds a minimum (e.g., 5+ relations = intentional coupling, 1-2 = accidental).
- Add comments in generated rules: `# EDIT THIS: review whether middleware should really depend on 7 modules`.
- Replace stats-based descriptions ("640 symbols, cohesion: 77%") with purpose-oriented placeholders ("# TODO: describe this module's purpose").

**Why**: Rules that mirror reality are useless. Rules that push toward intentional architecture are the product. This is the difference between "you are where you are" and "here is where you should be."

**Effort**: Medium (3-5 days). Changes to `src/rules/rulesGenerator.ts`.

### 3.2 Reduce Circular Dependency Noise

**Problem**: Hono shows 35 circular dependency errors. Developers will ignore all 35. This is the "alert fatigue" problem that kills monitoring tools.

**Fix**:
- Group circular deps by "root cycle" — many of the 35 are transitive effects of a few core cycles. Show "3 root cycles (causing 35 total circular paths)."
- Show the specific import statements that create each cycle, not just module names. "Remove the import of `createMiddleware` from `src/helper/factory.ts:12` to break this cycle."
- Add severity tiers: direct A-B-A cycles are errors; transitive A-B-C-A cycles are warnings; chains longer than 4 are info.

**Why**: 35 undifferentiated errors is the same as zero actionable information. Three prioritized root causes with specific fix instructions is genuinely useful.

**Effort**: Medium (3-5 days). Cycle detection already works; needs grouping and enrichment.

### 3.3 Make `aide check` Suggestions Contextual

**Problem**: Every circular dep gets the same templated fix: "Extract shared types to a common module, or invert the dependency with DI." Every coupling warning gets: "Reduce coupling by extracting a shared interface or facade." These are generic advice, not actionable suggestions.

**Fix**:
- Name the specific files and imports that contribute most to the violation.
- For coupling violations: "The top contributor is `src/middleware/bearer-auth/index.ts` importing 4 symbols from `(root)`. Consider extracting a `ContextTypes` interface."
- For circular deps: "The weakest link is `utils` importing 10 symbols from `(root)`. The imports are: `createContext` (line 5), `HonoRequest` (line 8), `Env` (line 12). Moving these types to a `shared/types.ts` file would break this cycle."

**Why**: The difference between "I know what to do" and "I need to spend 30 minutes investigating before I can even start." Contextual suggestions are what make `aide check` worth running.

**Effort**: Medium-High (5-7 days). Requires enriching violations with the actual imports/symbols involved.

### 3.4 Implement `aide onboard` Missing Sections

**Problem**: The source code comments mention "Key Entry Points" and "Architecture Patterns" sections that are never generated. The output is structurally identical to `aide stats -v` but longer.

**Fix**:
- Implement "Key Entry Points": identify main exports, CLI entry points, API route handlers, and public API surfaces by analyzing exports and high fan-in symbols.
- Implement "Architecture Patterns": detect and describe patterns like "repository pattern", "middleware chain", "service layer" from the graph structure.
- Add narrative guidance: "To add a new middleware, follow the pattern in `src/middleware/cors/`. Each middleware is a directory with an `index.ts` that exports a factory function."
- Use the highest fan-in symbols as "start here" indicators.

**Why**: A new developer needs a narrative, not a data dump. The data is already computed; it just needs to be turned into guidance.

**Effort**: Medium (3-5 days).

---

## 4. New Capabilities (Do These THIRD)

Prioritized by: differentiation x demand x feasibility.

### Priority 1: `aide style` + `aide generate-config` — STRONGEST Opportunity

**What**: Analyze the codebase graph and extract naming conventions, structural patterns, abstraction preferences, error handling style, and testing patterns. Output as `.aide/style.yaml`. Then generate CLAUDE.md, .cursorrules, .github/copilot-instructions.md, and AGENTS.md from `.aide/rules.yaml` + `.aide/style.yaml`.

**Why #1**:
- **Differentiation**: Nobody generates AI agent config files from actual codebase graph analysis. Zero competitors do this. HowYouCode generates a profile card (not actionable). ClaudeMDEditor manages files (doesn't generate them). Claude's `/init` scans shallowly (tech stack + folder structure, not architecture patterns).
- **Demand**: The config file fragmentation problem is real and growing. Every AI tool has a different file format (.cursorrules, CLAUDE.md, AGENTS.md, copilot-instructions.md, .windsurf/rules) but the content is the same. Developers maintain 3-5 files with duplicate information. A tool that generates all of them from one source of truth solves a genuine daily pain.
- **Feasibility**: HIGH. AIDE's knowledge graph already has the raw data: symbol names (naming conventions), IMPORTS graph (dependency patterns), module structure (organization style), test files (testing patterns). This is analysis + templating, not new infrastructure.

**Effort**: 2-3 weeks.

**Demo**: "Run `aide style` on any repo. In 60 seconds you get a `.aide/style.yaml` describing how your team writes code, plus auto-generated CLAUDE.md and .cursorrules that actually match your codebase — not a template you filled in manually."

### Priority 2: Quantitative SOLID Rules from Graph — STRONG Differentiator

**What**: Add graph-based SOLID principle detection as rule categories within `aide rules` and `aide check`:
- **Single Responsibility**: Measure symbol fan-out via CALLS graph. Flag classes/modules that call symbols in 5+ unrelated modules.
- **Dependency Inversion**: Detect when high-level modules import low-level implementation details directly via IMPORTS graph.
- **Interface Segregation**: Detect large interfaces where implementers only use a subset via IMPLEMENTS + CALLS analysis.

**Why #2**:
- **Differentiation**: Nobody does deterministic SOLID assessment from a knowledge graph. Designite detects design smells but is C#/Java only. SonarQube has universal rules, not team-configurable philosophy. LLMs can evaluate SOLID but are probabilistic and inconsistent.
- **Demand**: Teams that care about architecture (AIDE's target users) care about SOLID. This extends the existing rules engine, not a new product.
- **Feasibility**: HIGH for SRP and DIP (direct graph queries). MEDIUM for ISP (needs IMPLEMENTS relation data). LOW for Liskov Substitution (requires behavioral understanding).

**Effort**: 2 weeks for SRP + DIP. Another week for ISP.

**Demo**: "AIDE found that your `UserService` class calls symbols across 8 different modules — that is a Single Responsibility violation. Your `PaymentController` imports the concrete `StripeClient` instead of going through the `PaymentGateway` interface — that is a Dependency Inversion violation."

### Priority 3: Framework Presets — Useful Extension

**What**: Auto-detect the framework (React, Vue, NestJS, Express) from package.json and load framework-specific rule presets. Focus on cross-file rules that linters cannot catch: component composition vs prop-switching, hook boundary violations, service layer bypass.

**Why #3**:
- **Differentiation**: MEDIUM. ESLint plugins handle single-file rules. AIDE adds value only for cross-file architectural rules (e.g., "this React component reimplements functionality that exists in SharedModal.tsx").
- **Demand**: HIGH. The user's core example (new dev creating a monolithic modal) is a React-specific architectural problem.
- **Feasibility**: HIGH. Rule presets are configuration, not infrastructure.

**Effort**: 1-2 weeks per framework.

### Priority 4: Proactive Duplicate Prevention

**What**: In `aide check`, flag new code that has >80% semantic similarity to existing code. "You created `GroupTableModal.tsx` but `ModalSelector.tsx` already exists with 87% similarity. Consider extending rather than duplicating."

**Why #4**:
- **Differentiation**: MEDIUM-HIGH. CodeQA does cross-repo search but does not block PRs. Nobody gates on semantic duplication.
- **Demand**: HIGH. AI agents create 8x more duplicated code blocks. This directly addresses the AI-era tech debt problem.
- **Feasibility**: MEDIUM. Requires the semantic search to actually work (see Critical Fix 2.3). Once that is fixed, adding a duplication check is straightforward.

**Effort**: 1 week (after semantic search is fixed).

### Priority 5: Architecture Decision Memory

**What**: When an AI agent discusses architecture with a developer, AIDE captures structured decisions linked to the knowledge graph. "We split UserService because coupling was too high" gets stored as an ADR linked to the `services/user/` module.

**Why #5**:
- **Differentiation**: MEDIUM. The "linked to knowledge graph" angle is unique, but the memory MCP space is crowded (Mem0, Pieces, SaveContext, OneContext — at least 8 active projects).
- **Demand**: MEDIUM. Switching cost / moat value is high, but user-facing demand is lower than the enforcement features.
- **Feasibility**: HIGH. AIDE's SQLite store can add a decisions table trivially.

**Effort**: 1-2 weeks.

---

## 5. What NOT to Build

### General-Purpose AI Memory Server
The MCP memory space has 8+ active competitors (Mem0, Pieces, SaveContext, OneContext, Memory Keeper, Cognee, etc.). Entering now means competing with established projects on their home turf. AIDE's "architecture-linked" angle is interesting but not sufficient to overcome the head start these tools have. Build architecture decision memory as a small module within `aide mcp`, not as a standalone product.

### AI Code Review Bot
The PR review bot market is saturated beyond rescue. GitHub Copilot Code Review has 1M+ users. CodeRabbit covers 2M+ repos and 13M+ PRs. Greptile raised $25M. Competing on "we review your code better" is a losing position. `aide review` should be positioned as architecture-only enforcement (boundary violations, coupling increases, pattern drift) — complementary to existing review tools, not replacing them. Do not try to comment on code quality, style, or bugs.

### Single-File Lint Rules
ESLint has 100+ React rules. Biome does it at 10x the speed. Do not reimplement max-lines-per-function, require-prop-types, or any rule that operates on a single file. AIDE's value is exclusively in rules that require the knowledge graph (cross-file, cross-module, pattern-level). If ESLint can catch it, AIDE should not try.

### Standalone Visualization Product
The dependency visualization market has Madge, Emerge, NX Graph, CodeCharta, CodeSee, and others. Do not build a full interactive graph explorer. `aide map` Mermaid output is already useful for documentation. At most, overlay rule violations (red edges) on the existing graph. Do not build a separate visualization app.

### Qualitative LLM-Based Rules (Not Yet)
Philosophy-based evaluation ("does this follow Clean Architecture?") via LLM is intellectually appealing but practically risky. LLMs systematically overrate complex principles like Liskov Substitution. The quantitative graph-based SOLID checks (SRP fan-out, DIP import analysis) are deterministic and trustworthy. Build those first. The LLM layer is Phase 3+ and should be optional.

---

## 6. The 30-Day Sprint

### Week 1: Trust (Critical Fixes)
**Deliverables**:
- Confidence indicator on non-TS scan scores. Go repos no longer show "93/100" in green.
- MCP `files` parameter wired through to check engine. AI agents can check specific files.
- Violation `line` field populated from source symbol data.
- All existing tests still pass.

**Demo at end of Week 1**: "Here is AIDE running on a Go repo — notice it says 'Low confidence: limited relation detection for Go' instead of claiming 93/100. And here is an AI agent calling `check_compliance` with a single file and getting back only violations relevant to that file, with line numbers."

### Week 2: Quality (High-Value Improvements)
**Deliverables**:
- `find_similar` uses actual embeddings for semantic search.
- Circular deps grouped into root cycles with specific import statements.
- Rules generator applies intelligent tightening (skip low-count relations, add comments).

**Demo at end of Week 2**: "Here is `aide check` on Hono — instead of 35 undifferentiated circular dep errors, you see 3 root cycles with the exact imports you need to remove. And `aide rules` generated boundaries that skip accidental coupling — middleware is allowed to import from 3 modules, not 7."

### Week 3: Differentiation (aide style + generate-config)
**Deliverables**:
- `aide style` extracts naming conventions, structural patterns, dependency preferences from the knowledge graph. Outputs `.aide/style.yaml`.
- `aide generate-config` produces CLAUDE.md and .cursorrules from `rules.yaml` + `style.yaml`.

**Demo at end of Week 3**: "Run `aide style` on your repo. In 30 seconds you get a style profile. Run `aide generate-config` and you get a CLAUDE.md and .cursorrules that actually describe how YOUR team writes code — not a generic template. Change one line in `rules.yaml`, re-run, and all your AI agent config files update automatically."

### Week 4: Polish and Contextual Suggestions
**Deliverables**:
- `aide check` suggestions name specific files, imports, and line numbers.
- `aide onboard` generates "Key Entry Points" and "Architecture Patterns" sections.
- Quantitative SRP check (fan-out analysis) added to `aide check`.
- One-command experience polished: `npx aide-arch scan && aide check && aide style`.

**Demo at end of Week 4**: "Here is the full AIDE experience on a real TypeScript project. Scan gives you a trusted health score with breakdown. Check finds 3 root circular deps with exact fix instructions. Style extracts your conventions and generates config files for Claude and Cursor. Onboard gives a new developer a narrative guide with entry points and patterns. One tool, four commands, zero manual config writing."

### What You Ship at Day 30
A CLI that a TypeScript team can install and immediately get:
1. A trustworthy health score (with confidence for non-TS)
2. Prescriptive architecture rules (not a mirror of current state)
3. Actionable violation reports (with line numbers and specific fix instructions)
4. Auto-generated AI agent configs (CLAUDE.md, .cursorrules) from real codebase analysis
5. A new-developer onboarding guide with entry points and patterns

This is enough for the HN launch: "What is your architecture health score? Run `npx aide-arch scan` and find out in 60 seconds. Then run `aide style` to auto-generate your CLAUDE.md from your actual codebase."

---

## 7. The Pitch (Updated)

### One-Liner
**"AIDE auto-detects your architecture rules from code, enforces them in CI and via MCP, and generates AI agent configs — so every developer and every AI agent follows your architecture without reading a markdown file."**

### The Demo (5 minutes)
1. **(0:00)** "Here is a TypeScript project. I run `aide scan`." Show health score with breakdown — cohesion, coupling, circular deps, confidence indicator.
2. **(1:00)** "AIDE auto-detected my architecture. I run `aide rules`." Show `.aide/rules.yaml` with intelligent boundaries, not a mirror of every current dependency.
3. **(1:30)** "I run `aide check`." Show 3 root circular dependencies with specific imports to remove. Show one coupling violation with the top contributing files and line numbers.
4. **(2:30)** "I run `aide style`." Show `.aide/style.yaml` with extracted naming conventions, structural patterns, testing conventions. Then `aide generate-config` producing CLAUDE.md and .cursorrules.
5. **(3:30)** "Now I add AIDE to my AI agent." Show MCP tool call: agent creates a new file, calls `check_compliance`, gets back "VIOLATION: this import crosses a module boundary." Agent self-corrects. Then agent calls `find_similar` before creating a new component, discovers an existing one with 87% similarity, and extends it instead.
6. **(4:30)** "This is what it looks like in CI." Show GitHub Action with `aide check --fail-below 70` blocking a PR that introduces a boundary violation. The PR comment shows the score delta and specific violation with line number.

### The Core Thesis
"`.cursorrules` and `CLAUDE.md` are the markdown files of 2026 — they work until they don't, nobody keeps them updated, and AI agents follow them inconsistently. AIDE replaces hope with infrastructure. Auto-detected rules from your actual code. Deterministic enforcement in CI. MCP tools that give agents PASS/FAIL, not suggestions. Your architecture scales without a staff engineer holding everyone's hand."

### The Wedge
Start with TypeScript teams frustrated that AI agents ignore their architecture. The entry point is `aide scan` (free, 60 seconds, immediate value). The hook is `aide style` + `aide generate-config` (solves the config file fragmentation pain that every team with 2+ AI tools has today). The lock-in is `aide check` in CI (infrastructure, not a feature).
