# PostHog Analytics Verification Guide

This guide explains how to verify that AIDE Memory's analytics integration with PostHog is working correctly.

## Overview

AIDE Memory sends anonymous usage analytics to PostHog to help track adoption and usage patterns. The analytics pipeline:
- Logs events locally to a SQLite database
- Buffers events in memory
- Sends batches to PostHog via HTTP API
- Never sends sensitive information (memory content, file paths, etc.)

**PostHog Project:**
- Host: US Cloud (https://us.i.posthog.com)
- Project ID: 377073
- Project Key: `phc_ztrzpvbZQTa4ymkGxVdYZnFKiFFLyJMcf5zYUXVAqPzS`

## Verifying Events Are Sent

### Prerequisites
- Node.js 18+ installed
- PostHog account with API access
- `AIDE_TELEMETRY` not set to `off`

### Steps

1. Build and run aide-memory normally -- store a memory, recall, or search.
2. Events are buffered and sent automatically (every 10 events or 30 seconds).
3. Check the PostHog dashboard for incoming events (see below).

### Troubleshooting

**No events appearing in dashboard**
- Verify `AIDE_TELEMETRY` is not set to `off`
- Events may take 1-2 minutes to appear
- Reload the PostHog dashboard
- Check that you are looking at the correct project (ID: 377073)
- Verify the timestamp is recent

## Verifying in PostHog Dashboard

### 1. Navigate to Events

1. Go to https://us.posthog.com
2. Sign in to your account
3. Select the AIDE Memory project (ID: 377073)
4. Click **Events** in the left sidebar

### 2. Look for Test Events

The test script sends three events:

| Event Name | Properties |
|---|---|
| `aide_memory_test` | `source: "test_script"` |
| `aide_recall` | `source: "test_script", path: "test/example.ts", memories_returned: 3` |
| `aide_remember` | `source: "test_script", layer: "technical", scope: "src/**"` |

Filter for events containing "aide_" in the event name. You should see events like:
- **aide_memory_test** — Fired when test script runs
- **aide_recall** — Fired when memories are retrieved
- **aide_remember** — Fired when memories are stored

### 3. Inspect Event Details

Click on any event to see:
- **Timestamp** — When the event occurred
- **Properties** — All custom properties (distinct_id, platform, node_version, etc.)
- **Distinct ID** — Unique identifier for the machine/user

Example distinct_id format: `a1b2c3d4e5f6g7h8` (first 16 hex chars of SHA256 hash of hostname:username)

## Understanding the Analytics Flow

### Local SQLite Logging

Events are first logged to a local SQLite database for audit trail and local analysis:

```
Memory Store (better-sqlite3)
  ├── memories table
  │   ├── uuid
  │   ├── layer (preferences, technical, area_context, guidelines)
  │   ├── what (memory content)
  │   ├── source (conversation, import, api, etc.)
  │   ├── recalled_count
  │   └── ...
  └── analytics table
      ├── id
      ├── event
      ├── value
      ├── tool
      └── timestamp
```

Database location: `~/.aide/memory.db`

### Remote PostHog Logging

The Analytics class maintains an in-memory event buffer that:
1. Collects events from the Memory Store
2. Buffers them in memory (max 10 before flush, or 30 seconds)
3. Sends batches to PostHog via HTTP POST to `/batch` endpoint
4. Fire-and-forget (non-blocking)

Source code: `src/memory/analytics.ts`

### Anonymization

- No memory content is sent to PostHog
- Machine info is anonymized using SHA256 hash
- Only aggregate metrics are sent (counts, event types, layer names)
- Platform, architecture, and Node version are included for debugging

## Real-World Analytics Usage

### Memory Storage Event

When a memory is stored:
```typescript
analytics.logEvent('memory_stored', layer, tool);
// Example: analytics.logEvent('memory_stored', 'technical', 'claude-code');

// Sent to PostHog as:
{
  event: 'memory_stored',
  properties: {
    value: 'technical',
    tool: 'claude-code',
    platform: 'linux',
    arch: 'x64',
    node_version: 'v18.12.0',
    distinct_id: 'a1b2c3d4e5f6g7h8'
  },
  timestamp: '2024-04-10T15:30:45.123Z'
}
```

### Memory Recall Event

When memories are recalled:
```typescript
analytics.logEvent('memory_recalled', count.toString(), tool);
// Example: analytics.logEvent('memory_recalled', '3', 'cursor');
```

### Other Events

- `memory_deleted` — Memory removed
- `memory_updated` — Memory modified
- `search_performed` — Full-text search executed
- `hook_triggered` — MCP hook called
- `cache_hit` / `cache_miss` — Cache performance

## Setting Up PostHog Dashboards

### Dashboard 1: Memory Operations

Create a new dashboard with these insights:

1. **Total Memories Stored** (Trend chart)
   - Filter: Event = "memory_stored"
   - Group by: Layer (technical, preferences, etc.)
   - Period: Last 30 days

2. **Recall Frequency** (Bar chart)
   - Filter: Event = "memory_recalled"
   - Group by: Day
   - Period: Last 30 days

3. **Memory by Layer** (Pie chart)
   - Filter: Event = "memory_stored"
   - Breakdown: Properties → value
   - Period: Last 30 days

### Dashboard 2: User Activity

1. **Active Machines** (Number)
   - Unique Distinct IDs
   - Period: Last 30 days

2. **Tools Using AIDE** (Bar chart)
   - Filter: Event = "memory_*"
   - Breakdown: tool property
   - Period: Last 30 days

3. **Platform Distribution** (Pie chart)
   - Breakdown: platform property
   - Period: Last 30 days

### Dashboard 3: Performance

1. **Events per Day** (Trend)
   - Period: Last 30 days

2. **Tool Usage Over Time** (Line chart)
   - Breakdown: tool property
   - Group by: Day

## Configuring Analytics in AIDE Memory

### Enable Analytics

Set the environment variable before running AIDE:
```bash
export AIDE_POSTHOG_KEY="phc_ztrzpvbZQTa4ymkGxVdYZnFKiFFLyJMcf5zYUXVAqPzS"
aide-memory analyze
```

### Disable Analytics

Leave `AIDE_POSTHOG_KEY` unset or empty:
```bash
unset AIDE_POSTHOG_KEY
aide-memory analyze
```

When disabled, events are still logged locally to SQLite but not sent remotely.

### Custom PostHog Host

Modify `src/memory/analytics.ts` if using a self-hosted PostHog instance:
```typescript
const POSTHOG_HOST = 'https://your-posthog.example.com';
```

## Implementation Details

### Analytics Class

Location: `src/memory/analytics.ts`

Key methods:
- `logEvent(event: string, value?: string, tool?: string)` — Log an event
- `flush()` — Send buffered events to PostHog
- `shutdown()` — Flush and cleanup on exit
- `getEvents(filter)` — Query local SQLite analytics
- `getStats()` — Aggregate statistics about memories
- `prune(days)` — Remove old events from local database

### Memory Store Integration

The Memory Store class calls `analytics.logEvent()` for:
- Memory add/update/delete operations
- Recall operations
- Search queries

Example from `src/memory/store.ts`:
```typescript
recordRecall(memoryIds: string[]): void {
  // ... update memories ...
  this.analytics?.logEvent('memory_recalled', memoryIds.length.toString(), this.source);
}
```

### Process Exit Handling

Register cleanup on SIGTERM/SIGINT:
```typescript
process.on('SIGTERM', () => {
  analytics.shutdown(); // Flush pending events
  process.exit(0);
});
```

## FAQ

### Q: Is my memory content sent to PostHog?
**A:** No. Only event types, counts, layer names, and tool names are sent. Memory content stays in the local database.

### Q: How is machine identity anonymized?
**A:** A SHA256 hash of `hostname:username` is used as the distinct_id. This allows deduplication without storing usernames.

### Q: Can I disable analytics?
**A:** Yes, simply don't set `AIDE_POSTHOG_KEY` environment variable. Local logging continues, but remote events aren't sent.

### Q: How often are events flushed to PostHog?
**A:** Every 30 seconds or after 10 events, whichever comes first. This is configurable in the Analytics class.

### Q: What if PostHog is unreachable?
**A:** The request fails silently. Events are logged locally regardless. No errors are raised that would impact AIDE performance.

### Q: Can I export events from PostHog?
**A:** Yes. Use PostHog's "Export" feature or API to download events as JSON/CSV.

## References

- PostHog Documentation: https://posthog.com/docs
- PostHog API: https://posthog.com/docs/api
- PostHog Events: https://posthog.com/docs/data/events
- PostHog Insights: https://posthog.com/docs/product/insights
