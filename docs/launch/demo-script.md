# aide-memory Launch Demo Video Script

**Target length:** 5 to 6 min. Tight, honest, factual. Zero em-dashes.

---

## Section 1, Hook (~10 to 20s)

**Voiceover:**
> Your AI agent forgets every project decision the moment a session ends. You correct it on Monday. By Wednesday, it suggests the same wrong thing again. aide-memory is an MCP server that captures those corrections and team conventions, scopes them to the right paths, and feeds them back into the next session, in Claude Code or Cursor. Let's walk through the launch.

**Screen actions:**
- Open with terminal split alongside an editor pane (either Claude Code or Cursor; pick one for the cold-open).
- Subtle title card overlay: `aide-memory, persistent context for AI agents`.

**Presenter notes:**
- Don't say "never forgets again." Say "captures decisions and feeds them back." The agent still has to *use* the recall.
- No claim that aide-memory replaces the agent's reasoning.

---

## Section 2, Install + Init (~45 to 60s)

**Voiceover:**
> Install once, globally. Then run `aide-memory init` inside any project. The init command writes config files for the editors aide-memory supports today. Claude Code and Cursor get full hook plus MCP wiring. Codex, Copilot, and Windsurf get a rules template; full hook adapters land later.

**Screen actions:**
- Type:
  ```
  npm install -g aide-memory
  ```
- Then `cd` into a fresh demo project:
  ```
  cd ~/code/demo-project
  aide-memory init
  ```
- After init completes, run `tree -L 2 .claude .cursor` (or `ls`) to show the generated files.

**Presenter notes:**
- Confirm both editor configs land. No need to read every file aloud.
- Codex, Copilot, Windsurf are rule-template only; mention only if you have time. Skip otherwise.
- Do NOT pitch one editor over the other. Both are first-class for the capabilities we ship.

---

## Section 3A, Correction captured (Claude Code) (~60s)

**Voiceover:**
> Open a Claude Code session. Ask it to add a date-parsing helper. It suggests `new Date(input)`. You correct it: "no, we use `parseISO` from date-fns project-wide." That's a UserPromptSubmit hook trigger. aide-memory's correction detector flags the pattern and prompts the agent to call `aide_remember`. The agent stores a guideline scoped to `src/utils/**`, with you as the contributor. The memory lands as a JSON file under `.aide/memories/guidelines/`, committed to the repo, visible in code review.

**Screen actions:**
- In Claude Code, prompt:
  > Add a date-parsing helper in `src/utils/dates.ts`.
- After the agent writes `new Date(...)`, reply:
  > No, we use `parseISO` from date-fns across the project.
- Watch the correction nudge fire (visible systemMessage line: `aide-memory · correction detected ...`).
- Agent calls `aide_remember`. Show the tool-call expansion.
- Switch to terminal:
  ```
  ls .aide/memories/guidelines/
  cat .aide/memories/guidelines/<uuid>.json
  ```
- Highlight the JSON fields: `layer`, `scope`, `what`, `why`, `contributor`, `tags`.

**Presenter notes:**
- The `cat` output is a real screenshot opportunity, it visually proves the JSON-not-markdown point that's coming up in Section 4.
- Don't oversell the correction detector. It catches obvious patterns. Subtle disagreements still need the user to ask the agent to remember.

---

## Section 3B, Restart and recall (Cursor) (~60s)

**Voiceover:**
> Now switch to Cursor. New session, no shared chat history with the Claude Code one. Open `src/utils/dates.ts`. Cursor's PreToolUse hook fires, aide-memory sees there's a memory scoped to this path and emits a hard-block envelope. The block tells the agent: "memories exist here, call `aide_recall` first." The agent calls it, gets the `parseISO` guideline back, and proceeds. Same convention, different editor, same outcome.

**Screen actions:**
- Open Cursor in the same project.
- Start a new agent session and ask:
  > Add another date helper in `src/utils/dates.ts` that parses a range string.
- The hard-block fires. Show the inline `aide-memory · ...` chrome in the chat.
- Agent calls `aide_recall`, receives the stored guideline, then writes a `parseISO`-based helper.

**Presenter notes:**
- Per memory #325: Claude Code's Grep matcher is sometimes deferred, in which case the agent uses Bash+grep. We don't hook Bash+grep. Don't claim "we hook every search."
- Cursor's `codebase_search` is a built-in semantic search, not exposed as an MCP-style matcher in Cursor's hook vocabulary. We genuinely cannot hook it. If asked, answer honestly: "Cursor doesn't expose codebase_search to hooks; we cover Grep, Read, Write, and Edit instead, and the rules file tells the agent to prefer aide_search anyway."
- No "Cursor is better" or "Claude Code is better" framing.

---

## Section 4, Team workflow (~75 to 90s)

**Voiceover:**
> Where do these memories actually live? On disk, under `.aide/memories/`, organized by layer: `preferences`, `technical`, `area_context`, and `guidelines`. Each memory is a JSON file with the layer, scope, tags, contributor, and content (the `what` field). Diff-friendly. Code-review-friendly. Your team reviews memories the same way they review code.
>
> One nuance on the personal-versus-shared split. It applies to the `preferences` layer only. Personal preferences live under `preferences/personal/` and are gitignored. Shared preferences AND everything else (`technical`, `area_context`, `guidelines`) live alongside the code in git. The config knob `aide-memory config memories.defaultShared false` flips new preferences to personal-by-default; the per-call `shared` parameter is the explicit opt-in either direction. For the other three layers, that flag only flips the JSON `shared` metadata field; the folder stays the same.

**Screen actions:**
- Terminal:
  ```
  ls .aide/memories/
  ```
  Show the four layer directories.
- Then:
  ```
  ls .aide/memories/preferences/
  ```
  Show `personal/` and `shared/` subdirs.
- Then:
  ```
  ls .aide/memories/technical/
  ls .aide/memories/guidelines/
  ```
  Show those are flat: JSON files directly under each layer dir.
- Open one JSON file in the editor pane (or `cat` it):
  ```
  cat .aide/memories/guidelines/<uuid>.json
  ```
  Highlight on screen: `layer`, `scope`, `contributor`, `tags`, `shared`, `what`.
- Show `.gitignore` containing the entry that excludes `preferences/personal/`.
- Quick `git status` showing the new shared memory file from Section 3A is a tracked, committable change.

**Presenter notes:**
- Do NOT call the files markdown. Do NOT mention YAML frontmatter. They are JSON.
- Do NOT imply other layers have personal/shared subdirs. Only `preferences/` does.
- The `defaultShared` flag's behavior differs by layer. For preferences, it changes the folder destination. For other layers, it only flips the metadata field. Be precise.
- If asked about shareable memory across machines: it's git, period. No sync server, no cloud. Honest.

---

## Section 5, What we ship today (~45 to 60s)

**Voiceover:**
> A note on what aide-memory ships today. Claude Code is the reference adapter; every capability in our matrix is verified end-to-end against the validation suite. Cursor ships at strong parity with five capabilities tracked against upstream Cursor work: soft-fire chrome lives in the Hooks Output panel rather than inline, sessionStart context arrives through a regenerated rules file (Cursor staff's endorsed approach), sessionStart doesn't re-fire after compaction, correction reminders arrive one turn later, and Glob isn't in Cursor's matcher vocabulary so it's skipped. Codex, Copilot, and Windsurf currently ship a rules template only; `aide-memory init` does not yet generate hooks or MCP config for those editors. Full adapters are next.

**Screen actions:**
- Briefly display the capability matrix from `docs/user/supported-editors.md` (screenshot or scroll).
- Optionally show the `docs/validation/E2E_VALIDATION.md` header so viewers know there's a real validation matrix behind the claims.

**Presenter notes:**
- Don't claim Codex, Copilot, Windsurf are "supported." They get a rule template. That's it.
- If a viewer adds aide-memory as an MCP server manually in any editor's own MCP config, the seven tools work; that's separate from "init wires it up."

---

## Section 6, Outro (~30s)

**Voiceover:**
> aide-memory is on npm today. Install it, run `aide-memory init` in a project you actually work in, and let it pick up corrections and conventions for a week. After that, decide whether persistent context across sessions earns its keep. Source, validation matrix, and per-editor capability docs are linked below. That's it.

**Screen actions:**
- End card with: `npm install -g aide-memory`, the repo URL, and the docs URL.
- Hold for 3 to 4 seconds.

**Presenter notes:**
- No "revolutionizes." No "game-changer." The product is a memory layer; the pitch is "try it for a week and decide."

---

## Pre-record checklist

Run through every item before hitting record. Anything that fails here is a re-shoot.

1. **Test:full passes.** `npm run test:full` from `/Users/meky/code/aide-v0`: tsc clean, vitest green, smoke suites all PASS. Per `docs/validation/E2E_VALIDATION.md` Pre-flight.
2. **Demo project is fresh.** Wipe `~/code/demo-project/.aide/`, `.claude/`, `.cursor/` before take 1. Confirm `aide-memory init` runs from a clean slate.
3. **Both editors installed and signed in.** Claude Code CLI version current; Cursor 3.2.11 or later (the version validated).
4. **Hook visibility on.** `aide-memory config hooks.visible` returns `true`. Without this, the systemMessage chrome won't render in Section 3A.
5. **Softening threshold dropped if memory count is low.** `aide-memory config memories.softening.threshold 5` so the hard-block in Section 3B actually fires on a small fixture.
6. **Memories dir empty before Section 3A.** Verify `.aide/memories/guidelines/` contains zero files until the correction is captured live on camera.
7. **One JSON memory ready to display.** Pre-create a guidelines memory in a separate scratch project for a clean Section 4 cat-screenshot if the live one from Section 3A is messy.
8. **`.gitignore` shows the personal-preferences entry.** Confirm `cat .gitignore | grep personal` returns the aide-memory-managed line for the Section 4 walkthrough.
9. **Terminal font size large.** Minimum 16pt; the cat output of a JSON file needs to be readable in a 1080p export.
10. **Capability matrix screenshot ready.** Screenshot `docs/user/supported-editors.md` rendered (or the GitHub view) in advance to drop into Section 5.
11. **Audio levels checked.** Voiceover at -12dB peaks; no fan or HVAC bleed.
12. **No identifying info on screen.** Mask `~/code/aide-v0` paths in any directory listings if the demo project is co-located. The aide-memory project itself shouldn't appear as the demo subject; use a separate scratch repo.

---

**Em-dash count (entire script): 0.**
