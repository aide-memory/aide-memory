# AIDE v0.3.0 — Architecture Intelligence Platform — Implementation Report

## Overview

AIDE has been transformed from an AI coding assistant into an **Architecture Intelligence Platform** providing automated architecture analysis, enforcement, and visualization. The platform indexes codebases into a knowledge graph, detects architecture patterns, and enforces rules deterministically.

## CLI Commands (17 total)

### Core Commands
```
aide init [path]              # Index project + auto-generate health score and rules
aide scan [path]              # Architecture health score + generate .aide/rules.yaml
aide check [path]             # Validate against rules (exit 1 on violations)
  --changed                   # Only check modules affected by uncommitted changes
  --since <ref>               # Only check modules affected since a git ref
  --fail-below <score>        # CI gate: fail if score < threshold
  --report-only               # Report without failing
aide stats [path]             # Quick project overview
  -v, --verbose               # Detailed breakdown
```

### Architecture Commands
```
aide rules init [path]        # Generate .aide/rules.yaml
aide rules show [path]        # Display current rules
aide map [path]               # Dependency visualization (mermaid/dot/ascii)
aide onboard [path]           # Generate architecture guide
aide diff [path]              # Compare against saved baseline
  --save                      # Save current state
  --name <name>               # Named baselines
aide trend [path]             # Track health score over time
  --record                    # Record data point
aide export [path]            # Comprehensive markdown/JSON report
```

### Integration Commands
```
aide mcp [path]               # MCP server for AI agents (5 tools)
aide hook install [path]      # Git pre-commit hook
aide hook uninstall [path]    # Remove hook
```

### AI Assistant (pre-existing)
```
aide ask <question>           # Single question
aide [path]                   # Interactive REPL
aide web [path]               # Web interface
```

---

## All Files Created (30+)

| File | Purpose |
|------|---------|
| `src/analysis/importResolver.ts` | Multi-language import path resolution (TS/JS/Python/Go/Java) |
| `src/analysis/graphAnalysis.ts` | Module detection, dependency analysis, health scoring, cycle detection |
| `src/analysis/ctagsAnalyzer.ts` | Universal Ctags integration — 169+ language symbol extraction |
| `src/rules/types.ts` | AideRules, Violation, ModuleInfo, DependencyEvidence, HealthScore types |
| `src/rules/rulesParser.ts` | YAML parser + validator for .aide/rules.yaml |
| `src/rules/rulesGenerator.ts` | Auto-generate rules from architecture analysis |
| `src/rules/rulesChecker.ts` | Validate graph against rules, produce violations with fix suggestions |
| `src/mcp/server.ts` | MCP server with 5 architecture tools for AI agents |
| `src/cli/commands/scan.ts` | `aide scan` — health score + rules generation |
| `src/cli/commands/rules.ts` | `aide rules init/show` |
| `src/cli/commands/check.ts` | `aide check` — rule enforcement with incremental mode |
| `src/cli/commands/map.ts` | `aide map` — Mermaid/DOT/ASCII dependency visualization |
| `src/cli/commands/onboard.ts` | `aide onboard` — architecture guide generation |
| `src/cli/commands/hook.ts` | `aide hook install/uninstall` — git pre-commit integration |
| `src/cli/commands/diff.ts` | `aide diff` — baseline comparison and change detection |
| `src/cli/commands/stats.ts` | `aide stats` — quick project overview |
| `src/cli/commands/trend.ts` | `aide trend` — health tracking with sparkline charts |
| `src/cli/commands/export.ts` | `aide export` — comprehensive stakeholder reports |
| `templates/github-actions-check.yml` | Ready-to-use GitHub Actions CI workflow |
| `src/analysis/__tests__/relationExtraction.test.ts` | 18 relation extraction tests |
| `src/analysis/__tests__/importResolver.test.ts` | 14 import resolution tests |
| `src/analysis/__tests__/fixtures/heritage-test/` | Test fixtures for class inheritance |
| `.aide/rules.yaml` | Auto-generated architecture rules |

### Modified Files
| File | Change |
|------|--------|
| `src/brain/types.ts` | Added unresolved relation types |
| `src/analysis/treeSitterAnalyzer.ts` | Real relation extraction (imports, calls, heritage) |
| `src/project/indexer.ts` | Hybrid tree-sitter + ctags pipeline, cross-file resolution |
| `src/cli/index.ts` | 17 commands registered, v0.3.0 |
| `package.json` | v0.3.0, added js-yaml + @modelcontextprotocol/sdk |

---

## Architecture of AIDE Itself

```
aide stats -v .

  Project:   aide-v0
  Files:     90
  Symbols:   715
  Relations: 1095
  Modules:   14
  Health:    40/100
  Languages: TypeScript(77), Markdown(7), JSON(5), YAML(1)
  Circular:  10 cycles detected

  Health Score Breakdown:
    Module Cohesion:    13/30
    Low Coupling:       10/30
    No Circular Deps:    2/20
    Module Balance:     10/10
    Test Coverage:       5/10
```

---

## Key Features

### Multi-Language Support
- **Deep analysis** (Tree-sitter): TypeScript, JavaScript, TSX, JSX
- **Broad analysis** (Universal Ctags): Python, Go, Rust, Java, Ruby, C/C++, C#, Swift, Kotlin, Scala, PHP, Lua, Dart, Shell, Elixir, Haskell, and 150+ more
- **Multi-language import resolution**: Python module paths, Go package paths, Java class paths

### Health Scoring (0-100)
Calibrated scoring with 5 categories:
- **Module Cohesion (0-30)**: Weighted by module size
- **Low Coupling (0-30)**: Soft penalty curve (40% external = full marks)
- **No Circular Deps (0-20)**: Based on ratio of affected modules
- **Module Balance (0-10)**: Penalizes only extreme outliers
- **Test Coverage (0-10)**: Base credit + detected tests bonus

### Violation Detection with Fix Suggestions
Every violation includes an actionable suggestion:
- **Boundary violations**: Suggest updating allow list or restructuring
- **Circular dependencies**: Identify weakest link to break the cycle
- **Coupling violations**: Suggest extracting interfaces/facades, show top files
- **Cohesion violations**: Suggest module decomposition
- **File-level evidence**: Shows specific files and symbols creating violations

### MCP Server (5 tools)
AI agents can call architecture tools via JSON-RPC 2.0:
- `check_compliance` — validate code against rules
- `find_similar` — search for similar code
- `get_architecture` — full project overview
- `scan_health` — health score
- `get_module_info` — detailed module info

### CI/CD Integration
- GitHub Actions workflow template (`templates/github-actions-check.yml`)
- Git pre-commit hook (`aide hook install`)
- `--fail-below` threshold for CI gates
- `--changed` / `--since` for incremental checks
- JSON output for all commands

---

## Test Results

```
Test Files  4 passed (4)
Tests       106 passed (106)
Duration    ~500ms
```

---

## Known Limitations

1. **CALLS matching is fuzzy**: Resolves by name only, causing false positives for common names
2. **ctags requires system install**: `brew install universal-ctags` (not a pure npm dependency)
3. **Module detection is directory-based**: First dir under `src/` as module name
4. **No CommonJS support**: `require()` calls not detected
5. **No dynamic imports**: `import()` expressions not handled
6. **Single-repo only**: No monorepo/multi-repo support yet

## What Needs Follow-Up

1. **`aide review` — GitHub App** for PR architecture gate (monetization layer)
2. **Performance optimization** for repos with 10K+ symbols
3. **Tree-sitter WASM parsers** for Python/Go/Rust (deeper analysis than ctags)
4. **Decision memory** — ADR tracking with "why" fields
5. **Compliance mappings** (SOC2/HIPAA/ISO)
6. **Cross-company benchmarking** — anonymized scan data
