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

### Optional: pre-train scan

Generate initial memories from your project structure:

```bash
npx aide-memory init --scan
```

This reads `package.json`, `tsconfig.json`, directory structure, CI config, and other files to produce 15-30 technical memories automatically. No LLM needed.

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

Once initialized, hooks handle context capture without any manual effort:

- **PreToolUse hook**: When your agent reads a file, the hook checks if memories exist for that path and nudges the agent to call `aide_recall`.
- **Stop hook**: When the agent finishes a task, it is prompted to reflect and store any non-obvious decisions or discoveries.
- **UserPromptSubmit hook**: When you correct the agent ("no, use X instead"), the hook detects the correction pattern and prompts the agent to store it.
- **PreCompact hook**: Before context compaction, the agent is prompted to save important context that would otherwise be lost.

You do not need to remember to call `aide remember` manually. The hooks make capture automatic.

## 5. Next steps

- Read the [CLI Reference](./cli-reference.md) for all available commands
- Read [MCP Tools](./mcp-tools.md) to understand what your agent can do
- Read [Configuration](./configuration.md) to customize behavior
- Read [Hooks](./hooks.md) to understand or disable specific hooks
- Import existing documentation: use `aide_import` via MCP to turn a markdown file into memories
