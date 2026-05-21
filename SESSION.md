# Session: Issue #77 Reuse Notion Tab From Territory Map

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/77

## Scope
- Change the territory focused-card "N" shortcut so it opens Notion in a named app tab instead of `_blank`.
- Preserve the existing Notion destination URL generated from the selected store's Notion page ID.
- Add a focused regression test for the tab target and opener-clearing behavior.

## Out Of Scope
- No Notion workspace writes or Notion API mutation.
- No schema migration, auth change, production data write, or Vercel config change.
- No redesign of the account detail sheet or unrelated Notion archive links.
- No change to Google Maps routing behavior.

## Constraints
- This is a fast-lane surgical frontend behavior fix.
- Keep Notion behind the existing URL handoff; do not add any external-system writes.
- Keep the change surgical and revertable.
- Open PR #76 was checked; it currently changes `SESSION.md` and `lib/territory/map-search-suggestions.test.ts`.

## Validation Plan
- RED test first for the Notion CRM tab target helper.
- Then run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before completion.
- Browser verify `/territory` if the local protected route can be loaded.
