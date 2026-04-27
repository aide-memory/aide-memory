/**
 * Package-root and asset-path resolution.
 *
 * Robust against:
 *   - tsc-built layout (init.js at dist/memory/init.js)
 *   - esbuild-bundled layout (init code inlined into dist/cli/aide-memory.js)
 *   - ts-node dev (init.ts at src/memory/init.ts)
 *   - npm-installed layout (node_modules/aide-memory/...)
 *
 * Earlier `getTemplatesDir()` / `resolveTemplatesDir()` used `path.resolve(
 * __dirname, '..', ...)` math that broke in the bundled layout because
 * esbuild rewrites the relative depth (verified empirically 2026-04-27 —
 * bundle has an extra `..` that doesn't match the runtime __dirname).
 *
 * This helper walks up from __dirname looking for a package.json whose
 * `name` is aide-memory's. That's stable across all layouts because the
 * one constant is "our package owns its own package.json."
 */

import * as fs from 'fs';
import * as path from 'path';

const KNOWN_PKG_NAMES = new Set(['aide-v0', 'aide-memory']);

let cachedRoot: string | null = null;

/**
 * Find the directory containing aide-memory's package.json by walking up
 * from __dirname. Cached after first call (root doesn't change at runtime).
 *
 * Throws if no matching package.json is found in any ancestor — that
 * indicates a fundamentally broken install / runtime environment.
 */
export function findPackageRoot(): string {
  if (cachedRoot) return cachedRoot;

  let dir = __dirname;
  // Walk up to filesystem root, but stop after a reasonable depth as a
  // sanity check (shouldn't ever need more than 10 hops).
  for (let i = 0; i < 32 && dir !== path.parse(dir).root; i++) {
    const pkgJson = path.join(dir, 'package.json');
    if (fs.existsSync(pkgJson)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'));
        if (typeof pkg.name === 'string' && KNOWN_PKG_NAMES.has(pkg.name)) {
          cachedRoot = dir;
          return dir;
        }
      } catch {
        // Invalid JSON — skip + keep walking.
      }
    }
    dir = path.dirname(dir);
  }
  throw new Error(
    `aide-memory: could not find package.json with name 'aide-v0' or 'aide-memory' walking up from ${__dirname}. ` +
      `This indicates a broken install — reinstall aide-memory.`,
  );
}

/**
 * Resolve the rules-templates directory relative to the package root.
 *
 * Templates ship at `<pkg>/src/templates/rules` (per
 * package.aide-memory.json `files`). This works for both the dev tree
 * (src/templates/rules in the repo) and the published package
 * (node_modules/aide-memory/src/templates/rules).
 */
export function getTemplatesDir(): string {
  const root = findPackageRoot();
  const dir = path.join(root, 'src', 'templates', 'rules');
  if (!fs.existsSync(dir)) {
    throw new Error(
      `aide-memory: templates directory not found at ${dir}. This indicates a broken install — reinstall aide-memory.`,
    );
  }
  return dir;
}

/**
 * Test helper — clear the package-root cache so unit tests can mutate
 * the filesystem without state bleeding between cases.
 */
export function _resetPackageRootCache(): void {
  cachedRoot = null;
}
