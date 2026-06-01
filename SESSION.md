# Session: Issue #106 Patch Next and Clerk Vulnerabilities

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/106

## Scope
- Patch vulnerable production dependency versions for `next` and `@clerk/nextjs`.
- Keep supporting Next packages on the matching safe `15.x` line.
- Preserve the current Next 15 app architecture and Clerk Google-only auth model.
- Add or run focused protected-route/auth verification after the dependency update.
- Document the remaining audit surface after the direct production vulnerabilities are patched.

## Out Of Scope
- No Next 16 migration.
- No Clerk 7 migration.
- No auth provider changes.
- No production data writes.
- No schema migration or backfill.
- No UI redesign or route behavior changes beyond dependency compatibility fixes.

## Owned Paths
- `package.json`
- `package-lock.json`
- `SESSION.md`
- Auth or middleware regression test files only if dependency compatibility requires coverage changes.

## Open PR Overlap Check
- Checked open PR #82. It is docs-only project-boundary work and does not overlap this dependency patch.

## Current Evidence
- `npm audit --json` reports direct production vulnerabilities in `@clerk/nextjs` and `next`.
- Issue #106 says the safe compatible Next patch target is `15.5.18`.
- `npm view next@15 version`, `npm view @next/bundle-analyzer@15 version`, and `npm view eslint-config-next@15 version` confirm `15.5.18` exists on the Next 15 line.
- `npm view @clerk/nextjs@6 version` confirms patched Clerk 6 releases exist after the vulnerable `<=6.39.2` range.

## Constraints
- Keep working only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep Google Maps as the only supported map provider.
- Keep the current mobile-first PWA shell.
- Keep Clerk as the auth provider and sign-in Google-only.
- Do not silently bundle unrelated dependency upgrades.

## Validation Plan
- Run a focused dependency install for:
  - `next@15.5.18`
  - `eslint-config-next@15.5.18`
  - `@next/bundle-analyzer@15.5.18`
  - `@clerk/nextjs@6.39.5`
- Rerun `npm audit --omit=dev --audit-level=moderate`.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Run a protected-route check against the local app after build/dev startup if the dependency update passes static validation.
