# Session: Issue #120 Territory Export CSV Mode

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/120

## Scope
- Move the `/territory` export control from the right-hand map controls to the left-hand control rail.
- Keep the existing Google My Maps KML export workflow available from the export sheet.
- Add an account CSV export mode for the accounts currently shown by the selected map scope.
- Add visible CSV column toggles so the downloaded headers and row fields are configurable directly from the UI.
- Add focused coverage for CSV escaping, selected-column order, and omitted disabled columns.

## Out Of Scope
- No Google OAuth write/import automation.
- No production data writes, schema changes, backfills, or new background jobs.
- No all-account detail fanout fetches; CSV uses fields already loaded for the current territory map/list view.
- No map provider change and no reintroduction of MapLibre, Carto, Leaflet, `MapCanvas`, heatmap, hex, or `/api/territory/layers`.
- No unrelated territory refactors.

## Owned Paths
- `components/mobile/territory*.tsx`
- `components/territory/google-territory-map.tsx`
- `components/territory/*export*.tsx`
- `lib/territory/*export*.ts`
- `lib/territory/*export*.test.ts`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82 before starting. It touches `AGENTS.md` and `AI_HANDOFF.md` only, so it does not overlap this slice.

## Current Evidence
- Existing issue #118 / PR #119 shipped KML generation and the export sheet from the territory map.
- `README.md`, `AI_HANDOFF.md`, and `AGENTS.md` keep Google Maps as the active and only supported territory map provider.
- `components/mobile/territory-map-overlay-controls.tsx` owns the left/right overlay control placement.
- `components/mobile/territory-my-maps-export-sheet.tsx` owns the current export sheet UI and KML download action.
- `lib/territory/google-my-maps-export.ts` owns current viewport/filtered export selection and KML generation.
- Red test evidence: `npx vitest run lib/territory/account-csv-export.test.ts` initially failed because `@/lib/territory/account-csv-export` did not exist.
- Browser evidence: the Codex in-app Browser loaded stale territory controls from its cache and did not expose the new export button; after recording that blocker, a fresh Playwright context verified local `/territory`.
- Fresh Playwright evidence: export button rendered on the left control rail at `x=8`; CSV mode exported `picc-territory-accounts-202606010414.csv` with 733 account rows; unchecking `Status` and checking `Latitude`/`Longitude` changed the CSV header; KML still exported `picc-territory-view-202606010414.kml` with the Accounts folder.
- Screenshot evidence saved outside the repo: `/tmp/picc-export-left-control.png`, `/tmp/picc-export-kml-mode.png`, `/tmp/picc-export-csv-mode-top.png`, `/tmp/picc-export-csv-mode.png`.

## Constraints
- Work only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep the current mobile-first PWA shell and Google Maps implementation.
- Keep the feature fully interactive from the frontend; no backend-only or placeholder CSV path.
- Keep export formatting logic outside map rendering components where practical.

## Validation Plan
- Red first: add focused failing tests for configurable account CSV output.
- `npx vitest run lib/territory/account-csv-export.test.ts lib/territory/google-my-maps-export.test.ts`: exits `0`; 2 files and 4 tests passed.
- `npm run typecheck`: exits `0`.
- `npm run lint`: exits `0`.
- `npm test`: exits `0`; 21 files and 94 tests passed.
- `npm run build`: exits `0`.
- Browser verification on local `/territory`: passed in a fresh Playwright context at 390x844; left-side export control visible, export sheet mode switching works, CSV field toggles affect downloaded CSV contents, and existing KML path still downloads.
