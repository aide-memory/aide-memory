import fg from 'fast-glob';
import path from 'path';

export async function findProjectFiles(rootPath: string): Promise<string[]> {
  const patterns = [
    '**/*.ts',
    '**/*.tsx',
    '**/*.js',
    '**/*.jsx',
    '**/*.json',
    '**/*.md',
  ];

  const ignore = [
    '**/node_modules/**',
    '**/.git/**',
    '**/dist/**',
    '**/build/**',
    '**/.turbo/**',
    '**/.next/**',

    // 🔥 Important: exclude noisy auto-generated files
    '**/package-lock.json',
    '**/pnpm-lock.yaml',
    '**/yarn.lock',
    '**/*.lock',
    '**/*.log',

    // 🔥 Optional filters for reducing noise further
    '**/*.min.js',
    '**/*.min.css',
    '**/coverage/**',
    '**/tmp/**',
    '**/__tests__/**',
  ];

  const files = await fg(patterns, {
    cwd: rootPath,
    ignore,
    absolute: true,
  });

  return files.map((f) => path.resolve(f));
}
