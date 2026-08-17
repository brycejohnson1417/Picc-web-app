# Session: Gmail Schema Availability Fix

## Linked work

- GitHub issue: https://github.com/brycejohnson1417/Picc-web-app/issues/181
- Branch: `codex/181-gmail-schema-error`
- Production evidence: the signed-in Contacts page exposes a Prisma missing-table error for `public.GmailConnection` after clicking **Find contacts**.

## Scope

- Trace the Gmail lookup from Contacts through its server boundary and migration history.
- Add a focused regression test that proves database internals cannot leak through the Gmail suggestions API.
- Return a stable, actionable integration-unavailable state when the schema is not ready.
- Identify the exact pending production migration action required to restore Gmail lookup.

## Out of scope

- Gmail message sending or wider mailbox permissions.
- OAuth consent-screen, auth/RLS, or tenant access-control changes.
- Unrelated Prisma migrations, data backfills, or schema cleanup.
- Changes to `/Users/brycejohnson/Code/map-app`.

## Constraints and architecture check

- Keep Prisma access behind the existing Gmail server boundary.
- Preserve the current read-only Gmail integration and the Settings-based connection flow.
- Production schema changes are approval-lane work and cannot be run or merged without Bryce's explicit approval.
- Owned paths: `lib/server/gmail-connection.ts`, focused Gmail route tests, migration/deployment configuration only if evidence requires it, and `SESSION.md`.
- Open PRs checked: #166, #144, #135, and #82. None owns the Gmail integration or Prisma migration paths.

## Validation plan

- RED: reproduce the raw Prisma missing-table error leaking from the Gmail suggestions route.
- GREEN: map unavailable-schema failures to a stable user-safe response while retaining actionable Settings guidance.
- Run focused unit tests, then `npm run verify`.
- Run the targeted signed-in Contacts and Settings browser flow.
- After separately approved production migration/deployment work, verify the live route no longer reports a missing table.

## Current state

- Root-cause evidence: the Gmail migration exists at `prisma/migrations/202608141300_add_gmail_connections/migration.sql`, while the Vercel build command is only `npm run build`; the production browser reports the table absent.
- RED confirmed: route coverage reproduced raw missing-table leakage; browser coverage reproduced the Settings card's endless loading state.
- GREEN confirmed: Gmail status/suggestions return a stable 503 without Prisma details, and Settings renders a retryable setup state that recovers to the real connection control.
- `npm run verify`: passed lint, typecheck, 48 Vitest files / 207 tests, Prisma validation, and production build.
- Targeted Gmail browser flow: passed at 390x844 with error and recovered screenshots under `.agents/issue-181/`.
- Full `npm run test:e2e`: 34 passed / 3 unrelated failures (`/home` timeout, Google Map unavailable in the Safari-shell test, subway reload timeout). Serial rerun passed `/home` and subway; the Google Map availability assertion remained failed and is outside this PR's owned paths.
- No production schema changes have been run.
