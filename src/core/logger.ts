/**
 * Simple logging utilities
 */

export function logInfo(msg: string): void {
  console.log(`[aide] ${msg}`);
}

export function logError(msg: string, err?: unknown): void {
  console.error(`[aide:err] ${msg}`);
  if (err) {
    if (err instanceof Error) {
      console.error(`  ${err.message}`);
      if (process.env.DEBUG) {
        console.error(err.stack);
      }
    } else {
      console.error(err);
    }
  }
}

export function logDebug(msg: string): void {
  if (process.env.DEBUG) {
    console.log(`[aide:debug] ${msg}`);
  }
}

export function logWarn(msg: string): void {
  console.warn(`[aide:warn] ${msg}`);
}
