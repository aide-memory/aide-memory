import fg from 'fast-glob';
import path from 'path';

const DEFAULT_IGNORE_PATTERNS: string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/.turbo/**',
  '**/.next/**',
  '**/__pycache__/**',
  '**/.venv/**',
  '**/venv/**',
  '**/coverage/**',
  '**/tmp/**',
  '**/.cache/**',
];

const ESCAPE_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /^\/|^[A-Z]:\\/i,
];

const MAX_PATTERN_LENGTH = 500;

export interface ScopeResolverOptions {
  ignorePatterns?: string[];
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export class ScopeResolver {
  private readonly projectRoot: string;
  private readonly ignorePatterns: string[];

  constructor(projectRoot: string, options?: ScopeResolverOptions) {
    this.projectRoot = path.resolve(projectRoot);
    this.ignorePatterns = options?.ignorePatterns ?? DEFAULT_IGNORE_PATTERNS;
  }

  validate(pattern: string): ValidationResult {
    if (typeof pattern !== 'string') {
      return { valid: false, reason: 'Pattern must be a string' };
    }

    if (pattern.trim().length === 0) {
      return { valid: false, reason: 'Pattern must not be empty' };
    }

    if (pattern === 'project') {
      return { valid: true };
    }

    if (pattern.length > MAX_PATTERN_LENGTH) {
      return { valid: false, reason: `Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters` };
    }

    for (const escape of ESCAPE_PATTERNS) {
      if (escape.test(pattern)) {
        return { valid: false, reason: 'Pattern must not escape the project root' };
      }
    }

    if (pattern.includes('\0')) {
      return { valid: false, reason: 'Pattern must not contain null bytes' };
    }

    return { valid: true };
  }

  async resolve(pattern: string): Promise<string[]> {
    if (!pattern || pattern === 'project') {
      const files = await fg('**/*', {
        cwd: this.projectRoot,
        ignore: this.ignorePatterns,
        onlyFiles: true,
        dot: false,
      });
      return files.sort();
    }

    let normalized = pattern.replace(/\\/g, '/');

    if (!hasGlobChars(normalized)) {
      const asDir = normalized.replace(/\/$/, '') + '/**';
      const files = await fg([normalized, asDir], {
        cwd: this.projectRoot,
        ignore: this.ignorePatterns,
        onlyFiles: true,
        dot: false,
        suppressErrors: true,
      });
      return [...new Set(files)].sort();
    }

    const files = await fg(normalized, {
      cwd: this.projectRoot,
      ignore: this.ignorePatterns,
      onlyFiles: true,
      dot: false,
    });

    return files.sort();
  }

  async expand(patterns: string[]): Promise<string[]> {
    if (patterns.length === 0) {
      return [];
    }

    const results = await Promise.all(
      patterns.map(p => this.resolve(p))
    );

    const merged = new Set<string>();
    for (const fileList of results) {
      for (const file of fileList) {
        merged.add(file);
      }
    }

    return [...merged].sort();
  }
}

function hasGlobChars(pattern: string): boolean {
  return /[*?{}\[\]]/.test(pattern);
}
