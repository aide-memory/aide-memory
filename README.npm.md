# aide-memory

**Auto-captured, auto-recalled, path-scoped memory for AI coding agents and teams.**

**Website:** https://aide-memory.dev

**Docs:** https://aide-memory.dev/docs

**Install:** `npm install -g aide-memory && aide-memory init`

---

## The problem

Coding with agents has made developers significantly more productive. But it's created a new kind of friction.

You explain how the feature you're building ties into the rest of the system, the way you like to structure your code, the patterns to follow in this area. The agent gets it. You ship great work together. Next session, it's a blank slate. You re-explain the same things.

Critical decisions being made during conversations aren't being captured. Preferences, corrections, area knowledge, guidelines. So much valuable context doesn't persist, doesn't flow to the next session, to a different tool, or to a teammate's agent when they pick up work in the same area.

Rules files (CLAUDE.md, .cursorrules) help, but they have real limits:

- **No unified convention or structure.** A team guideline, a personal preference, an area decision, and a stack fact all blur into one file. The whole file gets injected on every turn, even when most of it might not be relevant to the area the agent is working in.
- **Corrections don't make it back.** What you teach the agent in conversation doesn't make it back into the rules file on its own.
- **Tool-specific.** What you teach your agent in Claude Code doesn't carry to Cursor unless you copy the file over manually.
- **Unscoped recall.** The whole file lands in context, or nothing does. There's no prompt for the agent to pull a relevant subset based on the file it just opened.

aide-memory fills these gaps. It sits alongside your rules files, not above or below. Rules files for static, always-on guidance. aide-memory for the dynamic, scoped knowledge that grows with the codebase.

---

## How it works

### Capture happens automatically

Six hooks fire across the session lifecycle, installed by `aide-memory init`:

- **UserPromptSubmit**: detects corrections ("no, use X instead") and prompts the agent to store them scoped to the code area
- **Stop**: periodic reflection ("anything worth remembering?") on a tunable schedule picks up decisions and findings
- **SessionStart**: injects top preferences, guidelines, and priority-always memories so the agent starts with context
- **PreToolUse**: before the agent reads or edits a file, checks if relevant memories exist for that path and prompts recall
- **PostToolUse**: records what was recalled so re-reads don't re-prompt
- **PreCompact**: clears session tracking before context compaction so post-compact reads re-prompt cleanly

### Recall is scoped

Memories attach to code areas via glob scopes (`src/components/dashboard/**`, `packages/api/**`). When the agent opens a file, aide-memory matches the path against stored scopes and surfaces what's relevant to that area.

Four layers organize the knowledge:

| Layer | What it captures | Example |
|---|---|---|
| **preferences** | How a contributor likes to work | "Prefer modular component structure, separate concerns into smaller files" |
| **technical** | Facts not obvious from code | "Dashboard data fetching uses React Query with stale-while-revalidate" |
| **area_context** | Decisions tied to code areas | "Settings panel uses progressive disclosure; new sections follow the expand/collapse pattern" |
| **guidelines** | Team-wide principles | "Mock external calls at the network boundary in tests, not at the function boundary" |

Recall ranks `area_context` first (most specific), then `technical`, then `preferences`, then `guidelines`. Scoped memories rank above project-wide ones.

### Git-synced for teams

Memories are JSON files under `.aide/memories/`. Commit, push, pull. A `post-checkout` git hook rebuilds the local cache after `git pull` so your teammate's agent picks up your context on their next file read. Personal preferences (`preferences/personal/`) are gitignored. Team conventions travel with the repo.

### Cross-tool

Claude Code and Cursor read the same `.aide/memories/` directory. A memory captured in one tool is available in the other. Codex, Copilot, and Windsurf get a rules template at launch; deeper integration may come based on user feedback.

---

## Quick start

```bash
# 1. Install and initialize
npm install -g aide-memory
aide-memory init

# 2. Restart your editor so the MCP server registers
#    Claude Code: start a fresh session
#    Cursor: Cmd+Q, reopen, enable in Settings > MCP

# 3. Store a memory
aide-memory remember "Dashboard uses skeleton loading, not spinners" \
  --layer area_context --scope "src/components/dashboard/**"

# 4. Recall context for a path
aide-memory recall src/components/dashboard/

# 5. Share with your team
git add .aide/memories/
git commit -m "Capture dashboard conventions"
git push
```

Full walkthrough: https://aide-memory.dev/docs/quick-start

---

## What's in the box

- **7 MCP tools**: `aide_recall`, `aide_remember`, `aide_update`, `aide_forget`, `aide_search`, `aide_memories`, `aide_import`
- **13 CLI commands**: `init`, `recall`, `remember`, `update`, `forget`, `search`, `list`, `stats`, `recall-log`, `config`, `sync`, `migrate`, `cleanup`
- **6 hooks** wired into the editor at `init`
- **4 typed memory layers** with personal/shared split for preferences
- **FTS5 keyword search** plus optional semantic search via Transformers.js or Ollama

---

## Tunable

aide-memory ships with defaults you can adjust:

- How often the agent gets prompted to reflect and store context
- How specific a scope needs to be before a memory surfaces per-file vs session-start-only
- How much context gets injected at session start
- Which hooks are active (disable per-file blocking, turn off correction detection)
- Personal vs shared preferences (gitignored or committed, configurable per-project)

`aide-memory init` seeds `.aide/config.json` with all public settings. Full reference: https://aide-memory.dev/docs/configuration

---

## Privacy

Memory content stays on your machine. Anonymized usage counts (event type, hashed machine ID, platform, Node version) ship to PostHog by default so we can see which features are used. Disable with `AIDE_TELEMETRY=off`.

---

## Editor support

| Editor | Status |
|---|---|
| **Claude Code** | Reference adapter. Start a fresh session after `init` so the MCP server registers. |
| **Cursor** | Full hook + MCP wiring. Cmd+Q and reopen after `init`, then toggle aide-memory ON in Settings > MCP. |
| **Windsurf, Codex, Copilot** | Rules template at launch. Deeper integration may come based on user feedback. |

Per-editor details: https://aide-memory.dev/docs/supported-editors

---

## Requirements

- **Node.js 18 or later**
- **npm or npx**

No Docker. No external databases. No API keys. No cloud accounts.

---

## License

Free to use. See [LICENSE](LICENSE) for terms.

---

## Documentation

Full docs: **https://aide-memory.dev**

- [Quick Start](https://aide-memory.dev/docs/quick-start)
- [Concepts](https://aide-memory.dev/docs/concepts)
- [Configuration](https://aide-memory.dev/docs/configuration)
- [Reference](https://aide-memory.dev/docs/reference)
- [Hooks](https://aide-memory.dev/docs/hooks)
- [Supported Editors](https://aide-memory.dev/docs/supported-editors)
- [Comparison](https://aide-memory.dev/docs/comparison)
- [FAQ](https://aide-memory.dev/docs/faq)
