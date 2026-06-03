# Current Session

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/141
PR: https://github.com/brycejohnson1417/Picc-web-app/pull/142
Branch: `codex/141-non-destructive-cleanup`

## Scope

- Non-destructive cleanup of retired Worker/Payroll/Vendor Day dispatch app surfaces.
- Remove phantom native/service/worker/Redis/Directus/Odoo/Lighthouse infra.
- Add `verify`, worktree setup, agent dev DB/port setup, and Playwright smoke coverage.
- Update governance/docs so future agents use `/Users/brycejohnson/Code/PICC-Web-App`.

## Out Of Scope

- No production schema drops.
- No production data writes/backfills.
- No monorepo conversion.
- No removal of territory Vendor Day Status, `/territory` Vendor Day Status filter, account detail status/history, or `loadStoreVendorDaySummary`.

## Validation Plan

- `npm run verify`
- `npm run test:e2e`
- Confirm `/home` has no `/vendor-days` links or retired dispatch cards.
- Confirm `/territory` still exposes Vendor Day Status filtering.
