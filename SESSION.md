# Session: Issue #88 Lock Down Cron Sync Routes

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/88

## Scope
- Make cron route authorization fail closed in production when `CRON_SECRET` is missing.
- Require `Authorization: Bearer <CRON_SECRET>` when a cron secret is configured.
- Keep local/development `x-vercel-cron` behavior available when `CRON_SECRET` is not configured.
- Reuse shared authorization logic between `notion-sync` and `nabis-sync`.
- Add focused regression coverage for production and local cron authorization behavior.

## Out Of Scope
- No changes to what the Notion or Nabis sync jobs do.
- No production sync runs.
- No production data writes.
- No schema migration or backfill.
- No unrelated auth, middleware, or dependency changes.

## Owned Paths
- `app/api/cron/notion-sync/route.ts`
- `app/api/cron/nabis-sync/route.ts`
- `lib/server/cron-auth.ts`
- `lib/server/cron-auth.test.ts`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82. It is docs-only project-boundary work and does not overlap these cron route paths.
- Checked open PR #115. It is dependency-manifest work for issue #106 and does not overlap these cron route paths.
- Checked merged PR #117. It is Notion webhook authorization work and does not overlap these cron route paths.

## Current Evidence
- `app/api/cron/notion-sync/route.ts` and `app/api/cron/nabis-sync/route.ts` each define duplicated `isAuthorized` logic.
- Both routes currently accept any request containing `x-vercel-cron` when `CRON_SECRET` is not configured.
- Headers are client-controlled, so production must not trust `x-vercel-cron` as the only authorization signal.
- Red test evidence: `npx vitest run lib/server/cron-auth.test.ts` failed before implementation because `@/lib/server/cron-auth` did not exist.

## Constraints
- Keep working only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep cron changes surgical and isolated to route authorization.
- Keep sync job behavior untouched after authorization succeeds.
- Keep docs updated as implementation and validation evidence changes.

## Validation Plan
- Added Vitest coverage for the shared cron authorization helper:
  - production without `CRON_SECRET` rejects `x-vercel-cron`.
  - production with `CRON_SECRET` rejects missing or wrong bearer token.
  - production with `CRON_SECRET` accepts the exact bearer token.
  - development without `CRON_SECRET` still accepts `x-vercel-cron`.
- `npx vitest run lib/server/cron-auth.test.ts`: exits `0`; `4` tests passed.
- `npm run typecheck`: exits `0`.
- `npm run lint`: exits `0`.
- `npm test`: exits `0`; `18` test files and `86` tests passed.
- `npm run build`: exits `0`.
