# aide-memory: persistent memory for AI coding agents and teams

*April 29, 2026*

## The bottleneck isn't the models, the compute, or the agents. It's context.

AI has changed how we build software, with better models, amazing tools, faster workflows. But the bottleneck I keep hitting isn't any of those. It's context. What lives in your head, your team's domain knowledge, what isn't captured in documentation or rules files, what lives and dies inside agent sessions.

Coding with agents has made developers significantly more productive. But it's created a new kind of friction. You explain how the feature you're building ties into the rest of the system, the way you like to structure your code, the patterns to follow in this area. The agent gets it. You ship great work together. Next session, it's a blank slate. You re-explain the same things.

Critical decisions being made during conversations aren't being captured. Preferences, corrections, area knowledge, guidelines. So much valuable context doesn't persist, doesn't flow to the next session, to a different tool, or to a teammate's agent when they pick up work in the same area.

The agents are capable. The models are good. What's missing is the layer in between: a way to capture the corrections, decisions, and area knowledge that come up in conversation, scope them to where they apply, and share them across sessions, tools, and teammates.

## Why rules files aren't enough

Rules files (CLAUDE.md, .cursorrules) help with part of this. But they have real limits:

- **Corrections don't make it back.** You correct the agent in conversation. The lesson works for that session. Unless someone manually edits the rules file afterwards, it doesn't persist.
- **Area-specific knowledge isn't always documented.** How a feature ties into the larger system, the architectural decisions in a specific module, the reasons certain things are built the way they are. Not all of that fits in a project-wide rules file, and there's no way to scope it to a code area.
- **The whole file gets injected on every turn.** Whether the agent is working in auth, the dashboard, or the settings panel, it gets the same block of text. Relevant context competes with non-relevant context for space in the window.
- **Team handoff is manual.** The corrections and decisions from your sessions don't flow to your teammate's agent automatically.

aide-memory adds the layer rules files don't do. It sits alongside them, not above or below. Rules files for static, always-on guidance. aide-memory for the dynamic, scoped knowledge that grows with the codebase.

## How capture works

Six hooks fire across the session lifecycle, installed by `aide-memory init`. You don't manage them.

**Correction detection.** When you correct the agent ("no, we don't do it that way", "use composition instead"), the UserPromptSubmit hook detects the correction and prompts the agent to store it, scoped to the code area you're working in.

**Periodic reflection.** At the end of turns, the Stop hook prompts "anything worth remembering?" on a tunable schedule (frequent early in the session, less frequent in long sessions). Area decisions and technical context get captured here.

**Session start.** When a session begins, the SessionStart hook injects your top preferences, team guidelines, and priority-always memories so the agent starts with context rather than a blank slate.

**Pre-read prompting.** Before the agent reads or edits a file, the PreToolUse hook checks if relevant memories exist for that path. If they haven't been recalled yet this session, it prompts the agent to recall them first.

Capture happens because the editor fires the hook, not because someone remembers to call a tool.

## How recall works

Memories attach to code areas via glob scopes (`src/components/dashboard/**`, `packages/api/**`). When the agent opens a file, aide-memory matches the path against stored scopes and surfaces what's relevant to that area.

Four layers organize the knowledge:

| Layer | What it captures | Example |
|---|---|---|
| **preferences** | How a contributor likes to work | "Prefer modular component structure, separate concerns into smaller files" |
| **technical** | Facts not obvious from code | "Dashboard data fetching uses React Query with stale-while-revalidate" |
| **area_context** | Decisions tied to code areas | "Settings panel uses progressive disclosure; new sections follow the expand/collapse pattern" |
| **guidelines** | Team-wide principles | "Mock external calls at the network boundary in tests, not at the function boundary" |

Recall ranks `area_context` first (most specific to the area), then `technical`, then `preferences`, then `guidelines`. Scoped memories rank above project-wide ones.

The agent gets what applies to where it's working, not a global dump of non-relevant text.

## Git-synced for teams

Memories are JSON files under `.aide/memories/`. Commit, push, pull.

```bash
git add .aide/memories/
git commit -m "Capture dashboard patterns and settings panel decisions"
git push
```

When your teammate pulls, a `post-checkout` git hook rebuilds the local cache. Their agent's next read in the area you've been working in picks up the context you stored.

Personal preferences (`preferences/personal/`) are gitignored. Team conventions travel with the repo. Context starts flowing between teammates and their agents without anyone editing the same flat file.

## Cross-tool

Claude Code and Cursor read the same `.aide/memories/` directory. A memory captured in one tool is available in the other. Switch tools and the context comes with you.

Codex, Copilot, and Windsurf get a rules template at launch; deeper integration may come based on user feedback.

## Tunable

aide-memory ships with defaults you can adjust:

- **How often the agent gets prompted** to reflect and store context (frequent early in a session, rare in long ones, or set your own schedule)
- **How specific a scope needs to be** before a memory surfaces per-file vs only at session start
- **How much context gets injected** at session start (character cap, per-layer toggles)
- **Which hooks are active** (disable per-file blocking, turn off correction detection, adjust the reflection schedule)
- **Personal vs shared** preferences (gitignored or committed, configurable per-project)

`aide-memory init` seeds `.aide/config.json` with all public settings so you can see and edit them in one place. Full config reference: https://aide-memory.dev/docs/configuration

## Privacy

Memories are JSON files on your disk plus a local SQLite cache. Memory content stays on your machine. Telemetry is on by default — only event types and machine-anonymous counts (event name, hash of `hostname:username`, platform, arch, Node version) are sent. The sender IP is not transmitted, so location is not derived from events. To turn it off: `AIDE_TELEMETRY=off` or `aide-memory config telemetry.enabled false`.

## Try it

```bash
npm install -g aide-memory
aide-memory init
```

Creates `.aide/`, installs hooks, configures the MCP server, writes rules files for Claude Code and Cursor. Start a fresh editor session after init so the MCP server registers.

Free to use.

- Docs: https://aide-memory.dev
- Quick start: https://aide-memory.dev/docs/quick-start
- GitHub: https://github.com/aide-memory/aide-memory
- Issues / feature requests: https://github.com/aide-memory/aide-memory/issues
