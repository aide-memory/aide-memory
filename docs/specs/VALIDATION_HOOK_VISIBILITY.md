# Manual Validation Walkthrough — Hook Visibility Fast-Follow

> **Source-controlled copy** of the fixture walkthrough previously at
> `/tmp/aide-hook-viz-validation/README.md`. Preserved here so the scenarios
> survive fixture teardown. Cross-referenced from
> `docs/specs/PHASE_0_1_VALIDATION_FOLLOWUPS.md` (Validation Scenarios
> section). If you update scenarios, update both.

**Scope:** verifies the hook-visibility fast-follow shipped via PR #1 (merge
commit `d82c8fb` on `feature/phase-1`). Exercises systemMessage rendering,
self-track-on-fire, brand color, minScopeDepth default, and the
`hooks.visible` toggle.

**Cross-reference to letter/IDB scenarios:**

| Manual # | Letter / IDB mapping |
|---|---|
| 1 | **N** (SessionStart injection verification — remaining) |
| 2 | **IDB-1** (fresh file hard block) |
| 3a | **IDB-2** (silent on re-read after recall) |
| 3b | **F** (softening below threshold — already ✅ completed at project level; this manual variant forces via threshold=100 override) |
| 4 | **IDB-1 for Edit** (hard block on first edit) |
| 5 | **B** (Search — already ✅ completed; this re-verifies with visibility on) |
| 6 | **C** (Correction — already ✅ completed; re-verifies with systemMessage) |
| 7 | **L** (Multiple corrections in one session — remaining; this covers correction-pending branch) |
| 8 | **O** (Dynamic stop hook — remaining; covers schedule branch) |
| 10 | **IDB-10** (new — ids-only recall + same-file re-read + new mem → SOFT) |
| 11 | **IDB-11** (new — cross-file fresh hard-block after revert of scope-track) |
| 12 | **IDB-12** (new — minScopeDepth=1 flat-project compat) |
| 13 | **IDB-13** (new — minScopeDepth=2 opt-in strict) |
| 9 | NEW visibility-specific (not in earlier matrices — covers `hooks.visible: false` toggle) |

---

## Setup

The scenarios run against a scratch project wired at the canonical
`aide-memory init` flow. Setup script recreates the fixture from scratch
(idempotent):

```bash
bash /tmp/aide-hook-viz-validation/setup.sh
cd /tmp/aide-hook-viz-validation
claude
```

What setup does:
1. Rebuild feature-branch `dist/` (in case stale)
2. Reset `/tmp/aide-hook-viz-validation`, `git init`
3. Run `node <feature-branch>/dist/cli/aide-memory.js init` — generates
   `.mcp.json`, `.claude/settings.json`, `.claude/rules/aide-memory.md`,
   `.aide/config.json`, `.aide/config-reference.md`, `.gitignore`, `.ignore`.
   All paths point at feature-branch binary + scripts.
4. Override `memories.softening.threshold` to 5 (below the 8 seeded memories
   so hard-block paths fire with the small seeded set; default 10 would mask).
5. Seed 8 memories: 2 preferences + 2 guidelines (project-wide) + 2 technical
   scoped `src/api/**` + 2 area_context scoped `src/auth/**`.

First time Claude Code runs, approve each hook + MCP server when prompted.
Use `/permissions` to persist approvals session-wide.

**Note:** if the fixture is torn down (`rm -rf /tmp/aide-hook-viz-validation`),
`setup.sh` may not exist. In that case recreate the fixture by running
`aide-memory init` in a fresh scratch dir pointed at the feature-branch
binary, then seeding memories manually. The scenarios below stay valid;
only the `setup.sh` convenience script is missing.

---

## Scenarios

All scenarios run in the same session unless noted. Session-start fires on
launch; subsequent scenarios prompt Claude in order.

### Scenario 1 — SessionStart injection (implicit on launch)

**Trigger:** Launch `claude` in the fixture dir.

**Expected render** (near the top, before your first response):
```
SessionStart says: aide-memory · injected 4 memories at session start
```

**Why 4:** 2 preferences + 2 guidelines auto-inject at SessionStart. Scoped
technical/area_context memories surface via path hooks, not SessionStart.

---

### Scenario 2 — Pre-read HARD block (first read of a scoped file)

**Prompt:** `Read src/api/routes.ts`

**Expected render:**
```
⏺ Read src/api/routes.ts
  ⎿  PreToolUse:Read hook returned blocking error
     2 memories for /tmp/aide-hook-viz-validation/src/api/routes.ts not yet recalled. Call aide_recall({ids: [N,M]}).
  ⎿  PreToolUse:Read says: aide-memory · prompting aide_recall for scoped memories (expected flow)
```

Claude then calls `aide_recall(...)` and retries Read — both visible as tool
calls.

---

### Scenario 3a — Re-read (no-redundant-block)

**Prompt:** `Read src/api/routes.ts again`

**Expected render:** **SILENT** (no systemMessage, no block). All IDs were
tracked during Scenario 2's recall, so the hook stays out of the way. This
is correct — the "no redundant blocking" behavior prevents noise.

### Scenario 3b — Pre-read SOFT path (force with softening threshold)

The soft-path systemMessage (`aide-memory · prompting aide_recall for
scoped memories`, **without** the `(expected flow)` tail) only renders when
the hook emits `additionalContext` instead of `decision:block`. That
happens in two cases:
1. `memories.softening.threshold` > total memory count (forceSoft=true)
2. The file was encountered before AND has some uncovered scoped IDs

Easiest to demonstrate via path (1). Tell Claude:

```
run: aide-memory config memories.softening.threshold 100
```
(use the full node path if `aide-memory` isn't globally installed)

Then trigger a read of a DIFFERENT scoped file (so `encountered=false` and
we hit the pure forceSoft branch cleanly):

```
create src/api/orders.ts with a stub function, then read it
```

**Expected render on the read:**
```
⏺ Read src/api/orders.ts
  ⎿  [file contents]
  ⎿  PreToolUse:Read says: aide-memory · prompting aide_recall for scoped memories
```

No `(expected flow)` tail, no "blocking error" label. This is the pure
soft-inject — Claude gets additionalContext, you see the reassurance line,
tool runs normally.

**Reset the threshold afterward** so the rest of the scenarios work:
```
run: aide-memory config memories.softening.threshold 5
```

---

### Scenario 4 — Pre-edit HARD block (first edit of another scoped file)

**Prompt:**
```
Edit src/auth/token.ts — add a comment at the top explaining the module's purpose
```

**Expected render:**
```
⏺ Edit src/auth/token.ts
  ⎿  PreToolUse:Edit hook returned blocking error
     2 memories for /tmp/aide-hook-viz-validation/src/auth/token.ts not yet recalled. Call aide_recall({ids: [N,M]}).
  ⎿  PreToolUse:Edit says: aide-memory · prompting aide_recall for scoped memories (expected flow)
```

Claude recalls, then completes the edit.

---

### Scenario 5 — Pre-search nudge

**Prompt:** `Search the codebase for the word "token"`

**Expected render** (if Claude uses the Grep tool — may fall back to
Bash+grep on CC 2.1.118 where Grep is deferred; see `PHASE_0_1_VALIDATION_FOLLOWUPS.md` Bash-grep follow-up):
```
⏺ Grep "token"
  ⎿  [matches from files]
  ⎿  PreToolUse:Grep says: aide-memory · prompting aide_search for "token" — 3 matching memories
```

Claude may also call `aide_search` to pull memory contents.

---

### Scenario 6 — detect-correction (UserPromptSubmit)

**Prompt:** `no, use typescript enums instead of string literals for the status values`

**Expected render** (before Claude's reply):
```
UserPromptSubmit says: aide-memory · correction detected — prompting aide_remember
```

Claude then responds and, since the additionalContext told it to save,
calls `aide_remember`.

---

### Scenario 7 — Stop hook (correction-pending branch)

**Context:** fires when you end a turn that had a correction Claude didn't
actually save. If Claude saved via aide_remember in Scenario 6 (track-remember
clears the flag), this scenario is skipped.

**Force it:** submit a correction without giving Claude a chance to save:
```
no, scratch that — actually keep the string literals
```
Let Claude reply briefly, end the turn.

**Expected render at stop:**
```
⏺ Stop hook feedback:
  A correction from this turn wasn't stored. Call aide_remember (or aide_update
  if an existing memory needs revision) for it. Also: any decisions, technical
  constraints, preferences, or guidelines worth persisting? Same tools —
  aide_remember / aide_update for cross-session context, project docs for
  plans and decisions. If nothing, stop.
  Stop says: aide-memory · correction from this turn was not saved — prompting aide_remember
```

Note the reason text mentions `aide_update` alongside `aide_remember`.

---

### Scenario 8 — Stop hook (schedule branch)

**Context:** Stop fires on a schedule — by default every 3 turns for the
first 9 turns. After ~3 plain prompts (no corrections, no hard blocks),
the schedule branch fires.

**Prompts (three plain ones to run up the counter):**
```
what's 2 + 2?
tell me a fun fact about typescript
now a fun fact about sqlite
```

**Expected render on the turn the schedule fires:**
```
⏺ Stop hook feedback:
  Any decisions, technical constraints, preferences, or guidelines worth
  persisting? Call aide_remember (or aide_update if an existing memory needs
  revision) — cross-session context goes via these tools; plans and decisions
  go in project docs. If nothing, stop.
  Stop says: aide-memory · checkpoint — prompting aide_remember for anything critical (expected)
```

Note the `(expected)` tail on the systemMessage and the `aide_update`
mention in the reason.

---

### Scenario 10 — ids-only recall + re-read same file with new memory (IDB-10)

**Context:** verifies the self-track-on-fire fix (commit `b558f93`). Confirms
that when aide_recall is called with `{ids: [...]}` (the common case after
SessionStart injection populates some IDs), the file's path is still tracked
as "encountered" — so re-reading that same file after adding a new memory
goes SOFT, not HARD.

**Steps:**

1. After Scenario 2 fired (routes.ts hard-blocked and Claude called
   aide_recall), `file|routes.ts` is in `recalled-paths-<session>.txt` and
   IDs for the api scope are in `recalled-ids-<session>.txt`.

2. Add a new memory for `src/api/**` mid-session:
   ```
   run: aide-memory remember --layer technical --scope "src/api/**" --what "Mid-session test memory for IDB-10"
   ```

3. Re-read the same file: `Read src/api/routes.ts again`

**Expected render:**
```
⏺ Read src/api/routes.ts
  ⎿  [file contents]
  ⎿  PreToolUse:Read says: aide-memory · prompting aide_recall for scoped memories
```

SOFT path (`additionalContext` only, no "blocking error"). Because
`file|routes.ts` is already in tracking from Scenario 2's hook fire,
`encountered=true` → soft, even though the new memory is missing from
recalled-ids. No `(expected flow)` tail.

**Before the self-track fix:** this would have hard-blocked again because
the path wasn't tracked when aide_recall was called with ids. Now it goes
soft.

---

### Scenario 11 — ids-only recall + read DIFFERENT file in same scope (IDB-11)

**Context:** verifies the conservative "fresh file always hard-blocks"
semantic after the revert of scope-level encountered (commit `7cc56b8`).
Reading a sibling file in the same scope — never directly touched — should
HARD block even though aide_recall already returned memories covering that
scope.

**Steps:**

1. Assuming Scenario 10 just added a new memory and session tracking has
   `file|routes.ts` + recalled-ids for src/api/**.

2. Create a new file in the same scope:
   ```
   create src/api/orders.ts as a stub with a single export
   ```

3. Read it: `Read src/api/orders.ts`

**Expected render:**
```
⏺ Read src/api/orders.ts
  ⎿  PreToolUse:Read hook returned blocking error
     N memories for ... not yet recalled. Call aide_recall({ids: [...]}).
  ⎿  PreToolUse:Read says: aide-memory · prompting aide_recall for scoped memories (expected flow)
```

HARD block. Because `orders.ts` is a fresh path (never self-tracked before),
`encountered=false` → hard. This is the intentional conservative default:
fresh file = fresh enforcement, regardless of whether aide_recall covered its
scope via a sibling file.

---

### Scenario 12 — minScopeDepth=1 flat-project compat (IDB-12)

**Context:** verifies that with default `minScopeDepth=1`, broad scopes like
`src/**` still trigger per-file recall (supports Next.js `pages/**`,
SvelteKit `routes/**`-style flat projects — see memory #318).

**Steps:**

1. Add a memory with a broad single-segment scope:
   ```
   run: aide-memory remember --layer guidelines --scope "src/**" --what "IDB-12: broad-scope memory"
   ```

2. Read a fresh file NOT in any already-tracked path:
   ```
   Read src/auth/token.ts
   ```
   (assuming you haven't touched auth/** yet this session)

**Expected:** HARD block (token.ts has `src/auth/**` scoped memories + the
new `src/**` one). The `src/**` memory is INCLUDED at default minScopeDepth=1.

---

### Scenario 13 — minScopeDepth=2 opt-in strict (IDB-13)

**Steps:**

1. Bump the threshold:
   ```
   run: aide-memory config recall.minScopeDepth 2
   ```

2. Read a file in a scope covered by `src/**` only (no narrower scope):
   Create a dir with no seeded scoped mems (e.g., `src/utils/helpers.ts`)
   and read it.

**Expected:** SILENT. The `src/**` memory is excluded from per-file recall
at `minScopeDepth=2` (depth 1 < threshold). Scope-matching via 2-segment
scopes like `src/auth/**` still triggers as normal.

**Reset:**
```
run: aide-memory config recall.minScopeDepth 1
```

---

### Scenario 9 — hooks.visible = false (toggle test)

**Tell Claude to flip the config:**
```
run: aide-memory config hooks.visible false
```

Then repeat Scenario 2 or 4.

**Expected render:** The hook fires (block enforcement behavior unchanged)
but the `aide-memory · ...` line is GONE. Native Claude Code output
(blocking-error label, tool calls) still renders.

**Re-enable:**
```
run: aide-memory config hooks.visible true
```

---

## Pass criteria

- Scenarios 1, 6, 7, 8, 10 produce EXACTLY the expected `aide-memory · ...` lines
- Scenarios 2, 4, 11 produce the "blocking error" label AND the `(expected flow)` systemMessage underneath
- Scenario 3b produces the soft-path systemMessage (no `(expected flow)` tail)
- Scenario 5 produces the search systemMessage with the term + count (when Grep is used; Bash+grep fallback misses the hook — known Phase 1 follow-up)
- Scenario 3a is silent (no-redundant-block)
- Scenario 12 HARD blocks at minScopeDepth=1 for broad-scope memories
- Scenario 13 SILENT at minScopeDepth=2 for broad-scope-only files
- Scenario 9 flips visibility cleanly both directions

## Bonus quick checks

| Check | Command | Expected |
|---|---|---|
| CLI `list` subcommand | `aide-memory config list` | All 20 public settings printed with current + default + description |
| Reference file from init | `cat /tmp/aide-hook-viz-validation/.aide/config-reference.md` | 6KB markdown, every setting documented |

## Teardown

```bash
rm -rf /tmp/aide-hook-viz-validation
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| MCP tools missing (aide_recall / aide_remember etc. not found) | `.mcp.json` should exist at the fixture root — verify with `cat .mcp.json`. If Claude Code was running when fixture was created, kill and relaunch. |
| No systemMessage lines on any hook | `hooks.visible` got flipped off — run the Scenario 9 re-enable command |
| Hook returns `PreToolUse:Read hook error` (non-blocking error, red) | dist bundle is stale — re-run `bash /tmp/aide-hook-viz-validation/setup.sh` |
| "blocking error" label but no `aide-memory · ...` line | Claude Code version may be older than 2.1.117. systemMessage support is expected on recent versions. |
| Scenario 2 shows soft path instead of hard block | Softening threshold override missing — check `.aide/config.json` has `"memories": {"softening": {"threshold": 5}}`. Re-run `setup.sh`. |
| Grep tool not available / Claude falls back to Bash+grep | Known Phase 1 follow-up — Grep is deferred in Claude Code 2.1.118. See `PHASE_0_1_VALIDATION_FOLLOWUPS.md` Bash-grep fallback entry. |
