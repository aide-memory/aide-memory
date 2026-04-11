# AIDE-Memory Validation Runner — Phase 0/1

Complete scenario-based validation for all 14 verification scenarios (V1-V14) from the Hook & Recall Refinement Plan.

**Duration:** ~90-120 minutes  
**Prerequisites:** Node.js ≥18, npm, git, Claude Code CLI  
**Output:** Result files saved to `docs/validation/` and test project at `/tmp/aide-val`

---

## SETUP — 15 minutes

### Step 1: Build and Link aide-memory

**CRITICAL:** Always rebuild before testing.

```bash
cd /path/to/aide-v0
git pull origin feature/phase-1
npm install
npm run build
npm link
aide-memory --version
```

Verify output shows a version (e.g., `0.2.0`). If not, check that `npm link` created the global symlink.

### Step 2: Create Test Project

```bash
mkdir -p /tmp/aide-val && cd /tmp/aide-val
git init
git config user.name "test-user"
git config user.email "test@test.com"
npm init -y
npm install dayjs typescript vitest --save
echo '{"compilerOptions":{"strict":true,"target":"ES2020","module":"commonjs","jsx":"react-jsx","outDir":"dist","rootDir":"src"}}' > tsconfig.json
mkdir -p src/components src/api src/auth src/utils src/__tests__
```

### Step 3: Populate Test Project

Copy and paste each heredoc into your terminal:

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
ls -la .aide/
```

You should see `.aide/memories/` directories created.

---

## VALIDATION SCENARIOS — V1 through V14

All scenarios work on the same test project `/tmp/aide-val`. Each scenario should run in its own Claude Code session (exit and start fresh between scenarios).

### Key Commands for All Scenarios

Before each scenario, clear the recall log:
```bash
aide-memory recall-log --clear
```

After each scenario, check what was recalled:
```bash
aide-memory recall-log --last 5
```

List all stored memories:
```bash
aide-memory list
```

View memory statistics:
```bash
aide-memory stats
```

---

## V1: Recall Surfaces on Read (Parallel Group A)

**Goal:** Verify hook blocks when scoped memories exist, aide_recall returns scoped memories first.

**Expected Behavior:**
- Hook blocks on first file read (scoped memories exist)
- aide_recall returns scoped memories FIRST
- Subsequent read is soft (hook observes "no blocking needed")

**Steps:**

1. Seed a scoped memory to `src/components/`:
```bash
cd /tmp/aide-val
aide-memory remember "Use React functional components with TypeScript" \
  --layer preferences \
  --scope "src/components/**" \
  --tags "style,react"
```

2. Open Claude Code:
```bash
cd /tmp/aide-val
claude
```

3. In Claude Code, type:
```
Read the Button.tsx file and understand its structure
```

4. **Observe:**
   - Terminal should show hook blocking (check for "PreToolUse: blocking" or similar)
   - aide_recall should return the seeded memory with full content
   - Recall log should show this memory ID and layer

5. Exit Claude Code:
```
exit
```

6. **Check results:**
```bash
aide-memory recall-log --last 1
aide-memory list --scope "src/components/**"
```

**Success Criteria:**
- [ ] Hook blocked on read
- [ ] aide_recall returned scoped memory
- [ ] Memory layer is "preferences"
- [ ] Scope matches "src/components/**"

---

## V2: Directory Recall Triggers (Parallel Group A)

**Goal:** Verify reading 2 files in same dir triggers directory recall, dir recall returns area_context first.

**Expected Behavior:**
- First file read: block with scoped memory
- Second file in same dir: directory recall nudge fires
- area_context layer surfaces first

**Steps:**

1. Seed memories for the directory:
```bash
cd /tmp/aide-val
aide-memory remember "Components use TypeScript interfaces for props" \
  --layer area_context \
  --scope "src/components/**" \
  --tags "typescript,components"
  
aide-memory remember "All components export named exports" \
  --layer area_context \
  --scope "src/components/**" \
  --tags "exports"
```

2. Open Claude Code:
```bash
cd /tmp/aide-val
claude
```

3. Read first file:
```
Read src/components/Button.tsx
```

Wait for completion, then:

4. Read second file in same dir:
```
Now read src/components/ to understand the component structure
```

5. **Observe:**
   - Second read should trigger directory recall nudge
   - area_context memories should surface (not preferences)

6. Exit and check:
```bash
aide-memory recall-log --last 2
```

**Success Criteria:**
- [ ] First read blocked
- [ ] Second read triggered dir recall nudge
- [ ] area_context layer ranked first in results
- [ ] Both memories returned

---

## V3: Search Nudge Works (Parallel Group A)

**Goal:** Verify search nudge fires with match count, aide_search returns results.

**Expected Behavior:**
- Hook blocks with match count when grep-like search occurs
- aide_search called automatically
- Results include all matching scoped memories

**Steps:**

1. Seed memories matching keyword "auth":
```bash
cd /tmp/aide-val
aide-memory remember "Always validate tokens in middleware" \
  --layer technical \
  --scope "src/auth/**" \
  --tags "auth,security"

aide-memory remember "Use Bearer token scheme for API auth" \
  --layer guidelines \
  --scope "src/auth/**" \
  --tags "auth,api"
```

2. Open Claude Code:
```bash
cd /tmp/aide-val
claude
```

3. In Claude Code, initiate a search-like task:
```
Find all references to 'auth' in the codebase
```

4. **Observe:**
   - Hook should block with count of matching scoped memories
   - aide_search should be called internally
   - Results should include both auth memories

5. Exit and check:
```bash
aide-memory recall-log --last 1
aide-memory search "auth"
```

**Success Criteria:**
- [ ] Hook blocked with match count
- [ ] aide_search returned results
- [ ] Both auth memories in results
- [ ] Scoped to "src/auth/**"

---

## V4: Edit Enforced if Not Recalled (Parallel Group A)

**Goal:** Verify hook blocks edit until recall is confirmed.

**Expected Behavior:**
- Attempt to edit file without reading first → hook blocks
- Prompt agent to recall
- After recall, edit is allowed

**Steps:**

1. Seed a scoped memory to `src/api/`:
```bash
cd /tmp/aide-val
aide-memory remember "API endpoints must validate input before processing" \
  --layer technical \
  --scope "src/api/**" \
  --tags "validation,api"
```

2. Open Claude Code:
```bash
cd /tmp/aide-val
claude
```

3. Go directly to edit without reading:
```
Edit src/api/routes.ts to add a new createProduct function
```

4. **Observe:**
   - Hook should block edit (scoped memory exists, not yet recalled)
   - Terminal shows blocking hook message
   - Prompt agent to recall first

5. Follow up:
```
First, recall what we know about API validation
```

6. Then:
```
Now add the createProduct function
```

7. Exit and check:
```bash
aide-memory recall-log
```

**Success Criteria:**
- [ ] First edit blocked
- [ ] Hook required recall
- [ ] Second attempt (after recall) succeeded
- [ ] Recall log shows memory access

---

## V5: Correction Stored (Parallel Group A)

**Goal:** Verify correction pattern is captured, stored via aide_remember, flag cleared.

**Expected Behavior:**
- Agent types correction like "No, use X instead"
- Hook detects correction pattern
- aide_remember called automatically
- Correction stored, flag cleared, hook stops blocking

**Steps:**

1. Seed an outdated memory:
```bash
cd /tmp/aide-val
aide-memory remember "Use const for all variable declarations" \
  --layer preferences \
  --scope "src/**" \
  --tags "style"
```

2. Open Claude Code:
```bash
cd /tmp/aide-val
claude
```

3. Trigger a read:
```
Read src/utils/dates.ts
```

4. Type a correction (simulate correction scenario):
```
No, for this project we use let when variable is reassigned. Update that memory.
```

5. **Observe:**
   - Hook detects correction pattern ("No, ...")
   - aide_remember should be called (check terminal for hook message)
   - Correction stored with updated content
   - Hook stops blocking after correction

6. Exit and verify:
```bash
aide-memory recall-log
aide-memory list | grep "let when variable"
```

**Success Criteria:**
- [ ] Correction pattern detected
- [ ] aide_remember called
- [ ] Updated memory stored
- [ ] Hook accepted correction

---

## V6: Post-Compaction Re-Recall (Separate Session B)

**Goal:** Verify hook blocks again after compaction (tracking cleared).

**Expected Behavior:**
- Work in session, memories stored, tracking recorded
- Run compaction (clears tracking)
- Read same file again → hook blocks again (tracking reset)

**Steps:**

1. In same Claude Code session from V5, work on multiple files:
```
Create a new utility function at src/utils/validators.ts for input validation
```

2. This stores tracking. Now compact:
```bash
cd /tmp/aide-val
aide-memory compact
```

Check that tracking was cleared:
```bash
ls -la .aide/tracking/
```

3. Start NEW Claude Code session:
```bash
cd /tmp/aide-val
claude
```

4. Read the file again:
```
Read src/utils/dates.ts
```

5. **Observe:**
   - Hook blocks again (tracking was cleared by compaction)
   - aide_recall triggered fresh
   - Same memories resurface

6. Exit and check:
```bash
aide-memory recall-log --last 1
```

**Success Criteria:**
- [ ] Compaction cleared tracking
- [ ] New session read triggered block
- [ ] aide_recall returned memories
- [ ] Tracking re-recorded

---

## V7: SessionStart Injects Prefs (Separate Session C)

**Goal:** Verify preferences injected at session start appear in context.

**Expected Behavior:**
- Stored preferences exist
- New session starts → SessionStart hook injects prefs
- Preferences appear in Claude Code context (visible in terminal or prompt context)

**Steps:**

1. Seed project-wide preferences:
```bash
cd /tmp/aide-val
aide-memory remember "Use TypeScript strict mode everywhere" \
  --layer preferences \
  --tags "typescript,config"

aide-memory remember "Always add unit tests with vitest" \
  --layer preferences \
  --tags "testing"
```

2. Open NEW Claude Code session:
```bash
cd /tmp/aide-val
claude
```

3. In Claude Code, start with a fresh task:
```
What coding conventions should I follow in this project?
```

4. **Observe:**
   - SessionStart hook injects preferences into context
   - Agent should reference injected preferences
   - Terminal shows preferences injected (check hook logs)

5. Exit and check:
```bash
aide-memory recall-log | grep "SessionStart"
aide-memory list --layer preferences
```

**Success Criteria:**
- [ ] SessionStart hook triggered
- [ ] Preferences injected (visible in logs)
- [ ] Agent referenced injected prefs
- [ ] At least 2 preferences in output

---

## V8: Keyword vs Semantic Search (Separate Session C)

**Goal:** Verify aide_search supports keyword, semantic, and auto modes.

**Expected Behavior:**
- aide_search with mode:"keyword" → exact/fuzzy matches
- aide_search with mode:"semantic" → embedding-based matches
- aide_search with mode:"auto" → system decides (hybrid)

**Steps:**

1. Seed diverse memories:
```bash
cd /tmp/aide-val
aide-memory remember "Array methods like map, filter, reduce are preferred" \
  --layer technical \
  --tags "functional"

aide-memory remember "Immutability prevents bugs in React components" \
  --layer guidelines \
  --tags "react,immutability"

aide-memory remember "Use lodash utility functions for complex operations" \
  --layer preferences \
  --tags "utilities,performance"
```

2. Manually test each search mode:
```bash
cd /tmp/aide-val
aide-memory search "map reduce" --mode keyword
aide-memory search "functional array operations" --mode semantic
aide-memory search "optimization techniques" --mode auto
```

3. **Observe:**
   - Keyword returns exact/fuzzy matches (map, reduce)
   - Semantic returns related concepts (functional programming)
   - Auto mode returns hybrid results

4. Open Claude Code:
```bash
cd /tmp/aide-val
claude
```

5. Trigger searches:
```
I need to transform an array of objects. What patterns should I use?
```

6. Exit and check logs:
```bash
aide-memory recall-log --last 3
```

**Success Criteria:**
- [ ] Keyword search returned map/reduce
- [ ] Semantic search returned functional concepts
- [ ] Auto mode used hybrid approach
- [ ] All 3 modes returned different results

---

## V9: Embedding Update (Separate Session C)

**Goal:** Verify semantic search finds updated content.

**Expected Behavior:**
- Store memory with content A
- Update memory with content B
- Semantic search finds updated content

**Steps:**

1. Store initial memory:
```bash
cd /tmp/aide-val
aide-memory remember "Components should be small and focused" \
  --layer guidelines \
  --scope "src/components/**" \
  --tags "architecture"
```

2. Update the memory:
```bash
# Get the memory ID first
MEMORY_ID=$(aide-memory list --scope "src/components/**" | grep "Components should" | head -1 | awk '{print $1}')

# Update via CLI (use aid-memory update if available, otherwise delete and re-add)
aide-memory remember "Splitting large components into smaller reusable pieces improves maintainability and testing" \
  --layer guidelines \
  --scope "src/components/**" \
  --tags "refactoring,components"
```

3. Search for updated content:
```bash
aide-memory search "reusable pieces maintainability"
aide-memory search "refactoring components" --mode semantic
```

4. **Observe:**
   - Semantic search finds updated memory
   - Old content no longer matches
   - Embeddings updated correctly

**Success Criteria:**
- [ ] Updated memory found by semantic search
- [ ] New content indexed
- [ ] Old phrasing doesn't match
- [ ] Tags updated

---

## V10: Concurrent Sessions (Parallel Group D)

**Goal:** Verify tracking isolated, no cross-contamination.

**Expected Behavior:**
- Two Claude Code sessions on same project
- Each has separate tracking file (session_id based)
- Memories shared, but tracking isolated

**Steps:**

1. Create a second test project copy:
```bash
cp -r /tmp/aide-val /tmp/aide-val-session-2
cd /tmp/aide-val-session-2
aide-memory init
```

2. Verify shared memories:
```bash
aide-memory list
```

Should show all memories from original project (shared database).

3. Open Claude Code Session A:
```bash
cd /tmp/aide-val
claude
```

4. In Session A:
```
Read src/auth/middleware.ts and explain how tokens are validated
```

Wait for completion.

5. In parallel, open Claude Code Session B:
```bash
cd /tmp/aide-val-session-2
claude
```

6. In Session B:
```
Read src/api/routes.ts and explain the API structure
```

Wait for completion.

7. Exit both sessions.

8. Check tracking files:
```bash
ls -la /tmp/aide-val/.aide/tracking/
ls -la /tmp/aide-val-session-2/.aide/tracking/
```

9. **Observe:**
   - Each has separate tracking file (different session_id)
   - Memories shared (same `.aide/memories/`)
   - No cross-session interference

**Success Criteria:**
- [ ] Two separate tracking files created
- [ ] Different session_ids
- [ ] Shared memories accessible in both
- [ ] No read corruption

---

## V11: Scoped vs Project-Wide Blocking (Parallel Group D)

**Goal:** Verify project-wide → soft nudge, scoped → block.

**Expected Behavior:**
- File with only project-wide memories → soft nudge (no block)
- File with scoped memories → block

**Steps:**

1. Seed both types:
```bash
cd /tmp/aide-val
# Project-wide memory (no scope)
aide-memory remember "Always include error handling in async functions" \
  --layer technical \
  --tags "async,errors"

# Scoped memory
aide-memory remember "Auth middleware must check Authorization header" \
  --layer technical \
  --scope "src/auth/**" \
  --tags "auth,headers"
```

2. Open Claude Code:
```bash
cd /tmp/aide-val
claude
```

3. Read file with ONLY project-wide memory:
```
Read src/utils/dates.ts
```

4. **Observe:**
   - Hook fires soft nudge (not blocking)
   - Terminal shows "soft nudge" or similar

5. Read file with scoped memory:
```
Now read src/auth/middleware.ts
```

6. **Observe:**
   - Hook blocks (scoped memory exists)
   - Terminal shows blocking message

7. Exit and check:
```bash
aide-memory recall-log
```

**Success Criteria:**
- [ ] Project-wide read: soft nudge
- [ ] Scoped read: block
- [ ] Hook blocking logic correct
- [ ] Both memories recalled appropriately

---

## V12: Recall Quality (Parallel Group D)

**Goal:** Verify scoped memories rank above project-wide, round-robin includes all 4 layers.

**Expected Behavior:**
- aide_recall for file with scoped mems → scoped results FIRST
- Round-robin results include all 4 layers (preferences, technical, area_context, guidelines)

**Steps:**

1. Seed all 4 layers for same scope:
```bash
cd /tmp/aide-val
aide-memory remember "Use arrow functions for callbacks" \
  --layer preferences \
  --scope "src/utils/**" \
  --tags "style"

aide-memory remember "Utility functions should be pure (no side effects)" \
  --layer technical \
  --scope "src/utils/**" \
  --tags "purity"

aide-memory remember "utils/ contains reusable helpers for date, string, and array operations" \
  --layer area_context \
  --scope "src/utils/**" \
  --tags "utilities"

aide-memory remember "All utilities must include JSDoc comments" \
  --layer guidelines \
  --scope "src/utils/**" \
  --tags "documentation"
```

2. Open Claude Code:
```bash
cd /tmp/aide-val
claude
```

3. Read the file:
```
Read src/utils/dates.ts and understand what utilities it provides
```

4. Exit and check results:
```bash
aide-memory recall-log --last 1
```

5. **Observe:**
   - Top result is scoped (not project-wide)
   - All 4 layers included in round-robin
   - Recall order: preferences, technical, area_context, guidelines (or similar logical order)
   - Each memory has correct layer label

**Success Criteria:**
- [ ] Scoped memories ranked first
- [ ] All 4 layers included
- [ ] No project-wide results before scoped
- [ ] Round-robin distribution balanced

---

## V13: File vs Dir Recall Ranking (Parallel Group D)

**Goal:** Verify file query → specific scopes first, dir query → area_context first.

**Expected Behavior:**
- aide_recall "src/utils/dates.ts" → file-specific results first
- aide_recall "src/utils/" → area_context results first

**Steps:**

1. Memories already seeded from V12, use those.

2. Manually test file query:
```bash
cd /tmp/aide-val
aide-memory recall "src/utils/dates.ts"
```

3. **Observe:**
   - Results ranked by file-specific scope
   - Preferences/technical before area_context

4. Test directory query:
```bash
aide-memory recall "src/utils/"
```

5. **Observe:**
   - Results ranked by area_context first
   - Directory-level context prioritized
   - File-specific results lower in ranking

6. Open Claude Code and verify in-session:
```bash
cd /tmp/aide-val
claude
```

7. In Claude Code:
```
List all the utilities available in src/utils/ directory
```

8. Exit and check:
```bash
aide-memory recall-log
```

**Success Criteria:**
- [ ] File query: specific scopes ranked first
- [ ] Dir query: area_context ranked first
- [ ] Results order differs by query type
- [ ] Ranking logic correct

---

## V14: New Project Softening (Parallel Group D)

**Goal:** Verify project with <10 memories uses soft hooks (no blocking).

**Expected Behavior:**
- Create new project with <10 memories
- All hooks fire soft (no blocking)
- Nudges appear but don't pause agent

**Steps:**

1. Create a new minimal test project:
```bash
mkdir -p /tmp/aide-val-new && cd /tmp/aide-val-new
git init
git config user.name "test-user"
git config user.email "test@test.com"
npm init -y
mkdir -p src
echo "export const hello = () => 'world';" > src/index.ts
aide-memory init
```

2. Add only 3 memories (under 10 threshold):
```bash
cd /tmp/aide-val-new
aide-memory remember "Keep it simple" \
  --layer preferences \
  --tags "style"

aide-memory remember "Minimize dependencies" \
  --layer guidelines \
  --tags "architecture"

aide-memory remember "This is a new project with minimal structure" \
  --layer area_context
```

3. Verify count:
```bash
aide-memory stats | grep "Total memories"
```

Should show 3 (< 10).

4. Open Claude Code:
```bash
cd /tmp/aide-val-new
claude
```

5. Read files:
```
Read src/index.ts
```

6. **Observe:**
   - Hook fires soft nudge (not blocking)
   - No pause in agent execution
   - Terminal shows "soft nudge" indicators

7. Try edit:
```
Add a new function at src/index.ts
```

8. **Observe:**
   - Edit also gets soft nudge (not blocking)
   - Agent continues without pause

9. Exit and check:
```bash
aide-memory recall-log
```

Should show soft hooks, not blocking.

**Success Criteria:**
- [ ] Project has <10 memories
- [ ] All hooks soft (no blocking)
- [ ] Nudges fire but don't pause
- [ ] Agent continues execution
- [ ] Recall log shows soft indicators

---

## AUTOMATED TEST RUNNER

After running all 14 scenarios manually, use the automated runner to re-validate:

```bash
cd /path/to/aide-v0
npm run build
npm link
npm test
```

This runs all automated smoke tests for aide-memory core functionality.

---

## RESULTS DOCUMENTATION

### Collect Results

After each scenario, save observations to the results template at:
```
docs/validation/PHASE_1_RESULTS.md
```

Use the tables provided in the template to track:
- Hook Behavior (V1-V7)
- Recall Quality (V8-V13)
- Hook Orchestration (V1-V14)
- Metrics Summary

### Master Checklist

```bash
# After all scenarios complete:
cd /tmp/aide-val
aide-memory stats > /tmp/aide-val-stats.txt
aide-memory list > /tmp/aide-val-memories.txt
ls -la /tmp/aide-val/.aide/tracking/ > /tmp/aide-val-tracking.txt

# Copy results to docs/validation/
cp /tmp/aide-val-stats.txt /path/to/aide-v0/docs/validation/
cp /tmp/aide-val-memories.txt /path/to/aide-v0/docs/validation/
cp /tmp/aide-val-tracking.txt /path/to/aide-v0/docs/validation/
```

---

## EXECUTION GROUPS

### Parallel Group A (can run in parallel)
- V1: Recall surfaces on read
- V2: Directory recall triggers
- V3: Search nudge works
- V4: Edit enforced if not recalled
- V5: Correction stored

**Note:** Use same test project `/tmp/aide-val`, but each in separate Claude Code session. Exit between scenarios.

### Separate Session B
- V6: Post-compaction re-recall

**Requires:** V5 completed, then new Claude Code session.

### Separate Session C (can run in parallel)
- V7: SessionStart injects prefs
- V8: Keyword vs semantic search
- V9: Embedding update

**Note:** Fresh Claude Code sessions, same test project.

### Parallel Group D (can run in parallel)
- V10: Concurrent sessions
- V11: Scoped vs project-wide blocking
- V12: Recall quality
- V13: File vs dir recall ranking
- V14: New project softening

**Note:** V10 uses second project copy. Others use original `/tmp/aide-val`.

---

## Troubleshooting

**"aide-memory: command not found"**
```bash
which aide-memory
cd /path/to/aide-v0
npm run build && npm link
aide-memory --version
```

**".aide directory not created"**
```bash
cd /tmp/aide-val
git status
aide-memory init
ls -la .aide/
```

**"Claude Code won't start"**
```bash
which claude
claude --version
npm install -g claude-code  # or update
```

**"Memories not found in recall log"**
```bash
aide-memory list
aide-memory recall-log --last 5
aide-memory search "keyword"
```

**"Hook not blocking/nudging"**
- Check terminal output (not Claude Code window)
- Verify memory scope matches file path
- Check tracking file exists: `ls -la .aide/tracking/`
- Verify project has ≥10 memories (if testing blocking)

---

## Notes

- **Each scenario = separate Claude Code session** (except parallel groups)
- **Do NOT reuse sessions** between scenarios
- **Keep test project intact** — do NOT delete between scenarios
- **Always rebuild before testing** — `npm run build && npm link`
- **Clear recall log before each scenario** — `aide-memory recall-log --clear`
- **Save all result files** — copy to `docs/validation/`
- **Check terminal, not Claude Code window** — hooks output to terminal
