import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { ADAPTERS } from '../../memory/editors';
import { buildRules, _resetBodyCache } from '../../memory/editors/rules';

/**
 * Post-C1.5c rule-template tests. Prior to the refactor there were 5
 * standalone `<editor>.md` / `<editor>.mdc` template files; this suite tested
 * them individually. After the refactor the canonical body lives at
 * `src/templates/rules/shared/body.md` and each editor's rule file is
 * composed from that shared body + adapter-specific frontmatter/notes/toolId.
 *
 * The assertions below now exercise `buildRules(adapter)` — i.e. the RENDERED
 * per-editor content — so the guarantees ("must include agent_message note",
 * "must include all 4 hooks", etc.) apply to what users actually get on disk.
 */

const SHARED_BODY_PATH = path.join(__dirname, '..', 'rules', 'shared', 'body.md');

const TOOLS_LIST = `- \`aide_recall\` — retrieve stored context for file paths you're about to work on
- \`aide_remember\` — store discoveries, decisions, corrections, and preferences
- \`aide_update\` — update an existing memory when information changes
- \`aide_forget\` — remove outdated memories
- \`aide_search\` — find memories by keyword
- \`aide_import\` — seed knowledge from existing markdown docs
- \`aide_memories\` — list all stored memories`;

function render(adapterId: string): string {
  const adapter = ADAPTERS.find((a) => a.id === adapterId);
  if (!adapter) throw new Error(`Unknown adapter: ${adapterId}`);
  return buildRules(adapter, { contributor: 'test-contributor', tools_list: TOOLS_LIST });
}

// Estimate tokens ~ word-count × 1.3. Matches the prior heuristic.
function estimateTokens(text: string): number {
  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  return Math.ceil(wordCount * 1.3);
}

const ALL_ADAPTER_IDS = ['claude-code', 'cursor', 'codex', 'copilot', 'windsurf'] as const;

describe('Rules file templates', () => {
  beforeEach(() => {
    _resetBodyCache();
  });

  describe('shared body is the single source of truth', () => {
    it('shared/body.md exists at the expected location', () => {
      expect(fs.existsSync(SHARED_BODY_PATH)).toBe(true);
      const content = fs.readFileSync(SHARED_BODY_PATH, 'utf-8');
      expect(content.length).toBeGreaterThan(100);
    });

    it('shared body declares all 4 aide-memory layers', () => {
      const content = fs.readFileSync(SHARED_BODY_PATH, 'utf-8');
      for (const layer of ['preferences', 'technical', 'area_context', 'guidelines']) {
        expect(content).toContain(layer);
      }
    });

    it('shared body parameterizes tool_id via {{tool_id}}', () => {
      const content = fs.readFileSync(SHARED_BODY_PATH, 'utf-8');
      expect(content).toContain('{{tool_id}}');
    });

    it('shared body has {{editor_notes}} insertion point for per-editor caveats', () => {
      const content = fs.readFileSync(SHARED_BODY_PATH, 'utf-8');
      expect(content).toContain('{{editor_notes}}');
    });

    it('shared body does NOT claim aide_forget supports archive mode (regression guard)', () => {
      // Prior per-editor drift: codex/copilot/windsurf templates used to say
      // aide_forget could "archive outdated decisions" — incorrect, the tool
      // permanently deletes. This assertion pins the correct behavior in the
      // shared body so future edits don't re-introduce the drift.
      const content = fs.readFileSync(SHARED_BODY_PATH, 'utf-8');
      expect(content).not.toMatch(/archive outdated/i);
      expect(content).toContain('permanently deletes');
      expect(content).toContain('no archive mode');
    });
  });

  describe('every adapter renders successfully', () => {
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} adapter renders non-empty content`, () => {
        const rendered = render(id);
        expect(rendered.length).toBeGreaterThan(500);
      });

      it(`${id} rendered content has no unresolved template variables`, () => {
        const rendered = render(id);
        expect(rendered).not.toMatch(/\{\{\w+\}\}/);
      });
    }
  });

  describe('claude-code adapter', () => {
    it('renders without MDC frontmatter (plain markdown)', () => {
      const rendered = render('claude-code');
      expect(rendered).not.toMatch(/^---\n/);
      expect(rendered).toMatch(/^# /);
    });

    it('rendered content is under 2000 tokens', () => {
      expect(estimateTokens(render('claude-code'))).toBeLessThan(2000);
    });

    it('sets tool to "claude-code"', () => {
      expect(render('claude-code')).toContain('"claude-code"');
    });
  });

  describe('cursor adapter', () => {
    it('rendered content has valid MDC frontmatter', () => {
      const rendered = render('cursor');
      expect(rendered).toMatch(/^---\n/);
      const frontmatterEnd = rendered.indexOf('---', 4);
      expect(frontmatterEnd).toBeGreaterThan(0);

      const frontmatter = rendered.substring(4, frontmatterEnd);
      expect(frontmatter).toContain('description:');
      expect(frontmatter).toContain('globs:');
      expect(frontmatter).toContain('alwaysApply:');
    });

    it('rendered content is under 2000 tokens', () => {
      expect(estimateTokens(render('cursor'))).toBeLessThan(2000);
    });

    it('mentions agent_message for Cursor-specific hook-response behavior', () => {
      expect(render('cursor')).toContain('agent_message');
    });

    it('sets tool to "cursor"', () => {
      expect(render('cursor')).toContain('"cursor"');
    });
  });

  describe('all adapters render required tool names', () => {
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} mentions aide_recall`, () => {
        expect(render(id)).toContain('aide_recall');
      });

      it(`${id} mentions aide_remember`, () => {
        expect(render(id)).toContain('aide_remember');
      });
    }
  });

  describe('all adapters describe the 4 layers', () => {
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} describes preferences, technical, area_context, guidelines`, () => {
        const rendered = render(id);
        for (const layer of ['preferences', 'technical', 'area_context', 'guidelines']) {
          expect(rendered).toContain(layer);
        }
      });
    }
  });

  describe('all adapters mention the 4 hooks', () => {
    const HOOKS = ['PreToolUse', 'Stop', 'UserPromptSubmit', 'PreCompact'];
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} mentions all 4 hooks`, () => {
        const rendered = render(id);
        for (const hook of HOOKS) {
          expect(rendered).toContain(hook);
        }
      });
    }
  });

  describe('all adapters fit under 2000-token soft limit', () => {
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} rendered content is under 2000 tokens`, () => {
        expect(estimateTokens(render(id))).toBeLessThan(2000);
      });
    }
  });

  describe('per-editor tool_id substitution', () => {
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} sets tool to "${id}"`, () => {
        expect(render(id)).toContain(`"${id}"`);
      });
    }
  });

  describe('all adapters mention required preset tags', () => {
    const PRESET_TAGS = ['architecture', 'testing', 'security', 'style', 'api-contract'];
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} lists preset tags`, () => {
        const rendered = render(id);
        for (const tag of PRESET_TAGS) {
          expect(rendered).toContain(tag);
        }
      });
    }
  });

  describe('all adapters show scope glob examples', () => {
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} includes glob pattern examples for scope`, () => {
        expect(render(id)).toMatch(/src\/\S+\*\*/);
      });
    }
  });

  describe('no template references memory "status" field (regression guard)', () => {
    // `status` was never a real memory field; it crept into early drafts.
    // Guard against its return across all rendered editor outputs.
    for (const id of ALL_ADAPTER_IDS) {
      it(`${id} does not reference status field`, () => {
        const rendered = render(id);
        expect(rendered).not.toMatch(/status['"]?\s*[:=]/i);
        expect(rendered).not.toMatch(/\bstatus\b.*field/i);
        expect(rendered).not.toMatch(/field.*\bstatus\b/i);
      });
    }
  });
});
