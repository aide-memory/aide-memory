# Dev workflow: switching between local dev build and published npm version

## Quick reference

```bash
# Install your local dev tree as the global aide-memory
npm run dev:install

# Switch back to the latest published version on npm
npm run dev:restore
```

## Why you need this

When you work on aide-memory itself, the global `aide-memory` binary points at whatever version was last installed from npm. Your code changes in `/Users/meky/code/aide-v0` don't affect it. To test changes against a real Claude Code or Cursor session, you need to install your dev build as the global.

## What `npm run dev:install` does

1. Builds the dev tree (`npm run build && npm run build:dist`)
2. Swaps `package.aide-memory.json` -> `package.json` (publish manifest)
3. Swaps `README.npm.md` -> `README.md`
4. Runs `npm pack` to create a tarball
5. Runs `npm install -g <tarball>` to install globally
6. Restores the dev manifests on exit (via trap)
7. Cleans up the tarball

After this, `which aide-memory` points to the binary that was built from your dev tree. `aide-memory --version` reflects the version in `package.aide-memory.json`.

## What `npm run dev:restore` does

Runs `npm install -g aide-memory@latest`. This reinstalls the published version from npm, overwriting the dev install.

## Typical workflow

```bash
# Make changes in src/
npm run dev:install              # builds + installs dev as global

# Test in any project
cd /path/to/test-project
aide-memory init                 # writes paths to dev install
# Open Claude Code session, test

# Make more changes in src/
npm run dev:install              # rebuild + reinstall

# Done testing, switch back to published
npm run dev:restore
```

## Notes

- `aide-memory init` writes absolute paths into `.mcp.json` and `.claude/settings.json` based on where the binary is installed. After `dev:install`, those paths point to your global node_modules' aide-memory directory (which contains the dev build's bundles).
- If you run `dev:install` again, the paths in existing test projects stay valid because the global location doesn't change.
- The MCP server is a long-running process per Claude Code session. After installing a new dev build, restart your Claude Code session to pick up the new MCP code. Hooks pick up changes on next fire.
- `dev:restore` requires network access (it pulls from npm registry).

## When things go wrong

If `dev:install` fails midway and leaves `package.json` as the publish manifest:
```bash
mv package.json.dev-backup package.json
mv README.md.dev-backup README.md
rm -f aide-memory-*.tgz
```

The trap in the script handles this on exit, but a hard kill (Ctrl-C at the wrong moment) can leave the dev tree in a swapped state.
