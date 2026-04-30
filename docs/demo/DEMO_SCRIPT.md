# AIDE Memory Demo Script

This document provides seven complete demo sequences showing core AIDE Memory features. Each sequence includes setup state, commands, expected output, suggested timing, and narration notes for recording.

---

## Demo Sequence 1: `aide-memory init` — Fresh Project Setup

### Objective
Show how to initialize a new project with AIDE Memory in under 10 seconds.

### Setup State
- A brand-new project directory with git initialized
- Terminal at project root
- No `.aide/` directory yet

### Commands & Flow

```bash
$ pwd
/Users/demo/projects/my-app

$ ls -la | grep aide
# (no output — .aide/ doesn't exist yet)

$ npm install -g aide-memory && aide-memory init
```

### Expected Output

```
✓ Project initialized for aide-memory.

Created:
  + .aide
  + .aide/memories
  + .aide/memories/preferences
  + .aide/memories/preferences/personal
  + .aide/memories/preferences/shared
  + .aide/memories/technical
  + .aide/memories/area_context
  + .aide/memories/guidelines
  + .aide/cache
  + .claude/rules/aide-memory.md
  + .cursor/rules/aide-memory.mdc
  + .aide/config.json
  .gitignore entry: .aide/memories/preferences/personal/
  .gitignore entry: .aide/cache/
  .gitignore entry: .aide/recall-log.jsonl
  .gitignore entry: .aide/pending-memories.jsonl
  + .git/hooks/post-checkout
```

### Verification Commands (optional, for visual impact)

```bash
$ tree .aide -L 2
.aide
├── cache
├── config.json
├── memories
│   ├── area_context
│   ├── guidelines
│   ├── preferences
│   └── technical
└── rules
```

Or simpler:
```bash
$ ls -la .aide/memories/
```

### Recording Duration
**10–15 seconds** (command + output + optional tree view)

### Narration Notes
- "AIDE Memory initializes a fresh project in seconds."
- "Zero configuration needed."
- "The `.aide/` directory is git-friendly — preferences/personal is gitignored, but technical, guidelines, and shared preferences are version-controlled."
- "Hooks are automatically installed, so no manual setup is required."

---

## Demo Sequence 2: `aide-memory remember` — Store a Memory via CLI

### Objective
Show how to manually capture a memory about a codebase decision.

### Setup State
- Fresh project initialized (from Demo 1)
- Terminal at project root
- `.aide/memories/` directory exists and is empty

### Commands & Flow

```bash
$ aide-memory remember "Use camelCase for all API response keys, never snake_case" \
  --layer guidelines \
  --scope "src/api/**" \
  --tags "api-design, response-format" \
  --why "Consistency with frontend naming conventions"
```

### Expected Output

```
✓ Memory stored (ID: abc12345...)

Layer: guidelines
Scope: src/api/**
Tags: api-design, response-format
Content: Use camelCase for all API response keys, never snake_case
```

### Verification Commands

```bash
$ cat .aide/memories/guidelines/abc12345.json
```

(Shows a readable JSON file with the memory)

```bash
$ aide-memory list --layer guidelines
```

(Shows the memory in a table)

### Recording Duration
**10–12 seconds** (command + output + cat verification)

### Narration Notes
- "Memories are human-readable JSON files, stored one per file."
- "Each memory is tied to a scope — in this case, `src/api/**`."
- "Scoping ensures the agent only sees relevant memories when working on specific files."
- "The `--why` flag captures context about the decision, making it clear to future sessions why this rule exists."
- "Files are committed to git, so the team shares knowledge."

---

## Demo Sequence 3: Recall in Action — Claude Code Hook Nudge + `aide_recall`

### Objective
Show how AIDE Memory nudges Claude Code when opening a file, and what recall returns.

### Setup State
- Project initialized
- One memory stored in `src/api/**` scope (from Demo 2)
- Claude Code or Cursor open with the project
- File: `src/api/users.ts` open (or about to be opened)

### Narration Intro

"When you open a file in Claude Code, the PreToolUse hook automatically nudges you with relevant memories. Let's see that in action."

### Flow

1. **In Claude Code / Cursor:**
   - Open `src/api/users.ts` (or navigate to a file in `src/api/`)
   - Show the nudge message in the context window (from the PreToolUse hook):
     ```
     💡 aide-memory: 2 memories available for src/api/users.ts
     ```

2. **In Terminal (parallel or sequentially):**
   ```bash
   $ aide-memory recall src/api/users.ts
   ```

### Expected Output (Terminal)

```
Recalling memories for: src/api/users.ts

Guidelines (2 matches):
  • Use camelCase for all API response keys, never snake_case
    Scope: src/api/**
    Tags: api-design, response-format
    
  • Return consistent error objects { code, message, details }
    Scope: src/api/**
    Tags: error-handling

Technical (1 match):
  • User routes use auth middleware from src/middleware/auth
    Scope: src/api/users.ts
```

### Recording Duration
**12–15 seconds** (show nudge + switch to terminal + run recall)

### Narration Notes
- "The hook automatically detects you're working on API code."
- "Instead of dumping all memories (which would be ~2,000 tokens), it shows a brief nudge: 'N memories exist.'"
- "When you need those memories, you run `aide-memory recall <path>`."
- "Memories are returned in priority order: preferences, technical, guidelines."
- "The agent can see both path-scoped memories (for `src/api/**`) and specific-file memories (for `src/api/users.ts`)."

---

## Demo Sequence 4: Path Scoping — Show How Scope Isolation Works

### Objective
Demonstrate that memories scoped to `src/auth/` do not appear for `src/api/` files.

### Setup State
- Project initialized with multiple memories:
  - One scoped to `src/api/**` (from Demo 2)
  - One scoped to `src/auth/**` (add before demo, or create during)
  - One project-wide (no scope)

### Commands & Flow

First, create an auth memory:

```bash
$ aide-memory remember "JWT tokens must expire in 1 hour (3600 seconds)" \
  --layer guidelines \
  --scope "src/auth/**" \
  --tags "authentication, security"
```

Then show the isolation:

```bash
$ aide-memory recall src/api/users.ts
```

(Output shows only API memories + project-wide, NOT auth memories)

```bash
$ aide-memory recall src/auth/jwt.ts
```

(Output shows only auth memories + project-wide)

### Expected Output for API recall

```
Recalling memories for: src/api/users.ts

Guidelines (2 matches):
  • Use camelCase for all API response keys...
  • Return consistent error objects...
```

(No auth memory appears)

### Expected Output for Auth recall

```
Recalling memories for: src/auth/jwt.ts

Guidelines (2 matches):
  • JWT tokens must expire in 1 hour (3600 seconds)
  • Use strong random salts for password hashing...
```

(No API memory appears)

### Recording Duration
**15–18 seconds** (create auth memory + show two separate recalls)

### Narration Notes
- "Path scoping is crucial: the agent only sees memories relevant to its current context."
- "A memory about JWT tokens won't clutter the context when working on API response formatting."
- "This keeps the memory cost low — typically ~20 tokens per file read, not ~2,000."
- "Scopes use glob patterns, so `src/auth/**` matches any file under `src/auth/`, including subdirectories."

---

## Demo Sequence 5: Correction Capture — Store a Memory from a Correction

### Objective
Show how AIDE Memory's UserPromptSubmit hook detects correction patterns and nudges the agent to store them as memories.

### Setup State
- Project initialized
- Claude Code or Cursor open with the project

### Narrative Setup

"Correction capture is where the magic happens. When you correct the AI, the UserPromptSubmit hook detects the pattern and nudges the agent to store it as a memory."

### Flow (Simulated Scenario)

1. **Scenario Setup in Claude Code:**
   - You ask the agent to write a function in `src/api/products.ts`
   - The agent writes it with snake_case keys in the response
   - You correct it: "Actually, use camelCase for the API response — that's our standard"

2. **Behind the Scenes (Terminal, for demo proof):**
   ```bash
   $ aide-memory recall-log --last 1
   ```

   (Shows the correction was detected and logged)

3. **Verify the Auto-Stored Memory:**
   ```bash
   $ aide-memory list --layer guidelines --scope "src/api/**"
   ```

   (Shows the correction is now a stored guideline)

### Expected Output

```
Corrections detected and stored (last session):
  • camelCase keys in API responses (detected from correction in src/api/products.ts)
  • Scope auto-set to: src/api/**
  • Source: UserPromptSubmit hook
```

### Recording Duration
**20–25 seconds** (scenario narration + terminal verification)

### Narration Notes
- "AIDE Memory learns from corrections, not just from explicit remember commands."
- "The hook detects correction patterns and nudges the agent to store them -- achieving high adoption vs. 0% for voluntary commands."
- "The agent is corrected on `camelCase`, and that becomes a guideline for next time -- no busywork for you."
- "This reduces context thrashing and speeds up convergence to the right behavior."

---

## Demo Sequence 6: Cross-Session Persistence — Reopen and Show Memories Persist

### Objective
Demonstrate that memories are persistent across sessions — close Claude Code, reopen it, and memories are still there.

### Setup State
- Project initialized with several memories (from previous demos)
- Claude Code open with memories stored

### Commands & Flow

1. **In Claude Code:**
   - Show the current memories (run `aide-memory list` in terminal for proof)
   - Close Claude Code entirely (Cmd+Q or File > Quit)

2. **Wait 2–3 seconds** (for visual impact)

3. **Reopen Claude Code:**
   - Open Claude Code again on the same project
   - Navigate to a file in `src/api/` again

4. **In Terminal:**
   ```bash
   $ aide-memory recall src/api/users.ts
   ```

   (Same memories are returned — they persist)

### Expected Output

```
Recalling memories for: src/api/users.ts

Guidelines (2 matches):
  • Use camelCase for all API response keys, never snake_case
  • Return consistent error objects { code, message, details }
```

(Identical to previous sessions)

### Recording Duration
**12–15 seconds** (close app, reopen, run recall)

### Narration Notes
- "Memories are stored in `.aide/memories/` as individual JSON files."
- "These files are committed to git, so they sync across machines via standard version control."
- "The agent has access to the same context every time — no lost knowledge between sessions."
- "This is critical for long-running projects: the agent never relearns the same lessons."

---

## Demo Sequence 7: Full Flow — Init → Remember → Work → Recall → Correct → Persist

### Objective
Show the complete AIDE Memory lifecycle in one continuous demo (the most impressive for marketing).

### Setup State
- A brand-new, empty project directory with git initialized
- Terminal at project root

### Narrative Intro

"Here's the complete workflow in action: initialize, store knowledge, work with the agent, recall context, correct if needed, and watch it persist."

### Full Flow

#### Step 1: Initialize (5 seconds)
```bash
$ npm install -g aide-memory && aide-memory init
✓ Project initialized for aide-memory.
```

#### Step 2: Store Initial Knowledge (8 seconds)
```bash
$ aide-memory remember "Routes use async/await, never callbacks" \
  --layer guidelines \
  --scope "src/routes/**"

$ aide-memory remember "Database: PostgreSQL, queries via Knex.js" \
  --layer technical \
  --scope "src/db/**"
```

#### Step 3: Agent Generates Code (5 seconds)
Narrate: "Now we open Claude Code and ask the agent to build a feature."
- Show Claude Code opening the project
- Show a memory nudge appearing
- Narrate: "The agent sees the nudge: '2 memories exist for src/routes/...'"

#### Step 4: Recall the Context (8 seconds)
```bash
$ aide-memory recall src/routes/posts.ts
```

Output:
```
Guidelines (1 match):
  • Routes use async/await, never callbacks
Technical (1 match):
  • Database: PostgreSQL, queries via Knex.js
```

#### Step 5: Agent Works & Gets Corrected (simulated, 8 seconds)
Narrate: "The agent writes a route handler using callbacks instead of async/await. We correct it."
- Show correction in Claude Code (or simulate with a terminal example)
- The hook detects the correction

#### Step 6: Verify Persistence (8 seconds)
```bash
$ aide-memory recall-log --last 1
✓ Correction detected and stored

$ aide-memory list
```

Output shows all memories, with the latest correction included.

### Total Recording Duration
**40–50 seconds** (entire end-to-end flow)

### Narration Script

```
"AIDE Memory is persistent, path-scoped context for AI coding agents.
Let's see how it works end-to-end.

First: Initialize. One command.
[init output]

Next: Store what you know. Project rules, tech stack, decisions.
[remember commands]

Then: Open Claude Code and start working.
[Claude Code opens, nudge appears]

The agent sees a gentle nudge — '2 memories exist for this path' —
instead of a 2,000-token context dump.

When it needs the full context, it recalls:
[recall output]

The agent works. Sometimes it needs correction.
[show correction]

And AIDE Memory learns from that correction automatically.

Check the list of memories:
[list output]

The correction is now a guideline for next time.

Sessions end. Machines get turned off.
New sessions begin. The memories are still there.
The agent never relearns the same lesson twice.

That's AIDE Memory: persistent, structured, scope-driven context.
No cloud. No API keys. Just files in git."
```

### Narration Notes
- Build momentum: each step is quick and visual
- Emphasize the "nudge not dump" philosophy
- Show the automatic correction capture as the most powerful feature
- End with the promise: "never relearn the same lesson"

---

## Tips for Recording All Demos

---

## Demo Sequence 8: Before/After Comparison — Without vs With AIDE Memory

### Objective
Show the same task performed twice: once without aide-memory (agent lacks context, makes mistakes or asks unnecessary questions), and once with aide-memory (agent has context, gets it right immediately). This is the strongest marketing asset.

### Setup State
- Two separate terminal windows side by side (or recorded sequentially, edited together)
- Same test project with realistic code (use validation-setup.sh)
- Left/first: no aide-memory installed (clean project, no .aide/)
- Right/second: aide-memory initialized with seeded memories

### Scenario A: "Add a new API endpoint"

**WITHOUT aide-memory:**
```
User: "Add a GET /users/:id endpoint to src/api/routes.ts"
```
Expected agent behavior (no context):
- Reads the file — no hook, no context
- Writes the endpoint — may use callbacks instead of async/await
- May use `moment` for date formatting
- May return snake_case response fields
- Doesn't know about rate limiting or auth requirements

**WITH aide-memory:**
```
User: "Add a GET /users/:id endpoint to src/api/routes.ts"
```
Expected agent behavior (with context):
- Reads the file — hook blocks, recalls 5+ memories for src/api/
- Gets context: "Use async/await", "All API responses use camelCase", "API rate limiting is 100 req/min", "API handlers return ISO 8601 timestamps"
- Writes the endpoint correctly: async/await, camelCase, ISO timestamps
- Follows all conventions without being told

### Scenario B: "Fix the auth middleware"

**WITHOUT aide-memory:**
```
User: "The auth middleware needs to validate tokens, not just check they exist"
```
Expected agent behavior (no context):
- Reads middleware — no hook, no context
- May implement bcrypt/argon2 password checking instead of JWT
- Doesn't know it's JWT RS256
- Doesn't know "never log auth tokens to console"

**WITH aide-memory:**
```
User: "The auth middleware needs to validate tokens, not just check they exist"
```
Expected agent behavior (with context):
- Reads middleware — hook blocks, recalls: "Auth uses JWT with RS256", "Auth middleware validates Bearer tokens only", "Never log auth tokens to console"
- Implements JWT verification with RS256
- Doesn't add console.log for tokens
- Gets it right first try

### Recording Notes
- Record each scenario separately, edit together as split-screen or sequential
- Highlight the hook nudge and recall output in the "with" version
- Total duration: ~3-4 minutes (1.5-2 min each side)
- Narration: "Watch what happens when the agent has no context... now watch the same task with aide-memory."

### Key Metrics to Capture
- Number of back-and-forth messages needed (without > with)
- Correctness of first attempt (without: partial, with: complete)
- Conventions followed automatically (without: 0, with: all)

---

## General Recording Tips

1. **Font Size:** Use 16pt terminal font for legibility
2. **Colors:** Dark theme preferred (matches most developer workflows)
3. **Pacing:** 
   - Command execution: normal speed
   - Output reading: pause for 1–2 seconds after output appears
   - Narration: speak clearly, one thought per sentence
4. **Edits:** If a command fails, trim it (show only successful takes)
5. **Audio:** Separate narration from terminal sounds if possible (add in post-production)
6. **GIF Optimization:** Aim for 10–20 MB GIFs (see RECORDING_SETUP.md for conversion)
