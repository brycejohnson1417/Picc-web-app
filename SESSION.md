# Session: Issue #118 Google My Maps Export

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/118

## Scope
- Add a polished `/territory` UI action for exporting the current filtered map view.
- Generate a Google My Maps-friendly KML file from the current pins, visible territory boundaries, and visible home markers.
- Include configurable export contents, clear download/import guidance, and empty-state feedback directly in the browser UI.
- Add focused test coverage for KML generation, escaping, and hidden overlay filtering.

## Out Of Scope
- No OAuth write/import into a user's Google account.
- No production data writes, schema changes, backfills, or new background jobs.
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
- `README.md` and `AI_HANDOFF.md` confirm Google Maps is the active and only supported territory map provider.
- `ARCHITECTURE.md` keeps the active app surface under `app/`, `components/`, `lib/`, and `prisma/`.
- `components/mobile/territory-map-mobile.tsx` passes current pins, boundaries, markers, hidden overlay IDs, and map state into `GoogleTerritoryMap`.
- `components/territory/google-territory-map.tsx` renders the active Google map surface.
- Red test evidence: `npx vitest run lib/territory/google-my-maps-export.test.ts` initially failed because `@/lib/territory/google-my-maps-export` did not exist.
- Browser evidence: a fresh Playwright context opened local `/territory`, found the export control, opened the sheet, switched to filtered results, downloaded `picc-territory-view-202606010355.kml`, and confirmed the KML has Accounts, Territories, and Home markers folders.
- Local data note: the seeded/current local view had 733 exportable pins and 0 visible territory/home overlays at verification time.
- In-app Browser note: the Codex in-app browser kept serving stale territory controls after restart and hard reload, so rendered proof used the bundled fresh Playwright browser context after recording that cache issue.

## Constraints
- Work only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep the current mobile-first PWA shell and Google Maps implementation.
- Keep the feature fully interactive from the frontend; no backend-only or placeholder export path.
- Keep business/export formatting logic outside the map component where practical.

## Validation Plan
- `npx vitest run lib/territory/google-my-maps-export.test.ts`: exits `0`; 2 tests passed.
- `npm run typecheck`: exits `0`.
- `npm run lint`: exits `0`.
- `npm test`: exits `0`; 20 test files and 92 tests passed.
- `npm run build`: exits `0`.
- Browser verification on local `/territory`: passed in a fresh Playwright context at 390x844; export button visible, sheet interactive, filtered-result scope selectable, KML download emitted, downloaded file parsed for expected folders, and no relevant console errors beyond the existing Google `Marker` deprecation warning.
