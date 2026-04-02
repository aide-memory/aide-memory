# Strategic Direction — March 31, 2026

> Session summary: Full competitive re-analysis, differentiator verification, product capability refinement, pricing simplification, and go/no-go decision.

---

## The Market (as of March 31, 2026)

### Individual Memory is Commoditized

- **30+ MCP memory servers** launched in March 2026 alone
- claude-mem: 43,856 stars (up 7K in 2 weeks), v10.6.3, OpenClaw Gateway, "RAD" open standard ambitions
- engram: 2,085 stars, 50 releases, Go binary, 8 agents, 15 MCP tools
- memories.sh: 20 stars but generates config files from learned memories
- cli-continues: comprehensive cross-tool session handoff (14 tools, 182 paths)
- Copilot Memories (VS 2026): detects corrections → saves to copilot-instructions.md
- Claude Code Auto Dream: automated memory consolidation (prune/merge/resolve)
- Cursor REMOVED native memory in v2.1.x — opportunity for third-party tools

### Governance Space is Contested

- Qodo: $70M Series B (Mar 30), $120M total. Continuous Learning Rules System. Walmart, NVIDIA, Red Hat customers.
- Massu: Open-source governance platform. Session memory + rules + team sharing + rule packs. 72 MCP tools, 11 hooks. ~90% overlap with our original product vision.
- Delimit: Memory + governance + PR gates. 171 MCP tools. 10 stars.

### Funded Competition

- Qodo: $120M
- Mem0/OpenMemory: 51,565 stars, previously raised $24M
- xmemory: $4M pre-seed (March 2026)
- SuperMemory: $2.6-3M, SOC2/HIPAA, horizontal memory API (partner not competitor)
- Hindsight: 6,714 stars, 5 releases in March

---

## Verified Differentiators (After Exhaustive Check)


| #   | Differentiator                                          | Status               | Notes                                                                     |
| --- | ------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------- |
| 1   | Proactive team context sharing (path-scoped, cross-dev) | **UNIQUE**           | Nobody combines path-scoping + team sharing + proactive nudge             |
| 2   | Cross-dev reasoning visibility                          | **UNIQUE**           | Nobody has browsable cross-dev reasoning for humans                       |
| 3   | Generate context for specific area                      | **MOSTLY UNIQUE**    | No tool generates targeted docs from accumulated memories for a code area |
| 4   | Generate config from learned memories                   | **DIFFERENTIATOR**   | memories.sh (20 stars) does it but has no adoption. Still valuable.       |
| 5   | Correction-to-rule graduation (frequency-based)         | **PARTIALLY UNIQUE** | Copilot Memories does one-shot. Full frequency pipeline is novel.         |
| 6   | Token savings "recalls that replaced reads"             | **PARTIALLY UNIQUE** | Specific metric is novel. Others track savings broadly.                   |
| 7   | Smart recall (nudge vs dump)                            | **MILD**             | claude-mem dumps into system prompt. Our nudge is more token-efficient.   |


### Differentiators KILLED During This Session

- Path-scoped glob recall: claude-mem folder context files, HAM, CodeYam all have versions
- Hooks-driven adoption: claude-mem (5 hooks), Massu (11 hooks), ClawMem (7 hooks) shipped first
- Active session handoff: cli-continues does it comprehensively
- Structured memory layers: Massu is more structured than us

---

## Product Capabilities — 14 Total

### Table Stakes (must have, not differentiating)

1. **Automatic memory capture** — 3 hooks (PreToolUse, Stop, UserPromptSubmit). Auto-capture ON by default.
2. **Smart recall (nudge)** — Agent told memories exist, decides if relevant. Cheaper than dump.
3. **Path-scoped context** — Memories scoped to code paths with glob matching.
4. **Structured layers** — 4 types (preferences, technical, area_context, guidelines) with priority ordering.
5. **Cross-tool portability** — MCP + native config files for Claude Code, Cursor, etc.
6. **Privacy controls** — .aideignore, secret redaction, capture scope config.
7. **Memory management** — Manual trigger, built-in model identifies duplicates/stale/conflicts.

### Differentiators (why we exist)

1. **Generate config from learned memories** — `aide generate-rules` drafts CLAUDE.md/.cursorrules from most-recalled memories. Command-triggered, model-assisted.
2. **Generate context for specific area** — `aide generate-context src/path` produces readable doc from memories + developer input. Shared via repo files.
3. **Active session handoff** — Export active session state for continuing mid-task in another tool.
4. **Token savings tracking** — Measures "recalls that replaced reads." `aide stats --cost`.
5. **Proactive team context sharing** — Dev A's context for a code area available to Dev B's agent BEFORE they touch code. Strongest differentiator.
6. **Cross-dev reasoning visibility** — Browsable view of WHY teammates made decisions. For humans, not just agents.
7. **Correction-to-rule graduation** — Corrections recalled N times → proposed as rule → promoted to config files.

---

## Key Architecture Decisions

- **All reasoning uses the native model** — MCP tools do data retrieval (SQLite), agent does reasoning. Zero separate model. Zero extra API cost.
- **SQLite as internal engine** — Team-facing output is readable files (JSON, markdown) committed to repo. SQLite stays internal.
- **3 hooks for launch** — PreToolUse (nudge), Stop (prompt to remember), UserPromptSubmit (correction detection). PostToolUse/PreCompact/PostCompact are Phase 2+.
- **Command-triggered config generation** — `aide generate-rules`, not automatic background process. Model helps draft content.
- **Contributor field in free tier** — Costs nothing to store. Ready for team features on upgrade.
- **Status lifecycle simplified** — Active or deleted. No completed/archived complexity.
- **Source tagging simplified** — "model" (agent called aide_remember) vs "hook" (auto-captured).
- **FTS5 + embeddings** — Both. FTS5 for keyword matching, sqlite-vec for semantic similarity. One database, no external processes.
- **Store vs MD files** — Store is the brain (structured, queryable). MD files are projections (readable, native to each tool). One source, multiple outputs.

---

## Phases

### Phase 1: Individual Memory Engine

Ship the capture → store → recall loop. Table stakes to compete.

Includes: One-command install, auto capture (3 hooks on by default), smart recall (nudge), path-scoped context, 4 layers, CLI commands, search & browse, import, privacy basics, FTS5 + embeddings, Claude Code + Cursor support, contributor field, unlimited memories.

**What's already built:** SQLite store (20 tests), recall engine (18 tests), MCP server (5 tools), hooks (3), 47 tests passing.

**Estimate:** 4-6 weeks from existing codebase.

### Phase 2: Team Context — "My team's agents don't break each other's work"

The actual product. Where the genuine differentiators live.

Includes: Generate config from memories, generate context for area, team context via generated files, proactive cross-dev nudge, cross-dev reasoning visibility, token savings tracking, active session handoff, contributor tracking.

**Estimate:** 4-6 weeks after Phase 1.

### Phase 3: Governance — "Mistakes become rules"

Correction-to-rule graduation, rule promotion to config files, personalized instruction layer, rule effectiveness tracking, memory management.

**Estimate:** 6-8 weeks after Phase 2.

### Phase 4: Enterprise (build when customers ask)

Org/team/personal hierarchy, audit trail (EU AI Act), admin controls, SSO, advanced analytics.

---

## Pricing — Two Tiers


| Tier           | Price          | What's included                                                                                                                                                   |
| -------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Free**       | $0, unlimited  | All individual features (capture, recall, search, privacy, CLI, multi-tool, contributor field)                                                                    |
| **Team**       | $10/user/month | Generate config, generate area context, team sharing, cross-dev nudge, reasoning visibility, token tracking, session handoff, memory management, additional tools |
| **Enterprise** | Contact us     | Volume deals. Team features + SSO/audit/admin. Same per-seat or cheaper at scale.                                                                                 |


---

## Go/No-Go Decision

**Decision: Continue. But with clear eyes.**

**Why continue:**

- 2 genuinely unique differentiators (proactive team context, cross-dev reasoning) address a real, growing problem
- AI makes individual devs faster but teams worse at coordinating — this problem gets worse with adoption
- Existing codebase is solid foundation (47 tests, working hooks, path-scoped recall)
- User personally experiences the pain (prop example)

**Why it's risky:**

- Phase 1 is table stakes (not differentiating), must ship fast
- Solo developer against funded competition
- Market is moving fast — new tools every week
- Massu could add path-scoped team context

**The rule:** If Phase 1 ships and Phase 2 doesn't resonate with the team by week 14, move on.

---

## AIDE Naming

- **AIDE** = AI [D-word] [E-word] — expansion TBD. Must keep "AI" as literal letters.
- Options discussed: AI Decision Engine, AI Decision & Enforcement, AI Developer Ecosystems, AI Developer Experience
- "engram" name taken by Gentleman-Programming/engram (2,085 stars)
- Package: `aide-memory` (npm). CLI: `aide`. MCP tools: `aide_recall`, `aide_remember`, etc.

## Licensing

- **FSL (Functional Source License)** — anti-competition, no enterprise AGPL penalty, 2-year auto-convert to Apache 2.0
- Used by Sentry, GitButler, Liquibase

## Repo Strategy

- Single private repo (`aide-v0`) + public mirror (`aide-memory`) via file-copy GitHub Action on `oss-v`* tags
- Distribution: `npx aide-memory init` → npm global → Claude Code plugin → Cursor adapter → Smithery → git clone

