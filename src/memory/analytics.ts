import type Database from 'libsql';
import crypto from 'crypto';
import os from 'os';

// PostHog project key — hardcoded for anonymous usage telemetry.
//
// **Default ON (2026-04-28 round-4 user direction, supersedes 2026-04-27 flip).**
// Telemetry is ON by default. To disable, set `AIDE_TELEMETRY=off` in your
// environment. When enabled, only anonymized event tallies (event type +
// machine-hashed distinct_id + platform + node_version) are sent to PostHog.
// Memory content, code, file paths, query strings, and user identifiers are
// NEVER transmitted.
//
// Local SQLite analytics (the `analytics` table powering `aide-memory stats`)
// is unaffected by this flag — it always runs locally with no network egress.
//
// Future: a `analytics.enabled` config key in `.aide/config.json` is on the
// fast-follow list. Today the env var is the only knob.
const POSTHOG_KEY = process.env.AIDE_TELEMETRY === 'off' ? '' : 'phc_ztrzpvbZQTa4ymkGxVdYZnFKiFFLyJMcf5zYUXVAqPzS';
const POSTHOG_HOST = 'https://us.i.posthog.com';

export interface AnalyticsEvent {
  id: number;
  event: string;
  value: string | null;
  tool: string | null;
  timestamp: string;
}

export interface MemoryStats {
  totalMemories: number;
  byLayer: Record<string, number>;
  mostRecalled: { what: string; layer: string; recalled_count: number }[];
  captureSourceBreakdown: Record<string, number>;
  staleCount: number;
}

const CREATE_ANALYTICS_TABLE = `
CREATE TABLE IF NOT EXISTS analytics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event TEXT NOT NULL,
  value TEXT,
  tool TEXT,
  timestamp TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_event ON analytics(event);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp);
`;

export class Analytics {
  private db: Database.Database;
  private distinctId: string;
  private eventBuffer: Array<{ event: string; properties: Record<string, unknown>; timestamp: string }> = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private remoteDisabled: boolean = false;

  constructor(db: Database.Database) {
    this.db = db;
    this.init();

    // Generate a stable anonymous ID from machine hostname + username hash
    // No PII is sent — this is just for deduplication
    this.distinctId = crypto
      .createHash('sha256')
      .update(`${os.hostname()}:${os.userInfo().username}`)
      .digest('hex')
      .slice(0, 16);
  }

  private init(): void {
    this.db.exec(CREATE_ANALYTICS_TABLE);
  }

  disableRemote(): void {
    this.remoteDisabled = true;
  }

  logEvent(event: string, value?: string, tool?: string): void {
    const now = new Date().toISOString();
    // Local SQLite logging
    this.db.prepare(
      'INSERT INTO analytics (event, value, tool, timestamp) VALUES (?, ?, ?, ?)'
    ).run(event, value ?? null, tool ?? null, now);

    // Buffer for remote PostHog logging (anonymized — no memory content, just event type + counts)
    if (POSTHOG_KEY && !this.remoteDisabled) {
      this.eventBuffer.push({
        event,
        properties: {
          value: value ?? undefined,
          tool: tool ?? undefined,
          platform: os.platform(),
          arch: os.arch(),
          node_version: process.version,
        },
        timestamp: now,
      });

      // Auto-flush after 10 events or 30s
      if (this.eventBuffer.length >= 10) {
        this.flush();
      } else if (!this.flushTimer) {
        this.flushTimer = setTimeout(() => this.flush(), 30000);
      }
    }
  }

  /** Send buffered events to PostHog via HTTP. Fire-and-forget. */
  private flush(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.eventBuffer.length === 0) return;

    const batch = this.eventBuffer.splice(0);
    const payload = JSON.stringify({
      api_key: POSTHOG_KEY,
      batch: batch.map(e => ({
        event: e.event,
        properties: { ...e.properties, distinct_id: this.distinctId, $ip: null, $geoip_disable: true },
        timestamp: e.timestamp,
      })),
    });

    // Fire-and-forget HTTP POST — no await, no dependency
    fetch(`${POSTHOG_HOST}/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }).catch(() => {
      // Remote telemetry failure is non-fatal
    });
  }

  /** Flush any pending events. Call on process exit. */
  shutdown(): void {
    this.flush();
  }

  getEvents(options?: { event?: string; since?: string; limit?: number }): AnalyticsEvent[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (options?.event) {
      conditions.push('event = ?');
      params.push(options.event);
    }
    if (options?.since) {
      conditions.push('timestamp >= ?');
      params.push(options.since);
    }

    let sql = 'SELECT * FROM analytics';
    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY timestamp DESC, id DESC';
    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    return this.db.prepare(sql).all(...params) as AnalyticsEvent[];
  }

  countEvents(event: string, since?: string): number {
    const conditions: string[] = ['event = ?'];
    const params: any[] = [event];

    if (since) {
      conditions.push('timestamp >= ?');
      params.push(since);
    }

    const sql = 'SELECT COUNT(*) as count FROM analytics WHERE ' + conditions.join(' AND ');
    const row = this.db.prepare(sql).get(...params) as { count: number };
    return row.count;
  }

  getStats(): MemoryStats {
    // Total memories (active only)
    const totalRow = this.db.prepare(
      "SELECT COUNT(*) as count FROM memories WHERE 1=1"
    ).get() as { count: number };
    const totalMemories = totalRow.count;

    // Count by layer (active only)
    const layerRows = this.db.prepare(
      "SELECT layer, COUNT(*) as count FROM memories WHERE 1=1 GROUP BY layer"
    ).all() as { layer: string; count: number }[];
    const byLayer: Record<string, number> = {};
    for (const row of layerRows) {
      byLayer[row.layer] = row.count;
    }

    // Most recalled (top 5, active only)
    const recalledRows = this.db.prepare(
      "SELECT what, layer, recalled_count FROM memories WHERE 1=1 AND recalled_count > 0 ORDER BY recalled_count DESC LIMIT 5"
    ).all() as { what: string; layer: string; recalled_count: number }[];
    const mostRecalled = recalledRows.map(r => ({
      what: r.what,
      layer: r.layer,
      recalled_count: r.recalled_count,
    }));

    // Capture source breakdown (active only)
    const sourceRows = this.db.prepare(
      "SELECT source, COUNT(*) as count FROM memories WHERE 1=1 GROUP BY source"
    ).all() as { source: string; count: number }[];
    const captureSourceBreakdown: Record<string, number> = {};
    for (const row of sourceRows) {
      captureSourceBreakdown[row.source] = row.count;
    }

    // Stale count: active memories with 0 recalls created more than 30 days ago
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const staleRow = this.db.prepare(
      "SELECT COUNT(*) as count FROM memories WHERE 1=1 AND recalled_count = 0 AND created_at < ?"
    ).get(cutoff) as { count: number };
    const staleCount = staleRow.count;

    return {
      totalMemories,
      byLayer,
      mostRecalled,
      captureSourceBreakdown,
      staleCount,
    };
  }

  prune(days: number): number {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const result = this.db.prepare('DELETE FROM analytics WHERE timestamp < ?').run(cutoff);
    return result.changes;
  }
}
