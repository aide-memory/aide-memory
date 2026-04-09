# Product Vision — [Product Name]

> Product thesis: [One sentence — what's the infrastructure and what's the product]
> Created: [Date]. Last updated: [Date].

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Problem](#the-problem)
3. [Competitive Landscape](#competitive-landscape)
4. [What We're Building — Product Capabilities](#what-were-building--product-capabilities)
5. [Phases](#phases)
6. [Pricing](#pricing)
7. [Architecture](#architecture)
8. [Validation & Testing](#validation--testing)
9. [Business Operations](#business-operations)
10. [Naming](#naming)
11. [Repo Strategy & Licensing](#repo-strategy--licensing)
12. [Future Expansion](#future-expansion)
13. [Sources](#sources)

---

## Executive Summary

**Product thesis: [Infrastructure layer] as infrastructure, [actual product value] as the product.**

[2-3 paragraphs covering:]
- What problem exists and why it's getting worse
- What the market looks like (commoditized areas vs unoccupied)
- What THIS product does differently
- Honest assessment: what's table stakes vs what's genuinely differentiated
- Architecture approach (how it works technically at a high level)
- Pricing model
- Competitive urgency / execution window

---

## The Problem

### The Core Problem

[Frame the macro problem — the industry shift that creates the pain]

[Supporting research / data — cite specific studies, numbers, trends]

### Pain Points

#### [Category 1] problems (the product thesis)

**1. [Pain point title]**
[Concrete scenario. Not abstract — a specific developer experiencing the pain. What happens, what goes wrong, what they lose.]

**2. [Pain point title]**
[Same format]

**3. [Pain point title]**
[Same format]

#### [Category 2] problems (table stakes)

**4-7. [Individual pain points]**
[Same format — concrete, scenario-based, not abstract]

#### [Category 3] problems (underserved/operational)

**8-10. [Individual pain points]**
[Same format]

---

## Competitive Landscape

[Honest assessment as of specific date. State the date explicitly — this section goes stale fast.]

### Major Competitors

#### [Competitor 1 — the distribution leader]

**Stats:** [Stars, version, license, pricing]

[What it does. Recent developments.]

Weaknesses (VERIFIED from [source]): [Only include verified weaknesses with issue numbers/sources. Don't infer or assume.]

#### [Competitor 2 — the fast mover]

[Same format]

#### [Competitor 3 — the closest overlap]

[Same format. Include differentiation table if this is the most architecturally similar competitor:]

| Aspect | Them | Us |
|--------|------|-----|
| [Dimension 1] | | |
| [Dimension 2] | | |

### Other Notable Tools

| Tool | What it does | Traction |
|------|-------------|----------|
| | | |

### Platform-Native Status

| Platform | Status | Assessment |
|----------|--------|------------|
| | | |

### Gap Analysis

| Capability | Competitor 1 | Competitor 2 | ... | **Ours** |
|-----------|-------------|-------------|-----|----------|
| | | | | |

### What's Commoditized (not worth competing on alone)
- [List]

### What's Contested (well-funded competition)
- [List]

### What's Unoccupied (our reason to exist)
- [List — be honest. Verify each claim.]

### Honest Assessment
[Brutally honest paragraph about competitive position]

---

## What We're Building — Product Capabilities

[Total] capabilities organized by what the developer experiences, not by technical category.

**Free vs Pro at a glance:**

| Action | Free | Pro ($X/user/mo) |
|--------|------|-----|
| | | |

**Gating approach:** [How free/pro is enforced technically. Be honest about what's bypassable.]

---

### Table Stakes — [User-experience header]

[Describe why these are baseline expectations]

---

#### 1. [Capability name] — FREE/PRO

**Problem it solves:** [One line]

[How it works — 3-5 lines. Sub-features as bullet points.]

---

#### 2-N. [Continue for each capability]

[Same format. Every capability gets: problem it solves, how it works, FREE/PRO tag]

---

### Differentiators — [User-experience header]

[Describe why these are why the product exists]

---

#### N+1. [Capability name] — PRO

**Problem it solves:** [One line]

[How it works. Competitive note if relevant.]

---

## Phases

Each phase develops capabilities across multiple layers — not one layer per phase.

---

### Phase 0: Foundation — "Ready to launch"

**What we're proving:** Nothing yet. Pre-launch infrastructure.

| Area | What ships |
|------|-----------|
| **Domain + landing page** | |
| **Legal** | [Trademark, license, company registration] |
| **Public repo** | |
| **Package** | |
| **Telemetry** | |

**Estimate:** [X weeks]

---

### Phase 1: [Core product] — "[User-facing tagline]"

**What we're proving:** [One sentence thesis to validate]

[Competitive positioning — why Phase 1 alone can compete:]

| Competitor gap | How Phase 1 competes |
|---------------|---------------------|
| | |

**Capabilities in this phase:**

| Area | What ships | Tier |
|------|-----------|------|
| | | FREE/PRO |

**What is already built:**
- [List existing code/tests]

**What remains to ship:**
- [List remaining work]

**Deferred to Phase 2+:**
- [List what's NOT in Phase 1]

**Estimate:** [X weeks]

**Success criteria:**
- [Measurable metrics]

**Analytics required for go/no-go:**

| Metric | How measured | Why it matters |
|--------|-------------|----------------|
| | | |

**Go/No-Go gates:**
- **GO** if: [criteria]
- **PAUSE** if: [criteria]
- **STOP** if: [criteria]
- **PIVOT** if: [criteria]

**[Phase N+1] direction decided by [Phase N] data.** [What to look for in user feedback to decide next phase direction.]

**Legal at this phase:** [Specific legal tasks]

**Marketing & docs:**
- [List deliverables]

---

### Phase 2-N: [Continue same format for each phase]

---

## Pricing

### [Tier 1] — [Target user]

**Price:** $X

**What you get:**
- [List]

**Why it's this generous/restrictive:** [Honest competitive reasoning]

### [Tier 2] — [Target user]

**Price:** $X/user/month

**What you get (everything in [Tier 1], plus):**
- [List]

**The conversion trigger:** [What makes free users upgrade]

**Revenue gating:** [How it's technically enforced]

**Revenue math:**

| Scenario | Users | Revenue |
|----------|-------|---------|
| | | |

### Rejected Alternatives
[Why not usage-based, capped free tier, etc.]

---

## Architecture

### Design Decisions
- [Bullet list of key architectural choices with rationale]

### [Storage / Data Architecture]
[How data is stored, synced, queried]

### [Key Technical Subsections]
[As needed — each major architectural decision gets a subsection]

### Implementation Detail Docs (Skeleton)
```
docs/
  PRODUCT_VISION.md
  sessions/
  specs/
    PHASE_1_SPEC.md
    ...
```

---

## Validation & Testing

### What Has Been Proven
[Existing test results, E2E comparisons]

### E2E Testing Strategy Per Phase
[Test scenarios per phase]

### Success Criteria Summary

| Phase | Gate metric | GO | PAUSE | STOP |
|---|---|---|---|---|
| | | | | |

---

## Business Operations

### Distribution
[Priority table of distribution channels]

### Usage Tracking
[What to track, telemetry approach, privacy]

### Billing
[Payment infrastructure, trial flow, deactivation]

### Privacy Commitments
[Per-tier privacy guarantees]

---

## Naming

### Current State
[Name, expansion, package names, domains]

### Validation Checklist
- [ ] npm availability
- [ ] Domain availability
- [ ] GitHub org/repo
- [ ] Trademark search
- [ ] Developer gut check

---

## Repo Strategy & Licensing

### Structure
[Dev repo, public repo, mirroring approach]

### Licensing
[License choice with comparison table]

### Migration Path
[Per-phase structural changes]

---

## Future Expansion

[Each expansion idea as a paragraph: what, why, when to consider]

### [Product Suite — Additional Product Ideas]
[If applicable — related products that could share infrastructure]

---

## Sources

### [Time period] Sources
- [Cited sources with dates and specifics]

---

# Workflow Guide

## How This Document Was Created

### Research Phase (Day 1)
1. Spin off parallel opus agents for:
   - Competitive landscape scan (each major competitor gets its own agent)
   - Market direction / should-we-build-this assessment
   - Technical architecture research
   - Naming options

2. Compile findings. Challenge every assumption. Verify claims with actual data (GitHub issues, user sentiment, adoption numbers).

### Product Definition Phase (Day 1-2)
1. Define capabilities from user experience perspective (not technical categories)
2. For each capability: is it table stakes or a differentiator? Verify against competitors.
3. Define phases — what ships when, with success criteria and go/no-go gates
4. Define pricing — what's free, what's paid, how is it gated
5. Honest assessment — is this worth building? What are the risks?

### Validation Phase (Day 2)
1. Verify every claimed differentiator against competitors (spin off verification agents)
2. Verify competitor user sentiment (GitHub issues, Reddit, HN — only report verified data)
3. Update the document with verified findings
4. Make go/no-go decision based on verified data, not assumptions

### Key Principles
- Present differentiators as developer experiences, not technical categories
- For each capability, state whether it's FREE or PRO
- Be brutally honest about competition — don't oversell position
- Only include verified competitive claims (with issue numbers/sources)
- Test every "unique" claim — spin off an agent to check if any competitor does it
- The market rewards simplicity and distribution, not feature count
- Quality and reliability win over feature combinations

---

# Implementation Strategy

## Agent Orchestration for Phase 0 + 1

### Session Structure

**One coordinating session** manages the entire implementation. It:
1. Reads the product vision and implementation spec
2. Breaks work into independent components
3. Spins off parallel agents for independent work
4. Reviews returned work for quality and consistency
5. Handles integration between components
6. Manages commits and merging

### Three Implementation Phases Per Sprint

#### Phase A: Build (Parallel Agents)

The coordinating session identifies independent components and spins off agents:

```
Coordinating session:
├── Agent 1: [Component A] (e.g., storage layer - file-per-memory)
│   └── Gets: relevant source files, types, test examples, AC from spec
├── Agent 2: [Component B] (e.g., FTS5 search integration)
│   └── Gets: search-related code, schema, AC from spec
├── Agent 3: [Component C] (e.g., CLI commands)
│   └── Gets: existing CLI code, commander setup, AC from spec
└── ... (as many as are truly independent)
```

**Rules for spinning off build agents:**
- Each agent gets ONLY the files it needs (don't dump entire codebase)
- Each agent gets the acceptance criteria for its component from the spec
- Each agent gets relevant type definitions and interfaces
- Agents work in isolation (worktree) to avoid file conflicts
- Agent prompt must include: what to build, what files to read first, what tests to write, what NOT to change

**What makes a good parallel agent task:**
- Self-contained (doesn't depend on another agent's output)
- Has clear inputs and outputs (types/interfaces defined)
- Has clear AC (from the spec)
- Touches different files than other agents

**What should NOT be parallelized:**
- Components that depend on each other's interfaces
- Migrations that affect shared state
- Anything touching the same files

#### Phase B: Review (Sequential)

After all build agents complete, the coordinating session:

0. **Smoke test each agent's work FIRST** (before deep review):
   - Does it compile/run without errors?
   - Does the basic happy path work? (e.g., install → init → store a memory → recall it)
   - Any crashes, unhandled errors, or missing dependencies?
   - If smoke test fails → send back to agent with the error, don't review further

1. Reviews each agent's output for:
   - Does it meet the AC from the spec?
   - Are tests passing?
   - Does it follow the project's patterns and conventions?
   - Are there conflicts with other agents' work?

2. Integration testing:
   - Do the components work together?
   - Run the full test suite
   - Test the end-to-end flow (capture → store → recall)

3. If issues found: fix directly or spin off targeted fix agents

#### Phase C: Bug Fix (Parallel Agents)

For issues found during review:

```
Coordinating session:
├── Fix Agent 1: [Bug/issue in Component A]
│   └── Gets: the component code, the failing test, the error message
├── Fix Agent 2: [Integration issue between A and B]
│   └── Gets: both components, the integration test, expected behavior
└── ...
```

**Rules for fix agents:**
- Give them the EXACT error/issue (not "fix bugs")
- Give them the relevant test that should pass
- Give them minimal context (just what's needed to fix)
- Each fix is a separate commit

### Branching During Agent Work

```
main
└── feature/phase-1
    ├── feature/phase-1/storage-layer     (Agent 1 worktree)
    ├── feature/phase-1/fts5-search       (Agent 2 worktree)
    ├── feature/phase-1/cli-commands      (Agent 3 worktree)
    └── ... 

After review:
    All merged back to feature/phase-1
    Integration tests pass
    feature/phase-1 merged to main
```

### Commit Strategy

- Each agent's work = one or more focused commits on its branch
- Conventional commit format: `feat(storage): implement file-per-memory architecture`
- Scopes: `storage`, `search`, `cli`, `hooks`, `mcp`, `config`, `test`, `docs`
- Coordinating session handles merge commits
- Integration fixes committed by coordinating session directly

### What The Coordinating Session Prompt Looks Like

```
Read docs/specs/PHASE_0_1_SPEC.md for the full implementation plan.
Read docs/PRODUCT_VISION.md for product context.
Call aide_recall for stored memories about architecture decisions.

Your job is to coordinate the Phase 1 implementation:
1. Read the spec and identify independent components
2. For each independent component, spin off an agent with:
   - The specific files to read
   - The acceptance criteria from the spec
   - The tests to write
   - What NOT to change
3. Review returned work
4. Run integration tests
5. Fix issues (spin off fix agents or fix directly)
6. Commit and merge when passing

Use worktrees for parallel agents to avoid file conflicts.
```

### Tips From Experience

- **Don't give agents too much context** — they work better with focused scope
- **Always include AC** — agents without clear "done" criteria produce vague work
- **Review before merging** — agents can introduce subtle issues
- **One agent per component** — don't ask one agent to build multiple unrelated things
- **Test after EVERY merge** — don't batch merges without testing between them
- **Keep the coordinating session lean** — it should orchestrate, not build
- **If an agent fails, re-prompt with the error** — don't start from scratch
- **Commit frequently** — if something breaks, you can revert to the last good state
