# Cursor Validation Handoff — 2026-04-27

Where we left off: **0.5.0 release blocked by an ABI-mismatch silent-failure bug.**
Hard-block + recall flows ALL work end-to-end in Cursor; the bug just made
them appear broken for hours of testing.

---

## TL;DR

- **Branch:** `feature/phase-1-cursor-support` (4 commits already landed: plan
  docs / C1 code / C7 validation consolidation / C8 external docs).
- **Tests:** 750/750 unit + 25 cursor-init-smoke + 23 all-configs all green
  (under Node 22 — see problem #1).
- **Cursor validation:** N (broad/tight/regen) PASS; A0 PASS via rules-file
  guidance; A1-edit-flow PASS (`permission: deny` honored end-to-end,
  agent stopped on block, asked user how to proceed). Confirmed
  2026-04-27 12:01 PDT after fixing problem #1.
- **Blocking decision:** ship binding-mismatch loud-error fix in 0.5.0 or
  defer to 0.5.1?

---

## 🔴 THE problem (the one that ate hours)

**better-sqlite3 native binding ABI mismatch silently breaks every aide-memory
hook that touches the SQLite store.** Captured in memory #348.

### How it surfaces

1. User installs aide-memory under one Node version (postinstall compiles
   `better-sqlite3` against that ABI, e.g. NODE_MODULE_VERSION 108 for Node 18).
2. User's editor (Cursor, Claude Code, etc.) invokes hook scripts with a
   DIFFERENT Node (e.g. Node 22 → ABI 127), or user upgrades Node, or nvm
   default switches.
3. `require('better-sqlite3')` throws on ABI mismatch.
4. Our dispatcher's intentional top-level `try/catch` (in
   `src/memory/hooks/index.ts` — "hooks must never break the agent") **swallows
   the throw silently**.
5. Hook exits 0 with empty stdout. Editor sees `OUTPUT: (empty)`.
6. **No error is visible anywhere.** No nudge fires. No block fires. User has
   no idea the hook even ran.

### Why this fooled us

We chased multiple wrong hypotheses for hours:
- "Cursor auto-attaches paths and bypasses our hook" (partially true for Read,
  but conflated with this bug)
- "Cursor doesn't honor `permission: deny` (forum #154377)"
- "Cursor's hook execution context is different"

The actual fix took 2 commands: `nvm use 22 && npm rebuild better-sqlite3`.
Then preEdit fires correctly + Cursor honors the deny + agent stopped + asked
user how to proceed.

### What needs to change before we ship to real users

Pick at least #1 (the cheapest + highest-impact):

1. **Detect binding mismatch in dispatcher → emit clear stderr message
   BEFORE catch swallows.** ~10 lines in `src/memory/hooks/index.ts`. Future
   users hit by this would see in their editor's Hooks panel:
   ```
   aide-memory: better-sqlite3 ABI mismatch (binding compiled for Node X,
   running on Node Y). Run `cd <aide-memory install dir> && npm rebuild
   better-sqlite3` to fix. Hook is no-op until then.
   ```
   Without this, every node-upgrade user goes silent.

2. **MCP server startup also catches this case** — fail loudly on
   `startServer()` if `MemoryStore` ctor throws ABI error. Mirror the same
   message.

3. **`aide-memory doctor` diagnostic command** — checks ABI compat, dist/
   freshness, config validity. Proactive.

4. **Auto-rebuild on `aide-memory init` when mismatch detected** — risky
   (sudo for global installs, can fail mid-init), but self-healing for
   the common upgrade case.

5. **Documentation in `docs/user/troubleshooting.md`** — short entry:
   "If hooks aren't producing output and you upgraded Node, run
   `npm rebuild better-sqlite3` from your aide-memory install."

**Recommended minimum for 0.5.0:** #1 + #2 + #5. ~30 min of work + ships
with the rest of the branch. Without these, the next user who upgrades
Node hits a silent failure with no diagnostic path.

---

## 🟡 The other real problem: Cursor auto-attach for user-mentioned paths

When a user types a prompt containing a file path (e.g. *"read src/api/routes.ts"*),
Cursor auto-attaches the file content as an inline preview. The agent
typically answers from the auto-attached content WITHOUT calling the Read tool.
Our `preToolUse:Read` hook does not fire for these prompts.

### Caveats

- This is **only** for the Read flow. Edit/Write flows still route through
  the agent's tool calls (auto-attach can't write, agent must invoke the tool)
  → `preToolUse:Write` DOES fire → hard-block works.
- For autonomous Read flows (agent discovers + reads a file the user did
  NOT mention), our hook still fires.
- The agent's rules file (regenerated `.cursor/rules/aide-memory.mdc` with
  `alwaysApply: true`) carries "When to call aide_recall" guidance. Empirically,
  the agent calls aide_recall before/while answering from auto-attached
  content — so memories surface even without our hook firing. Verified in
  scenario A0 (2026-04-26).

### Documentation framing (per memory #347 — NO product pitching)

State factually in `docs/user/editors/cursor.md`:
- Path mentions in prompts → Cursor auto-attaches file content (Cursor UX).
- Read flow: agent typically answers from auto-attach + calls aide_recall via
  rules-guidance; preToolUse:Read fires for autonomous reads.
- Edit/Write flow: hook fires + hard-block works end-to-end.

Do **not** frame this as a Cursor weakness vs Claude Code. aide-memory is
editor-agnostic.

---

## ✅ Validation results — verified working in Cursor

All under `/private/tmp/aide-cursor-val` fixture (11+ memories seeded across
preferences/technical/area_context/guidelines + 3 stub source files).

### Verified

| Scenario | Result | Mechanism |
|---|---|---|
| **N broad** | ✅ PASS | Agent enumerated 11 memories via `aide_memories` MCP tool |
| **N-tight** | ✅ PASS | Agent answered "Do NOT store" content from rules-file injection alone, no tool calls. Confirms `alwaysApply: true` rules content reaches agent context. |
| **N-regen** | ✅ PASS | Agent stored via MCP → `.cursor/rules/aide-memory.mdc` rewritten on disk → new chat saw the marker without tool calls. Full C4 regen+reload chain. |
| **A0 (user-mentioned path)** | ✅ PASS via rules-guidance | Auto-attach gave agent file content; agent called `aide_recall` proactively per rules-file guidance; applied 4 src/api/** conventions correctly in response. |
| **A1 (autonomous Read)** | ✅ PASS happy-path | Agent recalled BEFORE reading; preRead correctly silent because `coveredCount === scoped_ids.length`. |
| **A1-edit (hard-block adversarial)** | ✅ PASS confirmed 2026-04-27 12:01 PDT | After binding-mismatch fix: preToolUse:Write fired with `coveredCount=0` → emitted `{"permission":"deny","user_message":"..."}` → Cursor honored it → agent stopped, asked user how to proceed. **Forum #154377 does NOT apply to us.** |
| **C5 correction one-turn-delay** | ✅ PASS | beforeSubmitPrompt detected correction → Stop hook emitted `followup_message` → agent stored via aide_remember on next turn. Validated 2026-04-26. |

### Not yet validated (optional)

- B (search nudge — empty pattern saw silent fire correctly; non-empty pattern not tested)
- D (compact resets tracking)
- The Read-flow autonomous hard-block trigger (we proved Edit; Read parity-by-symmetry but unobserved)

---

## 🧪 State of the fixture + dev tree

### Test fixture: `/private/tmp/aide-cursor-val`

- ✅ 12-13 memories seeded (originally 11 + REGEN-MARKER-XYZ-9k3 + memory #13 stored mid-session by agent)
- ✅ `.cursor/{hooks.json, mcp.json, rules/aide-memory.mdc}` present + working
- ✅ `.aide/config.json` has `memories.softening.threshold: 5`
- ✅ Source stubs at `src/api/routes.ts`, `src/auth/middleware.ts`,
  `src/utils/dates.ts`. **Note:** `src/auth/middleware.ts` was modified by
  the agent during the verified Edit-block test — consider regenerating
  the fixture if running fresh validation.

### Dev tree: `feature/phase-1-cursor-support`

- ✅ Node 22.22.2 set as nvm default (was Node 18 — caused the binding bug)
- ✅ `better-sqlite3` rebuilt against Node 22 (NODE_MODULE_VERSION 127)
- ✅ 750/750 tests green under Node 22
- ⚠ `scripts/hooks/pre-edit-recall.sh` still has `export AIDE_DEBUG_HOOK=1`
  added during diagnosis. **Must revert before commit.** (`.bak` may still
  exist alongside it.)
- ⚠ `src/memory/hooks/index.ts` has env-gated `[AIDE_DEBUG]` diagnostic
  code (no production impact since gated, but adds ~25 lines to dispatcher).
  Decision: keep (useful for future debugging) or revert (cleaner diff).

### Restoration steps before next commit

```bash
# 1. Revert pre-edit shim
cd /Users/meky/code/aide-v0
mv scripts/hooks/pre-edit-recall.sh.bak scripts/hooks/pre-edit-recall.sh 2>/dev/null \
  || sed -i '' '/^export AIDE_DEBUG_HOOK=1$/d' scripts/hooks/pre-edit-recall.sh

# 2. Decide on dispatcher AIDE_DEBUG_HOOK code:
#    - keep (useful, gated, ~25 lines): no action
#    - revert: edit src/memory/hooks/index.ts, restore the simpler dispatch()
#      block that just calls handler(input) without the if/else branches.

# 3. Rebuild + run tests
npm run build
npm test -- --run --exclude '**/.claude/worktrees/**' --exclude '**/.cursor/worktrees/**'
```

---

## 🚦 Pending decisions for the next session

### Decision A: ship binding-mismatch loud-error fix in 0.5.0?

**Recommendation: YES.** ~30 min of work. Without it, any user who upgrades
Node after install hits silent failure with no diagnostic path. Hits forum
#157014-class user-trust issues that take days to debug.

The fix:
1. In `src/memory/hooks/index.ts` `dispatch()`, before the swallow-all
   catch, detect errors matching `/NODE_MODULE_VERSION/` and emit a
   clear stderr line.
2. Same for `src/memory/server.ts` `startServer()` — wrap MemoryStore
   construction.
3. Add `docs/user/troubleshooting.md` entry.

### Decision B: keep or revert dispatcher `AIDE_DEBUG_HOOK` diagnostic

The env-gated diagnostic was invaluable for finding this bug. Future bugs
of this class would benefit from having it ready-to-go. Cost: ~25 lines
in dispatch path, gated by env (zero production overhead).

**Recommendation: keep.** Future debugging convenience > diff cleanliness.

### Decision C: docs to update before 0.5.0

- `docs/user/editors/cursor.md` — describe auto-attach behavior factually
  (read flow vs edit flow), no product pitching per memory #347.
- `docs/user/supported-editors.md` — fix matrix entries that were drafted
  based on incorrect Cursor-specific assumptions.
- `docs/user/troubleshooting.md` — binding-rebuild entry.
- `docs/validation/E2E_VALIDATION.md` — record the verified runs from
  2026-04-26 / 2026-04-27 with PASS notes (some entries currently say "TBD"
  or have notes that conflate the binding bug with platform behavior).

### Decision D: re-run B and D scenarios?

B (search nudge — non-empty pattern) and D (compact tracking reset). Now that
the binding bug is fixed, these would actually test the intended flows. Each
~5 min in fresh Cursor chat. Skipping is fine since core flows are validated.

### Decision E: ship 0.5.0 now or after additional testing?

After Decision A (loud error) lands + docs updated. Maybe after Decisions D
if you want extra coverage. Optional `npm deprecate aide-memory@"<0.5.0"`
after publish.

---

## 📚 Key memories to recall in next session

```
aide_recall({ids: [348, 345, 347, 346, 344, 343, 342, 341, 340, 336, 334]})
```

- **#348** — Binding mismatch root cause + fix priorities (THE problem)
- **#345** — Cursor auto-attach behavior (revised after #348)
- **#347** — No product pitching directive
- **#346** — No preemptive hype directive
- **#344** — Adversarial validation methodology
- **#343** — Original A1 fail diagnostic (now superseded by #348)
- **#342** — Test agent-facing path, not CLI
- **#341** — Fresh-session test isolation
- **#340** — Don't over-claim anti-pattern framing
- **#336** — C1 implementation summary + Cursor adapter translation maps
- **#334** — Pre-compaction state from earlier C1 planning

---

## 📍 Where to pick up

1. Read this doc end-to-end.
2. `aide_recall` the memory IDs above.
3. `git status` + `git log --oneline -6` to confirm branch state.
4. Decide on Decisions A–E above.
5. If A: implement the loud-error fix, run tests, update docs.
6. Restore the diagnostic shim/dispatcher per "Restoration steps" above.
7. New commit(s) on `feature/phase-1-cursor-support`.
8. C9 release flow when user greenlights.

---

*Session state: validation work effectively complete; one production-grade
fix (binding-mismatch reporting) recommended before ship. All critical
flows verified working in Cursor.*
