import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import { MemoryStore } from './store';
import { recall } from './recall';
import { logStoreEvent } from './store-log';
import type { MemoryLayer, MemorySource } from './types';

const LAYER_VALUES: [string, ...string[]] = ['preferences', 'technical', 'area_context', 'guidelines'];
const SOURCE_VALUES: [string, ...string[]] = ['conversation', 'import', 'agent_discovery', 'elevated', 'hook'];

/** Coerce a value to number — LLMs often send numbers as strings */
function toNumber(v: unknown): number {
  return typeof v === 'string' ? Number(v) : v as number;
}

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
      paths: z.array(z.string()).optional().describe('File or directory paths you are working in. Returns memories scoped to these areas plus project-wide context.'),
      query: z.string().optional().describe('Optional text to boost relevant results (e.g. "skeleton loading" or "authentication flow").'),
      layers: z.array(z.enum(LAYER_VALUES)).optional().describe('Filter to specific layers: preferences, technical, area_context, guidelines.'),
      contributor: z.string().optional().describe('Filter to a specific contributor.'),
      limit: z.number().optional().describe('Max memories to return (default 20).'),
    },
    async (params) => {
      const result = recall(store, {
        paths: params.paths,
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

      // Track recalled paths so the Read hook knows not to block again
      // Format: "PID|absolutePath" — PID scopes tracking to this session
      if (logDir && params.paths) {
        try {
          const cacheDir = path.join(logDir, 'cache');
          fs.mkdirSync(cacheDir, { recursive: true });
          const recalledFile = path.join(cacheDir, 'recalled-paths.txt');
          const pid = process.ppid ?? process.pid;
          const pathsToWrite = params.paths.map(p => `${pid}|${path.resolve(p)}`).join('\n') + '\n';
          fs.appendFileSync(recalledFile, pathsToWrite);
        } catch { /* Non-fatal */ }
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
      scope: z.string().optional().describe('Glob pattern for the code area this applies to (e.g. "src/components/dashboard/**"). Omit for project-wide.'),
      why: z.string().optional().describe('Context for why this is worth remembering.'),
      context_label: z.string().optional().describe('Feature grouping label (e.g. "dashboard skeleton loading", "Add App modal").'),
      contributor: z.string().optional().describe('Who this knowledge came from (for preferences layer).'),
      tags: z.array(z.string()).optional().describe('Tags for categorization.'),
      source: z.enum(SOURCE_VALUES).optional().describe('How this was captured. Default: conversation.'),
      shared: z.boolean().optional().describe('Whether this memory is shared (true, default) or personal (false). Only affects preferences layer file placement.'),
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
      id: z.number().describe('ID of the memory to update.'),
      what: z.string().optional().describe('Updated knowledge text.'),
      why: z.string().optional().describe('Updated context.'),
      scope: z.string().optional().describe('Updated scope pattern.'),
      context_label: z.string().optional().describe('Updated feature label.'),
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
      id: z.number().describe('The memory ID to delete.'),
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
      layer: z.enum(LAYER_VALUES).optional().describe('Filter by layer.'),
      scope: z.string().optional().describe('Filter by exact scope.'),
      contributor: z.string().optional().describe('Filter by contributor.'),
      limit: z.number().optional().describe('Max results (default 50).'),
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
      scope: z.string().optional().describe('Scope for all imported memories.'),
      context_label: z.string().optional().describe('Label for the import batch.'),
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
      layer: z.enum(LAYER_VALUES).optional().describe('Filter to a specific layer.'),
      limit: z.number().optional().describe('Max results (default 50).'),
    },
    async (params) => {
      const memories = store.search(params.keyword, {
        layer: params.layer as MemoryLayer | undefined,
        limit: params.limit,
      });

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
  const store = new MemoryStore({ projectRoot: projectPath });
  const logDir = path.join(projectPath, '.aide');
  const server = createServer(store, { logDir });
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.on('SIGINT', () => {
    store.close();
    process.exit(0);
  });
}
