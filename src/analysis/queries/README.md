# Vendored Tree-sitter Queries

This directory contains vendored Tree-sitter queries from the community.

## Source

Queries are sourced from:
- [nvim-treesitter](https://github.com/nvim-treesitter/nvim-treesitter/tree/master/queries)
- [Helix editor](https://github.com/helix-editor/helix/tree/master/runtime/queries)

Last updated: December 2024

## Query Files

- `tags.scm` - Symbol extraction (functions, classes, methods, interfaces, types)
- `highlights.scm` - Comments, docstrings, TODO markers

## Languages

Currently vendored queries for:
- **TypeScript** - `typescript/tags.scm`, `typescript/highlights.scm`
- **JavaScript** - `javascript/tags.scm`, `javascript/highlights.scm`  
- **Python** - `python/tags.scm`, `python/highlights.scm`

## Adding a New Language

To add support for a new language:

1. Create a new directory (e.g., `go/`)
2. Add `tags.scm` with symbol extraction patterns
3. Add `highlights.scm` for comments/docs (optional)
4. Update `isTreeSitterSupported()` in `treeSitterAnalyzer.ts`
5. Install the tree-sitter grammar package (e.g., `tree-sitter-go`)

### Query Pattern Reference

For `tags.scm`, use captures:
- `@name` - The symbol name
- `@definition.function` - Function definitions
- `@definition.method` - Method definitions
- `@definition.class` - Class definitions
- `@definition.interface` - Interface definitions
- `@definition.type` - Type alias definitions
- `@definition.variable` - Variable/constant definitions
- `@definition.module` - Module/namespace definitions

For `highlights.scm`, use captures:
- `@comment` - Regular comments
- `@comment.documentation` - JSDoc, docstrings
- `@comment.todo` - TODO/FIXME markers
- `@string` - String literals

## Runtime Behavior

These queries are vendored at build time. **Runtime never fetches from the network.**

The `TreeSitterAnalyzer` loads queries using `loadQuery(language, queryName)`:
```typescript
const tagsQuery = this.loadQuery('typescript', 'tags');
const matches = tagsQuery.matches(tree.rootNode);
```

If a query file doesn't exist, the analyzer falls back to heuristic-based extraction.
