# Session: issue #210

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/210

Scope: isolated read-only distributor integration; secure browser connection and reconciliation; source-specific reporting; bounded sync and focused tests. Existing Nabis history remains intact.
Out of scope: distributor writes, production schema/data/secrets changes, unrelated account sheet work, historical replacement.
Architecture: current Next.js/Clerk/Prisma integration patterns, dedicated provider and source cache. Admin mutations and workspace-scoped reads. DESIGN-SYSTEM.md applies.
Validation: RED tests for identity, transport, financial math and sync boundaries; repo verify and E2E; actual browser inspection. Live verification requires credentials and authenticated app access.
Concurrency: checked open PRs #189, #135, #82. Avoid account-detail sheet overlap. Owned paths described in issue #210. Shared schema work is exclusive.
