#!/usr/bin/env bash
# Set up the homepage / LinkedIn demo fixture for aide-memory.
#
# Usage:
#   bash scripts/demo/setup-demo-v2.sh                  # default target /tmp/aide-demo-v2
#   bash scripts/demo/setup-demo-v2.sh --target /path   # custom target
#
# After this:
#   cd <target> && open a Claude Code session in that directory.
#   Type the 5 prompts from docs/launch/demo-script-v2.md (or memory #432 setup).
#
# Rules-file ordering matters — see memory #437. The reactive rules file MUST
# be the LAST thing written before the user opens the Claude Code session,
# because rulesGen overwrites it on every memory write. Claude Code reads the
# rules once at session start, so the reactive content sticks for the whole
# recording even though subsequent regens silently clobber the file on disk.

set -euo pipefail

DEMO=/tmp/aide-demo-v2
while [[ $# -gt 0 ]]; do
  case "$1" in
    --target) DEMO="$2"; shift 2 ;;
    -h|--help) echo "Usage: $0 [--target /path]"; exit 0 ;;
    *) echo "unknown arg: $1"; exit 1 ;;
  esac
done

# 1. Project files + git init
rm -rf "$DEMO"
mkdir -p "$DEMO/src/api" "$DEMO/src/components"
cd "$DEMO"
git init -q
git config user.email "demo@example.com"
git config user.name "demo"

cat > package.json <<'EOF'
{
  "name": "user-profile-app",
  "version": "0.1.0",
  "scripts": { "dev": "ts-node src/index.ts", "build": "tsc" }
}
EOF

cat > README.md <<'EOF'
# user-profile-app

User profile feature — backend (Express) + frontend (React).

- `src/api/routes.ts` — Express routes (data access via service layer)
- `src/components/DataView.tsx` — profile UI (server state via React Query)
EOF

cat > src/api/routes.ts <<'EOF'
import { Router } from 'express';
import { userService } from '../services/user';

const router = Router();

router.get('/users/:id', async (req, res) => {
  const user = await userService.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'not_found' });
  res.json({
    userId: user.id,
    fullName: user.fullName,
    email: user.email,
  });
});

router.post('/users', async (req, res) => {
  const created = await userService.create(req.body);
  res.status(201).json({ userId: created.id });
});

export default router;
EOF

cat > src/components/DataView.tsx <<'EOF'
import { useQuery } from '@tanstack/react-query';

interface User {
  userId: string;
  fullName: string;
  email: string;
}

export function DataView({ id }: { id: string }): JSX.Element {
  const { data: user, isLoading } = useQuery<User>({
    queryKey: ['user', id],
    queryFn: () => fetch(`/api/users/${id}`).then((r) => r.json()),
  });

  if (isLoading || !user) return <div>Loading…</div>;
  return (
    <div className="profile">
      <h2>{user.fullName}</h2>
      <p>{user.email}</p>
    </div>
  );
}
EOF

git add -A && git commit -q -m "initial: user profile with service layer + react query"

# 2. aide-memory init (writes canonical rules — overwritten in step 5)
aide-memory init >/dev/null 2>&1

# 3. Config tweaks
aide-memory config hooks.stop.schedule '[{"until":3,"every":99},{"every":1}]' >/dev/null
aide-memory config memories.softening.threshold 2 >/dev/null

# 4. Seed memories (regen fires here, rules get overwritten — fine, step 5 fixes)
aide-memory remember "All data access goes through the service layer (userService.findById, postService.list, etc.). Route handlers never call db.* directly — services own all DB access for testability and caching." \
  --layer guidelines --scope 'src/api/**' --why 'testability + consistent caching' >/dev/null

aide-memory remember "Rate limit 50 req/min per authenticated user. Public endpoints rate-limit per IP, authenticated endpoints rate-limit per auth.userId from middleware." \
  --layer area_context --scope 'src/api/**' --why 'DDoS protection + per-user fairness' >/dev/null

aide-memory remember "Components fetch server state via React Query (useQuery / useMutation). Never useEffect + fetch — that bypasses caching, retry, and stale-while-revalidate that React Query handles." \
  --layer guidelines --scope 'src/components/**' --why 'consistent server-state management' >/dev/null

# 5. CRITICAL: write reactive rules AFTER seeding, since each aide-memory remember
# above triggered regen and overwrote them with the canonical (proactive) body.
cat > .claude/rules/aide-memory.md <<'EOF'
# aide-memory

Reactive guidance — respond to hooks, do not proactively call recall/remember.

- When PreToolUse says "N memories for this path. Call aide_recall(...)", call it before reading or editing.
- When UserPromptSubmit flags a correction, call aide_remember to store it.
- When Stop asks "Anything worth persisting?", reflect on this turn's discoveries (subtle patterns, observations) and call aide_remember if real. If nothing, just stop.

Do not call aide_recall or aide_remember unless a hook prompts you. Keep responses short.
EOF

cat > .cursor/rules/aide-memory.mdc <<'EOF'
---
description: aide-memory reactive rules
alwaysApply: true
---

# aide-memory

Reactive guidance — respond to hooks, do not proactively call recall/remember.

- When PreToolUse says "N memories for this path. Call aide_recall(...)", call it before reading or editing.
- When UserPromptSubmit flags a correction, call aide_remember to store it.
- When Stop asks "Anything worth persisting?", reflect on this turn's discoveries and call aide_remember if real. If nothing, just stop.

Keep responses short.
EOF

git add -A && git commit -q -m "wire aide-memory + reactive rules + seeded conventions"

echo ""
echo "Demo fixture ready at $DEMO."
echo ""
echo "Open a Claude Code session in that directory and type the 5 prompts in order:"
echo "  1) Add a last-login field to the user endpoint"
echo "  2) no, lastLogin is sensitive — only return it when the requester is admin or it's the user themselves"
echo "  3) Wire DataView to show last-login below the name"
echo "  4) Show a small loading indicator just on the last-login row while it's fetching, and if the fetch fails silently hide last-login"
echo "  5) looks good"
echo ""
echo "If you mess up a take, re-run this script to reset."
