# Quick Start

Install to first recall in 2 minutes.

## Prerequisites

- Node.js 18 or later
- A project directory with a `package.json` (any language works, but Node is needed to run aide-memory)
- Git (optional, used to detect contributor name)

## 1. Initialize

From your project root:

```bash
npx aide-memory init
```

This creates the `.aide/` directory structure:

```
.aide/
  config.json                    # Configuration
  memories/
    preferences/
      personal/                  # Your personal prefs (gitignored)
      shared/                    # Team-shared prefs
    technical/                   # Facts about the stack
    area_context/                # Decisions for specific code areas
    guidelines/                  # Team-wide principles
  cache/                         # SQLite cache (gitignored)

.claude/rules/aide-memory.md     # Claude Code rules file
.cursor/rules/aide-memory.mdc    # Cursor rules file
```

It also:
- Adds `.aide/memories/preferences/personal/` and `.aide/cache/` to `.gitignore`
- Installs a `post-checkout` git hook to keep the SQLite cache in sync
- Detects your contributor name from `git config user.name`

## 2. Store your first memory

```bash
aide remember "API responses must use camelCase keys" --layer guidelines
```

Output:
```
Stored memory (id: 1):
  Layer: guidelines
  What:  API responses must use camelCase keys
```

Add scope to target a specific code area:

```bash
aide remember "Dashboard uses skeleton loading, not spinners" \
  --layer area_context \
  --scope "src/components/dashboard/**"
```

## 3. Recall context

```bash
aide recall src/components/dashboard/
```

Output:
```
Recalled 2 memories for "src/components/dashboard/":

## Area Context
  [2] Dashboard uses skeleton loading, not spinners [src/components/dashboard/**]

## Guidelines
  [1] API responses must use camelCase keys
```

Memories are returned in priority order: area_context first, then technical, preferences, guidelines. Scoped memories are ranked above project-wide ones.

## 4. What happens automatically

Once initialized, six hooks handle context capture without any manual effort:

- **SessionStart**: Injects top-N preferences + guidelines + priority-always memories at session begin/resume. Also cleans up stale tracking files from ended sessions.
- **PreToolUse**: Before your agent reads / edits / greps a file (or calls an `aide_*` MCP tool), the hook shows memory counts by layer. On first read of a file with scoped memories, it blocks until the agent calls `aide_recall`.
- **PostToolUse**: When the agent calls `aide_recall` / `aide_remember` / `aide_search`, the hook records the recalled IDs so subsequent reads of the same path are not re-blocked.
- **UserPromptSubmit**: When you correct the agent ("no, use X instead"), the hook detects the correction pattern and prompts the agent to store it.
- **Stop**: When the agent finishes a turn, it is prompted to reflect and store any non-obvious decisions or discoveries.
- **PreCompact**: Before context compaction, the agent is prompted to save important context and session tracking is cleared.

You do not need to remember to call `aide remember` manually. The hooks make capture automatic.

## 5. Next steps

- Read the [CLI Reference](./cli-reference.md) for all available commands
- Read [MCP Tools](./mcp-tools.md) to understand what your agent can do
- Read [Configuration](./configuration.md) to customize behavior
- Read [Hooks](./hooks.md) to understand or disable specific hooks
- Import existing documentation: use `aide_import` via MCP to turn a markdown file into memories

## Editor-specific setup

aide-memory's in-agent experience differs per editor. See:

- **[Claude Code](./editors/claude-code.md)** — reference implementation; branded chrome, soft nudges, in-turn correction detection all work natively.
- **[Cursor](./editors/cursor.md)** — ~80% parity with documented gaps. **Restart Cursor after `init`** so the MCP server registers (Cursor has no MCP hot-reload per upstream bug [#3887](https://github.com/cursor/cursor/issues/3887)). See the Cursor doc for the full gap list + workarounds.
- **[Codex](./editors/codex.md) · [Copilot](./editors/copilot.md) · [Windsurf](./editors/windsurf.md)** — rule-template-only in 0.5.0. Full adapters tracked as post-0.5.0 onboarding tasks.

Full capability matrix across editors: [supported-editors.md](./supported-editors.md).
