# Session: Issue #71 Nabis Dashboard Background Sync

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/71

## Scope
- Make Nabis dashboard manual refresh start the retailer + order sync in the background instead of blocking the browser response.
- Return saved local Postgres dashboard data immediately after the user clicks manual refresh.
- Show a clear dashboard status that the sync was started in the background.
- Preserve the create-only CRM mirroring rule: match existing CRM pages by `Licensed Location ID`, link local accounts to existing pages, and do not patch existing CRM properties.
- Keep daily cron behavior protected and unchanged.

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
- RED test first for dashboard refresh metadata where practical.
- Focused unit/unit-route test after implementation if the existing harness supports it.
- Then run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before completion.
