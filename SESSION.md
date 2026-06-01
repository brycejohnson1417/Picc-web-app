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

## Constraints
- Work only in `/Users/brycejohnson/Code/PICC-Web-App`.
- Keep the current mobile-first PWA shell and Google Maps implementation.
- Keep the feature fully interactive from the frontend; no backend-only or placeholder export path.
- Keep business/export formatting logic outside the map component where practical.

## Validation Plan
- RED test first for KML generation and hidden overlay filtering.
- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- Browser verification on local `/territory` for export UI, state changes, download readiness, and no runtime overlay.
