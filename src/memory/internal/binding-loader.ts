/**
 * Single chokepoint for loading the native SQLite binding.
 *
 * Callers use `createDatabase(path, options?)` instead of `new Database(...)`
 * directly so that:
 *   1. Binding load failures get classified + surfaced via [AIDE_ERROR] with
 *      an actionable hint, rather than silently absorbed by upstream
 *      try/catch (the failure mode behind memory #348).
 *   2. Successful loads are observable via AIDE_DEBUG=binding for diagnosis.
 *   3. If we ever swap the binding (back to better-sqlite3, sideways to
 *      sqlite3 v5+ N-API, etc.) callers stay untouched.
 *
 * Type imports for `Database.Database`, `Database.RunResult`, etc. continue
 * to come straight from `import type Database from 'libsql'` because libsql
 * uses `export = Database` which TS can only properly merge with namespace
 * access at the original module name.
 *
 * Note: with libsql's N-API bindings (memories #348/#353/#354), the
 * NODE_MODULE_VERSION mismatch class of failure shouldn't reach this code.
 * The defensive paths still ship because:
 *   - We can't statically prove libsql is installed correctly on every
 *     platform; the @libsql/<platform> sub-package may be missing.
 *   - Filesystem corruption / partial installs / sandbox restrictions can
 *     still produce module-load failures.
 *   - When something does go wrong, [AIDE_ERROR] is dramatically better
 *     than the silent swallow that hid the original 0.5.0 bug for hours.
 */

import type Libsql from 'libsql';
import { debug, loudError } from './debug';

type DatabaseConstructor = typeof Libsql;

function classifyLoadError(err: unknown): { class: string; hint: string } {
  const msg = (err as Error)?.message ?? String(err);

  if (/NODE_MODULE_VERSION/i.test(msg)) {
    return {
      class: 'abi-mismatch',
      hint: 'reinstall aide-memory or run `npm rebuild libsql` in the install dir',
    };
  }
  if (/Cannot find module|MODULE_NOT_FOUND/i.test(msg)) {
    return {
      class: 'missing-module',
      hint: 'reinstall aide-memory — the libsql platform package may be missing',
    };
  }
  if (/dlopen|wrong ELF class|invalid ELF header|image not found|symbol not found/i.test(msg)) {
    return {
      class: 'binary-incompatible',
      hint: 'reinstall aide-memory — prebuilt binary may be wrong for this platform/arch',
    };
  }
  return {
    class: 'unknown',
    hint: 'reinstall aide-memory; if the issue persists, file an issue with this stderr line',
  };
}

let cachedCtor: DatabaseConstructor | null = null;

function getDatabaseConstructor(): DatabaseConstructor {
  if (cachedCtor) return cachedCtor;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('libsql') as DatabaseConstructor;
    cachedCtor = mod;
    debug(
      'binding',
      `loaded lib=libsql node=${process.versions.node} abi=${process.versions.modules} platform=${process.platform}-${process.arch}`,
    );
    return mod;
  } catch (err) {
    const { class: cls, hint } = classifyLoadError(err);
    const msg = (err as Error)?.message ?? String(err);
    loudError(`aide-memory: failed to load native binding (libsql, ${cls}): ${msg}`, hint);
    debug('binding', `load-failed lib=libsql class=${cls} msg=${JSON.stringify(msg)}`);
    throw err; // Re-throw — callers (hook dispatcher's catch, MCP startup) decide how to degrade.
  }
}

/**
 * Construct a Database instance via the validated libsql binding. Use this
 * instead of `new Database(...)` directly — the wrapping is what gives us
 * load-error classification + AIDE_DEBUG observability.
 */
export function createDatabase(filename: string, options?: Libsql.Options): Libsql.Database {
  const Ctor = getDatabaseConstructor();
  return new Ctor(filename, options);
}
