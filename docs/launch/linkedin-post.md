# LinkedIn launch post

We always want the best models, the best tools, a better AI-assisted workflow. But the bottleneck I keep hitting isn't any of those. It's context. What lives in your head, your team's domain knowledge, what isn't captured in documentation or rules files, what lives and dies inside agent sessions.

I've been coding with AI agents for a while now and they've made me so much more productive. But they've also made me repeat myself. I explain how the feature I'm building ties into the rest of the system, the way I like to structure my code, the patterns to follow in this area. The agent gets it. We ship great work together. Next session, it's a blank slate. I re-explain the same things.

Critical decisions being made during conversations aren't being captured. Preferences, corrections, area knowledge, guidelines. So much valuable context doesn't persist, doesn't flow to the next session, to a different tool, or to a teammate's agent when they pick up work in the same area.

Rules files help, but corrections and area knowledge from conversations don't make it back into the file on their own. And the whole file gets injected globally, even when most of it might not be relevant to the area the agent is working in.

I built aide-memory to close that gap, and I'm proud to announce it today.

aide-memory (https://aide-memory.dev) is auto-captured, auto-recalled, path-scoped memory for AI coding agents and teams.

**Capture happens automatically.** When you correct the agent, a hook detects it and prompts the agent to store the correction scoped to that code area. Periodic reflections pick up decisions and area knowledge. You don't have to remember to save context.

**Recall is scoped.** Memories attach to code areas across four typed layers (preferences, technical context, area decisions, team guidelines). When the agent opens a file, it gets prompted to recall what applies to that area, not a dump of non-relevant text.

**Your team's agents learn from yours.** Memories are JSON files in your repo. Commit, push, pull. When your teammate's agent opens the area you've been working in, it picks up the context. Personal preferences stay gitignored.

**Works across tools.** Claude Code and Cursor read the same memory store. Switch tools and the context comes with you.

**Tunable.** Control how often the agent gets prompted, how specific a memory's scope needs to be before it surfaces, how much context gets injected at session start, which hooks are active. Shape it to fit your workflow.

**Local-first.** Memories stay on your machine. Free to use.

```
npx aide-memory init
```

Docs + quick start: https://aide-memory.dev
GitHub: https://github.com/aide-memory/aide-memory
