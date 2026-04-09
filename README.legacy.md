# AIDE V0 - Local Code Assistant

A local, project-aware AI coding assistant that understands your codebase through symbol extraction and graph-based retrieval.

## Supported Languages

| Language                                                 | File Indexing | Symbol Extraction | Relation Detection |
| -------------------------------------------------------- | ------------- | ----------------- | ------------------ |
| TypeScript/JavaScript                                    | ✅            | ✅ (ts-morph)     | ✅ Full            |
| Python                                                   | ✅            | ✅ (ctags)        | ✅ Imports/Calls   |
| Go                                                       | ✅            | ✅ (ctags)        | ✅ Imports/Calls   |
| Rust                                                     | ✅            | ✅ (ctags)        | ✅ Imports/Calls   |
| Java                                                     | ✅            | ✅ (ctags)        | ✅ Imports/Calls   |
| C/C++                                                    | ✅            | ✅ (ctags)        | ✅ Includes/Calls  |
| Ruby, PHP, C#, Swift, Kotlin, Scala, Lua, R, Perl, Shell | ✅            | ✅ (ctags)        | Basic              |
| JSON, YAML, TOML, Markdown                               | ✅            | -                 | -                  |

**Note**: For non-TypeScript/JavaScript languages, [Universal Ctags](https://ctags.io/) is required for symbol extraction.

## How It Works

### Core Concept

AIDE builds a **"project brain"** - a SQLite database containing:

- **Files** - paths, languages, content hashes
- **Symbols** - functions, classes, methods with line spans and signatures
- **Relations** - CALLS, IMPORTS, EXTENDS, IMPLEMENTS between symbols
- **Notes** - user/model annotations attached to symbols
- **Sessions** - persistent chat history and focus tracking

### Query Flow

```
User Question: "Where is ContextAssembler used?"
                         │
                         ▼
            ┌────────────────────────┐
            │  1. Find Seed Symbols  │
            │  Match "ContextAssembler"│
            │  in symbol names        │
            └────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  2. Graph Traversal    │
            │  Expand via relations  │
            │  Find callers/callees  │
            └────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  3. Context Assembly   │
            │  Build LLM prompt with │
            │  code snippets + notes │
            └────────────────────────┘
                         │
                         ▼
            ┌────────────────────────┐
            │  4. LLM Response       │
            │  Ollama generates      │
            │  contextual answer     │
            └────────────────────────┘
```

### Key Features

- **Symbol-based retrieval** - finds relevant code by understanding what calls what
- **Session persistence** - chat history survives restarts
- **Focus tracking** - remembers what you were discussing for follow-up questions
- **Accurate context** - only shows direct relationships, not indirect connections

---

## Folder Structure

```
src/
├── brain/                    # Core data layer
│   ├── types.ts              # FileRecord, SymbolRecord, Relation, Note, Tag
│   ├── store.ts              # ProjectBrainStore interface
│   └── sqliteStore.ts        # SQLite implementation
│
├── analysis/                 # Code parsing
│   ├── fileAnalyzer.ts       # Language detection, content hashing
│   ├── parser.ts             # Extract symbols from TypeScript/JavaScript (ts-morph)
│   ├── ctagsParser.ts        # Extract symbols from other languages (Universal Ctags)
│   └── relationResolver.ts   # Discover CALLS, IMPORTS, EXTENDS relations
│
├── retrieval/                # Context retrieval
│   ├── strategy.ts           # RetrievalStrategy interface + config
│   └── graphTraversal.ts     # BFS expansion from seed symbols
│
├── context/                  # LLM prompt building
│   └── assembler.ts          # Build system message from code slices
│
├── session/                  # Session management
│   └── sessionManager.ts     # Focus tracking, chat history, persistence
│
├── cli/                      # Command-line interface
│   ├── index.ts              # Main CLI (commander.js)
│   ├── repl.ts               # Interactive REPL
│   ├── ui.ts                 # Terminal formatting
│   └── commands/
│       ├── init.ts           # aide init - full project indexing
│       ├── reindex.ts        # aide reindex - incremental update
│       ├── watch.ts          # aide watch - file change detection
│       └── ask.ts            # aide ask - single question mode
│
├── models/
│   └── localModelClient.ts   # Ollama integration
│
├── core/
│   ├── config.ts             # Project configuration
│   └── logger.ts             # Logging utilities
│
├── storage/
│   └── paths.ts              # ~/.aide storage paths
│
└── _legacy/                  # Old embedding code (for reference)
```

---

## Usage

### `aide init [path]` - Initialize/index a project

```bash
aide init                     # Index current directory
aide init /path/to/project    # Index specific project
aide init --force             # Force full reindex from scratch
aide init --clear-sessions    # Clear all session files
aide init -f --clear-sessions # Both options combined
```

| Option             | Description                |
| ------------------ | -------------------------- |
| `-f, --force`      | Force reindex from scratch |
| `--clear-sessions` | Delete all session history |

### `aide [path]` - Start interactive REPL (default)

```bash
aide                    # Start REPL, auto-resume previous session
aide --new              # Start fresh session
aide --clear-history    # Clear chat history before starting
aide --no-init          # Don't auto-init if project not indexed
aide /path/to/project   # Start REPL for specific project
```

| Option            | Description                        |
| ----------------- | ---------------------------------- |
| `-n, --new`       | Start new session (don't resume)   |
| `--clear-history` | Clear chat history before starting |
| `--no-init`       | Skip auto-init if not indexed      |

### `aide ask <question>` - Single question mode

```bash
aide ask "What does the analysis package do?"
aide ask "Where is ContextAssembler used?" --debug
aide ask "How does parsing work?" -d 3 -f 10
```

| Option              | Description              | Default |
| ------------------- | ------------------------ | ------- |
| `-p, --path <path>` | Project root path        | `.`     |
| `-d, --depth <n>`   | Graph traversal depth    | `2`     |
| `-f, --fanout <n>`  | Max symbols per relation | `5`     |
| `-t, --tokens <n>`  | Token budget for context | `4000`  |
| `--debug`           | Print debug information  | -       |

### `aide reindex [path]` - Incremental reindex

```bash
aide reindex                      # Reindex changed files
aide reindex -f src/cli/index.ts  # Reindex specific files
aide reindex --files a.ts b.ts    # Reindex multiple files
```

| Option                   | Description               |
| ------------------------ | ------------------------- |
| `-f, --files <files...>` | Specific files to reindex |

### `aide watch [path]` - Watch for file changes

```bash
aide watch              # Watch current project
aide watch -d 500       # Custom debounce delay (ms)
```

| Option                | Description          | Default |
| --------------------- | -------------------- | ------- |
| `-d, --debounce <ms>` | Debounce delay in ms | `1000`  |

---

### REPL Commands

| Command          | Description                   |
| ---------------- | ----------------------------- |
| `:help`          | Show all commands             |
| `:focus`         | Show current focus symbols    |
| `:history`       | Show chat history             |
| `:clear`         | Clear focus                   |
| `:clear-history` | Clear chat history            |
| `:new`           | Clear everything, start fresh |
| `:note <text>`   | Add note to focus symbol      |
| `:q`             | Quit                          |

---

## Data Storage

```
~/.aide/projects/{project-id}/
├── brain.db          # SQLite database (files, symbols, relations, notes)
├── config.json       # Project configuration
└── sessions/
    ├── session-xxx.json   # Session state + chat history
    └── latest.txt         # Points to most recent session
```

---

## Requirements

- **Node.js** >= 18.0.0
- **Ollama** - Local LLM runtime (for chat and embeddings)
- **Universal Ctags** (optional) - Required for non-TypeScript/JavaScript symbol extraction

### Installing Universal Ctags

```bash
# macOS
brew install universal-ctags

# Ubuntu/Debian
sudo apt install universal-ctags

# Windows (via Chocolatey)
choco install universal-ctags
```

If ctags is not installed, AIDE will still index all files but only extract symbols from TypeScript/JavaScript.

---

## Future Improvements

- [ ] **File summaries** - LLM-generated descriptions for each file and tags (i.e TagRecord entries)
- [ ] **Embeddings** - Semantic search as fallback when symbol matching fails
- [ ] **Smarter notes** - Auto-extract insights from LLM responses (model-suggested notes/tags)
- [ ] **Configurable traversal depth/fanout** exposed in CLI or config
- [ ] Options to ask with a -s or --session my-session
- [ ] **Project-level memory** - Cross-session learnings about the codebase
- [x] **Multi-language support** - Python, Go, Rust, Java, C/C++ via Universal Ctags
