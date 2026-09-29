# Issue 90: production authentication must fail closed

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/90
Branch: codex/90-production-auth, based on origin/main 28f021f.

Scope: prevent production demo/admin bypass, reject invalid production Clerk configuration consistently at middleware/API boundaries, retain explicit local demo mode.
Out of scope: OAuth permissions, provider replacement, membership changes, production environment edits, schema/data writes, UI redesign.

Owned paths: lib/config/runtime.ts, lib/config/runtime.test.ts, middleware.ts, lib/auth/middleware.test.ts, lib/auth/api-guard.ts, lib/auth/api-guard.test.ts, SESSION.md.
Open PRs checked: 189, 182, 166, 144, 135, 82. No source overlap with focused runtime/API guard changes. SESSION.md is a stale shared handoff on older PRs and is not product source. PR 144 proposes incompatible retired architecture and must not land over this work.

Plan: RED tests for production/test/missing/live keys and explicit demo flags; GREEN shared runtime gate and middleware/API behavior; verify normal authenticated protection and independent cron/webhook boundaries. Run npm run verify and a real-browser production misconfiguration check. Existing baseline: 50 files / 215 tests passed during the same-session audit at 28f021f.

Architecture: retain Clerk and existing server boundaries. No auth provider migration. Approval-lane work: do not merge before explicit approval on the PR.

Validation completed: RED 14 failures / 2 passes in focused auth suite; GREEN 16/16 focused tests. Full npm run verify passed lint, typecheck, 52 test files / 230 tests, Prisma validation, and production build. Local production build with test keys and DEMO_MODE=true returned 503/no-store for territory, home, sign-in, and API routes; installed Playwright verified the browser body. Screenshot is retained in the private audit folder. Current production configuration was read-only checked: live Clerk keys, demo mode disabled. No production environment or auth changes applied.
