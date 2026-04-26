# aide-memory rule templates — source of truth

**Canonical body: [`shared/body.md`](./shared/body.md).** All 5 editor rule files (claude-code, cursor, codex, copilot, windsurf) are rendered from this single source.

## Architecture

Each editor's rendered rule file is built as:

```
<adapter.ruleFrontmatter> + shared/body.md + (body substitutes {{editor_notes}} from adapter.ruleNotes)
```

Then run through `{{var}}` substitution for:

| Variable | Source | Example |
|---|---|---|
| `{{contributor}}` | `detectContributor(projectRoot)` in init.ts (reads git user.name) | `"ahmedmmeky"` |
| `{{tools_list}}` | `MCP_TOOLS_LIST` constant in init.ts | bullet list of 7 MCP tool names + descriptions |
| `{{tool_id}}` | adapter.ruleToolId | `"claude-code"`, `"cursor"`, `"codex"`, `"copilot"`, `"windsurf"` |
| `{{editor_notes}}` | adapter.ruleNotes | Cursor: agent_message caveat. All others: empty string. |

Render logic: [`src/memory/editors/rules.ts`](../../memory/editors/rules.ts) `buildRules()`.

## Updating content

- **Updating tool-use guidance that applies to all editors:** edit [`shared/body.md`](./shared/body.md). All 5 editor rule files pick up the change on next `aide-memory init --force` or `--update-rules`.
- **Adding an editor-specific caveat:** edit the adapter's `ruleNotes` field in `src/memory/editors/<editor>.ts`. Content goes into the `{{editor_notes}}` placeholder in the shared body (just after the Hooks section).
- **Adding editor-specific frontmatter** (e.g., YAML for a new `.mdc`-style editor): edit the adapter's `ruleFrontmatter` field.
- **Adding a new editor:** create `src/memory/editors/<editor>.ts` implementing `EditorAdapter` with your `ruleFrontmatter` / `ruleNotes` / `ruleToolId` + set `supportsRules: true`. Register in `src/memory/editors/index.ts` `ADAPTERS`.

## Prior architecture (pre-C1.5c)

Before Phase C1.5c of the Cursor-support refactor, each editor had a standalone `<editor>.md` or `<editor>.mdc` template in this directory (5 files). Those files drifted over time — `codex.md`/`copilot.md`/`windsurf.md` ended up claiming `aide_forget` could "archive" memories, contradicting `claude-code.md`/`cursor.mdc` which correctly stated "no archive mode". The shared-body collapse eliminates that class of drift.

See [`docs/specs/CURSOR_ONBOARDING.md`](../../../docs/specs/CURSOR_ONBOARDING.md) §3.5 for the full rationale.
