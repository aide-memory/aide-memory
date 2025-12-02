# **AIDE V0 Evaluation Plan**

_How we determine whether the V0 “project brain” meaningfully improves code understanding_

---

## **Purpose**

V0 is a **retrieval experiment**, not a “beat Cursor Opus” experiment.

This evaluation answers two questions:

1. **Does the AIDE project brain (symbols + relations + traversal) give more accurate, structured, and consistent context than naive top-k retrieval?**
2. **Given the same model, does AIDE provide better code-specific reasoning than Cursor (or similar tools)?**

---

# **Track A — AIDE Project Brain vs Naive Retrieval**

_Goal: Is the graph-driven Project Brain better than vanilla top-k?_

---

## **A.1 Setup**

- **Repo:** AIDE repo (or any medium/large TS project)
- **Model:** Use the _same_ model for both modes (e.g. `qwen3-coder:30b` or any cloud model)
- **Retrieval modes:**
  1. **Brain mode:** V0 graph-based traversal (`GraphTraversalStrategy`)
  2. **Naive mode:** baseline top-k retrieval (`NaiveRetrievalStrategy`)

Naive mode = match by filename + substring (embeddings optional).

---

## **A.2 Probe Questions**

Use architecture-level questions:

1. **“Where is the main retrieval pipeline implemented?”**
2. **“What runs when I call `aide init`?”**
3. **“Where are CALLS/IMPORTS relations extracted and stored?”**
4. **“Where is session persistence handled?”**
5. **“If I change `graphTraversal`, what breaks?”**
6. **“Where are notes stored and how are they used?”**
7. **“How does reindexing detect file changes?”**
8. **“Where is the LLM prompt constructed?”**
9. **“Where is ContextAssembler used?”**
10. **“Which tests cover retrieval logic?”** (optional)

For each question, create a **Gold Answer Set** = the 3–7 symbols/files that _must_ be retrieved.

---

## **A.3 Scoring Scheme (0–2 each)**

For each question & mode:

### **1. Context Recall (0–2)**

- **0:** misses several gold symbols
- **1:** partially correct
- **2:** retrieves all/most gold items

### **2. Context Precision (0–2)**

- **0:** lots of irrelevant files
- **1:** some noise
- **2:** mostly clean

### **3. Answer Quality (0–2)**

- **0:** wrong/vague
- **1:** partly right
- **2:** clear, references correct files/functions

Total per question: **0–6**  
Total per mode: **sum across all questions**

---

## **A.4 What Success Looks Like**

AIDE V0 is successful if:

- **Brain mode > Naive mode** on recall
- **Brain mode ≥ Naive mode** on precision
- Answers reference **more correct code**
- Retrieval is **more deterministic**

If naive mode performs equally → fix relation extraction/traversal.

---

# **Track B — Same Model: AIDE vs Cursor**

_Goal: Does AIDE’s structured retrieval help even when using the same model?_

---

## **B.1 Setup**

- Repo: same as Track A
- **Pick one cloud model** both tools can use:
  - `gpt-4.1`
  - or `claude-3.5-sonnet`
- Use same model via:
  - Cursor settings
  - AIDE’s ModelRuntime

---

## **B.2 Procedure**

For each of 5–6 questions:

1. Ask in **Cursor**:

   - without pinned files
   - optionally with pinned files (realistic use)

2. Ask in **AIDE**:
   - using `graphTraversal`
   - same model

Record:

- what files/functions each tool references
- where each tool is correct/incorrect
- how they handle follow-ups (“what tests cover that?”)

---

## **B.3 Qualitative Notes (instead of scores)**

For each question capture:

### **Coverage**

- Did each tool mention all gold files/functions?

### **Structure**

- AIDE: grouped context (callers/callees/tests/configs)
- Cursor: free-form reasoning

### **Noise**

- Did either tool bring in irrelevant code?

### **Consistency**

- Do rephrased questions yield stable context?

---

## **B.4 What Success Looks Like**

AIDE doesn’t need to beat Cursor. It needs to show:

- **more deterministic retrieval**
- **cleaner, more inspectable context**
- **more consistent follow-up answers**
- **less wandering**

This validates the project-brain architecture.

---

# **Track C — Optional: Local Model Comparison**

Compare:

- **AIDE + Qwen3-coder:30b**  
  vs
- **Cursor + same local model (if supported)**

Purpose:  
Test whether AIDE’s retrieval lets weaker local models perform more competitively.

---

# **Conclusion**

V0 is a success if:

- The **Project Brain** outperforms naive retrieval
- AIDE + same model feels **more structured, more consistent** than Cursor
- Retrieval quality and context stability clearly improve with the V0 design

If not, iterate on:

- relation extraction
- traversal strategy
- symbol detection  
  before moving to V1.

---
