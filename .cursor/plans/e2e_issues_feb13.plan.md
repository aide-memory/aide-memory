---
name: ''
overview: ''
todos: []
isProject: false
---

# E2E Test Results & Issues — Feb 13, 2026

## Test Configuration

- **Q1 (bug report):** "When I click on a verbose log, it scrolls me all the way to the bottom of the list unexpectedly"
- **Combos tested:**
  - Combo A: reasoning=gpt-5.2 + context=qwen3-coder:30b (hybrid)
  - Combo B: reasoning=qwen3-coder:30b + context=qwen3-coder:30b (local-only)
  - Combo C: reasoning=gpt-5.2 + context=gpt-5.2 (cloud-only)
- **Strategy:** graph
- All three combos produced correct answers pointing to `web/src/App.tsx` `useEffect` + `scrollIntoView`

## Summary

| Combo        | Iters | Tool Calls | Tokens (in/out) | Time | Answer Quality                               |
| ------------ | ----- | ---------- | --------------- | ---- | -------------------------------------------- |
| A: GPT+Qwen  | 1     | 7          | 21491/745       | 43s  | Good — concise, accurate, 2 fix options      |
| B: Qwen+Qwen | 2     | 4          | 19204/1092      | 47s  | Poor — 4 contradictory suggestions, rambling |
| C: GPT+GPT   | 2     | 7          | 17579/639       | 12s  | Excellent — precise, well-structured         |

---

## Issues Found

### Issue 1 — CRITICAL: Out-of-bounds relevantIndices after consolidation

**Observed in:** Combo A (GPT+Qwen), Combo B (Qwen+Qwen)

After consolidation, 4 semantic_search results merge into 1 consolidated result `[0]` containing 16 sub-chunks. The context model treats the sub-chunks as separate results and returns indices like `[4,5,6,7]` (targeting the App.tsx sub-chunks within the consolidated blob), but only index `[0]` is valid.

**Log evidence (Combo A):**

```
[aide:warn] [orchestrator] All 4 relevantIndices were out of bounds (max 3). Keeping all results as fallback.
```

**Root cause:** The consolidated result format presents sub-chunks with dashes and scores that look like separate items:

```
[0] semantic_search({"query":"(consolidated)","_consolidatedFrom":4})
- src/cli/repl.ts:269-293 (score: 0.635)    ← model thinks this is index 0
  ...
- web/src/App.tsx:18-33 (score: 0.661)       ← model thinks this is index 4
- web/src/App.tsx:157-174 (score: 0.678)     ← model thinks this is index 5
- web/src/App.tsx:762-797 (score: 0.733)     ← model thinks this is index 6
- web/src/App.tsx:827-841 (score: 0.640)     ← model thinks this is index 7
```

**Impact:** Context model cannot properly filter results. The fallback "keep all" preserves correctness but defeats the purpose of evaluation — all noise stays in the context.

**Fix options:**

- A) Number sub-chunks within consolidated results (e.g. `[0.0]`, `[0.1]`, ...) and support compound indices in `report_evaluation`
- B) Don't consolidate for evaluation — present individual search results with sequential indices `[0]`, `[1]`, ... and consolidate _after_ filtering
- C) (Simplest) Don't consolidate at all; just dedup overlapping ranges but keep separate result entries

[ ] Fix needed

---

### Issue 2 — MEDIUM: Self-referencing search pollution

**Observed in:** All combos

aide indexes its own source code. Search results include chunks from `src/orchestration/prompts.ts` which contain raw template literals and prompt instructions:

```
- src/orchestration/prompts.ts:231-248 (score: 0.536)
## How to Respond
1. Call `report_evaluation` with your assessment:
   - `relevantIndices`: array of indices (0-${totalResults - 1}) to KEEP
```

**Impact:**

- The model sees **two** sets of `How to Respond` instructions — the real one and the one embedded in search results
- Raw `${totalResults - 1}` template string appears as literal text, conflicting with the properly interpolated range `(0-0)` in the real prompt
- Wastes context window with noise from aide's own internals

**Fix options:**

- A) Add aide's `src/orchestration/` and `src/` dirs to a default search exclusion list when querying aide's own project
- B) Strip/detect results whose content matches the evaluation prompt structure
- C) Lower score threshold to filter out marginal results (many noise chunks score 0.52-0.55)

[ ] Fix needed

---

### Issue 3 — MEDIUM: Low search precision, too many irrelevant results

**Observed in:** All combos (Combo A most visible)

Of the 16 chunks in the consolidated result, only 4 were from the relevant file (`web/src/App.tsx`). The other 12 chunks were noise:

- `src/cli/repl.ts` — CLI readline interface (irrelevant)
- `src/cli/commands/init.ts` — indexing (irrelevant)
- `src/cli/commands/watch.ts` — file watcher (irrelevant)
- `src/core/tokenBudget.ts` — budget math (irrelevant)
- `src/orchestration/prompts.ts` — prompt templates (self-ref noise)
- `src/orchestration/orchestrator.ts` — verbose logger interface (tangentially related)

Many low-score results (0.528–0.550) add no value. The highest-scoring chunk (0.733) was the relevant verbose log panel from App.tsx.

**Impact:** Context window filled with noise, evaluation model has to sift through irrelevant code, higher token costs.

**Fix options:**

- A) Raise minimum score threshold from current level to ~0.6 for graph strategy
- B) Apply adaptive thresholding — drop results whose score is significantly below the top result
- C) Limit chunks-per-consolidated-result and prefer higher-scoring ones
- D) Cap number of results returned per `semantic_search` call based on score dropoff

[ ] Fix needed

---

### Issue 4 — LOW: Missing critical code in initial search results

**Observed in:** Combo A (GPT+Qwen), required reasoning loop-back

The critical `useEffect` + `scrollIntoView` code at `web/src/App.tsx:432-434` was **not** found by any of the 4 initial semantic searches:

```
semantic_search {"query":"verbose log click scrolls to bottom of list","topK":8}
semantic_search {"query":"scrollIntoView bottom log list on click expand verbose","topK":8}
semantic_search {"query":"log row click handler expand/collapse verbose details","topK":8}
semantic_search {"query":"virtualized list auto scroll to bottom when item height changes expanded","topK":8}
```

The reasoning model (GPT-5.2) had to loop-back with:

```
find_symbol {"query":"scrollIntoView","kinds":"function,method,variable"}
read_lines {"filePath":"web/src/App.tsx","startLine":730,"endLine":860}
```

**Note:** This is the loop-back mechanism working correctly — it shows the reasoning model can recover from incomplete search results. But ideally the initial search should have found the `useEffect` with `scrollIntoView`.

**Possible cause:** The `useEffect` block is very short (3 lines) and may not score high enough in semantic search. Keyword search might work better for exact API names.

[ ] Monitor — loop-back compensates

---

### Issue 5 — LOW: Qwen reasoning produces rambling, contradictory answers

**Observed in:** Combo B (Qwen+Qwen)

The answer from Qwen as reasoning model contained **4 sequential contradictory code suggestions**:

1. "Only scroll if this is the first time the log is expanded" (with expandedRef)
2. "should modify the logic to not scroll at all when the user interacts" (same code, different framing)
3. "here's the correct fix:" (same code again)
4. "the cleanest solution is to remove the automatic scrolling entirely" (contradicts all previous)

The final answer essentially said "delete the effect" after 3 more nuanced (and correct) attempts.

**Contrast with GPT-5.2:** Clean, single-pass answer with Option A (recommended) and Option B (alternative), no contradictions.

**Impact:** User confusion, loss of trust in the tool.

**Fix options:**

- A) Add "give ONE clear recommendation" instruction to the answering prompt
- B) Add max output length guidance to discourage over-generation
- C) Accept as model quality difference — document in model recommendations

[ ] Quality improvement opportunity

---

### Issue 6 — INFO: System prompt bloat in answering phase

**Observed in:** Combo A

The answering model's system prompt was **15,572–26,279 chars** (lines 395, 900). This includes:

- Full curated context with all kept results
- aide's own source code as embedded context (due to self-referencing)
- Multiple verbose log template strings from orchestrator.ts source

After the reasoning loop-back, the system prompt grew from 15K to 26K chars because the additional `read_lines` and `find_symbol` results were appended.

**Impact:** Higher token costs, approaching context window limits for smaller models.

**Fix options:**

- A) Compress/summarize context between iterations
- B) Limit total context size with priority-based trimming
- C) Remove self-referencing noise (see Issue 2) to reduce baseline

[ ] Monitor

---

## What Worked Well

1. **Reasoning loop-back** — GPT-5.2 correctly identified missing context and requested targeted `read_lines` + `find_symbol` calls
2. **followUpCalls parameter** — Qwen successfully used the nested `followUpCalls` parameter inside `report_evaluation` (Issue from previous session now fixed)
3. **Answer quality (GPT)** — Both GPT+Qwen and GPT+GPT combos produced excellent, actionable answers
4. **Speed** — GPT+GPT combo completed in 12s total
5. **Out-of-bounds fallback** — The safety net "keep all results" preserved correctness even when indices were wrong
6. **Result consolidation** — Successfully merged 4 search results into 1 and deduped 28→16 chunks

## Recommended Priority

1. **Issue 1** (out-of-bounds indices) — Fix first, highest impact on evaluation quality
2. **Issue 3** (search precision) — Fix second, reduces noise and token costs
3. **Issue 2** (self-referencing) — Fix third, cleans up context
4. **Issue 5** (Qwen rambling) — Prompt tweak, low effort
5. **Issues 4, 6** — Monitor, not blocking
