# Session: Issue #73 Nabis Dashboard Active Sync Status

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/73

## Scope
- Show an active/running Nabis sync status on the dashboard when the global Nabis sync lease is active.
- Suppress stale-order warnings while a background Nabis sync is actively running.
- Keep the manual refresh "started in background" status visible when the user starts the sync.

## Out Of Scope
- No schema migration.
- No Nabis write API usage.
- No production data backfill.
- No manual production cron execution.
- No change to order parsing, retailer matching, or Notion property mapping.
- No Google Maps fix in this branch; tracked separately in issue #67.

## Constraints
- This is a fast-lane surgical UX/runtime fix; it does not add a new production write surface beyond the already-approved sync path.
- Do not print secrets or run production cron manually.
- Keep the change surgical and revertable.

## Validation Plan
- RED test first for active-sync dashboard status behavior.
- Then run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before completion.
