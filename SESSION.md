# Session: Micro Bar buyer-facing copy and CTA correction

## Issue

- GitHub issue: https://github.com/brycejohnson1417/Picc-web-app/issues/153

## Branch

- `codex/microbar-buyer-copy`

## Scope

- Revise `/microbar` copy for educated New York dispensary buyers.
- Replace invented product one-liners with real Micro Bar product descriptions from supplied brand/menu materials.
- Remove on-page ordering language and keep buyer CTAs focused on:
  - live Micro Bar Nabis marketplace profile
  - direct Bryce email contact
- Preserve the current visual direction and Micro Bar brand assets.

## Domain Constraint

- Keep `piccnewyork.org/microbar` as the live app route for now.
- Do not change the root `piccnewyork.com` redirect; it should continue going to `piccnewyork.notion.site`.
- Future work may add a path-only redirect from `piccnewyork.com/microbar` to this page, but this session does not mutate DNS or domain routing.

## Out Of Scope

- On-page cart, checkout, order builder, or marketplace ordering flow.
- Authenticated PICC app shell changes.
- Territory, account, calendar, Nabis, Notion, Supabase, Clerk, or production data changes.
- Backend writes, schema migrations, DNS edits, or redirect configuration changes.
- Private PICC operating intelligence in public copy.

## Owned Paths

- `app/microbar/**`
- `SESSION.md`

## Active PR Overlap Check

- Checked open PRs #144, #135, and #82.
- No overlapping owned path globs found.

## Validation Plan

- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Use Browser for rendered validation.
- Verify `/microbar` loads publicly, is nonblank, has no framework overlay, and responds to product/filter/CTA interactions.
- Capture desktop and mobile screenshots.

## TDD Note

This is a static public marketing-copy and CTA correction using existing Next.js patterns and supplied product descriptions. A RED unit test is not practical for visual copy/layout; browser validation is the primary behavior proof.
