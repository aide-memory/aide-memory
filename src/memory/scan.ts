import fs from 'fs';
import path from 'path';
import type { MemoryLayer, MemorySource } from './types';

export interface ScannedMemory {
  what: string;
  layer: MemoryLayer;
  scope?: string;
  tags: string[];
  source: MemorySource;
}

interface PackageJson {
  name?: string;
  version?: string;
  type?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  workspaces?: string[] | { packages: string[] };
}

/**
 * Scan a project root and generate memories from filesystem analysis.
 * No LLM needed — purely reads config files and directory structure.
 *
 * Targets 15-30 memories for a typical project.
 */
export function scanProject(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];

  // Detect package.json
  const pkgJsonPath = path.join(projectRoot, 'package.json');
  if (fileExists(pkgJsonPath)) {
    const pkg = readJsonSafe<PackageJson>(pkgJsonPath);
    if (pkg) {
      memories.push(...scanPackageJson(pkg));
    }
  }

  // Detect TypeScript
  if (fileExists(path.join(projectRoot, 'tsconfig.json'))) {
    memories.push(...scanTsConfig(projectRoot));
  }

  // Detect jsconfig.json
  if (fileExists(path.join(projectRoot, 'jsconfig.json'))) {
    memories.push(mem('Project uses JavaScript with jsconfig.json configuration', ['javascript', 'config']));
  }

  // Detect Go
  if (fileExists(path.join(projectRoot, 'go.mod'))) {
    memories.push(...scanGoMod(projectRoot));
  }

  // Detect Rust
  if (fileExists(path.join(projectRoot, 'Cargo.toml'))) {
    memories.push(mem('Project uses Rust with Cargo', ['rust', 'cargo']));
  }

  // Detect Python
  if (fileExists(path.join(projectRoot, 'pyproject.toml'))) {
    memories.push(...scanPyProject(projectRoot));
  } else if (fileExists(path.join(projectRoot, 'setup.py'))) {
    memories.push(mem('Python project using setup.py', ['python', 'setup.py']));
  } else if (fileExists(path.join(projectRoot, 'requirements.txt'))) {
    memories.push(mem('Python project with requirements.txt', ['python', 'requirements']));
  }

  // Detect directory structure
  memories.push(...scanDirectoryStructure(projectRoot));

  // Detect test framework
  memories.push(...scanTestConfig(projectRoot));

  // Detect existing docs
  memories.push(...scanExistingDocs(projectRoot));

  // Detect CI/CD
  memories.push(...scanCiConfig(projectRoot));

  // Detect Docker
  if (fileExists(path.join(projectRoot, 'Dockerfile')) || fileExists(path.join(projectRoot, 'docker-compose.yml')) || fileExists(path.join(projectRoot, 'docker-compose.yaml'))) {
    memories.push(mem('Project uses Docker for containerization', ['docker', 'infrastructure']));
  }

  // Detect linting/formatting
  memories.push(...scanLintConfig(projectRoot));

  // Detect package managers
  memories.push(...scanPackageManager(projectRoot));

  // Deduplicate by `what` field
  const seen = new Set<string>();
  return memories.filter(m => {
    if (seen.has(m.what)) return false;
    seen.add(m.what);
    return true;
  });
}

function scanPackageJson(pkg: PackageJson): ScannedMemory[] {
  const memories: ScannedMemory[] = [];
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Project name
  if (pkg.name) {
    memories.push(mem(`Project name is "${pkg.name}"`, ['project', 'name']));
  }

  // Module type
  if (pkg.type === 'module') {
    memories.push(mem('Project uses ES modules (type: "module" in package.json)', ['esm', 'modules']));
  } else if (pkg.type === 'commonjs' || (!pkg.type && deps)) {
    memories.push(mem('Project uses CommonJS modules', ['commonjs', 'modules']));
  }

  // Monorepo detection
  if (pkg.workspaces) {
    memories.push(mem('Project is a monorepo with npm/yarn workspaces', ['monorepo', 'workspaces']));
  }

  // Frameworks
  if (deps['next']) {
    memories.push(mem('Project uses Next.js framework', ['nextjs', 'framework', 'react']));
  } else if (deps['react']) {
    memories.push(mem('Project uses React', ['react', 'frontend']));
  }

  if (deps['vue']) {
    memories.push(mem('Project uses Vue.js', ['vue', 'frontend']));
  }

  if (deps['@angular/core']) {
    memories.push(mem('Project uses Angular', ['angular', 'frontend']));
  }

  if (deps['svelte'] || deps['@sveltejs/kit']) {
    memories.push(mem('Project uses Svelte', ['svelte', 'frontend']));
  }

  if (deps['express']) {
    memories.push(mem('Project uses Express.js for HTTP server', ['express', 'backend', 'http']));
  }

  if (deps['fastify']) {
    memories.push(mem('Project uses Fastify for HTTP server', ['fastify', 'backend', 'http']));
  }

  if (deps['hono']) {
    memories.push(mem('Project uses Hono for HTTP server', ['hono', 'backend', 'http']));
  }

  if (deps['prisma'] || deps['@prisma/client']) {
    memories.push(mem('Project uses Prisma ORM for database access', ['prisma', 'orm', 'database']));
  }

  if (deps['drizzle-orm']) {
    memories.push(mem('Project uses Drizzle ORM for database access', ['drizzle', 'orm', 'database']));
  }

  if (deps['better-sqlite3']) {
    memories.push(mem('Project uses better-sqlite3 for SQLite database', ['sqlite', 'database']));
  }

  if (deps['tailwindcss']) {
    memories.push(mem('Project uses Tailwind CSS for styling', ['tailwind', 'css', 'styling']));
  }

  if (deps['zod']) {
    memories.push(mem('Project uses Zod for runtime type validation', ['zod', 'validation']));
  }

  // Build tools from scripts
  if (pkg.scripts) {
    if (pkg.scripts.build?.includes('tsc')) {
      memories.push(mem('Project builds with tsc (TypeScript compiler)', ['typescript', 'build', 'tsc']));
    } else if (pkg.scripts.build?.includes('vite')) {
      memories.push(mem('Project builds with Vite', ['vite', 'build']));
    } else if (pkg.scripts.build?.includes('webpack')) {
      memories.push(mem('Project builds with Webpack', ['webpack', 'build']));
    } else if (pkg.scripts.build?.includes('esbuild')) {
      memories.push(mem('Project builds with esbuild', ['esbuild', 'build']));
    } else if (pkg.scripts.build?.includes('rollup')) {
      memories.push(mem('Project builds with Rollup', ['rollup', 'build']));
    }
  }

  return memories;
}

function scanTsConfig(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];
  memories.push(mem('Project uses TypeScript', ['typescript', 'language']));

  const tsconfigPath = path.join(projectRoot, 'tsconfig.json');
  const tsconfig = readJsonSafe<{ compilerOptions?: { strict?: boolean; module?: string; target?: string } }>(tsconfigPath);
  if (tsconfig?.compilerOptions) {
    if (tsconfig.compilerOptions.strict) {
      memories.push(mem('TypeScript strict mode is enabled', ['typescript', 'strict']));
    }
    if (tsconfig.compilerOptions.target) {
      memories.push(mem(`TypeScript compilation target is ${tsconfig.compilerOptions.target}`, ['typescript', 'target']));
    }
  }

  return memories;
}

function scanGoMod(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];
  memories.push(mem('Project uses Go', ['go', 'language']));

  const goModPath = path.join(projectRoot, 'go.mod');
  try {
    const content = fs.readFileSync(goModPath, 'utf8');
    const moduleMatch = content.match(/^module\s+(\S+)/m);
    if (moduleMatch) {
      memories.push(mem(`Go module path is ${moduleMatch[1]}`, ['go', 'module']));
    }
  } catch {
    // ignore read errors
  }

  return memories;
}

function scanPyProject(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];
  memories.push(mem('Python project using pyproject.toml', ['python', 'pyproject']));

  const pyprojectPath = path.join(projectRoot, 'pyproject.toml');
  try {
    const content = fs.readFileSync(pyprojectPath, 'utf8');
    if (content.includes('[tool.poetry]')) {
      memories.push(mem('Project uses Poetry for Python dependency management', ['python', 'poetry']));
    }
    if (content.includes('[tool.pytest')) {
      memories.push(mem('Project uses pytest for testing', ['python', 'pytest', 'testing']));
    }
    if (content.includes('django')) {
      memories.push(mem('Project uses Django framework', ['python', 'django', 'framework']));
    }
    if (content.includes('fastapi')) {
      memories.push(mem('Project uses FastAPI framework', ['python', 'fastapi', 'framework']));
    }
    if (content.includes('flask')) {
      memories.push(mem('Project uses Flask framework', ['python', 'flask', 'framework']));
    }
  } catch {
    // ignore read errors
  }

  return memories;
}

function scanDirectoryStructure(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];

  const dirs = listDirectories(projectRoot);

  if (dirs.includes('src')) {
    memories.push(mem('Source code is in src/ directory', ['structure', 'src']));
  }

  if (dirs.includes('packages') || dirs.includes('apps')) {
    memories.push(mem('Monorepo with packages/ or apps/ directory structure', ['monorepo', 'structure']));
  }

  if (dirs.includes('lib')) {
    memories.push(mem('Project has lib/ directory for library code', ['structure', 'lib']));
  }

  if (dirs.includes('test') || dirs.includes('tests') || dirs.includes('__tests__')) {
    const testDir = dirs.includes('test') ? 'test' : dirs.includes('tests') ? 'tests' : '__tests__';
    memories.push(mem(`Tests are in ${testDir}/ directory`, ['testing', 'structure']));
  }

  if (dirs.includes('docs')) {
    memories.push(mem('Project has docs/ directory for documentation', ['documentation', 'structure']));
  }

  if (dirs.includes('scripts')) {
    memories.push(mem('Project has scripts/ directory for utility scripts', ['scripts', 'structure']));
  }

  return memories;
}

function scanTestConfig(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];

  // Vitest
  if (
    fileExists(path.join(projectRoot, 'vitest.config.ts')) ||
    fileExists(path.join(projectRoot, 'vitest.config.js')) ||
    fileExists(path.join(projectRoot, 'vitest.config.mts'))
  ) {
    memories.push(mem('Project uses Vitest for testing', ['vitest', 'testing']));
    return memories;
  }

  // Check package.json scripts for vitest
  const pkgPath = path.join(projectRoot, 'package.json');
  if (fileExists(pkgPath)) {
    const pkg = readJsonSafe<PackageJson>(pkgPath);
    if (pkg?.scripts) {
      const testCmd = pkg.scripts.test || '';
      if (testCmd.includes('vitest')) {
        memories.push(mem('Project uses Vitest for testing', ['vitest', 'testing']));
        return memories;
      }
      if (testCmd.includes('jest')) {
        memories.push(mem('Project uses Jest for testing', ['jest', 'testing']));
        return memories;
      }
      if (testCmd.includes('mocha')) {
        memories.push(mem('Project uses Mocha for testing', ['mocha', 'testing']));
        return memories;
      }
    }

    // Check devDependencies
    if (pkg?.devDependencies) {
      if (pkg.devDependencies['vitest']) {
        memories.push(mem('Project uses Vitest for testing', ['vitest', 'testing']));
        return memories;
      }
    }
  }

  // Jest config files
  if (
    fileExists(path.join(projectRoot, 'jest.config.ts')) ||
    fileExists(path.join(projectRoot, 'jest.config.js')) ||
    fileExists(path.join(projectRoot, 'jest.config.mjs'))
  ) {
    memories.push(mem('Project uses Jest for testing', ['jest', 'testing']));
    return memories;
  }

  // Pytest
  if (
    fileExists(path.join(projectRoot, 'pytest.ini')) ||
    fileExists(path.join(projectRoot, 'conftest.py'))
  ) {
    memories.push(mem('Project uses pytest for testing', ['pytest', 'testing']));
    return memories;
  }

  return memories;
}

function scanExistingDocs(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];

  if (fileExists(path.join(projectRoot, 'CLAUDE.md'))) {
    memories.push(mem('Project has CLAUDE.md with Claude Code instructions', ['claude', 'documentation']));
  }

  if (fileExists(path.join(projectRoot, '.cursorrules'))) {
    memories.push(mem('Project has .cursorrules with Cursor AI instructions', ['cursor', 'documentation']));
  }

  if (fileExists(path.join(projectRoot, 'CONTRIBUTING.md'))) {
    memories.push(mem('Project has CONTRIBUTING.md with contribution guidelines', ['contributing', 'documentation']));
  }

  if (fileExists(path.join(projectRoot, 'README.md'))) {
    memories.push(mem('Project has README.md', ['readme', 'documentation']));
  }

  return memories;
}

function scanCiConfig(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];

  if (
    fileExists(path.join(projectRoot, '.github', 'workflows')) &&
    fs.statSync(path.join(projectRoot, '.github', 'workflows')).isDirectory()
  ) {
    memories.push(mem('Project uses GitHub Actions for CI/CD', ['github-actions', 'ci']));
  }

  if (fileExists(path.join(projectRoot, '.gitlab-ci.yml'))) {
    memories.push(mem('Project uses GitLab CI for CI/CD', ['gitlab-ci', 'ci']));
  }

  if (fileExists(path.join(projectRoot, '.circleci', 'config.yml'))) {
    memories.push(mem('Project uses CircleCI for CI/CD', ['circleci', 'ci']));
  }

  return memories;
}

function scanLintConfig(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];

  if (
    fileExists(path.join(projectRoot, '.eslintrc.js')) ||
    fileExists(path.join(projectRoot, '.eslintrc.json')) ||
    fileExists(path.join(projectRoot, '.eslintrc.yml')) ||
    fileExists(path.join(projectRoot, 'eslint.config.js')) ||
    fileExists(path.join(projectRoot, 'eslint.config.mjs'))
  ) {
    memories.push(mem('Project uses ESLint for linting', ['eslint', 'linting']));
  }

  if (
    fileExists(path.join(projectRoot, '.prettierrc')) ||
    fileExists(path.join(projectRoot, '.prettierrc.json')) ||
    fileExists(path.join(projectRoot, '.prettierrc.js')) ||
    fileExists(path.join(projectRoot, 'prettier.config.js'))
  ) {
    memories.push(mem('Project uses Prettier for code formatting', ['prettier', 'formatting']));
  }

  if (fileExists(path.join(projectRoot, 'biome.json')) || fileExists(path.join(projectRoot, 'biome.jsonc'))) {
    memories.push(mem('Project uses Biome for linting and formatting', ['biome', 'linting', 'formatting']));
  }

  return memories;
}

function scanPackageManager(projectRoot: string): ScannedMemory[] {
  const memories: ScannedMemory[] = [];

  if (fileExists(path.join(projectRoot, 'pnpm-lock.yaml'))) {
    memories.push(mem('Project uses pnpm as package manager', ['pnpm', 'package-manager']));
  } else if (fileExists(path.join(projectRoot, 'yarn.lock'))) {
    memories.push(mem('Project uses Yarn as package manager', ['yarn', 'package-manager']));
  } else if (fileExists(path.join(projectRoot, 'bun.lockb')) || fileExists(path.join(projectRoot, 'bun.lock'))) {
    memories.push(mem('Project uses Bun as package manager', ['bun', 'package-manager']));
  } else if (fileExists(path.join(projectRoot, 'package-lock.json'))) {
    memories.push(mem('Project uses npm as package manager', ['npm', 'package-manager']));
  }

  return memories;
}

// ---- Helpers ----

function mem(what: string, tags: string[]): ScannedMemory {
  return {
    what,
    layer: 'technical',
    tags,
    source: 'agent_discovery',
  };
}

function fileExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function listDirectories(dirPath: string): string[] {
  try {
    return fs.readdirSync(dirPath, { withFileTypes: true })
      .filter(d => d.isDirectory() && !d.name.startsWith('.'))
      .map(d => d.name);
  } catch {
    return [];
  }
}
