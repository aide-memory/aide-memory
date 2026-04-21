# Manual End-to-End Validation

One-hour top-to-bottom walk you can run in a real Claude Code session against a fresh test project. Exercises every capability of aide-memory once. Includes **scenario K** (plan persistence), the only scenario not auto-runnable.

Every step has an **Expected** line — if you hit the expected outcome you can move on. If not, report the step number and I'll dig in.

---

## 0. Setup (5 min)

```bash
rm -rf /tmp/aide-e2e
mkdir -p /tmp/aide-e2e/src/api /tmp/aide-e2e/src/auth /tmp/aide-e2e/src/utils
cd /tmp/aide-e2e
git init -q
aide-memory init
```

**Expected:** init output lists `.aide/...`, `.claude/settings.json`, `.mcp.json`, `.ignore`, `.gitignore`, `.git/hooks/post-checkout`.

Seed enough memories to defeat softening (need ≥10):

```bash
# Scoped memories
aide-memory remember "Auth uses JWT with RS256 signing" --layer technical --scope "src/auth/**"
aide-memory remember "Never log auth tokens to console" --layer technical --scope "src/auth/**"
aide-memory remember "All timestamps as Unix epoch ms, never ISO 8601" --layer guidelines --scope "src/api/**"
aide-memory remember "API responses use camelCase keys" --layer guidelines --scope "src/api/**"
aide-memory remember "Error responses must include requestId from X-Request-ID" --layer technical --scope "src/api/**"
aide-memory remember "Rate limit 50 req/min per user" --layer technical --scope "src/api/**"
aide-memory remember "Date utils must handle timezone-aware inputs" --layer technical --scope "src/utils/**"

# Project-wide
aide-memory remember "Keep functions under 30 lines" --layer guidelines
aide-memory remember "Never add TODO comments — fix or file an issue" --layer guidelines
aide-memory remember "Use async/await not callbacks" --layer guidelines
aide-memory remember "I prefer composition over inheritance" --layer preferences
```

Seed source files:

```bash
cat > src/api/routes.ts <<'EOF'
// existing API routes
export function getUsers() { return []; }
EOF
cat > src/auth/middleware.ts <<'EOF'
// auth middleware
export function authMiddleware(req: any, res: any, next: any) {}
EOF
cat > src/utils/dates.ts <<'EOF'
// date utilities
export function parseDate(s: string) { return new Date(s); }
EOF
```

**Expected:** `aide-memory list` shows 11 memories across 4 layers.

---

## 1. Fresh session — SessionStart injection (2 min)

```bash
cd /tmp/aide-e2e && claude --debug
```

In the session, type: `what do you know about this project?`

**Expected:**
- Agent mentions the project-wide guidelines (camelCase equivalent is wrong; they are project-wide like "under 30 lines", "async/await", "no TODOs") and the preference ("composition over inheritance")
- Did **not** mention scoped memories (those only surface when reading the matching files)

**How to verify:** Agent's reply references content from the project-wide memories without you asking about a specific path.

---

## 2. Path-based recall (3 min)

In the same session, type: `read src/api/routes.ts and tell me what's there`

**Expected:**
- PreToolUse hook fires for Read — you'll see a block message like *"N memories for .../src/api/routes.ts..."*
- Agent calls `aide_recall` — you'll see the MCP tool call inline
- Agent then reads the file and describes it, referencing the scoped memories (epoch ms, camelCase, requestId, rate limit)

Then type: `read src/api/routes.ts again`

**Expected:** Silent read — no block, no recall. IDs already tracked.

Then type: `read src/auth/middleware.ts`

**Expected:** Block again — different scope, different IDs. Agent recalls auth memories.

---

## 3. Search nudge (1 min)

Type: `grep for "rate" across the repo`

**Expected:** Grep hook fires soft — *"N aide memories match 'rate'. Call aide_search..."*. Agent calls `aide_search`, then runs Grep. Summary includes both stored context and code matches.

---

## 4. Correction loop (3 min)

Type: `no, we use epoch seconds not milliseconds`

**Expected:**
- UserPromptSubmit fires soft with "store via aide_remember"
- Agent calls `aide_remember` (or `aide_update` if it remembers the existing memory #3 about epoch ms)
- Stop hook fires standard message (no "correction wasn't stored" prefix) because PostToolUse cleared the flag

Then exit the session (`/exit`).

**Verify after exit:**

```bash
aide-memory list --layer technical | grep -i epoch
```

**Expected:** Either a new memory about epoch seconds OR the original #3 memory updated.

---

## 5. Cross-session: verify correction surfaces (2 min)

```bash
cd /tmp/aide-e2e && claude --debug
```

Type: `write a new function to src/api/orders.ts that returns order details with a timestamp`

**Expected:**
- Hook block on read/write to `src/api/...` surfaces the stored correction (epoch seconds/ms)
- Agent writes the function using the corrected time format

---

## 6. K — Plan persistence organic (5 min, THE main K scenario)

Still in the same session (or start fresh — doesn't matter).

Type: `I need to add pagination to our list endpoints. Draft a plan — think through the API shape, cursor vs offset, and how it plays with rate limiting. Don't implement yet.`

**Expected:**
- Agent drafts a multi-step plan
- Agent **proactively** calls `aide_remember` (layer=area_context, scope=`src/api/**`) storing the plan summary — without being told to. This is the K-specific signal.
- Stop hook fires clean (standard message, no correction prefix)

If the agent does NOT proactively store, type: `save this plan so we can pick it up next session`. (Manual prompt fallback — still verifies cross-session mechanics, but note the agent needed a nudge.)

Exit the session.

```bash
claude --debug
```

Type: `continue the pagination work from where we left off`

**Expected:**
- SessionStart injection OR path-recall surfaces the plan memory
- Agent references specific details from the plan (cursor vs offset discussion, rate-limit interplay)
- Does NOT re-draft from scratch

**This is the K validation.** If the agent picks up the plan details accurately, organic cross-session plan persistence works.

---

## 7. Settings toggle — instant propagation (3 min)

In a terminal (outside Claude):

```bash
cd /tmp/aide-e2e
aide-memory config hooks.correction.enabled false
```

Start a new Claude session. Type: `no, use spaces not tabs`

**Expected:** The UserPromptSubmit correction nudge does NOT fire (agent replies normally, no "store via aide_remember" message).

Toggle back:

```bash
aide-memory config hooks.correction.enabled true
```

In a **new** Claude session, repeat the correction prompt.

**Expected:** Correction nudge fires.

---

## 8. Direct config edit — drift-repair (2 min)

In a terminal:

```bash
cat /tmp/aide-e2e/.ignore
```

**Expected:** Shows `# BEGIN aide-memory-managed` / `.aide/memories/` / `# END aide-memory-managed`.

Hand-edit `.aide/config.json` to flip `memories.hideFromGrep: false`:

```bash
python3 -c "import json; p='/tmp/aide-e2e/.aide/config.json'; c=json.load(open(p)); c['memories']={'hideFromGrep':False}; json.dump(c, open(p,'w'), indent=2)"
```

In a Claude session, do anything that fires a hook (e.g. read a file).

Wait ~3 seconds, then check:

```bash
cat /tmp/aide-e2e/.ignore
```

**Expected:** File is gone — `.ignore` removed (drift-repair worked).

---

## 9. MCP down + pending file (4 min)

Break MCP:

```bash
mv /tmp/aide-e2e/.mcp.json /tmp/aide-e2e/.mcp.json.bak
cat > /tmp/aide-e2e/.mcp.json <<'EOF'
{"mcpServers":{"aide-memory":{"command":"node","args":["/nonexistent/fake.js","/tmp/aide-e2e"]}}}
EOF
```

Open Claude. Type: `no, always use spaces not tabs in this codebase`

**Expected:**
- Banner shows "1 MCP server failed"
- Agent responds saying it saved the correction to `pending-memories.jsonl` since MCP is unavailable

```bash
cat /tmp/aide-e2e/.aide/pending-memories.jsonl
```

**Expected:** One JSON line with the spaces-not-tabs correction.

Exit Claude, restore MCP:

```bash
mv /tmp/aide-e2e/.mcp.json.bak /tmp/aide-e2e/.mcp.json
```

Open Claude again with `--debug` — watch stderr during startup.

**Expected:** `aide-memory: imported 1 pending memory from .aide/pending-memories.jsonl`

```bash
ls /tmp/aide-e2e/.aide/
```

**Expected:** `pending-memories.jsonl.imported-{timestamp}` exists. No plain `pending-memories.jsonl`.

```bash
aide-memory list --layer preferences | grep -i space
```

**Expected:** Memory about "spaces not tabs" is now in the store.

---

## 10. Stats + cleanup (1 min)

```bash
aide-memory stats
```

**Expected:** Shows counts per layer, most-recalled memories, by-source breakdown.

```bash
aide-memory cleanup --dry-run
```

**Expected:** Lists stale tracking files (if any) without deleting.

---

## Summary Checklist

Tick each box as you go:

- [ ] 0. init + seed produces 11 memories
- [ ] 1. SessionStart injects project-wide context
- [ ] 2. Path-based recall blocks on first read, silent on re-read, blocks on different scope
- [ ] 3. Search nudge fires on relevant grep
- [ ] 4. Correction stores via aide_remember/update, flag cleared
- [ ] 5. Correction surfaces in next session
- [ ] 6. **K — Agent proactively stores plan AND picks it up in new session**
- [ ] 7. Settings toggle changes behavior on next session
- [ ] 8. Direct config.json edit triggers drift-repair within a few seconds
- [ ] 9. MCP-down → pending file → restart → ingested automatically
- [ ] 10. Stats + cleanup CLIs work

If all 10 tick, Phase 1 is end-to-end validated.
