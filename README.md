# AIDE V0 - Local Code Assistant

A local, project-aware AI coding assistant that understands your codebase through symbol extraction and graph-based retrieval.

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
├── analysis/                 # Code parsing (ts-morph)
│   ├── fileAnalyzer.ts       # Language detection, content hashing
│   ├── parser.ts             # Extract symbols from TypeScript/JavaScript
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

```bash
# Index a project
aide init .

# Start interactive REPL (auto-resumes previous session)
aide

# Start fresh session
aide --new

# Single question mode
aide ask "What does the analysis package do?"

# Watch for file changes
aide watch

# Incremental reindex
aide reindex
```

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

## Future Improvements

- [ ] **File summaries** - LLM-generated descriptions for each file and tags (i.e TagRecord entries)
- [ ] **Embeddings** - Semantic search as fallback when symbol matching fails
- [ ] **Multi-language support** - Go, Python, Rust parsers
- [ ] **Smarter notes** - Auto-extract insights from LLM responses (model-suggested notes/tags)
- [ ] **Configurable traversal depth/fanout** exposed in CLI or config
- [ ] Options to ask with a -s or --session my-session
- [ ] **Project-level memory** - Cross-session learnings about the codebase
