# Current Session

- Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/43
- Add an intentional historical Nabis backfill path from `2025-01-01`.
- Reuse the existing Nabis sync lease, rate-limit backoff, sync run, and checkpoint architecture.
- Populate cached `NabisOrder` and `NabisOrderLine` rows through the same parser/upsert path as normal order sync.
- Surface backfill readiness/progress metadata through the existing admin sync status/control UI.

# Out Of Scope

- Do not rebuild the historical dashboard in this PR; that remains issue #45.
- Do not change schemas unless the existing checkpoint/run metadata model is insufficient.
- Do not mirror Nabis retailers into Notion CRM from this backfill.
- Do not run production writes until the PR is merged, CI is green, and the approved production backfill command/path is used.

# Constraints

- Branch: `codex/43-historical-nabis-backfill`.
- Owned path globs: `lib/server/nabis-sync.ts`, `lib/server/nabis-sync.test.ts`, `lib/server/nabis-sync-status.ts`, `app/api/sync/run/route.ts`, `components/settings/nabis-sync-admin-panel.tsx`, `SESSION.md`.
- Open PR overlap check: `gh pr list` returned no open Picc-web-app PRs at claim time.
- Required named test coverage: `lease-refusal`, `stale-recovery`, `429-backoff`, and `batch-cutoff`.
- Production data writes/backfill execution are approval-lane; the user has pre-approved the historical data backfill only after safeguards are merged and verified.

# Test Plan

- RED first: add a `batch-cutoff` unit test for historical cutoff handling before implementation.
- Run `npm test`.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm run build`.
