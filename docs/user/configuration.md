# Configuration

AIDE Memory is configured via `.aide/config.json`. All keys use dot-notation and are validated against a schema.

## Config file location

```
<project-root>/.aide/config.json
```

Created by `aide-memory init`. If missing or malformed, defaults are used automatically.

## Full config schema

```json
{
  "version": 1,
  "capture": {
    "enabled": true,
    "hooks": {
      "preToolUse": true,
      "stop": true,
      "userPromptSubmit": true,
      "preCompact": true,
      "sessionStart": true
    }
  },
  "nudge": {
    "visible": false
  },
  "tags": {
    "presets": [
      "architecture",
      "testing",
      "security",
      "style",
      "integration",
      "config",
      "migration",
      "performance",
      "api-contract"
    ]
  },
  "telemetry": {
    "enabled": true
  },
  "contributor": "auto",
  "embeddings": {
    "model": "bge-small-en-v1.5",
    "backend": "transformers"
  },
  "updates": {
    "check": true
  }
}
```

## All config keys

### Hook behavior

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `hooks.read.maxBlocks` | number | `1` | Max hard-blocks per file path per session on pre-read hook. `0` disables the hook entirely. |
| `hooks.edit.maxBlocks` | number | `1` | Same as `hooks.read.maxBlocks` but for pre-edit. |
| `hooks.search.mode` | string | `"soft"` | Pre-search hook mode: `"off"`, `"soft"` (additionalContext), `"block"` (hard decision). |
| `hooks.correction.enabled` | boolean | `true` | Detect correction phrasings in user messages (`no, use X instead`, etc.) and nudge `aide_remember`. |
| `hooks.precompact.mode` | string | `"cleanup"` | `"off"` preserves tracking files across `/compact`; `"cleanup"` clears them so post-compact turns re-block cleanly. |
| `hooks.stop.schedule` | array | _(see below)_ | Phased interval for Stop hook reflection nudge. Default ramps 3→5→10 turns. |

### Recall + scope matching

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `recall.limit` | number | `20` | Max memories per `aide_recall` call before layer-diversity balancing. |
| `recall.ensureLayerDiversity` | boolean | `true` | Swap under-represented layers up into results when total is below `recall.layerDiversityMinLimit`. |
| `recall.layerDiversityMinLimit` | number | `5` | Threshold below which diversity swap applies. |
| `recall.minScopeDepth` | number | `2` | Minimum fixed-prefix segment count for a scope to match descendants at any depth. `2` means `src/api/**` matches `src/api/routes/routeA.ts`. Single-segment scopes like `src/**` are filtered as too-broad (handled via SessionStart instead). Set to `1` to restore pre-0.4.3 narrow behavior; `3+` for stricter scoping. |

### SessionStart injection

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `injection.preferences` | number\|`"all"`\|`false` | `15` | Max preferences to inject, sorted by `recalled_count desc, updated_at desc`. |
| `injection.excludeScopedPreferences` | boolean | `false` | If `true`, scoped preferences skip SessionStart and surface only via path hooks. Default `false` injects all. |
| `injection.technical` | number\|boolean | `false` | Inject technical-layer memories at SessionStart? Default off — they surface via path hooks. |
| `injection.area_context` | number\|boolean | `false` | Same for area_context layer. |
| `injection.guidelines` | `"all"`\|number\|`false` | `"all"` | Inject all guidelines regardless of scope. |
| `injection.priorityAlwaysOverride` | boolean | `true` | Include any memory with `priority: "always"` regardless of layer gating. Rendered first (before other sections) so priority memories survive the char cap. |
| `injection.maxChars` | number | `1200` | Overall character cap for the concatenated injection. Truncates with `...truncated`. |

### Scope-matching visualized: `recall.minScopeDepth`

Every memory has a `scope` (e.g. `src/api/**`, `packages/foo/**`, or no scope at all). When you open a file, aide-memory decides which scoped memories are "specific enough" to surface per-file vs which belong at session-start only. `recall.minScopeDepth` is the dial that controls this.

Think of scopes ranked by how specific they are — more path segments = more specific:

```
most specific  ↑   src/api/routes/**     (3 segments)
               │   src/api/**            (2 segments)
 less specific ↓   src/**                (1 segment)
```

The dial is a BAR: scopes above it surface per-file, scopes below it go to SessionStart instead.

**Default (`minScopeDepth: 1`) — permissive, works across project shapes:**

```
  src/api/routes/**     ← per-file recall ✓
  src/api/**            ← per-file recall ✓
  src/**                ← per-file recall ✓
 ─────── BAR ───────
  (nothing below)
```
Every scoped memory surfaces when you open a matching file. Works for `src/`-prefixed projects, flat Next.js / SvelteKit-style projects (`pages/**`, `components/**`), and monorepos (`packages/foo/**`).

**`minScopeDepth: 2` — quieter, recommended when you have many broad scopes:**

```
  src/api/routes/**     ← per-file recall ✓
  src/api/**            ← per-file recall ✓
 ─────── BAR ───────
  src/**                ← SessionStart only
```
Single-segment scopes like `src/**` are treated as "too broad for per-file" and demoted to SessionStart injection (where they surface once at session open, not on every file read). Good for projects where `src/**` is basically "everything" and you don't want it re-nudging on every file.

**`minScopeDepth: 3` — strict, edge case:**

```
  src/api/routes/**     ← per-file recall ✓
 ─────── BAR ───────
  src/api/**            ← SessionStart only
  src/**                ← SessionStart only
```
Only very-narrow scopes surface per-file. Useful if you've accumulated hundreds of mid-specific memories and want only the most-scoped ones to nudge.

**When to change:** start with default `1`. If per-file recall feels too chatty because you have many broad scopes, bump to `2`.

---

### Stop-hook rhythm visualized: `hooks.stop.schedule`

Default schedule ramps how often the Stop hook nudges "anything worth remembering?" based on how many turns deep you are in the session:

```
Turn:   1   2   3   4   5   6   7   8   9  10 11 12 13 14 15 16 17 18 19 20 ...
              ▲           ▲           ▲              ▲              ▲
            first       second       third          every-5         every-5
             fire        fire         fire

Phase 1 (turns 1-9):  every 3 turns   ← you just started, dense
Phase 2 (turns 10-29): every 5 turns  ← mid-session, lighter
Phase 3 (turns 30+):   every 10 turns ← long session, rare
```

Why phased? Early in a session you're making fresh decisions — frequent reflection catches them. After 30 turns, you're deep in implementation — spamming "anything to remember?" every 3 turns is noise.

**Custom schedules:**

```bash
# One-size-fits-all: every 5 turns forever
aide-memory config hooks.stop.schedule '[{"every":5}]'

# Aggressive reflection in first 20 turns, off afterwards
aide-memory config hooks.stop.schedule '[{"until":20,"every":3},{"every":999999}]'

# Basically never fire (useful for very long coding sessions)
aide-memory config hooks.stop.schedule '[{"every":999999}]'
```

Schedule format: array of `{until, every}` phases. Missing `until` = "rest of session."

---

### Softening threshold visualized: `memories.softening.threshold`

Default `10`. Below this total-memory count, hard-block nudges downgrade to soft nudges (so new projects don't feel hostile while you're seeding):

```
Memories in store:
   0 ──── 5 ──── 9       10 ───── 20 ────── 50+
   │               │     │                     │
   └── SOFT ───────┘     └────── HARD ─────────┘
       (empty feel)            (normal blocking)
```

- **0 memories:** pre-read/pre-edit silent (`F0` scenario — nothing to nudge about)
- **1-9 memories:** `additionalContext` soft nudge only, never hard-blocks (easier ramp-up)
- **10+ memories:** hard-blocks on first touch of each file with scoped memories (the normal behavior once you've established a habit)

**Change it:**

```bash
# More patient — soft-only until you hit 25 memories
aide-memory config memories.softening.threshold 25

# Hard-block from memory #1 (aggressive / competitive use)
aide-memory config memories.softening.threshold 0
```

---

### SessionStart budget visualized: `injection.maxChars`

Default `1200`. Sections are concatenated in this order and clipped at the cap:

```
  ┌──────────────────────────────────────────────────┐
  │ ## Always             ← priority:"always" mems   │  (renders FIRST — survives clip)
  ├──────────────────────────────────────────────────┤
  │ ## Session Preferences                           │
  ├──────────────────────────────────────────────────┤
  │ ## Technical Context  (only if injection.technical=true)
  ├──────────────────────────────────────────────────┤
  │ ## Area Context       (only if injection.area_context=true)
  ├──────────────────────────────────────────────────┤
  │ ## Guidelines                                    │
  └──────────────────────────────────────────────────┘
  ↑ total concatenated length ≤ injection.maxChars
    anything over budget gets "...truncated"
```

- **1200 (default)** — typical session-start context, ~300 tokens. Good balance for most projects.
- **600** — aggressive clip; only the top few preferences + always-memories fit. Good for token-constrained models or sessions where you want minimal preamble.
- **2000-3000** — lets richer context through. Useful if you've opted `injection.technical=true` and want technical memories to also fit.
- **Very large (10000+)** — essentially no clip; raw injection limited only by total memory count and `injection.*` per-layer caps.

**Change it:**

```bash
# Tight budget for token-conscious sessions
aide-memory config injection.maxChars 600

# Roomy budget when you've opted into technical + area_context injection
aide-memory config injection.maxChars 3000
```

---

### SessionStart layers visualized: `injection.preferences`/`technical`/`area_context`/`guidelines`

Which layers show up in your SessionStart context depends on 4 per-layer switches. Defaults:

```
  Layer             Default?    Surfaces at SessionStart?
  ─────────────────────────────────────────────────────────
  preferences       15 (top)    ✅ top 15 most-recalled
  guidelines        "all"       ✅ every guideline, no cap
  technical         false       ❌ path-hooks only
  area_context      false       ❌ path-hooks only
  priority:"always" true        ✅ injected from any layer
```

Why preferences + guidelines default ON but technical + area_context default OFF:

- **Preferences + guidelines** are "how we work" rules. Value comes from knowing them BEFORE you touch any code. Cheap tokens, high utility.
- **Technical + area_context** are "facts about this piece of code" and "decisions for this area." Value comes from knowing them WHEN you touch that area. Injecting them at session start for areas you won't touch = wasted tokens.

**Opt technical / area_context in when you want richer context up front:**

```bash
aide-memory config injection.technical all          # inject every technical memory
aide-memory config injection.area_context 10        # inject up to 10 most-recent area_context memories
```

**Tune preferences** (applies sort order + limit):

```bash
aide-memory config injection.preferences 30         # top 30 instead of top 15
aide-memory config injection.preferences false      # never inject preferences at session start
aide-memory config injection.excludeScopedPreferences true   # only project-wide prefs — scoped ones surface via path hooks
```

**Priority override** — any memory marked `priority: "always"` (set via `aide_remember`) is injected regardless of per-layer gating. Controlled via:

```bash
aide-memory config injection.priorityAlwaysOverride false   # respect per-layer gating even for priority:always memories
```

---

### Pre-search mode visualized: `hooks.search.mode`

Three states for how the Grep hook behaves when scoped memories match your search query:

```
  mode = "off"    ╎ Grep runs silently. No aide-memory nudge.
  ─────────────────────────────────────────────────────────
  mode = "soft"   ╎ Grep proceeds, but hook attaches an
  (default)       ╎ additionalContext: "N memories match;
                  ╎ call aide_search for structured results."
                  ╎ Agent can ignore or call aide_search.
  ─────────────────────────────────────────────────────────
  mode = "block"  ╎ Grep is hard-blocked with decision:block.
                  ╎ Agent MUST call aide_search first.
```

Most users want `soft` (default) — the nudge is visible without gating the tool call. Use `block` if you find the agent repeatedly grepping for things that are already stored as memories; use `off` if you never want the nudge.

---

### Pre-compact mode visualized: `hooks.precompact.mode`

Two states for what happens to session-scoped tracking files when Claude Code runs `/compact`:

```
  mode = "cleanup"   ╎ PreCompact hook clears:
  (default)          ╎   • recalled-paths-<sid>.txt  (file/ids| tracking)
                     ╎   • stop-count-<sid>.txt      (stop interval counter)
                     ╎   • correction-pending-<sid>.txt
                     ╎ → post-compact turn re-blocks cleanly; fresh state.
  ─────────────────────────────────────────────────────────
  mode = "off"       ╎ Tracking files preserved across /compact.
                     ╎ → agent's post-compact memory of "files already
                     ╎   recalled" sticks around. Some users prefer this
                     ╎   when /compact is frequent and they don't want
                     ╎   to re-nudge every compaction.
```

Recommended: `cleanup` — matches the intuition that compaction resets agent context, so recall tracking should reset too.

---

### Pre-read/pre-edit block visualized: `hooks.read.maxBlocks` & `hooks.edit.maxBlocks`

These are simple on/off. Default `1`:

```
aide-memory config hooks.read.maxBlocks 1   (default)
  ├─ first read of a file w/ untracked scoped memories  → BLOCK + path nudge
  ├─ agent calls aide_recall                             → tracking updated
  └─ subsequent reads of same file                       → SILENT

aide-memory config hooks.read.maxBlocks 0
  └─ all reads                                           → SILENT forever
     (hook fully disabled — no blocks, no soft nudges, no tracking)
```

Setting values `2+` doesn't produce different behavior from `1` in practice — once tracking catches up after the first recall, there's nothing left to block on subsequent reads. Use `0` to disable, `1` to keep it.

`hooks.edit.maxBlocks` is the same knob for the Edit/Write tools.

---

### Memory storage + scope visibility

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `memories.hideFromGrep` | boolean | `true` | Add `.aide/memories/` to an `aide-memory-managed` block in `.ignore` so grep/ripgrep skip it. Live-synced on config change. |
| `memories.softening.threshold` | number | `10` | Below this total-memory count, pre-read/pre-edit hard blocks become soft nudges. Keeps small projects friendly. |

### Integration + embeddings

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `version` | number | `1` | Config schema version |
| `tags.presets` | string[] | _(see below)_ | Available tag presets surfaced by `aide_remember`. |
| `telemetry.enabled` | boolean | **`true`** | **Default ON.** Analytics about tool-call counts + recall events are recorded to the LOCAL SQLite database (never leaves your machine — aide-memory has no phone-home channel). Set to `false` to skip recording. The name is a carryover; under the hood it only gates the local Analytics writer. |
| `contributor` | string | `"auto"` | Contributor name attached to new memories. Default `"auto"` reads `git config user.name` at memory-creation time. Any other string overrides — useful for shared repos where humans contribute under a team handle. |
| `embeddings.backend` | string | `"auto"` | Semantic-search backend. Values: `"auto"` (try transformers → ollama → keyword-only), `"transformers"` (force local, requires optional `@huggingface/transformers` dep), `"ollama"` (force local Ollama server at `localhost:11434`), `"none"` (disable semantic search). |
| `embeddings.model` | string | `"auto"` | Model name for the active backend. `"auto"` uses backend defaults (`Xenova/bge-small-en-v1.5` for transformers, `nomic-embed-text` for ollama). Override with any model the backend supports. |
| `updates.check` | boolean | `true` | Check for new npm versions after each command (non-blocking). |

> **Note on removed keys (0.4.3):** `capture.*` family and `nudge.visible` were previously listed as valid but had no runtime effect. They're removed from the valid-keys list as of 0.4.3. If you had them in your config, they're now silently ignored. Replace `capture.hooks.preToolUse=false` with `hooks.read.maxBlocks=0` + `hooks.edit.maxBlocks=0`; replace `capture.hooks.stop=false` with `hooks.stop.schedule=[{"every":100}]` (effectively off); replace `capture.hooks.userPromptSubmit=false` with `hooks.correction.enabled=false`. `nudge.visible` will return (with real wiring) when the hook-output visibility UX lands.

## Reading config

```bash
# Read a single key
aide-memory config hooks.read.maxBlocks
# Output: 1

# Read a nested key
aide-memory config telemetry.enabled
# Output: true

# Read an object (returns JSON)
aide-memory config tags.presets
# Output: ["architecture","testing","security","style","integration","config","migration","performance","api-contract"]
```

## Setting config

```bash
# Set a boolean
aide-memory config telemetry.enabled false

# Set a string
aide-memory config contributor "Ahmed Meky"

# Set a number
aide-memory config recall.minScopeDepth 1
```

Values are auto-parsed from strings:
- `"true"` / `"false"` become booleans
- Numeric strings become numbers
- JSON arrays/objects are parsed as JSON
- Everything else stays a string

## Disabling individual hooks

```bash
# Silence the pre-read hook (no blocking or nudge on file reads)
aide-memory config hooks.read.maxBlocks 0

# Disable correction detection
aide-memory config hooks.correction.enabled false

# Effectively disable the Stop reflection nudge (fire only every 100 turns)
aide-memory config hooks.stop.schedule '[{"every":100}]'
```

## Tag management

Tags are stored in `tags.presets` as an array. The CLI uses the `AideConfig` class internally, which provides `addTag()` and `removeTag()` methods. From the CLI, set the entire array:

```bash
# View current presets
aide-memory config tags.presets

# The AideConfig class (used by MCP tools) supports:
#   config.addTag("deployment")    — adds if not present
#   config.removeTag("migration")  — removes if present
```

Default presets: `architecture`, `testing`, `security`, `style`, `integration`, `config`, `migration`, `performance`, `api-contract`.

## Embedding configuration

AIDE Memory supports optional semantic search via embeddings. When enabled, memories are embedded at creation time and search falls back to semantic similarity when keyword matching finds fewer than 3 results.

```bash
# Default: auto — try transformers (if installed), then ollama, then keyword-only
aide-memory config embeddings.backend auto

# Force local Transformers.js backend (requires: npm install -g @huggingface/transformers)
aide-memory config embeddings.backend transformers
aide-memory config embeddings.model Xenova/bge-small-en-v1.5

# Force Ollama (requires Ollama running at localhost:11434)
aide-memory config embeddings.backend ollama
aide-memory config embeddings.model nomic-embed-text

# Disable semantic search entirely (keyword-only)
aide-memory config embeddings.backend none
```

Embeddings are optional. The `@huggingface/transformers` package is NOT installed by default — semantic search works out of box only if you install it (or have Ollama running). Without either, search uses FTS5 (BM25 ranking) with a LIKE fallback, which works well for most use cases. `embeddings.model` accepts any model name the active backend supports; `"auto"` uses backend defaults.

## Telemetry (default ON — opt-out)

AIDE Memory records LOCAL analytics about tool-call counts and recall events by default. This data never leaves your machine — there's no phone-home channel. It's written to the SQLite database at `~/.aide/projects/<hash>/memory.db` and shows up in `aide-memory stats`.

```bash
# Stop recording analytics (default is enabled = true)
aide-memory config telemetry.enabled false
```

The "telemetry" name is a carryover from the original opt-in framing; under the hood it only gates the local Analytics writer in `store.ts`. There is no network transmission regardless of this flag.

## Update checks

AIDE Memory checks for new versions after each command (non-blocking). To disable:

```bash
aide-memory config updates.check false
```

## Resetting config

The `AideConfig` class supports a `reset()` method that restores all values to defaults and saves to disk. This is available programmatically:

```typescript
const config = new AideConfig(projectRoot);
config.reset(); // Resets to defaults, saves .aide/config.json
```

To reset from the CLI, delete the config file and re-init:

```bash
rm .aide/config.json
aide-memory init
```
