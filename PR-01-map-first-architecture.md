# PR Request 01 — Map-First CRM Architecture Foundation

## Goal
Shift from dashboard-first to map-first CRM foundation without a rewrite.

## Scope
- Introduce canonical domain models:
  - `Account`
  - `Contact`
  - `Stop`
  - `RoutePlan`
- Add adapter normalization layer:
  - Notion CRM -> canonical models
  - Dispensary contacts -> canonical models
- Add map-optimized API payload contract for mobile rendering.
- Keep existing tabs functional while enabling staged migration.

## Proposed file areas
- `src/domain/*`
- `src/integrations/*` (normalization and contracts)
- `api/integrations/*` (map payload endpoint)
- `src/components/*` (initial map shell scaffolding)

## Acceptance criteria
1. Canonical model contract exists and is used by both data sources.
2. Map payload endpoint returns normalized account/contact records with coordinates.
3. Existing app still builds and legacy tabs remain accessible.
4. New architecture docs added (`docs/architecture-map-first.md`).

## Non-goals
- Full route optimization engine
- Offline sync engine
- Full redesign of all legacy modules in one pass
