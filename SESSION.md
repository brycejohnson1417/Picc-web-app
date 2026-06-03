# Session: Issue #134 Nabis Exception Workflow

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/134

## Scope
- Build an in-app Nabis exception workflow for Microbar sample additions and order corrections.
- Let the user select a retailer from existing account/Nabis identity data.
- Default to the newest cached Nabis order for the selected retailer and allow manual order selection.
- Let the user add sample SKU lines and discrepancy notes.
- Preview a structured outbound request using existing cached Nabis/order data.
- Keep the workflow fully usable from the browser UI with loading, empty, stale, and error states.

## Out Of Scope
- No production Nabis writes, backfills, schema changes, or live email sends.
- No Nabis sync cadence or import architecture changes.
- No map provider, route planning, auth, RBAC, or unrelated account workflow changes.
- No manual-email-only shortcut or mock/demo-only implementation.

## Owned Paths
- `app/(main)/settings/**`
- `app/api/nabis/**`
- `components/settings/**`
- `lib/server/nabis-exceptions*`
- `lib/server/nabis-exceptions*.test.ts`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82 before starting. It touches `AGENTS.md` and `AI_HANDOFF.md` only, so it does not overlap this slice.
- Marked this issue `parallel:ok`; owned path globs do not overlap active PR #82.

## Current Evidence
- Existing repo has local cached `NabisOrder`, `NabisOrderLine`, and account/Nabis identity tables.
- Settings already has a Nabis sync admin surface; this workflow should use the same operational settings/admin pattern unless code inspection finds a better existing surface.
- User specifically needs Microbar sample additions and order corrections without drafting from scratch.

## Constraints
- Work only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep external Nabis behavior behind server/domain boundaries.
- Read from existing cached local Nabis/order data.
- Keep UI components thin and put request-preview/order-selection logic in tested domain/server modules.
- Follow `DESIGN-SYSTEM.md`: dense, calm, mobile-first, operational UI.

## Validation Plan
- RED test first for newest-order selection and outbound preview composition.
- Browser proof for the workflow: select retailer, select most recent order, add sample SKU, add discrepancy note, preview outbound request.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
