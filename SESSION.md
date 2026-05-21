# Session: Issue #75 Territory Map Search Suggestions

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/75

## Scope
- Make territory map search show selectable store matches while the user types.
- Stop auto-focusing the first matching store from search text alone.
- Let explicit suggestion clicks focus/highlight the selected store and open the selected-account card.
- Preserve the current Google Maps provider, route controls, filter sheet, and mobile-first shell.

## Out Of Scope
- No schema migration.
- No Notion writes or production data mutation.
- No auth, Clerk, Vercel, or provider changes.
- No map provider rewrite.
- No Nabis dashboard/server sync changes; open PR #74 owns that area.

## Constraints
- This is production triage: keep it surgical and revertable.
- Keep all requested behavior usable directly from the browser UI.
- Owned path globs: `components/mobile/territory-*`, `lib/territory/map-search-*`, `lib/territory/*.test.ts`, `SESSION.md`.
- Open PR overlap checked: PR #74 touches Nabis dashboard/server sync files only; no expected path overlap.
- Keep the change surgical and revertable.

## Validation Plan
- RED test first for search suggestion ranking/selection behavior in a focused territory helper.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Start the local app and verify `/territory` in a browser with the map search flow.
