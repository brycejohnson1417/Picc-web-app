# Session: Issue #136 PPP Savings Stale Cache

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/136

## Scope
- Fix the PPP savings calculator so current-year calculations include newer live Nabis orders when older cached order lines already exist.
- Keep cached order lines as the preferred source for already-cached orders.
- De-dupe overlapping cached and live order rows by order identity.

## Out Of Scope
- No production data writes or backfills.
- No schema migration.
- No Nabis sync cadence or lease changes.
- No pricing-table changes.
- No customer-specific details in public GitHub surfaces.

## Owned Paths
- `lib/server/preferred-partner-savings.ts`
- `lib/server/preferred-partner-savings*.test.ts`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #135 before starting. It owns Nabis exception workflow paths and does not overlap this slice.
- Checked open PR #82 before starting. It is docs-only project-boundary work and does not overlap this slice.

## Current Evidence
- The calculator currently uses cached rows for a year whenever any cached rows exist.
- That cache-first branch prevents the current-year calculation from checking live Nabis for newer orders that have not been synced yet.

## Constraints
- Work only in `/Users/brycejohnson/Code/PICC-Web-App` via the issue branch worktree.
- Keep Nabis access behind server modules.
- Keep the existing account detail PPP savings panel as the user-facing UI.

## Validation Plan
- RED test: current-year cached rows do not suppress newer live Nabis order rows.
- Targeted Vitest for PPP savings source selection and existing savings math.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Browser proof for the existing account detail PPP savings panel after the server fix.
