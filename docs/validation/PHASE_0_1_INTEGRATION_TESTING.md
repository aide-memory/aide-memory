# AIDE-Memory Validation Runbook

Complete scenario-based validation for aide-memory Phase 0/1 using Claude Code.

**Duration:** ~60-90 minutes  
**Prerequisites:** Node.js, npm, git, Claude Code CLI  
**Output:** Result files saved to `validation/` directory after each scenario

---

## SETUP — 10 minutes

### Step 1: Build and Link aide-memory

```bash
cd /Users/meky/code/aide-v0
npm run build
npm link
```

Verify the command works:
```bash
aide-memory --version
```

### Step 2: Create Test Project

```bash
mkdir -p /tmp/aide-val && cd /tmp/aide-val
git init
git config user.name "test-user"
git config user.email "test@test.com"
npm init -y
npm install dayjs typescript --save
echo '{"compilerOptions":{"strict":true,"target":"ES2020","module":"commonjs","jsx":"react-jsx","outDir":"dist","rootDir":"src"}}' > tsconfig.json
mkdir -p src/components src/api src/auth src/utils src/__tests__
```

### Step 3: Create Project Files

Copy and paste each heredoc below into your terminal:

**src/components/Button.tsx:**
```bash
cat > /tmp/aide-val/src/components/Button.tsx << 'EOF'
export const Button = ({ label, onClick }: { label: string; onClick: () => void }) => {
  return <button onClick={onClick}>{label}</button>;
};
EOF
```

**src/api/routes.ts:**
```bash
cat > /tmp/aide-val/src/api/routes.ts << 'EOF'
import { authMiddleware } from '../auth/middleware';

export function getUsers() { return []; }
export function getUser(id: string) { return { id }; }
export function createUser(data: any) { return { ...data, id: '1' }; }
EOF
```

**src/auth/middleware.ts:**
```bash
cat > /tmp/aide-val/src/auth/middleware.ts << 'EOF'
export function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers?.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  next();
}
EOF
```

**src/utils/dates.ts:**
```bash
cat > /tmp/aide-val/src/utils/dates.ts << 'EOF'
import dayjs from 'dayjs';

export const formatDate = (d: Date) => dayjs(d).format('YYYY-MM-DD');
export const isRecent = (d: Date) => dayjs().diff(dayjs(d), 'day') < 7;
EOF
```

**src/__tests__/dates.test.ts:**
```bash
cat > /tmp/aide-val/src/__tests__/dates.test.ts << 'EOF'
import { describe, it, expect } from 'vitest';
import { formatDate } from '../utils/dates';

describe('formatDate', () => {
  it('formats a date', () => {
    expect(formatDate(new Date('2026-01-15'))).toBe('2026-01-15');
  });
});
EOF
```

### Step 4: Initialize aide-memory

```bash
cd /tmp/aide-val
aide-memory init
```

Verify the `.aide/` directory was created:
```bash
ls -la .aide/
```

You should see `memories/` subdirectories created. The project is ready.

### Step 5: Verify Recall Logging

aide-memory logs every `aide_recall` call to `.aide/recall-log.jsonl`. This is how you verify which specific memories were recalled during each session.

Key commands:
```bash
aide-memory recall-log            # Show all recall events with returned memories
aide-memory recall-log --last 3   # Show only the last 3 recall events
aide-memory recall-log --clear    # Clear the log (do this before each scenario)
```

Each recall event in the log shows:
- **Timestamp** — when the recall happened
- **Query paths** — what file paths triggered the recall
- **Memories returned** — the exact memory ID, content, layer, scope, and recall count

This replaces guessing from terminal scroll. After each session, run `aide-memory recall-log` and you'll see precisely what was recalled.

---

## SCENARIO 1 — Style Continuity (10 minutes)

**Goal:** Verify aide-memory persists coding style preferences across sessions.

### Session 1

Open a new terminal tab. Start Claude Code:

```bash
cd /tmp/aide-val
claude
```

In Claude Code, type each prompt and wait for completion:

**Prompt 1:**
```
Create a React component at src/components/UserCard.tsx that displays a user's name, email, and avatar
```

Let it finish. Then:

**Prompt 2:**
```
No, keep components under 80 lines. Split this into smaller pieces if needed.
```

Wait for it to adjust the component. Then:

**Prompt 3:**
```
Also, always use named exports, not default exports
```

Wait for the fix. Then:

**Prompt 4:**
```
One more thing — use camelCase for all variable names, not PascalCase for non-component variables
```

Let it complete. Exit Claude Code:
```
exit
```

### Session 2 (NEW Claude Code session)

Open Claude Code again in the same project:

```bash
cd /tmp/aide-val
claude
```

Type this prompt:

**Prompt:**
```
Create a React component at src/components/ProductList.tsx that shows a grid of products with name, price, image, and an add-to-cart button
```

**OBSERVE:**
- Does the component follow all 3 rules WITHOUT being told?
  - Under 80 lines?
  - Uses named exports?
  - Uses camelCase for variables?
- Did aide-memory recall any memories? Check terminal output for aide_recall calls.

Exit Claude Code:
```
exit
```

### Verification (run in terminal BEFORE Session 2)

```bash
cd /tmp/aide-val
aide-memory list
aide-memory stats
aide-memory recall-log --clear    # Clear log so Session 2 starts fresh
ls -la .aide/memories/
```

Record outputs below before starting Session 2.

### Scoring & Metrics

After Session 2, run all three verification commands:

```bash
cd /tmp/aide-val
aide-memory list                  # Shows all stored memories + recall counts
aide-memory stats                 # Shows aggregate stats
aide-memory recall-log            # Shows EXACTLY which memories were recalled, when, and for what paths
```

The `recall-log` output is the key evidence — it shows each recall event with the exact memories returned.

Save results to `validation/scenario-1-results.md`:

```bash
cat > /tmp/aide-val/../scenario-1-results.md << 'EOF'
# Scenario 1 Results — Style Continuity

## Memory Storage Verification (after Session 1)

| Metric                        | Expected          | Actual | Pass/Fail |
|-------------------------------|-------------------|--------|-----------|
| Memories stored (aide-memory list count) | ≥3 (one per correction) |        |           |
| Memory files in .aide/memories/          | ≥1 file(s)             |        |           |
| Layers used                              | preferences            |        |           |
| Scopes set                               | src/components/**      |        |           |

**aide-memory list output (Session 1):**
```
[Paste full output here]
```

**aide-memory stats output (Session 1):**
```
[Paste full output here]
```

## Memory Recall Verification (Session 2)

| Metric                          | Expected       | Actual | Pass/Fail |
|---------------------------------|----------------|--------|-----------|
| aide_recall triggered           | Yes            |        |           |
| Memories recalled (total count) | ≥3             |        |           |
| PreToolUse nudge appeared       | Yes            |        |           |

### Expected Memory → Recall Mapping

| # | Expected Memory                          | Recalled? | Exact Content from aide_recall Output | Layer      | Scope               |
|---|------------------------------------------|-----------|---------------------------------------|------------|----------------------|
| 1 | Components under 80 lines                | Yes / No  |                                       | preferences | src/components/**   |
| 2 | Use named exports (not default)          | Yes / No  |                                       | preferences | src/components/**   |
| 3 | camelCase for non-component variables    | Yes / No  |                                       | preferences | src/components/**   |

**Unexpected memories also recalled (if any):**

| Memory Content | Layer | Scope | Relevant? |
|---------------|-------|-------|-----------|
|               |       |       |           |

**`aide-memory recall-log` output (Session 2):**
```
[Paste output of: aide-memory recall-log]
This shows each recall event with timestamp, query paths, and every memory returned.
Fill in the table above by matching each returned memory to the expected list.
```

## Outcome Verification

| Metric                          | Expected       | Actual | Pass/Fail | Notes |
|---------------------------------|----------------|--------|-----------|-------|
| Component under 80 lines        | Yes            |        |           |       |
| Named export used               | Yes            |        |           |       |
| camelCase for non-component vars| Yes            |        |           |       |
| Rules followed WITHOUT re-telling | Yes          |        |           |       |

## Quantitative Metrics

| Metric                          | Value  |
|---------------------------------|--------|
| Total memories stored (Session 1) |      |
| Total memories recalled (Session 2) |    |
| Token count (aide-memory stats)   |      |
| Nudge triggers observed           |      |
| Session 1 prompt count            | 4     |
| Session 2 prompt count            | 1     |

## Qualitative Assessment

| Dimension                | Rating (1-5) | Notes |
|--------------------------|-------------|-------|
| Convention adherence     |             |       |
| Code quality             |             |       |
| Context awareness        |             |       |
| Memory precision         |             |       |

## Generated Code
[Paste the generated ProductList.tsx here]

## Issues Encountered
[Document any problems: missed recalls, wrong memories surfaced, etc.]
EOF
```

---

## SCENARIO 2 — Planning Persistence (12 minutes)

**Goal:** Verify aide-memory persists multi-step plans across sessions.

### Session 1

```bash
cd /tmp/aide-val
claude
```

**Prompt 1:**
```
Let's plan a refactor of src/api/. Here's what I want:
Step 1: Create a validators/ directory and extract input validation.
Step 2: Add an error handling middleware at src/api/errorHandler.ts.
Step 3: Consolidate all route handlers into a single router.

Important constraint: we must maintain backward compatibility with the existing getUsers and getUser exports.
```

Wait for Claude to acknowledge the plan. Then:

**Prompt 2:**
```
Great, let's start with step 1 — create the validators
```

Let it work and create the validators directory. Exit Claude Code:
```
exit
```

### Session 2 (NEW Claude Code session)

```bash
cd /tmp/aide-val
claude
```

**Prompt:**
```
Continue the API refactor we were working on
```

**OBSERVE:**
- Does Claude know about the existing plan?
- Does it mention step 2 (error handler) and step 3 (consolidate)?
- Does it remember the backward compat constraint?
- Does it ask "what refactor?" or pick up where you left off?

Exit Claude Code:
```
exit
```

### Verification (run in terminal BEFORE Session 2)

```bash
cd /tmp/aide-val
aide-memory list
aide-memory stats
aide-memory recall-log --clear    # Clear log so Session 2 starts fresh
ls -la .aide/memories/
```

### Scoring & Metrics

After Session 2, run all three verification commands:

```bash
cd /tmp/aide-val
aide-memory list
aide-memory stats
aide-memory recall-log            # Key output — shows exactly what was recalled
```

Save results to `validation/scenario-2-results.md`:

```bash
cat > /tmp/aide-val/../scenario-2-results.md << 'EOF'
# Scenario 2 Results — Planning Persistence

## Memory Storage Verification (after Session 1)

| Metric                        | Expected           | Actual | Pass/Fail |
|-------------------------------|---------------------|--------|-----------|
| Memories stored (count)       | ≥1 (plan + constraint) |     |           |
| Memory files in .aide/memories/ | ≥1 file(s)        |        |           |
| Layers used                   | area_context or technical |   |           |
| Plan steps captured           | 3 steps + constraint |       |           |

**aide-memory list output (Session 1):**
```
[Paste full output here]
```

## Memory Recall Verification (Session 2)

| Metric                          | Expected       | Actual | Pass/Fail |
|---------------------------------|----------------|--------|-----------|
| aide_recall triggered           | Yes            |        |           |
| Memories recalled (total count) | ≥1             |        |           |
| PreToolUse nudge appeared       | Yes            |        |           |

### Expected Memory → Recall Mapping

| # | Expected Memory                                      | Recalled? | Exact Content from aide_recall Output | Layer          | Scope       |
|---|------------------------------------------------------|-----------|---------------------------------------|----------------|-------------|
| 1 | Refactor plan: Step 1 (validators), Step 2 (error handler), Step 3 (consolidate) | Yes / No  |                     | area_context   | src/api/**  |
| 2 | Backward compatibility constraint (getUsers, getUser exports) | Yes / No  |                                       | technical      | src/api/**  |
| 3 | Step 1 completed (validators created)                | Yes / No  |                                       | area_context   | src/api/**  |

**Unexpected memories also recalled (if any):**

| Memory Content | Layer | Scope | Relevant? |
|---------------|-------|-------|-----------|
|               |       |       |           |

**`aide-memory recall-log` output (Session 2):**
```
[Paste output of: aide-memory recall-log]
Match each returned memory to the expected list above.
```

## Outcome Verification

| Metric                            | Expected       | Actual | Pass/Fail | Notes |
|-----------------------------------|----------------|--------|-----------|-------|
| Claude remembered the plan        | Yes            |        |           |       |
| Mentioned step 2 (error handler)  | Yes            |        |           |       |
| Mentioned step 3 (consolidate)    | Yes            |        |           |       |
| Remembered backward compat constraint | Yes        |        |           |       |
| Asked "what refactor?"            | No             |        |           |       |
| Picked up where we left off       | Yes            |        |           |       |

## Quantitative Metrics

| Metric                            | Value  |
|-----------------------------------|--------|
| Total memories stored (Session 1) |        |
| Total memories recalled (Session 2) |      |
| Token count (aide-memory stats)   |        |
| Nudge triggers observed           |        |
| Plan completeness (steps recalled / 3) |   |

## Qualitative Assessment

| Dimension                | Rating (1-5) | Notes |
|--------------------------|-------------|-------|
| Plan recall accuracy     |             |       |
| Constraint awareness     |             |       |
| Continuation smoothness  |             |       |
| Context coherence        |             |       |

## Claude's Response to "Continue the refactor"
[Paste full response here]

## Issues Encountered
[Document any problems]
EOF
```

---

## SCENARIO 3 — Technical Knowledge (12 minutes)

**Goal:** Verify aide-memory persists technical constraints (tool choices, library preferences).

### Session 1

```bash
cd /tmp/aide-val
claude
```

**Prompt 1:**
```
Add a helper function to src/utils/dates.ts that calculates the difference between two dates in days
```

Wait for it to create the function. Then:

**Prompt 2:**
```
We always use dayjs in this project, not moment or native Date math
```

Then immediately:

**Prompt 3:**
```
Also, all tests in this project use vitest, not jest
```

Then:

**Prompt 4:**
```
Now write a test for the date difference function
```

Let it create the test file. Exit Claude Code:
```
exit
```

### Session 2 (NEW Claude Code session)

```bash
cd /tmp/aide-val
claude
```

**Prompt:**
```
Add a function to src/utils/dates.ts that formats a date as a relative time string (e.g., '3 days ago', 'just now') and write tests for it
```

**OBSERVE:**
- Does it use `dayjs` (not moment.js or native Date)?
- Does it use `vitest` (not jest)?
- Were technical memories recalled?

Exit Claude Code:
```
exit
```

### Verification (run in terminal BEFORE Session 2)

```bash
cd /tmp/aide-val
aide-memory list
aide-memory stats
aide-memory recall-log --clear
ls -la .aide/memories/
```

### Scoring & Metrics

After Session 2, run all three verification commands:

```bash
cd /tmp/aide-val
aide-memory list
aide-memory stats
aide-memory recall-log
```

Save results to `validation/scenario-3-results.md`:

```bash
cat > /tmp/aide-val/../scenario-3-results.md << 'EOF'
# Scenario 3 Results — Technical Knowledge

## Memory Storage Verification (after Session 1)

| Metric                        | Expected              | Actual | Pass/Fail |
|-------------------------------|-----------------------|--------|-----------|
| Memories stored (count)       | ≥2 (dayjs + vitest)   |        |           |
| Memory files in .aide/memories/ | ≥1 file(s)          |        |           |
| Layers used                   | technical             |        |           |
| Tags applied                  | tooling, testing      |        |           |

**aide-memory list output (Session 1):**
```
[Paste full output here]
```

**aide-memory stats output (Session 1):**
```
[Paste full output here]
```

## Memory Recall Verification (Session 2)

| Metric                          | Expected       | Actual | Pass/Fail |
|---------------------------------|----------------|--------|-----------|
| aide_recall triggered           | Yes            |        |           |
| Memories recalled (total count) | ≥2             |        |           |
| PreToolUse nudge appeared       | Yes            |        |           |

### Expected Memory → Recall Mapping

| # | Expected Memory                              | Recalled? | Exact Content from aide_recall Output | Layer     | Scope           |
|---|----------------------------------------------|-----------|---------------------------------------|-----------|-----------------|
| 1 | Always use dayjs (not moment or native Date) | Yes / No  |                                       | technical | src/utils/**    |
| 2 | All tests use vitest (not jest)              | Yes / No  |                                       | technical | src/__tests__/** |

**Unexpected memories also recalled (if any):**

| Memory Content | Layer | Scope | Relevant? |
|---------------|-------|-------|-----------|
|               |       |       |           |

**`aide-memory recall-log` output (Session 2):**
```
[Paste output of: aide-memory recall-log]
```

## Outcome Verification

| Metric                            | Expected       | Actual | Pass/Fail | Notes |
|-----------------------------------|----------------|--------|-----------|-------|
| Used dayjs (not moment/native)    | Yes            |        |           |       |
| Used vitest (not jest)            | Yes            |        |           |       |
| Correctly imported dependencies   | Yes            |        |           |       |
| Function signature correct        | Yes            |        |           |       |
| Tests follow project conventions  | Yes            |        |           |       |

## Quantitative Metrics

| Metric                            | Value  |
|-----------------------------------|--------|
| Total memories stored (Session 1) |        |
| Total memories recalled (Session 2) |      |
| Token count (aide-memory stats)   |        |
| Nudge triggers observed           |        |
| Correct library choices (out of 2) |       |

## Qualitative Assessment

| Dimension                | Rating (1-5) | Notes |
|--------------------------|-------------|-------|
| Library choice accuracy  |             |       |
| Test quality             |             |       |
| Code idiom adherence     |             |       |
| Import correctness       |             |       |

## Generated Code

**Relative time function (src/utils/dates.ts addition):**
```typescript
[Paste function here]
```

**Test file:**
```typescript
[Paste test here]
```

## Issues Encountered
[Document any problems]
EOF
```

---

## SCENARIO 4 — Proactive Discovery (12 minutes)

**Goal:** Verify aide-memory proactively surfaces architectural knowledge when relevant.

### Setup: Seed Context (run in terminal, NOT in Claude Code)

```bash
cd /tmp/aide-val

aide-memory remember "The DataTable component uses server-side pagination via API — never implement client-side pagination as it breaks with large datasets" --layer area_context --scope "src/components/**" --tags "architecture"

aide-memory remember "All API routes must validate input using zod schemas before processing" --layer guidelines --scope "src/api/**" --tags "api-contract"

aide-memory remember "Auth middleware checks JWT tokens — always call authMiddleware before route handlers" --layer technical --scope "src/auth/**" --tags "security"
```

Verify memories were stored:
```bash
aide-memory list
```

You should see 3 memories in the output.

### Session 1

```bash
cd /tmp/aide-val
claude
```

**Prompt:**
```
Create a new DataTable component at src/components/DataTable.tsx with columns for name, email, and role. Add sorting and filtering.
```

**OBSERVE:**
- Does Claude mention server-side pagination or demonstrate awareness of it?
- Does it avoid implementing client-side pagination?
- Does aide_recall appear in the terminal?
- Did it retrieve the area_context memory about DataTable pagination?

Exit Claude Code:
```
exit
```

### Verification (run in terminal AFTER seeding, BEFORE Session 1)

```bash
cd /tmp/aide-val
aide-memory list
aide-memory stats
aide-memory recall-log --clear    # Clear any prior recall events
```

Confirm 3 seeded memories appear in the `list` output.

### Scoring & Metrics

After Session 1, run all three verification commands:

```bash
cd /tmp/aide-val
aide-memory list
aide-memory stats
aide-memory recall-log            # Shows exactly which seeded memories were recalled
```

Save results to `validation/scenario-4-results.md`:

```bash
cat > /tmp/aide-val/../scenario-4-results.md << 'EOF'
# Scenario 4 Results — Proactive Discovery

## Pre-Seed Verification

| Metric                        | Expected       | Actual | Pass/Fail |
|-------------------------------|----------------|--------|-----------|
| Seeded memories (count)       | 3              |        |           |
| Layers used                   | area_context, guidelines, technical | | |
| Scopes set                    | src/components/**, src/api/**, src/auth/** | | |

**aide-memory list output (pre-session):**
```
[Paste full output here]
```

## Memory Recall Verification (Session 1)

| Metric                          | Expected       | Actual | Pass/Fail |
|---------------------------------|----------------|--------|-----------|
| aide_recall triggered           | Yes            |        |           |
| Memories recalled (total count) | ≥1             |        |           |
| PreToolUse nudge appeared       | Yes            |        |           |
| Nudge content relevant          | Yes            |        |           |

### Expected Memory → Recall Mapping

| # | Expected Memory (seeded via CLI)                                                        | Recalled? | Exact Content from aide_recall Output | Layer        | Scope               |
|---|------------------------------------------------------------------------------------------|-----------|---------------------------------------|--------------|----------------------|
| 1 | DataTable uses server-side pagination — never implement client-side                      | Yes / No  |                                       | area_context | src/components/**    |
| 2 | All API routes must validate input using zod schemas                                     | Yes / No  |                                       | guidelines   | src/api/**           |
| 3 | Auth middleware checks JWT tokens — always call authMiddleware before route handlers      | Yes / No  |                                       | technical    | src/auth/**          |

**Note:** Memory #1 is the critical one for this scenario. #2 and #3 may or may not surface depending on path-scoped filtering (the prompt targets `src/components/`).

**Unexpected memories also recalled (if any):**

| Memory Content | Layer | Scope | Relevant? |
|---------------|-------|-------|-----------|
|               |       |       |           |

**`aide-memory recall-log` output (Session 1):**
```
[Paste output of: aide-memory recall-log]
Each recall event lists the exact memories returned — match to the table above.
Memory #1 (pagination) should appear. #2 and #3 may not if path-scoped filtering is working correctly.
```

## Outcome Verification

| Metric                              | Expected       | Actual | Pass/Fail | Notes |
|--------------------------------------|----------------|--------|-----------|-------|
| Avoided client-side pagination       | Yes            |        |           |       |
| Mentioned server-side pagination     | Yes            |        |           |       |
| Referenced stored architecture constraints | Yes      |        |           |       |
| Proactive awareness (not just reactive) | Yes         |        |           |       |

## Quantitative Metrics

| Metric                            | Value  |
|-----------------------------------|--------|
| Seeded memories                   | 3      |
| Memories recalled during session  |        |
| Token count (aide-memory stats)   |        |
| Nudge triggers observed           |        |
| Relevant memories surfaced (out of 3) |    |

## Qualitative Assessment

| Dimension                   | Rating (1-5) | Notes |
|-----------------------------|-------------|-------|
| Proactive knowledge surfacing |           |       |
| Architectural constraint adherence |      |       |
| Memory relevance filtering   |            |       |
| Code quality                 |            |       |

## Generated DataTable.tsx
```tsx
[Paste the entire component here]
```

## Terminal Output (`aide-memory recall-log`)
```
[Paste full output of: aide-memory recall-log]
```

## Issues Encountered
[Document any problems: missed recalls, irrelevant memories surfaced, etc.]
EOF
```

---

## SCENARIO 5 — New Contributor (15 minutes)

**Goal:** Verify aide-memory helps new contributors understand project conventions.

### Setup: Create Two Project Copies

Run in terminal (NOT Claude Code):

```bash
cp -r /tmp/aide-val /tmp/aide-val-with
cp -r /tmp/aide-val /tmp/aide-val-without
rm -rf /tmp/aide-val-without/.aide
```

Verify the second copy has no .aide:
```bash
ls -la /tmp/aide-val-without | grep aide
# Should have NO output
```

### Setup: Seed Memories in -with copy

Run in terminal:

```bash
cd /tmp/aide-val-with

aide-memory remember "This project uses a custom auth middleware — always import from src/auth/middleware" --layer technical

aide-memory remember "Components should be functional with hooks, no class components" --layer guidelines --scope "src/components/**"

aide-memory remember "API routes follow RESTful conventions: GET for read, POST for create, PUT for update, DELETE for remove" --layer guidelines --scope "src/api/**"

aide-memory remember "All date operations use dayjs, never moment.js or native Date arithmetic" --layer technical

aide-memory remember "Test files go in __tests__/ directories next to the code they test, using vitest" --layer guidelines --tags "testing"
```

Verify all 5 memories exist:
```bash
cd /tmp/aide-val-with
aide-memory list
```

### Session A: WITH memories

```bash
cd /tmp/aide-val-with
claude
```

**Prompt:**
```
Create a new API endpoint at src/api/products.ts for CRUD operations on products, with proper auth and validation
```

Let it complete. Note:
- What patterns does it follow?
- Does it import auth middleware?
- Does it use RESTful conventions?
- What validation approach does it use?

Exit Claude Code:
```
exit
```

Save the generated file:
```bash
cp /tmp/aide-val-with/src/api/products.ts /tmp/aide-val-products-WITH.ts
```

### Session B: WITHOUT memories

```bash
cd /tmp/aide-val-without
claude
```

**Prompt (identical):**
```
Create a new API endpoint at src/api/products.ts for CRUD operations on products, with proper auth and validation
```

Let it complete. Note the same observations.

Exit Claude Code:
```
exit
```

Save the generated file:
```bash
cp /tmp/aide-val-without/src/api/products.ts /tmp/aide-val-products-WITHOUT.ts
```

### Verification (run in terminal AFTER seeding, BEFORE sessions)

```bash
cd /tmp/aide-val-with
aide-memory list
aide-memory stats
aide-memory recall-log --clear

cd /tmp/aide-val-without
ls -la .aide 2>/dev/null || echo "No .aide directory — correct"
```

### Scoring & Metrics

After both sessions, run all verification commands:

```bash
cd /tmp/aide-val-with
aide-memory list
aide-memory stats
aide-memory recall-log            # Shows which seeded memories were recalled during Session A

cd /tmp/aide-val-without
aide-memory list 2>/dev/null && aide-memory stats 2>/dev/null
# Expected: no output (no .aide directory)
```

Save comparison to `validation/scenario-5-results.md`:

```bash
cat > /tmp/aide-val/../scenario-5-results.md << 'EOF'
# Scenario 5 Results — New Contributor Effectiveness

## Pre-Seed Verification (aide-val-with)

| Metric                        | Expected       | Actual | Pass/Fail |
|-------------------------------|----------------|--------|-----------|
| Seeded memories (count)       | 5              |        |           |
| Memory files in .aide/memories/ | ≥1 file(s)   |        |           |
| aide-val-without has NO .aide | Correct        |        |           |

**aide-memory list output (aide-val-with):**
```
[Paste full output here]
```

## WITH Memories — Recall Verification

| Metric                          | Expected       | Actual | Pass/Fail |
|---------------------------------|----------------|--------|-----------|
| aide_recall triggered           | Yes            |        |           |
| Memories recalled (total count) | ≥3             |        |           |
| PreToolUse nudge appeared       | Yes            |        |           |

### Expected Memory → Recall Mapping

| # | Expected Memory (seeded via CLI)                                                    | Recalled? | Exact Content from aide_recall Output | Layer      | Scope               |
|---|--------------------------------------------------------------------------------------|-----------|---------------------------------------|------------|----------------------|
| 1 | Custom auth middleware — always import from src/auth/middleware                       | Yes / No  |                                       | technical  | (project-wide)       |
| 2 | Components: functional with hooks, no class components                               | Yes / No  |                                       | guidelines | src/components/**    |
| 3 | API routes follow RESTful conventions: GET/POST/PUT/DELETE                            | Yes / No  |                                       | guidelines | src/api/**           |
| 4 | All date operations use dayjs, never moment.js or native Date                        | Yes / No  |                                       | technical  | (project-wide)       |
| 5 | Test files in __tests__/ directories, using vitest                                   | Yes / No  |                                       | guidelines | (project-wide)       |

**Note:** Memories #1, #3, and #5 are most critical for an API endpoint task. #2 is less relevant (component style). #4 only relevant if dates are involved.

**Unexpected memories also recalled (if any):**

| Memory Content | Layer | Scope | Relevant? |
|---------------|-------|-------|-----------|
|               |       |       |           |

**`aide-memory recall-log` output (WITH):**
```
[Paste output of: cd /tmp/aide-val-with && aide-memory recall-log]
Each recall event lists returned memories — match to the 5 seeded memories above.
```

## WITH Memories — Outcome Verification

| Metric                                    | Expected | Actual | Pass/Fail | Notes |
|-------------------------------------------|----------|--------|-----------|-------|
| Imported auth middleware                   | Yes      |        |           |       |
| Used RESTful conventions (GET/POST/PUT/DELETE) | Yes  |        |           |       |
| Followed functional component style       | Yes      |        |           |       |
| Used dayjs if dates involved              | Yes      |        |           |       |
| Added vitest tests                        | Yes      |        |           |       |

## WITHOUT Memories — Outcome Verification

| Metric                                    | Expected    | Actual | Pass/Fail | Notes |
|-------------------------------------------|-------------|--------|-----------|-------|
| Imported auth middleware                   | Maybe       |        |           |       |
| Used RESTful conventions (GET/POST/PUT/DELETE) | Maybe   |        |           |       |
| Followed functional component style       | Maybe       |        |           |       |
| Used dayjs if dates involved              | Unlikely    |        |           |       |
| Added vitest tests                        | Unlikely    |        |           |       |

## Comparative Quantitative Metrics

| Metric                            | WITH   | WITHOUT | Delta |
|-----------------------------------|--------|---------|-------|
| Memories recalled                 |        | 0       |       |
| Conventions followed (out of 5)   |        |         |       |
| Token count (aide-memory stats)   |        | N/A     |       |
| Nudge triggers observed           |        | 0       |       |
| Lines of code generated           |        |         |       |
| Prompts needed for correct output |        |         |       |

## Qualitative Assessment

| Dimension                     | WITH (1-5) | WITHOUT (1-5) | Notes |
|-------------------------------|-----------|---------------|-------|
| Convention adherence          |           |               |       |
| Code quality                  |           |               |       |
| Architectural awareness       |           |               |       |
| First-attempt correctness     |           |               |       |
| Project-specific idiom usage  |           |               |       |

## Generated Code

**WITH memories — src/api/products.ts:**
```typescript
[Paste entire file here]
```

**WITHOUT memories — src/api/products.ts:**
```typescript
[Paste entire file here]
```

## Key Differences
[List specific differences between WITH and WITHOUT versions]

## Conclusion

| Question                                              | Answer             |
|-------------------------------------------------------|--------------------|
| Did aide-memory help a "new contributor" get up to speed? |                 |
| Was the WITH version measurably better?                |                    |
| How many extra prompts would WITHOUT need to match WITH? |                  |
| Would you ship the WITH version without edits?         |                    |

## Issues Encountered
[Document any problems]
EOF
```

---

## FINAL VALIDATION SUMMARY

After completing all 5 scenarios, gather all metrics and create a master results file:

```bash
# Gather final stats from all project copies
cd /tmp/aide-val && aide-memory stats > /tmp/aide-val-stats.txt
cd /tmp/aide-val-with && aide-memory stats > /tmp/aide-val-with-stats.txt
```

```bash
cat > /tmp/aide-val/../VALIDATION_RESULTS.md << 'EOF'
# AIDE-Memory Validation Results

**Date:** [YYYY-MM-DD]
**Project:** /tmp/aide-val (and -with, -without)
**Claude Code Version:** [Your version]
**aide-memory Version:** 0.1.1

---

## Master Scenario Results

| Scenario | Status | Memories Stored | Memories Recalled | Nudges Fired | Conventions Met | Key Finding |
|----------|--------|-----------------|-------------------|-------------|-----------------|-------------|
| 1 — Style Continuity     | Pass/Fail |   |   |   | /3  |   |
| 2 — Planning Persistence | Pass/Fail |   |   |   | /4  |   |
| 3 — Technical Knowledge  | Pass/Fail |   |   |   | /2  |   |
| 4 — Proactive Discovery  | Pass/Fail |   |   |   | /3  |   |
| 5 — New Contributor      | Pass/Fail |   |   |   | /5  |   |

## Aggregate Quantitative Metrics

| Metric                              | Total | Average per Scenario |
|-------------------------------------|-------|---------------------|
| Total memories stored               |       |                     |
| Total memories recalled             |       |                     |
| Total PreToolUse nudges fired       |       |                     |
| Total conventions verified          |       |  / total possible   |
| Conventions met (% pass rate)       |       |                     |
| Token count (aide-memory stats)     |       |                     |
| Average memories per session        |       |                     |
| Recall accuracy (relevant / total)  |       |                     |

## Memory System Health

| Component                          | Status | Notes |
|------------------------------------|--------|-------|
| aide-memory init                   |        |       |
| aide_remember (auto, via agent)    |        |       |
| aide-memory remember (CLI seed)    |        |       |
| aide_recall (auto, via hooks)      |        |       |
| PreToolUse nudge trigger           |        |       |
| aide-memory list (CLI verify)      |        |       |
| aide-memory stats (CLI metrics)    |        |       |
| Memory persistence across sessions |        |       |
| Path-scoped recall filtering       |        |       |
| Layer-based organization           |        |       |

## Hook Verification

| Hook              | Triggered | Correct Behavior | Notes |
|-------------------|-----------|------------------|-------|
| PreToolUse        |           |                  |       |
| Stop              |           |                  |       |
| UserPromptSubmit  |           |                  |       |
| PreCompact        |           |                  |       |

## Scenario 5: WITH vs WITHOUT Comparison

| Metric                     | WITH aide-memory | WITHOUT aide-memory | Delta |
|----------------------------|-----------------|---------------------|-------|
| Conventions followed       | /5              | /5                  |       |
| First-attempt quality (1-5)|                 |                     |       |
| Extra prompts needed       |                 |                     |       |
| Auth middleware imported    |                 |                     |       |
| Test framework correct     |                 |                     |       |

## Overall Assessment

| Question                                        | Answer                    |
|-------------------------------------------------|---------------------------|
| aide-memory persists knowledge across sessions  | Yes / Mostly / No         |
| PreToolUse nudges fire correctly                | Yes / Partially / No      |
| aide_recall triggered when relevant             | Yes / Partially / No      |
| aide_remember captures corrections              | Yes / Partially / No      |
| Path-scoped filtering works                     | Yes / Partially / No      |
| Layer organization is useful                    | Yes / Partially / No      |
| Overall: aide-memory improves agent quality     | Yes / Partially / No      |

## Issues & Bugs Found

| Issue # | Scenario | Severity | Description | Reproducible | Fix Needed |
|---------|----------|----------|-------------|-------------|------------|
| 1       |          |          |             |             |            |
| 2       |          |          |             |             |            |

## Qualitative Observations

[Free-form notes about what worked well, what surprised you, and what needs improvement]

## Next Steps

- [ ] Review Cursor validation (deferred — see spec section "CURSOR VALIDATION")
- [ ] File bugs for any issues found above
- [ ] Refine memory surfacing logic if needed
- [ ] Update documentation based on findings
- [ ] Run validation again after fixes to verify improvements
EOF
```

Save all result files:
```bash
ls -la /tmp/aide-val/../scenario-*-results.md /tmp/aide-val/../VALIDATION_RESULTS.md
```

---

## Troubleshooting

**"aide-memory: command not found"**
- Verify: `ls /Users/meky/code/aide-v0/dist/`
- Rebuild: `cd /Users/meky/code/aide-v0 && npm run build && npm link`

**".aide directory not created"**
- Verify git repo: `cd /tmp/aide-val && git status`
- Try again: `aide-memory init`

**Claude Code won't start**
- Install Claude Code CLI: `npm install -g claude-code` (or update)
- Verify: `claude --version`

**Memories not found in new session**
- Check: `cd /tmp/aide-val && aide-memory list`
- Verify `.aide/memories/` has files with content

**aide_recall never appears**
- Check terminal output, not Claude Code window
- Try: `aide-memory search <keyword>` to verify memories exist

---

## Notes

- Each scenario should be a **separate Claude Code session** — exit and start fresh
- **Do NOT reuse sessions** between scenarios (they affect memory state)
- **Project paths must be absolute** — use `/tmp/aide-val`, not relative paths
- **Seed memories via terminal**, not Claude Code, for Scenario 4 & 5
- **Save all result files** before moving to the next scenario
- **Keep the test project intact** — do NOT delete between scenarios
