#!/bin/bash
# Validation setup script — creates test project with seeded memories
# Run: bash /Users/meky/code/aide-v0/scripts/validation-setup.sh
# Then: cd /tmp/aide-val && claude --debug
#
# Supports functional sessions (A-G, F0) and user scenarios (U1-U3).
# Conventions are designed to be UN-DISCOVERABLE from code (anti-false-positive).

set -e

echo "=== Building aide-memory ==="
cd /Users/meky/code/aide-v0
npm run build
npm link

echo "=== Creating test project ==="
rm -rf /tmp/aide-val
mkdir -p /tmp/aide-val && cd /tmp/aide-val
git init
git config user.name "test-user"
git config user.email "test@test.com"
npm init -y

mkdir -p src/auth src/api src/utils src/components src/db src/middleware src/lib src/repos tests/helpers

# --- Source files ---
# IMPORTANT: These files intentionally do NOT demonstrate the seeded conventions.
# The conventions (epoch timestamps, soft deletes, requestId, repo pattern)
# are team decisions that can't be inferred from reading the code.

cat > src/auth/middleware.ts << 'EOF'
export function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers?.authorization?.split(' ')[1];
  if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }
  next();
}
EOF

cat > src/auth/types.ts << 'EOF'
export interface AuthToken {
  userId: string;
  exp: number;
  iat: number;
}
EOF

cat > src/api/routes.ts << 'EOF'
import { authMiddleware } from '../auth/middleware';

// Existing routes — intentionally minimal, no examples of conventions
export function getUsers() { return []; }
export function createUser(data: any) { return { ...data, id: '1' }; }
EOF

cat > src/api/handler.ts << 'EOF'
export function handleRequest(req: any, res: any) {
  const { method, path } = req;
  res.json({ method, path, ok: true });
}
EOF

cat > src/middleware/rate-limit.ts << 'EOF'
// Rate limiter middleware — exists but code doesn't reveal the limit values
export function rateLimiter(scope: string, limit: number) {
  return (req: any, res: any, next: any) => {
    // Token bucket implementation
    next();
  };
}
EOF

cat > src/lib/logger.ts << 'EOF'
// Structured logger — exists but nothing in the codebase uses it yet
export function createLogger(context: Record<string, string>) {
  return {
    info: (msg: string, data?: any) => console.log(JSON.stringify({ ...context, msg, ...data })),
    error: (msg: string, err?: Error) => console.error(JSON.stringify({ ...context, msg, error: err?.message })),
  };
}
EOF

cat > src/repos/base.ts << 'EOF'
// Base repository — exists but no other repos created yet
export class BaseRepo {
  constructor(private tableName: string) {}
  async findById(id: string) { return null; }
  async create(data: any) { return { ...data, id: '1' }; }
}
EOF

cat > src/db/connection.ts << 'EOF'
export const db = { query: async (sql: string, params?: any[]) => ({ rows: [] }) };
EOF

cat > src/utils/dates.ts << 'EOF'
import dayjs from 'dayjs';
export const formatDate = (d: Date) => dayjs(d).format('YYYY-MM-DD');
EOF

cat > src/components/Button.tsx << 'EOF'
export const Button = ({ label, onClick }: { label: string; onClick: () => void }) => {
  return <button onClick={onClick}>{label}</button>;
};
EOF

cat > tests/helpers/db.ts << 'EOF'
// Test database factory — exists but no tests use it yet
export function createTestDb() {
  return {
    seed: async (table: string, data: any[]) => {},
    clean: async () => {},
    query: async (sql: string) => ({ rows: [] }),
  };
}
EOF

cat > README.md << 'EOF'
# Test Project
A sample API project for validation testing.
EOF

git add -A && git commit -m "initial project setup"

echo "=== Initializing aide-memory (creates dirs, rules, hooks, MCP config) ==="
aide-memory init

echo "=== Seeding memories (10+ for blocking threshold) ==="

# --- Functional session memories (A-G) ---
# Scoped memories for src/auth/**
aide-memory remember "Auth uses JWT with RS256 signing" --layer technical --scope "src/auth/**"
aide-memory remember "Auth middleware validates Bearer tokens only" --layer technical --scope "src/auth/middleware.ts"
aide-memory remember "Never log auth tokens to console" --layer guidelines --scope "src/auth/**"

# Scoped memories for src/api/**
aide-memory remember "All API responses use camelCase keys" --layer guidelines --scope "src/api/**"
aide-memory remember "Use async/await not callbacks for API handlers" --layer preferences --scope "src/api/**"
aide-memory remember "API rate limiting is 50 req/min per user, enforced via rateLimiter('user', 50) from src/middleware/rate-limit.ts" --layer technical --scope "src/api/**"

# Scoped memories for src/components/**
aide-memory remember "Button components use functional style with destructured props" --layer preferences --scope "src/components/**"

# Project-wide memories (no scope — used to test soft nudge vs block)
aide-memory remember "Use dayjs not moment for date handling" --layer preferences
aide-memory remember "Date utils must handle timezone-aware inputs" --layer technical --scope "src/utils/**"

# --- U1 anti-false-positive conventions (NOT discoverable from code) ---
aide-memory remember "All timestamps as Unix epoch ms, never ISO 8601 — frontend team parses epoch directly" --layer guidelines --scope "src/api/**"
aide-memory remember "Soft deletes only (deleted_at column), never hard DELETE — legal requires 90-day retention" --layer guidelines --scope "src/**"
aide-memory remember "Error responses must include requestId from X-Request-ID header for support ticket correlation" --layer guidelines --scope "src/api/**"

# --- U3 behavioral preferences ---
aide-memory remember "Always explain your approach before writing code — never start coding without a brief plan" --layer preferences
aide-memory remember "Keep functions under 30 lines — split into helpers if longer" --layer preferences --scope "src/**"
aide-memory remember "Never add TODO comments — either fix it now or create a GitHub issue" --layer preferences

echo ""
echo "=== Setup complete ==="
echo "Memories seeded: $(aide-memory stats 2>/dev/null | grep -i total || echo '15')"
echo ""
echo "Test project at: /tmp/aide-val"
echo "Directories: src/auth/ src/api/ src/utils/ src/components/ src/db/ src/middleware/ src/lib/ src/repos/ tests/helpers/"
echo ""
echo "To start validation:"
echo "  cd /tmp/aide-val && claude --debug"
echo ""
echo "Debug log will be at: ~/.claude/debug/<session-id>.txt"
echo ""
echo "Functional sessions: A-G (see PHASE_0_1_SPEC.md section 12.3)"
echo "User scenarios: U1-U3 (same section)"
