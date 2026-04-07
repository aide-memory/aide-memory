import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initProject, detectContributor } from '../init';
import fs from 'fs';
import path from 'path';
import os from 'os';

function createTempProject(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-init-test-'));
  // Initialize a git repo so hook installation works
  const { execSync } = require('child_process');
  execSync('git init', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.name "Test User"', { cwd: dir, stdio: 'pipe' });
  execSync('git config user.email "test@example.com"', { cwd: dir, stdio: 'pipe' });
  return dir;
}

function cleanupDir(dir: string): void {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('initProject', () => {
  let projectRoot: string;

  beforeEach(() => {
    projectRoot = createTempProject();
  });

  afterEach(() => {
    cleanupDir(projectRoot);
  });

  it('creates .aide/ directory structure', async () => {
    const result = await initProject(projectRoot);

    expect(fs.existsSync(path.join(projectRoot, '.aide'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.aide', 'memories'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.aide', 'memories', 'preferences', 'personal'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.aide', 'memories', 'preferences', 'shared'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.aide', 'memories', 'technical'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.aide', 'memories', 'area_context'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.aide', 'memories', 'guidelines'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.aide', 'cache'))).toBe(true);

    expect(result.created.length).toBeGreaterThan(0);
  });

  it('writes rules files from templates', async () => {
    const result = await initProject(projectRoot);

    const claudeRulesPath = path.join(projectRoot, '.claude', 'rules', 'aide-memory.md');
    const cursorRulesPath = path.join(projectRoot, '.cursor', 'rules', 'aide-memory.mdc');

    expect(fs.existsSync(claudeRulesPath)).toBe(true);
    expect(fs.existsSync(cursorRulesPath)).toBe(true);

    const claudeContent = fs.readFileSync(claudeRulesPath, 'utf8');
    expect(claudeContent).toContain('aide_recall');
    expect(claudeContent).toContain('aide_remember');
    expect(claudeContent).not.toContain('{{tools_list}}');
    expect(claudeContent).not.toContain('{{contributor}}');

    const cursorContent = fs.readFileSync(cursorRulesPath, 'utf8');
    expect(cursorContent).toContain('aide_recall');

    expect(result.created).toContain('.claude/rules/aide-memory.md');
    expect(result.created).toContain('.cursor/rules/aide-memory.mdc');
  });

  it('creates config.json with defaults', async () => {
    const result = await initProject(projectRoot);

    const configPath = path.join(projectRoot, '.aide', 'config.json');
    expect(fs.existsSync(configPath)).toBe(true);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.version).toBe(1);
    expect(config.contributor).toBe('Test User');
    expect(config.telemetry).toBe(true);
    expect(config.memory).toBeDefined();
    expect(config.memory.layers).toContain('preferences');
    expect(config.memory.layers).toContain('technical');

    expect(result.created).toContain('.aide/config.json');
  });

  it('updates .gitignore without duplicating entries', async () => {
    // First init
    await initProject(projectRoot);

    const gitignorePath = path.join(projectRoot, '.gitignore');
    const content1 = fs.readFileSync(gitignorePath, 'utf8');
    expect(content1).toContain('.aide/memories/preferences/personal/');
    expect(content1).toContain('.aide/cache/');

    // Count occurrences
    const count1 = (content1.match(/\.aide\/cache\//g) || []).length;
    expect(count1).toBe(1);

    // Second init — should not duplicate
    await initProject(projectRoot);

    const content2 = fs.readFileSync(gitignorePath, 'utf8');
    const count2 = (content2.match(/\.aide\/cache\//g) || []).length;
    expect(count2).toBe(1);
  });

  it('installs post-checkout hook', async () => {
    const result = await initProject(projectRoot);

    const hookPath = path.join(projectRoot, '.git', 'hooks', 'post-checkout');
    expect(fs.existsSync(hookPath)).toBe(true);

    const hookContent = fs.readFileSync(hookPath, 'utf8');
    expect(hookContent).toContain('aide-memory post-checkout hook');
    expect(hookContent).toContain('aide reindex');

    // Check executable
    const stats = fs.statSync(hookPath);
    expect(stats.mode & 0o111).toBeTruthy();

    expect(result.created).toContain('.git/hooks/post-checkout');
  });

  it('is idempotent — second run skips existing', async () => {
    const result1 = await initProject(projectRoot);
    expect(result1.created.length).toBeGreaterThan(0);

    const result2 = await initProject(projectRoot);
    expect(result2.skipped.length).toBeGreaterThan(0);

    // Directories should be in skipped
    expect(result2.skipped).toContain('.aide');

    // Config should be in skipped
    expect(result2.skipped).toContain('.aide/config.json');
  });

  it('--force overwrites existing files', async () => {
    // First init
    await initProject(projectRoot);

    // Modify the config
    const configPath = path.join(projectRoot, '.aide', 'config.json');
    fs.writeFileSync(configPath, '{"modified": true}', 'utf8');

    // Force reinit
    const result = await initProject(projectRoot, { force: true });

    // Config should be overwritten with defaults
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.version).toBe(1);
    expect(config.modified).toBeUndefined();

    expect(result.created).toContain('.aide/config.json');
  });

  it('--updateRules only touches rules files', async () => {
    // First init
    await initProject(projectRoot);

    // Modify config (should not be touched by update-rules)
    const configPath = path.join(projectRoot, '.aide', 'config.json');
    fs.writeFileSync(configPath, '{"modified": true}', 'utf8');

    // Update rules only
    const result = await initProject(projectRoot, { updateRules: true });

    // Config should still be modified
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    expect(config.modified).toBe(true);

    // Rules should be refreshed
    expect(result.created.some(f => f.includes('aide-memory'))).toBe(true);

    // No directory creation
    expect(result.created.filter(f => f.startsWith('.aide/'))).toHaveLength(0);
  });

  it('detects contributor from git config', () => {
    const contributor = detectContributor(projectRoot);
    expect(contributor).toBe('Test User');
  });

  it('handles non-git directory gracefully', async () => {
    const nonGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aide-init-nogit-'));

    try {
      const result = await initProject(nonGitDir);

      // Should still create directories
      expect(fs.existsSync(path.join(nonGitDir, '.aide'))).toBe(true);

      // Should have a warning about not being a git repo
      expect(result.warnings.some(w => w.includes('git'))).toBe(true);

      // Contributor should be "unknown"
      const configPath = path.join(nonGitDir, '.aide', 'config.json');
      const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      expect(config.contributor).toBe('unknown');
    } finally {
      cleanupDir(nonGitDir);
    }
  });

  it('appends to existing post-checkout hook without overwriting', async () => {
    // Create an existing hook
    const hooksDir = path.join(projectRoot, '.git', 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });
    const hookPath = path.join(hooksDir, 'post-checkout');
    fs.writeFileSync(hookPath, '#!/bin/bash\necho "existing hook"\n', 'utf8');
    fs.chmodSync(hookPath, 0o755);

    await initProject(projectRoot);

    const content = fs.readFileSync(hookPath, 'utf8');
    expect(content).toContain('echo "existing hook"');
    expect(content).toContain('aide-memory post-checkout hook');
  });
});
