---
name: Tool Quality and Prompt Refinement
overview: Holistic redesign of the tool set for both graph and semantic retrieval -- maximize speed, minimize tokens, maximize accuracy (STA). Fix broken tools, add file outline, redesign conversation context to mirror code context (search -> read segment -> full), give context model full visibility of accumulated results, fix context model failing to act on insufficient=false, improve verbose logging clarity, clean up prompts, try Ollama native tools, verify E2E.
todos:
  - id: redesign-tools
    content: 'Redesign shared tools: rename search to find_symbol (pattern-based), add read_file_outline, move read_lines to shared, add list_files to both. Add relationKind filter to get_references/get_dependencies. Fix FTS5. Test each handler.'
    status: pending
  - id: fix-semantic-tools
    content: 'Fix semantic-only tools: implement filesystem-based handlers for read_file, read_lines, read_file_outline, list_files when graph is null. Test each handler without graph.'
    status: pending
  - id: convo-tools
    content: 'Conversation context redesign: exchange-based indexing, two embeddings per exchange, search_conversation (semantic entry points), read_conversation (exchange range), get_full_conversation. Embed after every prompt + backfill on session start (not project init). Test embedding generation, search accuracy, and drill-down.'
    status: pending
  - id: ctx-full-visibility
    content: 'Context model full visibility: show ALL accumulated results (full content) each iteration. Sequential indices across Previously Kept and New sections. Model keeps/strips/consolidates all. Rebuild state.relevantResults after each eval. Safety-net dedup at end. Test with multi-iteration scenario.'
    status: pending
  - id: ctx-model-enforce
    content: 'Fix context model sufficient=false with no tool calls: (A) add followUpCalls to report_evaluation schema (cloud) and JSON format (Ollama), (B) orchestrator re-prompt fallback. Test both paths.'
    status: pending
  - id: verbose-logging
    content: 'Improve verbose logging: [Iter N] global iteration, Reasoning #N call count, Context #N call count, Executing label for code, summary at end with totals. Test log output readability.'
    status: pending
  - id: clean-prompts
    content: 'Clean up all prompts: generic anti-hedging, neutral sufficiency guidance, tool usage flow guidance, topK guidance, context model enforcement language. Test prompt changes with sample queries.'
    status: pending
  - id: ollama-native
    content: 'Try Ollama native tool calling: flip supportsNativeTools() to true, test with qwen3-coder:30b. Revert if quality drops.'
    status: pending
  - id: verify-fail-fast
    content: 'Verify fail-fast model creation: missing API key, Ollama not running, invalid model name all produce clear errors and stop. Quick smoke test.'
    status: pending
  - id: simulate-tools
    content: 'Simulate tool calls for different query types (bug report, feature question, follow-up) to verify STA before model interaction.'
    status: pending
  - id: test-e2e
    content: 'E2E testing: graph + semantic strategies, with qwen3-coder:30b and gpt-5.2, verify context accuracy, dedup quality, answer quality.'
    status: pending
isProject: false
---

# Tool Quality and Prompt Refinement (v4)

Goal: **Maximize Speed, minimize Tokens, maximize Accuracy (STA)**

**Cross-cutting concerns:**
- **Parallel tool execution:** Batch tool calls within an iteration MUST execute in parallel (`Promise.all`) since they don't depend on each other. Verify current behavior in `toolExecutor.ts` and fix if sequential.
- **Standardized tool output format:** All tool results should follow a consistent format for easier context model evaluation. Each result should clearly show: file path, line range, and content.
- **Embedding model:** Upgraded default from `all-minilm:latest` (384-dim) to `nomic-embed-text` (768-dim, better quality for code). Cloud alternative: `text-embedding-3-small` (OpenAI, 1536-dim). Configured in `AIDE_DEFAULTS.models.embedding`.
- **Token budget:** `tokenBudget.ts` stays active with a high limit (tracking, not blocking). Context window overflow is not a concern -- effective tool calls keep context lean, and cloud models handle larger prompts.
- **Duplicate call prevention:** Already exists via `previousCalls` in orchestrator. No additional caching needed.

---

## 1. Redesigned Tool Sets

### Shared tools (available in BOTH graph and semantic strategies)

- **`semantic_search`** -- Find entry points by meaning. Returns file paths + line ranges + code snippets + similarity scores. Primary entry point tool. topK: model decides with prompt guidance (4-6 focused, 6-8 broader, 8-12 survey).

- **`read_file_outline`** -- See file structure without reading full content. Returns symbol list (kind, name, line range). Graph mode uses `graph.getSymbolsForFile()`. No-graph (semantic) mode uses Tree-sitter directly (`web-tree-sitter` + `tree-sitter-javascript` + `tree-sitter-typescript` are project dependencies, with `treeSitterAnalyzer.ts` already providing the parsing infra). Low token cost. (Note: streaming file content to models is not feasible -- LLMs require full input before processing. This tool + `read_lines` is the alternative.)

- **`read_lines`** -- Read specific line range from a file. Works via filesystem (no graph needed). Primary drill-down tool after entry points. Model uses line ranges from `semantic_search` results directly.

- **`read_file`** -- Read full file content. For small files or when full context is necessary. Works via filesystem, enriched with symbol info when graph is available.

- **`list_files`** -- List files in a directory. Both strategies. Graph mode: `graph.findFiles()`. No-graph: `fs.readdirSync` with configurable depth.

- **`done`** -- Signal sufficient context gathered.

### Graph-only tools

- **`find_symbol`** (renamed from `search`) -- Pattern matching via `LIKE '%query%'` + FTS5 content search with fixed multi-word handling. Not exact match. Tool description: "Find symbols by name pattern. Also searches code content."

- **`get_symbol_detail`** (renamed from `get_symbol_context`) -- Full code for a symbol by ID.

- **`get_references`** (renamed from `get_callers`) -- What calls/references a symbol. **NEW: `relationKind` filter parameter.** Supports: CALLS (default), IMPORTS, EXTENDS, IMPLEMENTS, TESTS. Enables "what imports this?", "what tests this?", "what implements this interface?"

- **`get_dependencies`** (renamed from `get_callees`) -- What a symbol calls/references. **NEW: `relationKind` filter parameter.** Same filter options as `get_references`.

**Graph strategy flow (drill-down after semantic entry points):**
```
semantic_search (entry points)
  -> find_symbol (precise symbol by name pattern)
  -> get_symbol_detail (full code for that symbol)
  -> get_references / get_dependencies (navigate: calls, imports, tests, extends)
  -> read_lines (read specific code ranges)
```

**Why graph adds value over semantic-only:** After finding entry points, the graph provides exact symbol lookup, structural relationship traversal (call chains, imports, test coverage), and symbol metadata -- none of which semantic search can provide. The `relationKind` filter unlocks IMPORTS/EXTENDS/IMPLEMENTS/TESTS relations that were stored in the graph but never exposed to tools.

### Conversation tools (added when history exists)

Mirrors the code context pattern: **entry points -> drill-down -> full context**.

Conversation is indexed by **exchanges** (not individual messages). Each exchange = one user prompt + one assistant response as a pair:
- Exchange 0: { user: "When I click verbose log...", assistant: "The issue is the useEffect..." }
- Exchange 1: { user: "Show me how to fix it", assistant: "Here's the fix..." }

- **`search_conversation`** -- Semantic search over conversation history. Each exchange has TWO embeddings (one for user message, one for assistant message), stored separately but tagged with the same exchange index. Returns top-K matches with: `exchangeIndex`, `matchedRole` (user or assistant), `score`, `preview` (~200 chars of matching message). Results deduplicated by exchange index (max score per exchange across both embeddings). A single search handles cross-reference queries like "didn't I mention X and you said Y."

- **`read_conversation`** (**NEW**) -- Read a range of exchanges by index. Parameters: `startExchange`, `endExchange`. Returns full content of each exchange (user + assistant). Like `read_lines` for conversations.

- **`get_full_conversation`** (**NEW**) -- Returns the entire conversation history (all exchanges). Fallback when model needs the whole picture. Higher token cost; model should prefer `search_conversation` + `read_conversation`.

**Removed:** `get_conversation_history` (replaced by `get_full_conversation`), old keyword-based `search_conversation`.

**Embedding strategy:** Two embeddings per exchange (user and assistant separately). More accurate than concatenating -- "what fix did you propose?" matches the assistant message precisely, while "what did I ask about?" matches the user message. Storage: ~1536 bytes per exchange (768-dim `nomic-embed-text` vectors, 2 per exchange).

**Flow parallel:**

```
Code:  semantic_search -> read_file_outline / read_lines -> read_file (if needed)
Convo: search_conversation -> read_conversation -> get_full_conversation (if needed)
```

### Section 1 Testing

- Call each shared tool handler directly (no model) and verify output format/quality
- Test `find_symbol` with pattern queries vs old exact match -- confirm broader matches
- Test `read_file_outline` in both graph mode and no-graph mode (Tree-sitter -- always available for JS/TS/Python)
- Test `read_lines` with various ranges including edge cases (start=1, end=last line, single line)
- Test `list_files` in both graph and filesystem modes
- Test `get_references` with `relationKind: "CALLS"` -- verify same behavior as before
- Test `get_references` with `relationKind: "IMPORTS"` -- verify it returns import relationships
- Test `get_references` with `relationKind: "TESTS"` -- verify it finds test files for a symbol
- Test `get_dependencies` with various relation kinds
- Verify all tool definitions have clear descriptions that guide the model
- NOTE: Conversation tools (`search_conversation`, `read_conversation`, `get_full_conversation`) depend on the embedding system in Section 2. Test them together after Section 2 is implemented -- see Section 2 Testing.

---

## 2. Conversation Embedding System

**When embeddings are generated:**

- **On session start** (via `aide ask`, `aide` repl, web server -- NOT `aide init`): If the current session has existing messages without embeddings, backfill them. This happens when aide starts any interactive mode, not during project initialization (no conversations exist at init time).
- **After every prompt:** Embed both the new user message AND the assistant response as two separate embeddings for the exchange, tagged with the exchange index. This runs after the answer is returned (non-blocking, in background).
- No verbose logs or tool call details are embedded -- only user and assistant messages (the actual dialogue).

**Storage:** `conversation_embeddings` table in SQLite:

- `session_id`, `exchange_index`, `role` ('user' or 'assistant'), `embedding` (BLOB, 768-dim for `nomic-embed-text`), `content_hash` (to detect changes)
- Two rows per exchange (one for user embedding, one for assistant embedding)

**Search:** `search_conversation` handler embeds the query via the embedding model, computes cosine similarity against all stored message embeddings for the session (both user and assistant embeddings). Results are deduplicated by exchange index (max score per exchange across both embeddings). Returns top-K sorted by relevancy score (with recency as tiebreaker for equal scores). Each result includes `exchangeIndex`, `matchedRole` (which embedding matched best), `score`, and `preview`.

**Files to modify:** [src/session/sessionManager.ts](src/session/sessionManager.ts), [src/brain/sqliteStore.ts](src/brain/sqliteStore.ts), [src/orchestration/toolExecutor.ts](src/orchestration/toolExecutor.ts)

### Section 2 Testing (includes conversation tool handlers from Section 1)

**Embedding layer:**
- Create a test session with 5+ exchanges, generate embeddings, verify 2 rows per exchange in SQLite
- Test backfill: create session with messages but no embeddings, start session, verify embeddings generated
- Test content_hash: modify a message, verify embedding is regenerated
- Verify embeddings are generated after each prompt (user + assistant), not on `aide init`

**Conversation tool handlers (depend on embedding layer above):**
- `search_conversation`: search with a query referencing the user's question -- verify it matches the user embedding
- `search_conversation`: search with a query referencing the assistant's answer -- verify it matches the assistant embedding
- `search_conversation`: cross-reference query ("didn't I mention X and you said Y") -- verify correct exchange returned, deduped by exchange index
- `read_conversation(startExchange: N, endExchange: N)`: verify full exchange (user + assistant) returned
- `read_conversation(startExchange: 0, endExchange: 3)`: verify range of exchanges returned
- `get_full_conversation`: verify all exchanges returned in order

---

## 3. Context Model Full Visibility + Deduplication

**Problem:** Currently the context model ONLY sees the current iteration's tool call results. It has zero visibility into results kept from previous iterations. This means:
- It cannot determine if accumulated context is truly sufficient
- It cannot detect duplicates across iterations
- It cannot consolidate overlapping results
- Sufficiency decisions are based on incomplete information

**Redesigned approach: Context model sees ALL accumulated results (full content) each iteration.**

### How it works

Each iteration, the context eval prompt includes ALL results with sequential indices across both sections:

```
## All Results to Evaluate

### Previously Kept
[0] semantic_search({"query":"verbose log click"})
  [full content]
[1] get_file_content({"filePath":"web/src/App.tsx"})
  [full content]

### New This Iteration
[2] search({"query":"scrollIntoView"})
  [full content]
[3] search({"query":"verboseEndRef"})
  [full content]
```

Indices are one continuous sequence (0, 1, 2, 3...). Section headers ("Previously Kept" / "New This Iteration") tell the model which are old vs new. `report_evaluation` uses a single `keepIndices: [0, 2, 3]` and `stripIndices: [{index: 1, reason: "superseded by [2]"}]`. No separate fields, no string labels, no ambiguity.

The context model evaluates ALL results together and can:
1. **Keep** relevant results (from both old and new)
2. **Strip** irrelevant results -- including previously kept ones now superseded by better new results
3. **Consolidate** overlapping results -- "[1] has App.tsx:1-200 and [2] has App.tsx:428-434. Both non-overlapping, keep both. But [0]'s snippet is already inside [1], strip [0]."
4. **Determine sufficiency** based on the FULL picture -- "Combined, I have toggleLogExpand AND the useEffect. That's enough."

After each evaluation, `state.relevantResults` is **rebuilt from scratch** based on what the model decided to keep. This naturally deduplicates because the model sees everything and actively consolidates.

**Progressive refinement:** In iteration 1, model might keep a broad file overview. In iteration 2, after getting specific search results, it strips the broad overview and keeps only targeted snippets. Accumulated context gets MORE focused over iterations, not less.

### Implementation

**File:** [src/orchestration/orchestrator.ts](src/orchestration/orchestrator.ts)

1. Before calling `evaluateWithContextModel`, format `state.relevantResults` as "Previously Kept Context" with full content and `[Kept-N]` labels
2. Pass both accumulated + new results to `buildContextEvaluationPrompt`
3. `report_evaluation` response includes indices for BOTH `[Kept-N]` and `[Result N]` items
4. After evaluation, rebuild `state.relevantResults` from scratch (only the items the model kept)
5. Items the model stripped (from either old or new) go to `state.strippedSummaries`

**File:** [src/orchestration/prompts.ts](src/orchestration/prompts.ts)

Update `buildContextEvaluationPrompt` to accept accumulated results and format the two-section prompt (previously kept + new results).

### Safety-net dedup (post-processing)

After all iterations, before `formatResultsAsContext()`, a simple post-processing step merges any remaining overlapping line ranges the model didn't catch:
- Group by file path, union overlapping ranges
- Non-overlapping ranges kept as separate results
- ~20 lines of code, minimal complexity

### Token cost

Bounded by `maxIterations` (5) and active stripping each iteration. In practice accumulated context is unlikely to exceed 10-15K chars. Each iteration's stripping/consolidation keeps it lean. Net effect: more tokens per context eval, but fewer iterations and tighter final context.

### Section 3 Testing

- Simulate a multi-iteration scenario: iteration 1 returns App.tsx:1-200, iteration 2 returns App.tsx:428-434. Verify context model sees both and can consolidate.
- Verify `state.relevantResults` is rebuilt from scratch (not just appended) after each eval
- Verify previously kept results can be stripped if superseded by new results
- Verify the `[Kept-N]` / `[Result N]` indexing in `report_evaluation` response works correctly
- Test safety-net dedup: manually create overlapping results, verify they merge correctly
- Measure token cost: compare old approach (current batch only) vs new approach (full visibility) for a 3-iteration scenario

---

## 4. Context Model Enforcement (Fix: `sufficient=false` with no tool calls)

**Problem:** Terminal 16, iteration 2 -- context model said `sufficient=false` with a good reason ("need the missing portion of the file") but called ZERO follow-up tools. The orchestrator broke out of the loop because `newToolCalls.length === 0`.

**Two complementary fixes:**

### Fix A: Bake `followUpCalls` into `report_evaluation` tool schema

Instead of requiring the model to call `report_evaluation` AND separate tools in the same response (which it failed to do), embed follow-up calls directly in the `report_evaluation` tool:

```typescript
const EVALUATION_TOOL: ToolDefinition = {
  name: 'report_evaluation',
  description: 'Report your evaluation. If sufficient=false, you MUST include followUpCalls.',
  parameters: {
    sufficient: { type: 'boolean' },
    relevantIndices: { type: 'array', items: { type: 'number' } },
    strippedIndices: { type: 'array', items: { ... } },
    followUpCalls: {
      type: 'array',
      description: 'REQUIRED when sufficient=false. Tool calls to make next.',
      items: { type: 'object', properties: { name: { type: 'string' }, arguments: { type: 'object' } } }
    }
  }
};
```

This applies to BOTH provider paths:
- **Cloud (native tools):** `followUpCalls` is a param in the `report_evaluation` tool call. Orchestrator extracts it from tool call arguments.
- **Ollama (JSON output):** `followUpCalls` replaces `newToolCalls` in the JSON output format. Same field name for consistency.

### Fix B: Orchestrator re-prompt fallback

If model returns `sufficient=false` with empty/missing `followUpCalls` AND no separate tool calls:

1. Send a short follow-up prompt to the context model: "You indicated more context is needed but didn't specify follow-up tools. Based on the results you kept, what specific tool calls should be made next?"
2. This costs one extra model call but prevents the silent break.
3. If the re-prompt also returns no tool calls, THEN break and proceed to answering model with a warning.

**Together:** Fix A catches ~95% of cases (structured schema enforcement). Fix B handles the rare edge case where the model still doesn't comply.

### Section 4 Testing

- Test cloud path: mock a `report_evaluation` call with `sufficient=false` and `followUpCalls`, verify orchestrator extracts and executes them
- Test Ollama path: mock JSON output with `sufficient=false` and `followUpCalls`, verify same behavior
- Test fallback: mock `sufficient=false` with NO `followUpCalls`, verify orchestrator sends re-prompt
- Test double failure: mock re-prompt also returning no calls, verify graceful break with warning

---

## 5. Improved Verbose Logging Labels

**Problem:** Current logs show "Iteration 3", "loop 1", "loop 2" but it's hard to tell which model is being called, what global iteration we're in, and whether code or a model is executing.

**New labeling scheme** (uses existing `╭─╰─` box style, chalk coloring, and token summary format):

```
╭─ [Iter 1] Reasoning #1 (Planning) ───────────────╮
  Tool calls: 5
╰──────────────────────────────────────────────────╯

╭─ [Iter 1] Executing 5 tools ─────────────────────╮
  🔧 semantic_search {"query":"verbose log click"}
     → 9 results (App.tsx, server.ts, ...)
  🔧 search {"query":"verbose","kinds":"function"}
     → No results found
  ...
╰──────────────────────────────────────────────────╯

╭─ [Iter 1] Context #1 (Eval) ─────────────────────╮
  Tokens: in=2650 out=116
  Sufficient: false
  Kept: 2/5
  Follow-up calls: 3
╰──────────────────────────────────────────────────╯

╭─ [Iter 1] Reasoning #2 (Answering) ──────────────╮
  Tokens: in=3903 out=306
  Answer: FINAL (1187 chars)
╰──────────────────────────────────────────────────╯

╭─ Token Usage ─────────────────────────────────────╮
  reasoning    in:  10068  out:    622  total:  10690
  context      in:   9442  out:    320  total:   9762
  ──────────────────────────────────────────────────
  TOTAL        in:  19510  out:    942  total:  20452
╰───────────────────────────────────────────────────╯

╭─ Summary ─────────────────────────────────────────╮
  Iterations: 2 | Reasoning: 3 calls | Context: 3 calls
╰───────────────────────────────────────────────────╯
```

**What you can see at a glance:**

- **`[Iter N]`** -- global iteration (in the box title)
- **`Reasoning #N`** / **`Context #N`** -- which model call (numbered sequentially)
- **`Executing N tools`** -- code running, tool emoji for each call + result preview
- **`(Planning)` / `(Eval)` / `(Answering)`** -- what phase
- **Token counts** inside each model call box (in/out, matching existing style)
- **Token Usage box** at the end (same format as current `printSummary()`)
- **Summary box** with iteration/call totals

Uses the existing `verbose.header()`, `verbose.footer()`, `verbose.label()`, `verbose.tool()` utilities and chalk coloring (cyan borders, gray labels, yellow numbers, white values). Same `╭─╰─` box borders. Log files get plain text equivalent (already handled by `writeLog()`).

**Implementation:** Track three counters in orchestrator: `globalIter`, `reasoningCallCount`, `contextCallCount`. Update all `this.log.header()` calls to include the new labels. Token summary box remains as-is. Add a new summary box at the end. Logs continue to be written to `~/.aide/projects/<id>/logs/`.

### Section 5 Testing

- Run a multi-iteration query with verbose enabled, verify `[Iter N]` increments correctly
- Verify `Reasoning #N` and `Context #N` count independently and sequentially
- Verify `Executing` lines appear for tool execution (not model calls)
- Verify summary line at end has correct totals
- Verify log file output matches terminal output (plain text, no ANSI codes)

---

## 6. Prompt Cleanup

### Anti-hedging (generic, not overfitted)

Strengthened version for answering prompt:

```
- Answer directly, concisely, and confidently as if you are an expert who has already studied the code.
- Do NOT hedge with phrases like "Based on the provided context", "I don't see", "The context doesn't show". You have been given curated, relevant context -- trust it.
- Do NOT claim code is missing without carefully reviewing ALL provided context including the "Also Retrieved" section.
```

### Context evaluation -- generic, concise sufficiency guidance

```
## Evaluating Sufficiency
Can you point to specific code in the results that directly addresses the user's request?
- YES -> sufficient=true
- NO -> sufficient=false. You MUST include followUpCalls with at least one tool call.
Do NOT return sufficient=false without specifying followUpCalls.
```

Note: uses "request" not "question" (covers all user intents -- questions, bug reports, feature asks, etc.).

### Planning prompt -- tool usage flow guidance

```
IMPORTANT GUIDELINES:
- Start with semantic_search to find relevant entry points
- Use read_lines to drill into specific line ranges from entry points (prefer over read_file when you know the location)
- Use read_file_outline to understand file structure before reading full files
- Use find_symbol when you know a specific symbol name to look up
- For follow-up questions, use search_conversation to find relevant prior discussion, then read_conversation to get the full exchange
- topK guidance: 4-6 for focused queries, 6-8 for broader questions, 8-12 for surveys
- Call ALL tools you need in a single batch (prefer 3-5 targeted calls)
```

### Section 6 Testing

- Test anti-hedging: run a query where the model previously hedged ("Based on the provided context..."), verify it now answers directly
- Test sufficiency guidance: verify context model uses "request" language, not "question"
- Test planning prompt: verify reasoning model follows the flow (semantic_search first, then drill-down)
- Test topK guidance: verify model uses appropriate topK values for focused vs broad queries

---

## 7. Implementation Details

### Fix `find_symbol` (renamed from `search`)

**File:** [src/orchestration/toolExecutor.ts](src/orchestration/toolExecutor.ts), [src/brain/sqliteStore.ts](src/brain/sqliteStore.ts)

- Rename tool definition from `search` to `find_symbol`
- Pattern matching: `LIKE '%query%'` instead of exact match
- Fix FTS5: escape special chars (`"`, `*`, `-`, `(`, `)` etc.), multi-word queries joined with `OR`, wrap each term in double-quotes to prevent FTS5 syntax interpretation

### Add `relationKind` filter to `get_references` / `get_dependencies`

**File:** [src/orchestration/toolExecutor.ts](src/orchestration/toolExecutor.ts)

- Add optional `relationKind` parameter to both tool definitions (default: all kinds)
- Supported values: `CALLS`, `IMPORTS`, `EXTENDS`, `IMPLEMENTS`, `TESTS`
- Filter the `getIncomingRelations()` / `getOutgoingRelations()` call by relation kind
- One-line filter change per handler, maximum value with minimal complexity
- This unlocks graph data (IMPORTS, EXTENDS, IMPLEMENTS, TESTS) that was stored but never exposed

### Add `read_file_outline`

**File:** [src/orchestration/toolExecutor.ts](src/orchestration/toolExecutor.ts)

- Graph mode: `graph.getSymbolsForFile(fileId)` -> symbol names, kinds, line ranges
- No-graph mode: Read file, use Tree-sitter to extract function/class/interface declarations with line numbers (Tree-sitter is always available -- `web-tree-sitter` is a project dependency with grammars for JS, TS, and Python)
- Format: `function toggleLogExpand :165-174`, `interface VerboseLog :18-27`

### Move `read_lines` to shared tools

Currently only in `SEMANTIC_ONLY_TOOLS`. Move to shared tools so both graph and semantic strategies have it. Handler: filesystem-based, no graph dependency.

### Filesystem-based handlers for no-graph mode

For `read_file`, `read_lines`, `list_files`, `read_file_outline` when graph is null:

- `read_file`: `fs.readFileSync(path)` with project root resolution
- `read_lines`: read file, split lines, return `lines.slice(start-1, end)`
- `list_files`: `fs.readdirSync(dir)` with configurable depth limit
- `read_file_outline`: Tree-sitter extraction (always available for JS/TS/Python)

### Conversation tools implementation

**Files:** [src/session/sessionManager.ts](src/session/sessionManager.ts), [src/brain/sqliteStore.ts](src/brain/sqliteStore.ts), [src/orchestration/toolExecutor.ts](src/orchestration/toolExecutor.ts)

1. Add `conversation_embeddings` table to SQLite (session_id, exchange_index, role, embedding, content_hash)
2. In `SessionManager.addMessage()`: after both user + assistant messages are stored, embed both and store embeddings tagged with exchange index. For incomplete exchanges (user message sent, assistant hasn't responded yet), create the exchange entry with only the user embedding; update with the assistant embedding when the response arrives.
3. On session start: backfill embeddings for existing messages without them (NOT on `aide init`)
4. `search_conversation` handler: embed query, cosine similarity against stored embeddings, deduplicate by exchange index (max score), return top-K
5. `read_conversation` handler: return full exchanges for the given index range
6. `get_full_conversation` handler: return all exchanges

### Parallel tool execution

**File:** [src/orchestration/orchestrator.ts](src/orchestration/orchestrator.ts)

- Verify that batch tool calls within each iteration use `Promise.all` (not sequential `for...of` or `reduce`).
- Each tool call in a batch is independent -- no ordering dependency.
- If currently sequential, refactor the execution loop to `Promise.all(toolCalls.map(call => executor.execute(call)))`.

### Ollama native tools

**File:** [src/models/localModelClient.ts](src/models/localModelClient.ts)

- Change `supportsNativeTools()` to return `true`
- Infrastructure already exists (`chatWithTools`, tool conversion, response parsing)
- Test with `qwen3-coder:30b`
- Revert to `false` if quality drops significantly

---

## 8. Verify Fail-Fast Model Creation

This was implemented in a previous plan but should be verified. All model runtimes should fail immediately with clear errors when:

- API key is missing for cloud models
- Ollama is not running or unreachable
- Configured model name doesn't exist
- Any required configuration is missing

No silent fallbacks. If the user configured `gpt-5.2` for reasoning and the API key is wrong, the program stops with: "Error: Cannot create reasoning model (gpt-5.2): Invalid API key."

**File:** [src/models/modelFactory.ts](src/models/modelFactory.ts)

### Section 8 Testing

- Test with missing OPENAI_API_KEY -- verify clear error message and exit
- Test with Ollama not running -- verify clear error and exit
- Test with invalid model name -- verify clear error and exit

---

## 9. Testing Plan

### Phase 1: Simulate tool calls (pre-model, verify STA)

For each tool, manually call the handler and verify output quality:

- **Bug report** ("When I click verbose log, it scrolls to bottom"):
  - `semantic_search({"query":"verbose log click scroll"})` -> should return App.tsx entry points with line ranges
  - `read_lines({"filePath":"web/src/App.tsx","startLine":428,"endLine":435})` -> should return useEffect code
  - `read_file_outline({"filePath":"web/src/App.tsx"})` -> should list all functions/interfaces with line ranges
  - `find_symbol({"query":"toggleLogExpand"})` -> should find the function via pattern match

- **Feature question** ("How does the retrieval strategy system work?"):
  - `semantic_search({"query":"retrieval strategy"})` -> should return hybridRetrieval.ts, toolBasedRetrieval.ts
  - `read_file_outline({"filePath":"src/retrieval/hybridRetrieval.ts"})` -> should list interfaces and functions
  - `read_lines(...)` -> should return specific function code

- **Follow-up** ("Show me how to implement the fix you proposed"):
  - `search_conversation({"query":"proposed fix"})` -> should return `exchangeIndex` of prior exchange with preview
  - `read_conversation({"startExchange":N,"endExchange":N})` -> should return full exchange (user question + assistant answer)

### Phase 2: E2E with models

**Session management for testing:**
- **Clear sessions** (`--clear-history`) before each standalone question (bug report, feature question) to ensure a clean slate -- we are measuring context gathering quality in isolation, not conversation memory.
- **Keep session** (no `--clear-history`) for follow-up questions. Ask the initial question first, then ask the follow-up in the same session so conversation context is available and the conversation tools can be exercised.
- Use `--verbose` on all runs to capture full logs for analysis.

Test all four combinations:

1. **Graph + qwen3-coder:30b** (Ollama, native or text-based tools)
2. **Graph + gpt-5.2** (OpenAI, native tools)
3. **Semantic + qwen3-coder:30b**
4. **Semantic + gpt-5.2**

**Test sequence per combination:**

- **Q1 (standalone -- clear session):** Bug report -- "When I click on a verbose log, it scrolls me all the way to the bottom of the list unexpectedly"
- **Q2 (standalone -- clear session):** Feature question -- "How does the retrieval strategy system work?"
- **Q3 (keep session from Q1):** Follow-up -- "Show me how to implement the fix you proposed" (tests conversation context gathering)

For each, verify:
- Exact relevant context is gathered (no missing critical code)
- Irrelevant context is stripped (not dumped wholesale)
- Context model properly consolidates across iterations (no duplicate App.tsx appearing 3 times)
- Context model determines sufficiency based on full accumulated picture
- `sufficient=false` always includes `followUpCalls`
- Token usage is reasonable (compare before/after)
- Answer quality includes specific diagnosis and proposed fix
- No hedging language ("Based on the provided context...")
- Verbose logs are clear with step/phase/iteration/loop labels
- Log files in `~/.aide/projects/<id>/logs/` contain full plain-text output
- For Q3: conversation tools are used (search_conversation -> read_conversation), not broad codebase re-search
