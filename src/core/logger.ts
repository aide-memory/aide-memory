export function logInfo(msg: string) {
  console.log(`[aide] ${msg}`);
}

export function logError(msg: string, err?: unknown) {
  console.error(`[aide:err] ${msg}`);
  if (err) {
    console.error(err);
  }
}
