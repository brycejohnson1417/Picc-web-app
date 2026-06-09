# Session: Micro Bar wholesale landing upgrade

## Issue

- GitHub issue: https://github.com/brycejohnson1417/Picc-web-app/issues/151

## Branch

- `codex/microbar-growth-landing`

## Scope

- Upgrade the public `/microbar` landing page on the PICC app.
- Use assets from `/Users/brycejohnson/Downloads/MICRO BAR™`.
- Rework the page for educated dispensary buyers and wholesale conversion.
- Keep CTAs usable directly in the browser.

## Domain Constraint

- Keep `piccnewyork.org/microbar` as the live app route for now.
- Do not change the root `piccnewyork.com` redirect; it should continue going to `piccnewyork.notion.site`.
- Future work may add a path-only redirect from `piccnewyork.com/microbar` to this page, but this session does not mutate DNS or domain routing.

## Out Of Scope

- Authenticated PICC app shell changes.
- Territory, account, calendar, Nabis, Notion, Supabase, Clerk, or production data changes.
- Backend writes, schema migrations, DNS edits, or redirect configuration changes.
- Private PICC operating intelligence in public copy.

## Owned Paths

- `app/microbar/**`
- `public/brand/microbar/**`
- `SESSION.md`

## Active PR Overlap Check

- Checked open PRs #144, #135, and #82.
- No overlapping owned path globs found.

## Validation Plan

- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Use Browser for rendered validation.
- Verify `/microbar` loads publicly, is nonblank, has no framework overlay, has healthy console output, and responds to product/filter/CTA interactions.
- Capture desktop and mobile screenshots.

## TDD Note

This is a static public marketing redesign using existing Next.js patterns and supplied brand assets. A RED unit test is not practical for visual layout; browser validation is the primary behavior proof.
