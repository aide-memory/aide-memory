src/
├── brain/ # Core brain types and storage
│ ├── types.ts # FileRecord, SymbolRecord, Relation, Note, Tag
│ ├── store.ts # ProjectBrainStore interface
│ ├── sqliteStore.ts # SQLite implementation
│ └── index.ts
├── analysis/ # Code analysis
│ ├── fileAnalyzer.ts # Language detection, hashing
│ ├── parser.ts # ts-morph symbol extraction
│ ├── relationResolver.ts # CALLS, IMPORTS, TESTS, CONFIGURES
│ └── index.ts
├── retrieval/ # Context retrieval
│ ├── strategy.ts # RetrievalStrategy interface
│ ├── graphTraversal.ts # GraphTraversalStrategy
│ └── index.ts
├── session/ # Session memory
│ ├── sessionManager.ts # Focus symbols/files tracking
│ └── index.ts
├── context/ # LLM context assembly
│ ├── assembler.ts # Build prompts from code slices
│ └── index.ts
├── cli/ # CLI commands
│ ├── commands/
│ │ ├── init.ts # aide init
│ │ ├── reindex.ts # aide reindex
│ │ ├── watch.ts # aide watch
│ │ └── ask.ts # aide ask
│ ├── index.ts # Main CLI with commander.js
│ ├── repl.ts # Interactive REPL
│ └── ui.ts
├── models/
│ └── localModelClient.ts # Ollama integration
├── core/
│ ├── config.ts # Project config management
│ └── logger.ts
├── storage/
│ └── paths.ts # Storage paths
└── \_legacy/ # Embedding files for reference
├── vectorStore.ts
└── chunkIndexer.ts

aide init . # Index the project
aide # Start interactive REPL
aide ask "question" # Single question mode
aide watch # Watch for changes
aide reindex # Incremental update

aide # Auto-resumes previous session
aide --new # Starts fresh session
aide # Type :history to see saved messages
