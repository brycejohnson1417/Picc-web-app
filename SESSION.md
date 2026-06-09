# Session: Microbar NY landing page

## Issue

- GitHub issue: https://github.com/brycejohnson1417/Picc-web-app/issues/149

## Branch

- `codex/microbar-landing`

## Scope

- Add a public `/microbar` landing page for Microbar now distributed by PICC in NY.
- Use supplied Microbar PDF graphics as real static assets.
- Surface browser-usable retailer CTAs.
- Keep implementation additive and public-safe.

## Out Of Scope

- Authenticated PICC app shell changes.
- Territory, account, calendar, Nabis, Notion, Supabase, Clerk, or production data changes.
- Backend writes, schema migrations, or private PICC operating intelligence.

## Owned Paths

- `app/microbar/**`
- `public/brand/microbar/**`
- `SESSION.md`

## Active PR Overlap Check

- Checked open PRs #144, #135, and #82.
- No overlapping owned path globs found.

## Validation Plan

- Use static checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- Use the Browser plugin first for rendered validation.
- Verify `/microbar` loads publicly, is nonblank, has no framework overlay, has healthy console output, and responds to CTAs.
- Capture desktop and mobile screenshots.

## TDD Note

This is a static public marketing route using existing Next.js patterns and real supplied assets. A RED unit test is not practical for the visual layout; browser validation is the primary behavior proof.
