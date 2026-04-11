#!/bin/bash
# Validation setup script — creates test project with seeded memories
# Run: bash /Users/meky/code/aide-v0/scripts/validation-setup.sh
# Then: cd /tmp/aide-val && claude

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

mkdir -p src/auth src/api src/utils src/components

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
export function getUsers() { return []; }
export function createUser(data: any) { return { ...data, id: '1' }; }
EOF

cat > src/api/handler.ts << 'EOF'
export function handleRequest(req: any, res: any) {
  const { method, path } = req;
  res.json({ method, path, timestamp: new Date().toISOString() });
}
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

echo "=== Initializing aide-memory ==="
aide-memory init

echo "=== Seeding memories ==="
aide-memory remember --what "Auth uses JWT with RS256 signing" --layer technical --scope "src/auth/**"
aide-memory remember --what "Use dayjs not moment for date handling" --layer preferences --scope "src/**"
aide-memory remember --what "API rate limiting is 100 req/min per user" --layer area_context --scope "src/api/**"
aide-memory remember --what "All API responses use camelCase" --layer guidelines --scope "src/api/**"
aide-memory remember --what "Button components use functional style with destructured props" --layer preferences --scope "src/components/**"
aide-memory remember --what "Auth middleware validates Bearer tokens only" --layer technical --scope "src/auth/middleware.ts"
aide-memory remember --what "Date utils must handle timezone-aware inputs" --layer technical --scope "src/utils/**"
aide-memory remember --what "API handlers return ISO 8601 timestamps" --layer guidelines --scope "src/api/**"
aide-memory remember --what "Never log auth tokens to console" --layer guidelines --scope "src/auth/**"
aide-memory remember --what "Use async/await not callbacks for API handlers" --layer preferences --scope "src/api/**"

echo ""
echo "=== Setup complete ==="
echo "Memories seeded: $(aide-memory stats 2>/dev/null | grep -i total || echo '10')"
echo ""
echo "Test project at: /tmp/aide-val"
echo "Directories: src/auth/ src/api/ src/utils/ src/components/"
echo ""
echo "To start validation: cd /tmp/aide-val && claude"
