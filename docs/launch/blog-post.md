# aide-memory: persistent memory for AI coding agents and teams

*April 29, 2026*

<video src="https://aide-memory.dev/demo.mp4" autoPlay muted playsInline loop style={{ width: '100%', maxWidth: '800px', borderRadius: '8px', margin: '1.5rem auto', display: 'block' }} />

What lives in your head doesn't flow across AI sessions, and doesn't always make it to your team. How features fit together in your system, the patterns you follow in an area, the reasoning behind decisions — they're not always captured by CLAUDE.md and .cursorrules.

Coding with agents made me more productive, but made me repeat myself. So I built aide-memory — an auto-captured, auto-recalled, path-scoped memory tool for AI coding agents and teams.

## Why rules files aren't enough on their own

CLAUDE.md and .cursorrules help with part of this. But they have real limits:

- **Corrections don't make it back.** You correct the agent in conversation. The lesson works for that session. Unless someone manually edits the rules file afterwards, it doesn't persist.
- **Area-specific knowledge isn't always documented.** How a feature ties into the larger system, the architectural decisions in a specific module, the reasons certain things are built the way they are. Not all of that fits in a project-wide rules file, and there's no way to scope it to a code area.
- **The whole file gets injected on every turn.** Whether the agent is working in auth, the dashboard, or the settings panel, it gets the same block of text. Relevant context competes with non-relevant context for space in the window.
- **Team handoff is manual.** The corrections and decisions from your sessions don't flow to your teammate's agent automatically.

aide-memory sits alongside rules files, not above or below. Rules files for static, always-on guidance. aide-memory for the dynamic, scoped knowledge that grows with the codebase.

## Capture happens as you work

You don't have to remember to save anything. The preferences, technical context, area decisions, and team guidelines that come up while you build are captured as you work. Six hooks fire across the session lifecycle, installed by `aide-memory init` — you don't manage them.

**Correction detection.** When you correct the agent ("no, we don't do it that way", "use composition instead"), the UserPromptSubmit hook detects the correction and prompts the agent to store it, scoped to the code area you're working in.

**Periodic reflection.** At the end of turns, the Stop hook prompts "anything worth remembering?" on a tunable schedule (frequent early in the session, less frequent in long sessions). Area decisions and technical context get captured here.

**Session start.** When a session begins, the SessionStart hook injects your top preferences, team guidelines, and priority-always memories so the agent starts with context rather than a blank slate.

**Pre-read prompting.** Before the agent reads or edits a file, the PreToolUse hook checks if relevant memories exist for that path. If they haven't been recalled yet this session, it prompts the agent to recall them first.

Capture happens because the editor fires the hook, not because someone remembers to call a tool.

## Recall is scoped to where you're working

Instead of dumping global context on every prompt, when the agent opens a file aide-memory matches the path against stored scopes (`src/components/dashboard/**`, `packages/api/**`) and surfaces only what's relevant to that area.

Four layers organize the knowledge:

| Layer | What it captures | Example |
|---|---|---|
| **preferences** | How a contributor likes to work | "Prefer modular component structure, separate concerns into smaller files" |
| **technical** | Facts not obvious from code | "Dashboard data fetching uses React Query with stale-while-revalidate" |
| **area_context** | Decisions tied to code areas | "Settings panel uses progressive disclosure; new sections follow the expand/collapse pattern" |
| **guidelines** | Team-wide principles | "Mock external calls at the network boundary in tests, not at the function boundary" |

Recall ranks `area_context` first (most specific to the area), then `technical`, then `preferences`, then `guidelines`. Scoped memories rank above project-wide ones.

The agent gets what applies to where it's working, not a global dump of non-relevant text.

## Your team's agents learn from yours

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
