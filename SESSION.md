# Session: Issue #122 Notion Webhook Signature Delivery

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/122

## Scope
- Fix `/api/webhooks/notion` so it validates current Notion webhook event deliveries using `X-Notion-Signature`.
- Keep the initial `verification_token` setup request accepted without requiring a signature.
- Preserve the existing page/comment queue and sync behavior after the envelope is accepted.
- Keep invalid or missing production event signatures rejected before queueing work.

## Out Of Scope
- No Notion dashboard mutation from code.
- No production data writes, replay, backfill, schema migration, or new background jobs.
- No territory sync behavior changes beyond accepting the correct webhook envelope.
- No UI changes.

## Owned Paths
- `app/api/webhooks/notion/route.ts`
- `lib/server/notion-webhook-route.test.ts`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82 before starting. It touches `AGENTS.md` and `AI_HANDOFF.md` only, so it does not overlap this slice.

## Current Evidence
- User received a Notion alert that delivery to `https://piccnewyork.org/api/webhooks/notion` was paused after 8 hours of failed delivery.
- Read-only production curl returns HTTP 401 with `{"error":"Missing Notion webhook signature headers"}`.
- Current route expects Standard Webhooks headers: `webhook-id`, `webhook-signature`, and `webhook-timestamp`.
- Current Notion docs say webhook event deliveries send `X-Notion-Signature`, an HMAC-SHA256 over the raw body using the subscription `verification_token`.

## Constraints
- Work only in `/Users/brycejohnson/Code/PICC-Web-App-issue-122` for this branch.
- Do not touch the dirty unrelated territory files in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep Notion behind the existing server route boundary.
- Do not print secrets or full sensitive production values.

## Validation Plan
- Red first: update route tests to expect Notion `X-Notion-Signature` HMAC behavior.
- Red evidence: `npx vitest run lib/server/notion-webhook-route.test.ts` initially failed because unsigned verification tokens and HMAC-signed Notion events returned HTTP 401.
- `npx vitest run lib/server/notion-webhook-route.test.ts`: exits `0`; 1 file and 5 tests passed.
- `npm run typecheck`: exits `0`.
- `npm run lint`: exits `0`.
- `npm test`: exits `0`; 21 files and 95 tests passed.
- `npm run build`: exits `0`.
- Read-only production endpoint check after deploy; manual Notion Webhooks tab resume remains outside code.
