# Product Refinements Summary

What changed for each product from the original plan after competitive research.

---

## `aide scan` — Architecture Health Score

**Classification**: Essential (unchanged) — still the entry point

**What stayed the same**: Core concept (scan codebase → detect patterns → produce health score → output `.aide/rules.yaml`) is unchanged.

**What changed**:
- **Scoring model specified**: Use Lighthouse-style percentile-based log-normal distribution (0-100). Original plan had a score concept but no methodology.
- **Metrics refined**: Locked in 4 core metrics — Module Coupling, Dependency Health (layering violations), Cycle Risk, Pattern Consistency. Original had similar categories but less defined.
- **`--json` output added**: CI integration output format from day one (wasn't specified).
- **Competitive validation**: Confirmed no equivalent tool exists. CodeScene is file-level/observational. Teamscale requires manual modeling. Lighthouse is web-only. The auto-detect → score → generate-rules pipeline is genuinely unique.

**No major direction change** — scan was already well-defined. Refinements are implementation details.

---

## `aide rules` — Architecture as Code

**Classification**: Essential (unchanged)

**What stayed the same**: `.aide/rules.yaml` format with modules, patterns, conventions. Auto-detect → refine → enforce workflow.

**What changed**:
- **Three explicit rule types defined**: boundaries (module imports), patterns (code conventions), constraints (metric thresholds). Original plan mixed these together.
- **SARIF output added**: Standard format so VS Code/IntelliJ can show violations inline in the editor. This was not in the original plan.
- **Decision records built into rules**: Every rule gets an optional `reason:` field ("Added after Q3 production incident"). Original plan didn't connect rules to WHY.
- **Open spec positioning**: Explicitly frame `.aide/rules.yaml` as an open standard other tools can read — the "Dockerfile of architecture" play. Original plan treated it as AIDE's config file, not a format standard.
- **Competitive table added**: Compared against dependency-cruiser (.json, JS-only), ArchUnit (Java test classes), Teamscale (UI diagrams), .cursorrules (no enforcement), CLAUDE.md (no enforcement). Confirms AIDE is the only cross-language + CI-enforceable + auto-detected format.

**Direction shift**: From "AIDE's config format" → "an open standard that becomes infrastructure."

---

## `aide check` — Architecture Enforcement

**Classification**: Essential (unchanged)

**What stayed the same**: CI gate that validates against rules, `--fail-below` flag, exit code logic.

**What changed**:
- **Three enforcement modes**: `--fail-on error` (strict blocking), `--report-only` (warnings only), `--auto-fix` (suggest fixes). Original only had pass/fail.
- **SARIF output**: For GitHub Advanced Security / GitLab SAST integration. Violations show up natively in GitHub's security tab.
- **Native GitHub Action**: `aide-check@v1` for minimal setup. Original plan didn't specify distribution method.
- **Score delta reporting**: "This PR would change score from 82 → 76 (threshold: 70)." More granular than original pass/fail.
- **Diff context in violations**: Show the specific import line that violates the rule, not just the file. More actionable output.

**No major direction change** — refinements make it more practical for CI integration.

---

## `aide mcp` — Architecture-Aware AI Agent Layer

**Classification**: Changed from implied-Essential → **Premium**

**What stayed the same**: MCP server exposing architecture tools to AI agents. check_compliance, find_similar concepts.

**What changed**:
- **Reclassified as Premium**: Original plan positioned MCP alongside core products. After research, MCP is a wrapper on top of the core — not the core itself. Build it parallel in 2-3 days, but it's not the entry point.
- **Three specific tools defined**: `check_architecture` (pass/fail), `find_similar` (duplicate detection), `get_rules` (what's allowed here). Original had more tools listed.
- **Monetization model specified**: Freemium with option for outcome-based pricing (charge when agent follows a rule that prevents a violation). Original plan didn't specify MCP pricing.
- **Market context added**: No architecture-specific MCP exists yet (open field), but MCP marketplace is nascent — monetization is unproven.

**Direction shift**: From "core product" → "premium wrapper that depends on core products working first."

---

## `aide review` — PR Architecture Gate

**Classification**: Changed from Phase 2 priority → **Valuable but watch redundancy**

**What stayed the same**: GitHub App that runs aide check on PRs, shows violations, blocks merges.

**What changed**:
- **Saturation warning added**: PR review bot market is HEAVILY saturated (CodeRabbit: 2M repos, Copilot Code Review: 1M users in month 1, Greptile: $25M raised). Original plan didn't acknowledge this.
- **Scope narrowed**: DON'T compete on code review quality — can't beat Copilot's scale. ONLY do architecture enforcement in PRs. Original plan was broader.
- **Redundancy acknowledged**: If `aide check` already runs in CI, the GitHub App is essentially UI sugar — making violations visible in PR conversation vs. buried in CI logs. Still valuable but not essential.
- **Pricing specified**: $30-50/repo/mo (unchanged from original).

**Direction shift**: From "primary monetization vehicle" → "paid convenience layer on top of aide check."

---

## `aide map` — Dependency Visualization

**Classification**: Changed from expansion product → **Heavily de-scoped**

**What stayed the same**: Dependency graph visualization concept.

**What changed**:
- **Market saturation acknowledged**: Madge (JS), Emerge (12+ languages), NX Graph (monorepo), CodeCharta (3D), CodeSee (function-level) — too many visualization tools already exist. Original plan didn't research this.
- **Scope drastically reduced**: Don't build a standalone visualization tool. Instead, overlay rule violations on the dependency graph (red = violation, green = allowed, blue = pattern). One command: `aide map --open` → generates HTML file.
- **$2.14B market claim removed from emphasis**: The market exists but is for enterprise dependency MAPPING (infrastructure), not code visualization. AIDE's lightweight approach serves a different need.

**Direction shift**: From "serve the $2.14B market" → "minimal feature that overlays violations on graph, not a standalone product."

---

## `aide onboard` — Auto-Generated Architecture Guide

**Classification**: Unchanged — Valuable (build after core)

**What stayed the same**: Auto-generate architecture documentation from graph + rules.

**What changed**:
- **Identified as underserved category**: Research found Swimm, DocuWriter, Doxygen, DAUT — none do architecture-specific onboarding. This is a real gap (stronger positioning than original plan implied).
- **Structured output defined**: Module map → Rules & boundaries → Patterns → Conventions → Decision history. Original plan was vaguer ("module map, dependency flows, key patterns").
- **Auto-update specified**: Re-generates when rules or patterns change — not a one-time doc. Original plan implied this but didn't state it.
- **LLM integration**: Use Claude/GPT for narrative explanations, AIDE provides structural facts. Original plan mentioned "context assembler" but not LLM narration.

**No major direction change** — mostly better-defined output format and confirmed the gap is real.

---

## New Additions Not In Original Plan

### Phase 0: Fix `inferRelations()` Blocker
Added as explicit Phase 0 (Week 0-1). The `inferRelations()` function at `src/analysis/treeSitterAnalyzer.ts:870` returns `[]` always — the relations table is never populated. Without IMPORTS/CALLS/EXTENDS data, none of the products work. Original plan mentioned this in the technical audit section but didn't make it an explicit phase.

### Decision Memory (Phase 4)
ADR tracking and rule history with "why" fields. Not a separate product but a capability layer that creates switching costs. Wasn't in the original product list.

### Learning From Corrections (Phase 4)
System that remembers when developers override rules and adapts over time. No competitor does this. Wasn't in the original product list.

### Cross-Company Benchmarking (Phase 5)
"Your score vs. industry median." Network effect play. Mentioned in moat strategy but now has explicit phase placement.

### Compliance Mappings (Phase 5)
SOC2/HIPAA/ISO rule mappings for regulatory lock-in. Mentioned in moat strategy, now phased.

---

## Priority Changes Summary

| Product | Original Priority | New Priority | Change |
|---------|------------------|-------------|--------|
| `aide scan` | Phase 1 (Essential) | Phase 1a (Essential) | No change |
| `aide rules` | Phase 1 (Essential) | Phase 1a (Essential) | No change |
| `aide check` | Phase 1 (Essential) | Phase 1b (Essential) | No change |
| `aide mcp` | Phase 1b (Essential) | Phase 1c (Premium) | Downgraded — wrapper, not core |
| `aide review` | Phase 2 (Primary monetization) | Phase 2 (Valuable) | Softened — saturated market, redundant with check |
| `aide map` | Phase 3 (Expansion) | Phase 3b (De-scoped) | Downgraded — saturated market, minimal effort only |
| `aide onboard` | Phase 3 (Expansion) | Phase 3a (Valuable) | Slightly upgraded — confirmed underserved gap |
| Decision memory | Not in plan | Phase 4 | New — moat layer |
| Learning | Not in plan | Phase 4 | New — moat layer |
| Benchmarking | Not in plan | Phase 5 | New — moat layer |
| Compliance | Not in plan | Phase 5 | New — moat layer |
