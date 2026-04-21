/**
 * aide-memory hook <name> — CLI wrapper around the hook dispatcher.
 * Called by the thin bash shims in scripts/hooks/<name>.sh at hook-fire time.
 */

import { dispatch } from '../../../memory/hooks';

export async function runHook(name: string): Promise<void> {
  await dispatch(name);
  // Always exit 0 — hook handlers emit block decisions via JSON, not exit code.
  process.exit(0);
}
