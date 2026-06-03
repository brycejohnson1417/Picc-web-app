# Session: Issue #132 Tighten Footer Clearance

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/132

## Scope
- Tighten the account detail action bar spacing above the primary footer.
- Keep the action bar and check-in/contact sheets above the footer with only a small visual gap.
- Preserve the shared bottom-safe spacing contract added for issue #130.

## Out Of Scope
- No check-in persistence or backend behavior changes.
- No map provider, route planning, auth, RBAC, schema, or external integration changes.
- No production data writes.
- No broad redesign.

## Owned Paths
- `app/globals.css`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82 before starting. It touches `AGENTS.md` and `AI_HANDOFF.md` only, so it does not overlap this slice.

## Current Evidence
- User screenshot shows the account detail action bar is no longer hidden, but the bar floats too high above the primary footer on the desktop-width shell.
- Issue #130 browser proof showed a 24px gap above the footer; this follow-up should reduce that to a tighter intentional gap while preserving no-overlap.

## Constraints
- Work only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep the change surgical and frontend-only.
- Use browser geometry proof for the territory account-detail flow.

## Validation Plan
- Browser proof: `/territory -> List -> account -> Account Details -> Check-in`.
- Verify action bar and check-in modal do not overlap footer and have a tighter gap.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
