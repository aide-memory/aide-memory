---
name: Separate Model Thoughts
overview: Separate model's thinking/reasoning from the final answer, either by prompt changes or post-processing.
todos:
  - id: update-prompts
    content: Update SYSTEM_PROMPTS to use <thinking> tags instead of step-by-step output
    status: cancelled
  - id: response-parser
    content: Create responseParser.ts to extract thinking and answer
    status: cancelled
  - id: cli-display
    content: Update CLI to display thinking separately (optional/verbose)
    status: cancelled
  - id: web-display
    content: Update web UI with collapsible thinking section
    status: cancelled
---

# Separate Model Thoughts from Final Answer

## STATUS: REVERTED / ON HOLD

**Reason:** Implementing thinking tags caused significant degradation in answer quality with qwen3-coder:30b model.

---

## Problem (Original)

The model outputs its thinking/reasoning as part of the final answer because the system prompt says "Think step by step". This clutters the response.

---

## What We Tried (Option A: Thinking Tags)

### Implementation

1. Modified system prompts to ask model to wrap reasoning in `<thinking>...</thinking>` tags
2. Created `responseParser.ts` to extract thinking from answer
3. Updated CLI to show thinking in verbose mode only
4. Updated web UI with collapsible "Model Reasoning" section

### Result: FAILED

**Issues observed:**

1. **Model put all good analysis in thinking, left vague answer outside**

- Before: Model cited specific code (`.find`, closing logic, line numbers)
- After: Model said "I cannot provide specific citations because the complete implementation details are not visible"

2. **Even when made optional, answer quality degraded**

- The model interpreted "final answer should come after thinking" as "give a summary without details"
- Important context (code segments, file paths, line numbers) were moved to thinking section

3. **No retrieval logic was changed** - This was purely a prompt/formatting issue

---

## Lessons Learned

1. **Prompt changes affect output quality significantly** - Even seemingly minor wording changes can cause the model to interpret instructions differently

2. **"Think step by step" works well as-is** - The current prompts produce good results with detailed code citations; the "thinking" in the output IS the value

3. **Separation may not be needed** - The verbose logs already capture tool calls and exploration. The "thinking" in the answer is actually the structured analysis the user wants to see.

4. **Model-specific behavior** - qwen3-coder:30b may not handle thinking tags well; other models might behave differently

---

## Alternative Approaches (For Future)

### Option B: Post-Process with Heuristics (No Prompt Changes)

Instead of asking model to use tags, detect and extract thinking patterns:

- Look for numbered lists at start of response
- Look for phrases like "Let me", "First I'll", "Based on", "Looking at"
- Extract these as "thinking" without changing the prompt

**Pros:** Doesn't change model behavior
**Cons:** Heuristics may be fragile

### Option C: Model with Native Thinking Support

Some models (Claude, o1) have native thinking/reasoning separation. If AIDE supports such models in the future, this could be revisited.

---

## Files Changed (REVERTED)

All changes were reverted. The codebase is back to the original state:

- `src/context/types.ts` - System prompts unchanged
- `src/context/responseParser.ts` - Deleted
- `src/cli/repl.ts` - No parsing
- `src/cli/commands/ask.ts` - No parsing  
- `src/web/server.ts` - No parsing
- `web/src/App.tsx` - No thinking section
- `web/src/styles.css` - No thinking styles
- `src/brain/types.ts` - No hasThinking field