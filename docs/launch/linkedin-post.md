# LinkedIn launch post

What lives in your head doesn't go across AI sessions, and doesn't always go across your team. The way features tie into the rest of your system, the patterns you follow in this area, the architecture decisions behind your work — your CLAUDE.md or .cursorrules don't quite capture that.

Coding with agents made me more productive, but made me repeat myself. So I built aide-memory (https://aide-memory.dev) — auto-captured, auto-recalled, path-scoped memory for AI coding agents and teams.

Captured automatically. Corrections, important decisions, area knowledge, things that surface during end-of-turn reflection — stored as you work, without having to remember to save anything.

Recall is scoped. Memories attach to code areas across four typed layers (preferences, technical context, area decisions, team guidelines). When the agent opens a file, it pulls only what applies to that area — not a global dump.

Your team's agents learn from yours. Memories are JSON files in your repo. Commit, push, pull. Personal prefs stay gitignored; shared ones travel with the code.

Works across tools. Claude Code and Cursor read the same store. Switch tools, your context comes with you.

Local-first. Memory content stays on your machine. Free to use.

npm install -g aide-memory && aide-memory init

GitHub: https://github.com/aide-memory/aide-memory
