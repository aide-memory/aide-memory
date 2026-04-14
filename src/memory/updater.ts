import https from 'https';
import fs from 'fs';
import path from 'path';
import os from 'os';

const REGISTRY_URL = 'https://registry.npmjs.org/aide-memory/latest';
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Path to the file where we cache the last update check timestamp and result.
 */
function getCheckCachePath(): string {
  return path.join(os.homedir(), '.aide', 'update-check.json');
}

interface UpdateCheckCache {
  lastCheck: number;
  latestVersion: string | null;
}

function readCache(): UpdateCheckCache | null {
  const cachePath = getCheckCachePath();
  try {
    if (!fs.existsSync(cachePath)) return null;
    const raw = fs.readFileSync(cachePath, 'utf-8');
    return JSON.parse(raw) as UpdateCheckCache;
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCheckCache): void {
  const cachePath = getCheckCachePath();
  try {
    const dir = path.dirname(cachePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache), 'utf-8');
  } catch {
    // Cache write failure is non-fatal
  }
}

/**
 * Fetch the latest version string from the npm registry.
 * Returns null on any error (timeout, network, parse).
 */
function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = https.get(REGISTRY_URL, { timeout: 5000 }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        resolve(null);
        return;
      }

      let data = '';
      res.on('data', (chunk: Buffer) => { data += chunk.toString(); });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed.version ?? null);
        } catch {
          resolve(null);
        }
      });
    });

    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Compare two semver version strings.
 * Returns true if `latest` is newer than `current`.
 */
function isNewer(current: string, latest: string): boolean {
  const parseSemver = (v: string) => {
    const parts = v.replace(/^v/, '').split('.').map(Number);
    return { major: parts[0] || 0, minor: parts[1] || 0, patch: parts[2] || 0 };
  };

  const c = parseSemver(current);
  const l = parseSemver(latest);

  if (l.major !== c.major) return l.major > c.major;
  if (l.minor !== c.minor) return l.minor > c.minor;
  return l.patch > c.patch;
}

/**
 * Check npm registry for a newer version of aide-memory.
 *
 * - Caches the result for 24 hours (at most one network call per day).
 * - Never throws — returns null on any error.
 *
 * @param currentVersion The currently installed version string (e.g. "0.2.0").
 * @returns The newer version string if available, or null if up-to-date/error.
 */
export async function checkForUpdates(currentVersion: string): Promise<string | null> {
  try {
    // Check cache first
    const cache = readCache();
    if (cache && (Date.now() - cache.lastCheck) < CHECK_INTERVAL_MS) {
      // Use cached result
      if (cache.latestVersion && isNewer(currentVersion, cache.latestVersion)) {
        return cache.latestVersion;
      }
      return null;
    }

    // Fetch from registry
    const latestVersion = await fetchLatestVersion();

    // Update cache regardless of result
    writeCache({
      lastCheck: Date.now(),
      latestVersion,
    });

    if (latestVersion && isNewer(currentVersion, latestVersion)) {
      return latestVersion;
    }

    return null;
  } catch {
    // Never throw
    return null;
  }
}

/**
 * Minimum required version. Set this to force users to update.
 * When null, updates are recommended but not required.
 * Change this to e.g. "0.3.0" to block older versions from running.
 */
const MIN_REQUIRED_VERSION: string | null = null;

/**
 * Check if the current version meets the minimum requirement.
 * Returns the minimum version if not met, null if OK.
 */
export function checkMinVersion(currentVersion: string): string | null {
  if (!MIN_REQUIRED_VERSION) return null;
  if (isNewer(currentVersion, MIN_REQUIRED_VERSION)) {
    return MIN_REQUIRED_VERSION;
  }
  return null;
}

/**
 * Print a user-friendly update notice to stderr.
 */
export function printUpdateNotice(currentVersion: string, latestVersion: string): void {
  console.error(
    `\n  aide-memory v${latestVersion} available (current: v${currentVersion}).` +
    `\n  Run \`npm update -g aide-memory\` to update.\n`
  );
}

/**
 * Print a required update notice to stderr.
 */
export function printRequiredUpdateNotice(currentVersion: string, minVersion: string): void {
  console.error(
    `\n  ⚠ aide-memory v${currentVersion} is below minimum required v${minVersion}.` +
    `\n  Run \`npm update -g aide-memory\` to update.\n`
  );
}
