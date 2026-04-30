# Phase 0 + Phase 1 Technical Spec

> Source of truth: `docs/PRODUCT_VISION.md` (1,653 lines, Apr 2, 2026).
> Decided items NOT re-debated: storage architecture (one-file-per-memory), naming (AIDE Memory).
> **Phase 1 pro-gating update (Apr 21, 2026):** Phase 1 ships with every setting public and no paid tier. The `pro: false` flag in `defaults.json` is kept as a stable schema placeholder only — no gating logic enforces it. Any paid-tier features are deferred to Phase 2+ and will be re-evaluated then.
> Created: April 6, 2026. Updated: Apr 21, 2026 (all settings ungated, `--scan` removed, `computeScopedForPath` introduced as single source of truth for focused-scope blocking, `resyncDerivedArtifacts` centralizes config → artifact drift-repair).
>
> **Living document.** This spec is updated as implementation progresses. Agents mark checkboxes in Section 3 as work completes and add implementation notes inline.

---

## Implementation Progress

> Updated by tech lead as implementation proceeds. If session is interrupted, resume from here.

| Sprint | Status | Components | Notes |
|--------|--------|-----------|-------|
| Sprint 1 | **COMPLETE** | P1.1 Storage, P1.2 Types, P1.3 FTS5, P1.8 Rules | All merged. 305 tests. Storage: file-per-memory + SQLite cache. FTS5: BM25 search. Rules: 5 templates. |
| Sprint 2 | **COMPLETE** | P1.5 Hooks, P1.6 aide_update, P1.7 CLI, P1.11 Config | All merged. 422 tests. 4 hooks, 7 MCP tools, 11 CLI commands, config system. |
| Sprint 3 | **COMPLETE** | P1.10 Sync, P1.12+P1.13 Analytics, P1.14+P1.15 Init+Scan | All merged. 478 tests. Sync: 20 tests, conflict detection. Analytics: 17 tests. Init: 11 tests, Scan: 8 tests. |
| Sprint 4 | **COMPLETE** | P1.4 Embeddings, P1.16 Package | All merged. 533 tests. Embeddings: Transformers + Ollama backends, 34 tests. Package: npm setup, 21 tests. |
| Sprint 5 | **COMPLETE** | P1.20 Update, mcp-smoke fix, integration polish | All merged. **544 tests passing, 0 controllable failures.** 4 remaining failures are external service connections (ConPort/mcp-memory-service). TypeScript clean. |
| Fast-follow: Hook Visibility | **COMPLETE (Apr 22 2026)** | `hooks.visible` config, systemMessage on 5 hooks, reason-text unchanged, aide_update prompts, Option G spec | Branch: `feature/phase-1-hook-visibility`. 677 tests passing + 12 new + shell behavior test. Details below. |
| Phase 0 | MANUAL | P0.1-P0.6 Domain, Legal, Repo, npm, Landing, Docs | Requires human action |

### Fast-follow: Hook Visibility (Apr 22 2026) — What Shipped vs What Will Be Follow-Ups

**Shipped on `feature/phase-1-hook-visibility`:**
- New `hooks.visible` config (default `true`) — single global toggle. Flipping to `false` hides all user-facing `aide-memory · ...` systemMessage lines; hooks still function (agent behavior + block enforcement unchanged).
- `systemMessage` wired on soft-inject paths: `pre-read-recall`, `pre-edit-recall`, `pre-search-nudge`, `detect-correction`, `session-start-clear`
- `systemMessage` wired on hard-block paths: `pre-read-recall` (block branch), `pre-edit-recall` (block branch), `stop-remember` (correction-pending + schedule)
- Every visible event leads with `aide-memory · ...` for brand consistency + mentions the relevant function name (`aide_recall` / `aide_search` / `aide_remember`)
- Hard-block systemMessages include `(expected flow)` / `(expected)` reassurance to counteract Claude Code's hardcoded "PreToolUse:X hook returned blocking error" label (confirmed unfixable via binary decompile — mem #310)
- Agent-facing reason text updated everywhere `aide_remember` is prompted: now says `(or aide_update if an existing memory needs revision)` — 6 handlers.ts locations + all 5 rules templates (claude-code, codex, copilot, cursor, windsurf) + `.claude/rules/aide-memory.md`
- `SessionStart` switched from plain-stdout emit to JSON envelope to carry `systemMessage`

**Deferred to Phase 1 follow-ups:**
- **`recall.mode: "agent" | "autoInject"` (Option G)** — architectural alternative that bypasses the PreToolUse "blocking error" label entirely by having hooks inject memory bodies directly instead of prompting aide_recall. Full design at `docs/specs/PHASE_1_FOLLOWUP_AUTO_INJECT_RECALL.md`. Default will be `"agent"` when shipped (current behavior preserved).
- **post-search-check hook** — PostToolUse:Grep/Glob emits `aide-memory · aide_search not used — N memories may be relevant` if aide_search was skipped after the pre-search nudge. Needs new hook file + cache-file tracking.
- **Anthropic feature request** — request a non-alarming label option for intentional PreToolUse deny decisions (no FR exists today, we'd be first).

**Platform transparency (per mem #320):** user-facing docs (external README + FAQ) explicitly explain that "PreToolUse:Read hook returned blocking error" is a Claude Code platform-rendered label that aide-memory cannot suppress, and list all configurable levers users have (`hooks.visible`, `hooks.read.maxBlocks`, `hooks.edit.maxBlocks`, `hooks.search.mode`, `hooks.correction.enabled`, `hooks.precompact.mode`, `memories.softening.threshold`, future `recall.mode`).

### Manual Intervention Guide

Each task below has step-by-step instructions. Three automation approaches:

| Approach | Tool | Best for |
|----------|------|----------|
| **COWORK** | Claude Desktop → Cowork (with Computer Use toggle ON) | Browser automation, GUI clicking, multi-step desktop tasks. Can run parallel sub-agents. |
| **CLAUDE CODE** | Claude Code CLI (this tool) | Code generation, testing, file manipulation. Spin off agents in worktrees. |
| **HUMAN ONLY** | You | Credential entry, legal decisions, subjective review, demo recording |

**Computer Use = GUI clicking capability WITHIN Cowork.** Toggle it on in a Cowork session to let Claude see your screen, click, type, navigate browsers, open apps.

**How to execute:** Open `docs/specs/PHASE_0_1_SPEC.md`, go to "Manual Intervention Guide" section, and:
1. **COWORK tasks:** Paste each COWORK prompt into a Cowork session (can batch independent ones). Cowork runs parallel sub-agents.
2. **CLAUDE CODE tasks:** Already handled in this Claude Code session — no action needed from you.
3. **HUMAN tasks:** Require your judgment (legal decisions, subjective scoring, credential entry).

### CLAUDE CODE Tasks (handled in this session — no action needed)
- [x] P0.6 User docs — 8 pages generated in `docs/user/`
- [x] Launch marketing content — 5 pieces generated in `docs/marketing/`
- [x] P0.3 Public README — generated in `docs/PUBLIC_README.md`
- [x] P0.5 Landing page content — generated in `docs/LANDING_PAGE_CONTENT.md`

---

#### P0.1 — Domain Registration (COWORK ✅ DONE)
Completed via Claude Cowork + Computer Use. Both `aide-memory.dev` and `aide-memory.com` purchased on Cloudflare.
- [x] Domains registered (aide-memory.dev + aide-memory.com)
- [x] DNS configured
- [x] DNSSEC enabled
- [x] Email forwarding active (hello@aide-memory.dev → personal email)
- [x] .com → .dev redirect rule configured

#### P0.2 — Legal (COWORK Tasks A/B/C + HUMAN)
Included in MASTER COWORK PROMPT below (Tasks A, B, C). Company registration is your decision — can defer to Phase 2.
- [x] Trademark search completed (MEDIUM-HIGH risk — AiDE® by ValueLabs is a conflict; see docs/legal/trademark-search-results.md)
- [x] EULA drafted
- [x] Terms & Conditions drafted
- [ ] Company registration decision made (DEFERRED)

#### P0.3 — Public GitHub Repo (COWORK Task D + CLAUDE CODE ✅)
COWORK: Task D in master prompt. CLAUDE CODE: `docs/PUBLIC_README.md` generated, ready for upload.
- [x] GitHub org created
- [x] Repo created with README and issue templates
- [x] License file verified on GitHub (LICENSE file exists in repo)
- [ ] PUBLIC_README.md uploaded to repo (PENDING — generated in docs/PUBLIC_README.md, needs upload to GitHub)
- [x] GitHub Actions release workflow configured (.github/workflows/release.yml)

#### P0.4 — npm Package Reservation (COWORK Task E)
Included in MASTER COWORK PROMPT (Task E). Will need your npm credentials when prompted.
- [x] npm account ready
- [x] `aide-memory` name reserved on npm (currently aide-memory@0.5.14 live; pre-0.5.0 versions unpublished per HANDOFF_MINIFIED_PUBLISH.md)
- [x] Publish workflow tested
- [x] Verification step completed (VERIFIED at npmjs.com — aide-memory@0.5.14 live)

#### P0.5 — Landing Page (COWORK Task F + CLAUDE CODE ✅)
COWORK: Task F in master prompt (scaffold Nextra site, deploy to Vercel, connect domain). CLAUDE CODE: `docs/LANDING_PAGE_CONTENT.md` generated. Repo name: `aide-memory-web`.
- [x] Next.js + Nextra site scaffolded (COMPLETE — Nextra repo created with theme, built pages in pages/)
- [ ] Deployed to Vercel (PENDING — site built locally, needs Vercel deployment)
- [ ] Domain connected (PENDING — site deployed, then connect aide-memory.dev CNAME)
- [x] Content written and published (COMPLETE — landing page, docs, features, FAQ, architecture pages created; theme configured)

#### P0.6 — User Documentation (CLAUDE CODE ✅ DONE)
8 pages generated in `docs/user/`: quick-start, cli-reference, mcp-tools, configuration, hooks, troubleshooting, architecture, index.

#### P1.9 — Cursor Validation (COWORK)
Included in MASTER COWORK PROMPT (Cursor validation section — repeats all 5 scenarios in Cursor).

**2026-04-23 — UNBLOCKED via full Cursor-support plan:** see [`CURSOR_ONBOARDING.md`](./CURSOR_ONBOARDING.md) for the phased implementation (C1–C8) covering the EditorAdapter abstraction, init-time `.cursor/hooks.json` + `.cursor/mcp.json` generation, per-hook envelope translation, platform caveat workarounds (broken `sessionStart.additional_context`, informational-only `beforeSubmitPrompt`, no inline `systemMessage`), and per-editor validation matrix. P1.9 + P1.17 both complete once Phase C8 validation passes.

- [ ] MCP server configured in Cursor via adapter-generated `.cursor/mcp.json` (Phase C2)
- [ ] Rules file read by Cursor agent (already generated today — unchanged)
- [ ] `.cursor/hooks.json` generated by init for all Cursor hook events (Phase C2)
- [ ] Hook dispatcher translates Cursor stdin/stdout envelopes (Phase C3)
- [ ] Deferred-SessionStart workaround for bug #158452 (Phase C4)
- [ ] One-turn-delay correction flow validated (Phase C5)
- [ ] 5 scenarios run and documented (Phase C8)
- [ ] Any Cursor-specific issues noted (Phase C8)

#### P1.17 — Pre-ship Validation (COWORK — 5 scenarios)
Included in the master Cowork prompt below. See "MASTER COWORK PROMPT" section. Runbook ready at docs/validation/PHASE_0_1_INTEGRATION_TESTING.md.

Cursor coverage now tracked in [`CURSOR_ONBOARDING.md`](./CURSOR_ONBOARDING.md) §6 — the per-editor matrix (Claude Code column + Cursor column) is the canonical validation doc at `docs/validation/E2E_VALIDATION.md` (consolidated in Phase C7, 2026-04-23 — replaces the older `MANUAL_E2E_VALIDATION.md` + `PHASE_1_RESULTS.md`).

- [ ] 5 scenarios run in Claude Code (PENDING — runbook ready, runnable via `aide validate`; user to execute)
- [ ] 5 scenarios run in Cursor (PENDING — blocked on CURSOR_ONBOARDING Phase C1–C7 implementation)
- [ ] Results documented in `docs/validation/E2E_VALIDATION.md` per-scenario Runs tables (PENDING — runbook ready, awaiting execution)
- [ ] Decision: PASS (ship) or FAIL (fix issues first) (PENDING — awaiting validation run)

#### P0.5.2 — Logo Exploration (COWORK Task F2)
COWORK: Task F2 in master prompt.
- [x] Logo exploration document created (logo-exploration.md with 4 design concepts)
- [x] Primary logo generated (logo.svg — brain + circuit hybrid)
- [ ] Multiple logo options saved (DEFERRED — spec calls for 3-5 options in docs/branding/logo-options/, currently 1 primary logo; can extend in Phase 2)

#### P1.18 — Plugin/Marketplace (COWORK)
Included in master prompt below. Research documented in docs/specs/PLUGIN_STATUS.md.
- [x] Claude Code marketplace research completed (documented in PLUGIN_STATUS.md)
- [x] Cursor marketplace research completed (documented in PLUGIN_STATUS.md)
- [ ] Actual submission to Claude Code marketplace (DEFERRED — research complete, submission for Phase 2)
- [ ] Actual submission to Cursor marketplace (DEFERRED — research complete, submission for Phase 2)
- [ ] MCP Registry submission (DEFERRED — submission for Phase 2)

#### P1.19 — Demo Recordings (COWORK + HUMAN)
Included in master prompt below. You screen-record while Cowork executes demos.
- [ ] Individual clips recorded (6) (DEFERRED — awaiting user screen recording start; demo runbook ready)
- [ ] Full flow demo recorded (DEFERRED — awaiting user screen recording start)
- [ ] Converted to GIFs for README/landing page (DEFERRED — awaiting recording completion)

#### P1.21 — User Documentation (CLAUDE CODE ✅ DONE)
8 pages in `docs/user/`. No action needed.

#### Launch Marketing Content (CLAUDE CODE ✅ DONE)
5 pieces in `docs/marketing/`. Publishing is in the master prompt below.

---

### MASTER COWORK PROMPT (Historical — April 9, 2026)

<details>
<summary>Historical: Cowork master prompt (no longer needed — tasks completed or deferred)</summary>

**Paste this entire block into ONE Cowork session. Cowork will spin off sub-agents for each independent task.**

```
You are completing the remaining launch tasks for AIDE Memory — a persistent, path-scoped memory layer for AI coding agents. Published as `aide-memory` on npm.

Codebase: /Users/meky/code/aide-v0 (branch: feature/phase-1)
Landing page repo: aide-memory-web/ inside the codebase (separate git repo, remote: aide-memory/aide-memory-web)
Public GitHub repo: aide-memory/aide-memory
npm package: aide-memory (version 0.5.14 live)
Domain: aide-memory.dev (live on Vercel, connected via Cloudflare CNAME)

IMPORTANT: All sub-agents MUST use Opus 4.6 — never Sonnet or Haiku.

DESKTOP COMMANDER: You have access to the Desktop Commander extension for terminal and desktop automation. Use it to open Terminal windows, start/close Claude Code sessions, run commands, and control desktop apps. For tasks that need a Claude Code session (like validation), use Desktop Commander to open Terminal, run `claude` to start a session, execute the steps, then close it.

PARALLELIZATION: Spin off separate sub-agents for ALL independent tasks. Run as many in parallel as possible. DO NOT wait sequentially when tasks are independent — kick off ALL parallel tasks at once. Only go sequential when there's an explicit dependency.

WHAT'S ALREADY DONE (do NOT redo):
- Domain registration (aide-memory.dev + .com on Cloudflare) ✅
- Vercel deployment (aide-memory.dev live, SSL provisioned) ✅
- Legal: trademark search, EULA, Terms & Conditions ✅
- GitHub: org, repo, README, issue templates, LICENSE, Actions workflow, NPM_TOKEN ✅
- npm: aide-memory@0.5.14 published and verified ✅
- Landing page: Nextra site built with content, pages, dark theme ✅
- User docs: 8 pages in docs/user/ ✅
- Marketing content: 5 pieces in docs/marketing/ + publishing guide ✅
- Analytics: local SQLite + PostHog HTTP integration + recall-log CLI ✅
- Plugin research: documented in docs/specs/PLUGIN_STATUS.md ✅
- Hook & Recall Refinement: 9 hooks implemented, session-scoped tracking, scoped-only blocking, round-robin ranking, scope-first recall, search modes (auto/keyword/semantic), correction detection flow, SessionStart auto-injection, priority field, embedding fix ✅
- All hook smoke tests (28 automated + 14 live scenarios) passing ✅
- Recall quality verified across 22 aide_recall combinations ✅

============================
PHASE 1 — PARALLEL GROUP (all independent — run simultaneously)
============================

TASK 1 — Validation (Claude Code agent via Desktop Commander)
Run 16 validation scenarios. Use Desktop Commander to open Terminal + Claude Code sessions.
1. Rebuild first: cd /Users/meky/code/aide-v0 && git pull && npm install && npm run build && npm link
2. Read verification scenarios V1-V14 from this spec (section 12.3 in Hook & Recall Refinement Plan)
3. Also read the runbook: /Users/meky/code/aide-v0/docs/validation/PHASE_0_1_INTEGRATION_TESTING.md
4. Run ALL 16 scenarios — spin off parallel agents for independent scenarios (V1-V5 can run in parallel, V6 needs separate session, V10 needs two sessions, etc.)
5. For each scenario, observe and record BOTH:
   QUANTITATIVE: Did the hook fire? Block or soft? Correct session tracking? Correct file format (file|, ids|)?
   QUALITATIVE: Are returned memories relevant to the queried path? Scoped before project-wide? Correct layer ordering? Round-robin representation? Are topics in the nudge preview accurate?
6. For each aide_recall call, verify:
   - Top results are SCOPED to the queried path (not generic project-wide)
   - area_context surfaces first for directory queries
   - File-specific memories surface first for file queries
   - All 4 layers get representation via round-robin
   - Keyword boost works when query is provided
7. For each hook interaction, verify orchestration:
   - Read → block → recall → re-read soft (no double block)
   - Dir trigger fires on 2nd file, not 1st or 3rd
   - Edit shares tracking with Read (no redundant block)
   - Search is always soft, silent on zero
   - Correction flag lifecycle: created → stop enforces → cleared after Stop presents once
8. Write results as new dated rows in the per-scenario Runs tables at /Users/meky/code/aide-v0/docs/validation/E2E_VALIDATION.md using the tables below
9. If any scenario FAILS: document what failed, whether it's quantitative (wrong hook behavior) or qualitative (wrong memories returned), and continue

RESULTS TABLE 1 — Per-Step Results (fill during each session):

| Session | Step | Hook | Expected | Actual | Pass? |
|---------|------|------|----------|--------|-------|
| A | A1 | Read | block | | |
| A | A2 | Track | passthrough | | |
| A | A3 | Read | soft | | |
| A | A4 | Read | block (dir) | | |
| A | A5 | Track | passthrough | | |
| A | A6 | Edit | block | | |
| A | A7 | Edit | soft | | |
| A | A8 | Read | soft (proj-wide only) | | |
| B | B1 | Search | soft | | |
| B | B5 | Search | soft | | |
| C | C1 | UserPromptSubmit | soft+flag | | |
| C | C2 | PostToolUse | passthrough+clear | | |
| C | C4 | Stop | block | | |
| D | D2 | PreCompact+SessionStart | cleanup + inject preferences/guidelines | | |
| D | D5 | Read | block (re-recall) | | |
| E | E1 | SessionStart | inject | | |
| F | F2 | Read | soft (<10 mems) | | |
| F | F3 | Edit | soft (<10 mems) | | |
| F | F4 | Search | soft (<10 mems) | | |

RESULTS TABLE 2 — Recall Quality (fill for each aide_recall/aide_search call):

| Session | Step | Path/Query | Type | Total Returned | Scoped | Project-wide | Top Result Layer | Scoped First? | All 4 Layers? | Dedup (IDs excluded) | Pass? |
|---------|------|-----------|------|----------------|--------|-------------|-----------------|---------------|---------------|---------------------|-------|
| A | A2 | src/api/routes.ts | file recall | | | | | Y/N | Y/N | N/A (first recall) | |
| A | A5 | src/api/ | dir recall | | | | | Y/N | Y/N | (count excluded) | |
| B | B2 | "auth" keyword | search:keyword | | | | | | | | |
| B | B3 | "authentication flow" | search:semantic | | | | | | | | |
| B | B4 | "auth" auto | search:auto | | | | | | | | |
| E | E2 | src/api/ | file recall | | | | | Y/N | Y/N | | |

RESULTS TABLE 3 — Remember Quality (fill for each aide_remember call):

| Session | Step | Trigger | Content Stored | Layer | Layer Correct? | Scope | Scope Correct? | Specific (not generic)? | Persisted? | Recalled Later? (step) | Pass? |
|---------|------|---------|---------------|-------|---------------|-------|---------------|------------------------|-----------|----------------------|-------|
| C | C2 | Correction | | | Y/N | | Y/N | Y/N | Y/N | E2 | |
| C | C4 | Stop prompt | | | Y/N | | Y/N | Y/N | Y/N | E3 | |
| D | D3 | SessionStart injection (save prompt removed) | | | Y/N | | Y/N | Y/N | Y/N (post-compact) | E5 | |

RESULTS TABLE 4 — Aggregate Metrics:

| Metric | Value |
|--------|-------|
| **Sessions & Coverage** | |
| Functional sessions run | /7 (A-G) |
| User scenarios run | /3 (U1-U3) |
| Total steps passed | / |
| Total steps failed | |
| **Recall Metrics** | |
| Total aide_recall calls | |
| Total aide_search calls | |
| Avg memories returned per recall | |
| Avg scoped memories per recall | |
| Avg project-wide per recall | |
| Duplicate memories across recalls (should be 0) | |
| Recall quality failures (wrong mems returned) | |
| Scoped ranked before project-wide (all queries) | /  |
| Round-robin: all 4 layers represented | / |
| Dir query: area_context ranked first | / |
| **Remember Metrics** | |
| Total aide_remember calls | |
| Layer correct | / |
| Scope correct (not always project-wide) | / |
| Content specific (not generic) | / |
| Persisted post-compaction | / |
| Persisted across sessions | / |
| **Remember→Recall Loop** | |
| Memories stored in C/D that were recalled in E | / |
| Correction from C2 appears in E2 recall? | Y/N |
| Stop memory from C4 found via E3 aide_memories? | Y/N |
| Compact memory from D3 found via E5 aide_memories? | Y/N |
| **Hook Metrics** | |
| Hook latency (Read) | ~ms |
| Hook latency (Search preview) | ~ms |
| SessionStart injection token estimate | ~tokens |
| False blocks (blocked when shouldn't) | |
| Missed blocks (soft when should block) | |
| PreCompact cleanup (tracking cleared) | Y/N |
| Correction flag created on detect | Y/N |
| Correction flag cleared after Stop presents once | Y/N |
| Tracking file format correct (file\|, ids\|) | Y/N |
| Session isolation (no cross-contamination) | Y/N |
| **User Scenarios** | |
| **U1: Team Decisions (un-discoverable from code)** | |
| Conventions followed (without) | /4 |
| Conventions followed (with) | /4 |
| First-attempt correct (without) | Y/N |
| First-attempt correct (with) | Y/N |
| Tool calls to discover patterns (without) | |
| Tool calls with aide_recall (with) | |
| aide_recall returned all 4 conventions (debug log) | Y/N |
| **U2: Correction Learning Loop** | |
| Session 1: correction stored via aide_remember | Y/N |
| Session 1: layer=guidelines (not technical) | Y/N |
| Session 1: scope=src/** (not project-wide) | Y/N |
| Session 2 (without): same mistake repeated | Y/N (expected: Y) |
| Session 3 (with): learned from correction | Y/N (expected: Y) |
| Session 3: debug log shows correction in aide_recall response | Y/N |
| Session 2 vs 3: tool call difference | |
| **U3: Behavioral Preferences** | |
| Explained approach before coding (without) | Y/N |
| Explained approach before coding (with) | Y/N |
| Functions under 30 lines (without) | Y/N |
| Functions under 30 lines (with) | Y/N |
| TODO comments added (without) | Y/N (expected: Y) |
| TODO comments added (with) | Y/N (expected: N) |
| **Efficiency (all scenarios)** | |
| Avg tool calls (without) | |
| Avg tool calls (with) | |
| Avg file reads to discover patterns (without) | |
| Avg file reads with aide-memory (with) | |
| Avg back-and-forth messages (without) | |
| Avg back-and-forth messages (with) | |

TASK 2 — PostHog Account Setup (browser agent)
Set up analytics dashboard so we can see usage data.
1. Go to posthog.com → click "Get Started Free"
2. Sign up with Google (use the same Google account as other services)
3. Create a new project named "aide-memory"
4. Go to Project Settings → copy the Project API Key (starts with phc_)
5. Save the key: open terminal, run: echo "AIDE_POSTHOG_KEY=phc_YOUR_KEY_HERE" >> /Users/meky/code/aide-v0/.env
6. Also add it as a GitHub secret: go to github.com/aide-memory/aide-memory → Settings → Secrets → Actions → New secret → name: AIDE_POSTHOG_KEY, value: the key
7. Verify: go back to PostHog dashboard, check that the project exists and is ready to receive events
8. Save result to /Users/meky/code/aide-v0/docs/specs/PHASE_0_1_SPEC.md (update PostHog checkbox)

TASK 3 — Logo Rework (browser agent)
Current logo is placeholder quality. Generate proper options.
1. Read the 4 design concepts in /Users/meky/code/aide-v0/docs/branding/logo-exploration.md
2. Go to canva.com (or figma.com or logomaster.ai) → sign in
3. For each of the 4 concepts, generate a logo:
   - Concept 1: Layered memory / stacked cards
   - Concept 2: Brain + circuit hybrid
   - Concept 3: Path/tree with memory nodes
   - Concept 4: Minimal geometric mark
4. Also generate 1 additional freestyle option (your best judgment)
5. Screenshot each logo option → save to /Users/meky/code/aide-v0/docs/branding/logo-options/ (create dir if needed)
   - Name files: option-1-stacked.png, option-2-brain.png, option-3-tree.png, option-4-geometric.png, option-5-freestyle.png
6. Create a summary: /Users/meky/code/aide-v0/docs/branding/logo-options/COMPARISON.md with thumbnail descriptions and pros/cons
7. DO NOT pick a winner — user will choose. Just present the options.

TASK 4 — MCP Registry Submission (browser agent)
Submit aide-memory to the official MCP server registry.
1. Go to github.com/modelcontextprotocol/servers
2. Fork the repo to the aide-memory org
3. In the fork, add an entry for aide-memory:
   - Follow the existing format in the repo (look at how other servers are listed)
   - Name: aide-memory
   - Description: "Persistent, path-scoped memory for AI coding agents"
   - npm package: aide-memory
   - Command: aide-memory serve
4. Submit a Pull Request from the fork to the upstream repo
5. Save the PR URL to /Users/meky/code/aide-v0/docs/specs/PLUGIN_STATUS.md (append under MCP Registry section)

TASK 5 — Claude Code Marketplace Research (browser agent)
Research only — DO NOT submit without user approval.
1. Go to docs.anthropic.com
2. Search for "Claude Code marketplace", "Claude Code extensions", "Claude Code plugins", "MCP server directory"
3. Document what submission process exists (if any), including URLs, requirements, and steps
4. If a submission process exists: draft the submission content but DO NOT submit
5. Save findings to /Users/meky/code/aide-v0/docs/specs/PLUGIN_STATUS.md (append under Claude Code section)
6. STOP and tell user what you found — user will review and decide whether to proceed

TASK 6 — Demo Setup & Recording Prep (Claude Code agent)
Set up the demo environment and create a step-by-step recording guide.
1. Create a realistic demo project at /Users/meky/code/aide-demo-project/:
   - Init a small Node.js/TypeScript project with real files (e.g., src/auth/, src/api/, src/utils/)
   - Add realistic code files with imports and dependencies
   - Run `aide-memory init` in the demo project
   - Pre-seed 3-5 representative memories using `aide-memory remember` CLI:
     * A preference: "Use dayjs not moment" scoped to src/**
     * A technical fact: "Auth uses JWT with RS256" scoped to src/auth/**
     * An area context: "API rate limiting is 100 req/min per user" scoped to src/api/**
     * A guideline: "All API responses use camelCase" scoped to src/api/**
2. Create a demo script at /Users/meky/code/aide-v0/docs/demo/DEMO_SCRIPT.md with:
   - 7 individual demo sequences (one per feature), each with:
     * Setup state (what should be on screen before recording)
     * Exact commands to type / actions to take
     * Expected output to verify
     * Suggested recording duration
   - Demo sequences:
     a. `aide-memory init` — fresh project setup (show .aide/ created, hooks installed)
     b. `aide-memory remember` — store a memory via CLI
     c. Recall in action — open a file in Claude Code, show the hook nudge + aide_recall
     d. Path scoping — show how src/auth/ memories don't appear for src/api/ files
     e. Correction capture — make a mistake, get corrected, show memory auto-stored
     f. Cross-session persistence — close Claude Code, reopen, show memories persist
     g. Full flow — init → remember → work → recall → correct → persist (1 continuous demo)
   - For each sequence, include the terminal commands AND what the user should narrate
3. Create a recording setup guide at /Users/meky/code/aide-v0/docs/demo/RECORDING_SETUP.md:
   - Recommended screen recording tool (macOS: built-in Screenshot app or OBS)
   - Terminal settings (font size 16+, dark theme, clean prompt)
   - Window dimensions for consistent GIF output
   - How to convert recordings to GIFs (ffmpeg command or gifski)
   - Recommended GIF dimensions and max file sizes for README/landing page
4. Create a landing page embed plan at /Users/meky/code/aide-v0/docs/demo/LANDING_PAGE_EMBED.md:
   - How to embed demo GIFs/videos on aide-memory.dev (Nextra supports images/video in MDX)
   - Where on the landing page they should go (hero section? features section? dedicated demo page?)
   - How blog posts can reference the same assets
   - File naming convention for final assets

NOTE on Cursor: Cursor marketplace submission is DEFERRED until after Cursor validation is complete. Do not research or submit.

============================
PHASE 2 — SEQUENTIAL (after Phase 1 tasks complete)
============================

TASK 7 — Content Review Gate (REQUIRES USER)
Present ALL public-facing content to the user for review. DO NOT proceed to Task 8 without explicit user approval.
1. List all public-facing content files for user review:
   - /Users/meky/code/aide-v0/docs/PUBLIC_README.md
   - /Users/meky/code/aide-v0/docs/marketing/launch-blog-post.md
   - /Users/meky/code/aide-v0/docs/marketing/show-hn.md
   - /Users/meky/code/aide-v0/docs/marketing/reddit-posts.md
   - /Users/meky/code/aide-v0/docs/marketing/devto-post.md
   - Landing page at aide-memory.dev
   - Demo GIFs (once user records them)
2. Ask user: "Please review each of these files. Let me know which ones need changes and I'll iterate with you."
3. Make any edits the user requests
4. Get explicit "approved for publishing" confirmation from user before proceeding
5. DO NOT proceed to Task 8 until user says all content is approved

TASK 8 — npm Republish (Claude Code agent, after validation fixes applied + content review approved)
Bump version and publish updated package to npm. This must happen before marketing so links/install commands reference the latest version.
1. Apply any fixes discovered during validation (Task 1)
2. Update version in package.aide-memory.json (bump minor or patch as appropriate)
3. Run full test suite: npm test
4. Build: npm run build
5. Tag and push: git tag v0.X.0 && git push origin v0.X.0
6. GitHub Actions auto-publishes to npm (or manual: cp package.aide-memory.json package.json && npm publish --access public && git checkout package.json)
7. Verify on npmjs.com/package/aide-memory that the new version is live
8. Update version references in PUBLIC_README.md and landing page if needed

TASK 9 — Marketing Submissions (browser agent, ONLY after Task 8 npm republish is live)
Publish pre-written marketing content. DO NOT run until user confirms content review is complete AND npm is updated.
1. Show HN: go to news.ycombinator.com/submit → paste title and URL from /Users/meky/code/aide-v0/docs/marketing/show-hn.md → submit
2. Dev.to: go to dev.to/new → paste content from /Users/meky/code/aide-v0/docs/marketing/devto-post.md → add tags: mcp, ai, developer-tools, productivity → publish
3. tldrnewsletter.com: find the link submission form → submit aide-memory.dev
4. console.dev: find the new tool submission → submit aide-memory
5. changelog.com/submit: submit aide-memory
6. Save all submission URLs/confirmations to /Users/meky/code/aide-v0/docs/marketing/SUBMISSION_RESULTS.md

============================
CHECKLIST UPDATE
============================

After completing EACH task above, update the checklist in this file (/Users/meky/code/aide-v0/docs/specs/PHASE_0_1_SPEC.md).
Find the matching "- [ ]" checkbox under the corresponding section and change it to "- [x]".
Do this after each task completes, not all at the end.

```

</details>

**Checklist after Cowork completes:**
- [x] P0.1: Domain registration (COMPLETE — aide-memory.dev + .com registered, DNS/email configured)
- [x] P0.2: Trademark search, EULA, T&C (COMPLETE)
- [x] P0.3: GitHub org + repo created (COMPLETE — repo created, PUBLIC_README.md ready for upload, LICENSE verified)
- [x] P0.4: npm package reserved + published (COMPLETE — version 0.5.14 live, verified on npmjs.com)
- [x] P0.5: Landing page scaffolded (COMPLETE — Nextra site built, content written)
- [x] P0.5: Vercel deployment (COMPLETE — user deployed, aide-memory.dev live)
- [x] P0.6: User documentation (COMPLETE — 8 pages in docs/user/)
- [x] P0.3: PUBLIC_README uploaded to GitHub (COMPLETE — pushed to aide-memory/aide-memory)
- [x] P0.3: GitHub Actions release workflow (COMPLETE — .github/workflows/release.yml)
- [x] P0.3: NPM_TOKEN secret configured in GitHub repo (COMPLETE — user added)
- [x] P1.18: Plugin status documented (COMPLETE — research done; submissions deferred until verified)
- [x] Publishing guide created (COMPLETE)
- [x] Analytics wired up (COMPLETE — logEvent calls in store add/update/remove/recall/search, telemetry.enabled respected)

---

### HOOK & RECALL REFINEMENT PLAN (April 9-10, 2026)

**Context:** During Phase 1 work, the agent rewrote the Cowork master prompt and included "Deploy to Vercel" as a task despite Vercel being already deployed (marked `[x]` in the checklist AND mentioned in stored memories). The Read hook nudged "19 memories exist" but the agent ignored it. This revealed fundamental gaps in how memories are surfaced, tracked, and enforced.

This plan covers all design decisions from the April 9-10 session: new hooks, ranking improvements, session tracking, search modes, auto-injection, and the testing strategy.

---

#### 1. ORIGIN PROBLEM

- PreToolUse(Read) nudge said "19 memories exist, call aide_recall if relevant"
- "If relevant" gave the agent an easy out — it skipped recall
- Even if recalled, "Vercel deployed" was buried mid-sentence in a large area_context memory
- The file's own checklist had `[x] Vercel deployment (COMPLETE)` 40 lines below where agent was editing
- Root cause: weak nudge + no enforcement + no preview of what memories contain

#### 2. DESIGN PRINCIPLES

1. **Block only when scoped memories exist** — block on Read/Edit only when file-specific or directory-scoped memories match the path. Project-wide-only matches get soft nudge, not block. This prevents friction on files with no targeted context.
2. **Soft for new projects** — if total memory count < 10, all hooks use soft nudges. Not enough context stored yet to justify blocking.
3. **Soft when action is ambiguous** — UserPromptSubmit corrections can't block (rejects user's message). Edit nudges are soft if Read already recalled.
4. **No enforcement when not applicable** — zero memories for path → no nudge at all. Already recalled in this session → soft only. No stale cache triggering false blocks.
5. **Session-scoped tracking** — each session gets its own tracking file via `session_id` from hook stdin JSON. Concurrent sessions are fully isolated.
6. **Minimum tokens, maximum relevance** — preview layer counts + topics, not full memory dumps. Round-robin ranking prevents layer starvation.

#### 3. CURRENT HOOK SYSTEM (10 hooks, as-built)

| # | Script | Event | Strength | What it does |
|---|--------|-------|----------|-------------|
| 1 | pre-read-recall.sh | PreToolUse(Read) | Block/Soft/Silent | ID-based blocking. Checks scoped_ids against ids| tracking. BLOCK if unseen, SILENT if covered. |
| 2 | track-recall.sh | PreToolUse(aide_recall) | Pass | Writes recalled paths to `recalled-paths-{session_id}.txt`. Resolves relative→absolute paths. |
| 3 | track-recall-post.sh | PostToolUse(aide_recall) | Pass | Extracts memory IDs from aide_recall response (array of {type,text}), writes ids| line to tracking. |
| 4 | pre-edit-recall.sh | PreToolUse(Edit, Write) | Block/Soft/Silent | ID-based blocking. Shares same ids| tracking as Read hook. |
| 5 | pre-search-nudge.sh | PreToolUse(Grep, Glob) | Soft/Silent | aide_search preview with match count. Always soft, never blocks. |
| 6 | detect-correction.sh | UserPromptSubmit | Soft | Detects corrections/decisions/preferences via regex. Nudges aide_remember. Writes correction-pending flag. |
| 7 | track-remember.sh | PostToolUse(aide_remember) | Pass | Clears correction-pending flag file. Silent. |
| 8 | stop-remember.sh | Stop | Dynamic 3→5→10. Silent between blocks. | "Anything non-obvious worth persisting?" Dynamic interval (block every 3 for turns 1-9, every 5 for 10-29, every 10 for 30+). Correction-pending always blocks. |
| 9 | pre-compact-save.sh | PreCompact | Cleanup | Clears all session tracking (exit 0). |
| 10 | session-start-clear.sh | SessionStart | Inject | Injects prefs/guidelines. Writes injected IDs to tracking. Clears on resume/compact/clear. |

**Known bugs in current system:**
- Relative/absolute path mismatch in track-recall.sh (FIXED: resolves to absolute before writing)
- UserPromptSubmit was briefly set to blocking — broke all user input (FIXED: reverted to soft)
- Read hook blocked infinitely when aide_recall was called with relative paths (FIXED: track-recall resolves paths)

#### 4. TARGET HOOK SYSTEM (9 hooks)

| # | Script | Event | Matcher | Strength | Purpose |
|---|--------|-------|---------|----------|---------|
| 1 | pre-read-recall.sh | PreToolUse | Read | Block/Soft | File + directory recall with preview |
| 2 | track-recall.sh | PreToolUse | aide_recall | Pass | Track recalled paths + memory IDs |
| 3 | pre-edit-recall.sh | PreToolUse | Edit, Write | Block/Soft | Recall before code changes (shares Read tracking) |
| 4 | pre-search-nudge.sh | PreToolUse | Grep, Glob | Soft | aide_search preview with match count |
| 5 | detect-correction.sh | UserPromptSubmit | — | Soft + flag | Detect correction, write pending flag |
| 6 | track-remember.sh | PostToolUse | aide_remember | Pass | Clear correction-pending flag |
| 7 | stop-remember.sh | Stop | — | Dynamic | Persist check + correction enforcement |
| 8 | pre-compact-save.sh | PreCompact | — | Cleanup | Save context + clear ALL session tracking |
| 9 | session-start-clear.sh | SessionStart | — | Silent + inject | Clean stale files + auto-inject preferences/guidelines |

#### 5. HOOK DETAILS

**5.1 Pre-Read Recall (ID-based blocking)**

The Read hook uses ID-based blocking. On file read, `recall-for-path.js` calls `computeScopedForPath()` in `src/memory/recall.ts` — the single source of truth for which memories count as scoped-for-blocking at a given path. Focused-mode rules (exact file + immediate parent + deeper, EXCLUDING grandparent and project-wide) are applied there, and `scoped_ids` + the layer breakdown + topics preview are all derived from the same filtered set so the integer count and the preview cannot disagree. The hook compares those IDs against the `ids|` line in the session tracking file.

Nudge format (path-based, when no IDs covered):
```
N memories for {path} (X area_context, Y technical, Z preferences, W guidelines)
  — topics: topic1, topic2, ...
Call aide_recall({paths: ['{path}']}) to load context before proceeding.
```

Nudge format (ID-based, when some IDs covered but others missing):
```
N memories for {path} not yet recalled. Call aide_recall({ids: [missing_ids]}).
```

Behavior:
- New file + NONE of scoped IDs covered → **BLOCK** (path-based message)
- New file + SOME scoped IDs covered → **BLOCK** (ID-based message with missing IDs only)
- Encountered file + unrecalled IDs → **SOFT** (ID-based message)
- All scoped IDs covered → **SILENT** (no output)
- No scoped memories for path (project-wide only) → **SILENT**
- Zero memories for path → **SILENT**
- < 10 total memories (softening) → **SOFT** (never block)

Topics: top 8 by frequency overall + 1-2 extras from any layer with zero representation in top 8. Topics come from the same memory pool that aide_recall would return (same ranking).

_Historical note: Directory trigger (blocking on 2nd file in same dir) was removed. Each file is now evaluated individually by its scoped ID coverage._

**5.2 Track Recall (PreToolUse + PostToolUse)**

PreToolUse (`track-recall.sh`) fires before aide_recall. Writes to `recalled-paths-{session_id}.txt`:
```
file|/absolute/path/to/file.ts
```

PostToolUse (`track-recall-post.sh`) fires after aide_recall returns. Parses the response to extract memory IDs (`[id]` pattern). The MCP tool response is an array of `{type, text}` objects — the script handles this format via `jq '.tool_response[]?.text'`. Writes to tracking:
```
ids|5,11,15,22,33
```

IDs are merged (deduped) with any existing `ids|` line on each write. Used for: (a) deduplication of subsequent aide_recall calls, (b) Read/Edit hook blocking decisions — ALL scoped IDs covered = SILENT, SOME missing = BLOCK or SOFT.

**5.3 Pre-Edit Recall (ID-based, shares tracking with Read)**

Fires before Edit and Write tool calls. Uses the same `ids|` tracking as the Read hook (`recalled-paths-{session_id}.txt`). The blocking logic is identical to Read: checks scoped_ids against the ids| line.

- All scoped IDs covered (from Read or prior recall) → **SILENT**
- New file + NONE of scoped IDs covered → **BLOCK** (path-based message)
- New file + SOME scoped IDs covered → **BLOCK** (ID-based message with missing IDs)
- Encountered file + unrecalled IDs → **SOFT** (ID-based message)
- No scoped memories for path → **SILENT**
- Zero memories for path → **SILENT**
- < 10 total memories (softening) → **SOFT** (never block)

Because Edit shares the same tracking file as Read, a file recalled via the Read hook is already covered for Edit — no redundant blocking.

**5.4 Pre-Search Nudge (NEW)**

Fires before Grep and Glob. Runs keyword search preview inline (~80ms, imperceptible — benchmarked).

- Matches > 0 → **soft (additionalContext)**: "N aide memories match '{query}'. Call aide_search({keyword: '{query}'})."
- Matches = 0 → **no nudge at all**
- Query already searched in this session → **soft nudge**

Tracks searched queries in `searched-queries-{session_id}.txt` (normalized: lowercase, trimmed).

Search preview runs full search (keyword + semantic fallback) since embeddings are pre-stored and total latency is ~80ms.

**5.5 Detect Correction (enhanced)**

UserPromptSubmit stays **soft** (blocking rejects user's message — discovered as bug).

Enhancement: writes `correction-pending-{session_id}.txt` flag file when correction/decision/preference detected. Flag contains the detected category.

Nudge wording:
```
{Category} detected. BEFORE doing anything else, store via aide_remember
(layer: {suggested_layer}, source: hook). If aide_remember unavailable,
write JSON lines to .aide/pending-memories.jsonl.
```

**5.6 Track Remember (NEW)**

PostToolUse on aide_remember. Clears `correction-pending-{session_id}.txt` flag. Silent — no output.

**5.7 Stop Remember (enhanced)**

Checks for correction-pending flag before the standard persist prompt:

```
If correction flag exists:
  "Correction from this turn wasn't stored. Call aide_remember for the correction.
   Also: any decisions, technical constraints, preferences, or guidelines from this conversation?
   Call aide_remember. If nothing, stop."

If no flag:
  "Any decisions, technical constraints, preferences, or guidelines from this conversation?
   Call aide_remember. If nothing, stop."
```

Stop hook wording maps directly to the four memory layers:
- decisions → area_context
- technical constraints → technical
- preferences → preferences  
- guidelines → guidelines

**5.8 Pre-Compact Save (enhanced)**

Cleanup-only. Clears all session tracking (exit 0, no output). Cannot force agent tool calls — Claude Code limitation.
Clears:
- `recalled-paths-{session_id}.txt`
- `searched-queries-{session_id}.txt`
- `correction-pending-{session_id}.txt`

**5.9 Session Start (enhanced)**

Cleanup rules by source:
- `start`: Don't touch anything. Other sessions might be concurrent.
- `clear` / `compact` / `resume`: Clear THIS session's tracking (agent loses context, must re-recall). Resume clears because resume-with-summary loses context like compact.

Auto-injects preferences + guidelines as conversation context:
- Top 15 most-recalled preferences (by recall frequency)
- All guidelines (usually few — team rules)
- Any memory with `priority: "always"` (user-marked)
- Per-layer injection controlled by `injection.preferences`, `injection.guidelines`, `injection.technical`, `injection.area_context` settings
- Capped at ~300 tokens total
- Writes injected memory IDs to `ids|` line in `recalled-paths-{session_id}.txt` so Read/Edit hooks know those memories are already in context
- Scope-specific preferences still surfaced via Read/Edit hooks

#### 6. RECALL RANKING IMPROVEMENTS

**6.1 Round-robin with limit**

Current: `limit: 5` returns top 5 by fixed layer priority (area_context > technical > preferences > guidelines). This starves lower-priority layers.

New: return top 5 by normal ranking, THEN append 1-2 from any layer with zero representation in those 5. Total 5-9 results. Area_context priority preserved when truly needed, but every layer gets at least a showing.

**6.2 Directory vs file query ranking**

- File query (`src/auth/middleware.ts`) → more-specific scopes rank higher (file-specific first, then directory)
- Directory query (`src/auth/`) → broader scopes rank higher (directory context first, then file-specific)
- Detection: query path ends with `/` = directory query

**6.3 Focused scope matching**

Grandparent scopes are excluded from blocking decisions. `scopeMatchesPath` with `focused: true` only matches the immediate parent directory + one level above. Example: for `src/api/routes.ts`, focused matching covers `src/api/**` and `src/**` but NOT `**` (project-wide). This prevents overly broad scopes from triggering blocks on every file.

**6.4 Deduplication across recalls**

Track returned memory IDs per session in `recalled-paths-{session_id}.txt` (ids| line). aide_recall filters out already-returned IDs. Zero duplicate tokens across successive recalls.

Implementation: PostToolUse(aide_recall) hook parses response text for `[id]` patterns, merges into the ids| line in the tracking file.

#### 7. SEARCH IMPROVEMENTS

**7.1 aide_search mode parameter**

New parameter: `mode: "auto" | "keyword" | "semantic"`

- `auto` (default): keyword match first → if <3 results, falls back to semantic
- `keyword`: exact substring matching only. Fast, precise. Best for function names, specific terms.
- `semantic`: embedding-based similarity only. Best for conceptual queries like "how do we handle auth."

Mode descriptions added to aide_search tool schema so agent sees them when loading the tool.

**7.2 Embedding fixes**

- Bug: `update()` doesn't regenerate embeddings → stale embedding after content change. Fix: add same embedding generation logic from `add()` to update path.
- Bug: MCP server never calls `attachEmbeddingService()`. Fix: wire up in `startServer()` if self-contained.

#### 8. SESSION-START AUTO-INJECTION

Preferences and guidelines are session-scoped (apply to all agent behavior, not file-specific). Auto-inject at SessionStart:

- Solves cases like "don't skip numbers in lists" that no file-read hook would surface
- Top 15 by recall frequency + user-marked `priority: "always"`
- All guidelines (typically few)
- Capped ~300 tokens
- Path-specific preferences still surfaced via Read/Edit hooks (showing counts in preview)

New `priority` field on memories: `"always"` = always injected at SessionStart, `"normal"` = subject to cap.

#### 9. TRACKING MECHANISM

All tracking is in hooks (not MCP server) because `session_id` is available in hook stdin JSON but NOT as an environment variable for MCP server child processes.

Files in `.aide/cache/`:
```
recalled-paths-{session_id}.txt     — file|path and ids|1,2,3 entries (no dir| entries — directory trigger removed)
stop-count-{session_id}.txt         — integer stop hook counter for dynamic interval
searched-queries-{session_id}.txt   — normalized query strings
correction-pending-{session_id}.txt — flag file (exists = correction not stored)
```

Tracking file format (`recalled-paths-{session_id}.txt`):
```
file|/absolute/path/to/file.ts
ids|1,2,3,4,10,11,12
```
The `file|` entries record which files have been encountered. The `ids|` line is a single comma-separated list of all memory IDs that have been recalled or injected this session. IDs are merged (deduped) on each write.

**ID-based blocking mechanism:** On file read/edit, `recall-for-path.js` returns `scoped_ids` (the IDs of memories scoped to the queried path). The hook reads the `ids|` line from the tracking file and compares:
- ALL scoped_ids covered in ids| → **SILENT** (no output)
- SOME scoped_ids missing from ids| → **BLOCK** or **SOFT** (depending on whether file was previously encountered)
- NONE of scoped_ids covered → **BLOCK** (path-based message for first encounter)

Lifecycle:
- SessionStart → clears THIS session's tracking on resume/compact/clear (not on fresh start). Writes injected memory IDs to ids| line.
- PreCompact → clears ALL files for THIS session (context about to be lost)
- Track hooks → write file| and ids| entries on tool calls
- Read/Edit hooks → check ids| entries for block vs soft vs silent

#### 10. EDGE CASES & MITIGATIONS

| Edge case | What happens | Mitigation |
|-----------|-------------|-----------|
| Zero memories for path | No nudge at all | recall-for-path.js returns 0 → hook exits silently |
| Agent already recalled in context | Soft nudge (path tracked) | Tracking file prevents re-block |
| Concurrent sessions | Separate tracking files | session_id-scoped filenames |
| Post-compaction | All tracking cleared | SessionStart(source:"compact") + PreCompact clearing |
| Session restore/resume | SessionStart fires | Cleans stale files, re-injects preferences |
| Relative vs absolute paths | Mismatch breaks tracking | track-recall.sh resolves to absolute |
| UserPromptSubmit blocking | Rejects user message | MUST stay soft (architectural constraint) |
| Many preferences (50+) | SessionStart dumps too many tokens | Capped at 15 + priority:"always" |
| Many directory memories | aide_recall returns too many | `limit` parameter + ranking |
| Grep with no memory matches | Unnecessary blocking | Preview checks match count → 0 = no nudge |
| Stale embeddings after update | Semantic search matches wrong content | Regenerate embedding on update() |
| Agent stores memory instead of updating doc | Project decisions end up only in aide_remember, not in spec/plan files | Two mitigations below |

**Memory-vs-doc mitigation:**

Stop hook wording broadened to prompt for appropriate persistence — not just aide_remember:
```
"Any decisions, constraints, preferences, or guidelines worth persisting?
 Store in the right place — aide_remember for cross-session context,
 relevant project docs for plans and decisions. If nothing, stop."
```
This nudges the agent to consider both persistence targets without overfitting to specific docs or patterns.

#### 11. IMPLEMENTATION ORDER

| Step | What | Files | Dependencies |
|------|------|-------|-------------|
| 1 | Fix embedding update() bug | src/memory/store.ts | None |
| 2 | Wire up EmbeddingService in MCP server | src/memory/server.ts | Step 1 |
| 3 | aide_search mode parameter | src/memory/store.ts, server.ts | Step 2 |
| 4 | Round-robin ranking + dir query inversion | src/memory/recall.ts | None |
| 5 | recall-for-path.js: per-layer topics, dir/file split | scripts/hooks/recall-for-path.js | Step 4 |
| 6 | Pre-read-recall.sh: ID-based blocking, enhanced nudge | scripts/hooks/pre-read-recall.sh | Step 5 |
| 7 | Track-recall PostToolUse: ID extraction + dedup | scripts/hooks/track-recall.sh, settings.json | None |
| 8 | Pre-edit-recall.sh (NEW) | scripts/hooks/pre-edit-recall.sh, settings.json | Step 6 |
| 9 | Pre-search-nudge.sh (NEW) + search-preview.js | scripts/hooks/pre-search-nudge.sh, scripts/hooks/search-preview.js, settings.json | Step 3 |
| 10 | Two-phase correction: flag + track-remember + stop enhancement | scripts/hooks/detect-correction.sh, track-remember.sh, stop-remember.sh, settings.json | None |
| 11 | SessionStart auto-injection | scripts/hooks/session-start-clear.sh | Step 4 |
| 12 | Stop hook wording update | scripts/hooks/stop-remember.sh | Step 10 |
| 13 | Memory priority field | src/memory/types.ts, store.ts, server.ts | None |
| 14 | PreCompact: clear all tracking types | scripts/hooks/pre-compact-save.sh | None |

#### 12. TESTING PLAN

**12.1 Unit Tests (vitest)**

| Test | What it verifies |
|------|-----------------|
| recall ranking: round-robin with limit | limit:5 with 5 mems per layer → at least 1 from each layer |
| recall ranking: file query specificity | file path query → file-specific memories rank above directory |
| recall ranking: directory query inversion | directory path query → directory memories rank above file-specific |
| recall dedup: exclude IDs | aide_recall with exclude_ids → returns only new memories |
| search mode: keyword | mode:"keyword" → only substring matches, no semantic |
| search mode: semantic | mode:"semantic" → embedding similarity matches |
| search mode: auto | mode:"auto" → keyword first, semantic fallback if <3 results |
| embedding on update | update memory content → embedding regenerated |
| embedding on add | add memory → embedding generated in background |
| embedding on remove | remove memory → embedding cleaned up |
| memory priority field | priority:"always" stored and retrievable |
| scopeMatchesPath: file covers dir | query file → matches dir-scoped memories |
| scopeMatchesPath: dir covers files | query dir → matches file-scoped memories within |

**12.2 Hook Smoke Tests (shell-based)**

| Test | What it verifies |
|------|-----------------|
| Read hook blocks on first read | Read file with unseen scoped IDs → block |
| Read hook silent after recall | Read file with all scoped IDs covered → SILENT (no output) |
| Read hook silent on no memories | Read file with 0 memories → no output |
| PostToolUse writes ids| correctly | After aide_recall, ids| line in tracking contains returned memory IDs |
| Session-inject writes injected IDs | SessionStart injection writes injected memory IDs to ids| in tracking |
| Edit hook blocks if not recalled | Edit file with memories, no prior recall → block |
| Edit hook soft if already recalled | Recall first, then edit → additionalContext |
| Search hook soft on matches | Grep with matching memories → soft |
| Search hook silent on no matches | Grep with 0 matching memories → no output |
| Search hook soft after searched | Search same query twice → soft second time |
| Correction detection | Send correction pattern → additionalContext with flag file |
| Correction flag cleared | Stop presents once → flag file deleted |
| Stop checks correction flag | Flag exists → block includes "correction not stored" |
| Stop normal without flag | No flag → block with standard persist prompt |
| PreCompact clears all tracking | Trigger compact → all session tracking files removed |
| SessionStart on clear | Trigger /clear → THIS session's tracking removed, other sessions' untouched |
| SessionStart injects prefs | Preferences exist → stdout includes preference content |
| Path resolution | Recall with relative path → tracking file has absolute path |
| Session isolation | Two different session_ids → separate tracking files |

**12.3 Verification Sessions (end-to-end in Claude Code)**

Consolidated into 9 functional sessions (A-I) + 3 user scenarios (U1-U3). Each session tracks recall AND remember metrics.
Sessions are ordered so that memories stored in earlier sessions are verified as recalled in later sessions (the remember→recall loop).

**Setup for ALL sessions:**
- Run with `claude --debug` to capture full MCP tool I/O to `~/.claude/debug/<session-id>.txt`
- After each session, grep debug log for `aide_recall` and `aide_remember` responses to verify content
- Record tool call count and token usage per session for efficiency comparison

**Block/Soft State Matrix (ID-based) — governs all Read and Edit hooks:**

| State | Read | Edit | Search | Reference |
|-------|------|------|--------|-----------|
| New file + NONE of scoped IDs covered | **BLOCK** (path-based message) | **BLOCK** (path-based message) | N/A | Session A: A1, A8 |
| New file + SOME scoped IDs covered | **BLOCK** (ID-based message, missing only) | **BLOCK** (ID-based message) | N/A | Session H: H2 |
| Encountered file + unrecalled IDs | **soft** (ID-based message) | **soft** (ID-based message) | N/A | Session A: A3 (after encounter) |
| All scoped IDs covered | **silent** | **silent** | N/A | Session A: A3, A4, A7 |
| No scoped memories (project-wide only) | **silent** | **silent** | N/A | Session A: A6 |
| No memories at all for path | **silent** | **silent** | **silent** | Session A: A6 |
| < 10 total memories (softening) | **soft** (never block) | **soft** (never block) | **soft** | Session F |
| Any search query with matching memories | N/A | N/A | **soft** (always) | Session B |
| Any search query with no matches | N/A | N/A | **silent** | Session B: B3 |

**--- FUNCTIONAL SESSIONS (A-I): Does the system work correctly? ---**

**Session A: ID-Based Recall Flow**
_One session, same test project with seeded memories. Tests ID-based blocking, recall tracking via PostToolUse, dedup, and silent paths._

**Prerequisite:** Seed project with scoped memories for `src/api/routes.ts` (IDs 1-4), `src/api/handler.ts` (IDs 2,3 — overlap with routes.ts), `src/auth/middleware.ts` (IDs 10-12), and project-wide memories only (no scoped) for `src/db/connection.ts`. Ensure `README.md` has zero scoped memories.

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| A1 | Read `src/api/routes.ts` (first file, no IDs in tracking) | **BLOCK** — path-based message: "4 memories for src/api/routes.ts. Call aide_recall({paths: ['src/api/routes.ts']})" | block_new_file |
| A2 | Agent calls aide_recall for src/api/routes.ts | PostToolUse extracts IDs [1,2,3,4] from response, writes `ids\|1,2,3,4` to `recalled-paths-{sid}.txt`. Also writes `file\|src/api/routes.ts`. | id_tracking_write |
| A3 | Re-read `src/api/routes.ts` | **SILENT** — all scoped IDs (1,2,3,4) covered in tracking | silent_all_covered |
| A4 | Read `src/api/handler.ts` (scoped IDs 2,3 — both already covered from A2) | **SILENT** — IDs 2,3 already in tracking from A2 recall | silent_ids_already_covered |
| A5 | Read `src/auth/middleware.ts` (different dir, IDs 10-12 not in tracking) | **BLOCK** — path-based message: "3 memories for src/auth/middleware.ts. Call aide_recall({paths: ['src/auth/middleware.ts']})" | block_different_scope |
| A6 | Read `README.md` (no scoped memories) | **SILENT** — no scoped memories for this path, hook exits early | silent_no_scoped |
| A7 | Edit `src/api/routes.ts` (IDs 1-4 all covered from A2) | **SILENT** — edit hook checks same ID tracking, all covered | silent_edit_covered |
| A8 | Edit `src/auth/types.ts` (has scoped IDs 13-14, never recalled) | **BLOCK** — path-based message: "2 memories for src/auth/types.ts. Call aide_recall({paths: ['src/auth/types.ts']}) before editing." | block_edit_new_file |
| A9 | Read a file that doesn't exist (e.g. src/api/nonexistent.ts) | **SILENT** — hook checks `[ ! -f "$FILE_PATH" ]`, exits early | silent_nonexistent |
| A10 | Read `.aide/memories/technical/some-file.json` (direct memory file read) | **SOFT** — special case: additionalContext with "memory_file_direct_read" warning | memory_file_guard |
| A11 | Inspect tracking file `recalled-paths-{sid}.txt` | Contains `ids\|1,2,3,4` (merged, deduped). Contains `file\|` entries. No `dir\|` entries (directory trigger removed). | tracking_format |

**Key behaviors validated by Session A:**
1. **ID-based, not path-based** — A4 is silent because IDs 2,3 were already covered by A2's recall of routes.ts (shared IDs across files).
2. **No directory trigger** — A4 does NOT trigger a directory-level block. Each file is evaluated by its scoped IDs only.
3. **Edit uses same tracking** — A7 is silent because the edit hook reads the same `ids|` line as the read hook.
4. **Project-wide-only paths are silent** — A6 confirms scoped_count=0 exits early (not soft, not block).

**Session B: Search Flow**
_Same project. Tests search hooks — always soft, never blocks._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| B1 | Grep "auth" (scoped mems match the keyword) | **SOFT** — nudge: "N aide memories match 'auth' (...). Call aide_search({keyword: 'auth'})." Search hook is ALWAYS soft, never blocks. | search_always_soft |
| B2 | Agent decides to call aide_search or not | Agent's choice — soft nudge is advisory. If agent calls aide_search, `searched-queries-{sid}.txt` updated. | agent_discretion |
| B3 | Grep "zzz_nonexistent" (no memories match) | **SILENT** — search-preview.js returns count=0, hook exits early | silent_no_matches |

**Session C: Correction + Remember + Stop**
_Same project. Tests correction detection, flag lifecycle, remember quality, stop enforcement._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| C1 | User types correction: "No, use epoch timestamps not ISO" | UserPromptSubmit → **SOFT** (NEVER blocks — blocking rejects the user's message). Flag file `correction-pending-{sid}.txt` created with content "correction". | correction_detect |
| C2 | Agent calls aide_remember for correction | PostToolUse(aide_remember) → track-remember.sh fires, **deletes** flag file. Memory stored. | flag_cleared |
| C3 | Verify via aide_memories | Memory exists with correct layer, scope, content | remember_persisted |
| C4 | User types another correction but agent DOESN'T call aide_remember | Stop → **BLOCK** with "correction not stored" warning. Flag file cleared after Stop presents (one-shot, no infinite nagging). | stop_enforces_correction |
| C5 | Agent calls aide_remember (prompted by stop block) | Correction stored. Flag was already cleared after C4's stop presentation. | stop_remember |
| C6 | Continue working (no correction), dynamic interval hits block turn | Stop → **BLOCK** (standard save prompt, no correction warning) | stop_standard_block |
| C7 | Verify via aide_memories | All memories from C2, C5 exist | remember_count |

**Session D: Compact + Re-recall**
_Same project. Tests PreCompact clearing, SessionStart re-injection, tracking lifecycle._
_Note: PreCompact is cleanup-only (exit 0). Cannot force agent tool calls — Claude Code limitation._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| D1 | Read file, recall normally (block → recall → silent) | Normal flow establishes baseline | baseline |
| D2 | Run /compact | PreCompact fires: clears `recalled-paths-{sid}.txt`, `stop-count-{sid}.txt`, `searched-queries-{sid}.txt`, `correction-pending-{sid}.txt`. Then SessionStart(source:compact) fires: re-injects prefs/guidelines AND writes injected IDs back to tracking. | compact_clears_then_reinjects |
| D3 | Re-read same file as D1 | **BLOCK** — tracking was cleared by PreCompact, SessionStart only wrote injected IDs (prefs/guidelines), not the file's scoped IDs. Must re-recall. | post_compact_reblock |
| D4 | Recall file again, re-read | **SILENT** — IDs re-covered | post_compact_rerecall |

**Session E: Cross-Session Persistence**
_MUST be new session on same project. Verifies memories from Sessions C and D persisted._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| E1 | Start new session | SessionStart fires (source:start): injects top 15 preferences + all guidelines. Writes injected memory IDs to tracking. C/D tracking files from old session_id are harmless (different SID). | injection_fires |
| E2 | aide_recall for src/api/ | Returns correction memory from C2 (epoch timestamps guideline) | remember_then_recall |
| E3 | Verify C5 stop-enforced correction persists | aide_memories shows memory from C5 | cross_session_persist |

**Session F: New Project Softening (<10 mems)**
_Separate project with <10 total memories but >0. Tests that blocking is suppressed._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| F1 | Init project, seed 5 memories (below `memories.softening.threshold` of 10) | Setup complete | setup |
| F2 | Read file with scoped mems (IDs not in tracking) | **SOFT** (not block) — `FORCE_SOFT=true` because total_memories < threshold. Message still shows path-based recall nudge, but delivered as additionalContext. | softening_read |
| F3 | Edit file with scoped mems (IDs not in tracking) | **SOFT** (not block) — same softening logic in pre-edit-recall.sh | softening_edit |
| F4 | Agent acts on soft nudge, calls aide_recall | Normal recall, IDs written to tracking | softening_recall |
| F5 | Re-read file from F2 | **SILENT** — all IDs now covered (softening doesn't change silent behavior) | softening_silent |

**Session G: Stop Hook Dynamic Interval**
_Tests the 3-phase dynamic schedule: every 3 (turns 1-9), every 5 (turns 10-29), every 10 (turns 30+)._
_Schedule from defaults.json: `[{"until":9,"every":3},{"until":29,"every":5},{"every":10}]`_

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| G1 | Turns 1-2: simple prompts | Stop → **SILENT** (no output) — count 1,2 not divisible by 3 | silent_early |
| G2 | Turn 3: prompt | Stop → **BLOCK** — offset=3, 3%3=0. First save checkpoint. | block_at_3 |
| G3 | Turns 4-5: prompts | Stop → **SILENT** — offsets 4,5 not divisible by 3 | silent_between |
| G4 | Turn 6: prompt | Stop → **BLOCK** — offset=6, 6%3=0 | block_at_6 |
| G5 | Turn 9: prompt | Stop → **BLOCK** — offset=9, 9%3=0. Last phase-1 block. | block_at_9 |
| G6 | Turns 10-13: prompts | Stop → **SILENT** — phase 2 starts, offsets 1-4, none divisible by 5 | silent_phase2_early |
| G7 | Turn 14: prompt | Stop → **BLOCK** — offset=14-9=5, 5%5=0. First phase-2 block. | block_at_14 |
| G8 | Turn 19: prompt | Stop → **BLOCK** — offset=19-9=10, 10%5=0. Second phase-2 block. | block_at_19 |
| G9 | Any turn with correction-pending flag | Stop → **BLOCK** regardless of interval. Flag cleared after presentation (one-shot). | correction_override |
| G10 | After /compact or /clear: counter resets (stop-count file cleared) | Next block at turn 3 again — schedule restarts from 0. | counter_reset |
| G11 | Verify: user sees nothing on silent turns | No "Stop says:" or "Stop hook error:" output on non-block turns | ux_clean |

**Session H: ID Gap-Filling**
_Tests partial ID coverage — when aide_recall returns fewer IDs than scoped (e.g., limit hit), remaining IDs trigger soft nudge with specific ID list._

**Prerequisite:** File `src/api/routes.ts` has 8 scoped memory IDs (1-8). aide_recall limit is set to 5.

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| H1 | Read `src/api/routes.ts` (first encounter, no IDs tracked) | **BLOCK** — path-based message: "8 memories for src/api/routes.ts. Call aide_recall({paths: ['src/api/routes.ts']})" | block_initial |
| H2 | Agent calls aide_recall (limit=5 returns IDs 1-5 only) | PostToolUse writes `ids\|1,2,3,4,5` to tracking. File encountered (`file\|` entry written). | partial_id_tracking |
| H3 | Re-read `src/api/routes.ts` | **SOFT** — encountered=true, but IDs 6,7,8 missing. ID-based message: "3 memories for src/api/routes.ts not yet recalled. Call aide_recall({ids: [6,7,8]})" | soft_missing_ids |
| H4 | Agent calls aide_recall({ids: [6,7,8]}) | PostToolUse merges: `ids\|1,2,3,4,5,6,7,8`. All covered. | id_merge |
| H5 | Re-read `src/api/routes.ts` | **SILENT** — all 8 IDs covered | silent_all_filled |

**Key behavior validated by Session H:**
- The hook distinguishes NONE-covered (path-based message) from SOME-covered (ID-based message with specific missing IDs), giving the agent a precise recall call to fill gaps.

**Session I: SessionStart Injection + ID Tracking**
_Tests that SessionStart writes injected memory IDs to tracking, preventing redundant blocking for files whose scoped memories were already injected._

**Prerequisite:** Project has preferences (IDs 20-25), guidelines (IDs 30-35), and file-scoped memories for `src/config.ts` (IDs 30,31 — overlapping with guidelines).

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| I1 | Start new session | SessionStart injects prefs + guidelines. session-inject.js writes `ids\|20,21,22,23,24,25,30,31,32,33,34,35` to `recalled-paths-{sid}.txt`. | injection_writes_ids |
| I2 | Read `src/config.ts` (scoped IDs 30,31 — both already in tracking from injection) | **SILENT** — IDs 30,31 covered by SessionStart injection | silent_injected_covered |
| I3 | Read `src/api/routes.ts` (scoped IDs 1-4 — NOT in tracking from injection) | **BLOCK** — IDs 1-4 not injected, not covered | block_not_injected |

**Key behavior validated by Session I:**
- SessionStart doesn't just inject text — it writes injected memory IDs to the tracking file so the read/edit hooks know those memories are already in context. This prevents the "recalled but still blocking" problem.

**--- UNCHANGED SESSIONS (from previous spec, still valid) ---**

**Session F0: Empty Project — Zero Memories** (separate project, just initialized)
_First-time user experience. Nothing should block, nudge, or error._

| Step | Action | Hook Expected | Metric |
|------|--------|---------------|--------|
| F0.1 | `aide-memory init` on fresh project | Init succeeds, .aide/ created, hooks + MCP configured | init_works |
| F0.2 | Start `claude --debug` in the project | SessionStart → inject | No errors, injection is empty or minimal | no_crash |
| F0.3 | Read any file | Read → **silent** (no hook output, no nudge) | silent_on_zero_mems |
| F0.4 | Edit any file | Edit → **silent** | silent_on_zero_mems |
| F0.5 | Grep any keyword | Search → **silent** | silent_on_zero_mems |
| F0.6 | User types normal prompt | UserPromptSubmit → **silent** | no_false_triggers |
| F0.7 | End session | Stop → **block** (standard prompt) | Agent may or may not call aide_remember (both OK — nothing to store yet) | stop_still_fires |

**Session J: MCP Server Unavailable — Graceful Degradation**
_Tests what happens when the MCP server is down. Hooks should not crash, pending memories should be saved._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| J1 | Init project, seed memories, verify working | aide_recall works normally | setup |
| J2 | Rename `.mcp.json` to `.mcp.json.bak` (disables MCP server) | MCP server stops | setup |
| J3 | Start new session, read a file with scoped memories | Read hook blocks (hook scripts don't need MCP). Agent tries aide_recall → fails (MCP unavailable) | mcp_unavailable_detected |
| J4 | Agent should notify user and/or write to `.aide/pending-memories.jsonl` | Graceful fallback, no crash | fallback_works |
| J5 | Restore `.mcp.json` from backup | MCP server available again | restore |
| J6 | Verify pending memories can be imported | aide_recall works, pending memories processed | recovery |

**Session K: Scope Exclusion Precision**
_Tests that memories scoped to OTHER directories do NOT leak into the current scope._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| K1 | aide_recall for src/components/Button.tsx | Returns ONLY memories scoped to src/components/** or project-wide | scoped_only |
| K2 | Verify: NO auth memories (src/auth/**) in results | Auth memories excluded | no_leak_auth |
| K3 | Verify: NO api memories (src/api/**) in results | API memories excluded | no_leak_api |
| K4 | aide_recall for src/auth/middleware.ts | Returns ONLY auth-scoped + project-wide | scoped_only |
| K5 | Verify: NO api or component memories in results | Other scopes excluded | no_cross_leak |

**Session L: Auto-Update on Server Start** (separate project, simulates version upgrade)
_Verifies that MCP server start auto-updates hooks, MCP config, rules, directories, and .gitignore._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| L1 | Init project with aide-memory, verify _aideMemoryVersion in .claude/settings.json | Version stamp matches current package version | version_stamped |
| L2 | Manually edit settings.json: set _aideMemoryVersion to "0.0.1", add "customSetting": true | File has old version + custom key | setup |
| L3 | Manually delete a .aide/ subdirectory (e.g., .aide/memories/guidelines/) | Directory missing | setup |
| L4 | Start MCP server (start new claude session or restart) | autoUpdateIfNeeded fires | trigger |
| L5 | Check .claude/settings.json | _aideMemoryVersion updated, hooks updated, customSetting PRESERVED | auto_update_hooks |
| L6 | Check .aide/memories/guidelines/ | Directory re-created | auto_update_dirs |
| L7 | Check .mcp.json | aide-memory server config present | auto_update_mcp |
| L8 | Check .gitignore | All required entries present | auto_update_gitignore |
| L9 | Verify no user data was lost (memories, other settings) | Everything preserved | no_data_loss |

**Session M: .ignore Hides Memories from Grep** (separate project or fresh init)

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| M1 | `aide-memory init` on project | `.ignore` file created with `.aide/memories/` entry | ignore_created |
| M2 | Store a memory with keyword "foobar" | Memory JSON saved to `.aide/memories/` | setup |
| M3 | Grep for "foobar" | Returns NO results from `.aide/memories/` (only code files) | grep_excluded |
| M4 | `aide-memory config memories.hideFromGrep false` | Config updated | config_toggle |
| M5 | `aide-memory init --force` (re-runs updateIgnoreFile) | `.ignore` entry removed | ignore_updated |
| M6 | Grep for "foobar" | NOW returns results from `.aide/memories/` JSON files | grep_included |
| M7 | `aide-memory config memories.hideFromGrep true` + `aide-memory init --force` | `.ignore` entry restored | restore_default |

**Session N: Plan Persistence Across Sessions** (2 sessions)
_Tests that organic plans (not pre-seeded) are stored and recalled in a new session._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| N1 | Session 1: "Plan a refactor of src/api/ to add input validation, error handling, and rate limiting. Don't implement yet." | Agent creates a multi-step plan | plan_created |
| N2 | Agent should call aide_remember to store the plan (prompted by Stop hook) | Plan stored with scope=src/api/**, layer=area_context | plan_stored |
| N3 | Verify via aide_memories | Plan memory exists with correct layer/scope | plan_persisted |
| N4 | Session 2 (new session): "Continue the API refactor we planned" | Agent recalls the plan without being told what it was | plan_recalled |
| N5 | Agent picks up at the right step (not starting over) | Shows awareness of prior plan | plan_continuity |

**Session O: Multiple Corrections in One Session** (2 sessions)
_Tests that 3+ corrections stored rapidly in one session are all recalled in the next._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| O1 | Session 1: Ask agent to write a utility module | Agent writes code | setup |
| O2 | Correct #1: "Use arrow functions, not function declarations" | aide_remember called, stored | correction_1_stored |
| O3 | Correct #2: "Always add JSDoc with @param and @returns" | aide_remember called, stored | correction_2_stored |
| O4 | Correct #3: "Export as named exports, never default exports" | aide_remember called, stored | correction_3_stored |
| O5 | Verify all 3 via aide_memories | 3 separate memories exist | all_3_persisted |
| O6 | Session 2 (new session): "Write another utility module in src/utils/" | Agent should follow ALL 3 corrections without being told | all_3_recalled |
| O7 | Check: arrow functions? JSDoc? Named exports? | All 3 conventions followed | conventions_followed (/3) |

**Session P: Concurrent Sessions** (two Claude Code sessions on same project)

| Step | Action | Metric |
|------|--------|--------|
| P1 | Session X reads src/api/routes.ts, recalls | tracking file has session X's ID |
| P2 | Session Y reads src/auth/middleware.ts, recalls | tracking file has session Y's ID |
| P3 | Verify X's tracking doesn't contain Y's paths | session_isolation |
| P4 | Verify Y's tracking doesn't contain X's paths | session_isolation |
| P5 | Session X runs /clear → only X's tracking cleared, Y's intact | clear_isolation |
| P6 | Session Y still gets silent (IDs covered) on already-recalled files | y_unaffected |

**--- USER SCENARIOS (U1-U3): Does the system actually help? ---**

Anti-false-positive design: conventions must be (a) COUNTER to LLM defaults and (b) NOT discoverable from existing code.
All sessions run with `claude --debug` for full tool I/O inspection.

**Scenario U1: Team Decisions the Code Can't Tell You** (two sessions — without then with)
_Tests knowledge that is impossible to infer from reading code alone._

Why this works: These are team process decisions, not code patterns. No amount of grepping will reveal them. Without aide-memory, the agent MUST guess or ask. With aide-memory, it knows.

Seeded memories (un-discoverable from code):
- "All timestamps as Unix epoch ms, never ISO 8601 — frontend team parses epoch directly" (guidelines, src/api/**)
- "Soft deletes only (deleted_at column), never hard DELETE — legal requires 90-day retention" (guidelines, src/**)
- "Error responses must include requestId from X-Request-ID header for support ticket correlation" (guidelines, src/api/**)
- "Rate limit is 50 req/min per user, enforced via rateLimiter('user', 50) from src/middleware/rate-limit.ts" (technical, src/api/**)

Test project setup: code files exist but do NOT contain examples of these patterns (no existing endpoint shows epoch timestamps, no existing delete uses deleted_at, no existing error includes requestId).

| Step | Without aide-memory | With aide-memory | Metric |
|------|-------------------|-----------------|--------|
| U1.1 | Ask: "Add DELETE /users/:id endpoint to src/api/routes.ts" | Same prompt | task |
| U1.2 | Record: used epoch ms (not ISO)? | Same | convention_1 (Y/N) |
| U1.3 | Record: used soft delete (not hard DELETE)? | Same | convention_2 (Y/N) |
| U1.4 | Record: included requestId in error response? | Same | convention_3 (Y/N) |
| U1.5 | Record: added rate limiting? | Same | convention_4 (Y/N) |
| U1.6 | Record: first-attempt correct? | Same | first_attempt (Y/N) |
| U1.7 | Record: back-and-forth messages | Same | message_count |
| U1.8 | Record: total mistakes | Same | mistake_count |
| U1.9 | Record: tool calls made (reads/greps to discover patterns) | Same | tool_call_count |
| U1.10 | | Verify aide_recall was called BEFORE writing code | recall_before_write (Y/N) |
| U1.11 | | Check debug log: what did aide_recall return? Were all 4 conventions in response? | recall_content_quality |

**Scenario U2: Correction Learning Loop** (3 sessions)
_The core product promise: "correct once, remembered forever." Hardest to false-positive._

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| U2.1 | Session 1 (with aide-memory): "Write a DELETE /posts/:id endpoint" | Agent does hard DELETE (no memory yet) | baseline_mistake |
| U2.2 | Correct: "We use soft deletes with deleted_at, never hard DELETE — legal requires 90-day retention" | aide_remember stores it | remember_called (Y/N) |
| U2.3 | Verify via debug log: layer=guidelines? scope=src/**? content specific? | Check debug log | remember_quality |
| U2.4 | Session 2 (WITHOUT aide-memory, fresh session, same project): "Write a DELETE /comments/:id endpoint" | Agent does hard DELETE again — same mistake, no memory | repeated_mistake (Y/N, expected: Y) |
| U2.5 | Session 3 (WITH aide-memory, fresh session, same project): Same task as U2.4 | Agent recalls soft-delete, uses deleted_at | learned (Y/N, expected: Y) |
| U2.6 | Check debug log for Session 3: was the correction from U2.2 in aide_recall response? | Verify the actual memory content was returned | recall_returned_correction (Y/N) |
| U2.7 | Record: tool calls in Session 2 vs Session 3 | Session 3 should have fewer exploratory reads | efficiency_gain |

**Scenario U3: Behavioral Preferences** (two sessions — without then with)
_Tests preferences that are about HOW the agent works, not code patterns. Cannot be discovered from code._

Seeded memories (preferences layer, project-wide):
- "Always explain your approach before writing code — never start coding without a brief plan" (preferences, project-wide)
- "Keep functions under 30 lines — split into helpers if longer" (preferences, src/**)
- "Never add TODO comments — either fix it now or create a GitHub issue" (preferences, project-wide)

| Step | Without aide-memory | With aide-memory | Metric |
|------|-------------------|-----------------|--------|
| U3.1 | Ask: "Add input validation to the POST /users endpoint" | Same prompt | task |
| U3.2 | Record: explained approach before coding? | Same | explained_first (Y/N) |
| U3.3 | Record: all functions under 30 lines? | Same | function_length_ok (Y/N) |
| U3.4 | Record: any TODO comments added? | Same | no_todos (Y/N) |
| U3.5 | Record: first-attempt followed all preferences? | Same | first_attempt (Y/N) |
| U3.6 | Record: tool calls made | Same | tool_call_count |

**Efficiency Metrics (recorded for ALL user scenarios):**

| Metric | U1 Without | U1 With | U2.S2 Without | U2.S3 With | U3 Without | U3 With |
|--------|-----------|---------|---------------|------------|-----------|---------|
| Total tool calls | | | | | | |
| File reads (to discover patterns) | | | | | | |
| Grep/search calls | | | | | | |
| aide_recall calls | N/A | | N/A | | N/A | |
| aide_remember calls | N/A | | N/A | | N/A | |
| Back-and-forth messages | | | | | | |
| Conventions/preferences followed | /4 | /4 | N/A | N/A | /3 | /3 |
| First-attempt correct | Y/N | Y/N | Y/N | Y/N | Y/N | Y/N |

### Historical Scenarios (pre-ID-based)

_The following scenarios reference OLD behavior that no longer exists. They are preserved for reference only. The behaviors they tested have been replaced:_
- _Directory trigger (REMOVED) — files are now evaluated individually by scoped ID coverage_
- _Block-once-then-soft with block-count (REMOVED) — replaced by ID-based coverage checking_
- _Prefix matching for `dir|` entries (REPLACED) — no more directory-level tracking_
- _Always-block Stop hook (REMOVED) — now uses dynamic 3/5/10 interval schedule_
- _Search hook blocking (REMOVED) — search is now always soft, never blocks_

<details>
<summary>Click to expand historical scenarios</summary>

**Historical Session A: Hook + Recall Flow**
_One session, same test project with seeded memories. Tests read/edit/dir hooks, recall quality, tracking, dedup._

| Step | Action | Hook Expected | Recall/Remember Check | Metric |
|------|--------|---------------|----------------------|--------|
| A1 | Read `src/api/routes.ts` (has scoped mems) | Read → **block** | | hook_behavior |
| A2 | Agent calls aide_recall for src/api/routes.ts | Track → passthrough | Scoped mems ranked FIRST, round-robin all 4 layers | recall_quality, scoped_count, layer_coverage |
| A3 | Re-read same file | Read → **soft** | | tracking_works |
| A4 | Read `src/api/middleware.ts` (2nd file same dir) | Read → **block** (dir trigger) | | dir_trigger |
| A5 | Agent calls aide_recall for src/api/ (directory) | Track → passthrough | area_context ranked first (dir query), IDs from A2 excluded (dedup) | ranking_order, dedup_count |
| A6 | Edit `src/api/routes.ts` without reading first | Edit → **block** | | edit_enforcement |
| A7 | Agent calls aide_recall, then edit proceeds | Edit → **soft** | | tracking_works |
| A8 | Read `src/db/connection.ts` (only project-wide mems) | Read → **soft** (not block) | | scoped_only_blocking |
| A9 | Read `README.md` (no memories at all) | Read → **silent** (no hook output) | | silent_on_empty |
| A10 | Inspect tracking file | | file\|path, dir\|path, ids\|1,2,3 format correct. Paths are absolute. | tracking_format, path_resolution |
| A11 | User types normal message (not a correction) | UserPromptSubmit → **does NOT block** (soft or silent) | User input accepted normally | userprompt_never_blocks |
| A12 | Read a file that doesn't exist (e.g. src/api/nonexistent.ts) | Read → **silent** (no hook output, no error) | | silent_nonexistent_file |

**Historical Session A2: Blocking Permutations**
_Same test project as Session A, fresh session (tracking cleared). Exhaustively tests every combination of block/soft/silent for reads, edits, and directory triggers._

**Block/Soft State Matrix:**

| State | Read | Edit | Search | Step(s) |
|-------|------|------|--------|---------|
| Never recalled | **BLOCK** | **BLOCK** | **BLOCK** (if scoped matches) | A2.1, A2.5, A2.9 |
| File recalled | soft | soft | N/A | A2.3, A2.6 |
| Directory recalled | soft (all files under dir) | soft (all files under dir) | N/A | A2.4, A2.7, A2.8 |
| Only project-wide mems | soft | soft | N/A | A2.10, A2.11 |
| < 10 total mems | soft | soft | soft | (covered by Session F) |
| 0 mems for path | silent | silent | silent | A2.12, A2.13 |
| 0 mems total | silent | silent | silent | (covered by Session F0) |

**Prerequisite:** Seed project with scoped memories for `src/auth/middleware.ts`, `src/auth/types.ts`, `src/auth/` (directory), `src/components/Button.tsx`, and project-wide memories only (no scoped) for `src/utils/helpers.ts`. Ensure `src/auth/` has at least 3 files. Ensure `tests/setup.ts` and `lib/constants.ts` have zero memories.

| Step | Action | Hook Expected | Recall/Remember Check | Metric |
|------|--------|---------------|----------------------|--------|
| | **--- Directory Trigger Isolation ---** | | | |
| A2.1 | Read `src/auth/middleware.ts` (1st file in src/auth/, never recalled) | Read → **block** | | hook_behavior, file_block |
| A2.2 | Agent calls aide_recall for `src/auth/middleware.ts` (file only) | Track → passthrough | Tracking file shows `file\|src/auth/middleware.ts`. Directory `src/auth/` is NOT tracked yet. | tracking_format, file_only_recall |
| A2.3 | Re-read `src/auth/middleware.ts` | Read → **soft** (file recalled) | | file_recall_soft |
| A2.4 | Read `src/auth/types.ts` (2nd file in src/auth/, directory NOT recalled) | Read → **block** (directory trigger: 2nd file in same dir) | | dir_trigger_block |
| A2.5 | Agent calls aide_recall for `src/auth/` (directory) | Track → passthrough | Tracking file shows `dir\|src/auth/`. Memories from A2.2 excluded (dedup). | dir_recall, dedup_count |
| A2.6 | Re-read `src/auth/types.ts` | Read → **soft** (directory recalled covers all files under dir) | | dir_recall_covers_files |
| A2.7 | Read `src/auth/index.ts` (3rd file, never individually read) | Read → **soft** (directory already recalled) | | dir_recall_covers_new_files |
| A2.8 | Edit `src/auth/index.ts` (never individually recalled, but dir recalled) | Edit → **soft** (directory recall covers edits too) | | dir_recall_covers_edits |
| | **--- Edit Blocking Without Prior Read ---** | | | |
| A2.9 | Edit `src/components/Button.tsx` (never read or recalled in session) | Edit → **block** | | edit_block_no_prior_read |
| A2.10 | Agent calls aide_recall for `src/components/Button.tsx` | Track → passthrough | Scoped memories returned | edit_recall |
| A2.11 | Re-attempt edit `src/components/Button.tsx` | Edit → **soft** (file recalled) | | edit_soft_after_recall |
| | **--- Project-Wide Only (no scoped mems for path) ---** | | | |
| A2.12 | Read `src/utils/helpers.ts` (has only project-wide mems, no scoped) | Read → **soft** (not block — scoped-only blocking) | | scoped_only_blocking |
| A2.13 | Edit `src/utils/helpers.ts` | Edit → **soft** (same rationale) | | scoped_only_blocking_edit |
| | **--- Zero Memories for Path ---** | | | |
| A2.14 | Read `tests/setup.ts` (zero memories of any kind for this path) | Read → **silent** (no hook output) | | silent_zero_mems_read |
| A2.15 | Edit `tests/setup.ts` | Edit → **silent** (no hook output) | | silent_zero_mems_edit |
| A2.16 | Grep "setup" (no scoped mems match the keyword) | Search → **silent** (no hook output) | | silent_zero_mems_search |
| | **--- Search Blocking ---** | | | |
| A2.17 | Grep "auth" (scoped mems match, never searched in session) | Search → **soft** | | search_soft |
| A2.18 | Agent calls aide_search keyword:"auth" | | Results returned | search_recall |
| A2.19 | Grep "auth" again | Search → **soft** (already searched) | | search_soft_after_recall |
| | **--- Cross-Check: File vs Directory Tracking ---** | | | |
| A2.20 | Inspect tracking file | | Verify ALL entries: `file\|src/auth/middleware.ts`, `dir\|src/auth/`, `file\|src/components/Button.tsx`, `file\|src/utils/helpers.ts`. No entry for `tests/setup.ts` (silent paths not tracked). No entry for `lib/constants.ts`. IDs deduped across file + dir recalls. | tracking_completeness, path_resolution |

**Historical Key behaviors validated by A2:**
1. Directory trigger fires on 2nd file, not 1st.
2. Directory recall covers ALL files under that dir.
3. Edit blocks independently of read.
4. Silent paths leave no tracking footprint.
5. Project-wide-only paths are soft, not block.

**Historical Session B: Search Flow**

| Step | Action | Hook Expected | Recall/Remember Check | Metric |
|------|--------|---------------|----------------------|--------|
| B1 | Grep "auth" (scoped mems match) | Search → **soft** | | hook_behavior |
| B2 | Agent calls aide_search keyword:"auth" mode:"keyword" | | Substring matches only | search_mode |
| B3 | aide_search keyword:"authentication flow" mode:"semantic" | | Embedding similarity matches | search_mode |
| B4 | aide_search keyword:"auth" mode:"auto" | | Keyword first, semantic fallback if <3 | search_mode |
| B5 | Grep "auth" again | Search → **soft** | | tracking_works |
| B6 | Grep "zzz_nonexistent" (no mems match) | Search → **silent** (no hook output) | | silent_on_no_matches |
| B7 | aide_update a memory's content, aide_search for new content | | Embedding regenerated, semantic finds updated text | embedding_update |
| B8 | aide_search for the OLD content text | | Old phrasing no longer matches (or ranks much lower) | negative_assertion |

**Historical Session G: Concurrent Sessions**

| Step | Action | Metric |
|------|--------|--------|
| G1 | Session X reads src/api/routes.ts, recalls | tracking file has session X's ID |
| G2 | Session Y reads src/auth/middleware.ts, recalls | tracking file has session Y's ID |
| G3 | Verify X's tracking doesn't contain Y's paths | session_isolation |
| G4 | Verify Y's tracking doesn't contain X's paths | session_isolation |
| G5 | Session X runs /clear → only X's tracking cleared, Y's intact | clear_isolation |
| G6 | Session Y still gets soft (not block) on already-recalled files | y_unaffected |

**Historical Session N: SessionStart Injection Verification**

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| N1 | Start new session on test project | SessionStart injects preferences + guidelines | injection_fires |
| N2 | Ask: "What coding conventions should I follow in this project?" | Agent references injected preferences | agent_aware |
| N3 | At least 2 specific conventions mentioned | Agent shows awareness, not generic advice | specificity |

**Historical Session O: Dynamic Stop Hook Interval**

| Step | Action | Expected | Metric |
|------|--------|----------|--------|
| O1 | Turns 1-2: simple prompts | Stop → **silent** (no output, no block) | silent_early |
| O2 | Turn 3: prompt | Stop → **block** (first save point, visible) | block_at_3 |
| O3 | Turns 4-5: prompts | Stop → **silent** | silent_between |
| O4 | Turn 6: prompt | Stop → **block** | block_at_6 |
| O5 | Turns 10-13: prompts | Stop → **silent** (interval switches to every 5) | interval_switch |
| O6 | Turn 14: prompt | Stop → **block** (first long-interval block, 9+5=14) | block_at_14 |
| O7 | Any turn with correction-pending flag | Stop → **block** regardless of interval, flag cleared after | correction_override |
| O8 | After /clear: counter resets, next block at turn 3 again | Stop schedule restarts | counter_reset |
| O9 | Verify: user sees nothing on silent turns | No "Stop says:" or "Stop hook error:" output | ux_clean |

</details>

**12.4 Bug Hunting Checklist**

- [ ] Relative/absolute path mismatch (regression — was root cause of recall quality failure)
- [ ] UserPromptSubmit never blocks (regression — broke all user input when set to blocking)
- [ ] Track-recall.sh glob pattern doesn't match file paths as dirs (regression — `*/**` matched everything)
- [ ] Scoped-only blocking: project-wide-only files (scoped_count=0) get silent, not soft or block
- [ ] New project (<10 mems) gets soft everywhere, not block
- [ ] Empty tracking file doesn't crash hooks
- [ ] Malformed JSON in hook input handled gracefully
- [ ] Missing session_id falls back to "default"
- [ ] aide_recall with no paths param doesn't write to tracking
- [ ] Large number of memories (100+) doesn't slow hooks >500ms
- [ ] Concurrent file writes to tracking file don't corrupt
- [ ] PreCompact with no tracking files doesn't error
- [ ] SessionStart with no stale files doesn't error
- [ ] MCP server restart required after code changes (document, don't fix — architectural)
- [ ] Recall quality: scoped memories rank above project-wide for file queries
- [ ] Recall quality: area_context ranks first for directory queries
- [ ] ID-based coverage: file with all scoped IDs covered is silent, not soft or block
- [ ] ID gap-filling: partial ID coverage triggers soft nudge with specific missing IDs

#### 13. PHASE 2 PRO FEATURES (deferred, documented)

1. **Configurable hook intensity** — users control injection volume, blocking vs soft, active hooks
2. **Automatic memory cleanup** — detect stale/conflicting/duplicate memories, prompt agent to clean up

See section I items 5-6 for full details.

---

REMAINING (source of truth — all pending items with concrete next steps):

---

### A. Validation (CRITICAL — launch gate)

**P1.17: 9 functional sessions (A-I) + unchanged sessions (F0, J-P) + 3 user scenarios (U1-U3) in Claude Code**
- Runbook: `docs/validation/PHASE_0_1_INTEGRATION_TESTING.md` (needs update to match Sessions A-P)
- Verification sessions A-I (core ID-based), F0/J-P (unchanged), U1-U3 defined in section 12.3
- Observability: `aide-memory recall-log` now logs both recalls AND memory store events (stored/updated/deleted) to `.aide/recall-log.jsonl`
- Before each scenario: `aide-memory recall-log --clear`
- After each scenario: `aide-memory recall-log` to see exactly what was recalled/stored
- Also use: `aide-memory stats` for aggregate counts
- Results go to: per-scenario Runs tables in `docs/validation/E2E_VALIDATION.md`
- Decision: PASS (ship) or FAIL (fix first)

**P1.18: Hook UX/UI Readability (fast follow after validation)**
- **Inconsistent labels across sessions**: In some sessions, soft hooks show correctly as "additional context." In others (observed in /tmp/aide-val test session), soft hooks show as "returned blocking error" even though the tool proceeded. Root cause unknown — may be related to collapsed tool call sequences (block → recall → retry) where the block label persists. Needs further investigation.
- **Known limitation**: Claude Code may display "blocking error" for hook output that didn't actually block. The debug log is the source of truth — `permissionDecision: deny` = blocked, `additionalContext` = soft.
- **Stop hook always shows "error"**: Stop hook uses dynamic interval to prompt aide_remember. Claude Code displays this as "Stop hook blocking error" which sounds like something broke. Consider: can the Stop hook use a different output format that Claude Code labels less alarmingly?
- **Soft nudge on already-recalled files**: In normal mode shows as "additional context" (correct label). Could make silent (exit 0, no output) to reduce noise — the agent already has recalled context in conversation.
- Investigate: can we improve Stop hook JSON format so Claude Code doesn't say "error"?
- File Claude Code issue at github.com/anthropics/claude-code/issues if Stop hook labeling can be improved
- Goal: Stop hook should not look like an error, soft nudges on re-reads could be silent
- **Action**: After validation sessions, do a dedicated UX exploration session — collect all hook output samples (block, soft, silent, stop, precompact) from both test and dev sessions, compare labels/rendering, identify patterns, and determine what can be fixed vs what's a Claude Code platform limitation
- **Config mapping to Cursor**: All settings (memories.hideFromGrep, telemetry, hook intensity) should map to Cursor's equivalent config system. Audit all .aide/config.json keys and ensure they work across both Claude Code and Cursor environments
- **Optimize defaults from validation data**: Ship with optimal defaults NOW — all settings stored in private config (.aide/config.json), NOT exposed to users. Public config for Phase 2/pro.

  **IMPLEMENTED:**
  - Stop hook interval: dynamic 3→5→10 (every 3 for turns 1-9, every 5 for 10-29, every 10 for 30+). Silent on non-block turns.
  - Search hook: always soft. Agent decides whether to call aide_search.
  - Scope depth: MIN_SCOPE_DEPTH=2 (src/** too broad, src/api/** specific enough).
  - .ignore file: hides .aide/memories/ from grep by default.
  - Correction flag: clears after Stop presents once (no infinite nagging).
  - hookSpecificOutput: RESOLVED — only valid for PreToolUse/UserPromptSubmit/PostToolUse. Stop/PreCompact use top-level fields or silent.
  - ID-based blocking: Read/Edit hooks check scoped_ids against ids| tracking. Replaces block-once-then-soft pattern.
  - Focused scope matching: scopeMatchesPath with focused:true excludes grandparent scopes. Only immediate parent + one level above.
  - PostToolUse fix: track-recall-post.sh extracts IDs from aide_recall response (handles MCP {type,text} array format).
  - SessionStart injects IDs: session-inject.js writes injected memory IDs to ids| in tracking file, preventing redundant blocking.
  - Directory trigger removal: each file evaluated individually by scoped ID coverage. No dir| tracking.
  - aide_recall ids param: supports `{ids: [6,7,8]}` for gap-filling specific missing memories.
  - Settings framework: defaults.json with per-key value/public/pro metadata. Bundled CLI (`src/memory/settings.ts`) is the single reader for both hooks and `aide-memory config`. `read-config.sh` was removed in the 0.4.0 hook consolidation.
  - Injection per-layer: injection.preferences, injection.guidelines, injection.technical, injection.area_context settings control what gets injected at SessionStart.
  - Resume clears tracking: SessionStart clears THIS session's tracking on resume/compact/clear (agent loses context, must re-recall).
  - Correction detection tuning: negative filters, 3+ word minimum, match at message start only. Default `hooks.correction.minWords: 3` (in detect-correction.sh).
  - `--force` merge: `aide-memory init --force` updates all config to current version while PRESERVING user's other settings (hooks, MCP, rules, dirs, .gitignore, post-checkout). Never overwrites user data.
  - `--reset` flag: `aide-memory init --reset` resets .aide/config.json to factory defaults then runs --force. Does NOT delete memories.
  - macOS symlink fix: recall-for-path.js resolves /tmp → /private/tmp via fs.realpathSync before path.relative(). Without this, scoped_count was always 0 for projects in /tmp/ (common for testing).
  - Scope trailing slash normalization: scopeMatchesPath strips trailing slash from scopes (src/memory/ treated like src/memory/**).
  - Proactive saving rule: rules template (.claude/rules/aide-memory.md) instructs agent to save key decisions proactively as conversations grow, not wait for Stop hook or compaction.

  **REPLACED (historical — superseded by ID-based blocking):**
  - ~~Read/Edit block-once-then-soft~~ → REPLACED by ID-based coverage checking. Block/soft/silent now determined by scoped_ids vs ids| tracking.
  - ~~Directory trigger block-once-then-soft~~ → REPLACED. Directory trigger removed entirely. Files evaluated individually.
  - ~~Stop 3→5 only~~ → DONE. Extended to 3→5→10 three-phase schedule.
  - ~~Correction detection tuning (minWords: 5)~~ → DONE. Implemented with minWords: 3 (not 5 — 5 was too restrictive).

  **RESOLVED:**
  - Block→soft reduction: the original problem of "how to reduce blocking after first encounter" was resolved by ID-based blocking. Instead of counting blocks per file (maxBlocks), the hook checks which scoped memory IDs are already in tracking. Once all IDs are covered, the hook goes SILENT (not even soft). No more block counting needed.

  **ACCEPTED GAPS:**
  - Other search tools (Bash grep/find, Agent subagents): can only hook Grep/Glob. Claude Code doesn't expose matchers for Bash commands. Accepted gap.
  - PreCompact can't force agent saves: platform limitation. Save strategy = Stop hook + proactive rules + user guidance.

  **Public config defaults (all in defaults.json, all user-settable via `aide-memory config`):**

  _Phase 1 decision (Apr 21, 2026): every setting is `public: true` in the free tier. No pro gating — `pro: false` is kept as a stable schema placeholder only. Settings are seeded into `.aide/config.json` on init so users see every knob. Unknown keys are rejected by `aide-memory config` with a valid-key list._

  | Key (defaults.json) | Default | Description |
  |-----|---------|-------------|
  | `hooks.read.maxBlocks` | `1` | Cap on how many times Read hook hard-blocks for the same path per session. `0` silences the hook entirely. |
  | `hooks.edit.maxBlocks` | `1` | Same for Edit/Write. `0` silences. |
  | `hooks.stop.schedule` | `[{"until":9,"every":3},{"until":29,"every":5},{"every":10}]` | Dynamic Stop-hook block schedule (3 → 5 → 10 by default). |
  | `hooks.search.mode` | `"soft"` | Grep/Glob nudge mode: `"soft"` / `"block"` / `"off"`. |
  | `hooks.correction.enabled` | `true` | Whether UserPromptSubmit detects corrections/decisions/preferences. `false` silences. |
  | `hooks.precompact.mode` | `"cleanup"` | `"cleanup"` clears session tracking; `"off"` preserves it. |
  | `recall.limit` | `20` | Default max memories per `aide_recall` call (MCP `query.limit` still wins). |
  | `recall.ensureLayerDiversity` | `true` | Round-robin to guarantee all four layers appear in results. |
  | `recall.layerDiversityMinLimit` | `5` | Minimum limit before layer-diversity swapping kicks in. |
  | `injection.preferences` | `15` | Max preferences injected at SessionStart. |
  | `injection.technical` | `false` | Whether technical memories are injected at SessionStart (otherwise surfaced via recall). |
  | `injection.area_context` | `false` | Same for area_context. |
  | `injection.guidelines` | `"all"` | `"all"` or integer N for top-N injected guidelines at SessionStart. |
  | `injection.priorityAlwaysOverride` | `true` | `priority:"always"` memories bypass per-layer caps. |
  | `memories.hideFromGrep` | `true` | Derived artifact: maintains `.ignore` with a managed `# BEGIN/END aide-memory-managed` block. Resync on every `aide-memory config` write AND on every MCP server startup via `resyncDerivedArtifacts()`. |
  | `memories.softening.threshold` | `10` | Projects with fewer memories than this force every hook output to soft `additionalContext` (new-project softening). |

  **Dead settings removed Apr 21, 2026:** `hooks.directoryTrigger.maxBlocks` (directory trigger was removed per the ID-based blocking redesign) and `recall.minScopeDepth` (superseded by hardcoded focused-mode in `computeScopedForPath`).

  **Balance principle:** Block for first encounters and periodic checkpoints. Soft for discovery and repeat access. Silent for routine turns. Rules file for ongoing awareness.
- **Audit hook usage patterns**: Are blocking hooks, flag files, two-phase patterns, and multi-hook coordination (blocker + tracker) the correct/intended way to use Claude Code hooks? Or are there simpler/better patterns? Research Claude Code hook best practices, check community examples, file questions with Anthropic if needed
- **Progressive context warnings**: File feature request with Claude Code for a `ContextThreshold` hook event (fires at 70%, 80%, 90% context usage). Would enable progressive "save your context" warnings before auto-compaction triggers. For now, Stop hook with dynamic interval is the closest approximation.

**Known Limitation — Context Saving Before Compaction:**
PreCompact hooks CANNOT give the agent an agentic turn to call aide_remember. This is a confirmed Claude Code architectural limitation (agent loop is async to compaction timer, hooks are synchronous control). See GitHub issue #32062.

Document in external docs (README, landing page):
- **How aide-memory handles compaction**: The Stop hook prompts the agent to save key context at regular intervals throughout the session. By the time compaction happens, important decisions are already stored. The agent is also instructed (via rules file) to proactively save as conversations grow.
- **User tip**: Before running `/compact`, ask Claude: "Save any key decisions from this session via aide_remember." The agent has full context at that point and can make targeted saves.
- **What happens after compaction**: Session preferences and guidelines are automatically re-injected. Previously recalled files require re-recall (hooks will prompt this).
- **Feature request**: We're tracking Claude Code issue #32062 (auto-save before compaction) for a platform-level solution.

File feature request:
- **Title**: "Allow PreCompact hooks to trigger an agentic turn before compaction proceeds"
- **Description**: PreCompact hooks can block or approve compaction but cannot give the agent a tool-calling turn. For memory systems (aide-memory), the agent needs to call MCP tools (aide_remember) before context is lost. Requested: PreCompact returns a flag that pauses compaction, gives the agent one agentic turn to make tool calls, then proceeds with compaction.
- **Reference**: Related to #32062 (auto-save session state before compaction)
- **What we tried and learned**:
  - exit 0 with {"decision":"block"}: compaction proceeds immediately, agent never gets a turn
  - exit 2 with {"decision":"block"}: Claude Code shows hard error "Compaction blocked by PreCompact hook", no agentic turn, requires double /compact
  - exit 0 with {"decision":"approve","systemMessage":"save now"}: compaction proceeds, systemMessage shown to user but unclear if agent sees it
  - hookSpecificOutput with hookEventName:"PreCompact": validation error — hookSpecificOutput only valid for PreToolUse/UserPromptSubmit/PostToolUse
  - suppressOutput: doesn't suppress for Stop/PreCompact events
  - v2.1.105 "Added PreCompact hook support": only added blocking capability (cancel compaction), not agentic turns
  - **Conclusion**: no combination of exit code + JSON output gives the agent a tool-calling turn during compaction. This is an architectural constraint — hooks are synchronous control, agent loop is async.
- **Cursor compaction behavior**: Cursor may handle compaction differently — investigate what context survives compaction in Cursor, whether Cursor has equivalent hooks, and whether the post-compact save prompt works there. Cursor's compacted summaries may retain less/more context than Claude Code's, affecting whether aide_remember captures useful info post-compact

**P1.19: Phase 1 Follow-ups**

1. **PreCompact Feature Request** — File on github.com/anthropics/claude-code/issues. Title: "Allow PreCompact hooks to trigger an agentic turn before compaction proceeds." Include all implementation attempts documented in this spec (exit 0, exit 2, systemMessage, hookSpecificOutput — all failed). Reference GitHub issue #32062.

2. **Progressive Context Warnings** — Part of PreCompact mitigation. File feature request for `ContextThreshold` hook event (fires at 70%, 80%, 90% context usage). Don't implement with transcript file size estimation (too inaccurate). Would enable progressive "save your context" warnings before auto-compaction.

3. **Search Tools — Explore Soft Blocking** — Currently only Grep/Glob hooked. Bash commands (grep, find, rg) bypass hooks. Accepted gap — Claude Code doesn't expose matchers for Bash. Glob does NOT respect .ignore (Claude Code issue #20609). Explore: can soft nudging be extended to other search patterns? Agent subagent searches?

4. ~~**`aide-memory init --scan` validation**~~ — `--scan` was removed in Apr 2026 (output was too surface-level — package.json + dir inference only). See `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` (Deferred: Auto-scan for Codebase Pattern Discovery) for the deferred Phase 2 revisit.

**P1.20: Distribution Strategy + Binary** (explore prior to publishing new version / demoing)
- Current npm ships readable JS + bash — all source accessible
- Compile all hook logic into aide-memory binary via `bun compile`
- Bash hooks become 2-line thin wrappers: `cat | aide-memory hook pre-read`
- All logic private: blocking decisions, scope depth, dynamic intervals, correction detection, config reading, pro gating, tracking management
- Same TypeScript codebase, different build target — solves code protection AND settings enforcement
- Pro features: server-side logic is only way to truly prevent bypass (local flags = speed bump, server = enforcement)
- Distribution options: homebrew tap, curl installer, npm wrapping binary
- Explore BEFORE publishing next version — affects how we ship

5. **Resume-with-summary detection** — Claude Code doesn't distinguish `source: "resume"` between full resume and resume-with-summary. Currently we clear tracking on ALL resumes (safe default). Investigate: can we detect summary-resume to avoid unnecessary re-blocking on full resume? Check if transcript_path size or session metadata indicates summarization. File feature request for `source: "resume_summary"` distinction.

**P1.9: Cursor validation** — DEFERRED, awaiting Cursor reactivation
- Same 5 scenarios, same runbook, run in Cursor after Claude Code validation passes

---

### B. Analytics & Telemetry

**Local analytics** — COMPLETE
- `logEvent()` wired in store.ts for: memory_stored, memory_updated, memory_deleted, memory_recalled, search_performed
- Viewable via `aide-memory stats`
- Opt-out: `aide-memory config telemetry.enabled false` (enabled by default)

**Recall/store event log** — COMPLETE
- `.aide/recall-log.jsonl` captures detailed per-event trace (recall queries, memories returned, store/update/delete events)
- Viewable via `aide-memory recall-log [--last N] [--clear]`
- Used during validation to verify correct memories surface

**PostHog remote telemetry** — COWORK (browser task)
1. Go to posthog.com → sign up with Google
2. Create project named "aide-memory"
3. Copy the Project API Key
4. Set it as env var: `export AIDE_POSTHOG_KEY=phc_xxxxx` (for local dev)
5. For production: add as GitHub Actions secret `AIDE_POSTHOG_KEY`
6. Events auto-flush to PostHog (buffered, batched, fire-and-forget via HTTP POST to us.i.posthog.com/batch)
7. PostHog dashboard shows: memory_stored, memory_recalled, search_performed counts, unique users (anonymized SHA256 of hostname:username)

---

### C. Branding

**Logo** — NEEDS SIGNIFICANT REWORK
- Current: `docs/branding/logo.svg` (brain + circuit hybrid) — placeholder quality, not launch-ready
- Exploration doc: `docs/branding/logo-exploration.md` (4 concepts documented)
- **What needs to happen:**
  1. Open a free logo tool (Canva, Figma, or Logomaster.ai)
  2. Generate 3-5 distinct logo options based on the 4 concepts in logo-exploration.md
  3. Save screenshots to `docs/branding/logo-options/` (create directory)
  4. Pick winner with user input
  5. Export final logo in SVG + PNG (multiple sizes: 32px, 128px, 512px)
  6. Update landing page, README, and npm package with final logo
- **Who:** COWORK (browser task) + USER (picks winner)

**Landing page** — DONE (content + build)
- Nextra site: `aide-memory-web/` (built, pages created, dark theme)
- Hero with animated grid, feature cards, how-it-works, CTA
- Needs: Vercel deployment (see D below)

---

### D. Deployment

**Vercel deployment** — COMPLETE
- aide-memory.dev live on Vercel, SSL provisioned, Cloudflare CNAME configured

**npm release** — READY (workflow tested)
- To release: update version in `package.aide-memory.json`, then `git tag v0.X.0 && git push origin v0.X.0`
- GitHub Actions auto-runs: build → test → swap package.json → npm publish → GitHub Release
- NPM_TOKEN secret configured in `aide-memory/aide-memory` repo
- Manual fallback: `npm login && cp package.aide-memory.json package.json && npm publish --access public && git checkout package.json`

---

### E. Legal

**Completed:**
- [x] Trademark search (`docs/legal/trademark-search-results.md`) — MEDIUM-HIGH risk noted (AiDE® by ValueLabs)
- [x] EULA (`docs/legal/EULA.md`)
- [x] Terms & Conditions (`docs/legal/TERMS.md`)

**Pending:**
- [ ] Company registration decision — DEFERRED to Phase 2 (user decision, not blocking launch)

---

### F. Marketing & Publishing

**Completed content:**
- [x] Launch blog post (`docs/marketing/launch-blog-post.md`)
- [x] Show HN post (`docs/marketing/show-hn.md`)
- [x] Reddit posts (`docs/marketing/reddit-posts.md`)
- [x] Dev.to post (`docs/marketing/devto-post.md`)
- [x] Public README (`docs/marketing/public-readme.md`)
- [x] Publishing guide (`docs/marketing/PUBLISHING_GUIDE.md`) — submission URLs for HN, dev.to, tldrnewsletter, console.dev, changelog, Product Hunt

**Pre-publish review gate (USER — before any submissions):**
- [ ] Review all public-facing content: README, blog posts, landing page, demo GIFs
- [ ] Approve each piece for publishing (no Cowork submission until user signs off)

**Pending — COWORK (browser tasks, after validation + demo + user review):**
- [ ] Submit Show HN post (copy from `docs/marketing/show-hn.md`, paste at news.ycombinator.com/submit)
- [ ] Publish dev.to post (copy from `docs/marketing/devto-post.md`, paste at dev.to/new)
- [ ] Submit to tldrnewsletter.com link submission form
- [ ] Submit to console.dev new tool submission
- [ ] Submit to changelog.com/submit

**P1.19: Demo** — BLOCKING (must complete before marketing submissions)
- **Demo setup** — COWORK: create demo project, seed memories, write recording script + guide
- **Demo recordings** — USER: screen-record using the script Cowork creates
- **Landing page embed** — add demo GIFs/video to aide-memory.dev so blogs can reference them
- 7 individual clips + 1 full flow demo → convert to GIFs
- Demo must be reviewed and finalized before any blog/submission goes live

---

### G. Marketplace Submissions

**Research complete** — see `docs/specs/PLUGIN_STATUS.md`

**Pending — COWORK:**
- [ ] MCP Registry: fork github.com/modelcontextprotocol/servers → add aide-memory entry → submit PR
- [ ] Claude Code: research submission process only → save findings → user reviews before any submission
- [ ] Cursor: DEFERRED — do not submit until after Cursor validation passes
- Save results to `docs/specs/PLUGIN_STATUS.md` (append submission status)

---

### H. GitHub Repo Maintenance

**Completed:**
- [x] Org + repo created (`aide-memory/aide-memory`)
- [x] PUBLIC_README.md uploaded
- [x] GitHub Actions release workflow (`.github/workflows/release.yml`)
- [x] NPM_TOKEN secret configured
- [x] Issue templates added
- [x] LICENSE file verified

**No pending items.**

---

### I. Phase 1 Follow-ups (post-launch, pre-Phase 2)

These expand reach and distribution after Phase 1 ships. Full details in `docs/PRODUCT_VISION.md` sections 1-4.

**1. Claude ecosystem integration (beyond Code):**
- aide-memory already works via MCP stdio — any Claude product that supports MCP can connect
- **Claude Desktop** — same `aide-memory` server config works today; add setup instructions to docs
- **Claude Web (claude.ai)** — when MCP integration lands, memories from coding sessions become accessible in general chat
- **Cowork (browser agent)** — MCP support expected; browser-based tasks inherit codebase context (you teach a convention in Code, Cowork follows it)
- **Claude Code Marketplace → Cowork availability:** Research whether publishing aide-memory as a Claude Code marketplace plugin automatically makes it available as a Cowork connector, or if Cowork has a separate connector/plugin system that needs independent submission. Determine what controls exist for targeting specific Claude products.
- **Action:** Add setup guides for each Claude product as MCP support rolls out; test and document any product-specific quirks

**2. Non-IDE developers:**
- Custom agent frameworks (LangChain, CrewAI, AutoGen, etc.) can connect via MCP or shell-exec the CLI
- Terminal-native devs can use `aide-memory` CLI directly without an IDE
- CI/CD pipelines can query memories (e.g., "recall context for files changed in this PR")
- Potential: SDK/API for direct Node.js import (skip MCP overhead for custom agent loops)
- **Action:** Add "Agent Framework Integration" doc page showing how to connect from non-IDE environments

**3. Logo rework** — see section C above for concrete steps

**4. Analytics enhancements:**
- Richer CLI: recall hit rate, memory growth over time, tokens saved estimate
- Export: `aide-memory stats --format json` for piping into external tools
- Health check: `aide-memory health` command reporting freshness, stale %, layer balance
- Version check on CLI/MCP server start — warn if outdated, recommend update (updater.ts exists)
- "Last seen" tracking in PostHog for churn inference (no reliable npm uninstall hook)
- Consider `preuninstall` script in package.json as best-effort uninstall tracking
- Before/after comparison demo — same task without aide-memory (agent makes mistake) vs with (gets it right)

**5. Configurable hook intensity (Phase 2 pro feature):**
- Config via `aide-memory config` or `.aide/config.json`
- Default: all hooks active, current blocking/soft rules (free tier)
- Pro: fine-grained control over every aspect of hook behavior

Configurable settings — all live in `scripts/hooks/defaults.json` with `public: true`, seeded into `.aide/config.json` at init, user-settable via `aide-memory config KEY VALUE`. The canonical list is in the **"Public config defaults"** table earlier in this spec. Settings not yet in `defaults.json` (e.g. `recall.layerOrder`, `recall.searchMode`, `autoUpdate.enabled`, `postCheckout.reindex`, `embedding.model`, `embedding.enabled`) are read from `.aide/config.json` directly or hardcoded elsewhere — they can be promoted to the defaults.json surface in later iterations if user demand surfaces.

All settings should also map to Cursor's equivalent config system (see P1.18).

Settings that vary by project nature:
- **Monorepo/large codebase**: higher `recall.limit` (30+), more aggressive blocking via `hooks.*.maxBlocks`
- **Small project/solo dev**: lower `memories.softening.threshold` (5), `hooks.stop.schedule` tuned longer, search off
- **Team project**: `injection.preferences` higher (25+), contributor-aware injection (item 7)
- **Security-sensitive**: all hooks blocking, no grep visibility (`memories.hideFromGrep=true`), strict correction enforcement

**6. Automatic memory cleanup (Phase 2 pro feature):**
- Detect and surface stale/conflicting/duplicate memories
- Trigger points: PostToolUse (after edits that invalidate context), post-session (batch), or periodic background
- Examples: memory says "auth uses bcrypt" but code now uses argon2, memory references deleted file, two memories contradict
- Agent gets prompted: "3 memories may be stale — review and aide_forget or aide_update"

**7. Contributor-aware auto-injection (Phase 2 pro feature):**
- SessionStart auto-injection and recall should prioritize current contributor's memories over others'
- If user A is working, their preferences/guidelines rank above user B's in injection and recall
- Contributor identity from git config (`user.name` / `user.email`) or explicit `aide-memory config contributor`
- Team memories (shared: true) still surface but personal preferences of the current contributor rank first

**8. Cursor hook setup in `aide-memory init`:**
- `aide-memory init` currently installs Claude Code hooks (`.claude/settings.json` hooks section) — Cursor needs equivalent hook configuration (`.cursor/hooks.json`) so the capture-recall loop works out of the box in Cursor too
- **2026-04-23 — NO LONGER BLOCKED.** Full plan at [`CURSOR_ONBOARDING.md`](./CURSOR_ONBOARDING.md) — Phase C1 introduces `EditorAdapter` abstraction; Phase C2 generates `.cursor/hooks.json` + `.cursor/mcp.json` alongside the existing Claude Code files; Phases C3–C5 translate envelopes + handle Cursor platform caveats; Phases C6–C8 cover tests + docs + validation. Same abstraction makes future editor onboarding (Windsurf, Codex, Copilot, Cline, Aider) a ~1-day add per editor.
- P1.9 and P1.14 have the detailed checklist items; CURSOR_ONBOARDING.md is the coordination doc.

Both cleanup, configurability, and contributor prioritization are monetization features — free tier gets opinionated defaults, paid tier gets customization + maintenance + contributor awareness

---

### PRIORITY ORDER FOR REMAINING WORK

| Priority | Item | Who | Blocker? |
|----------|------|-----|----------|
| 1 | Run 6 validation scenarios | COWORK | Yes — launch gate |
| 2 | PostHog account setup | COWORK | No — analytics works locally without it |
| 3 | Logo rework (3-5 options, pick winner, export sizes) | COWORK + USER | No — but needed before launch marketing |
| 4 | Demo setup + recording prep (script, env, guide) | COWORK | Yes — must complete before recordings |
| 5 | MCP Registry submission | COWORK | No — after validation |
| 6 | Claude Code marketplace research (research only, user reviews) | COWORK | No — user approves before submission |
| 7 | Demo recordings + landing page embed | USER | Yes — must complete before marketing |
| 8 | Review ALL public content (README, blogs, landing page, demos) | USER + COWORK | Yes — sign-off gate before submissions |
| 9 | npm republish (bump version, apply validation fixes) | COWORK | Yes — before marketing so install commands are current |
| 10 | Marketing/publishing submissions | COWORK | No — after demo + review + npm republish |
| 11 | Cursor marketplace submission | COWORK | No — deferred until after Cursor validation |
| 12 | Cursor validation | USER | No — deferred |
| 13 | Company registration | USER | No — Phase 2 |
| 14 | Claude ecosystem guides (Desktop, Web, Cowork) | CLAUDE CODE | No — Phase 1 follow-up |
| 15 | Non-IDE developer docs (agent frameworks, CI/CD) | CLAUDE CODE | No — Phase 1 follow-up |

---

## Table of Contents

1. [Component Breakdown](#1-component-breakdown)
2. [Build Order](#2-build-order)
3. [Acceptance Criteria](#3-acceptance-criteria)
4. [Testing Plan — Unit Tests](#4-testing-plan--unit-tests)
5. [Testing Plan — Integration Tests](#5-testing-plan--integration-tests)
6. [Agent Strategy](#6-agent-strategy)
7. [Branching & Commit Strategy](#7-branching--commit-strategy)
8. [Migration Plan](#8-migration-plan)
9. [Open Questions](#9-open-questions)

---

## 1. Component Breakdown

### Phase 0 — Foundation ("Ready to launch")

Phase 0 is business/legal infrastructure with no engineering dependencies. Can run fully in parallel with Phase 1 engineering work.

| ID | Component | What needs to be built | Already exists | Effort | Dependencies |
|----|-----------|----------------------|----------------|--------|-------------|
| P0.1 | Domain Registration | Register `aide-memory.dev` or `useaide.dev`. DNS setup. | Nothing | S | None |
| P0.2 | Legal | Trademark search for AIDE. Proprietary freeware EULA. Terms & Conditions for landing page/npm. Explore company registration. | Nothing | M | None (external/async) |
| P0.3 | Public GitHub Repo | `aide-memory` on GitHub. README, issue tracker, release templates. No source code. | Nothing | S | P0.2 (license text for README) |
| P0.4 | npm Package Reservation | Reserve `aide-memory` on npm. Set up publish workflow. | Nothing | S | P0.3 |
| P0.5 | Landing Page | Simple page: what it does, install command, waitlist. No Phase 2+ roadmap revealed. | Nothing | S-M | P0.1 (domain) |
| P0.6 | User Documentation | Quick start guide, CLI command reference, MCP tool reference, configuration guide. Hosted on public GitHub repo + linked from landing page. ALL aide commands and MCP tools documented with examples. | Nothing | M | P0.3 (repo to host docs) |

**Note:** PRODUCT_VISION lists basic telemetry infrastructure as a Phase 0 item. The engineering work (event tracking, telemetry transport) is in P1.12. Phase 0 telemetry is limited to: choosing a telemetry provider (PostHog recommended — self-hosted option, 1M free events/month), setting up the account, and defining the event schema. No code needed until Phase 1.

**Phase 0 total estimate:** 1-2 weeks. All items are parallelizable. P0.2 (legal) is the only long-lead item.

---

### Phase 1 — Individual Memory Engine ("My agent remembers")

#### Existing codebase (what we're building on)

| File | What it does | Tests | Status |
|------|-------------|-------|--------|
| `src/memory/store.ts` | SQLite store: CRUD, WAL mode, search (LIKE), recalled_count tracking, prune. Auto-increment integer IDs. Schema v1. 262 lines. | 20 (store.test.ts) | Working |
| `src/memory/recall.ts` | Path-scoped recall: glob matching, parent inheritance, layer priority ordering, keyword scoring. 129 lines. | 18 (recall.test.ts + scopes.test.ts) | Working |
| `src/memory/server.ts` | MCP server: 6 tools (aide_recall, aide_remember, aide_forget, aide_memories, aide_import, aide_search). 309 lines. | 9 (server.test.ts) | Working |
| `src/memory/types.ts` | Types: Memory, CreateMemory, MemoryLayer, MemoryStatus, MemorySource, RecallQuery, RecallResult. 42 lines. | N/A | Working |
| `scripts/hooks/pre-read-recall.sh` | PreToolUse hook: calls recall-for-path.js, injects all matched memories via additionalContext. | Manual only | Working (needs refactor to nudge) |
| `scripts/hooks/stop-remember.sh` | Stop hook: blocks first stop, prompts agent to reflect and call aide_remember. | Manual only | Working |
| `scripts/hooks/detect-correction.sh` | UserPromptSubmit hook: regex detects correction patterns, injects context to store correction. | Manual only | Working |
| `scripts/hooks/recall-for-path.js` | Direct SQLite query for PreToolUse hook. Bypasses MCP. 43 lines. | Manual only | Working |

**Total existing: ~785 lines of source, 47+ tests across 6 test files, zero type errors.**

#### Phase 1 Components

| ID | Component | What needs to be built | Already exists | Effort | Dependencies |
|----|-----------|----------------------|----------------|--------|-------------|
| P1.1 | Storage Migration | JSON file-per-memory in `.aide/memories/<layer>/`. SQLite becomes cached index. UUID-based IDs. Hash-based cache rebuild. Directory structure with gitignore. | MemoryStore class, schema, all CRUD methods | **L** | None (critical path) |
| P1.2 | Type System Update | UUID field, `tags: string[]`, `shared: boolean`, `updated_at`. Remove `status` field entirely (file exists = active, file deleted = gone). MemorySource adds `hook`. Contributor becomes required. | Current Memory/CreateMemory types | S | Co-evolves with P1.1 |
| P1.3 | FTS5 Search | FTS5 virtual table, BM25 ranking, replace LIKE-based search. Sync FTS index with memory table. | LIKE-based search in store.search() | S | P1.1 (needs new schema) |
| P1.4 | Embedding Pipeline | sqlite-vec extension, local embedding model download, embedding generation on store, cosine similarity fallback search. | Old semantic search in src/retrieval/ (different architecture) | M | P1.1 |
| P1.5 | Hook Refactoring | ALL hooks nudge/prompt only — NEVER dump memory content. **4 hooks:** PreToolUse (count nudge), Stop (reflection prompt), UserPromptSubmit (correction + decision + preference detection), **PreCompact (extract decisions before context loss)**. All hidden via additionalContext. Dedup across hooks. Source tagging (`source: hook`). | 3 working hooks + recall-for-path.js | S-M | P1.1 (hooks query new store) |
| P1.6 | aide_update MCP Tool | New MCP tool for editing existing memories. Contributor ownership convention. Update `what`, `why`, `scope`, `tags`, `status`. | store.update() method exists | S | P1.1, P1.2 |
| P1.7 | CLI Framework | New entry point: `aide-memory` binary. Full parity with MCP tools. Commands: `aide-memory init`, `recall`, `remember`, `search`, `list`, `stats`, `config`, `update`, `forget`, `sync import`, `sync export`. Commander.js. | Old CLI framework (different commands) | M | P1.1 |
| P1.8 | Rules Files | `.claude/rules/aide-memory.md` for Claude Code. `.cursor/rules/aide-memory.mdc` for Cursor. Written for ALL supported tools at init (Copilot, Windsurf, Codex). Rules guide model on when/how to call MCP tools. | Current `.claude/rules/aide-memory.md` (for this project, not production) | S | None (just text files) |
| P1.9 | Cursor Support | `.cursor/hooks.json` config for Cursor hooks. MCP server config for Cursor (`~/.cursor/mcp.json` or project-level). | Nothing | S | P1.8 |
| P1.10 | Sync (Post-checkout + Manual) | Git post-checkout hook for auto-import. ALSO manual commands: `aide-memory sync import` (rebuild SQLite from JSON) and `aide-memory sync export` (ensure all memories have JSON files). Compares by UUID + `updated_at` (newer wins). Sync safety: JSON files are ALWAYS source of truth; SQLite is rebuildable. | Nothing | M | P1.1 |
| P1.11 | Config System | `.aide/config.json` schema. `aide config` CLI subcommand. Settings: nudge visibility (default OFF), capture (default ON), tag presets, cleanup thresholds. | Nothing | M | P1.7 (CLI framework) |
| P1.12 | Analytics & Telemetry | Local `analytics` table in SQLite (event, value, tool, timestamp). Default-ON anonymous telemetry (disable via `AIDE_TELEMETRY=off` or `aide-memory config telemetry.enabled false`). Events: install, init, memory_stored, memory_recalled, hook_triggered, tool_used. | recalled_count in store | M | P1.1, P1.11 (telemetry config) |
| P1.13 | aide stats | CLI command displaying: memory count by layer, most-recalled, stale candidates, capture source breakdown, hook effectiveness. | Nothing | S | P1.12 (reads analytics) |
| P1.14 | aide-memory init | One-command setup: creates `.aide/` directory tree, writes rules files for all tools, sets up hooks, **auto-configures MCP server in tool allowlists** (Claude Code settings.json, Cursor mcp.json), creates config.json with defaults, downloads embedding model, configures `.gitignore`, installs post-checkout hook. Also: `aide-memory init --update-rules` to refresh rules without touching config/memories. | Nothing | M | P1.1, P1.4, P1.8, P1.9, P1.10, P1.11 |
| ~~P1.15~~ | ~~Pre-train Scan~~ | **REMOVED (Apr 2026).** `aide-memory init --scan` was removed because output was too surface-level (package.json + dir inference only). See follow-up "Deferred: Auto-scan for Codebase Pattern Discovery" in PHASE_0_1_VALIDATION_FOLLOWUPS.md. Use `aide_import` against existing CLAUDE.md / README for richer onboarding. | — | — | — |
| P1.16 | npm Package | Clean package.json for `aide-memory`. Build: tsc + bundle/minify. npx support. Binary entry point. Exclude old aide-v0 code. | Current aide-v0 package.json | M | All code complete |
| P1.17 | Pre-ship Validation | Controlled comparison: **realistic general coding tasks** (not "remember X" — agent shouldn't know it's being tested for recall). Measurable quality difference. At least 5 scenarios across Claude Code + Cursor. Prove value within single session AND across sessions. | E2E comparison test exists (different format) | M | Everything working |
| P1.18 | Plugin/Marketplace | Claude Code plugin listing (marketplace discovery). Cursor extension/adapter listing if applicable. Increases visibility alongside npm distribution. | Nothing | S | P1.16 (package ready) |
| P1.19 | Demo & Marketing Assets | Individual feature demo snippets (capture, recall, nudge, search, init). One full-flow demo showing end-to-end value. Used for landing page, blog posts, social media, HN launch. | Nothing | M | P1.17 (validation proves value) |
| P1.20 | Update Mechanism | Code updates via `npm update aide-memory`. Rules refresh via `aide-memory init --update-rules` (refreshes rules without touching config/memories). Startup version check: if newer version available, print one-line suggestion (opt-in, not auto-install). | Nothing | S | P1.16 |
| P1.21 | User Documentation | All CLI commands documented with examples. All MCP tools documented. Configuration guide. Troubleshooting guide. Quick start (2-minute install → first recall). Architecture overview for contributors. Hosted on public GitHub repo. | Nothing | M | P0.6 (doc structure), all code |

**Phase 1 total estimate:** 4-6 weeks.

---

## 2. Build Order

### Dependency Graph

```
P1.2 (Types) ──┐
               ├── P1.1 (Storage) ──┬── P1.3 (FTS5)
               │                    ├── P1.4 (Embeddings) ──┐
               │                    ├── P1.5 (Hooks)        │
               │                    ├── P1.6 (aide_update)   │
P1.8 (Rules) ──┤                    ├── P1.10 (Post-checkout)│
               │                    │                        │
               │    P1.7 (CLI) ─────┼── P1.11 (Config) ─────┤
               │                    │                        │
               │    P1.9 (Cursor) ──┘                        │
               │                                             │
               │    P1.12 (Analytics) ── P1.13 (Stats)       │
               │                                             │
               └── P1.14 (Init) ─────────────────────────────┘
                       │
                   P1.15 (Pre-train)
                       │
                   P1.16 (npm Package)
                       │
                   P1.17 (Validation)
```

### Sprint Schedule

#### Sprint 1 — Storage Foundation (Week 1-2)

**Goal:** New file-per-memory architecture passes all existing tests.

| Order | Component | Can parallel? | Notes |
|-------|-----------|--------------|-------|
| 1 | P1.2 Type System Update | Start here | ~1 hour. Update types.ts first — everything imports from it. |
| 2 | P1.1 Storage Migration | Sequential after P1.2 | **Critical path.** New MemoryFileStore wrapping JSON files + SQLite cache. All existing tests must pass against new store. |
| 3 | P1.3 FTS5 Search | Parallel with late P1.1 | Independent SQLite addition. Can build FTS5 module separately, integrate once P1.1 is stable. |
| 4 | P1.8 Rules Files | Parallel (independent) | Pure text files. No code deps. Write all tool rules in parallel with P1.1. |

**End of Sprint 1 deliverable:** `MemoryStore` writes JSON files to `.aide/memories/<layer>/`, SQLite is a cached index rebuilt from files, FTS5 search works, rules files ready for all tools.

#### Sprint 2 — Core Features (Week 2-3)

**Goal:** Hooks working with new architecture, MCP server updated, CLI framework started.

| Order | Component | Can parallel? | Notes |
|-------|-----------|--------------|-------|
| 5 | P1.5 Hook Refactoring | After P1.1 | Change PreToolUse from dump to nudge. Update recall-for-path.js for new store. |
| 6 | P1.6 aide_update Tool | After P1.1 | Simple MCP tool addition. |
| 7 | P1.7 CLI Framework | Parallel | New entry point, basic commands (init, recall, remember, list). |
| 8 | P1.9 Cursor Support | Parallel with P1.8 | Hook config + MCP config for Cursor. |
| 9 | P1.11 Config System | Parallel | .aide/config.json + aide config CLI. |

**End of Sprint 2 deliverable:** Full capture-store-recall loop working with nudge hooks, CLI commands for basic operations, Cursor config ready.

#### Sprint 3 — Search, Sync, Analytics (Week 3-4)

**Goal:** Full search stack, git sync, analytics pipeline.

| Order | Component | Can parallel? | Notes |
|-------|-----------|--------------|-------|
| 10 | P1.4 Embedding Pipeline | After P1.1 | sqlite-vec, local model, cosine similarity. |
| 11 | P1.10 Post-checkout Hook | After P1.1 | Git hook, file import logic. |
| 12 | P1.12 Analytics & Telemetry | After P1.11 | Analytics table, event logging, telemetry transport. |
| 13 | P1.13 aide stats | After P1.12 | Display command for analytics data. |

**End of Sprint 3 deliverable:** FTS5 + semantic search working, post-checkout sync working, analytics tracking and display.

#### Sprint 4 — Init & Distribution (Week 4-5)

**Goal:** One-command install experience, npm package ready.

| Order | Component | Can parallel? | Notes |
|-------|-----------|--------------|-------|
| 14 | P1.14 aide init | After Sprint 2-3 | Orchestrates all setup: dirs, rules, hooks, config, model download, gitignore. |
| ~~15~~ | ~~P1.15 Pre-train Scan~~ | — | Removed Apr 2026 (see PHASE_0_1_VALIDATION_FOLLOWUPS.md). |
| 16 | P1.16 npm Package | After all code | Package.json cleanup, build pipeline, npx support. |

**End of Sprint 4 deliverable:** `npm install -g aide-memory && aide-memory init` works end-to-end.

#### Sprint 5 — Validation & Polish (Week 5-6)

**Goal:** Ship-ready. Proven quality improvement.

| Order | Component | Notes |
|-------|-----------|-------|
| 17 | P1.17 Pre-ship Validation | 5 scenarios, Claude Code + Cursor, with vs without memories. |
| 18 | Polish | Error handling, graceful degradation, startup time optimization, edge cases. |

**End of Sprint 5 deliverable:** Validated, polished, ready for npm publish.

---

## 3. Acceptance Criteria

### P0.1 — Domain Registration

- [ ] Domain registered and DNS resolving
- [ ] HTTPS configured
- [ ] Email forwarding set up (hello@aide-memory.dev or equivalent)

### P0.2 — Legal

- [ ] USPTO TESS trademark search completed for "AIDE" in software class
- [ ] AiDE(R) trademark conflict assessed by legal counsel
- [ ] Proprietary freeware EULA drafted (free to use, no modification/redistribution)
- [ ] Company registration decision made (register vs defer)
- [ ] EULA reviewed by legal counsel

### P0.3 — Public GitHub Repo

- [ ] `aide-memory` repo created on GitHub
- [ ] README with: product description, install command, feature overview, license
- [ ] Issue templates: bug report, feature request
- [ ] Release workflow configured (GitHub Actions)
- [ ] No source code in the public repo

### P0.4 — npm Package Reservation

- [ ] `aide-memory` package reserved on npm
- [ ] `npm install -g aide-memory` resolves (even if it's a placeholder)
- [ ] Publish workflow tested (dry-run)
- [ ] Package metadata: description, keywords, homepage, repository

### P0.5 — Landing Page

- [ ] Live at registered domain
- [ ] Content: one-sentence pitch, install command (`npm install -g aide-memory && aide-memory init`), feature bullets, waitlist signup
- [ ] No Phase 2/3/4 roadmap revealed
- [ ] Mobile-responsive
- [ ] Analytics (page views, waitlist signups)

---

### P1.1 — Storage Migration

**Done looks like:** Memories are stored as individual JSON files. SQLite is a cache that can be deleted and rebuilt. All existing functionality preserved.

- [ ] `.aide/memories/` directory structure created:
  ```
  .aide/memories/
  ├── preferences/
  │   ├── personal/        ← gitignored
  │   └── shared/          ← tracked
  ├── technical/           ← tracked
  ├── area_context/        ← tracked
  └── guidelines/          ← tracked
  ```
- [ ] Each memory is one JSON file with UUID filename (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890.json`)
- [ ] JSON file schema:
  ```json
  {
    "uuid": "string (UUIDv4)",
    "layer": "preferences|technical|area_context|guidelines",
    "what": "string",
    "why": "string|null",
    "scope": "string|null (glob pattern)",
    "context_label": "string|null",
    "contributor": "string (required, auto-detected from git config user.name)",
    "tags": ["string"],
    "source": "conversation|import|agent_discovery|elevated|hook",
    "shared": "boolean (true for all layers except preferences/personal)",
    "generated_by": {
      "tool": "string|null (claude-code, cursor, cli, etc.)",
      "model": "string|null (claude-opus-4, gpt-4, etc. — auto-detected if possible)",
      "author_type": "human|ai (human = user typed aide remember, ai = agent called aide_remember)"
    },
    "created_at": "ISO 8601 string",
    "updated_at": "ISO 8601 string"
  }
  ```
- [ ] `generated_by` tracks provenance of HOW the memory was created. `contributor` (always required) tracks WHO — the human developer, from git config. Both are always present. A memory created by Claude Code for developer "meky" has `contributor: "meky"` AND `generated_by: { tool: "claude-code", model: "claude-opus-4", author_type: "ai" }`. A memory typed manually via CLI has `contributor: "meky"` AND `generated_by: { tool: "cli", model: null, author_type: "human" }`. This enables analytics: which tool/model produces the most-recalled memories, human-authored vs AI-discovered quality comparison.
- [ ] **No `status` field.** A memory either exists (file present = active) or is deleted (file removed). Tags like `outdated` or `deprecated` are used for soft-flagging without removal. Git history preserves deleted memories if recovery is needed.
- [ ] `recalled_count` and `last_recalled_at` are SQLite-only (local tracking, not in JSON files)
- [ ] `add()` creates a new JSON file in the correct layer directory and inserts into SQLite cache
- [ ] `get()` reads from SQLite cache (not from JSON file on every access)
- [ ] `update()` modifies the JSON file and updates SQLite cache
- [ ] `remove()` deletes the JSON file and removes from SQLite cache
- [ ] `list()` queries SQLite cache (not filesystem scan)
- [ ] SQLite cache rebuild: on startup, hash `.aide/memories/` directory state. If hash differs from stored hash, rebuild by scanning JSON files. Typical rebuild < 200ms for 500 files.
- [ ] Deleting the SQLite cache file and restarting produces identical behavior (full rebuild from files)
- [ ] All 47+ existing tests pass against new storage layer (or are updated to match new types)
- [ ] JSON file write is atomic (write to temp file, rename) to prevent corruption on crash

**Edge cases:**
- Malformed JSON file: log warning, skip, continue with remaining files
- Missing layer directory: create on first write
- UUID collision: statistically impossible (UUIDv4), but check on insert and regenerate if somehow collides
- Concurrent writes: not an issue for single-developer use; file-per-memory means no write conflicts
- Empty `.aide/memories/` on first run: works, zero memories recalled

**Failure modes:**
- Disk full on write: return error from add(), do not leave partial JSON files
- Read-only filesystem: fail gracefully on write, still serve reads from SQLite cache
- Corrupted SQLite cache: delete and rebuild from JSON files (self-healing)

### P1.2 — Type System Update

- [ ] `Memory` interface updated:
  - `uuid: string` added (primary identifier)
  - `id: number` retained (SQLite row ID, cache-only)
  - `contributor: string` (required, not nullable — auto-detected from git config user.name, overridable via env `AIDE_CONTRIBUTOR` or `.aide/config.json`)
  - `tags: string[]` added
  - `shared: boolean` added
  - `updated_at: string` added
  - `derived_from: string[] | null` (UUIDs, not numbers)
- [ ] `MemoryStatus` type **removed entirely**. No status field. File exists = active, file removed = deleted.
- [ ] `MemorySource` adds `'hook'` option
- [ ] `CreateMemory` updated to match (uuid auto-generated, contributor auto-detected)
- [ ] `MemoryFile` type added (JSON file content, excludes SQLite-only fields like recalled_count)
- [ ] `RecallQuery` adds optional `contributor` filter
- [ ] All imports compile with zero type errors

### P1.3 — FTS5 Search

**Done looks like:** `aide_search` uses FTS5 full-text search with BM25 ranking instead of LIKE.

- [ ] FTS5 virtual table `memories_fts` created: `CREATE VIRTUAL TABLE memories_fts USING fts5(what, why, context_label, content=memories, content_rowid=id)`
- [ ] Triggers keep FTS index in sync with `memories` table (INSERT, UPDATE, DELETE)
- [ ] `store.search()` uses FTS5 MATCH with BM25 ranking: `SELECT * FROM memories WHERE id IN (SELECT rowid FROM memories_fts WHERE memories_fts MATCH ? ORDER BY rank)`
- [ ] Search supports multi-word queries
- [ ] Search results ranked by BM25 relevance (most relevant first)
- [ ] Layer and status filters still work alongside FTS5
- [ ] FTS5 index rebuilt during cache rebuild (same trigger as main table)
- [ ] Graceful fallback: if FTS5 is unavailable (custom SQLite build), fall back to LIKE-based search with a logged warning
- [ ] Performance: search across 2,000 memories completes in < 50ms

**Edge cases:**
- Empty query string: return empty results
- Special characters in query (quotes, parentheses): escape for FTS5 syntax
- Very long query strings (>500 chars): truncate to first 500 chars

### P1.4 — Embedding Pipeline

**Done looks like:** Semantic search works as a fallback when FTS5 returns no results or when the query is conceptual.

- [ ] sqlite-vec extension loaded into SQLite database
- [ ] Embedding model downloaded during `aide init` (local, no API keys)
- [ ] Model choice documented and justified (size vs quality tradeoff for local use)
- [ ] `embeddings` table: `uuid TEXT PRIMARY KEY, vector BLOB` (sqlite-vec format)
- [ ] Embedding generated on `add()` and stored in embeddings table
- [ ] `store.semanticSearch(query, limit)` method: embed query, cosine similarity via sqlite-vec, return top-N
- [ ] **System decides search method, not the model.** Recall flow: FTS5 first → if < 3 results, system automatically supplements with semantic search. The model does NOT choose which search method to use — it calls `aide_search(query)` and the system handles routing internally. Model CAN pass `method: "semantic"` to force semantic-only search for conceptual queries, but this is optional.
- [ ] Model download is interruptible and resumable
- [ ] Model size documented (target: < 100MB for usability)
- [ ] Embedding generation performance: < 50ms per memory on typical hardware

**Edge cases:**
- Model not yet downloaded: skip semantic search, FTS5 only, log info message
- Corrupted model file: re-download on next init
- Memory too short to embed meaningfully (< 10 chars): skip embedding, mark as unembedded

**Failure modes:**
- sqlite-vec not available on platform: semantic search disabled, FTS5 + LIKE used. Log warning once.
- Out of memory during embedding: skip that memory, continue with remaining

### P1.5 — Hook Refactoring

**Done looks like:** ALL hooks are nudge/prompt-only. They NEVER dump memory content into the context. The agent always decides whether to call `aide_recall` to fetch actual memories.

**Core principle: hooks tell the agent memories exist, the agent decides whether to retrieve them.**

- [ ] PreToolUse hook (pre-read-recall.sh) — **NUDGE ONLY:**
  - Counts memories matching the file path via fast SQL query
  - Output: `"N memories exist for <path>. Call aide_recall if relevant."` (~20 tokens)
  - Injected via `additionalContext` (invisible in terminal)
  - **Never includes memory content** — only the count
- [ ] Stop hook (stop-remember.sh) — **PROMPT ONLY:**
  - Prompts agent to reflect: "Anything worth remembering?"
  - Output via `additionalContext` (hidden from terminal)
  - **Never reads or dumps stored memories**
- [ ] UserPromptSubmit hook (detect-correction.sh) — **PROMPT ONLY:**
  - Detects **corrections, decisions, and preferences** in user message
  - Patterns for Phase 1:
    - Corrections: "no, don't use...", "actually...", "wrong...", "not like that", "instead use..." (existing)
    - Decisions: "let's use...", "we should...", "go with...", "the approach is...", "decided to..."
    - Preferences: "I prefer...", "always use...", "never use...", "I like...", "my style is..."
  - Prompts agent with appropriate layer suggestion: corrections → technical/preferences, decisions → area_context, preferences → preferences
  - Output via `additionalContext` (hidden from terminal)
  - **Never reads or dumps stored memories** — only prompts to store new ones
  - Phase 2+ exploration: expand to more generic capture, smarter filtering, potentially all user prompts with model-based relevance scoring
- [ ] **PreCompact hook (NEW) — CLEANUP ONLY:**
  - Fires before both manual /compact and auto-compact (Claude Code provides this hook with `session_id`, `transcript_path`, `trigger` type)
  - Cleanup-only: clears all session tracking (exit 0, no output). Cannot force agent tool calls — Claude Code limitation.
  - This is a high-value hook — 350+ GitHub comments document context loss pain from compaction
  - Context saving is handled by the Stop hook (dynamic interval) throughout the session, so important decisions are already stored by the time compaction happens.
  - Note: Cursor equivalent hook name may differ — verify during Cursor integration testing
- [ ] recall-for-path.js updated to work with new storage architecture (reads SQLite cache, not old DB path)
- [ ] Dedup logic: within a single interaction, if PreToolUse already triggered and Stop also fires, the agent should not store the same memory twice. Implemented via session-scoped dedup check (hash of what + scope stored in temp file, checked before each store)
- [ ] Source tagging: memories captured via hooks get `source: "hook"` in the JSON file
- [ ] **Memory file read tracking:** When the hook detects a Read of a `.aide/memories/` file, log an analytics event (`memory_file_direct_read`). Optionally nudge: "You're reading a raw memory file. Use aide_recall for structured context." This lets us track how often tools read memory files directly.
- [ ] Hook scripts exit cleanly (exit 0) on any error — never break the agent

**Future hook candidates (Phase 1.5 or Phase 2):**
- PreToolUse on Write/Edit: "You're about to modify this file. N memories exist about it." — nudge before modifications, not just reads. Heavier weight (fires more often), evaluate after Phase 1 launch.
- UserPromptSubmit patterns beyond corrections: decisions ("let's use X"), preferences ("I prefer Y"), confirmations ("perfect, that's right" — signals the approach should be remembered). Extend the regex in detect-correction.sh.

**Edge cases:**
- File path not under project root: skip recall, exit 0
- SQLite cache doesn't exist yet (first run before init): exit 0, no error
- Very large number of memories for a path (100+): nudge says "100+ memories", doesn't change behavior

### P1.6 — aide_update MCP Tool

**Done looks like:** Agent can update an existing memory's content, scope, tags, or status.

- [ ] New MCP tool `aide_update` registered in server.ts
- [ ] Parameters: `uuid` (required), `what`, `why`, `scope`, `tags`, `context_label` (all optional — update only provided fields). No `status` parameter — use aide_forget to delete.
- [ ] Tool description guides the model: "Update an existing memory. Use when information has changed, scope needs adjusting, or tags need updating. You can only update your own memories."
- [ ] Contributor ownership: tool checks that the memory's `contributor` matches the current user. If not, returns error: "You can only update your own memories."
- [ ] `updated_at` field set to current timestamp on every update
- [ ] JSON file updated (atomic write)
- [ ] SQLite cache updated
- [ ] Returns: updated memory content with confirmation message

**Edge cases:**
- UUID not found: return "Memory not found"
- No fields provided to update: return current memory unchanged
- To delete a memory, use aide_forget (which deletes the file), not aide_update

### P1.7 — CLI Framework

**Done looks like:** `aide-memory` CLI binary runs all Phase 1 commands with full MCP tool parity.

- [ ] New CLI entry point at `src/cli/aide-memory.ts` (separate from old aide CLI)
- [ ] Binary name: `aide-memory` (avoids conflicts with other AIDE products or old aide binary)
- [ ] Commander.js command structure:
  ```
  aide-memory init [--update-rules]             Create .aide/, write rules, set up hooks, configure MCP
  aide-memory recall <path>                     Recall memories for a file/directory path
  aide-memory remember <what>                   Store a memory (--layer, --scope, --tags, --why)
  aide-memory update <uuid>                     Update an existing memory (--what, --why, --scope, --tags)
  aide-memory forget <uuid>                     Delete a memory (removes JSON file)
  aide-memory search <query>                    Search memories by keyword (FTS5)
  aide-memory list                              List memories (--layer, --scope, --contributor, --limit)
  aide-memory stats                             Show memory analytics
  aide-memory config <key> [value]              Get or set configuration
  aide-memory sync import                       Rebuild SQLite cache from JSON files
  aide-memory sync export                       Ensure all memories have JSON files
  aide-memory migrate                           Migrate from legacy memory.db format
  ```
- [ ] **Full MCP ↔ CLI parity table:**
  | MCP Tool | CLI Command | Notes |
  |----------|-------------|-------|
  | aide_recall | `aide-memory recall` | Same output format |
  | aide_remember | `aide-memory remember` | Same fields |
  | aide_update | `aide-memory update` | Same fields |
  | aide_forget | `aide-memory forget` | Deletes JSON file |
  | aide_search | `aide-memory search` | Same FTS5 search |
  | aide_memories | `aide-memory list` | Same filters |
  | aide_import | `aide-memory sync import` | Manual cache rebuild |
  | — | `aide-memory sync export` | CLI-only (cache → files) |
  | — | `aide-memory init` | CLI-only (setup) |
  | — | `aide-memory stats` | CLI-only (analytics) |
  | — | `aide-memory config` | CLI-only (settings) |
- [ ] All commands read from the same `.aide/` directory and SQLite cache
- [ ] `aide-memory recall` output: formatted markdown with layer grouping (same format as MCP tool)
- [ ] `aide-memory remember` prompts for required fields not provided as flags
- [ ] `aide-memory list` supports filtering by layer, scope, contributor, tags
- [ ] `aide-memory search` uses FTS5 (same as MCP tool)
- [ ] All commands exit 0 on success, exit 1 on error with useful error message
- [ ] `--help` works for every command
- [ ] `--version` outputs package version

**Edge cases:**
- No `.aide/` directory: suggest running `aide-memory init` first
- Empty store: "No memories stored yet. Use aide-memory remember or let hooks capture context during work."

### P1.8 — Rules Files

**Done looks like:** Rules files for all supported tools are ready to be written during `aide init`.

- [ ] Claude Code rules file (`.claude/rules/aide-memory.md`):
  - When to call `aide_recall` (on file reads, starting new tasks, after context loss)
  - When to call `aide_remember` (corrections, decisions, discoveries, task completion)
  - How to format memories (layer selection heuristics, scope patterns, tag assignment)
  - When to call `aide_update` (information changed, scope needs adjusting)
  - Never store: secrets, temporary state, obvious facts derivable from code
  - Contributor: auto-detect from git config user.name
  - Hidden: rules about memory management should not be mentioned to user unless asked
- [ ] Cursor rules file (`.cursor/rules/aide-memory.mdc`):
  - Same content adapted to Cursor's MDC format (with frontmatter: description, globs)
  - Instructions for calling MCP tools in Cursor's agent mode
- [ ] Copilot instructions (`copilot-instructions.md` section):
  - Lightweight: point to MCP tools, basic recall/remember guidance
- [ ] Windsurf rules (`.windsurfrules` section):
  - Same as Copilot: lightweight MCP guidance
- [ ] Codex agent instructions (`AGENTS.md` section):
  - Lightweight MCP guidance
- [ ] All rules files are templates stored in `src/templates/rules/`
- [ ] Each template is < 2,000 tokens (minimize MCP overhead)
- [ ] Rules tested: model reads file and correctly calls aide_recall on file reads (manual validation)

### P1.9 — Cursor Support

- [ ] `.cursor/hooks.json` configuration template:
  - PreToolUse hook pointing to pre-read-recall.sh
  - Stop hook pointing to stop-remember.sh (if Cursor supports Stop hooks)
  - Document any Cursor hook limitations vs Claude Code
- [ ] MCP server configuration for Cursor:
  - Project-level `.cursor/mcp.json` or user-level `~/.cursor/mcp.json`
  - Points to aide-memory MCP server binary
  - Correct stdio transport config
- [ ] Verified: Cursor agent reads `.cursor/rules/aide-memory.mdc` on session start
- [ ] Verified: Cursor agent can call aide_recall and aide_remember MCP tools

### P1.10 — Sync (Post-checkout + Manual Import/Export)

**Done looks like:** Automatic sync on git pull/checkout. Manual sync available anytime via CLI. JSON files are ALWAYS source of truth — SQLite cache is always rebuildable.

#### Automatic: Post-checkout Git Hook

- [ ] Git hook script installed via `aide-memory init` to `.git/hooks/post-checkout`
- [ ] On trigger: scan `.aide/memories/` for JSON files
- [ ] For each file: check if UUID exists in local SQLite
  - New file (UUID not in SQLite): insert into cache
  - Changed file (UUID exists, file's `updated_at` > SQLite's `updated_at`): update cache
  - Unchanged: skip
  - Deleted file (UUID in SQLite but file gone): remove from cache
- [ ] Skip files in `preferences/personal/` (gitignored, should never appear)
- [ ] Performance: < 500ms for 100 changed files
- [ ] Hook exits 0 on any error (never block git operations)
- [ ] Hook is idempotent (running twice produces same result)

#### Manual: `aide-memory sync import` and `aide-memory sync export`

- [ ] `aide-memory sync import`: Full rebuild of SQLite cache from JSON files. Equivalent to deleting the cache and letting it rebuild. Safe, idempotent. Use when: post-checkout hook didn't fire, debugging, manual pull without hooks.
- [ ] `aide-memory sync export`: Scan SQLite for any memories without corresponding JSON files and create them. In normal operation this never happens (add() writes both), but serves as a safety net and debugging tool.
- [ ] Both commands print summary: "Imported N new, updated M, removed K memories."

#### Sync Safety Protocol

- [ ] JSON files are the canonical source of truth. SQLite can ALWAYS be deleted and rebuilt.
- [ ] **Every `add()`, `update()`, `remove()` writes to BOTH JSON file and SQLite simultaneously.** In normal operation, they are always in sync. Manual import/export is a safety net, not a regular operation.
- [ ] Import (JSON → SQLite): newer wins by `updated_at` timestamp. Never overwrites newer SQLite data with older JSON data.
- [ ] **Conflict detection on import:** If SQLite has a memory with `updated_at` NEWER than the incoming JSON file (meaning local edits exist that haven't been committed to git), warn the user: "Local edits to memory <uuid> would be overwritten by incoming version. Keep local (l) or accept incoming (i)?" In non-interactive mode (post-checkout hook), keep the newer version and log a warning.
- [ ] Export (SQLite → JSON): only creates MISSING JSON files. Never overwrites existing JSON files.
- [ ] No scenario where import destroys data without warning.
- [ ] No scenario where export destroys data — it only fills gaps.
- [ ] Concurrent operations: file-per-memory means different UUIDs = different files = no write conflicts.

**Edge cases:**
- First checkout (no SQLite cache): full rebuild from all files
- Merge conflict in a memory JSON file: git handles it (UUID filenames make conflicts extremely unlikely)
- Hook not installed (user didn't run `aide-memory init`): no-op, user is just using git normally
- User manually edits a JSON file: next import picks up the change (file's `updated_at` should be updated by user)

### P1.11 — Config System

**Done looks like:** `.aide/config.json` controls all customizable behavior.

- [ ] Default config created during `aide init`:
  ```json
  {
    "version": 1,
    "capture": {
      "enabled": true,
      "hooks": {
        "preToolUse": true,
        "stop": true,
        "userPromptSubmit": true
      }
    },
    "nudge": {
      "visible": false
    },
    "tags": {
      "presets": ["architecture", "testing", "security", "style", "integration", "config", "migration", "performance", "api-contract"]
    },
    "telemetry": {
      "enabled": true
    },
    "contributor": "auto"
  }
  ```
- [ ] `aide config <key>` prints current value
- [ ] `aide config <key> <value>` sets value (dot notation: `aide config capture.enabled false`)
- [ ] `aide config tags.add <tag>` adds custom tag to presets
- [ ] `aide config tags.remove <tag>` removes tag from presets
- [ ] `aide config --list` prints all current config
- [ ] `aide config --reset` restores defaults
- [ ] Config file is JSON (not YAML, not TOML) for simplicity and tooling
- [ ] Invalid config values rejected with helpful error message
- [ ] Config changes take effect immediately (no restart needed — hooks re-read config on each invocation)

**Edge cases:**
- Missing config file: use defaults, create file on first `aide config set`
- Corrupted config file: log warning, use defaults, offer to reset
- Unknown config key: error "Unknown config key: X. Run aide config --list to see available options."

### P1.12 — Analytics & Telemetry

**Done looks like:** Local analytics power `aide stats`. Anonymous telemetry helps us make go/no-go decisions.

- [ ] Local `analytics` table in SQLite cache:
  ```sql
  CREATE TABLE analytics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event TEXT NOT NULL,
    value TEXT,
    tool TEXT,
    timestamp TEXT NOT NULL
  );
  ```
- [ ] Events logged locally (always, regardless of telemetry setting):
  - `memory_stored` (layer, source, tool)
  - `memory_recalled` (count, path, tool)
  - `memory_updated` (uuid, tool)
  - `memory_deleted` (uuid, tool)
  - `hook_triggered` (hook_name, tool)
  - `search_performed` (method: fts5/semantic/like, result_count)
  - `init_completed` (tool_count, scan_used)
- [ ] Anonymous telemetry (when enabled):
  - Sends: event type, memory count by layer, tool used, error types
  - Never sends: memory content, file paths, scope patterns, embedding vectors
  - Transport: HTTPS POST to telemetry endpoint
  - Opt-out: `aide config telemetry off`
  - On first run, inform user: "AIDE Memory collects anonymous usage data to improve the product. Run `aide config telemetry off` to disable."
- [ ] Telemetry endpoint spec defined (URL, payload format, auth)

**Edge cases:**
- Telemetry endpoint unreachable: silently skip, never block operations
- Analytics table grows very large (10K+ rows): prune events older than 90 days on startup

### P1.13 — aide stats

- [ ] `aide stats` output includes:
  ```
  AIDE Memory Stats
  ─────────────────
  Memories: 47 total (12 area_context, 15 technical, 8 preferences, 12 guidelines)
  Status: 45 active, 2 deleted
  
  Recall: 234 total recalls, 18 unique memories recalled
  Most recalled: "Use datetime() for SQLite dates" (recalled 23x) [technical]
  
  Capture sources:
    conversation: 28 (60%)
    hook: 15 (32%)
    import: 4 (8%)
  
  Hooks triggered: 156 total
    PreToolUse: 120 (77%)
    Stop: 24 (15%)
    UserPromptSubmit: 12 (8%)
  
  Stale candidates: 5 memories with 0 recalls after 30+ days
  ```
- [ ] `aide stats --json` outputs machine-readable JSON
- [ ] Stats computed from SQLite cache (fast, no file scanning)
- [ ] Works with empty store: "No memories stored yet."

### P1.14 — aide-memory init

**Done looks like:** `npm install -g aide-memory && aide-memory init` takes a project from zero to fully configured in under 2 minutes.

- [ ] Creates `.aide/` directory structure (memories, config, cache)
- [ ] Creates `.aide/memories/<layer>/` directories (preferences/personal, preferences/shared, technical, area_context, guidelines)
- [ ] Writes **separate** rules files for ALL supported tools (never touches existing CLAUDE.md or .cursorrules):
  - `.claude/rules/aide-memory.md` — tells Claude Code how to use aide-memory
  - `.cursor/rules/aide-memory.mdc` — tells Cursor how to use aide-memory
  - Does NOT modify existing CLAUDE.md, .cursorrules, copilot-instructions.md, etc.
  - Rules files explain: when to call aide_recall, when to aide_remember, how to assign layers/tags
- [ ] **Auto-configures MCP server in tool allowlists:**
  - Claude Code: adds aide-memory to `.claude/settings.json` mcpServers + allowed tools
  - Cursor: adds aide-memory to `.cursor/mcp.json`
  - User doesn't need to manually configure MCP — it's ready to use immediately
- [ ] Sets up hooks:
  - Claude Code: configures in `.claude/settings.json` hooks section
  - Cursor: configures in `.cursor/hooks.json` (if supported)
- [ ] Creates `.aide/config.json` with defaults
- [ ] Downloads embedding model (with progress bar)
- [ ] Updates `.gitignore`:
  - Adds `.aide/memories/preferences/personal/`
  - Adds `.aide/cache/` (SQLite cache files)
- [ ] Installs post-checkout git hook (non-destructive: appends to existing hook if present)
- [ ] Detects `git config user.name` for default contributor
- [ ] Prints summary: what was created, next steps
- [ ] Idempotent: running twice doesn't duplicate or overwrite (checks for existing files)
- [ ] Completes in < 2 minutes (most time is model download)
- [ ] `aide-memory init --update-rules`: refreshes rules files only, without touching config, memories, or hooks. For when aide-memory ships updated/improved rules in a new version.

**Design note — tool onboarding framework:** All rules files, hook configs, and MCP configs are generated from templates in `src/templates/`. Adding support for a new tool = adding a new template set (file paths, formatting conventions, hook event names). Same memory data, different output format per tool. Target: one-day effort per new tool.

**Edge cases:**
- Already initialized: "AIDE Memory is already initialized in this project. Use --force to re-initialize."
- Not a git repo: warn "Not a git repo — team sync features won't work. Continue anyway? (y/n)"
- No write permission to project root: error with clear message
- Rules file already exists (from previous init): update it (replace contents), don't create duplicate
- Network unavailable (can't download model): init succeeds without embeddings, log warning "Embedding model not downloaded — semantic search disabled. Run `aide-memory init --download-model` later."

### ~~P1.15 — Pre-train Scan~~ (REMOVED Apr 2026)

Removed because output was too surface-level — `package.json` + top-level directory inference only. Testing on a realistic Express app produced 4 memories, one of which was wrong (called a TS project "CommonJS modules"). See `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` → "Deferred: Auto-scan for Codebase Pattern Discovery" for the Phase 2 revisit criteria (real tree-sitter-backed code-pattern analysis). Until then, `aide_import` against existing CLAUDE.md / README / design docs is the recommended onboarding path.

### P1.16 — npm Package

- [ ] Package name: `aide-memory`
- [ ] `package.json` fields: name, version (0.1.0), description, bin (aide), main, files, engines (>=18), keywords, license (proprietary)
- [ ] `bin` entry: `"aide": "./dist/cli/aide-memory.js"` 
- [ ] Build: `tsc` → `dist/`, then bundle/minify for distribution
- [ ] `npm install -g aide-memory && aide-memory init` works (package has `postinstall` or `bin` that handles init flow)
- [ ] Exclude from package: test files, source maps, old aide-v0 code, docs, .aide/
- [ ] Dependencies cleaned: only include what aide-memory needs (better-sqlite3, commander, @modelcontextprotocol/sdk, zod, uuid)
- [ ] Remove old dependencies not needed: axios, express, chokidar, marked, ts-morph, web-tree-sitter, ws
- [ ] `npm pack --dry-run` shows only necessary files
- [ ] Package size: < 5MB (excluding embedding model, which downloads separately)
- [ ] README in package: quick start, feature list, links to docs

### P1.17 — Pre-ship Validation

**Done looks like:** Documented evidence that recall measurably improves agent output.

- [ ] 5 test scenarios run across Claude Code + Cursor (minimum). **Critical: these must be realistic general coding tasks. The agent should NOT know it's being tested for memory recall. No prompts like "remember that thing I said."**
  1. **Style continuity:** Session 1: work on a feature, correct the agent's style 3 times (line length, naming, component structure). Session 2: ask agent to build a similar feature in a different area. Score: does it follow the corrected patterns without being told? (With vs without AIDE Memory)
  2. **Planning persistence:** Session 1: plan a multi-file refactor with specific steps and constraints. Session 2: say "continue the refactor." Score: does it know the plan or start from scratch? (With vs without)
  3. **Technical knowledge:** Session 1: agent discovers a non-obvious codebase convention during work (e.g., a custom date format, a specific test pattern). Session 2: give a general task in the same area. Score: does it follow the convention? (With vs without)
  4. **Proactive discovery:** Pre-seed area context for a code area. Give the agent a general task in that area ("add pagination to the data table"). Score: does it respect the existing architectural decisions it was told about, or does it violate them? (With vs without)
  5. **New contributor sim:** Populated memory store vs empty. Ask agent to "fix the flaky test in src/auth/". Score: does the agent with memories approach it with relevant context, or does it explore blindly like the bare agent?
- [ ] **Also verify: within-session value.** Start a fresh session, work for 30+ minutes, then start a second session. Does AIDE Memory capture and recall useful context from the first session?
- [ ] Each scenario scored on a rubric:
  - Did the agent recall relevant context? (yes/no)
  - Did the agent's output reflect the recalled context? (yes/partial/no)
  - Was there a measurable quality difference vs bare agent? (yes/no)
- [ ] Results documented in per-scenario Runs tables at `docs/validation/E2E_VALIDATION.md`
- [ ] Decision criteria: if AIDE Memory setups score at or below bare setups, core value prop is NOT working — do not ship
- [ ] Rules file validation: verify model reads rules and calls aide_recall appropriately in both Claude Code and Cursor

### P0.6 — User Documentation

- [ ] Quick start guide: install → first recall in under 2 minutes
- [ ] CLI command reference: every command with flags, examples, expected output
- [ ] MCP tool reference: every tool with parameters, examples, expected response
- [ ] Configuration guide: all config keys, defaults, examples
- [ ] Troubleshooting guide: common issues and solutions
- [ ] Architecture overview (for contributors): how storage, recall, hooks work together
- [ ] All docs hosted on public GitHub repo (`aide-memory/docs/`) and linked from landing page
- [ ] Docs cover the full CLI ↔ MCP parity table (what to use when)

### P1.18 — Plugin/Marketplace Distribution

- [ ] Claude Code: plugin listing submitted to marketplace (README, install command, feature description)
- [ ] Cursor: extension/adapter listing if Cursor marketplace supports MCP tool listings
- [ ] Both listings point to `npm install -g aide-memory && aide-memory init` as install command
- [ ] Listings include feature screenshots/descriptions from demo assets (P1.19)

### P1.19 — Demo & Marketing Assets

- [ ] Individual feature demo snippets (30-60 seconds each, screen recording or GIF):
  - Init experience (`aide-memory init` → ready in 2 min)
  - Auto-capture via hooks (correction detected → memory stored silently)
  - Nudge + recall (PreToolUse fires → agent recalls → uses context)
  - Cross-session persistence (session 1 teaches → session 2 remembers)
  - Search (FTS5 keyword search finding relevant memories)
  - ~~Pre-train scan (init --scan populates structural memories)~~ (removed Apr 2026 — see P1.15)
- [ ] Full-flow demo (3-5 minutes): init → work on a feature → correction captured → new session → context recalled → better output
- [ ] All demos show realistic coding tasks, not contrived "remember X" scenarios
- [ ] Assets usable in: landing page, README, blog posts, HN launch, social media

### P1.20 — Update Mechanism

- [ ] Version check on CLI startup: compare installed vs latest npm version (at most once per day, cached)
- [ ] One-line non-blocking suggestion: "aide-memory vX.Y.Z available. Run `npm update -g aide-memory`."
- [ ] Disable via `aide-memory config updates.check false`
- [ ] `aide-memory init --update-rules`: refreshes rules files from latest templates, preserves config/memories
- [ ] Rules files include version comment (`<!-- aide-memory rules v0.1.0 -->`), only updated if installed version is newer
- [ ] Schema migration: if JSON file format changes between versions, handle automatically on startup (check version in `.aide/config.json`)

### P1.21 — User Documentation (Detailed)

- [ ] Full CLI reference page:
  | Command | Description | Example |
  |---------|-------------|---------|
  | `aide-memory init` | Set up project | `aide-memory init` |
  | `aide-memory recall` | Get context for a path | `aide-memory recall src/auth/` |
  | `aide-memory remember` | Store knowledge | `aide-memory remember "Use datetime()" --layer technical` |
  | `aide-memory update` | Edit a memory | `aide-memory update <uuid> --tags security` |
  | `aide-memory forget` | Delete a memory | `aide-memory forget <uuid>` |
  | `aide-memory search` | Find memories | `aide-memory search "authentication"` |
  | `aide-memory list` | List all memories | `aide-memory list --layer guidelines` |
  | `aide-memory stats` | View analytics | `aide-memory stats --json` |
  | `aide-memory config` | Manage settings | `aide-memory config nudge.visible false` |
  | `aide-memory sync import` | Rebuild cache | `aide-memory sync import` |
  | `aide-memory sync export` | Ensure JSON files | `aide-memory sync export` |
  | `aide-memory migrate` | Migrate legacy DB | `aide-memory migrate` |
- [ ] MCP tool reference with parameter docs and example responses
- [ ] "How it works" page explaining the nudge flow, hook behavior, and storage architecture

---

## 4. Testing Plan — Unit Tests

### Coverage Targets

| Module | Current tests | Target tests | Target coverage |
|--------|-------------|-------------|-----------------|
| store.ts (new: file-store.ts) | 20 | 35-40 | 90%+ lines |
| recall.ts | 18 | 22-25 | 90%+ lines |
| server.ts | 9 | 15-18 | 85%+ lines |
| types.ts | 0 | 2-3 | Type assertion tests |
| fts5.ts (new) | 0 | 8-10 | 90%+ |
| embeddings.ts (new) | 0 | 6-8 | 80%+ |
| config.ts (new) | 0 | 8-10 | 90%+ |
| analytics.ts (new) | 0 | 5-7 | 85%+ |
| init.ts (new) | 0 | 8-10 | 80%+ |
| scan.ts (new) | 0 | 5-7 | 80%+ |
| cli/*.ts (new) | 0 | 10-15 | 75%+ |
| **Total** | **47** | **~110-140** | **85%+ overall** |

### Test Strategy

**What to mock:**
- Filesystem operations in store tests: use temp directories (already done in existing tests)
- Embedding model in embedding tests: mock the model, test the pipeline
- Git operations in post-checkout tests: mock git commands
- Network in telemetry tests: mock HTTP transport
- System time in analytics tests: mock Date.now()

**What to test directly (no mocks):**
- SQLite operations: use in-memory or temp-file databases (existing pattern)
- JSON file I/O: use temp directories
- FTS5 queries: real SQLite with FTS5 extension
- Recall logic: real store with test data
- Config parsing: real JSON files in temp dirs

### Key Test Cases Per Module

#### P1.1 — Storage (file-store.test.ts)

**Happy path:**
- `add()` creates JSON file in correct layer directory with valid UUID filename
- `add()` inserts row into SQLite cache
- `get(uuid)` returns memory from cache
- `update(uuid, changes)` modifies JSON file and cache
- `remove(uuid)` deletes JSON file and cache row
- `list()` returns memories from cache, sorted by created_at DESC
- Cache rebuild from files: delete SQLite, call rebuild(), verify all memories restored
- Hash-based cache check: no rebuild when directory unchanged
- Hash-based cache check: rebuild triggered when file added/removed/modified

**Edge cases:**
- `add()` with all optional fields null
- `add()` with very long `what` field (10K chars)
- `get()` with nonexistent UUID returns null
- `update()` with nonexistent UUID returns null
- `remove()` with nonexistent UUID returns false
- `list()` on empty store returns []
- `list()` with all filter options combined
- Malformed JSON file skipped during rebuild (other files still imported)
- File with missing required fields skipped during rebuild
- Concurrent add() calls produce unique UUIDs and unique files
- `add()` sets `updated_at` equal to `created_at`
- `update()` sets `updated_at` to current time, preserves `created_at`
- Atomic write: process killed mid-write doesn't leave partial JSON (temp file + rename)
- Preferences personal/ memories get `shared: false`
- Other layer memories get `shared: true` by default

#### P1.2 — Types (types.test.ts)

- Type guard: `isValidMemoryLayer()` accepts valid layers, rejects invalid
- Type guard: `isValidMemoryStatus()` accepts 'active'|'deleted', rejects 'completed'|'archived'
- UUID validation: `isValidUUID()` accepts valid UUIDv4, rejects garbage

#### P1.3 — FTS5 (fts5.test.ts)

**Happy path:**
- Single-word search returns matching memories
- Multi-word search returns BM25-ranked results
- Search with layer filter returns only that layer
- Search with status filter defaults to 'active'
- FTS5 index updated on insert
- FTS5 index updated on update (content change)
- FTS5 index updated on delete

**Edge cases:**
- Empty query returns empty results
- Query with FTS5 special characters (quotes, asterisks) escaped properly
- Very long query (>500 chars) truncated
- No matches returns empty results (not error)
- Search across 2,000 memories completes in < 50ms
- Rebuild: FTS5 index rebuilt correctly from memories table

#### P1.4 — Embeddings (embeddings.test.ts)

**Happy path (with mocked model):**
- `generateEmbedding(text)` returns vector of correct dimensions
- `storeEmbedding(uuid, vector)` persists to embeddings table
- `semanticSearch(query, limit)` returns top-N by cosine similarity
- Embedding generated on add()
- Embedding updated on update() if `what` changed
- Embedding deleted on remove()

**Edge cases:**
- Model not downloaded: `semanticSearch()` returns empty with info log
- Text too short (< 10 chars): skip embedding, store null
- sqlite-vec not available: graceful degradation, functions return empty

#### P1.5 — Hooks (hooks.test.ts)

**Note:** Hook scripts are bash — test via shell execution in temp directories.

- PreToolUse hook returns JSON with additionalContext containing memory count nudge
- PreToolUse hook returns nothing when no memories match the path
- PreToolUse hook exits 0 when SQLite cache doesn't exist
- Stop hook blocks first stop with reflection prompt
- Stop hook allows second stop (stop_hook_active = true)
- UserPromptSubmit detects correction patterns (test each regex group)
- UserPromptSubmit exits silently for non-correction messages
- All hooks exit 0 on any error (never break agent)
- recall-for-path.js converts absolute path to relative for scope matching

#### P1.6 — aide_update (server.test.ts additions)

- aide_update with valid UUID updates memory and returns confirmation
- aide_update with nonexistent UUID returns "not found"
- aide_update with no change fields returns unchanged memory
- aide_update sets updated_at to current time
- aide_update does not change created_at
- Multiple fields updated in single call

#### P1.7 — CLI (cli.test.ts)

- `aide recall src/memory/` outputs formatted memories
- `aide remember "test" --layer technical` stores memory
- `aide search "authentication"` returns matching memories
- `aide list` displays all active memories
- `aide list --layer guidelines` filters by layer
- `aide stats` displays analytics summary
- `aide config capture.enabled` prints current value
- `aide config capture.enabled false` updates config
- All commands exit 1 with error when .aide/ not initialized

#### P1.11 — Config (config.test.ts)

- Load default config when no file exists
- Load config from .aide/config.json
- Set nested value via dot notation
- Get nested value via dot notation
- Add tag to presets
- Remove tag from presets
- Reset to defaults
- Invalid key rejected with error
- Invalid value type rejected with error
- Config survives malformed JSON (resets to defaults with warning)

#### P1.12 — Analytics (analytics.test.ts)

- Log event writes to analytics table
- Query events by type
- Query events by time range
- Count events by type
- Prune events older than 90 days
- Telemetry payload contains only allowed fields (no content, no paths)

#### P1.15 — Scan (scan.test.ts)

- Detect Node.js project from package.json
- Detect Python project from pyproject.toml
- Detect React from package.json dependencies
- Detect test framework from config files
- Generate appropriate memories with correct layers and scopes
- Skip scan when no recognizable project files
- Monorepo detection from workspaces config

---

## 5. Testing Plan — Integration Tests

### E2E Flows

#### Flow 1: Capture → Store → Recall Loop

**Goal:** Verify that memories survive the full lifecycle: creation → JSON file → SQLite cache → recall → cache rebuild → recall again. Proves the JSON-as-source-of-truth architecture works.

**Setup:** Fresh `.aide/` directory, populated with 5 test memories via aide_remember.

**Test steps:**
1. Store 5 memories via MCP tool (aide_remember) with different layers and scopes
2. Verify JSON files created in correct directories
3. Verify SQLite cache matches JSON files
4. Delete SQLite cache
5. Trigger cache rebuild
6. Verify all 5 memories recoverable via aide_recall
7. Verify recall order matches layer priority (area_context → technical → preferences → guidelines)
8. Verify recalled_count incremented in SQLite (not in JSON files)

**Pass criteria:** All memories survive cache deletion and rebuild. Recall order correct. Count tracking works.

#### Flow 2: Hook → MCP Tool → SQLite → Response

**Goal:** Verify the full hook-driven recall loop: PreToolUse nudges (count only, no content), agent calls aide_recall, gets memories, Stop hook prompts storage. Proves hooks never dump content and the nudge-then-query pattern works end-to-end.

**Setup:** Fresh `.aide/` with 3 memories scoped to `src/components/**`.

**Test steps:**
1. Simulate PreToolUse hook input for `src/components/Button.tsx`
2. Verify hook outputs additionalContext with nudge (count only, not full memories)
3. Call aide_recall via MCP with path `src/components/Button.tsx`
4. Verify response contains the 3 scoped memories
5. Simulate Stop hook input
6. Verify hook outputs block decision with reflection prompt
7. Call aide_remember via MCP to store a new memory
8. Verify JSON file created and SQLite updated
9. Simulate PreToolUse again for same path
10. Verify nudge count incremented to 4

**Pass criteria:** Full hook → MCP → store → hook loop works. Nudge reflects latest memory count.

#### Flow 3: FTS5 + Semantic Search Fallback

**Goal:** Verify the system-decides search strategy: FTS5 handles keyword matches, semantic search supplements when FTS5 returns few results. Proves the model doesn't need to choose the search method.

**Setup:** Store 20 memories with varied content.

**Test steps:**
1. Search via FTS5 for a keyword present in 5 memories
2. Verify 5 results returned, BM25 ranked
3. Search for a conceptual query not matching any keywords literally
4. Verify semantic search fallback triggers (if model available)
5. Verify combined results: FTS5 first, then semantic supplement

**Pass criteria:** FTS5 returns keyword matches ranked by relevance. Semantic fallback supplements when FTS5 has few results.

#### Flow 4: Post-checkout Sync + Manual Import/Export

**Goal:** Verify that git-based sync works automatically AND manually. Proves add/update/delete sync correctly, and `aide-memory sync import/export` commands work as documented.

**Setup:** Two temp directories simulating two developers.

**Test steps:**
1. Dev A: store 3 memories, commit JSON files to git
2. Dev B: clone/pull, verify post-checkout hook triggers
3. Dev B: verify 3 memories imported into their SQLite cache
4. Dev A: update memory 1, commit
5. Dev B: pull, verify memory 1 updated (newer timestamp wins)
6. Dev A: delete memory 2 (remove file), commit
7. Dev B: pull, verify memory 2 removed from their cache

**Pass criteria:** Add, update, and delete sync correctly via git + post-checkout hook.

#### Flow 5: Init → First Session → Recall

**Goal:** Verify the complete first-time user experience: init creates everything, MCP is auto-configured, first file read triggers nudge. Proves zero-config install works end-to-end.

**Setup:** An existing Node.js project with package.json, src/ directory, existing CLAUDE.md.

**Test steps:**
1. Run `aide init`
2. Verify .aide/ directory structure created
3. Verify rules files written for all tools
4. Verify config.json created with defaults
5. Verify .gitignore updated
6. Verify post-checkout hook installed
7. Run `aide_import` against existing CLAUDE.md to seed initial memories
8. Simulate a PreToolUse hook call for a file in the project
9. Verify nudge includes imported memories
10. Verify existing CLAUDE.md was NOT modified (only rules files in .claude/rules/ created)

**Pass criteria:** Full init → import → recall flow works in under 2 minutes.

#### Flow 6: Within-Session and Cross-Session Value

**Goal:** Prove that AIDE Memory provides value both WITHIN a single session (memories captured early are recalled later) and ACROSS sessions (memories from session 1 improve session 2). This is the core value proposition test.

**Setup:** A real project with existing code.

**Test steps — within session:**
1. Start fresh session with AIDE Memory initialized
2. Work on feature A in `src/feature-a/` — agent discovers a constraint and stores it
3. Later in same session, work on feature B in `src/feature-b/` that touches shared code
4. Verify: agent is nudged about the constraint from step 2 when it reads shared code
5. Verify: agent's output respects the constraint without being explicitly reminded

**Test steps — across sessions:**
1. Session 1: work on a task, make 3 corrections to agent behavior, teach a convention
2. End session 1
3. Session 2: give a related task in the same code area
4. Verify: agent recalls corrections and convention WITHOUT being told about them
5. Score: compare session 2 output quality with vs without AIDE Memory

**Pass criteria:** Within-session: at least 1 captured memory is recalled and used within the same session. Cross-session: agent in session 2 demonstrably uses knowledge from session 1.

---

### Cross-Component Integration Points

| Integration | Components | What to verify |
|-------------|-----------|----------------|
| Hook → Store | P1.5 + P1.1 | Hooks read from new SQLite cache path, handle missing cache |
| Store → FTS5 | P1.1 + P1.3 | FTS5 index stays in sync on add/update/delete |
| Store → Embeddings | P1.1 + P1.4 | Embeddings generated on add, deleted on remove |
| Config → Hooks | P1.11 + P1.5 | Hook behavior changes when config changes (e.g., nudge disabled) |
| Config → Telemetry | P1.11 + P1.12 | Telemetry stops when config set to off |
| Init → Everything | P1.14 + all | Init creates correct state for all components |
| CLI → Store | P1.7 + P1.1 | CLI commands produce same results as MCP tools |
| Post-checkout → Store | P1.10 + P1.1 | Hook imports trigger correct cache updates |

### Multi-Tool Testing (Claude Code + Cursor minimum)

| Scenario | Claude Code | Cursor | What to verify |
|----------|------------|--------|---------------|
| Same memory store | aide_recall via MCP | aide_recall via MCP | Both tools return same memories for same path |
| Cross-tool capture | Store memory in CC session | Recall in Cursor session | Memory persists across tools |
| Rules file behavior | .claude/rules/aide-memory.md | .cursor/rules/aide-memory.mdc | Both models call aide_recall on file reads |
| Hook behavior | PreToolUse nudge works | PreToolUse nudge works (if hooks supported) | Nudge format matches tool expectations |

### Pre-ship Validation: Proving Recall Improves Output

This is the most critical test. If this fails, do not ship.

**Methodology:**

For each of the 5 scenarios (style continuity, planning persistence, technical knowledge, proactive discovery, new contributor sim):

1. **Control group (bare agent):** Fresh session, no AIDE Memory installed. Perform the task.
2. **Treatment group (AIDE Memory):** Same task, AIDE Memory installed with relevant memories pre-populated.
3. **Score both** on a rubric (see P1.17 AC above).
4. **Document differences** with concrete examples.

**Minimum success criteria:**
- Treatment group scores higher on 4/5 scenarios
- At least 2 scenarios show clear, unambiguous improvement
- No scenario where AIDE Memory makes output worse

---

## 6. Agent Strategy

### Parallel Agent Opportunities

The following components can be built by separate agents working in parallel, because they modify different files with minimal overlap:

#### Parallel Group A — Sprint 1

| Agent | Component | Files touched | Context needed |
|-------|-----------|-------------|----------------|
| Agent 1 | P1.1 + P1.2 Storage Migration | `src/memory/store.ts`, `src/memory/types.ts`, new `src/memory/file-store.ts`, all test files | Full architecture knowledge. This is the primary agent. |
| Agent 2 | P1.3 FTS5 | New `src/memory/fts5.ts`, `src/memory/fts5.test.ts` | Store interface only (adds FTS5 table to existing SQLite) |
| Agent 3 | P1.8 Rules Files | `src/templates/rules/*.md`, `src/templates/rules/*.mdc` | PRODUCT_VISION.md capabilities section, existing rules file |

#### Parallel Group B — Sprint 2

| Agent | Component | Files touched | Context needed |
|-------|-----------|-------------|----------------|
| Agent 4 | P1.5 Hook Refactoring | `scripts/hooks/*.sh`, `scripts/hooks/recall-for-path.js` | New store API, nudge format spec |
| Agent 5 | P1.6 aide_update Tool | `src/memory/server.ts` | New store API, existing MCP tool patterns |
| Agent 6 | P1.11 Config System | New `src/memory/config.ts`, `src/memory/config.test.ts` | Config schema from AC |
| Agent 7 | P1.7 CLI (first pass) | New `src/cli/aide-memory.ts`, `src/cli/commands/*.ts` | Store API, config API |

#### Parallel Group C — Sprint 3

| Agent | Component | Files touched | Context needed |
|-------|-----------|-------------|----------------|
| Agent 8 | P1.4 Embedding Pipeline | New `src/memory/embeddings.ts` | Store interface, sqlite-vec docs |
| Agent 9 | P1.10 Post-checkout Hook | New `scripts/hooks/post-checkout.sh`, `src/memory/sync.ts` | File store format, JSON schema |
| Agent 10 | P1.12 Analytics | New `src/memory/analytics.ts` | Store interface, config API |

### Sequential Components (cannot parallelize)

| Component | Why sequential | Depends on |
|-----------|---------------|------------|
| P1.14 Init | Orchestrates all other components | Everything in Sprint 1-3 |
| P1.15 Pre-train Scan | Needs init command | P1.14 |
| P1.16 npm Package | Needs all code finalized | Everything |
| P1.17 Validation | Needs everything working end-to-end | Everything |

### Context Each Agent Needs

**Every agent needs:**
- `docs/PRODUCT_VISION.md` (relevant sections only, not all 1,653 lines)
- `src/memory/types.ts` (updated types)
- This spec document (their component's AC and test plan)

**Agent 1 (Storage) additionally needs:**
- Full existing `src/memory/store.ts`, `recall.ts`, `server.ts`
- All existing test files
- Understanding of JSON file format and SQLite cache architecture

**Agent 2 (FTS5) additionally needs:**
- SQLite FTS5 documentation
- Current `store.search()` implementation

**Agent 4 (Hooks) additionally needs:**
- All existing hook scripts
- Claude Code hooks documentation
- Cursor hooks documentation (if available)

### Merging Parallel Work

- Each agent works on a dedicated feature branch (see Section 7)
- Agents modifying the SAME file (e.g., two agents both touching server.ts) must be sequenced, not parallelized
- After each parallel group completes, merge all branches to `feature/phase-1` and run full test suite
- Merge conflicts should be rare because agents touch different files
- If conflicts occur: the agent working on the "foundation" component (storage > hooks > tools) takes precedence

---

## 7. Branching & Commit Strategy

### Branch Structure

```
main
 └── feature/phase-1                     ← integration branch for all Phase 1 work
      ├── feature/phase-1/storage        ← P1.1 + P1.2 (storage migration + types)
      ├── feature/phase-1/fts5           ← P1.3 (FTS5 search)
      ├── feature/phase-1/embeddings     ← P1.4 (embedding pipeline)
      ├── feature/phase-1/hooks          ← P1.5 (hook refactoring)
      ├── feature/phase-1/update-tool    ← P1.6 (aide_update MCP tool)
      ├── feature/phase-1/cli            ← P1.7 (CLI framework)
      ├── feature/phase-1/rules          ← P1.8 + P1.9 (rules files + Cursor)
      ├── feature/phase-1/sync           ← P1.10 (post-checkout hook)
      ├── feature/phase-1/config         ← P1.11 (config system)
      ├── feature/phase-1/analytics      ← P1.12 + P1.13 (analytics + stats)
      ├── feature/phase-1/init           ← P1.14 + P1.15 (init + scan)
      └── feature/phase-1/package        ← P1.16 (npm package)
```

### Commit Conventions

**Format:** Conventional Commits with scope prefix.

```
<type>(<scope>): <description>

Types: feat, fix, refactor, test, docs, chore
Scopes: storage, fts5, embeddings, hooks, mcp, cli, rules, sync, config, analytics, init, package
```

**Examples:**
```
feat(storage): implement file-per-memory JSON storage
feat(storage): add hash-based cache rebuild
test(storage): add cache rebuild edge case tests
feat(fts5): add FTS5 virtual table and BM25 search
refactor(hooks): change PreToolUse from dump to nudge mode
feat(mcp): add aide_update tool
feat(cli): add aide init command with rules file generation
fix(storage): handle malformed JSON during rebuild
chore(package): clean dependencies for aide-memory
```

### Merge Strategy

1. **Feature branch → `feature/phase-1`:** Squash merge (clean history on integration branch). Run full test suite before merge.
2. **`feature/phase-1` → `main`:** Regular merge (preserves integration history). Only when phase is complete and validated.
3. **Merge order within a sprint:** Foundation components first (storage before hooks, types before everything).

### When to Merge

- **Feature → phase-1:** When the feature's tests pass AND integration tests with existing code pass.
- **phase-1 → main:** After P1.17 (pre-ship validation) passes. This is the "Phase 1 is done" merge.

### How to Handle Existing Code Migration

The existing `src/memory/store.ts` is the foundation. The migration approach:

1. Create new `src/memory/file-store.ts` implementing the file-per-memory architecture
2. `file-store.ts` wraps the SQLite cache (still uses `better-sqlite3` internally)
3. Update `src/memory/store.ts` to be a thin interface that delegates to `file-store.ts`
4. OR: refactor `store.ts` in place (simpler, but riskier for parallel work)
5. **Recommendation:** Refactor in place on the `feature/phase-1/storage` branch. The interface stays the same (`add`, `get`, `list`, `update`, `remove`, `search`), the implementation changes internally.

---

## 8. Migration Plan

### Context

The existing codebase uses a single SQLite database at `~/.aide/projects/<hash>/memory.db`. Phase 1 moves to one-file-per-memory with SQLite as cached index. There are no external users — only internal testing data (133 aide-memory memories stored for this project).

### Decision: Clean Break

**Rationale:** No external users exist. The product hasn't shipped. A clean break is simpler than backward compatibility.

### Existing Test Migration

**What changes:**
- `Memory.id` is no longer the primary identifier — `Memory.uuid` is
- `MemoryStatus` loses 'completed' and 'archived', keeps 'active' and 'deleted'
- `MemorySource` adds 'hook'
- `contributor` becomes required (not null)
- `tags: string[]` added (default: [])
- `shared: boolean` added
- `updated_at: string` added

**Migration steps for test files:**

1. **store.test.ts (20 tests):**
   - Update `CreateMemory` calls: add contributor (use test default like "test-user")
   - Change assertions from `memory.id` to `memory.uuid` where checking identity
   - Update status assertions: 'archived' → 'deleted'
   - Add assertions for new fields: tags, shared, updated_at
   - Add test for JSON file creation (verify file exists after add())
   - Update cleanup: delete temp `.aide/memories/` directories
   - **Estimate:** ~15 of 20 tests need minor updates, 5 need moderate rewrites

2. **recall.test.ts (varies):**
   - Minimal changes — recall logic is the same, just working with updated types
   - Update test data setup to include new required fields
   - **Estimate:** Minor updates only

3. **scopes.test.ts (varies):**
   - No changes — scope matching logic is unchanged
   - Test data setup needs new required fields
   - **Estimate:** Trivial updates

4. **server.test.ts (9 tests):**
   - Update MCP tool assertions for new fields
   - Add tests for aide_update tool
   - Update aide_forget: 'archive' mode → 'delete' mode (no more archive)
   - **Estimate:** 5-6 tests need updates, 3-4 new tests added

5. **e2e-comparison.test.ts:**
   - Update to use new store API
   - May need restructuring depending on test approach

6. **mcp-smoke.test.ts:**
   - Update for new fields in MCP responses

### Schema Migration

**Old schema (memory.db):**
```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  layer TEXT NOT NULL,
  what TEXT NOT NULL,
  why TEXT,
  scope TEXT,
  context_label TEXT,
  contributor TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'conversation',
  derived_from TEXT,
  created_at TEXT NOT NULL,
  recalled_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TEXT
);
```

**New schema (SQLite cache — not source of truth):**
```sql
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  layer TEXT NOT NULL,
  what TEXT NOT NULL,
  why TEXT,
  scope TEXT,
  context_label TEXT,
  contributor TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',  -- JSON array
  source TEXT NOT NULL DEFAULT 'conversation',
  shared INTEGER NOT NULL DEFAULT 1,  -- boolean
  derived_from TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  recalled_count INTEGER NOT NULL DEFAULT 0,
  last_recalled_at TEXT
);
-- No status column. File exists = in cache. File deleted = removed from cache.

CREATE UNIQUE INDEX idx_memories_uuid ON memories(uuid);
CREATE INDEX idx_memories_scope ON memories(scope);
CREATE INDEX idx_memories_layer ON memories(layer);
CREATE INDEX idx_memories_status ON memories(status);
CREATE INDEX idx_memories_contributor ON memories(contributor);

-- FTS5 index
CREATE VIRTUAL TABLE memories_fts USING fts5(
  what, why, context_label,
  content=memories, content_rowid=id
);

-- FTS5 sync triggers
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, what, why, context_label)
  VALUES (new.id, new.what, new.why, new.context_label);
END;

CREATE TRIGGER memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, what, why, context_label)
  VALUES ('delete', old.id, old.what, old.why, old.context_label);
END;

CREATE TRIGGER memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, what, why, context_label)
  VALUES ('delete', old.id, old.what, old.why, old.context_label);
  INSERT INTO memories_fts(rowid, what, why, context_label)
  VALUES (new.id, new.what, new.why, new.context_label);
END;

-- Embeddings table (sqlite-vec)
CREATE VIRTUAL TABLE memory_embeddings USING vec0(
  uuid TEXT PRIMARY KEY,
  embedding float[384]  -- dimension depends on model choice
);

-- Analytics table
CREATE TABLE analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  value TEXT,
  tool TEXT,
  timestamp TEXT NOT NULL
);

-- Cache metadata
CREATE TABLE cache_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Stores: schema_version, last_rebuild_hash, last_rebuild_at
```

### Data Migration for Existing memory.db Files

**One-time migration script** (`src/memory/migrate.ts`):

1. Rename old `memory.db` to `memory.db.bak`
2. Read all memories from `memory.db.bak`
3. For each memory:
   - Generate UUID
   - Set `contributor` to git config user.name (or "unknown" if not available)
   - Set `tags` to `[]`
   - Set `shared` to `true` (except preferences → `false`)
   - Set `updated_at` to `created_at`
   - Skip memories with status 'completed' or 'archived' (they were effectively deleted)
   - Write JSON file to `.aide/memories/<layer>/`
4. Rebuild SQLite cache from JSON files
5. Print summary: "Migrated N memories from legacy store to file-per-memory format. Old database preserved at memory.db.bak."

**When to run:** `aide-memory init` detects old `memory.db` and offers to migrate. Can also be run manually: `aide-memory migrate`.

**Backward compatibility:** None. Old `memory.db` is left in place (not deleted) but no longer read by the new system. Users can delete it manually.

### Migration Sequence

```
1. Update types.ts (new fields, new status values)
2. Create file-store.ts (JSON file I/O + SQLite cache)
3. Update store.ts to use new architecture (or replace with file-store.ts)
4. Update all test files for new types and behavior
5. Run tests — all must pass
6. Create migrate.ts for legacy data
7. Update server.ts MCP tools for new types
8. Update hooks for new store paths
9. Update recall.ts if needed (minimal changes expected)
```

---

## 9. Open Questions — Resolved

All questions from the original spec have been resolved. Decisions are documented here for future reference.

### Architecture — DECIDED

**Q1: Where does the SQLite cache live?** → **DECIDED: `.aide/cache/index.db` inside the project (gitignored).**
Each `.aide/` directory is self-contained per project. The cache lives inside it. Simple mental model: everything aide-memory = inside `.aide/`. The `.aide/` directory is the suite directory — future AIDE products (AIDE Map, AIDE Skills) would use `.aide/map/`, `.aide/skills/`, etc. The top-level `.aide/` is shared infrastructure.

**Q2: What happens to old `memory.db`?** → **DECIDED: Rename to `memory.db.bak`, then migrate.**
Safe — preserves data, signals it's no longer active. Migration reads from the `.bak` file and creates JSON files in `.aide/memories/`.

**Q3: Embedding model choice?** → **DECIDED: `bge-small-en-v1.5` (default). User-configurable.**

Objective comparison (MTEB benchmarks, no vendor bias):

| Model | Size | Dims | License | MTEB Score | Verdict |
|-------|------|------|---------|------------|---------|
| all-MiniLM-L6-v2 | 80MB | 384 | Apache 2.0 | 56.3 | **Outdated.** Fast inference but lowest accuracy. Skip. |
| gte-small | 67MB | 384 | MIT | ~61-62 | Good all-rounder. Alibaba DAMO. |
| **bge-small-en-v1.5** | **67MB** | **384** | **MIT** | **~62-64** | **Best balance: smallest, highest accuracy in tier, strong on retrieval.** |
| nomic-embed-text-v1.5 | 274MB | 768 | Apache 2.0 | ~62.39 | Higher dims capture code nuance better. 4x larger download. |

**Default: `bge-small-en-v1.5`** — 67MB, MIT license, company-safe, best MTEB score in the small model tier, strong on retrieval/similarity tasks relevant to code. Downloaded via `@huggingface/transformers` JS library to `~/.cache/aide-memory/models/`. No API keys. No phone-home.

Users can switch: `aide config embeddings.model nomic-embed-text-v1.5` (or any HuggingFace model name or local path). Download happens during `aide init` with progress bar. If download fails, init succeeds without embeddings — FTS5 keyword search still works. Retry: `aide init --download-model`.

Sources: MTEB Leaderboard (HuggingFace), BAAI/bge-small-en-v1.5 benchmarks.

**Q4: Should `aide-memory init` modify existing CLAUDE.md?** → **DECIDED: No. Separate rules files only.**
Init writes ONLY to `.claude/rules/aide-memory.md` and `.cursor/rules/aide-memory.mdc`. Never touches existing CLAUDE.md, .cursorrules, or copilot-instructions.md. These rules files tell the tool's model how to use aide-memory (when to call aide_recall, how to format aide_remember, etc.). Config generation that writes to CLAUDE.md is a Phase 2 pro feature.

### Implementation — DECIDED

**Q5: How does the PreToolUse nudge determine memory count?** → **DECIDED: Fast SQL COUNT query on SQLite cache.**
`SELECT COUNT(*) FROM memories WHERE <scope matches path>` — sub-millisecond. The "current path" is the file path passed by the tool's PreToolUse hook (e.g., the `file_path` from Claude Code's Read tool input). The hook always knows which file is being read. If the agent asks a question about a different path, it calls `aide_recall` directly with that path — the nudge only fires on file reads.

**Q6: Contributor auto-detection?** → **DECIDED: git config user.name as default, config as override, env var for CI.**
Priority: `AIDE_CONTRIBUTOR` env var > `.aide/config.json` contributor field > `git config user.name`.

**Q7: Should aide_forget delete the file?** → **DECIDED: Yes, delete the file. No "deleted" status.**
The `status` field is removed entirely from the schema. A memory exists (file present) or is deleted (file gone). For soft-flagging, use tags: `outdated`, `deprecated`, `needs-review`. Git history preserves deleted memories if recovery is needed. When a teammate pulls and the file is gone, their post-checkout hook removes it from their SQLite cache.

**Q8: Atomic file writes?** → **DECIDED: Temp file + rename.**
Write to `<uuid>.json.tmp`, then rename to `<uuid>.json`. Atomic on all modern filesystems. Prevents corruption on crash.

**Q8b: Sync safety — preventing import/export overwrites?** → **DECIDED: JSON files are ALWAYS source of truth.**
- Import (JSON → SQLite): Rebuilds cache from files. Uses `updated_at` timestamp — newer wins. Never overwrites newer cache data with older file data.
- Export (SQLite → JSON): Only creates MISSING JSON files. Never overwrites existing files.
- Normal operation: `add()` writes both JSON file and SQLite simultaneously, so they're always in sync.
- Edge case — SQLite has memories not in JSON: shouldn't happen (every add writes both), but `aide-memory sync export` creates the missing files as a safety net.
- Edge case — JSON has memories not in SQLite: `aide-memory sync import` (or post-checkout hook) imports them.
- No scenario where one operation must precede the other. Both are idempotent and safe to run in any order.

### Distribution — DECIDED

**Q9: Old aide-v0 code during npm publish?** → **DECIDED: Use `"files"` field in package.json.**
Standard npm approach. Include only `dist/memory/`, `dist/cli/aide-memory.js`, `scripts/hooks/`, templates. No repo restructuring needed.

**Q10: CLI binary naming?** → **DECIDED: `aide` as default binary, `aide-memory` as npm package name and fallback.**
npm package is `aide-memory`. Binary registered as both `aide` and `aide-memory` in package.json `bin` field. Users use `aide init`, `aide recall`, etc. by default. If a conflict is detected during init (another `aide` binary exists on PATH), warn: "Another `aide` binary found at <path>. Use `aide-memory` instead, or remove the conflicting binary." The `aide-memory` binary always works as a safe fallback. `npm install -g aide-memory && aide-memory init` is the first-time install flow.

### Testing — DECIDED

**Q11: Cursor hook support?** → **RESOLVED: Cursor 1.7+ supports all needed hooks.**
Research findings (April 6, 2026):
- **PreToolUse hooks:** YES. Cursor 1.7+ supports PreToolUse hooks via `.cursor/hooks.json`. Hooks receive JSON via stdin, return allow/deny/ask decisions.
- **Stop hooks:** YES. Cursor supports Stop lifecycle hooks.
- **Configuration:** `.cursor/hooks.json` (separate from MCP config).
- **Context injection:** Cursor uses `agent_message` field (injected into agent context) and `user_message` (displayed in UI). This is equivalent to Claude Code's `additionalContext` but with different field names.
- **MCP:** `.cursor/mcp.json` (project-level) or `~/.cursor/mcp.json` (user-level).
- **Key implementation note:** Our hook scripts must output BOTH Claude Code format (`additionalContext`) and Cursor format (`agent_message`) — OR detect which tool is calling them and output the correct format. Simpler approach: maintain separate hook configs per tool that point to the same underlying script but format output differently.
- Sources: [Cursor Hooks Docs](https://cursor.com/docs/hooks), [Cursor MCP Docs](https://cursor.com/docs/mcp), [GitButler deep dive](https://blog.gitbutler.com/cursor-hooks-deep-dive)

**Q12: Validation scoring?** → **DECIDED: Developer scoring (a) + automated metrics (c).**
Developer scores the rubric for qualitative assessment. Automated metrics captured during integration tests for quantitative evidence (recall count, memory usage, task completion). Both used in demo materials and launch posts.

### New Questions (from feedback)

**Q13: Metrics for direct file reads?** → **KNOWN LIMITATION.**
If a tool or user reads `.aide/memories/*.json` files directly (bypassing hooks and MCP), we can't track the read. We CAN track: MCP-based recalls (aide_recall calls), hook-triggered nudges (PreToolUse events), CLI recalls. Direct file reads are invisible by design — the files are meant to be human-readable. Document this as a known limitation. Not worth building filesystem watchers to track.

**Q14: Plugin/marketplace timing?** → **DECIDED: Phase 1 (Sprint 4, alongside npm package).**
Claude Code plugin listing and Cursor marketplace/adapter listing are distribution channels, not features. Low effort, high visibility. Ship alongside the npm package.

**Q15: How do users get updates?** → **DECIDED: npm update + rules refresh command.**
- Code updates: `npm update -g aide-memory` (standard npm)
- Rules updates: `aide-memory init --update-rules` refreshes rules files without touching config, memories, or hooks. For when aide-memory ships improved rules in a new version.
- Version check: on startup, if a newer version is available on npm, print one-line suggestion: "aide-memory vX.Y.Z available. Run `npm update -g aide-memory` to update." (Non-blocking, informational only.)
- No auto-update. No forced updates. User controls when to update.

**Q16: Demo creation?** → **DECIDED: Post-validation, pre-launch.**
Individual feature demo snippets (30-60 seconds each): capture, recall, nudge, search, init, cross-session persistence. One full-flow demo (3-5 minutes): init → work → recall → cross-session. Used for: landing page, README, blog posts, HN launch, social media. See P1.19.

---

## Appendix A: JSON File Format Reference

```json
{
  "uuid": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "layer": "area_context",
  "what": "Skeleton loading replaces ALL legacy loaders in this module",
  "why": "Performance and UX consistency — the old shimmer loaders caused layout shifts",
  "scope": "src/components/dashboard/**",
  "context_label": "dashboard skeleton loading",
  "contributor": "meky",
  "tags": ["architecture", "performance"],
  "source": "conversation",
  "shared": true,
  "generated_by": {
    "tool": "claude-code",
    "model": "claude-opus-4",
    "author_type": "ai"
  },
  "created_at": "2026-04-06T12:00:00.000Z",
  "updated_at": "2026-04-06T12:00:00.000Z"
}
```

**No `status` field.** File exists = active. File deleted = gone. Use tags (`outdated`, `deprecated`) for soft-flagging.

**`generated_by`** tracks provenance:
- `tool`: which AI coding tool was active (claude-code, cursor, cli, null for manual)
- `model`: which LLM model (auto-detected from tool if possible, null if unknown)
- `author_type`: `"human"` = user explicitly invoked `aide remember` CLI or instructed agent. `"ai"` = agent decided to store via hook prompt or own initiative.
- Human-only memories (user ran CLI directly): `{ tool: "cli", model: null, author_type: "human" }`

**Fields NOT in JSON file (SQLite cache only):**
- `id` (auto-increment row ID)
- `recalled_count` (local tracking)
- `last_recalled_at` (local tracking)

**Filename:** `<uuid>.json` (e.g., `a1b2c3d4-e5f6-7890-abcd-ef1234567890.json`)

**Location:** `.aide/memories/<layer>/<uuid>.json`

---

## Appendix B: Telemetry Event Schema

```json
{
  "event": "memory_stored",
  "properties": {
    "layer": "technical",
    "source": "hook",
    "tool": "claude-code",
    "memory_count_total": 47
  },
  "timestamp": "2026-04-06T12:00:00.000Z",
  "client_id": "anonymous-hash",
  "version": "0.1.0"
}
```

**Events sent (when telemetry enabled):**

| Event | Properties | Never sent |
|-------|-----------|------------|
| `install` | version, platform, node_version | - |
| `init` | tool_count, scan_used, existing_config_count | file paths |
| `memory_stored` | layer, source, tool | memory content |
| `memory_recalled` | count, tool | paths, content |
| `search` | method (fts5/semantic), result_count | query text |
| `error` | error_type, component | stack trace |

---

## Appendix C: Sprint Calendar (Estimated)

```
Week 1-2:  Sprint 1 — Storage foundation + FTS5 + Rules files
Week 2-3:  Sprint 2 — Hooks (4: PreToolUse, Stop, UserPromptSubmit, PreCompact) + aide_update + CLI + Config + Cursor + Update mechanism
Week 3-4:  Sprint 3 — Embeddings + Sync + Analytics
Week 4-5:  Sprint 4 — Init + Pre-train + npm package + Plugin listings + User docs
Week 5-6:  Sprint 5 — Validation + Demo creation + Polish + Final docs + Launch prep

Phase 0 runs in parallel throughout (weeks 1-4).
```

**Critical path:** P1.1 (Storage) → P1.5 (Hooks) → P1.14 (Init) → P1.17 (Validation) → P1.19 (Demos)

Any delay in storage migration delays everything. This is the one component that cannot be descoped or deferred.

---

## Appendix D: Unified Agent Protocol

When spinning off parallel agents for implementation, ALL agents follow this protocol.

### Pre-work: What Every Agent Reads

1. **This spec** (`docs/specs/PHASE_0_1_SPEC.md`) — their assigned component's section
2. **Types** (`src/memory/types.ts`) — the updated type definitions
3. **Existing code** for their component (listed in their component breakdown)
4. **PRODUCT_VISION.md** — only the section relevant to their component (not all 1,653 lines)

### During Work: What Every Agent Does

1. **Work on their feature branch** (e.g., `feature/phase-1/storage`) — never commit to `feature/phase-1` directly
2. **Write tests first** (or alongside) — no code ships without tests
3. **Follow conventional commits** with scope prefix: `feat(storage): ...`, `test(fts5): ...`
4. **Mark checkboxes in this spec** as items complete (edit the spec file directly)
5. **Add implementation notes** inline in this spec under their component's AC section if they make judgment calls or encounter gaps

### After Work: What Every Agent Reports

Each agent produces a **standardized completion report** as a comment block at the end of their component's AC section in this spec:

```markdown
<!-- AGENT REPORT: P1.X — Component Name
Status: COMPLETE | PARTIAL | BLOCKED
Files created: list
Files modified: list
Tests: N passing, M failing
Judgment calls:
  - [description of any decisions made that weren't in the spec]
Gaps found:
  - [anything the spec didn't cover that needed a decision]
Issues encountered:
  - [bugs, unexpected behavior, things that need attention]
Unresolved:
  - [anything left undone and why]
-->
```

### Merge Protocol

1. Agent completes work on feature branch
2. Agent runs full test suite (`npm test`) — all tests must pass
3. Agent creates PR to `feature/phase-1` with completion report
4. PR merged (squash) to `feature/phase-1`
5. After merge: run full test suite on `feature/phase-1` to catch integration issues
6. If integration issues: the agent whose component caused the issue fixes it
7. This spec is updated with progress after each merge

### Conflict Resolution

- If two agents need the same file: the "foundation" agent takes precedence (storage > hooks > tools > CLI)
- If an agent discovers the spec is ambiguous: make a judgment call, document it in the report, continue. Don't block.
- If an agent discovers the spec is wrong: fix the issue, document the correction in the report.

---

## Appendix E: Update Mechanism

### How Users Get Updates

| What | How | User action |
|------|-----|-------------|
| New aide-memory version (code) | Published to npm | `npm update -g aide-memory` |
| Updated rules files | Shipped in new version | `aide-memory init --update-rules` |
| New hooks or hook improvements | Shipped in new version | `aide-memory init --update-rules` (re-configures hooks too) |
| New tool support (e.g., Windsurf adapter) | Shipped in new version | `aide-memory init --update-rules` (writes new tool's rules file) |
| Schema changes to JSON format | Handled by migration logic | Automatic on startup (version check in config) |

### Version Check (Non-blocking)

On any CLI command, if the installed version is older than the latest npm version:
```
aide-memory v0.1.0 → v0.2.0 available. Run `npm update -g aide-memory` to update.
```
- Check at most once per day (cache last check timestamp)
- Never block operations
- Disable via `aide-memory config updates.check false`

### Rules File Versioning

Rules files include a version comment at the top:
```markdown
<!-- aide-memory rules v0.1.0 — generated by aide-memory init -->
```
`aide-memory init --update-rules` checks this version and only updates if the installed version is newer. Never overwrites user modifications unless `--force` is used.

---

## Appendix F: Known Limitations

| Limitation | Why | Mitigation |
|-----------|-----|------------|
| Direct file reads not tracked | If a tool reads `.aide/memories/*.json` directly (bypassing hooks/MCP), we can't track the recall | Track via MCP tools (aide_recall) and hooks (PreToolUse). Document limitation. Not worth filesystem watchers. |
| Subagent hooks don't fire | Claude Code's Plan/Explore subagents don't trigger PreToolUse hooks | Known Claude Code limitation (documented in hooks test findings). Subagents miss nudges. Main agent still gets them. |
| Semantic search requires model download | ~50-100MB download during init | Download is optional. FTS5 works without it. Warn user if model missing. |
| Git history grows over time | Hundreds of memory files committed/deleted over months | ~500 bytes per file. 2,000 memories = ~1MB. Acceptable for years. Monitor in practice. |

---

## Appendix G: Embedding Model Download

**Default model:** `bge-small-en-v1.5` (MIT, ~67MB, 384 dims, MTEB ~62-64)

**Download mechanism:** Uses `@huggingface/transformers` JS library which downloads models from HuggingFace Hub.

```
aide init
  → Downloading embedding model (bge-small-en-v1.5, ~67MB)...
  → [████████████████████████████████] 100%
  → Model saved to ~/.cache/aide-memory/models/bge-small-en-v1.5/
```

**Cache location:** `~/.cache/aide-memory/models/` (shared across all projects, downloaded once).

**Offline / failed download:**
- Init succeeds without the model — semantic search disabled, FTS5 keyword search works fine
- User can retry: `aide init --download-model`
- Warning printed once per session if model missing: "Semantic search unavailable — run `aide init --download-model` to enable."

**Custom model:** `aide config embeddings.model <model-name-or-path>` — supports HuggingFace model names or local file paths.

**Using Ollama or other providers (optional, better quality):**
Users who want higher-quality embeddings can configure Ollama or other local providers:
```
aide config embeddings.backend ollama
aide config embeddings.model nomic-embed-text    # or any Ollama model
```
This requires Ollama installed and running (`ollama serve`). The default (`@huggingface/transformers` in-process) requires no external service. Other backends (OpenAI API, Gemini API) are possible but send data off-machine — document the privacy tradeoff clearly.

---

## Appendix H: Landing Page & Documentation Deployment

**Domain:** Register via Cloudflare Registrar (cheapest, includes free DNS/SSL) or Namecheap.

**Docs site stack:** Markdown source files live in the public `aide-memory` GitHub repo under `docs/`. Rendered as a website using one of:
- **Nextra** (Next.js-based, markdown → React, simple) — recommended for starting fast
- **Fumadocs** (Next.js, similar to Nextra but newer)
- **Docusaurus** (React, feature-rich, used by many OSS projects)

Source of truth is always the markdown in GitHub. Website auto-deploys from GitHub on push.

**Hosting:** Vercel (free tier, auto-deploy from GitHub, works natively with Next.js/Nextra).

**Landing page content (from P0.5):**
- Hero: one-sentence pitch + `npm install -g aide-memory && aide-memory init` install command
- Feature bullets (6-8, from Phase 1 capabilities)
- Demo GIF/video (from P1.19)
- Waitlist signup (simple email form → PostHog or Mailchimp)
- Links to docs, GitHub issues
- No Phase 2+ roadmap revealed

**Stack recommendation for now:** Nextra + Vercel. Minimal setup, markdown-native, auto-deploy. Can migrate to something fancier later if needed.

---

## Appendix I: Phase 1.5+ Hook Exploration

Phase 1 ships with **4 hooks**: PreToolUse (read nudge), Stop (reflection), UserPromptSubmit (corrections + decisions + preferences), PreCompact (extract before compaction loss).

Future hooks for Phase 1.5+ exploration:

| Hook | When it fires | What it would do | Priority |
|------|--------------|-----------------|----------|
| PreToolUse (Write/Edit) | Before agent writes or edits a file | Nudge: "N memories exist about this file. Call aide_recall before modifying." | Medium — evaluate overhead from real usage first |
| UserPromptSubmit (generic) | All user prompts | Model-based relevance scoring to determine if anything is memory-worthy | Phase 2 — needs smarter filtering to avoid noise |
| UserPromptSubmit (confirmations) | User says "perfect", "exactly right" | Signal to store the confirmed approach | Low — harder to detect reliably |
| PostToolUse | After agent edits code | Flag when edits contradict existing memories (stale context detection) | Phase 2 (per PRODUCT_VISION) |
| PostCompact | After compaction completes | Log what was compacted for analytics | Low priority |
