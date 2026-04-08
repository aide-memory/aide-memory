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
      "preCompact": true
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

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `version` | number | `1` | Config schema version |
| `capture.enabled` | boolean | `true` | Master switch for all hooks |
| `capture.hooks.preToolUse` | boolean | `true` | Enable PreToolUse hook (memory count nudge) |
| `capture.hooks.stop` | boolean | `true` | Enable Stop hook (reflection prompt) |
| `capture.hooks.userPromptSubmit` | boolean | `true` | Enable UserPromptSubmit hook (correction detection) |
| `capture.hooks.preCompact` | boolean | `true` | Enable PreCompact hook (save before compaction) |
| `nudge.visible` | boolean | `false` | Show nudge text in terminal (normally hidden in agent context) |
| `tags.presets` | string[] | _(see above)_ | Available tag presets for categorization |
| `telemetry.enabled` | boolean | `true` | Send anonymous usage analytics |
| `contributor` | string | `"auto"` | Contributor name (`"auto"` detects from `git config user.name`) |
| `embeddings.model` | string | `"bge-small-en-v1.5"` | Embedding model for semantic search |
| `embeddings.backend` | string | `"transformers"` | Embedding backend: `"transformers"` or `"ollama"` |
| `updates.check` | boolean | `true` | Check for new versions after commands |

## Reading config

```bash
# Read a single key
aide-memory config capture.enabled
# Output: true

# Read a nested key
aide-memory config capture.hooks.preToolUse
# Output: true

# Read an object (returns JSON)
aide-memory config tags.presets
# Output: ["architecture","testing","security","style","integration","config","migration","performance","api-contract"]
```

## Setting config

```bash
# Set a boolean
aide-memory config capture.enabled false

# Set a string
aide-memory config contributor "Ahmed Meky"

# Set a number
aide-memory config version 2
```

Values are auto-parsed from strings:
- `"true"` / `"false"` become booleans
- Numeric strings become numbers
- Everything else stays a string

## Disabling individual hooks

```bash
# Disable the stop hook (no reflection prompt)
aide-memory config capture.hooks.stop false

# Disable correction detection
aide-memory config capture.hooks.userPromptSubmit false

# Disable all hooks at once
aide-memory config capture.enabled false
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
# Use the default Transformers.js backend
aide-memory config embeddings.backend transformers
aide-memory config embeddings.model bge-small-en-v1.5

# Or use Ollama (requires Ollama running locally)
aide-memory config embeddings.backend ollama
```

Embeddings are optional. Without them, search uses FTS5 (BM25 ranking) with a LIKE fallback. Both work well for most use cases.

## Telemetry opt-out

```bash
aide-memory config telemetry.enabled false
```

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
