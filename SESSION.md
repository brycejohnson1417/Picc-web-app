# Session: Issue #130 Bottom Nav Sheet Overlap

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/130

## Scope
- Fix the mobile account detail sheet so its bottom actions stay visible and tappable above the primary footer navigation.
- Apply the bottom-safe layout contract to adjacent mobile bottom surfaces where the same collision can occur.
- Preserve the existing mobile-first PWA shell and account detail behavior.

## Out Of Scope
- No check-in persistence or backend behavior changes.
- No map provider, route planning, auth, RBAC, schema, or external integration changes.
- No production data writes.
- No broad redesign beyond the footer collision fix.

## Owned Paths
- `components/mobile/account-detail-sheet.tsx`
- `components/mobile/route-mobile.tsx`
- `components/mobile/territory-focused-card.tsx`
- `components/layout/app-shell.tsx`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82 before starting. It touches `AGENTS.md` and `AI_HANDOFF.md` only, so it does not overlap this slice.

## Current Evidence
- User screenshot shows account detail actions such as Check-in hidden behind the primary bottom navigation on the territory map.
- `components/mobile/account-detail-sheet.tsx` renders a sheet action bar at the bottom while the global shell footer remains fixed at the bottom.
- `DESIGN-SYSTEM.md` states bottom navigation consumes the lower safe area and fixed action bars must sit above it.

## Constraints
- Work only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep the change surgical and frontend-only.
- Keep Google Maps as the only territory map provider.
- Use browser-visible validation for the territory account-detail flow.

## Validation Plan
- Red proof: reproduce the overlap through the running frontend with screenshot or DOM geometry before the layout fix when possible.
- Green proof: verify account detail actions render above the primary footer and remain clickable.
- Check at least one adjacent bottom surface for the same collision class.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
