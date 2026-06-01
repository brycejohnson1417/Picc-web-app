# Session: Issue #83 Remove Notion Auth Gate

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/83

## Scope
- Remove the PICC Notion workspace membership check from app access.
- Preserve the existing `@piccplatform.com` company email and allowlist gates.
- Preserve active guest invite and operational invite access.
- Update sign-in UI copy so it no longer tells team members they need a PICC Notion workspace account.

## Out Of Scope
- No Clerk provider changes.
- No Google-only sign-in changes.
- No Notion CRM/archive integration changes.
- No env/secrets, schema changes, production data writes, or production verification claims.

## Owned Paths
- `lib/auth/access-policy.ts`
- `lib/auth/access-policy.test.ts`
- `components/auth/google-only-sign-in-card.tsx`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82. It owns docs only (`AGENTS.md`, `AI_HANDOFF.md`) and does not overlap this auth slice.

## Constraints
- Keep Clerk Google-only sign-in.
- Keep access restricted to allowed `@piccplatform.com` users or active invites.
- Keep Notion integrations behind server modules for CRM/archive workflows, not app access.

## Validation Plan
- Update auth policy tests first to prove allowed company emails no longer require Notion verification.
- Run `npm test -- lib/auth/access-policy.test.ts`.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Browser-check `/sign-in` copy when local Clerk configuration can render the sign-in card.
