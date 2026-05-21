# Session: Issue #66 Nabis Scheduled CRM Mirroring

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/66

## Scope
- Enable the scheduled Nabis cron to mirror newly discovered retailers into the Dispensary Master List CRM.
- Make manual dashboard refresh run retailer + order sync with CRM mirroring so new Nabis retailers are added to the app cache and Dispensary Master List.
- Add an explicit admin UI control for manual retailer/all sync CRM mirroring.
- Keep the existing Nabis lease and order sync behavior intact.

## Out Of Scope
- No schema migration.
- No Nabis write API usage.
- No review-required Notion overwrites from the CSV preview.
- No duplicate page archiving.
- No order sync semantic changes.
- No Google Maps fix in this branch; tracked separately in issue #67.

## Constraints
- Approval-lane before merge because scheduled production Notion writes are enabled.
- Do not print secrets or run production cron manually without explicit approval.
- Keep the change surgical and revertable.

## Validation Plan
- RED test first for Nabis sync option selection.
- Focused unit test after implementation.
- Then run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before completion.
