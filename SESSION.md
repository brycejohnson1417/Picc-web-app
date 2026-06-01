# Session: Issue #89 Signed Notion Webhooks

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/89

## Scope
- Make production Notion webhook handling fail closed when `NOTION_WEBHOOK_SECRET` is missing.
- Require signature headers and valid `standardwebhooks` verification in production.
- Ensure invalid signatures return `401` without queuing or syncing work.
- Stop logging raw Notion verification token values.
- Preserve local/development setup usability.
- Add focused route-level tests for webhook authorization and verification-token handling.

## Out Of Scope
- No redesign of the Notion sync queue.
- No changes to supported Notion event types unless needed for safety.
- No production webhook calls.
- No production data writes.
- No schema migration or backfill.
- No unrelated auth, middleware, or dependency changes.

## Owned Paths
- `app/api/webhooks/notion/route.ts`
- `lib/server/notion-webhook-route.test.ts`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82. It is docs-only project-boundary work and does not overlap this webhook route.
- Checked open PR #116. It is cron route authorization work and does not overlap this webhook route.

## Current Evidence
- `app/api/webhooks/notion/route.ts` handles `verification_token` before signature enforcement.
- The endpoint logs the raw verification token value.
- The endpoint only verifies signatures when both `NOTION_WEBHOOK_SECRET` and all signature headers are present.
- If the secret is missing, production can accept page/comment events and queue sync work.
- Red test evidence: `npx vitest run lib/server/notion-webhook-route.test.ts` failed before implementation with `3` failing tests:
  - production missing secret returned `200` instead of `401`.
  - production missing signature headers returned `200` instead of `401`.
  - raw verification token appeared in `console.info` calls.

## Constraints
- Keep working only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep webhook changes surgical and isolated to request authorization/token handling.
- Keep sync queue and mirror behavior untouched after authorization succeeds.
- Keep docs updated as implementation and validation evidence changes.

## Validation Plan
- Added Vitest route coverage:
  - production without `NOTION_WEBHOOK_SECRET` rejects signed or unsigned webhooks before queueing work.
  - production with `NOTION_WEBHOOK_SECRET` rejects missing signature headers before queueing work.
  - invalid signatures return `401` before queueing work.
  - valid signed verification-token handling returns `200` without logging the raw token.
- `npx vitest run lib/server/notion-webhook-route.test.ts`: exits `0`; `4` tests passed.
- `npm run typecheck`: exits `0`.
- `npm run lint`: exits `0`.
- `npm test`: exits `0`; `18` test files and `86` tests passed.
- `npm run build`: exits `0`.
