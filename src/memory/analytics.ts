import Database from 'better-sqlite3';

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

  constructor(db: Database.Database) {
    this.db = db;
    this.init();
  }

  private init(): void {
    this.db.exec(CREATE_ANALYTICS_TABLE);
  }

  logEvent(event: string, value?: string, tool?: string): void {
    const now = new Date().toISOString();
    this.db.prepare(
      'INSERT INTO analytics (event, value, tool, timestamp) VALUES (?, ?, ?, ?)'
    ).run(event, value ?? null, tool ?? null, now);
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
      "SELECT COUNT(*) as count FROM memories WHERE status = 'active'"
    ).get() as { count: number };
    const totalMemories = totalRow.count;

    // Count by layer (active only)
    const layerRows = this.db.prepare(
      "SELECT layer, COUNT(*) as count FROM memories WHERE status = 'active' GROUP BY layer"
    ).all() as { layer: string; count: number }[];
    const byLayer: Record<string, number> = {};
    for (const row of layerRows) {
      byLayer[row.layer] = row.count;
    }

    // Most recalled (top 5, active only)
    const recalledRows = this.db.prepare(
      "SELECT what, layer, recalled_count FROM memories WHERE status = 'active' AND recalled_count > 0 ORDER BY recalled_count DESC LIMIT 5"
    ).all() as { what: string; layer: string; recalled_count: number }[];
    const mostRecalled = recalledRows.map(r => ({
      what: r.what,
      layer: r.layer,
      recalled_count: r.recalled_count,
    }));

    // Capture source breakdown (active only)
    const sourceRows = this.db.prepare(
      "SELECT source, COUNT(*) as count FROM memories WHERE status = 'active' GROUP BY source"
    ).all() as { source: string; count: number }[];
    const captureSourceBreakdown: Record<string, number> = {};
    for (const row of sourceRows) {
      captureSourceBreakdown[row.source] = row.count;
    }

    // Stale count: active memories with 0 recalls created more than 30 days ago
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const staleRow = this.db.prepare(
      "SELECT COUNT(*) as count FROM memories WHERE status = 'active' AND recalled_count = 0 AND created_at < ?"
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
