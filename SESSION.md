# Session: Issue #85 Territory Boundary Editing

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/85

## Scope
- Restore territory boundary create/update persistence after the `Territory.geometry` column was removed.
- Preserve shared boundary visibility through the existing signed-in territory read API.
- Preserve admin-only mutation access for boundary create/update/delete.
- Add regression coverage for the removed geometry-column path.

## Out Of Scope
- No map provider changes.
- No schema migration, production data backfill, or production write operation.
- No new territory map surface or drawing UX redesign.
- No Clerk/auth provider changes.

## Owned Paths
- `lib/server/territory-boundaries.ts`
- `lib/server/territory-boundaries.test.ts`
- `app/api/territory/boundaries/**`
- `components/mobile/**territory**`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82. It is docs-only project-boundary work and does not overlap this territory slice.

## Constraints
- Keep Google Maps as the only map provider.
- Keep the current mobile-first PWA shell.
- Keep business logic in server modules and UI components thin.
- Keep mutations scoped by `orgId`.

## Validation Plan
- Add a failing Vitest test proving boundary create/update persistence does not reference the removed `geometry` column.
- Run `npm test -- lib/server/territory-boundaries.test.ts`.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Start `npm run dev:local` and browser-check `/territory` with the real territory controls reachable.
