import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { MemoryStore } from './store';
import { recall } from './recall';
import { logStoreEvent } from './store-log';
import { EmbeddingService } from './embeddings';
import type { MemoryLayer, MemorySource } from './types';

const LAYER_VALUES: [string, ...string[]] = ['preferences', 'technical', 'area_context', 'guidelines'];
const SOURCE_VALUES: [string, ...string[]] = ['conversation', 'import', 'agent_discovery', 'elevated', 'hook'];

/** Coerce a value to number — LLMs often send numbers as strings */
function toNumber(v: unknown): number {
  return typeof v === 'string' ? Number(v) : v as number;
}

/**
 * Array schema that tolerates a single-item shortcut. LLMs frequently send
 * `paths: "src/foo.ts"` when the schema says `paths: string[]`; this wrapper
 * transforms that into `["src/foo.ts"]` before validation. Plain arrays pass
 * through unchanged.
 */
function lenientArray<T extends z.ZodTypeAny>(item: T) {
  return z.preprocess(
    (v) => (v !== undefined && v !== null && !Array.isArray(v) ? [v] : v),
    z.array(item)
  );
}

/**
 * Boolean schema that accepts "true"/"false"/"1"/"0" strings as well as real
 * booleans. z.coerce.boolean() is too lenient (treats any non-empty string as
 * true, including the literal "false"), so we normalise manually.
 */
const lenientBoolean = z.preprocess((v) => {
  if (typeof v === 'string') {
    const s = v.toLowerCase().trim();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0' || s === '') return false;
  }
  return v;
}, z.boolean());

/**
 * The `.nullish().transform((v) => v ?? undefined)` chain used on every
 * optional field accepts missing / undefined / null and always emits
 * undefined downstream. LLMs sometimes send `{scope: null}` to mean "not
 * set" — plain `.optional()` would reject with "expected string, received
 * null". This chain makes every optional field forgiving.
 */

export function createServer(store: MemoryStore, options?: { logDir?: string | null }): McpServer {
  const logDir = options?.logDir ?? null;
  const server = new McpServer({
    name: 'aide-memory',
    version: '0.2.0',
  });

  // aide_recall — get context for an area
  server.tool(
    'aide_recall',
    'Retrieve context for an area of the codebase before planning or making changes. Returns contributor preferences, technical knowledge, area decisions, and project guidelines. Call this when starting work in a codebase area, before proposing plans, or when you may have lost earlier context.',
    {
      paths: lenientArray(z.string()).nullish().transform((v) => v ?? undefined).describe('File or directory paths you are working in. Returns memories scoped to these areas plus project-wide context.'),
      ids: lenientArray(z.coerce.number()).nullish().transform((v) => v ?? undefined).describe('Specific memory IDs to retrieve (for gap-filling). When provided, returns exactly these memories — no path matching.'),
      query: z.string().nullish().transform((v) => v ?? undefined).describe('Optional text to boost relevant results (e.g. "skeleton loading" or "authentication flow").'),
      layers: lenientArray(z.enum(LAYER_VALUES)).nullish().transform((v) => v ?? undefined).describe('Filter to specific layers: preferences, technical, area_context, guidelines.'),
      contributor: z.string().nullish().transform((v) => v ?? undefined).describe('Filter to a specific contributor.'),
      limit: z.coerce.number().nullish().transform((v) => v ?? undefined).describe('Max memories to return (default 20).'),
    },
    async (params) => {
      const result = recall(store, {
        paths: params.paths,
        ids: params.ids ? params.ids.map(toNumber) : undefined,
        query: params.query,
        layers: params.layers as MemoryLayer[] | undefined,
        contributor: params.contributor,
        limit: params.limit,
      }, logDir);

      if (result.memories.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No memories found for this area. As you work and make decisions, use aide_remember to store context that should persist.',
          }],
        };
      }

      const grouped = groupByLayer(result.memories);
      let output = '';

      for (const [layer, memories] of grouped) {
        output += `\n## ${formatLayerName(layer)}\n`;
        for (const m of memories) {
          output += `- [${m.id}] ${m.what}`;
          if (m.contributor) output += ` (from ${m.contributor})`;
          if (m.scope && m.scope !== 'project') output += ` [${m.scope}]`;
          output += '\n';
          if (m.why) output += `  _Why: ${m.why}_\n`;
        }
      }

      return {
        content: [{ type: 'text' as const, text: output.trim() }],
      };
    }
  );

  // aide_remember — store something worth keeping
  server.tool(
    'aide_remember',
    'Store knowledge that should persist beyond this conversation. Call when the developer corrects your approach, makes a decision during planning, teaches you something about the codebase, or when you discover something relevant during exploration. Store the specific knowledge — do not over-generalize from a single instance.',
    {
      what: z.string().describe('The specific knowledge to remember.'),
      layer: z.enum(LAYER_VALUES).describe('preferences = how someone likes to work. technical = facts about the stack. area_context = decisions for a code area. guidelines = team principles.'),
      scope: z.string().nullish().transform((v) => v ?? undefined).describe('Glob pattern for the code area this applies to (e.g. "src/components/dashboard/**"). Omit for project-wide.'),
      why: z.string().nullish().transform((v) => v ?? undefined).describe('Context for why this is worth remembering.'),
      context_label: z.string().nullish().transform((v) => v ?? undefined).describe('Feature grouping label (e.g. "dashboard skeleton loading", "Add App modal").'),
      contributor: z.string().nullish().transform((v) => v ?? undefined).describe('Who this knowledge came from (for preferences layer).'),
      tags: lenientArray(z.string()).nullish().transform((v) => v ?? undefined).describe('Tags for categorization.'),
      source: z.enum(SOURCE_VALUES).nullish().transform((v) => v ?? undefined).describe('How this was captured. Default: conversation.'),
      shared: lenientBoolean.nullish().transform((v) => v ?? undefined).describe('Whether this memory is shared (true, default) or personal (false). Only affects preferences layer file placement.'),
      priority: z.enum(['always', 'normal']).nullish().transform((v) => v ?? undefined).describe('always = auto-injected at session start. normal = standard recall.'),
    },
    async (params) => {
      const memory = store.add({
        layer: params.layer as MemoryLayer,
        what: params.what,
        why: params.why,
        scope: params.scope,
        context_label: params.context_label,
        contributor: params.contributor,
        tags: params.tags,
        source: (params.source as MemorySource) ?? 'conversation',
        shared: params.shared,
        priority: params.priority as 'always' | 'normal' | undefined,
      });

      logStoreEvent(logDir, 'memory_stored', memory);

      return {
        content: [{
          type: 'text' as const,
          text: `Stored: "${memory.what}" as ${memory.layer}${memory.scope ? ` [${memory.scope}]` : ' [project-wide]'} (id: ${memory.id}, uuid: ${memory.uuid})`,
        }],
      };
    }
  );

  // aide_update — update an existing memory
  server.tool(
    'aide_update',
    'Update an existing memory. Use when information has changed, scope needs adjusting, or context needs updating. You can only update your own memories.',
    {
      id: z.coerce.number().describe('ID of the memory to update.'),
      what: z.string().nullish().transform((v) => v ?? undefined).describe('Updated knowledge text.'),
      why: z.string().nullish().transform((v) => v ?? undefined).describe('Updated context.'),
      scope: z.string().nullish().transform((v) => v ?? undefined).describe('Updated scope pattern.'),
      context_label: z.string().nullish().transform((v) => v ?? undefined).describe('Updated feature label.'),
      priority: z.enum(['always', 'normal']).nullish().transform((v) => v ?? undefined).describe('always = auto-injected at session start. normal = standard recall.'),
    },
    async (params) => {
      const id = toNumber(params.id);
      const existing = store.get(id);

      if (!existing) {
        return {
          content: [{ type: 'text' as const, text: `Memory ${id} not found.` }],
        };
      }

      const changes: Record<string, string> = {};
      if (params.what !== undefined) changes.what = params.what;
      if (params.why !== undefined) changes.why = params.why;
      if (params.scope !== undefined) changes.scope = params.scope;
      if (params.context_label !== undefined) changes.context_label = params.context_label;
      if (params.priority !== undefined) changes.priority = params.priority;

      if (Object.keys(changes).length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No changes provided. Current memory:\n- what: ${existing.what}\n- scope: ${existing.scope ?? 'project-wide'}\n- layer: ${existing.layer}`,
          }],
        };
      }

      const updated = store.update(id, changes);

      logStoreEvent(logDir, 'memory_updated', updated!);

      return {
        content: [{
          type: 'text' as const,
          text: `Updated memory ${updated!.id}: "${updated!.what}"${updated!.scope ? ` [${updated!.scope}]` : ' [project-wide]'}`,
        }],
      };
    }
  );

  // aide_forget — permanently delete a memory
  server.tool(
    'aide_forget',
    'Permanently delete a memory that is no longer relevant or was incorrect.',
    {
      id: z.coerce.number().describe('The memory ID to delete.'),
    },
    async (params) => {
      const id = toNumber(params.id);
      const existing = store.get(id);

      if (!existing) {
        return {
          content: [{ type: 'text' as const, text: `Memory ${id} not found.` }],
        };
      }

      store.remove(id);
      logStoreEvent(logDir, 'memory_deleted', existing);
      return {
        content: [{ type: 'text' as const, text: `Deleted: "${existing.what}" (id: ${id})` }],
      };
    }
  );

  // aide_memories — see what's stored
  server.tool(
    'aide_memories',
    'List stored memories for transparency and management. Shows what context is available.',
    {
      layer: z.enum(LAYER_VALUES).nullish().transform((v) => v ?? undefined).describe('Filter by layer.'),
      scope: z.string().nullish().transform((v) => v ?? undefined).describe('Filter by exact scope.'),
      contributor: z.string().nullish().transform((v) => v ?? undefined).describe('Filter by contributor.'),
      limit: z.coerce.number().nullish().transform((v) => v ?? undefined).describe('Max results (default 50).'),
    },
    async (params) => {
      const memories = store.list({
        layer: params.layer as MemoryLayer | undefined,
        scope: params.scope,
        contributor: params.contributor,
        limit: params.limit ?? 50,
      });

      if (memories.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No memories found.' }],
        };
      }

      const total = store.count();
      let output = `Showing ${memories.length} of ${total} memories:\n\n`;

      for (const m of memories) {
        output += `[${m.id}] ${m.layer} | ${m.what}`;
        if (m.scope) output += ` [${m.scope}]`;
        if (m.contributor) output += ` (${m.contributor})`;
        output += ` | recalled ${m.recalled_count}x`;
        output += '\n';
      }

      return {
        content: [{ type: 'text' as const, text: output.trim() }],
      };
    }
  );

  // aide_import — seed from existing docs
  server.tool(
    'aide_import',
    'Import guidelines or technical context from a markdown document. Each bullet point or paragraph becomes a separate memory. Use this to seed knowledge from existing docs like TESTING_GUIDELINES.md or ARCHITECTURE.md.',
    {
      content: z.string().describe('The markdown content to import.'),
      layer: z.enum(LAYER_VALUES).describe('Which layer to import into.'),
      scope: z.string().nullish().transform((v) => v ?? undefined).describe('Scope for all imported memories.'),
      context_label: z.string().nullish().transform((v) => v ?? undefined).describe('Label for the import batch.'),
    },
    async (params) => {
      const items = parseMarkdownItems(params.content);

      if (items.length === 0) {
        return {
          content: [{ type: 'text' as const, text: 'No importable items found in the content.' }],
        };
      }

      const created = items.map(item =>
        store.add({
          layer: params.layer as MemoryLayer,
          what: item,
          scope: params.scope,
          context_label: params.context_label,
          source: 'import',
        })
      );

      return {
        content: [{
          type: 'text' as const,
          text: `Imported ${created.length} memories as ${params.layer}${params.scope ? ` [${params.scope}]` : ''}:\n${created.map(m => `- [${m.id}] ${m.what}`).join('\n')}`,
        }],
      };
    }
  );

  // aide_search — find memories by keyword
  server.tool(
    'aide_search',
    'Search memories by keyword substring match. Use when looking for specific knowledge that may be stored — e.g. "what do we know about authentication?" or "any memories about testing?"',
    {
      keyword: z.string().describe('Text to search for in memory content (case-insensitive substring match on what and why fields).'),
      layer: z.enum(LAYER_VALUES).nullish().transform((v) => v ?? undefined).describe('Filter to a specific layer.'),
      limit: z.coerce.number().nullish().transform((v) => v ?? undefined).describe('Max results (default 50).'),
      mode: z.enum(['auto', 'keyword', 'semantic']).nullish().transform((v) => v ?? undefined).describe(
        "Search mode. 'auto' (default): keyword first, semantic fallback if <3 results. 'keyword': exact substring only. 'semantic': embedding similarity only."
      ),
    },
    async (params) => {
      const searchMode = params.mode as 'auto' | 'keyword' | 'semantic' | undefined;
      const searchOptions = {
        layer: params.layer as MemoryLayer | undefined,
        limit: params.limit,
        mode: searchMode,
      };

      // Use searchWithEmbeddings for auto/semantic modes to enable async embedding fallback
      const memories = (searchMode === 'semantic' || searchMode === 'auto' || !searchMode)
        ? await store.searchWithEmbeddings(params.keyword, searchOptions)
        : store.search(params.keyword, searchOptions);

      if (memories.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No memories found matching "${params.keyword}".`,
          }],
        };
      }

      const grouped = groupByLayer(memories);
      let output = `Found ${memories.length} matching "${params.keyword}":\n`;

      for (const [layer, mems] of grouped) {
        output += `\n## ${formatLayerName(layer)}\n`;
        for (const m of mems) {
          output += `- [${m.id}] ${m.what}`;
          if (m.scope && m.scope !== 'project') output += ` [${m.scope}]`;
          output += '\n';
          if (m.why) output += `  _Why: ${m.why}_\n`;
        }
      }

      return {
        content: [{ type: 'text' as const, text: output.trim() }],
      };
    }
  );

  return server;
}

function groupByLayer(memories: import('./types').Memory[]): [string, import('./types').Memory[]][] {
  const groups = new Map<string, import('./types').Memory[]>();
  for (const m of memories) {
    if (!groups.has(m.layer)) groups.set(m.layer, []);
    groups.get(m.layer)!.push(m);
  }
  return Array.from(groups.entries());
}

function formatLayerName(layer: string): string {
  switch (layer) {
    case 'area_context': return 'Area Context';
    case 'technical': return 'Technical Context';
    case 'preferences': return 'Preferences';
    case 'guidelines': return 'Guidelines';
    default: return layer;
  }
}

function parseMarkdownItems(content: string): string[] {
  const lines = content.split('\n');
  const items: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    // Bullet points
    if (/^[-*+]\s+/.test(trimmed)) {
      const text = trimmed.replace(/^[-*+]\s+/, '').trim();
      if (text.length > 5) items.push(text);
    }
    // Numbered items
    else if (/^\d+\.\s+/.test(trimmed)) {
      const text = trimmed.replace(/^\d+\.\s+/, '').trim();
      if (text.length > 5) items.push(text);
    }
    // Non-empty, non-heading paragraphs
    else if (trimmed.length > 20 && !trimmed.startsWith('#') && !trimmed.startsWith('```') && !trimmed.startsWith('|')) {
      items.push(trimmed);
    }
  }

  return items;
}

// CLI entry point
export async function startServer(projectPath: string): Promise<void> {
  const { checkForUpdates, printUpdateNotice, checkMinVersion, printRequiredUpdateNotice } = await import('./updater');
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf-8'));
  const currentVersion: string = pkg.version;

  // Check minimum version requirement (blocks if set)
  const minRequired = checkMinVersion(currentVersion);
  if (minRequired) {
    printRequiredUpdateNotice(currentVersion, minRequired);
    process.exit(1);
  }

  // Check for updates in background (non-blocking warning)
  checkForUpdates(currentVersion).then((latest) => {
    if (latest) printUpdateNotice(currentVersion, latest);
  }).catch(() => { /* non-fatal */ });

  // Auto-update hooks, MCP config, and rules files if version changed
  try {
    const { autoUpdateIfNeeded } = await import('./init');
    const updated = autoUpdateIfNeeded(projectPath, currentVersion);
    if (updated.length > 0) {
      console.error(`  aide-memory: auto-updated ${updated.length} config(s) to v${currentVersion}`);
    }
  } catch {
    // Auto-update failure is non-fatal
  }

  const store = new MemoryStore({ projectRoot: projectPath });

  // Ingest any memories written to .aide/pending-memories.jsonl while MCP was unavailable.
  try {
    const { ingestPendingMemories } = await import('./init');
    const ingested = ingestPendingMemories(projectPath, store);
    if (ingested > 0) {
      console.error(`  aide-memory: imported ${ingested} pending memor${ingested === 1 ? 'y' : 'ies'} from .aide/pending-memories.jsonl`);
    }
  } catch {
    // Ingest failure is non-fatal
  }

  // Initialize embedding service in background (non-blocking, graceful degradation)
  const embeddingService = new EmbeddingService();
  embeddingService.initialize().then((ready) => {
    if (ready) {
      store.setEmbeddingService(embeddingService);
    }
    // If not ready, store continues without embeddings — FTS5/LIKE search still works
  }).catch(() => {
    // Embedding init failure is non-fatal
  });

  const logDir = path.join(projectPath, '.aide');
  const server = createServer(store, { logDir });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', () => {
    store.close();
    process.exit(0);
  });
}
