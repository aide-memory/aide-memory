# Phase 1 Follow-up: Auto-Inject Recall Mode (Option G)

**Status:** Deferred / design spec only. No code changes until explicit user greenlight.
**Parent:** `PHASE_0_1_SPEC.md` + hook visibility fast-follow (landed Apr 22 2026)
**Related memories:** #175 (UX priorities), #295 (IDB validation rigor), #310 (label platform-lock), #316 (fast-follow design), #319 (workflow)

---

## 1. Problem

AIDE's current pre-read-recall / pre-edit-recall hooks use a **two-step agent-driven recall pattern**:

1. Hook fires on Read/Edit → emits `{decision: "block", reason: "Call aide_recall({ids:[...]})"}`
2. Claude Code TUI renders the block with a **hardcoded `PreToolUse:Read hook returned blocking error` label** (per mem #310, hardcoded in TUI render logic — cannot be overridden by any JSON field)
3. Claude obeys the reason → calls `aide_recall` (visible tool invocation) → retries Read

The "blocking error" wording in step 2 is alarming on first encounter — users ask "is aide-memory broken?" The shipped hook-visibility fast-follow mitigates this with a user-facing `systemMessage` reassurance, but the alarming label itself persists because we can't change Claude Code's render.

## 2. Proposal

Offer an **alternative `recall.mode`** where the hook **queries SQLite directly and injects memory bodies as additionalContext** — bypassing the aide_recall tool call entirely. User-visible flow becomes:

```
⏺ Read src/api/routes.ts
  PreToolUse:Read says: aide-memory · injected 3 scoped memories inline
  ⎿  [file contents]
```

No block, no "blocking error" label, no extra tool call. Memory content is fed straight into Claude's context alongside the Read result.

## 3. Design

### 3.1 Config

New key in `scripts/hooks/defaults.json`:

```json
"recall.mode": {
  "value": "agent",
  "public": true,
  "pro": false,
  "description": "How scoped memories surface during Read/Edit. 'agent' (default) blocks the tool and prompts Claude to call aide_recall — keeps the recall tool call visible in the TUI. 'autoInject' queries the memory DB directly from the hook and injects memory bodies as additionalContext without blocking — cleaner UX but loses the visible aide_recall tool call. Switching modes does not migrate stored memories; same DB, different surface strategy."
}
```

Values:
- `"agent"` (default) — current behavior; Claude drives recall
- `"autoInject"` — hook queries DB, injects bodies directly

### 3.2 Hook behavior under `autoInject`

In `handlers.ts::preRead` / `preEdit`:

```ts
const mode = getSetting(projectRoot, 'recall.mode') ?? 'agent';

if (mode === 'autoInject') {
  // Query DB directly for scoped memories
  const store = new MemoryStore({ projectRoot });
  const memories = store.list({
    ids: result.scoped_ids.filter((id) => !recalledSet.has(String(id))),
  });
  store.close();

  if (memories.length === 0) return;

  // Format memories as inline context under a character budget
  const bodies = formatMemoriesForInject(memories, MAX_INJECT_CHARS_PER_HOOK);
  mergeTrackedIds(projectRoot, sessionId, memories.map((m) => String(m.id)));

  const visible = isVisible(projectRoot);
  const userMessage = visible
    ? `${BRAND}injected ${memories.length} scoped ${memories.length === 1 ? 'memory' : 'memories'} inline`
    : undefined;

  emitAdditionalContext('PreToolUse', bodies, userMessage);
  return;
}

// ... existing "agent" mode path follows ...
```

### 3.3 Payload budget + fallback

Claude Code caps hook additionalContext at **10,000 chars** (per mem #303 / docs). `formatMemoriesForInject` must respect this:

1. Sort memories by recency / relevance
2. Serialize each as `- [layer] [scope]: {what}\n  (why: {why})` — compact form
3. Accumulate until budget exhausted, then stop + mark as "truncated"
4. If even the first memory exceeds half the budget, **fall back to the `agent` mode** for this call (emit decision:block with aide_recall instruction) — keeps the safety net for very large recall sets

### 3.4 Tracking

autoInject still writes injected IDs to `recalled-ids-<session>.txt` so follow-up reads of sibling files in the same area don't redundantly inject. Same tracking file format, same read/write helpers — only the *source* of the IDs changes (hook-computed vs. post-aide_recall-parsed).

### 3.5 Error paths

If the MemoryStore query throws (corrupt DB, schema mismatch), log-and-fall-back-to-agent-mode. Hook must never break the agent turn.

## 4. Tradeoffs

| Dimension | agent (default) | autoInject |
|---|---|---|
| "blocking error" UI | Present every time hard-block fires | **Never** |
| Extra tool call visible to user | Yes (`⏺ aide_recall(...)`) | No |
| Claude "learns to use aide_recall" loop | Yes — reinforcement each block | Weaker — Claude doesn't initiate recall |
| Payload size budget | aide_recall can return pages; hook just points | Hard 10k char cap per hook fire |
| Hook latency | Minimal — just emits decision | Heavier — SQLite query + formatting |
| Fallback needed for large recalls | N/A | **Yes** — fall back to agent mode if payload exceeds budget |
| Migration risk | N/A (current) | Low — swap per user via config, no data migration |
| User agency | Claude controls which memories to pull | Hook controls; user less in the loop |

## 5. Validation plan (when shipped)

- **IDB-scenarios redux** (from `PHASE_0_1_VALIDATION_FOLLOWUPS.md`): run IDB-1 through IDB-9 under `recall.mode: autoInject` — all should PASS silently, no blocks, memories inlined
- **Large-recall fallback**: seed a project with 30+ memories scoped to one path, trigger a read, verify graceful fallback to agent mode with informative wording
- **Mode swap mid-session**: flip config, trigger a read, verify behavior changes on next hook fire (no restart required)
- **Parallel tool-use**: Claude calls `Read(a.ts), Read(b.ts)` in parallel under autoInject — verify both get inlined contexts without cross-contamination
- **Agent-driven comparison**: measure aide_recall invocation frequency in a long session under both modes — does agent mode maintain reinforcement? Is autoInject dropping the "Claude learns the tool" benefit meaningfully?

## 6. Implementation estimate

~1 day coding + 0.5-1 day validation. Code scope:
- Config schema + defaults entry (< 10 min)
- `formatMemoriesForInject` helper in `src/memory/hooks/` (2 hr)
- `preRead` + `preEdit` mode branching (1 hr)
- Fallback path + error handling (1 hr)
- Unit tests (budget cap, fallback, mode swap) — 2 hr
- Docs update (product vision, README, faq.mdx) — 1 hr

## 7. Decision points to confirm before implementation

1. **Is the "Claude learns aide_recall" reinforcement worth preserving?** Under autoInject, Claude never sees the aide_recall call pattern. For users who want transparency, agent mode stays default. For users who want cleanest UX, autoInject. Config picks the tradeoff.
2. **What's the budget per hook fire?** 10k is the platform cap but we may want to reserve room for other context — propose 8k budget as a default sub-cap with a config override (`recall.autoInject.maxChars`).
3. **Should autoInject also replace aide_search nudges?** Probably not — aide_search is a different use case (query-driven discovery). Keep pre-search-nudge as-is.
4. **Telemetry**: should autoInject emissions count as aide_recall usage for adoption metrics? Answering "is the agent using the tool?" gets muddier under autoInject because the tool isn't invoked.

## 8. Not in scope

- Changing aide_recall MCP tool itself (still useful for on-demand recall, cross-session recall, ID lookup, etc.)
- Replacing any other hook with auto-inject patterns (Stop, PreCompact, etc. are informational, don't map to the same problem)
- Migrating `.claude/rules/aide-memory.md` wording — the rules file describes both modes; the active config picks which one fires

## 9. Rollout

1. Ship with default `recall.mode: "agent"` — zero behavior change for existing users
2. Document in FAQ + quick-start with an opt-in recommendation for users who find the "blocking error" label jarring
3. Gather usage data over 2-3 releases before considering default swap (if ever)
4. File an Anthropic feature request for first-class "intentional block" label even if autoInject ships — agent mode is still useful and deserves softer platform UX
