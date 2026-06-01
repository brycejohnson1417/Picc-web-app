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
- `npm audit --omit=dev --audit-level=moderate --json` after the patch no longer reports Clerk vulnerabilities, Next middleware/proxy bypass advisories, or critical vulnerabilities.
- The remaining production audit findings are outside this issue: Prisma/effect, lodash/defu/dompurify, and `xlsx`.

## Constraints
- Keep working only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep Google Maps as the only supported map provider.
- Keep the current mobile-first PWA shell.
- Keep Clerk as the auth provider and sign-in Google-only.
- Do not silently bundle unrelated dependency upgrades.

## Validation Plan
- Completed a focused dependency install for:
  - `next@15.5.18`
  - `eslint-config-next@15.5.18`
  - `@next/bundle-analyzer@15.5.18`
  - `@clerk/nextjs@6.39.5`
- Added a narrow npm override for `next`'s nested `postcss` dependency to `8.5.15` because Next `15.5.18` still pins audited `postcss@8.4.31`.
- `npm audit --omit=dev --audit-level=moderate --json`: exits `1` with `0` critical findings and `7` remaining production findings outside this issue.
- `npm run typecheck`: exits `0`.
- `npm run lint`: exits `0`.
- `npm test`: exits `0`; `17` test files and `82` tests passed.
- `npm run build`: exits `0` with Next `15.5.18`.
- Local browser check at `http://127.0.0.1:3010/territory`: status `200`, rendered the PICC territory Google map in demo mode.
- Protected API fail-closed check at `http://127.0.0.1:3011/api/accounts` with `DEMO_MODE=false` and no Clerk keys: returned `503` and `{"error":"Auth environment not configured for production."}`.
