import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const RULES_DIR = path.join(__dirname, '..', 'rules');

function readTemplate(name: string): string {
  return fs.readFileSync(path.join(RULES_DIR, name), 'utf-8');
}

// Rough token estimate: word count * 1.3
function estimateTokens(text: string): number {
  const wordCount = text.split(/\s+/).filter(w => w.length > 0).length;
  return Math.ceil(wordCount * 1.3);
}

const ALL_TEMPLATES = [
  { name: 'claude-code.md', label: 'Claude Code' },
  { name: 'cursor.mdc', label: 'Cursor' },
  { name: 'copilot.md', label: 'Copilot' },
  { name: 'windsurf.md', label: 'Windsurf' },
  { name: 'codex.md', label: 'Codex' },
];

const FULL_TEMPLATES = ['claude-code.md', 'cursor.mdc'];
const LIGHT_TEMPLATES = ['copilot.md', 'windsurf.md', 'codex.md'];

describe('Rules file templates', () => {
  describe('all templates exist and are readable', () => {
    for (const { name, label } of ALL_TEMPLATES) {
      it(`${label} template exists`, () => {
        const filePath = path.join(RULES_DIR, name);
        expect(fs.existsSync(filePath)).toBe(true);
        const content = readTemplate(name);
        expect(content.length).toBeGreaterThan(100);
      });
    }
  });

  describe('Claude Code template', () => {
    it('is valid markdown (no MDC frontmatter)', () => {
      const content = readTemplate('claude-code.md');
      expect(content).not.toMatch(/^---\n/);
      expect(content).toMatch(/^# /);
    });

    it('is under 2000 tokens', () => {
      const content = readTemplate('claude-code.md');
      const tokens = estimateTokens(content);
      expect(tokens).toBeLessThan(2000);
    });
  });

  describe('Cursor template', () => {
    it('has valid MDC frontmatter', () => {
      const content = readTemplate('cursor.mdc');
      // MDC format: starts with --- frontmatter ---
      expect(content).toMatch(/^---\n/);
      const frontmatterEnd = content.indexOf('---', 4);
      expect(frontmatterEnd).toBeGreaterThan(0);

      const frontmatter = content.substring(4, frontmatterEnd);
      expect(frontmatter).toContain('description:');
      expect(frontmatter).toContain('globs:');
      expect(frontmatter).toContain('alwaysApply:');
    });

    it('is under 2000 tokens', () => {
      const content = readTemplate('cursor.mdc');
      const tokens = estimateTokens(content);
      expect(tokens).toBeLessThan(2000);
    });

    it('mentions agent_message for Cursor-specific behavior', () => {
      const content = readTemplate('cursor.mdc');
      expect(content).toContain('agent_message');
    });
  });

  describe('all templates mention required tools', () => {
    for (const { name, label } of ALL_TEMPLATES) {
      it(`${label} mentions aide_recall`, () => {
        expect(readTemplate(name)).toContain('aide_recall');
      });

      it(`${label} mentions aide_remember`, () => {
        expect(readTemplate(name)).toContain('aide_remember');
      });
    }
  });

  describe('all templates include layer selection guidance', () => {
    for (const { name, label } of ALL_TEMPLATES) {
      it(`${label} describes all 4 layers`, () => {
        const content = readTemplate(name);
        expect(content).toContain('preferences');
        expect(content).toContain('technical');
        expect(content).toContain('area_context');
        expect(content).toContain('guidelines');
      });
    }
  });

  describe('template variables are present and properly formatted', () => {
    for (const { name, label } of ALL_TEMPLATES) {
      it(`${label} contains {{contributor}} variable`, () => {
        expect(readTemplate(name)).toContain('{{contributor}}');
      });

      it(`${label} contains {{tools_list}} variable`, () => {
        expect(readTemplate(name)).toContain('{{tools_list}}');
      });
    }
  });

  describe('no template references "status" field', () => {
    for (const { name, label } of ALL_TEMPLATES) {
      it(`${label} does not reference status field`, () => {
        const content = readTemplate(name);
        // Should not mention status as a memory field/parameter
        // Allow "git status" or general prose use of the word, but not field references
        expect(content).not.toMatch(/status['"]?\s*[:=]/i);
        expect(content).not.toMatch(/\bstatus\b.*field/i);
        expect(content).not.toMatch(/field.*\bstatus\b/i);
      });
    }
  });

  describe('all templates mention the 4 hooks', () => {
    const HOOKS = ['PreToolUse', 'Stop', 'UserPromptSubmit', 'PreCompact'];

    for (const { name, label } of ALL_TEMPLATES) {
      it(`${label} mentions all 4 hooks`, () => {
        const content = readTemplate(name);
        for (const hook of HOOKS) {
          expect(content).toContain(hook);
        }
      });
    }
  });

  describe('token limits', () => {
    for (const name of FULL_TEMPLATES) {
      it(`${name} (full template) is under 2000 tokens`, () => {
        const tokens = estimateTokens(readTemplate(name));
        expect(tokens).toBeLessThan(2000);
      });
    }

    for (const name of LIGHT_TEMPLATES) {
      it(`${name} (lightweight template) is under 2000 tokens`, () => {
        const tokens = estimateTokens(readTemplate(name));
        expect(tokens).toBeLessThan(2000);
      });
    }
  });

  describe('tool-specific generated_by values', () => {
    it('Claude Code sets tool to "claude-code"', () => {
      expect(readTemplate('claude-code.md')).toContain('"claude-code"');
    });

    it('Cursor sets tool to "cursor"', () => {
      expect(readTemplate('cursor.mdc')).toContain('"cursor"');
    });

    it('Copilot sets tool to "copilot"', () => {
      expect(readTemplate('copilot.md')).toContain('"copilot"');
    });

    it('Windsurf sets tool to "windsurf"', () => {
      expect(readTemplate('windsurf.md')).toContain('"windsurf"');
    });

    it('Codex sets tool to "codex"', () => {
      expect(readTemplate('codex.md')).toContain('"codex"');
    });
  });

  describe('scope guidance', () => {
    for (const { name, label } of ALL_TEMPLATES) {
      it(`${label} includes glob pattern examples for scope`, () => {
        const content = readTemplate(name);
        expect(content).toMatch(/src\/\S+\*\*/);
      });
    }
  });

  describe('tag presets', () => {
    const PRESET_TAGS = ['architecture', 'testing', 'security', 'style', 'api-contract'];

    for (const { name, label } of ALL_TEMPLATES) {
      it(`${label} lists preset tags`, () => {
        const content = readTemplate(name);
        for (const tag of PRESET_TAGS) {
          expect(content).toContain(tag);
        }
      });
    }
  });
});
