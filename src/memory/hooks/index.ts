/**
 * Hook dispatcher — single entry point used by the `aide-memory hook <name>`
 * CLI subcommand. Reads stdin JSON, routes to the handler, swallows any
 * errors silently (hooks must never break the agent).
 */

import { readJsonStdin } from './stdio';
import {
  detectCorrection,
  preCompact,
  preEdit,
  preRead,
  preSearch,
  sessionStart,
  stop,
  trackRecall,
  trackRecallPost,
  trackRemember,
  trackSearch,
} from './handlers';

export type HookName =
  | 'pre-read'
  | 'pre-edit'
  | 'pre-search'
  | 'pre-prompt'
  | 'post-tool-use-recall'
  | 'stop'
  | 'pre-compact'
  | 'session-start'
  | 'pre-recall'
  | 'post-remember'
  | 'post-search';

// Map of hook name → handler.
const HANDLERS: Record<HookName, (input: any) => Promise<void>> = {
  'pre-read': preRead,
  'pre-edit': preEdit,
  'pre-search': preSearch,
  'pre-prompt': detectCorrection,
  'post-tool-use-recall': trackRecallPost,
  'stop': stop,
  'pre-compact': preCompact,
  'session-start': sessionStart,
  'pre-recall': trackRecall,
  'post-remember': trackRemember,
  'post-search': trackSearch,
};

export async function dispatch(name: string): Promise<void> {
  const handler = (HANDLERS as any)[name];
  if (!handler) {
    // Unknown hook — silently exit 0 rather than crash the agent.
    return;
  }
  try {
    const input = await readJsonStdin();
    await handler(input);
  } catch {
    // Never break the agent on hook errors.
  }
}

export { HANDLERS };
