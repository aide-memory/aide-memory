# Manual End-to-End Validation

One-sitting top-to-bottom walk you can run in real Claude Code sessions against a fresh test project. Exercises every capability previously validated in scenarios A–G, U1–U3, O, H, J plus the new Apr 2026 fixes, **and** scenario K (the only one not auto-runnable).

Each step has an **Expected** line — if you hit it, move on. If not, report the step number and I'll dig in.

**Time:** ~45-60 minutes end-to-end if you skim (plus ~5 min for the pre-flight automated pass).

---

## Pre-flight (REQUIRED before any manual step)

The manual walk assumes the automated suite is green. **Run this first every time** — fresh session start, after merging a branch, after any dependency update, after a release bundle swap, or whenever you're resuming after a long break. If any check fails, fix that first before opening a Claude session.

```bash
cd /Users/meky/code/aide-v0

# 1. Unit tests — expect 660/660 pass (as of Apr 21, 2026; number grows as regression tests are added)
npm test -- --run 2>&1 | tail -5

# 2. Bash smoke suites — each prints "PASS" at the end
#    (count-parity smoke was removed after the 0.4.0 hook consolidation —
#    its invariant is now covered by src/memory/__tests__/recall.test.ts
#    + hooks.test.ts + the e2e-autonomous.sh suite below.)
bash scripts/hooks/__tests__/settings-behavior.test.sh
bash scripts/hooks/__tests__/detect-correction.test.sh
bash scripts/hooks/__tests__/all-configs-behavior.test.sh

# 3. End-to-end autonomous smokes — spawn real MCP against dirty state.
#    Covers H (auto-update on stale settings), J (pending-memory ingest
#    on MCP start), and drift-repair (config.json edit → hook fires
#    resync). These can't be unit-tested because they need the real
#    startServer() path + hook dispatcher running together.
bash scripts/hooks/__tests__/e2e-autonomous.sh

# 4. Build is clean — tsc should exit 0 with no output
npm run build 2>&1 | tail -3
```

**All four MUST pass before starting the manual walk.** If you're validating a freshly-published tarball (not dev-mode), also add the install-from-tarball smoke per `docs/RELEASING.md` §4 — dev-mode hides packaging-scoped bugs (missing bundles, dev-manifest leaks into the CLI bundle, etc.). See memory #163.

If any of the above fail: stop, fix the failing test/smoke, then restart the manual walk. Do NOT skip the pre-flight — the manual walk's expected outputs rely on all these passing.

---

## 0. Setup (3 min)

```bash
rm -rf /tmp/aide-e2e
mkdir -p /tmp/aide-e2e/src/api /tmp/aide-e2e/src/auth /tmp/aide-e2e/src/utils
cd /tmp/aide-e2e
git init -q
aide-memory init
```

**Expected:** init output lists `.aide/...`, `.claude/settings.json`, `.mcp.json`, `.ignore`, `.gitignore`, `.git/hooks/post-checkout`.

Seed source files (empty-ish stubs):

```bash
cat > src/api/routes.ts <<'EOF'
export function getUsers() { return []; }
EOF
cat > src/auth/middleware.ts <<'EOF'
export function authMiddleware(req: any, res: any, next: any) {}
EOF
cat > src/utils/dates.ts <<'EOF'
export function parseDate(s: string) { return new Date(s); }
EOF
```

---

## 1. F0 + F — empty project & softening threshold (3 min)

**Before seeding memories**, open Claude:

```bash
cd /tmp/aide-e2e && claude --debug
```

Type: `read src/api/routes.ts`

**Expected (F0):** Silent read. Zero memories in store → zero scoped memories for any path → no hook output.

Exit. Add 3 memories (below the softening threshold of 10):

```bash
aide-memory remember "Use JWT for auth" --layer technical --scope "src/auth/**"
aide-memory remember "API uses camelCase" --layer guidelines --scope "src/api/**"
aide-memory remember "Prefer composition over inheritance" --layer preferences
```

Open Claude again. Type: `read src/api/routes.ts`

**Expected (F — softening):** The hook fires as a **soft nudge** (`additionalContext`) not a hard block. Message format like *"1 memory for .../routes.ts... Call aide_recall"*. The agent should react but the tool call isn't forcibly blocked. This confirms `memories.softening.threshold` (default 10) is working — projects with fewer total memories don't hard-block.

Exit.

---

## 2. Seed to full corpus (1 min)

Add enough memories to cross the softening threshold and exercise multi-scope behavior:

```bash
aide-memory remember "Never log auth tokens to console" --layer technical --scope "src/auth/**"
aide-memory remember "All timestamps as Unix epoch ms, never ISO 8601" --layer guidelines --scope "src/api/**"
aide-memory remember "Error responses must include requestId from X-Request-ID" --layer technical --scope "src/api/**"
aide-memory remember "Rate limit 50 req/min per user" --layer technical --scope "src/api/**"
aide-memory remember "Date utils must handle timezone-aware inputs" --layer technical --scope "src/utils/**"
aide-memory remember "Keep functions under 30 lines" --layer guidelines
aide-memory remember "Never add TODO comments — fix or file an issue" --layer guidelines
aide-memory remember "Use async/await not callbacks" --layer guidelines
```

**Expected:** `aide-memory list` shows 11 memories across 4 layers (5 technical, 4 guidelines, 1 preferences).

---

## 3. SessionStart injection (2 min)

```bash
cd /tmp/aide-e2e && claude --debug
```

Type: `what do you know about this project?`

**Expected:**
- Agent mentions project-wide guidelines/preferences (camelCase is scoped so NOT in this list — only "under 30 lines", "no TODOs", "async/await", "composition over inheritance")
- Does NOT mention scoped items yet — those come on path reads
- Grep for the debug log and you'll see `## Session Preferences` / `## Guidelines` in the SessionStart hook output

---

## 4. A — path-based recall, full ID-based blocking flow (5 min)

Still in the session. Type: `read src/api/routes.ts`

**Expected (A1 — first read, hard block now that we have ≥10 mems):** `decision: block` with path-based message *"N memories for src/api/routes.ts (L1, L2) — topics: ... Call aide_recall({paths: [...]})"*. The integer matches the sum of the layer breakdown.

Agent should then call `aide_recall` — you see the tool call inline.

Type: `read src/api/routes.ts again`

**Expected (A3 — re-read silent):** No hook output. All scoped IDs already tracked.

Type: `read src/auth/middleware.ts`

**Expected (A5 — different scope, hard block):** `decision: block` for auth/**-scoped memories. Agent recalls.

Type: `read README.md`

**Expected (A6 — no scoped memories):** Silent. (README has no matching scope.)

---

## 5. A7 — Edit uses same tracking (1 min)

Type: `edit src/api/routes.ts — just add a // validated comment at the top`

**Expected:** Silent Edit. PreToolUse:Edit hook reads the same `ids|` tracking line; api-scoped IDs already covered from step 4.

---

## 6. Gap-filling via aide_recall({ids}) (2 min)

```bash
# Add a new scoped memory while session is running
aide-memory remember "All API routes must emit X-Request-ID response header" --layer guidelines --scope "src/api/**"
```

Back in the Claude session, type: `read src/api/routes.ts again`

**Expected:** Block-style soft nudge (`additionalContext`): *"1 memories not yet recalled. Call aide_recall({ids: [N]})"*. Agent calls `aide_recall({ids: [N]})` specifically — gap-filling, not re-fetching everything. Agent reports new convention.

---

## 7. B — Search nudge (1 min)

Type: `grep for "rate" in the codebase`

**Expected:** PreToolUse:Grep hook fires soft — *"N aide memories match 'rate'. Call aide_search..."*. Agent calls `aide_search({keyword: "rate"})`, then Grep. Summary includes both the stored rate-limit memory and any code matches.

---

## 8. C — Correction loop (3 min)

Type: `no, we use epoch seconds not milliseconds`

**Expected:**
- UserPromptSubmit fires soft — adds "BEFORE doing anything else, store via aide_remember"
- Agent calls `aide_update` (to modify existing epoch ms memory) or `aide_remember` (new memory)
- Stop hook at end of turn fires the **standard** message (no "correction wasn't stored" prefix) — confirms PostToolUse cleared the flag

Type: `dont add todos please`

**Expected:** Colloquial `dont` IS matched by the regex (post-fix). Nudge fires, correction detected.

---

## 9. D — Compact clears tracking (3 min)

Still in the session, type: `/compact`

**Expected:** Claude Code runs compaction. Debug log shows PreCompact hook fired (clears session's recalled-paths file).

After compact, type: `read src/api/routes.ts`

**Expected:** BLOCK fires again (tracking was cleared by PreCompact). Agent re-recalls. This confirms D — PreCompact properly resets session state so the agent re-verifies context after losing history.

---

## 10. E — Cross-session correction surfaces (2 min)

Exit the session (`/exit`).

```bash
cd /tmp/aide-e2e && claude --debug
```

Type: `add a getOrder(id, req) handler to src/api/routes.ts`

**Expected:**
- PreToolUse:Read or Edit on routes.ts fires a block
- Agent calls aide_recall — gets the api/** memories AND the newly-stored correction from step 8 about epoch seconds
- Agent writes the function using the corrected time format

---

## 11. G — Concurrent sessions (session isolation) (3 min)

Keep the current Claude session running. **Open a second terminal**:

```bash
cd /tmp/aide-e2e && claude --debug
```

In session B, type: `read src/auth/middleware.ts`

**Expected (G):** Session B gets its OWN hard block even though session A already recalled the same file. Debug logs show distinct `session_id` values, distinct `recalled-paths-{session_id}.txt` tracking files in `.aide/cache/`. Sessions don't share tracking state.

```bash
ls /tmp/aide-e2e/.aide/cache/recalled-paths-*.txt
```

**Expected:** Two separate tracking files.

Close session B.

---

## 12. K — Plan persistence organic (4 min)

Back in session A (or start fresh). Type: `I want to add pagination to our list endpoints. Draft a plan — think through API shape, cursor vs offset, how it plays with rate limiting. Don't implement yet.`

**Expected:**
- Agent drafts a multi-step plan
- Agent **proactively** calls `aide_remember` (layer=`area_context`, scope=`src/api/**`) to store the plan summary — **without being told to**. This is the K-specific signal.
- Stop hook fires standard message (no "correction wasn't stored" prefix)

If the agent does NOT proactively store, type: `save this plan so we can pick it up next session`. That's a manual prompt fallback — still verifies cross-session mechanics; just note the agent needed a nudge.

Exit.

```bash
claude --debug
```

Type: `continue the pagination work from where we left off`

**Expected:**
- SessionStart or path recall surfaces the plan memory
- Agent references SPECIFIC details (cursor vs offset, rate-limit interplay)
- Does NOT re-draft from scratch

**This is K — if the agent picks up the plan accurately, organic cross-session plan persistence works.**

---

## 13. O — Dynamic Stop hook schedule (2 min, optional)

If you're up for it, keep the session alive for ~14 more prompts (conversational is fine). Watch the Stop hook:

**Expected schedule (per memory #126):**
- Turns 1-9 (phase 1 = every 3): Stop blocks at turns 3, 6, 9
- Turns 10+ (phase 2 = every 5): next block at turn 14, then 19, etc.

Skip this if you're short on time — O was validated live in earlier sessions.

---

## 14. Settings toggle — instant propagation (3 min)

In a new terminal:

```bash
cd /tmp/aide-e2e
aide-memory config hooks.correction.enabled false
```

Start a new Claude session. Type: `no, use spaces not tabs`

**Expected:** Correction nudge does NOT fire. Agent replies normally.

Toggle back:

```bash
aide-memory config hooks.correction.enabled true
```

Start another new session, repeat the prompt.

**Expected:** Correction nudge fires.

---

## 15. Direct config edit + drift-repair (2 min)

```bash
cat /tmp/aide-e2e/.ignore
```

**Expected:** Shows `# BEGIN aide-memory-managed` / `.aide/memories/` / `# END`.

Hand-edit `.aide/config.json`:

```bash
python3 -c "import json; p='/tmp/aide-e2e/.aide/config.json'; c=json.load(open(p)); c['memories']={'hideFromGrep':False}; json.dump(c, open(p,'w'), indent=2)"
```

In a Claude session, do anything that fires a hook (e.g. `read src/api/routes.ts`). Wait ~3 seconds.

```bash
cat /tmp/aide-e2e/.ignore 2>&1
```

**Expected:** File is gone — drift-repair via the mtime check in `read-config.sh` removed it after the hook fired.

Revert to keep tests clean:

```bash
aide-memory config memories.hideFromGrep true
```

---

## 16. MCP down + pending-memory recovery (4 min)

Break MCP:

```bash
mv /tmp/aide-e2e/.mcp.json /tmp/aide-e2e/.mcp.json.bak
cat > /tmp/aide-e2e/.mcp.json <<'EOF'
{"mcpServers":{"aide-memory":{"command":"node","args":["/nonexistent/fake.js","/tmp/aide-e2e"]}}}
EOF
```

Open Claude. Type: `no, always use 4-space indentation in this codebase`

**Expected:**
- Banner shows "1 MCP server failed"
- Agent can still respond
- Agent notes it saved to `pending-memories.jsonl` since MCP is unavailable

```bash
cat /tmp/aide-e2e/.aide/pending-memories.jsonl
```

**Expected:** One JSON line with the correction.

Exit. Restore MCP:

```bash
mv /tmp/aide-e2e/.mcp.json.bak /tmp/aide-e2e/.mcp.json
```

Open Claude with `--debug` and watch stderr during startup.

**Expected:** `aide-memory: imported 1 pending memory from .aide/pending-memories.jsonl`

```bash
ls /tmp/aide-e2e/.aide/
```

**Expected:** `pending-memories.jsonl.imported-{timestamp}` exists. No plain `pending-memories.jsonl`.

```bash
aide-memory list --layer preferences | grep -i indent
```

**Expected:** Correction is now a real memory.

---

## 17. Stats + cleanup CLI sanity (1 min)

```bash
aide-memory stats
```

**Expected:** Counts per layer, most-recalled, by-source breakdown.

```bash
aide-memory cleanup --dry-run
```

**Expected:** Lists stale tracking files without deleting.

---

## Summary Checklist (maps each step to the prior A-G scenarios)

| # | Step | Covers |
|---|------|-------|
| [ ] 0 | init + seed baseline | Onboarding |
| [ ] 1 | empty project silent + <10 softening | **F0, F** |
| [ ] 2 | seed 11 mems | Prep for remaining scenarios |
| [ ] 3 | SessionStart injection surfaces project-wide | **N** (SessionStart verification) |
| [ ] 4 | first-read block → re-read silent → new-dir block | **A (1/3/5/6)** |
| [ ] 5 | Edit uses same tracking | **A7** |
| [ ] 6 | Gap-filling via aide_recall({ids}) | **A-Scn1 / IDB-2** |
| [ ] 7 | Grep → aide_search nudge | **B** |
| [ ] 8 | Correction loop, flag clear, colloquial `dont` | **C** + **L** |
| [ ] 9 | `/compact` clears tracking, re-block | **D** |
| [ ] 10 | New session sees earlier correction | **E** + **U2** |
| [ ] 11 | Two sessions, two tracking files, independent blocks | **G** |
| [ ] 12 | **Agent proactively stores plan + next session picks it up** | **K** (new) |
| [ ] 13 | Stop hook phase-1 → phase-2 transition | **O** (optional) |
| [ ] 14 | `aide-memory config` toggle changes behavior next session | **Settings** |
| [ ] 15 | Direct config edit triggers drift-repair within seconds | **Drift-repair (new)** |
| [ ] 16 | MCP down → pending file → restart auto-ingests | **J** |
| [ ] 17 | stats + cleanup CLIs functional | **Housekeeping** |

If all 17 tick, Phase 1 is end-to-end validated against every scenario that's ever been on the table.

### If a step fails

Report the step number + what you observed. Most failures come from:
- Hook config mismatch (check `.claude/settings.json` is current — should have `_aideMemoryVersion: "0.2.0"`)
- Test project cross-contamination (always `rm -rf /tmp/aide-e2e` before starting)
- `/compact` not clearing tracking (should, per memory #96) — check debug log for PreCompact hook firing
- Concurrent sessions sharing tracking (shouldn't — each has its own session_id file)
