# aide-memory in Codex

**Status: rule template only in 0.5.0.** aide-memory's Codex adapter
ships a curated rule template (`src/templates/rules/shared/body.md` +
Codex-specific frontmatter) but does **not** yet generate hook or MCP
config files at `aide-memory init`.

## What works today

- If you add aide-memory as an MCP server manually in Codex's MCP
  config, the seven MCP tools (`aide_recall`, `aide_remember`,
  `aide_update`, `aide_forget`, `aide_search`, `aide_memories`,
  `aide_import`) work identically to Claude Code.
- Nothing else. No automatic hooks, no pre-read blocks, no correction
  detection, no session-start injection.

## What's coming

- Hook + MCP config generation at init — tracked in
  [`docs/specs/EDITOR_ONBOARDING_GUIDE.md`](../../specs/EDITOR_ONBOARDING_GUIDE.md)
  as a post-0.5.0 onboarding task.
- Full per-editor behavioral parity matrix — filled when the adapter
  matures. For now assume ~50% of Claude Code's in-editor experience.

## Want to help?

See [`docs/specs/EDITOR_ONBOARDING_GUIDE.md`](../../specs/EDITOR_ONBOARDING_GUIDE.md)
for the 9-step onboarding playbook.
