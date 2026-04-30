# Product Vision — AIDE Memory: Persistent Memory & Team Context for AI Coding Agents

> Product thesis: Individual memory as infrastructure, team context as the product.
> Created: Mar 10, 2026. Refactored: Mar 31, 2026. Rewritten: Apr 2, 2026 (naming finalized, capabilities expanded to 17, storage architecture redesigned, CLI/agent UX model clarified, install experience defined, monorepo support added). Updated: Apr 13, 2026 (hook system updated to 10 hooks with ID-based blocking, dynamic stop interval, settings framework, validation findings from Sessions A-F).
> Source: DIRECTION_MARCH31.md session findings, DIRECTION_CHAT.txt conversations, Apr 2 strategic session, MVP_IMPLEMENTATION.md, HOOKS_IMPLEMENTATION.md, PROTOTYPE.md, RESEARCH.md.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [The Problem](#the-problem)
3. [Competitive Landscape](#competitive-landscape)
4. [What We're Building — Product Capabilities](#what-were-building--product-capabilities)
5. [Phases](#phases) — Phase 0 (foundation), Phase 1 (individual memory), Phase 2 (team context), Phase 3 (governance), Phase 4 (enterprise)
6. [Pricing](#pricing)
7. [Architecture](#architecture)
8. [Validation & Testing](#validation--testing)
9. [Business Operations](#business-operations)
10. [Naming](#naming)
11. [Repo Strategy & Licensing](#repo-strategy--licensing)
12. [Future Expansion](#future-expansion-post-phase-4)
13. [Sources](#sources)

---

## Executive Summary

**Product thesis: Individual memory as infrastructure, team context as the product.**

AI coding agents make individual developers faster. They also make teams worse at coordinating. The informal knowledge transfer that held teams together -- Slack threads, pairing sessions, PR review comments, hallway conversations -- is being replaced by solo agent sessions. Each developer works in a private loop with their agent. Knowledge stays trapped in that loop.

The result is predictable. Dev A builds a component with a prop mapped to an API contract. Dev B's agent explores the component, doesn't understand *why* the prop is shaped that way, restructures it for "cleanliness," and breaks the API. The human-to-human communication that would have caught this never happened. "I'd rather tell a model than tell an engineer" is the new default -- and nothing catches the context that used to flow between engineers informally.

Memory-as-recall is commoditized. 30+ MCP memory servers launched in March 2026 alone. claude-mem has 43,856 stars. engram shipped 50 releases in a month. Mem0 has 51,565 stars and $24M in funding. Any developer can install individual memory in five minutes. That is not a product worth building.

What no tool does today: make one developer's context available to another developer's agent *before* damage is done. Not reactively in a PR comment. Not buried in a wiki. Proactively, scoped to the code path being touched, surfaced at the moment the agent reaches for the file.

**AIDE Memory** is a persistent memory and team context layer for AI coding agents. "AIDE" is the English word -- helper. No acronym expansion. AIDE is the brand. Memory is the first product. Future products could be AIDE Rules, AIDE Sync.

Phase 1 ships individual memory — not just table stakes, but a competitive product in its own right. The opportunity: claude-mem has reliability issues (worker crashes, session integrity bugs, heavy ChromaDB stack) and dumps all memories into system prompt (expensive). engram has no hooks — relies on agents voluntarily saving (our testing proved 0% voluntary usage). AIDE Memory competes on: better reliability (simpler architecture), better adoption (hooks drive 0%→100%), better token efficiency (nudge ~20 tokens, not dump ~2,000), and path scoping from day one. Phase 2 ships team context features — direction decided by what Phase 1 users actually ask for, not assumptions. The team thesis (proactive cross-dev context sharing) is genuinely novel but unvalidated. We build it when users signal demand.

17 capabilities total: 7 table stakes (auto-capture, smart recall, path scoping, structured layers, cross-tool portability, privacy, memory management) and 10 differentiators (config generation, area context generation, token tracking, proactive team sharing, cross-dev reasoning, correction graduation, import/search, session handoff, preset rule packs, tool onboarding frameworks).

Storage: one JSON file per memory in `.aide/memories/<layer>/`, committed to the repo. Git IS the sync -- no separate sync mechanism. Local SQLite is a cached index rebuilt from the JSON files (hash-based, skips rebuild when nothing changed). Post-checkout hook imports new/changed files by ID + timestamp (newer wins). Developers do nothing -- it is automatic.

Architecture: all reasoning uses the native model the developer is already running. MCP tools do data retrieval (SQLite queries). The agent does reasoning. Zero separate LLM. Zero extra API cost. No Docker, no cloud dependency, no API keys required.

CLI vs agent UX: agent chat (slash commands/skills) is the primary UX for intelligent operations (`/aide-rules`, `/aide-context`, `/aide-cleanup`). CLI is the fallback for non-agent contexts -- data display, template output, scripts, CI. There is no bridge between the CLI and a running agent; they are separate processes. Slash commands are just pre-built prompts.

Pricing: **Free** (generous, unlimited -- all individual features), **Team** ($10/user/month -- where the differentiators live), **Enterprise** (contact us -- volume deals with SSO/audit). FSL licensing -- anti-competition protection, enterprise-friendly, auto-converts to Apache 2.0 after two years.

The market is moving fast. claude-mem gained 7,000 stars in 15 days. Qodo raised $120M. Massu appeared with ~90% overlap to our original vision. But the market also rewards simplicity and quality over feature count — claude-mem has 44K stars with no path scoping, no config generation, no team features. memories.sh has path scoping + 8-tool config generation and only 20 stars. **Quality and distribution win, not features.** Ship Phase 1 fast, compete on reliability and efficiency, validate with real users before building more.

The name: **AIDE** -- the English word for helper. Not an acronym. Package: `aide-memory` (npm). CLI: `aide`. MCP tools: `aide_recall`, `aide_remember`, `aide_update`, `aide_forget`, `aide_search`, `aide_memories`, `aide_import`. Domain: `aide-memory.dev` or `useaide.dev` (aide.dev is taken by CodeStory IDE).

---

## The Problem

### The Core Problem

"Works on my machine" was Docker's problem. **"Works with my agent"** is the new one.

AI coding agents now write 35% more code than manual development. They also produce 30% more defects and 8x more duplication. But the deeper problem isn't code quality -- it's coordination. AI agents make individuals faster and teams worse at sharing context.

**The Copilot Paradox:** Google tested AI coding assistance with 96 engineers in a controlled study — the AI group was 21% faster on individual tasks. Then METR ran a study on real-world projects with 16 experienced open-source developers working on their own codebases — they were 19% slower. The individual gains get eaten by team overhead. Developers spend ~40% of their time on non-coding work. AI accelerates the coding part. The other 40% stays — or grows, because more code means more review, more integration, more things that can break. The constraint just moves: before AI, writing code was the bottleneck. After AI, the bottleneck is communication and coordination.

Before AI agents, teams coordinated through informal channels: pairing sessions, Slack threads, PR reviews, hallway conversations. These were inefficient but effective -- knowledge flowed between people as a side effect of collaboration. AI agents replace this with solo sessions. Each developer works in a private loop with their agent. The agent learns things about the codebase, makes decisions, writes code. None of that context is visible to the next developer's agent.

**The team problem is the real problem.** Dev A's agent learns that a prop is shaped to match an API contract. Dev B's agent has no idea. It explores the component, decides the prop structure is "messy," refactors it, and breaks the API. The context existed -- it just lived in Dev A's session and died when the conversation ended. By the time it surfaces in a PR comment, the damage is done.

### Pain Points

#### Team coordination problems (the product thesis)

**1. AI agents don't share context across developers.**
Dev A's agent learns something critical about a code area. Dev B's agent starts from zero on the same area an hour later. There is no mechanism for one developer's agent to inherit another's context. Every agent instance is an island. The knowledge gap between teammates *grows* with AI adoption, not shrinks.

**2. Context is shared reactively, not proactively.**
Team knowledge does eventually flow -- via PR comments, Slack messages, code review feedback. But it flows *after* the wrong code is written, *after* the CI breaks, *after* two hours of debugging. The value is context being available *before* another developer's agent touches the code. No tool delivers proactive cross-developer context.

**3. Cross-developer reasoning is invisible.**
Developer A made a deliberate architectural choice. Why? The reasoning lives in a closed chat session, or in their head, or nowhere. Developer B can see *what* was built but not *why*. Their agent optimizes for local correctness and violates the intent. There is no browsable view of teammates' reasoning -- not for humans, not for agents.

#### Individual memory problems (table stakes)

**4. Your agent doesn't learn you over time.**
You prefer 150-line component caps, composition over nested conditionals, reusable utilities over inline logic. You've told every agent this dozens of times. Next session, it generates a 400-line component with five levels of ternaries. Style resets completely between conversations -- there is no accumulation.

**5. Context compaction silently kills planning details.**
You and your agent spend 45 minutes building a detailed plan -- skeleton loading states, backward compatibility for the v1 API, progressive disclosure in the settings panel. The context window fills, compaction kicks in, and the agent "decides" to drop skeleton loading for spinners and remove the backward compat shim. It didn't disagree with the plan. It forgot the plan existed.

**6. Plan details are lost before coding starts.**
The agent agrees to a multi-step refactor. Step 1 goes fine. By step 3, it's re-exploring the codebase from scratch -- reading files it already analyzed, asking questions you already answered, proposing approaches you already rejected.

**7. Your agent doesn't proactively surface relevant context.**
You're building a new query endpoint. Buried in `src/legacy/flags.ts` is a feature flag system that gates query behavior for enterprise customers. Your agent doesn't mention it. You ship, break enterprise queries, and spend two hours debugging.

#### Operational problems (underserved)

**8. Config files go stale and developers don't bother setting up directory structures.**
`.cursorrules`, `CLAUDE.md`, `.windsurfrules` -- every tool has its config format. Developers write them once, maybe update them once more, then never touch them again. The files drift from reality. They capture rules from month one; by month four, half the rules are wrong or irrelevant. Nobody maintains them because nobody has time, and the cost of staleness is invisible until it causes a bug. Many developers don't even set up the project directory structure that would give their agent better context -- they don't create `.claude/rules/` files, don't organize CLAUDE.md by area, don't configure `.cursorrules` with path-specific rules. The activation energy is too high for something with invisible payoff. And for those developers who do set things up initially, ongoing maintenance just doesn't happen.

**9. Cost and rate limits force mid-task tool switching with no continuity.**
You're deep in a refactor on Claude Code. You hit the rate limit. You switch to Cursor to continue. Your context is gone. You re-explain the task, re-read the files, re-establish the plan. You've burned 20 minutes and hundreds of thousands of tokens reconstructing state that existed 30 seconds ago in another tool. The switch should be straightforward -- automatic (next tool reads your context on startup), or a simple export you paste in. Instead, it's a cold start every time.

**10. Guidelines that can't be linted exist in a dead zone.**
"Don't use `waitFor` in tests unless you genuinely need async resolution." "Prefer named exports over default exports." "Use composition over deep inheritance hierarchies." These are real guidelines that matter for quality and architecture. They can't be ESLint rules. They live in a wiki nobody reads, or in a config file the agent half-follows. There is no mechanism to surface the right guideline at the right moment -- scoped to the code the agent is about to touch, not dumped as a wall of text the agent ignores.

---

## Competitive Landscape

The agent memory space moved from "emerging" to "crowded" in March 2026. Individual memory is commoditized. Governance is contested and funded. Team context sharing remains unoccupied. Here is an honest assessment as of March 31, 2026.

### Major Competitors

#### claude-mem (thedotmack/claude-mem)

**Stats:** 43,856 GitHub stars (+7,156 in 15 days), v10.6.3, AGPL-3.0, free.

The distribution leader. Massive community traction. Progressive disclosure via 3-layer retrieval (compact index, timeline, full observations). Web viewer UI. Cursor adapter. Gemini CLI integration.

Recent developments: OpenClaw Gateway for multi-agent support with notifications. System prompt injection (dumps memories into system prompt via `before_prompt_build`). "RAD" (Real-Time Agent Data) -- positioning as an open standard for AI agent memory. Folder Context Files for per-directory scoping.

Weaknesses (VERIFIED from GitHub issues): 72% summary failure rate CONFIRMED (issue #1546 — 75/104 attempts failed in one day, still OPEN as of April 2). CLAUDE.md file pollution is the #1 user complaint (issues #609, #632, #641, #758 — 70+ combined reactions, creates files in EVERY directory). Process leaks consuming GBs of RAM (issue #701 — reported fixed, then regressed). Users removing plugin due to token cost (issue #1488 — switching to Claude's native Auto Dream). Windows chronic instability (13+ open issues). Can't cleanly uninstall (issue #781). Security audit rated HIGH risk — unauthenticated HTTP API on port 37777 (issue #1251). No structured memory layers. No governance pipeline. No team features. AGPL-3.0 kills enterprise adoption. Dumps all memories into system prompt rather than path-specific nudging. Users LOVE the concept but HATE the execution quality — massive adoption (45K stars) with real churn from reliability issues.

#### engram (Gentleman-Programming/engram)

**Stats:** 2,085 stars, 50 releases, Go single binary, MIT license, free.

Fastest shipper in the space. Supports 8 agents (Claude Code, Cursor, Windsurf, Gemini CLI, Codex, VS Code, OpenCode, Antigravity) -- broadest agent support. Full TUI. Topic key upsert for deduplication. SQLite + FTS5.

Weaknesses (VERIFIED from GitHub issues): Agents don't voluntarily use it — CONFIRMED as the #1 user complaint. Issue #87: Claude Code literally self-diagnosed the problem: "The tools are deferred... my trained behavior overrides the instruction... there's nothing in the tool flow that forces a pause." Three separate issues (#87, #124, #133) confirm agents don't call engram's tools unless explicitly asked. Issue #137 proposes making context loading mandatory — they're trying to solve the problem we already solved with hooks. Sub-agent infinite loops hanging sessions for 1+ hour (issue #128). Empty/ghost observations from MCP parameter mismatch (issue #132). Session count inflated 16,900% — background tasks counted as sessions (issue #116). Hook output leaking into terminal UI (issue #145). Windows Defender flags binary as Trojan (issue #93 — maintainer refuses to sign). No path scoping. No structured layers. No governance. Growth driven primarily by the Gentleman Programming YouTube community. NOT included in any major "best memory frameworks" roundup despite 2K+ stars.

#### Massu (massu-ai/massu)

**Stats:** OSS governance platform, BSL license.

The closest overlap to our original product vision -- approximately 90%. Session memory + rules + team sharing + curated rule packs (SOC2, React patterns). 72 MCP tools. 11 hooks. Structured memory layers.

This is the competitor that should concern us most architecturally. They have team sharing. They have hooks. They have governance via rule packs.

**How we differ from Massu:**

| Aspect | Massu | AIDE Memory |
|--------|-------|-------------|
| Team sharing mechanism | Unclear -- "shared memory across developers" with no documented path-scoping or proactive surfacing specifics | Memories ARE files in the repo. Git IS the sync. Automatic via post-checkout hook. Path-scoped, proactive nudge on file access. |
| Rule source | Static curated packs (SOC2, React) -- pre-written, not learned | Dynamic -- learned from accumulated corrections, frequency-based graduation. Also ships preset packs, but the pipeline from correction to rule is the differentiator. |
| Cross-dev reasoning | Not documented | Human-readable format with contributor, why field, browsable by humans and agents. Query filter: `contributor != me`. |
| Proactive cross-dev nudge | Not documented | PreToolUse hook includes teammate context for current path. Nudge, not dump -- agent told context exists, decides relevance. |
| MCP tools | 72 tools (bloat risk -- agent must choose among too many) | 7 focused MCP tools + CLI (agent reliability over feature count) |
| Human readability | Unclear -- likely internal DB only | One JSON file per memory, committed to repo, browsable in any editor |
| Storage architecture | Unclear | One file per memory in `.aide/memories/<layer>/`. Local SQLite is cached index. Git is the sync. No separate sync mechanism. |
| License | BSL (converts to Apache 2.0 in 2029) | FSL (auto-converts to Apache 2.0 after 2 years) |

**Honest gap:** We don't know exactly what Massu does for team sharing because their docs are vague. Our bet is that they DON'T do proactive path-scoped cross-dev nudging with human-readable reasoning. If they do, we need to reassess.

#### Qodo

**Stats:** $120M total funding ($70M Series B, March 30, 2026). Customers: Walmart, NVIDIA, Red Hat.

Continuous Learning Rules System -- auto-generates rules from code patterns and PR feedback. This is 80% of our Phase 3 governance vision, backed by $120M. Operates at the PR review layer (not in-session). Their governance is reactive (post-commit) rather than proactive (pre-touch).

#### Mem0 / OpenMemory

**Stats:** 51,565 GitHub stars. Previously raised $24M. Apache 2.0.

Multi-platform memory layer. Pricing: free tier (10K memories), $19/mo starter, $249/mo pro (knowledge graph paywalled). No path scoping. No team context. No governance.

#### Hindsight (vectorize-io/hindsight)

**Stats:** 6,714 GitHub stars, 5 releases in March. OSS, free.

Biomimetic 4-network memory architecture modeled on how human brains actually work (sensory, working, episodic, semantic). Short-term observations automatically consolidate into long-term semantic knowledge -- like how human memory works during sleep. PostgreSQL + pgvector backend. SOTA performance on LongMemEval benchmark. Fortune 500 production use reported. The most architecturally sophisticated memory system in the space, but targets general AI agents, not specifically coding agents. Moving into the developer tools market -- if they ship a coding agent adapter, they become a serious threat.

### Other Notable Tools


| Tool                           | What it does                                                                          | Traction                    |
| ------------------------------ | ------------------------------------------------------------------------------------- | --------------------------- |
| **memories.sh**                | Generates config files for 8+ tools from learned memories. Path scoping. Technically impressive. | 20 stars, ZERO external users (verified: 0 non-maintainer issues, npm downloads collapsed from 2,413 in Feb to 4 in April) |
| **cli-continues**              | Cross-tool session handoff -- continue mid-task in another tool                       | 14 tools, 182 paths         |
| **Copilot Memories** (VS 2026) | One-shot correction detection, saves to copilot-instructions.md                       | Platform-native             |
| **HAM**                        | Hierarchical directory-level CLAUDE.md distribution, claims 80% fewer tokens          | OSS                         |
| **Claude Code Auto Dream**     | Automated memory consolidation -- prunes stale, resolves contradictions, merges dupes | Platform-native             |
| **SuperMemory**                | Horizontal memory API, SOC2/HIPAA. Partner opportunity, not competitor                | $2.6-3M funded, 16.9K stars |
| **Delimit**                    | Memory + governance + PR gates. 171 MCP tools. Narrow governance (OpenAPI diffing)    | 10 stars                    |
| **omem**                       | Team sharing via Spaces                                                               | OSS                         |


### Platform-Native Memory Status


| Platform             | Status                                                                                                                                                                                          | Assessment                                               |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **Claude Code**      | Auto Dream ships memory consolidation. Path-scoped instructions via `.claude/rules/` frontmatter. But learned memories are per-repo, not per-path. Managed policy CLAUDE.md for org governance. | Partial. Scoping gap on learned memories is our opening. |
| **Cursor**           | Removed native memory in v2.1.x. Community fills gap with Memory Bank pattern and third-party tools.                                                                                            | Opportunity. No native memory = need for third-party.    |
| **Copilot**          | Memories feature in VS 2026 detects one-shot corrections. Fundamentally stateless.                                                                                                              | Minimal. One-shot, not accumulated.                      |
| **Windsurf Cascade** | Best auto-capture of native options. Complete black box -- can't see, correct, or export memories.                                                                                              | Locked in. Proprietary, workspace-bound.                 |


### Gap Analysis


| Capability                   | claude-mem           | engram                | Massu            | Qodo                      | Mem0         | Hindsight         | Delimit           | omem         | **AIDE Memory**                     |
| ---------------------------- | -------------------- | --------------------- | ---------------- | ------------------------- | ------------ | ----------------- | ----------------- | ------------ | ----------------------------------- |
| Path scoping                 | Folder Context Files | None                  | Unknown          | N/A (PR-level)            | None         | Bank scoping      | None              | None         | **Glob inheritance**                |
| Team sharing                 | None                 | None                  | Yes (rule packs) | Yes (PR-based)            | None         | None              | None              | Yes (Spaces) | **Yes (proactive, path-scoped)**    |
| Proactive cross-dev nudge    | None                 | None                  | Not documented   | None                      | None         | None              | None              | None         | **PreToolUse hook, path-scoped**    |
| Cross-dev reasoning          | None                 | None                  | Not documented   | None                      | None         | None              | None              | None         | **Human-readable, browsable**       |
| Hooks                        | 5 hooks              | None                  | 11 hooks         | N/A                       | None         | None              | None              | None         | **10 hooks (launch)**               |
| Governance                   | None                 | None                  | Rule packs       | Continuous Learning Rules | None         | None              | PR gates (narrow) | None         | **Correction graduation (Phase 3)** |
| Auto-capture                 | Yes (AI compression) | None (voluntary only) | Yes              | Yes (PR-based)            | Medium       | High (biomimetic) | Unknown           | Unknown      | **Yes (hooks, dual-mode)**          |
| Config generation            | None                 | None                  | None             | None                      | None         | None              | None              | None         | **From learned memories**           |
| Memory-as-files (git sync)   | None                 | None                  | None             | None                      | None         | None              | None              | None         | **One file per memory, git sync**   |
| License                      | AGPL-3.0             | MIT                   | BSL              | Proprietary               | Apache 2.0   | OSS               | Unknown           | OSS          | **FSL**                             |
| Pricing                      | Free                 | Free                  | Free (OSS)       | Enterprise                | Free-$249/mo | Free              | Free+Pro          | Free         | **Free + Team $10/user**            |


### What's Commoditized (not worth competing on alone)

- **Individual memory recall** -- 30+ MCP servers, all free, all adequate.
- **Path/file scoping** -- claude-mem Folder Context Files, HAM, CodeYam, agent-memory-mcp, Hindsight bank scoping. At least 5 tools have some version.
- **Hooks-driven capture** -- claude-mem (5), Massu (11), ClawMem (7), AIDE Memory (9). Table stakes.
- **Auto-capture and compression** -- claude-mem's AI compression, Hindsight's biomimetic consolidation, Claude Auto Dream.

### What's Contested (well-funded competition)

- **Governance** -- Qodo ($120M, Walmart/NVIDIA/Red Hat) does PR-based rule generation. Massu does session-based rules + rule packs. Delimit does narrow API contract governance. The governance lane has real competition and real money.

### What's Unoccupied (our reason to exist)

- **Proactive cross-developer team context** -- Dev A's context for a code area available to Dev B's agent *before* they touch the code, scoped to the path, surfaced as a nudge. Nobody combines path-scoping + cross-dev sharing + proactive surfacing.
- **Cross-developer reasoning visibility** -- A browsable view of *why* teammates made decisions, readable by humans and agents alike. No tool exposes cross-dev reasoning for human consumption.
- **Frequency-based correction graduation** -- Corrections recalled N times automatically proposed as rules, promoted to config files. Copilot Memories does one-shot detection. The full frequency-based pipeline is novel.

### Honest Assessment

Individual memory is a prerequisite, not a product. Phase 1 ships table stakes -- we must match claude-mem and engram on recall quality and capture reliability, but we will not out-star them on GitHub and should not try.

The product is Phase 2: team context. The market position is narrow but genuine. Nobody combines proactive cross-dev context with path-scoped delivery. The risk is that Massu or Qodo adds this capability -- Massu is architecturally closest, Qodo has the funding. The window is 2-3 months.

---


---

## What We're Building -- Product Capabilities

17 capabilities organized by what the developer experiences, not by technical category. Every capability that requires reasoning uses the native model the developer is already running -- MCP tools do data retrieval (SQLite queries), the agent does reasoning. Zero extra API cost. One binary with license check — free and pro use the same installation, pro unlocked via license key.

**Free vs Pro at a glance:**

| Action | Free | Pro ($10/user/mo) |
|--------|------|-----|
| Store memories | Yes (with contributor field) | Same |
| Recall | YOUR memories only | All contributors, intelligently ranked |
| Search | YOUR memories only | All contributors |
| Update/delete | YOUR memories only | YOUR memories only |
| Flag as outdated | YOUR memories only | Any memory |
| Import teammate memories | No (post-checkout skips) | Yes (auto on pull) |
| Export | YOUR memories only | All |
| Config generation | No | Yes (slash command + CLI) |
| Cleanup intelligence | No | Yes (model-assisted + CI) |
| Slash commands | No | Yes (/aide-rules, /aide-context, /aide-cleanup) |
| Pre-set packs | No | Yes |
| Privacy controls (.aideignore, redaction) | No | Yes |
| Analytics | Basic (count, last recalled) | Full (patterns, health, team) |
| Session handoff | No | Yes |
| Additional tools beyond CC + Cursor | No | Yes |

**Gating approach:** Layered soft gates in the compiled MCP binary. Data (JSON files) is accessible to anyone. Intelligence (scoring, ranking, cross-contributor analysis, config formatting) is in the binary. Gate the intelligence, not the data. Accept ~1-5% bypass rate. Compete on convenience for the 95%.

Storage: one JSON file per memory (UUID filename) in `.aide/memories/<layer>/`. Local SQLite is a cached index rebuilt from these JSON files (hash-based cache -- skips rebuild when nothing changed). Since memories ARE files in the repo, git IS the sync mechanism. No separate sync command, no shared database, no server infrastructure.

Primary UX: agent chat via slash commands/skills (`/aide-rules`, `/aide-context`, `/aide-cleanup`). These are pre-built prompts -- the model calls MCP tools, gets data, formats output. CLI is the fallback for non-agent contexts (data display, template output, scripts, CI). There is no bridge between the CLI and a running agent; they are separate processes.

---

### Table Stakes -- My Agent Remembers What I Taught It

These 7 capabilities are baseline expectations. Without them we do not get evaluated. They are not differentiating -- claude-mem, engram, and 30+ other MCP memory servers have versions of most of them. We must ship them fast as infrastructure for the features that actually matter.

---

#### 1. Automatic memory capture — FREE

**Problem it solves:** Agents never voluntarily save context. Tested: 0/10 prompts resulted in voluntary aide_remember calls when the tool was simply available.

10 hooks ship on by default -- no developer action required to start accumulating useful memories:

- **SessionStart** -- fires at session start. Auto-injects preferences + guidelines + `priority: 'always'` memories (~300 tokens) so the agent has style context from the first prompt. Writes injected memory IDs to session tracking file. Clears tracking on resume/compact/clear for a clean slate.
- **PreToolUse (Read)** -- fires before the agent reads a file. ID-based blocking: checks scoped memory IDs against the session's tracked IDs. BLOCK if unseen IDs exist for a new file (forces recall before proceeding). SOFT if the path has been encountered but has unrecalled IDs. SILENT if all scoped IDs are already covered or no scoped memories exist. Includes layer counts and topic summaries in nudge output.
- **PreToolUse (Edit/Write)** -- fires before the agent edits or writes a file. Same ID-based blocking logic as Read.
- **PreToolUse (Grep/Glob)** -- fires before the agent searches files. Always soft nudge, never blocks. Agent decides whether to call `aide_search`.
- **UserPromptSubmit** -- soft-only correction detection with negative filters (ignores questions, acknowledgments, short responses) and 3-word minimum. Flags the correction for the Stop hook to enforce.
- **Stop** -- dynamic interval: blocks every 3 turns for the first 9 turns, every 5 for turns 10-29, every 10 after turn 30. SILENT between block intervals. Correction flag from UserPromptSubmit always overrides the interval (forces immediate block). Prompts agent to remember session discoveries.
- **PreCompact** -- cleanup-only. Clears the session's recalled-paths tracking file so paths can be re-recalled after compaction. Cannot force agent tool calls (Claude Code architectural limitation -- PreCompact output is not reliably consumed by the agent).
- **PreToolUse (aide_recall)** -- passthrough tracking. Records that a recall is in progress.
- **PostToolUse (aide_recall)** -- passthrough tracking. Parses returned memory IDs from MCP response and writes them to session tracking. Supports `ids` parameter for gap-filling specific memories.
- **PostToolUse (aide_remember)** -- passthrough tracking. Confirms storage.
- **PostToolUse (aide_search)** -- passthrough tracking.

All hooks are shell scripts in `scripts/hooks/`, tool-agnostic, with separate configs per tool. Session-scoped tracking via `session_id` ensures concurrent sessions don't interfere. Auto-capture is ON by default. Developers who find the nudge noisy can disable individual hooks via `aide config nudge off`.

**ID-based blocking:** Hooks track which memory IDs the agent has already seen (via session tracking file). When the agent touches a file, the hook checks whether scoped memory IDs for that path are already in the tracking file. If unseen IDs exist and the path is new, the hook BLOCKs (forces recall). If the path was encountered but has gaps, the hook returns a SOFT nudge. If all IDs are covered, the hook is SILENT. This prevents redundant blocking while ensuring new context is always surfaced. Scope depth minimum (MIN_SCOPE_DEPTH=2) prevents overly broad scopes from triggering blocks.

**Focused scope matching:** Recall matches immediate parent and one level above only -- no grandparent scopes. This keeps recalled context tightly relevant to the file being touched.

**Round-robin layer diversity:** Within the recall limit (minimum limit=5 for swapping), memories are distributed across layers using round-robin selection to prevent any single layer from dominating results.

**Hidden nudging:** The memory management prompts ("anything worth remembering?") are injected via `additionalContext` -- invisible in the terminal. The developer sees only the agent's actual response, not the memory management happening behind the scenes. The agent's decision to store or skip is silent.

**Model auto-assigns metadata:** When storing a memory, the model assigns layer, tags (from a configurable preset list), and shared/private classification based on content analysis. The developer never manually categorizes unless overriding.

Every memory is tagged with its source (`source:hook` or `source:model`) so we can measure which capture approach produces memories that actually get recalled. Data-driven, not guessing.

---

#### 2. Smart recall -- nudge, not dump — FREE (your memories) / PRO (all contributors)

**Problem it solves:** claude-mem dumps all memories into the system prompt. This wastes context window on irrelevant memories and burns tokens.

AIDE Memory tells the agent memories exist for the current path and lets the agent decide whether they are relevant to the current task. The agent pulls what it needs, ignores what it does not.

- PreToolUse hook returns a one-line nudge (~20 tokens): "8 memories exist for src/checkout/**. Call aide_recall if relevant."
- Agent evaluates: are these memories useful for what I am doing right now?
- If yes: calls `aide_recall(path)` and gets specific, structured memories
- If no: proceeds without pulling anything -- zero wasted context

Three retrieval strategies compared:


| Strategy                             | Context cost             | Coverage     | Default |
| ------------------------------------ | ------------------------ | ------------ | ------- |
| Tools only (agent calls voluntarily) | Zero until needed        | 75% (tested) | No      |
| **Nudge (our approach)**             | **~20 tokens per Read**  | **~100%**    | **Yes** |
| Dump (inject all matching)           | High (up to 20 memories) | 100%         | No      |


The nudge approach is the sweet spot: near-100% coverage at near-zero cost.

**Flexible recall beyond path:** The model makes different types of recall calls depending on what it needs:
- `aide_recall(path)` -- path-scoped recall (default, triggered by nudge)
- `aide_search(query, mode)` -- keyword, semantic, or auto (default) search for concept queries ("what do we know about caching?")
- `aide_recall(path, contributor)` -- "what did Dev A decide about this area?"
- Combined queries -- the model decides which type of call based on context, not limited to just path scoping

---

#### 3. Path-scoped context — FREE

**Problem it solves:** A memory about test utilities and a memory about database migrations should not sit in the same flat bucket. Large codebases have distinct areas with distinct context.

Memories are scoped to code paths using glob patterns. A memory scoped to `src/checkout/**` surfaces when the agent reads `src/checkout/hooks/useCart.ts`. Parent scopes inherit down: a memory at `src/**` is available everywhere under `src/`.

- Direct match via SQL lookup on file path -- deterministic, sub-millisecond
- Parent inheritance: `src/**` memories surface for `src/checkout/CartSummary.tsx`
- FTS5 keyword search as secondary path (BM25 ranking, cross-cutting queries)
- Semantic search via sqlite-vec embeddings as fallback (cosine similarity, local model, no API calls)

Hierarchy is tried in order: direct match (cheapest) then FTS5 then semantic (fallback). Same query always returns same results at the SQL level.

**Monorepo support:** Hierarchical `.aide/` directories, cascading like `.eslintrc`. One SQLite index per `.aide/` directory. The PreToolUse hook walks up the directory tree to find all relevant `.aide/` directories -- memories from parent `.aide/` directories cascade into child packages. A memory at the repo root's `.aide/` applies everywhere; a memory in `packages/auth/.aide/` applies only to that package and its children.

---

#### 4. Structured layers — FREE

**Problem it solves:** A style preference ("keep files under 150 lines") is fundamentally different from an architectural decision ("Apollo needs useGraphQLGateway: true"). Flat "observation" stores conflate these.

Four fixed memory layers, each with different retrieval priority:


| Layer            | What it captures                                       | Example                                                         | Scope                |
| ---------------- | ------------------------------------------------------ | --------------------------------------------------------------- | -------------------- |
| **Preferences**  | How a developer likes to work                          | "Under 150 lines per file, split even if used once"             | Flows with code area |
| **Technical**    | Stack/integration facts not obvious from code          | "Apollo needs `useGraphQLGateway: true`"                        | Project or area      |
| **Area Context** | Decisions for a specific area -- active and historical | "Skeleton loading replaces ALL legacy loaders"                  | Package/feature      |
| **Guidelines**   | Team/project principles                                | "Don't use `waitFor` unless async state is genuinely uncertain" | Project-wide         |


When an agent opens `src/checkout/CartSummary.tsx`, recalled memories are ranked with two signals: **scope-first ranking** (file/directory-scoped memories rank above project-wide memories as the primary signal) and **round-robin layer representation** across layers to prevent any single layer from dominating results (layer starvation prevention). The agent gets a balanced mix of area context, technical context, preferences, and guidelines, with the most path-relevant memories first.

**Directory query inversion:** When recalling for a directory path (vs. a specific file), the ranking inverts -- broader scopes rank first, specific scopes rank lower. This reflects the intent: a directory query seeks the big picture, while a file query seeks precise context.

**Sub-types via tags, not sub-layers:** The four layers are fixed. Sub-types are handled through tags from a configurable preset list: `architecture`, `testing`, `security`, `style`, `performance`, `api-contracts`, etc. Tags are used for filtering, search, and config generation -- not for recall priority. `aide config tags.add "custom-tag"` adds project-specific tags. For example, architecture practices (SOLID principles, clean architecture patterns, composition over inheritance) would be `guidelines` layer with `architecture` tag. This addresses the "bad architecture from AI agents" problem without inflating the layer count. See also: pre-set rule packs (capability #16).

---

#### 5. Cross-tool portability — FREE (CC + Cursor) / PRO (additional tools)

**Problem it solves:** Knowledge built in Claude Code is invisible to Cursor, and vice versa. Switching tools means starting from zero.

AIDE Memory works via MCP (the protocol Claude Code, Cursor, Windsurf, and Cline all speak) plus native config file generation for tools that read their own formats.

- **MCP server** -- 7 tools (~1,400 tokens to load, 38x smaller than GitHub MCP's 54K). Works in any MCP-compatible client. Tools: `aide_recall`, `aide_remember`, `aide_update`, `aide_forget`, `aide_memories`, `aide_import`, `aide_search`.
- **CLI commands** -- `aide recall`, `aide remember`, `aide search`, `aide list`. First-class alternatives to every MCP tool. Gives debuggability, composability, and fallback for non-MCP tools. CLI is the fallback for non-agent contexts -- there is no bridge between the CLI and a running agent.
- **Native config generation** -- generates CLAUDE.md, .cursorrules, copilot-instructions.md from the same store. Each tool reads its own format natively. No MCP needed for consumption.

The hot path (recall on file read) bypasses MCP entirely -- the PreToolUse hook queries SQLite directly. MCP matters for write operations and portability. CLI matters for debugging and non-MCP tools.

---

#### 6. Privacy controls — PRO

**Problem it solves:** Auto-capture hooks see Bash stdout, Write contents, Edit diffs. Secrets can leak into the memory store if nothing prevents it.

Privacy ships alongside capture, not as an afterthought.

- **.aideignore** -- gitignore-style patterns. Smart defaults: `.env*`, `*.pem`, `*.key`, `**/secrets/**`. Hooks skip processing for ignored paths entirely.
- **Secret redaction** -- regex-based `redact()` function applied before storage. Catches API keys, tokens, passwords, private keys. Applied to all storage paths (manual and auto-capture).
- **Configurable capture scope** -- developers define which tool types trigger capture via `aide config capture-tools read,edit` (default: read only).
- **Source tagging** -- every memory tagged with how it was captured, enabling full audit of what was stored and why.
- **Preferences privacy** -- `preferences/personal/` is gitignored by default. `preferences/shared/` is tracked. Developers control which preferences are team-visible.

---

#### 7. Memory management — PRO (intelligent cleanup) / FREE (manual delete)

**Problem it solves:** After weeks of use, memory stores accumulate duplicates, stale context, and contradictions. An early decision about X conflicts with a later decision about Y. The agent gets conflicting signals.

Two modes of cleanup, for different contexts:

**Manual cleanup (model-assisted):** `aide cleanup` or `/aide-cleanup` slash command triggers a management pass using the developer's already-running agent. No separate model, no background process, no extra API cost.

- **Duplicate detection** -- SQL self-join on content similarity and scope overlap. Presents candidates for merge or removal.
- **Stale detection** -- identifies memories with `recalled_count = 0` after 30+ days. Candidates for archival.
- **Conflict flagging** -- finds memories with overlapping scope and contradictory content. Agent presents both and asks which to keep.
- **Status lifecycle** -- simplified to Active or Deleted. No completed/archived complexity.

The MCP tool returns structured data (candidate lists, conflict pairs). The agent does the reasoning (presenting options, formatting recommendations). The developer approves.

**CI pipeline cleanup (no model):** `aide cleanup --ci` runs in CI/merge pipelines. SQL-based and template-based -- no model needed, deterministic. Identifies exact duplicates, orphaned memories (referenced paths no longer exist), and memories past a configurable staleness threshold. Output is a report or auto-fix depending on configuration.

**Stale context detection** (Phase 2): when the agent edits code that contradicts an existing memory or context doc, flag it for human review. Detection only, not auto-update (too risky). PostToolUse hook can detect: "agent edited `src/auth/middleware.ts` but existing context describes old behavior."

**Ownership model:** Each developer owns their memories. They can edit/delete their own. They can tag anyone's memory as outdated (soft flag, not delete). Orphaned memories (author left the team) are adoptable by a team admin.

---

### Differentiators -- My Team's Agents Don't Break Each Other's Work

These 10 capabilities are why AIDE Memory exists. Individual memory is infrastructure. Team context is the product. The two genuinely unique differentiators (#11 and #12) are in this section -- nobody combines path-scoped architecture + cross-developer sharing + proactive hooks + human-readable format.

**Important design note:** Capabilities #9 (generate context), #11 (proactive team sharing), and #12 (cross-dev reasoning visibility) are not separate systems. They are views and queries on the SAME memory store. The memory store is one thing. Generate-context is a refined projection for handoff/onboarding. Team sharing is the automatic mechanism (memories as files, git as sync). Reasoning visibility is a query filter (`contributor != me`, show `why` field). One system, multiple access patterns.

---

#### 8. Generate config from learned memories — PRO

**Problem it solves:** Developers write CLAUDE.md and .cursorrules manually. These files go stale within weeks. Nobody sets up directory structures (`.claude/rules/`) because the activation energy is too high. No tool auto-generates config files from memories the agent actually learned during sessions.

**Primary UX: slash command in agent chat.** `/aide-rules` or `aide generate-rules` via slash command. The model calls the MCP tool, gets data (most-recalled memories), formats it into the target config format. The agent does the reasoning and formatting -- the MCP tool just provides the data.

**CLI fallback:** `aide generate-rules --claude` for non-agent contexts. Template-based output -- no model needed. Less intelligent than the slash command path but works in scripts, CI, and when no agent is running.

How it works:

- Queries the store for memories with highest `recalled_count` -- these are the ones the agent actually used, not noise
- In agent mode: returns structured data to the agent, which formats it into the target config format (CLAUDE.md, .cursorrules, copilot-instructions.md)
- In CLI mode: applies templates to produce formatted output
- Uses sectioned ownership markers -- human-authored content is never touched:
  ```
  ## Project Guidelines (human-authored -- never touched)
  ...
  ## Recalled Context (auto-generated by aide)
  <!-- aide:sync - Do not edit below this line -->
  - Use datetime() for SQLite dates
  <!-- aide:sync-end -->
  ```
- Easy commands per tool: `aide generate-rules --claude`, `aide generate-rules --cursor`, `aide generate-rules --copilot`, `aide generate-rules --all`
- **Team config:** `aide generate-rules --team` generates shared config for the whole team, combining the most-recalled memories across all contributors
- **Detect existing configs:** if the repo already has a shared `.cursorrules` or `CLAUDE.md`, the system detects it, updates only the aide-managed section (ownership markers), and never removes human-authored content
- **Create if missing:** if no config exists for a supported tool, offer to create one
- **Full directory structure support:** not just the main MD file -- generate path-scoped rule files in directory structures:
  ```
  .claude/
  ├── rules/
  │   ├── testing.md        # Generated: test conventions from memories
  │   ├── architecture.md   # Generated: architectural patterns (guidelines + architecture tag)
  │   └── style.md          # Generated: style preferences
  └── CLAUDE.md             # Main project context
  ```

**Competitive note:** memories.sh (20 stars, no adoption) does something similar. The feature is easy to build. Its value comes from the accumulated memories being high quality (thanks to hooks-driven capture and path scoping), not from the generation step itself.

---

#### 9. Generate & browse area context — PRO

**Problem it solves:** You built a complex feature. A teammate (or their agent) is about to touch it. There is no way to give them structured context about WHY it works the way it does, beyond hoping they read the code carefully.

**Primary UX: slash command.** `/aide-context src/components/DataTable` in agent chat. The model calls the MCP tool to pull memories for the path, formats them into a readable document. CLI fallback: `aide generate-context src/components/DataTable` with template-based output.

`aide generate-context src/components/DataTable` produces a readable document from accumulated memories + optional developer annotations about that code area.

- Pulls all memories scoped to the target path and its children
- Developer can add annotations: `aide annotate src/components/DataTable "The sort prop matches the API contract exactly -- do not restructure"`
- Agent formats into a readable markdown document with sections: decisions, constraints, patterns, known issues
- Output goes to `.aide/context/components-DataTable.md` -- committed to the repo, readable by any agent without MCP
- Enriched over time as more memories accumulate across sessions and developers

This capability IS the mechanism for refined team sharing and handoff/onboarding. Dev A generates context about what they built. Dev B's agent reads it when it touches that code area. But note: primary team sharing is automatic (capability #11 -- memories as files, git as sync). Generate-context is the refined projection for structured handoff, not the primary sharing mechanism.

---

#### 10. Token savings tracking — PRO (needs validation)

**Problem it solves:** Developers want to know if this tool is actually saving them time and money. Vague claims about "token savings" are not credible.

AIDE Memory measures one concrete, directly observable event: **recalls that replaced reads**. The agent was nudged about a file, recalled memories, and then did NOT read the file. That file read did not happen. The tokens are measurable.

- Hooks log file read events across sessions (background math, no LLM needed)
- `aide stats --cost` shows: files where memories were recalled and the file was not subsequently read
- Per-session and cumulative tracking
- No counterfactual claims -- we do not pretend to know what the agent "would have done"

**What we do NOT do:** claim "we saved you X tokens" based on hypotheticals. The metric is honest: here are the reads that did not happen because the agent had what it needed from memory.

**MARKED AS NEEDS VALIDATION.** This capability is a "maybe" -- we need to verify that the "recalls that replaced reads" metric is close to 100% accurate and actually useful before shipping it as a feature. The agent might have used current context instead of re-reading regardless. Prioritize honesty over impressive-looking numbers. Only ship if the metric is close to 100% accurate. If it is not, do not ship it -- a misleading metric is worse than no metric.

---

#### 11. Proactive team context sharing — PRO

**Problem it solves:** You built a component with a prop designed to match an API contract. A teammate's agent explored it, did not understand WHY, and restructured the prop, breaking the API. The human-to-human communication that would have caught this never happened because "I'd rather tell a model than tell an engineer."

**This is the strongest differentiator. Nobody combines path-scoped architecture + cross-developer sharing + proactive nudge.**

**The mechanism is AUTOMATIC through shared memory files in the repo.** Memories ARE files. Git IS the sync. This is not a manual export. Developers accumulate memories during normal work. Those memories are JSON files in `.aide/memories/<layer>/`. The tracked directories (`technical/`, `area_context/`, `guidelines/`, `preferences/shared/`) are committed to the repo. When a teammate pulls, the post-checkout hook imports new/changed files into their local SQLite index by ID + timestamp (newer wins). No action required from either developer.

How the proactive nudge works:

- Dev A accumulates memories while working on `src/checkout/**`. The memories are automatically committed as JSON files in `.aide/memories/area_context/` (or appropriate layer).
- Dev B pulls. Post-checkout hook updates their local SQLite index.
- Dev B's agent opens `src/checkout/CartSummary.tsx`. PreToolUse hook fires.
- Hook includes: "12 memories exist for src/checkout, including 4 from Dev A. Call aide_recall for details."
- Dev B's agent recalls the context BEFORE making changes, not after breaking something.

Generate-context (capability #9) produces REFINED handoff/onboarding documents from the same memory store. But the primary sharing mechanism is the memory files themselves -- no generation step required for basic team context to flow.

**Ownership model:** Each developer owns their memories (identified by contributor field). They can only edit/delete their own. They can tag anyone's memory as outdated (soft flag for the owner to review). Orphaned memories (author left the team) are adoptable by a team admin.

---

#### 12. Cross-developer reasoning visibility — PRO

**Problem it solves:** AI makes individuals faster but teams worse at coordinating. The informal knowledge transfer -- Slack threads, pairing sessions, PR reviews -- gets replaced by solo agent sessions. Nobody sees WHY their teammates made decisions.

A query filter on the shared memory store. Not a separate system.

- `aide_recall(path, contributor != me)` -- "what did my teammates decide about this area?"
- Each memory includes: what was decided, `why` field (reasoning), who (contributor), when, which path it applies to
- The `why` field is the key -- it is stored at capture time, not reconstructed later
- Humans browse `.aide/memories/` files directly (JSON, human-readable) or use `aide list --contributor <name> --scope src/auth/**` to filter
- Generate-context (capability #9) produces formatted markdown from these same memories -- organized by code area, not by person or date
- Agents read memories as part of the recall flow -- reasoning context informs their approach

This is not a chat log or an activity feed. It is structured reasoning organized by the code it applies to. The format is human-readable JSON committed to the repo -- browsable in any editor, any tool, any review process.

---

#### 13. Correction-to-rule graduation — PRO

**Problem it solves:** You correct your agent: "don't use waitFor in tests unless you genuinely need async resolution." Three weeks later, a teammate's agent makes the same mistake. The correction was stored once in your memory. It was never promoted to a rule that all agents follow.

Corrections recalled N times, or corrected independently by multiple developers, get proposed as rules and promoted to config files. A frequency-based pipeline from observed behavior to enforced standard.

- Correction detected via two-phase flow: UserPromptSubmit detects and flags the correction (soft-only, with negative filters + 3-word minimum), Stop hook enforces storage (correction flag overrides the dynamic interval, forcing an immediate block). Stored with `source:hook` tag
- System tracks `recalled_count` and unique contributor count per correction
- When a threshold is crossed (e.g., recalled 5+ times, or corrected by 3+ developers): proposed as a candidate rule
- Developer reviews and approves. Agent formats into the appropriate config file section.
- Rule now appears in CLAUDE.md/.cursorrules -- enforced across tools, not just remembered by one agent

**Competitive note:** Copilot Memories (VS 2026) does one-shot correction detection -- saves the correction to copilot-instructions.md immediately. AIDE Memory's frequency-based pipeline is different: it waits for signal (multiple recalls or multiple developers) before proposing graduation. One-shot saves noise. Frequency saves signal. This is partially unique -- the one-shot part is commoditized, the frequency-based pipeline is novel.

---

#### 14. Import and search — FREE (search your memories) / PRO (import from other tools)

**Problem it solves:** Developers already have context scattered across tools -- CLAUDE.md, MEMORY.md, .cursorrules, Notion docs, team wikis. Starting from zero is not acceptable. And once memories accumulate, developers need to find and browse them.

- **Import:** `aide import` reads from existing memory sources -- CLAUDE.md, MEMORY.md, .cursorrules, copilot-instructions.md, JSON exports from other tools. Memories are tagged with `source:import` and scoped based on content analysis.
- **Search:** `aide search "authentication flow"` supports three modes via `mode` parameter: `keyword` (FTS5/BM25), `semantic` (embedding cosine similarity), or `auto` (default -- tries keyword first, falls back to semantic). Cross-cutting queries across all layers and scopes.
- **Browse:** `aide list` shows all memories, filterable by scope, layer, contributor, source, and recency. `aide list --scope src/auth/**` narrows to a specific area.
- **Stats:** `aide stats` shows memory count by layer, most-recalled memories, stale candidates, capture source breakdown.

---

#### 15. Active session handoff — PRO

**Problem it solves:** You hit rate limits on Claude Code mid-task. You switch to Cursor. Your current task context -- which files you read, your plan, what's done, what's pending -- is gone.

Export active session state so you can continue mid-task in another tool or another session. Mid-task tool switching when rate limited should be straightforward, not a cold start.

- **Automatic:** Next tool reads `.aide/session-state.json` on startup (best UX, needs hooks in both tools)
- **Command:** `aide export-session` outputs structured context including files touched, current plan, and progress
- **Copy-paste:** `aide export-session --clipboard` copies to clipboard for pasting into any tool
- All three methods should exist. Automatic is the default, others are fallbacks.

---

#### 16. Pre-set rule packs — PRO

**Problem it solves:** New projects start with zero context. Developers who want SOLID principles, clean architecture patterns, or framework-specific best practices have to write all their guidelines from scratch. Agents optimize for completing tasks while violating structural principles -- there is no mechanism to give them architectural awareness from day one.

Two things here:

1. **Architecture/clean code guidelines layer** -- a sub-type of guidelines (using the `architecture` tag) for architectural best practices: SOLID principles, composition over inheritance, separation of concerns, clean architecture patterns. Helps agents avoid the "bad architecture" problem where they optimize for local correctness while violating structural principles. These are `guidelines` layer memories with `architecture` tag, recalled alongside other guidelines when the agent touches relevant code.

2. **Importable preset packs** -- curated sets of memories/guidelines importable into any project:
   - `aide import --pack solid-react-ts` loads ~20 guideline memories for SOLID principles in React/TS projects
   - `aide import --pack clean-architecture` loads architectural pattern guidelines
   - Ship with 2-3 built-in packs. Community packs later.
   - A pack is a set of JSON files in the same format as the memory store -- nothing special, just pre-populated memories dropped into `.aide/memories/guidelines/`.

---

#### 17. Tool onboarding frameworks — INTERNAL (not user-facing)

**Problem it solves:** Adding support for a new AI coding tool should be a one-day effort, not a multi-week project. Both for config generation (outputting to the tool's native file format) and memory population (reading from the tool's hooks/MCP).

Two frameworks:

**Config generation framework** -- adding a new tool's output format:

| Tool | Config files generated | Purpose |
|------|----------------------|---------|
| Claude Code | CLAUDE.md, .claude/rules/*.md | Project rules, path-scoped instructions |
| Cursor | .cursorrules, .cursor/rules/*.mdc | Project rules |
| Copilot | copilot-instructions.md | Repo-level instructions |
| Codex | AGENTS.md | Agent instructions |
| Windsurf | .windsurfrules | Project rules |

Adding a new tool: implement one adapter file with the tool's file paths and formatting conventions. Template provided.

**Memory population framework** -- onboarding a new tool's hooks/MCP:

Adding a new tool: copy the adapter template, configure hook event names and MCP config paths. Template + guide provided. Target: one-day effort for any new tool.

---

## Phases

Each phase develops capabilities across multiple layers -- capture, recall, management, team, governance -- not one layer per phase. The goal at each phase is a complete, shippable product that proves a specific thesis.

---

### Phase 0: Foundation -- "Ready to launch"

**What we're proving:** Nothing yet. This is pre-launch infrastructure.

| Area | What ships |
|---|---|
| **Domain & landing page** | Establish `aide-memory.dev` or `useaide.dev` (aide.dev is taken by CodeStory IDE). Simple landing page: what it does, install command, waitlist. Do NOT reveal Phase 2/3 roadmap publicly -- just "persistent memory for AI coding agents." |
| **Legal** | Trademark search for AIDE. License finalized (proprietary freeware EULA). Explore whether registering a company makes sense for liability, expenses, and IP protection. Legal considerations should be revisited at each phase release. |
| **GitHub repo** | `aide-memory` on GitHub. README, issue tracker, release binaries. No source code (proprietary freeware). Docs and installation instructions. |
| **npm package** | `aide-memory` reserved and publishable. `npm install -g aide-memory` works. |
| **Website** | Landing page with copy-paste install command (`npm install -g aide-memory`), feature overview, waitlist. No future phases revealed. |
| **Telemetry** | Basic anonymous telemetry on by default. Memory count, recall count, tool used. Never content. Disable: `AIDE_TELEMETRY=off` or `aide-memory config telemetry.enabled false`. Needed for Phase 2 go/no-go decision. |

**Estimate:** 1-2 weeks, can overlap with Phase 1 development.

---

### Phase 1: Individual Memory Engine -- "My agent remembers"

**What we're proving:** Developers will install a third-party memory layer and use it daily across at least two AI coding tools. AIDE Memory can compete on quality, reliability, and efficiency — not feature count.

Ship the capture, store, recall loop. This is not just table stakes — it's a competitive product in its own right. The opportunity:

| Competitor gap | How Phase 1 competes |
|---------------|---------------------|
| claude-mem reliability issues (worker crashes, session integrity bugs, heavy ChromaDB stack) | Simpler architecture — SQLite only, no external processes, fewer failure modes |
| claude-mem dumps ALL memories into system prompt (~2,000 tokens per session) | Nudge approach: ~20 tokens per file read, agent pulls only what's relevant |
| engram relies on agents voluntarily saving (our testing: 0% voluntary usage) | 10 hooks ON by default — proven 0%→100% adoption |
| Most tools bolt on path scoping after the fact | Path-scoped glob inheritance from day one, core architecture |

**Capabilities in this phase:**


| Area            | What ships                                                                                                                                                      |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Area | What ships | Tier |
|------|-----------|------|
| **Install** | One-command install: `npm install -g aide-memory && aide-memory init`. Writes rules files for ALL supported tools by default. Sets up hooks, creates `.aide/` directory structure, config defaults, downloads embedding model, configures `.gitignore`. | FREE |
| **Capture** | 10 hooks on by default: SessionStart (preferences/guidelines/priority:always auto-injection + ID tracking), PreToolUse on Read (ID-based blocking: BLOCK/SOFT/SILENT), PreToolUse on Edit/Write (same ID-based blocking), PreToolUse on Grep/Glob (always soft, never blocks), UserPromptSubmit (soft-only correction detection with negative filters + 3-word minimum), Stop (dynamic interval 3/5/10 with correction override), PreCompact (cleanup-only, clears tracking), PreToolUse on aide_recall (passthrough tracking), PostToolUse on aide_recall (ID parsing + tracking), PostToolUse on aide_remember (passthrough tracking), PostToolUse on aide_search (passthrough tracking). Session-scoped tracking via `session_id` with `ids\|` entries. Source tagging. Hidden nudging via `additionalContext`. Contributor + `generated_by` (tool/model/author_type) stored from day one. | FREE |
| **Recall** | Smart nudge approach — YOUR memories only. Path-scoped with focused scope matching (immediate parent + one level above only, no grandparent scopes). Scope-first ranking (scoped above project-wide), round-robin layer diversity within limit (min limit=5 for swapping). `aide_recall` supports `ids` parameter for gap-filling specific memories. Memory `priority` field (`always` = auto-injected at session start, `normal` = standard). Scope depth minimum (MIN_SCOPE_DEPTH=2) for blocking decisions. | FREE (your mems) |
| **Structure** | 4 memory layers with priority ordering. Tags from configurable preset list. Model auto-assigns. | FREE |
| **CLI** | `aide recall`, `aide remember`, `aide update`, `aide forget`, `aide search`, `aide list`, `aide stats`, `aide config`, `aide sync import/export`. Full parity with MCP tools. Binary: `aide` (default), `aide-memory` (fallback). | FREE |
| **Search** | FTS5 + sqlite-vec semantic search with mode parameter (auto/keyword/semantic). YOUR memories only on free. | FREE (your mems) |
| **Embeddings** | Local embedding model downloaded at init. No API keys. sqlite-vec. Embedding auto-management: generated on add, regenerated on update (when content fields change), cleaned on remove. Fire-and-forget background generation. | FREE |
| **Multi-tool** | Rules files for all tools at init. Claude Code + Cursor support via MCP + hooks. | FREE (CC + Cursor) |
| **Storage** | `.aide/memories/<layer>/` directory structure. One JSON file per memory. Local SQLite index. Post-checkout git hook. | FREE |
| **Config** | `aide config` for customization. Nudge visibility default OFF. Capture defaults ON. Configurable thresholds, tags. | FREE |
| **Memory editing** | Agent can update/remove existing memories via `aide_update` and `aide_forget` MCP tools. | FREE (your mems) |
| **Analytics** | Dual architecture: local SQLite analytics table + remote PostHog (anonymized; disable with `AIDE_TELEMETRY=off` or `aide-memory config telemetry.enabled false`). Basic: memory count, last recalled, hook breakdown. Track: installs vs inits, memories stored/recalled, hook trigger source, tool used, retention. | FREE (basic) |
| **Pre-train scan** | `aide init --scan` scans codebase and pre-populates ~20-30 structural memories (project type, stack, key patterns, existing docs). Agent has context from session 1, not session 5. | FREE |


**What is already built:**

- SQLite store with schema, WAL mode, synchronous API (20 tests)
- Recall engine with path-scoped glob matching, focused scope matching (immediate parent + one level above, no grandparent), round-robin layer diversity (min limit=5), scope depth minimum (MIN_SCOPE_DEPTH=2) for blocking decisions (18 tests)
- MCP server with 7 tools: aide_recall (with `ids` parameter for gap-filling), aide_remember, aide_update, aide_forget, aide_search, aide_memories, aide_import (9 tests)
- 10 hooks fully implemented:
  - SessionStart: injects preferences + guidelines + priority:always memories, writes injected IDs to tracking, clears tracking on resume/compact/clear
  - Read hook: ID-based blocking (BLOCK if unseen IDs for new file, SOFT if encountered, SILENT if all covered or no scoped memories), layer counts + topic summaries in output
  - Edit hook: same ID-based blocking logic as Read
  - Search hook (Grep/Glob): always soft, never blocks
  - UserPromptSubmit: soft-only correction detection with negative filters + 3-word minimum
  - Stop hook: dynamic interval (3 for first 9 turns, 5 for 10-29, 10 after 30), correction flag always overrides interval
  - PreCompact: cleanup-only (clears tracking), cannot force agent tool calls (Claude Code limitation)
  - Track hooks: PreToolUse(aide_recall), PostToolUse(aide_recall) with ID parsing, PostToolUse(aide_remember), PostToolUse(aide_search) -- all passthrough tracking
- Session-scoped tracking via `session_id` with `ids|` entries in tracking file
- PostToolUse correctly parses and tracks returned memory IDs from MCP responses
- SessionStart tracks injected memory IDs to prevent redundant blocking
- Memory priority field (`always` for auto-injected, `normal` for standard)
- Embedding auto-management: generated on add, regenerated on update, cleaned on remove
- Settings framework: `defaults.json` with 16 settings (all public since Apr 2026), read by the bundled CLI at runtime via `src/memory/settings.ts`. `aide-memory config KEY VALUE` validates keys and writes to `.aide/config.json`; hooks read the resolved value on each fire. Legacy `read-config.sh`/`read-config.js` readers were consolidated into the TS dispatcher in the 0.4.0 hook refactor.
- Auto-update on MCP server start (checks version, merges hooks/MCP/rules/dirs/.gitignore)
- `.ignore` file hides memories from grep by default
- 47 tests passing, zero type errors

**What remains to ship:**

- FTS5 integration for aide_search
- Local embedding model integration (sqlite-vec)
- npm package with `npm install -g aide-memory && aide-memory init` experience (writes rules for all tools, creates `.aide/` structure, downloads model)
- Cursor MCP config + hooks config
- `.aide/memories/` file-per-memory architecture (migrate from single SQLite to JSON files + SQLite index)
- Post-checkout git hook for auto-sync
- `aide stats` CLI command with analytics
- Default-on telemetry (disable via `AIDE_TELEMETRY=off` or `aide-memory config telemetry.enabled false`)
- `aide init --scan` pre-train mode (codebase scan -> initial memories)
- Public config settings + pro gating (Phase 2)
- Polish: error handling, graceful degradation, startup time
- **Pre-ship validation:** Prove that recall actually improves agent output (same task, with vs without recalled memories, measurable quality difference)

**Deferred to Phase 2+:**

- Import from other tools (claude-mem, engram, etc.)
- Privacy controls (.aideignore, secret redaction)
- Tools beyond Claude Code + Cursor
- Token tracking / cost measurement
- Config generation from memories
- Pre-set rule packs
- Contributor-aware injection (SessionStart and recall include teammate context)
- Configurable hook intensity (per-hook enable/disable and sensitivity tuning)
- Automatic memory cleanup (model-assisted pruning of stale/duplicate/contradictory memories)

**Estimate:** 4-6 weeks from existing codebase.

**Success criteria:**

- 100+ weekly active users with memories from at least two tools
- Retrieval hit rate >60% (recalled memories actually used by agent)
- Steady memory accumulation (5-10 per active session, not plateau after week 1)
- Sub-2-minute install with zero setup support tickets

**Analytics required for go/no-go (from default telemetry):**

| Metric | How measured | Why it matters |
|--------|-------------|----------------|
| Installs (`npm install -g aide-memory` runs) | Telemetry event | Adoption funnel top |
| Inits (`aide init` per project) | Telemetry event | Multi-project usage |
| Active sessions (1+ memories stored) | Local + telemetry | Real usage vs install-and-forget |
| Memories stored per session | Local analytics table | Hook effectiveness |
| Memories recalled per session | recalled_count tracking | Recall quality |
| Which hook triggered storage | Source tag (hook vs model) | Which capture method works |
| Tool used (Claude Code vs Cursor) | Telemetry | Where are users |
| Retention (users active >7 days) | Telemetry | Stickiness |
| Time from install to first recall | Telemetry | Time to value |
| Memory edits/deletes | Local analytics | Are people managing or just accumulating |
| Errors/failures | Telemetry | Reliability |

**Go/No-Go gates:**

- **GO to Phase 2** if: 100+ WAU with cross-tool usage, retrieval hit rate >60%
- **PAUSE** if: <50 WAU after 4 weeks -- investigate distribution, not features
- **STOP** if: retrieval hit rate <30% -- core value prop is not working
- **PIVOT** if: users store but never retrieve -- memory is not the problem they need solved

**Phase 2+ direction decided by Phase 1 data.** The team context thesis (proactive cross-dev sharing) is genuinely novel but unvalidated. We build team features when users signal demand — not before. Let real usage data and user feedback from Phase 1 drive what Phase 2 includes.

**Legal at this phase:** EULA finalized, trademark filed, company registration if pursued.

**Marketing & docs:**
- Blog post: "Why your AI agent forgets everything" + launch announcement
- Quick start guide (install in 2 minutes)
- Tool reference (all CLI commands + MCP tools)
- HN, Reddit r/ClaudeAI, r/cursor, dev.to posts
- Landing page updated with install instructions + feature overview

---

### Phase 1 Follow-ups

After Phase 1 ships and individual memory is validated with real users, these follow-up workstreams expand reach, distribution, and observability — all before investing in Phase 2 team features.

#### 1. Ecosystem Integration

AIDE Memory currently targets Claude Code and Cursor. The real opportunity is becoming the shared memory layer across the entire AI tool ecosystem — any tool that speaks MCP can connect.

**Claude ecosystem:**
- **Claude Code** — primary target, already supported via MCP stdio
- **Claude Desktop** — MCP support available; same `aide-memory` server config works
- **Claude Web (claude.ai)** — MCP integration when available; memories from coding sessions become accessible in general chat
- **Cowork (browser agent)** — MCP support expected; browser-based tasks inherit codebase context (e.g., you teach a naming convention in Claude Code, Cowork follows it when generating browser automation scripts)

**Cursor ecosystem:**
- **Cursor Agent / Composer** — already supported via MCP config in `.cursor/mcp.json`
- Cursor's plugin system supports MCP servers natively; marketplace listing (see below) makes discovery easier

**Other MCP clients:**
- Any tool implementing the MCP client protocol can connect: Windsurf, Zed, Cline, Continue, custom editors
- As MCP adoption grows, AIDE Memory works automatically — no per-tool integration needed

**The vision:** You teach your agent something in Claude Code. When you switch to Cursor, it already knows. When Cowork runs a browser task, it inherits your preferences. When you chat on claude.ai, your coding context is available. One memory layer, every tool. The memories live in `.aide/memories/` in your repo — the tool doesn't matter, the context persists.

#### 2. Non-IDE Developers

Not every developer works inside Claude Code or Cursor. Many run custom agent pipelines, use terminal-only workflows, or operate in restricted environments. AIDE Memory should serve them too.

**Custom agent frameworks:**
- Developers building orchestration with LangChain, CrewAI, AutoGen, Semantic Kernel, or custom agents can connect to aide-memory as an MCP server
- Any framework that supports MCP tool-calling gets memory for free
- For frameworks without MCP support: aide-memory's CLI (`aide-memory recall`, `aide-memory remember`, etc.) can be shell-exec'd from any agent pipeline

**CLI-first workflow:**
- `aide-memory` CLI already supports all core operations: `recall`, `remember`, `forget`, `search`, `list`, `stats`
- Terminal-native developers can use the CLI directly without an IDE or agent
- CI/CD pipelines can query memories (e.g., "recall context for files changed in this PR")

**Programmatic access:**
- Potential SDK/API for direct integration from Node.js/TypeScript agent code (import the store directly, skip MCP overhead)
- Useful for developers building custom agent loops who want sub-millisecond memory access without the MCP protocol layer

**Self-hosted, local-first:**
- No cloud dependency — SQLite + JSON files in the repo
- Works in air-gapped environments, on-prem setups, and offline laptops
- No API keys, no accounts, no telemetry phoning home
- Developers own their data completely

#### 3. Marketplace Submissions

Based on research in `docs/specs/PLUGIN_STATUS.md`, all three major platforms are accepting submissions. These are the sequential steps for each.

**MCP Registry (modelcontextprotocol.io) — submit first:**
1. Publish `aide-memory` to npm as a public package (`npm publish --access public`)
2. Install the MCP publisher CLI (`brew install mcp-publisher`)
3. Run `mcp-publisher init` to generate `server.json` with metadata (name: `io.github.meky/aide-memory`)
4. Authenticate: `mcp-publisher login github`
5. Validate: `mcp-publisher publish --dry-run`
6. Publish: `mcp-publisher publish`
7. Verify listing at [registry.modelcontextprotocol.io](https://registry.modelcontextprotocol.io/)

**Claude Code Marketplace — submit second:**
1. Create `.claude-plugin/marketplace.json` manifest in the repo
2. Package the MCP server, skills (slash commands), hooks, and rules as a Claude Code plugin
3. Test locally by installing from the local path
4. Submit via [platform.claude.com/plugins/submit](https://platform.claude.com/plugins/submit)
5. Alternatively, self-host the marketplace on GitHub (`owner/repo` format) for immediate distribution while awaiting official approval
6. Add installation instructions to README and landing page

**Cursor Marketplace — submit third:**
1. Create `.cursor-plugin/plugin.json` manifest
2. Package MCP server config, `.mdc` rules files, and documentation
3. Add `README.md` and `CHANGELOG.md` to the plugin package
4. Test locally within Cursor
5. Submit via [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)

**npm ecosystem (ongoing):**
- Package already on npm as `aide-memory`
- Ensure `npm install -g aide-memory` works for zero-friction trial
- Add keywords for discoverability: `mcp`, `memory`, `ai-agent`, `claude`, `cursor`, `context`
- Keep README install instructions at the top (2-minute setup)

#### 4. Analytics & Telemetry

**What currently exists in the codebase:**

AIDE Memory has a local analytics system built into `src/memory/analytics.ts`:
- **Analytics table** in the project SQLite database — stores events with `event`, `value`, `tool`, and `timestamp` columns
- **Event logging** via `Analytics.logEvent()` — called on memory operations (recall, remember, forget, etc.)
- **Query methods**: `getEvents()` (filter by event type, date range, limit), `countEvents()` (count by type), `getStats()` (aggregate summary)
- **Memory stats**: `getStats()` returns total memories, count by layer, most-recalled memories (top 5), capture source breakdown (hook vs. manual vs. agent), and stale memory count (0 recalls, 30+ days old)
- **Pruning**: `Analytics.prune(days)` removes old analytics events to keep the DB lean

**How to view usage metrics today:**
- CLI command: `aide-memory stats` (in `src/cli/commands/memory/stats.ts`) — prints total memories, breakdown by layer, most recalled, and source breakdown to the terminal
- Direct SQLite queries against the project database (`~/.aide/projects/<hash>/brain.db`, table: `analytics`)
- No external dashboard — everything is local and terminal-based

**What has been added (April 2026):**
- **PostHog remote telemetry**: dual architecture — local SQLite `analytics` table + remote PostHog (anonymized events only, never memory content). Opt-out via `aide-memory config telemetry.enabled false`. PostHog project key hardcoded, events buffered and sent fire-and-forget.

**What needs to be built:**
- **Richer CLI output**: add recall hit rate (recalls that returned results vs. empty), memory growth over time, tokens saved estimate
- **Export to JSON/CSV**: `aide-memory stats --format json` for piping into external tools
- **Per-project health check**: a command like `aide-memory health` that reports memory freshness, stale percentage, layer balance, and recall effectiveness — actionable output, not just numbers

---

### Phase 2: Team Context -- "My team's agents don't break each other's work"

**What we're proving:** Teams will pay for cross-developer context sharing that prevents agent-caused breakage. This is where the genuine differentiators live. This is the actual product.

**Capabilities in this phase:**


| Area | What ships | Tier |
|------|-----------|------|
| **Team recall** | MCP tools return all contributors' memories, intelligently ranked. Unlock the contributor filter. | PRO |
| **Generate config** | `/aide-rules` drafts CLAUDE.md/.cursorrules from most-recalled memories. Slash command + CLI template fallback. Ownership markers. Per-tool flags. Full directory structure. | PRO |
| **Generate & browse area context** | `/aide-context src/path` produces readable doc + browse teammate reasoning. One capability. | PRO |
| **Team sharing** | AUTOMATIC via git. Post-checkout hook imports teammate memories. Proactive cross-dev nudge on file access. | PRO |
| **Intelligent cleanup** | `/aide-cleanup` — duplicate detection, stale detection, conflict flagging, cross-contributor analysis. CI mode: `aide cleanup --ci`. | PRO |
| **Import from other tools** | Import from CLAUDE.md, MEMORY.md, .cursorrules, copilot-instructions.md, JSON. | PRO |
| **Privacy controls** | .aideignore, secret redaction, configurable capture scope. | PRO |
| **Pre-set rule packs** | 2-3 built-in packs (SOLID React/TS, Clean Architecture). `aide import --pack`. | PRO |
| **Session handoff** | Export/import active session state. Automatic, command, or clipboard. | PRO |
| **Rich analytics** | Full usage patterns, memory health, team metrics. Token savings tracking (if validated). | PRO |
| **Additional tools** | Windsurf, Copilot, Cline adapters via tool onboarding framework. | PRO |
| **Stale context detection** | PostToolUse hook flags when code edits contradict existing memories. | PRO |
| **Contributor-aware injection** | SessionStart and recall include teammate context based on contributor field. Proactive cross-dev nudge surfaces memories by contributor for the current path. | PRO |
| **Configurable hook intensity** | Per-hook enable/disable and sensitivity tuning for advanced users. | PRO |
| **Automatic memory cleanup** | Model-assisted pruning of stale, duplicate, and contradictory memories. | PRO |


**Estimate:** 4-6 weeks after Phase 1.

**Success criteria:**

- 5%+ free-to-team conversion within 30 days of team features shipping
- At least 3 teams using cross-dev context sharing actively
- Proactive nudge prevents at least one documented "agent broke teammate's code" incident per team per month
- Generated config accepted without major edits 80%+ of the time
- Monthly churn below 5%

**Go/No-Go gates:**

- **GO to Phase 3** if: 5%+ conversion, <5% churn, at least 3 teams actively sharing context
- **PAUSE** if: conversion <3% -- team features may not solve the right pain
- **STOP** if: free tier stagnates below 500 WAU -- distribution problem trumps monetization
- **PIVOT** if: teams love generated config but not sharing -- double down on config generation as the product

**Legal at this phase:** Review pricing/billing compliance, payment processor terms. Revisit company registration if not done in Phase 1.

**Marketing & docs:**
- Blog post: "Your team's AI agents don't talk to each other" + team features announcement
- Team setup guide
- Case study: the prop example (real incident, real prevention)
- Landing page updated with team features + pricing
- External docs: team sharing guide, config generation reference

---

### Phase 3: Governance -- "Mistakes become rules"

**What we're proving:** The bridge from observed corrections to enforced rules is a real product. Rules that learn from developer behavior are more effective than manually authored rules.

**Capabilities in this phase:**


| Area                               | What ships                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Correction-to-rule graduation**  | Frequency-based pipeline: corrections recalled N+ times or corrected by N+ developers proposed as candidate rules. Developer reviews and approves. |
| **Rule promotion**                 | Approved rules written to CLAUDE.md/.cursorrules via ownership markers. Enforced across tools, not just remembered by one agent.                   |
| **Personalized instruction layer** | `aide generate-profile` creates cross-project developer preferences. Style, patterns, conventions that travel with the developer, not the project. |
| **Rule effectiveness tracking**    | After a rule is promoted: does the agent follow it? Does the correction stop recurring? Measurable via `recalled_count` and correction frequency.  |


**Estimate:** 6-8 weeks after Phase 2.

**Success criteria:**

- Rule suggestion acceptance rate >50%
- Graduated rules reduce recurring corrections by measurable margin
- 20%+ of Team tier users actively using governance features
- Cross-tool rule consistency >90% (same rule enforced in Claude Code and Cursor)

**Go/No-Go gates:**

- **GO to Phase 4** if: >50% rule acceptance, >20% Team adoption of governance
- **PAUSE** if: <30% acceptance -- graduation pipeline is surfacing noise, not signal
- **STOP** if: rules do not change agent behavior -- enforcement is too weak to matter
- **PIVOT** if: rules work in one tool only -- focus on that ecosystem

---

### Phase 4: Enterprise -- build when customers ask

**What we're proving:** Nothing, yet. Do not build enterprise features speculatively.

**Capabilities to build ONLY when enterprise customers request them:**

- **Org/Team/Personal hierarchy** -- three-layer rule inheritance with conflict detection
- **Audit trail** -- what context informed which AI-generated code. EU AI Act deadline: August 2026.
- **Admin controls** -- team management, access controls, RBAC
- **SSO integration** -- enterprise identity provider support
- **Advanced analytics** -- team-wide memory quality, rule effectiveness, adoption metrics

**The rule:** If no enterprise customer has asked for these by the time Phase 3 ships, do not build them. Every enterprise feature is IT boilerplate that does not create end-user value until a paying customer needs it.

**Estimate:** Scoped per customer request. No speculative timeline.

---

## Pricing

### Two Real Tiers

The pricing is simple. Individual features are free. Team features cost money. Enterprise is a volume deal, not a separate product.

---

### Free -- Individual Developer

**Price:** $0. No account required. Unlimited everything.

**What you get:**

- Capture: 10 hooks on by default (SessionStart auto-injection + ID tracking, PreToolUse on Read/Edit with ID-based blocking, PreToolUse on Grep/Glob always soft, UserPromptSubmit soft-only correction detection, Stop dynamic interval 3/5/10 with correction override, PreCompact cleanup-only, plus 4 track hooks for aide_recall/aide_remember/aide_search). Session-scoped ID tracking prevents redundant blocking.
- Recall: scope-first ranking (scoped above project-wide), round-robin layer diversity (min limit=5), focused scope matching (immediate parent + one level above only), `ids` parameter for gap-filling, memory priority field (`always`/`normal`), MIN_SCOPE_DEPTH=2, YOUR memories only
- Search: FTS5 keyword + sqlite-vec semantic search with mode parameter (auto/keyword/semantic)
- Structure: 4 memory layers with priority ordering, configurable tags
- Storage: one file per memory, local SQLite index, git sync
- CLI: `aide recall`, `aide remember`, `aide search`, `aide list`, `aide stats`
- Config: `aide config` for customization (nudge visibility, capture settings, thresholds)
- Memory editing: update and remove existing memories
- Unlimited memories, unlimited projects
- Claude Code + Cursor support
- Basic `aide stats` (memory count, last recalled, hook breakdown)
- Monorepo support (hierarchical `.aide/` directories)

**What's NOT in free:**
- Config generation (`aide generate-rules`) — Pro
- Memory cleanup intelligence (`aide cleanup`) — Pro
- Team recall (teammate memories) — Pro
- Pre-set rule packs — Pro
- Import from other tools — Pro
- Rich analytics — Pro
- Additional tools beyond CC + Cursor — Pro
- Privacy controls (.aideignore, redaction) — Pro

**Why free is still valuable:** Capture + recall + path scoping is the core loop. It works, it accumulates value over time, and it competes directly with claude-mem (which has reliability issues) and engram (which has adoption issues). The free tier is the distribution engine.

**What never gets paywalled:** All YOUR stored memories are always accessible. The data is on your machine. It is yours.

---

### Team -- $10/user/month

**Price:** $10 per user per month. Where the differentiation lives.

**What you get (everything in Free, plus):**

- **Team recall** -- MCP tools return YOUR + TEAMMATE memories, intelligently ranked. Free tier only returns your own.
- **Generate config** -- `aide generate-rules` / `/aide-rules` drafts CLAUDE.md/.cursorrules from most-recalled memories. Per-tool flags: `--claude`, `--cursor`, `--copilot`, `--all`. Same command works for individual (from your memories) and team (from all memories when synced). Detects existing configs, updates with ownership markers, creates if missing. Full directory structure support.
- **Generate & browse area context** -- `aide generate-context src/path` / `/aide-context` produces readable doc from memories + annotations. Browse teammate reasoning organized by code area (contributor, why, when, path). One capability — generate is the action, browse is viewing what was generated.
- **Intelligent memory cleanup** -- `aide cleanup` / `/aide-cleanup` with duplicate detection, stale detection, conflict flagging, cross-contributor analysis. Model-assisted (slash command) or CI pipeline (`aide cleanup --ci`, SQL-based, no model).
- **Pre-set rule packs** -- `aide import --pack solid-react-ts` loads curated guideline memories. 2-3 built-in packs at launch.
- **Import from other tools** -- Import from CLAUDE.md, MEMORY.md, .cursorrules, copilot-instructions.md, JSON.
- **Privacy controls** -- `.aideignore` with smart defaults, secret redaction before storage, configurable capture scope.
- **Active session handoff** -- export/import session state across tools. Automatic (next tool reads on startup), command (`aide export-session`), or clipboard.
- **Rich analytics** -- full usage patterns, memory health, recall quality trends. `aide stats --cost` for token savings (if validated).
- **Additional tool support** -- Windsurf, Copilot, Cline adapters as they ship (via tool onboarding framework).
- **Stale context detection** -- flags when code edits contradict existing memories.

**The conversion trigger:** A developer uses the free tier for several weeks. They want config generation, cleanup intelligence, or teammate memory access. Or they hear "47 teammate memories exist for the code you're touching — upgrade to see them."

**Revenue gating:** The MCP binary gates team features via compiled logic. Free binary filters queries to `contributor === you`. Pro binary returns intelligently ranked results from all contributors. The data (JSON files) is accessible to anyone, but the intelligence (scoring, ranking, cross-contributor analysis) is in the compiled binary. Gate the intelligence, not the data.

**Revenue math:**


| Scenario                        | Users                            | Revenue    |
| ------------------------------- | -------------------------------- | ---------- |
| Year 1: 10,000 free, 5% convert | 500 Team users                   | $60K ARR   |
| Year 2: growth + enterprise     | 2,000 Team + 50 enterprise teams | ~$288K ARR |


---

### Enterprise -- Contact Us

**Price:** Volume deals at $8-10/seat at scale. Not a separate product.

**What you get:** Everything in Team, plus SSO, audit trail, admin controls, RBAC, org-level policy management.

**The rule:** Do not build enterprise features until enterprise customers ask. SSO and audit are procurement checkboxes, not things developers choose a tool for.

---

### Rejected Alternatives

**Why not usage-based pricing?** Memory tools have unpredictable usage. Usage-based pricing creates anxiety and discourages the accumulation behavior that makes the product valuable. Flat per-user aligns incentives.

**Why not a capped free tier?** "You've used our product too much, now pay." Developers hate this. Caps are trivially bypassable on local SQLite. Gate on capabilities (config generation, team sharing), never on quantities (memory count, projects, tools).

**Why is the free tier unlimited?** Because claude-mem (43K stars) and engram (2K stars) are completely free and unlimited. Any restriction is a reason to use a competitor instead.

## Architecture

### Core Design Decisions

- **SQLite, local-first.** No Docker, no Postgres, no API keys. WAL mode, synchronous API. The developer's machine is the server.
- **FTS5 + sqlite-vec in one database.** FTS5 for keyword search with BM25 ranking. sqlite-vec for semantic similarity via local embeddings. Both live in the same SQLite file. No external processes, no Python subprocess, no Chroma, no Qdrant.
- **Native model for all reasoning.** We CANNOT tap into Claude Code or Cursor's model programmatically. MCP tools do DATA RETRIEVAL (SQLite queries). The agent the developer is already running does REASONING (formatting, drafting, deciding relevance). Rules files (written during init) are the interface -- they tell the model when and how to call MCP tools. For EACH tool we support, we write native rules files in that tool's format. Zero separate model. Zero extra API cost.
- **Store is the brain. Files are projections.** SQLite is the structured, queryable source of truth. CLAUDE.md, .cursorrules, and `.aide/context/` files are readable projections generated on command from the store. One source, multiple outputs.
- **10 hooks at launch.** SessionStart (auto-inject preferences + guidelines + priority:always, write injected IDs to tracking, clear tracking on resume/compact/clear), PreToolUse on Read (ID-based blocking: BLOCK/SOFT/SILENT based on unseen memory IDs), PreToolUse on Edit/Write (same ID-based blocking as Read), PreToolUse on Grep/Glob (always soft, never blocks), UserPromptSubmit (soft-only correction detection with negative filters + 3-word minimum), Stop (dynamic interval 3/5/10 with correction override), PreCompact (cleanup-only, clears tracking -- cannot force agent tool calls due to Claude Code limitation), plus 4 track hooks: PreToolUse(aide_recall), PostToolUse(aide_recall) with ID parsing, PostToolUse(aide_remember), PostToolUse(aide_search). Session-scoped tracking via `session_id` with `ids|` entries for concurrent session isolation. Recall uses focused scope matching (immediate parent + one level above, no grandparent) with round-robin layer diversity (min limit=5). Scope depth minimum (MIN_SCOPE_DEPTH=2) for blocking decisions.
- **Command-triggered generation, not automatic background.** `aide generate-rules` and `aide generate-context` are explicit commands. The model assists with drafting content. Nothing runs without the developer asking for it.
- **Hot path bypasses MCP.** Hooks query SQLite directly via a JS script. Zero protocol overhead for recall on the critical path. MCP is for cross-tool portability and explicit tool calls, not for the read-on-every-file-open loop.
- **Proprietary freeware distribution.** Licensing decision pending (see Repo Strategy & Licensing), but the design assumes code protection is important. Pro/Enterprise features are always proprietary, never visible, never convert to open source.

---

### Storage: One File Per Memory

Each memory is a separate JSON file with a UUID filename stored in `.aide/memories/<layer>/`. The local SQLite database is a cached index rebuilt from these JSON files -- it is not the source of truth for persistence; the files are.

**Directory structure:**

```
.aide/memories/
├── preferences/
│   ├── personal/          <- GITIGNORED (never shared)
│   └── shared/            <- TRACKED (team-relevant preferences)
├── technical/             <- TRACKED
├── area_context/          <- TRACKED
└── guidelines/            <- TRACKED
```

**Why one file per memory:**

The JSONL event log approach was evaluated and REJECTED -- too complex, scalability concerns with append-only logs, difficult merge semantics. A JSON snapshot per developer approach was also REJECTED -- merge conflicts across branches when multiple developers modify the same file. One-file-per-memory was chosen because:

- **Adding a memory** = creating a new file with a unique UUID name. Two developers adding memories simultaneously create different files. Never conflicts.
- **Updating a memory** = editing the JSON file. Only conflicts if two people edit the *same* memory simultaneously, which is extremely rare because each dev owns their memories by convention.
- **Deleting a memory** = deleting the JSON file.

**SQLite cache rebuild:**

The local SQLite index is rebuilt from JSON files using a hash-based cache. On startup, the system hashes the `.aide/memories/` directory state. If the hash matches the last known state, no rebuild occurs. If files have changed (new memories from a git pull, manual edits), only changed files are re-imported. Typical rebuild time for 500 files: ~100-200ms.

**Git IS the sync mechanism:**

There is no separate sync command. Memories are files in the repo. When you `git pull`, new teammate memories arrive as new files. A `post-checkout` git hook automatically imports new and changed files into the local SQLite index by comparing each file's ID and timestamp (newer wins). The developer does nothing -- sync is seamless and invisible.

**Scalability:** ~500 bytes per memory file. 2,000 memories = ~1MB total. Git handles this fine. Git history growth (accumulation of add/edit/delete commits over months) is the real long-term concern, not the current working tree size.

---

### Layers and Tags

**4 FIXED layers** with built-in behavior (retrieval priority, gitignore rules):

| Layer            | Git behavior                                       | Retrieval priority |
| ---------------- | -------------------------------------------------- | ------------------ |
| **Preferences**  | `personal/` gitignored, `shared/` tracked          | 3rd                |
| **Technical**    | Tracked                                            | 2nd                |
| **Area Context** | Tracked                                            | 1st (most specific)|
| **Guidelines**   | Tracked                                            | 4th (broadest)     |

Layers define *behavior* -- how memories are stored, shared, and prioritized during recall.

**Tags are FLEXIBLE and user-defined** via a configurable preset list with sensible defaults:

Default preset tags: `architecture`, `testing`, `security`, `style`, `integration`, `config`, `migration`, `performance`, `api-contract`.

Developers can add custom tags: `aide config tags.add "custom-tag"`.

Tags are *metadata* for filtering, search, and generation -- they do not affect recall priority. Sub-categories within layers are implemented via tags (e.g., a guideline about architecture is `layer:guidelines` + `tag:architecture`, not a separate "guidelines:architecture" layer).

**Model auto-assigns both** layer and tags from heuristics defined in the rules file. The developer never manually categorizes unless overriding a misassignment.

---

### Memory Ownership

Each memory has a `contributor` field identifying its author.

- **Edit/delete only YOUR memories.** Convention enforced by the model via rules files, not by file permissions.
- **Tag anyone's memory as "outdated."** This is just a tag on the memory file, not a separate flags system. Git blame shows who tagged it and when.
- **Orphaned memories** (original author left the team) can be adopted by a team admin. Enterprise feature -- not in Phase 1 or 2.

---

### Monorepo Support

Hierarchical `.aide/` directories cascade like `.eslintrc` or `.gitignore`:

```
monorepo/
├── .aide/                    <- Monorepo-wide memories and config
│   ├── memories/
│   └── config.json
├── packages/
│   ├── frontend/
│   │   └── .aide/            <- Frontend-specific memories
│   │       └── memories/
│   └── backend/
│       └── .aide/            <- Backend-specific memories
│           └── memories/
```

- Each package can have its own `.aide/memories/` directory. The root level has monorepo-wide memories.
- The post-checkout hook walks up the directory tree, finds all `.aide/memories/` directories, and imports the relevant ones.
- **One SQLite database per `.aide/` directory** -- faster startup, only loads memories relevant to the current package context.
- Model queries are transparent -- the hook merges results from multiple SQLite databases. The model sees unified results and does not need to know about the hierarchy.
- Setup: `aide init --root` (at monorepo root) and `aide init --package` (within a package directory).

---

### Sync Adapter Architecture

Git is the default sync mechanism, but the architecture is designed to be **pluggable** -- swap git for cloud storage, shared drive, or database later.

Each sync adapter implements the same interface (~100-200 lines):

| Adapter | Status | Use case |
| ------- | ------ | -------- |
| **Git** | Ships at launch | Default. Files in repo, post-checkout hook. |
| **Cloud** | Future | Teams that want sync without committing memories to the code repo. |
| **Enterprise DB** | Future | Centralized storage with access controls, audit trail. |

Ship the git adapter. Build cloud and enterprise adapters when customers need them.

---

### CLI vs Agent Interaction Model

**Agent chat (slash commands/skills) = primary UX** for intelligent operations that benefit from model reasoning.

Slash commands are pre-built prompts that expand in the agent chat context:

| Slash command | What it does |
| ------------- | ------------ |
| `/aide-rules` | Generate or update config files from most-recalled memories |
| `/aide-context` | Generate context document for a specific code area |
| `/aide-cleanup` | Run memory management pass (duplicates, stale, conflicts) |
| `/aide-stats` | Show memory health, retrieval frequency, token savings |

These are NOT CLI commands. They expand as prompts inside the agent's conversation, giving the model full context to reason about the task.

**CLI = fallback** for contexts where an agent is not running:

- Data display: `aide list`, `aide stats`, `aide search`
- Template output: `aide export-session --clipboard`
- Scripts and CI: `aide cleanup --ci` (SQL-based, no model needed)

**There is NO bridge between CLI and a running agent.** They are separate processes. The CLI reads/writes to the same SQLite database and JSON files, but it cannot communicate with an active agent session.

**For Cursor (no slash commands):** `.cursor/rules/aide-memory.mdc` provides the same instructions as rules files. The model reads these on every session start and knows when/how to call MCP tools.

**CI usage:** Template-based config generation (no model required) and SQL-based cleanup queries (no model required). CI never calls an LLM.

---

### Native Model Interaction via Rules Files

We cannot programmatically access Claude Code's or Cursor's model. The interface is **rules files** -- markdown documents placed in tool-specific locations that the model reads automatically.

Rules files tell the model:
- When to call `aide_recall` (on file reads, when starting a new task)
- When to call `aide_remember` (on corrections, after completing work)
- How to format memory content (layer, scope, tags)
- When to suggest cleanup or config generation

For each supported tool, we write one rules file in that tool's native format during `aide init`. This is a one-time effort per tool via the tool onboarding framework.

---

### Install Experience

```
npm install -g aide-memory && aide-memory init
```

This single command:

1. Creates `.aide/` directory structure (memories, config, context)
2. Writes rules files for ALL supported tools by default -- no tool detection needed. If a tool is not installed, the rules file sits unused and causes no harm.
3. Sets up hooks (post-checkout for sync, tool-specific hooks for capture)
4. Creates `config.json` with sensible defaults
5. Downloads the local embedding model for semantic search
6. Configures `.gitignore` (adds `preferences/personal/`, SQLite cache files)

**Principle:** Organic and automatic by default, customizable when wanted. Zero-config gets you 90% of the value. `aide config` lets you tune the remaining 10%.

---

### Tool Onboarding Framework

Two framework patterns for adding support for any new AI coding tool:

**Config generation framework** -- one adapter file per tool defining file paths and formatting conventions:

| Tool | Config files | Rules file location | Skills/Commands |
| ---- | ------------ | ------------------- | --------------- |
| Claude Code | CLAUDE.md, .claude/rules/*.md | .claude/rules/aide-memory.md | .claude/commands/aide-*.md |
| Cursor | .cursorrules, .cursor/rules/*.mdc | .cursor/rules/aide-memory.mdc | N/A |
| Copilot | copilot-instructions.md | copilot-instructions.md | N/A |
| Codex | AGENTS.md | AGENTS.md | N/A |
| Windsurf | .windsurfrules | .windsurfrules | N/A |

Adding a new tool: implement one adapter file with the tool's file paths and formatting conventions. Template provided.

**Memory population framework** -- hook event names and MCP config paths per tool:

Adding a new tool: copy the adapter template, configure hook event names and MCP config paths. Template and guide provided.

**Target:** One-day effort for any new tool with template and guide.

---

### Unified Configuration

**Current implementation:** `defaults.json` defines 16 settings, each with `value`, `public`, and `pro` metadata fields (`pro: false` across all of them — no paid tier in Phase 1). The bundled CLI (`src/memory/settings.ts` → `dist/cli/aide-memory.js`) is the single reader used by both hooks and `aide-memory config`, resolving: hook-internal default → `defaults.json` → `.aide/config.json` override. Unknown keys rejected with suggestions. All settings are public and user-settable.

**Settings include:** hook enable/disable flags, recall limits, blocking thresholds, stop interval parameters, correction detection sensitivity, nudge verbosity, and auto-update behavior.

**Auto-update:** On MCP server start, the system checks its version against the installed version and merges new/changed hooks, MCP config, rules files, directories, and `.gitignore` entries automatically.

**Future CLI surface** (not yet built): `aide config` for user-facing customization:

```
aide config cleanup.stale-days 30
aide config cleanup.auto-flag-dupes true
aide config tags.add "custom-tag"
aide config preferences.default-shared true
aide config capture.auto-capture true
```

---

### Future Orchestration Note

The framework may evolve to offer orchestration for memory management automation, codebase understanding, documentation generation, and config file generation. Design principles for any orchestration:

- **Default:** use the native tool's model to avoid extra cost.
- **Opt-in only.** Never required. The tool must work fully without orchestration.
- **Cost awareness:** Extra model cost is a significant adoption barrier. Any orchestration that calls an LLM outside the developer's existing agent session must be evaluated carefully and justified by clear value.

---

### Design Decisions Summary

| Decision | Choice | Rationale |
| -------- | ------ | --------- |
| Storage | SQLite local-first | No infrastructure, instant queries, WAL mode for concurrent reads |
| Search | FTS5 + sqlite-vec | Keyword and semantic in one DB, no external processes |
| Reasoning | Native model only | Zero extra API cost, no Docker/cloud dependency |
| Source of truth | Store is brain, files are projections | One structured source, multiple readable outputs |
| Recall ranking | Scope-first + round-robin layer diversity | Scoped memories most relevant; round-robin (min limit=5) prevents layer starvation |
| Scope matching | Focused: immediate parent + one level above | No grandparent scopes -- keeps recalled context tightly relevant |
| Blocking | ID-based: BLOCK/SOFT/SILENT | Tracks seen IDs per session; MIN_SCOPE_DEPTH=2 prevents overly broad blocking |
| Stop interval | Dynamic 3/5/10 | Every-turn was 51% noise (1 remember per 9 prompts); dynamic reduces overhead |
| Capture | 10 hooks at launch | Proven adoption (0% voluntary to 100% hook-driven); soft nudges ~90% effective |
| Settings | defaults.json + three-layer resolution | Hook default -> defaults.json -> user config; 18 settings with public/pro metadata |
| Generation | Command-triggered | No background processes, developer controls when |
| Hot path | Bypasses MCP | Direct SQLite query, zero protocol overhead |
| Distribution | Proprietary freeware (pending) | Maximum code protection, free to use |

### Implementation Detail Docs (Skeleton)

Phase-specific implementation details and architectural deep dives live in separate files. This document is the strategic overview only.

```
docs/
  PRODUCT_VISION.md          # This file -- strategic overview
  sessions/                  # Raw session findings
    DIRECTION_MARCH31.md
    DIRECTION_CHAT.txt
  specs/                     # Implementation specs (created per feature when building)
    PHASE_1_SPEC.md
    PHASE_2_SPEC.md
    ...
  archive/                   # Historical docs (superseded by PRODUCT_VISION.md)
    PROTOTYPE.md
    RESEARCH.md
    SESSION_CONTEXT.md
```

Two levels max. No deep nesting. Specs created per feature when building, not all upfront.

Each phase doc starts with "After this phase, a developer can..." and works top-down: user experience, components, technical decisions, success criteria, open questions.

---

## Validation & Testing

### What Has Been Proven

**MVP E2E Comparison (Feb 28, 2026):**

- AIDE Memory: 4/4 queries correct. Path scoping and layer ordering work as designed. Perfect isolation between code areas.
- ConPort: Functional but no path filtering. 31 tools is too many for reliable agent use.
- mcp-memory-service: Tags silently dropped. 7/10 results are noise. No path scoping.

**Hooks Suite 1 -- Adoption (PASS):**

- `aide_remember` usage went from 0% (voluntary agent calls) to 100% (hook-driven nudge). This is the fundamental adoption finding.
- Stop hook fires reliably with loop prevention. PreToolUse hooks fire automatically on every Read call.
- Agent self-de-duplicated: stored once, declined when Stop hook nudged again.
- MCP overhead: 1.4K tokens (0.7% of context window).

**Hooks Suite 2 -- Cross-Session Persistence (PASS):**

- Session 1: Taught 3 rules + 1 correction. Agent stored 3 memories.
- Session 2A (with AIDE Memory): Agent recalled context, used taught patterns. Cross-session persistence proven.
- Session 2B (bare, no AIDE Memory): Agent had no recalled context. Used different patterns. Clear behavioral difference.

**Hook Refinement Validation (Sessions A-F, Apr 2026):**

- **Soft nudges ARE effective:** ~90% agent compliance rate validated in Session F. Agents follow soft suggestions reliably without requiring hard blocks.
- **PreCompact cannot force agent saves:** Claude Code architectural limitation confirmed. PreCompact output is not reliably consumed by the agent. Demoted to cleanup-only (clears tracking).
- **PostToolUse DOES work for MCP tools:** Initial belief that PostToolUse did not fire for MCP tools was wrong -- response parsing was the issue. Now correctly tracks returned memory IDs.
- **Average Claude Code session is ~4 human prompts:** Based on Anthropic data across 200K transcripts. Informed the dynamic stop interval design (every-turn blocking is excessive for short sessions).
- **Stop hook every-turn was 51% noise:** Only 1 remember per 9 prompts on average. Dynamic interval (3/5/10) reduces overhead while preserving correction enforcement.
- **ID-based blocking prevents redundant recalls:** Session-scoped ID tracking ensures the agent is only blocked when genuinely unseen context exists for a path, not when it has already recalled everything relevant.

**Key Findings:**

- JSONL observability gap: PreToolUse `additionalContext` not recorded in session transcript files.
- Subagent hook gap: PreToolUse hooks do not fire for Plan/Explore subagent tool calls.
- Code quality comparison between AIDE Memory and bare agents is inconclusive -- methodology issues need proper re-testing.
- Correction detection needs negative filters: without filtering questions, acknowledgments, and short responses (<3 words), UserPromptSubmit generates false positives.

### E2E Testing Strategy Per Phase

**Phase 1: Memory Engine**

Scenario-based testing across tool x setup matrix (bare Claude Code, bare Cursor, AIDE Memory + Claude Code, AIDE Memory + Cursor). Five test scenarios:

1. Style continuity across sessions -- teach preferences in session 1, verify in session 2
2. Planning details survive context loss -- agree on plan, verify new session continues correctly
3. Technical knowledge retention -- teach conventions, verify new session respects them
4. Proactive discovery -- seed context, verify agent recalls before starting related task
5. New contributor simulation -- fresh agent with populated memory store vs without

Decision criteria: if AIDE Memory setups score at or below bare setups, the core value prop is not working.

**Rules file validation:** Test that rules files correctly guide each tool's model to call MCP tools appropriately. Minimum coverage: Claude Code and Cursor.

- Model reads rules file on session start and understands when to call `aide_recall`
- PreToolUse nudge triggers model to call `aide_recall` (not ignore the nudge)
- Stop hook prompt triggers model to call `aide_remember` when appropriate
- Model respects layer and scope conventions described in rules file
- Rules file does not conflict with tool's native instructions or cause model confusion
- Model auto-assigns correct layer and tags based on heuristics in rules file

This is a critical test because the rules file IS our interface to the model. If the model ignores or misinterprets the rules, nothing works. Rules file testing must be repeated whenever rules file content changes or a new tool is onboarded.

**Phase 2: Team Context**

- Config generation accuracy: compare generated CLAUDE.md against human-written version, target 80%+ acceptance without major edits
- Cross-dev nudge: Dev A stores context for a code area, Dev B's agent surfaces it proactively before touching that area
- Reasoning visibility: generated context files are readable and accurate for human review

**Phase 3: Governance**

- Rule generation accuracy: create 20 known patterns, run pattern detector, measure true positive rate (target >50% acceptance)
- Cross-tool consistency: create 10 rules, trigger both Claude Code and Cursor on same tasks, measure behavior match (target >90%)
- Rule impact: before/after comparison on CI failure rates, reverted commits

### Success Criteria Summary


| Phase | Gate metric                              | GO                                        | PAUSE                                  | STOP                              |
| ----- | ---------------------------------------- | ----------------------------------------- | -------------------------------------- | --------------------------------- |
| 1     | Weekly active users + retrieval hit rate | 100+ WAU, >60% hit rate                   | <50 WAU after 4 weeks                  | Hit rate <30%                     |
| 2     | Team resonance                           | Team adopts cross-dev features by week 14 | Adoption but no measurable improvement | No team interest after demos      |
| 3     | Rule acceptance rate                     | >50% rule acceptance, >20% Pro adoption   | <30% acceptance                        | Rules don't change agent behavior |


**The single metric across all phases:** Are memories being retrieved and actually used by agents to produce better output?

---

## Business Operations

### Distribution

**Primary:** `npm install -g aide-memory && aide-memory init` -- one-command install, writes rules files for ALL supported tools by default (no detection needed -- if a tool is not installed, the rules file sits unused), sets up hooks, creates `.aide/` directory structure, configures defaults, downloads embedding model, configures `.gitignore`.

**Secondary channels:**


| Priority | Channel                      | Target                                         |
| -------- | ---------------------------- | ---------------------------------------------- |
| 1        | `npm install -g aide-memory && aide-memory init` | Everyone                           |
| 2        | `npm install -g aide-memory@<version>` | Power users (pinned version)                 |
| 3        | Claude Code plugin           | Claude Code users (marketplace discovery)      |
| 4        | Cursor adapter               | Cursor users (.cursor/hooks.json + MCP config) |
| 5        | Smithery registry            | MCP ecosystem discovery                        |
| 6        | `git clone aide-memory`      | Contributors                                   |


No account required at any step. Telemetry is on by default (anonymous counts only — disable via `AIDE_TELEMETRY=off` or `aide-memory config telemetry.enabled false`). Rules files written for all tools by default -- no auto-detection logic needed.

### Usage Tracking

**Local analytics table** (always on, private): `analytics` table in each project's SQLite cache. Columns: `event TEXT, value TEXT, tool TEXT, timestamp TEXT`. Powers `aide stats` CLI command for self-serve metrics.

**Optional anonymous telemetry** (off by default): `aide config telemetry on`. Sends only: memory count by layer, retrieval hit rate, feature flags, error types. Modeled on Homebrew's approach -- publish exactly what is sent, with sample payload in docs for transparency.

**What never leaves the machine at any tier:**

- Memory content (the `what` and `why` fields)
- Embedding vectors (can be reverse-engineered to approximate source text)
- File paths and scope patterns (reveal project structure)

### Billing

**License key system:** offline-capable. `aide activate <key>`. Purchased via Stripe or Lemon Squeezy. Stored locally as signed JWT. Validated at startup with grace period for offline use.

**Trial:** 7-day Team trial, no credit card required. Full Team features. After trial: pro features deactivate gracefully. Your memories are never deleted. Free tier tools continue unchanged. Generated config files freeze in place (not removed). Re-activation is instant -- license key unlocks features, no re-setup.

**Concrete trial-end message:** "During your trial, AIDE Memory surfaced context 47 times and generated 3 config files. Your memories are still here -- upgrade to keep the automation running."

### Privacy Commitments

- **Free tier:** zero data leaves the machine. Period.
- **Team tier:** team-facing output is readable files (JSON, markdown) committed to the repo. The user controls what gets committed via git. SQLite stays local.
- Cloud backup (if offered) is encrypted with the user's key. We cannot read it.
- No memory content used for training. No sharing across users unless explicitly in a team.

### Work-at-Work IP Risk

Using aide-memory on employer projects is a gray area worth noting: most employment contracts assign work-related IP to the employer. Storing work context in a personal tool's local database could fall under employer IP. Mitigation: local-first architecture means nothing leaves the machine, reducing risk versus cloud alternatives. Enterprise adoption (employer pays, employer controls) eliminates the gray area entirely. Go-to-market implication: lead with personal projects and OSS for Phase 1. Enterprise comes with organizational buy-in.

### Monitoring

**Internal:** Dual analytics architecture -- local SQLite `analytics` table for per-machine metrics + remote PostHog (1M free events/month) for centralized usage dashboard. Anonymized events only (event type + counts, never memory content). Opt-out via `aide-memory config telemetry.enabled false`. Sentry for error tracking. Key metrics: install rate, day-1 retention, memories per session (leading); WAU, retrieval hit rate, cross-tool usage (lagging); MRR, churn, conversion rate, trial-to-paid (revenue).

**User-facing:** `aide stats` CLI command showing memory count by layer, retrieval frequency, health indicators. Team tier adds richer analytics and config generation history.

---

## Naming

### The Name

**AIDE Memory.** AIDE is the brand. Memory is the first product.

The word "aide" means helper. There is no expansion -- AIDE is not an acronym. The "AI" in the letters is a happy coincidence, not a backronym.

**Always use "AIDE Memory" as the compound name. Never use bare "AIDE."** This is a firm rule for all marketing, documentation, and conversation. Reasons:

- aide.dev is taken by CodeStory (YC-backed AI IDE)
- AiDE(R) is a registered trademark for an enterprise AI platform
- `aide` on npm is taken (dead package)
- aider.chat causes confusion
- "AIDE Memory" is unambiguous and self-describing

Ship as `aide-memory` on npm. CLI binary is `aide`. MCP tools are `aide_recall`, `aide_remember`, etc.

### Alternative Considered

**AIRN** = AI Recall Network. npm `airn` is available. Zero namespace conflicts. Pronounceable ("airn"). "Recall" is the core verb. "Network" implies team sharing. Clean domain availability. Would require building brand from scratch with no name recognition. Kept as a fallback if AIDE trademark issues become blocking.

### Package and Tool Names (Locked)


| Surface         | Name                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| npm package     | `aide-memory`                                                                 |
| CLI binary      | `aide`                                                                        |
| MCP tools       | `aide_recall`, `aide_remember`, `aide_update`, `aide_forget`, `aide_search`, `aide_memories`, `aide_import` |
| GitHub (public) | `aide-memory`                                                                 |
| Scoped packages | `@aide/memory`, `@aide/core`                                                  |


### Names Considered and Rejected


| Name                      | Why rejected                                                     |
| ------------------------- | ---------------------------------------------------------------- |
| engram                    | Taken by Gentleman-Programming/engram (2,085 stars, 50 releases) |
| lore                      | npm taken, feels whimsical for enterprise                        |
| mnemo                     | Pronunciation ambiguity, unusual spelling                        |
| recall                    | npm taken, Microsoft Recall controversy                          |
| sigil                     | Less obvious memory/governance connection                        |
| kno                       | Unusual spelling, hard to search                                 |
| AI Decision Engine        | Too narrow -- doesn't cover memory, context, learning            |
| AI Developer Ecosystem    | "Ecosystem" is the vaguest word in tech                          |
| AI Driven Experience      | Marketing filler, says nothing about the product                 |
| AI Development Engine     | Infrastructure feel but too generic                              |
| AI Developer Experience   | DX-focused but indistinguishable from other "DX" tools           |
| AI Decision & Enforcement | Accurate but unwieldy as a name                                  |


### Validation Checklist

- `npm view aide-memory` -- available
- Domain: `aide-memory.dev`, `useaide.dev`
- GitHub org: `github.com/aide-memory`
- USPTO TESS trademark search for "aide" in software class
- Legal review of AiDE(R) trademark conflict
- 5-developer gut check: "What would you expect a tool called aide-memory to do?"

---

## Repo Strategy & Licensing

### Structure

**Development repo:** `aide-v0` (private) -- all code lives here. Single workspace, maximum velocity.

**Public repo:** `aide-memory` on GitHub -- NO source code (proprietary freeware). Contains: README, installation instructions, documentation, issue tracker, release binaries. Community interacts via issues and docs, not code contributions.

**Distribution:** npm package (minified/bundled), website download, GitHub releases (binaries). Code is proprietary — never mirrored, never open.

### Distribution Priority


| Priority | Channel                      | Install experience                                              |
| -------- | ---------------------------- | --------------------------------------------------------------- |
| 1        | `npm install -g aide-memory && aide-memory init` | One-command install, writes rules for all tools, sets up hooks + .aide |
| 2        | `npm install -g aide-memory@<version>` | Pinned version, global binary                       |
| 3        | Claude Code plugin           | One-command marketplace install                                  |
| 4        | Cursor adapter               | .cursor/hooks.json + MCP config                                 |
| 5        | Smithery registry            | MCP server discovery listing                                    |
| 6        | `git clone aide-memory`      | Contributors                                                    |


### Licensing

**Decision: Proprietary freeware.** Free to use, code never visible. Distributed as minified npm package or compiled binary. Pro/Enterprise is also proprietary. No code ever becomes open source. Other options (FSL, BSL) remain documented below for reference.

#### Option 1: FSL (Functional Source License)

| Aspect | Detail |
| ------ | ------ |
| Free tier code | Source-available. Cannot be used to build a competing product. |
| Conversion | Converts to Apache 2.0 after **2 years** per release. |
| Pro/Enterprise | Proprietary forever. Never visible, never converts. |
| Tradeoff | Code visible (community trust + contributions) but old versions become open after 2 years. |
| Used by | Sentry, GitButler, Liquibase |

#### Option 2: BSL (Business Source License)

| Aspect | Detail |
| ------ | ------ |
| Free tier code | Source-available. Cannot be used to build a competing product. |
| Conversion | Converts to Apache 2.0 after **4 years**. |
| Pro/Enterprise | Proprietary forever. Never visible, never converts. |
| Tradeoff | Longer protection (4 years vs 2) but more confusing terms. Variable "Additional Use Grant" creates ambiguity. |
| Note | Sentry moved away from BSL to FSL. |

#### Option 3: Proprietary Freeware

| Aspect | Detail |
| ------ | ------ |
| Free tier code | Closed source. Free to use but code never visible. Distributed as compiled binary or minified package. |
| Conversion | Never. Code is never visible. |
| Pro/Enterprise | Proprietary forever. Never visible, never converts. |
| Tradeoff | Maximum protection (nobody ever sees code) but no community contributions, less trust signal, harder for users to debug. |

**What "converts after 2/4 years" means (FSL/BSL only):** After the conversion period, someone can take that *specific old version* of the free tier code and fork it, modify it, even build a competing product. BUT: the latest version is always protected (clock resets per release). A competitor can only fork 2-4 year old code. If you are actively developing, the latest is always protected.

**What never changes regardless of licensing choice:**
- Pro/Enterprise code is **proprietary forever** -- lives in `src/pro/`, never mirrored to public repo, never becomes open source
- Users' memory data is always theirs -- licensing applies to the tool's code, not user data

**For npm packages and code visibility:** JavaScript is technically readable in `node_modules`. Options for closed-source distribution: minify/bundle (impractical to read/fork), distribute as compiled binary via `pkg` or `bun compile`, or accept practical obscurity of minified code.

### Comparison of All Licensing Approaches

| License                    | Code visible | Protection period | Community contributions | Enterprise comfort | Assessment |
| -------------------------- | ------------ | ----------------- | ---------------------- | ------------------ | ---------- |
| MIT / Apache               | Yes | None | Yes | High | Core is fully forkable. A competitor clones the free tier wholesale. No protection. |
| AGPL (claude-mem's choice) | Yes | Copyleft (perpetual) | Limited | **Low** -- many companies have blanket "no AGPL" policies | Does not actually prevent competition. Actively repels enterprise. |
| **FSL**                    | Yes | 2 years per release | Yes | High | Best balance of protection + community trust. Used by Sentry, GitButler, Liquibase. |
| **BSL**                    | Yes | 4 years | Yes | Medium | Longer protection but more confusing terms. Sentry moved away from it. |
| **Proprietary freeware**   | No  | Perpetual | No | High | Maximum protection. No code visibility. Less trust, harder to debug. |
| SSPL                       | Yes | Copyleft (nuclear) | Limited | **Very low** | Nuclear overkill for a developer tool. Massive adoption stigma. |


### Migration Path


| Phase      | Action                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| Phase 1    | No structural changes. Build in `aide-v0`.                                                               |
| Pre-launch | Move old code to `src/old/`, set up npm publish workflow (minified/bundled), create public GitHub repo (docs + issues + releases only, no source), write README + docs. |
| Phase 2    | Create `src/pro/`, add publish-pro.yml, implement license key validation. Evaluate Turborepo if needed.  |


**Transition to monorepo** when any of: a second developer joins full-time, 10+ external PRs on the public mirror, Team features need independent release cadence, or build-time separation causes friction more than once per week.

---

## Future Expansion (Post Phase 4)

**Org-level memory.** Enterprise customers managing multiple teams across repositories. Three-layer hierarchy: org policies, team conventions, personal preferences. Different buyer (CTO/VP Engineering), different tech (cross-repo sync, permission models). Build only when enterprise customers ask for it.

**Memory as input to code review.** Don't build a competing review tool. Build the memory layer that makes existing review tools (Qodo, CodeRabbit, Anthropic Code Review) smarter. "The team decided three weeks ago to use composition over inheritance for this module, and this PR violates that decision" -- that context lives in session memory, not PR history.

**OSS memory packs.** Contributors to open-source projects export factual, non-personal memories as importable packs. Maintainers curate an official `.aide/memories.json` in the repo. New contributors install it and their agents immediately know project conventions. Requires: privacy boundary design, trust model for third-party memories, noise management at scale.

**Personal dev profile.** Cross-project preferences that follow a developer across codebases. Style preferences, tool configurations, workflow patterns. Distinct from project-scoped memories -- these are about the developer, not the codebase.

**EU AI Act compliance features.** August 2026 deadline. Agent action audit trail with cryptographic linking (hash chains for tamper evidence). Traceable context chain: what memories informed which AI-generated code. Positioned as the compliance layer for teams already using AIDE Memory for memory and governance.

**Enterprise workflow integration.** GitHub Enterprise (PR gates informed by graduated rules), Jira (memory-informed ticket context), Azure DevOps (pipeline integration). Build when enterprise customers name specific integrations they need, not before.

**Orchestration layer.** The framework may evolve to offer orchestration for: memory management automation (batch dedup, stale detection across projects), codebase understanding through accumulated memories, documentation generation from memory, and generating tool-specific config files (CLAUDE.md, .cursorrules, etc.). Design principles:

- **Default:** use the native tool's model for all reasoning to avoid extra cost.
- **Opt-in only.** Never required. The tool must work fully without orchestration.
- **Cost awareness:** Extra model cost is a significant adoption barrier. Any orchestration that calls an LLM outside the developer's existing agent session must be evaluated carefully and justified by clear value.
- If orchestration features require capabilities beyond what native models provide (e.g., batch processing across projects, cross-repo analysis), evaluate adding a BYOM (bring your own model) option for CI and enterprise contexts rather than bundling a specific model.

**BYOM (Bring Your Own Model).** For CI pipelines and enterprise deployments where no interactive agent is running, allow customers to configure their own model endpoint for operations that require reasoning (cleanup, config generation, context summarization). This avoids AIDE Memory needing to bundle or pay for model access. Enterprise feature only -- individual and team tiers always use the native tool's model.

---

### AIDE Product Suite — Additional Product Ideas

The original AIDE codebase included architecture scanning (tree-sitter, health scoring, dependency graphs). These capabilities, combined with ideas from the competitive landscape, suggest a suite of complementary products under the AIDE brand. These are NOT part of AIDE Memory — they are separate products that could share infrastructure.

**AIDE Map / AIDE Docs — Codebase Understanding & Documentation**

Similar to Repowise (282 stars in 2 days). Generates structured, queryable documentation from codebase with confidence scores that degrade as code drifts. MCP server so AI agents query structured knowledge instead of reading raw files. Could revive the original AIDE's architecture scanning capabilities (tree-sitter, health scoring) in a new form. Complementary to AIDE Memory: Map tells agents WHAT the code does, Memory tells agents WHY it was built that way.

**AIDE Skills — Documentation-to-Skills Pipeline**

Similar to Skill Seekers. AST parsing + documentation cross-referencing to detect where docs lie vs where code moved on. Packages documentation as installable AI skills with conflict detection. Could feed into AIDE Memory's pre-set packs system — automatically generate guideline memories from verified documentation.

**AIDE Core — Original Architecture Scanner Revived**

The existing `aide-v0` codebase has tree-sitter WASM for code analysis, health scoring, dependency graphs, coupling metrics. This could become a codebase intelligence layer that feeds into both AIDE Memory (structural memories) and AIDE Map (documentation). Currently deprioritized but the code exists in `src/old/`.

**Pre-Train / Init Scan Integration**

The `aide init --scan` feature in Phase 1 is a lightweight version of AIDE Map — scanning the codebase to pre-populate structural memories. If AIDE Map becomes a separate product, the init scan could consume AIDE Map's output as a richer initial memory set. For now, the scan is self-contained and doesn't require AIDE Map.

**How these relate:**

```
AIDE Map (what the code does) ──────┐
                                    ├──→ Developer's agent has full context
AIDE Memory (why it was built) ─────┤
                                    ├──→ Better decisions, fewer mistakes
AIDE Skills (verified docs) ────────┘

AIDE Core (structural analysis) ──→ Feeds into Map + Memory
```

These are future considerations only. Build AIDE Memory first. Evaluate suite expansion based on user demand and market signals.

---

## Sources

### Original Sources (Mar 2026)

- SonarSource 2026 State of Code Developer Survey
- CodeRabbit: AI vs Human Code Generation Report (2026)
- VentureBeat: Why AI Coding Agents Aren't Production-Ready
- Stack Overflow: Are Bugs and Incidents Inevitable with AI Coding Agents? (Jan 2026)
- Addy Osmani: My LLM Coding Workflow Going Into 2026
- Max Woolf: An AI Agent Coding Skeptic Tries AI Agent Coding (Feb 2026)
- DEV Community: Predictions for MCP and AI Coding in 2026
- Claude Code GitHub Issue #2954: Context Persistence
- Claude Code GitHub Issues #7530, #18866: Context loss during compaction (350+ comments)
- Claude Code Hooks documentation: PreCompact, PostCompact hook events
- TechCrunch: Anthropic Launches Code Review Tool (Mar 9, 2026)
- Google: Gemini Embedding 2 (Mar 10, 2026)
- Andrew Ng / MarkTechPost: Context Hub
- Sentry: Introducing the Functional Source License
- Armin Ronacher: FSL -- A Better Business/Open Source Balance Than AGPL
- FOSSA: Business Source License Explained; AGPL License 101
- Open Core Ventures: AGPL is a Non-Starter for Most Companies
- DIRECTION_CHAT.txt conversations (Mar 1-9, 2026)
- MVP_IMPLEMENTATION.md, HOOKS_IMPLEMENTATION.md, PROTOTYPE.md, RESEARCH.md

### March 31, 2026 Competitive Analysis Sources

- claude-mem v10.6.3 (43,856 stars) -- OpenClaw Gateway, system prompt injection, RAD open standard, Gemini CLI integration
- engram by Gentleman-Programming (2,085 stars, 50 releases) -- Go binary, 8 agent integrations, SQLite + FTS5
- Qodo Series B ($70M, Mar 30 2026) -- Continuous Learning Rules System, Walmart/NVIDIA/Red Hat customers
- Massu (massu-ai/massu) -- open-source governance platform, session memory + rules + team sharing + rule packs, 72 MCP tools, 11 hooks
- Delimit (delimit-ai/delimit-mcp-server, 10 stars) -- memory + governance + PR gates, 171 MCP tools
- memories.sh / webrenew/memories (20 stars) -- generates config files from learned memories
- cli-continues -- cross-tool session handoff, 14 tools, 182 paths
- Copilot Memories (VS 2026) -- detects corrections, saves to copilot-instructions.md
- Claude Code Auto Dream (Mar 2026) -- automated memory consolidation (prune/merge/resolve)
- HAM / Hierarchical Agent Memory (goham.dev) -- directory-level CLAUDE.md distribution
- CodeYam -- file-level rule injection based on active files
- agent-memory-mcp (ipiton) -- directory-level via allowlisted paths
- Hindsight (6,714 stars) -- 5 releases in March, bank scoping
- Mem0 / OpenMemory (51,565 stars) -- previously raised $24M
- xmemory -- $4M pre-seed (March 2026)
- SuperMemory ($2.6-3M funded, 16.9K stars) -- SOC2/HIPAA, horizontal memory API
- OpenClaw (342K stars) -- AI assistant platform
- Cursor v2.1.x -- removed native memory (opportunity for third-party tools)
- DIRECTION_MARCH31.md session findings

### April 2, 2026 Architecture Session Sources

- Apr 2 strategic session -- storage architecture, naming, licensing, free/pro gating, verified user sentiment
- Google AI coding study (96 engineers, 21% faster individually) -- cited in The Copilot Paradox
- METR real-world study (16 devs, 19% slower with coordination) -- cited in The Copilot Paradox
- Repowise (282 stars in 2 days) -- structured codebase wiki with confidence scores, MCP server, claims 50% token reduction
- Skill Seekers -- AST parsing + doc-vs-code conflict detection, 26 MCP tools
- Verified claude-mem user sentiment: issues #609, #632, #641, #758 (CLAUDE.md pollution), #1546 (72% summary failure), #701 (process leaks), #1488 (token cost), #781 (uninstall broken), #1251 (security audit HIGH)
- Verified engram user sentiment: issues #87, #124, #133, #137 (agents don't use voluntarily), #128 (infinite loops), #132 (empty observations), #116 (session inflation)
- Verified memories.sh/omem/HAM: zero real users (0 external issues, npm downloads collapsed)
