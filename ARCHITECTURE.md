# PICC Enterprise Architecture

## Topology
- `web` (Next.js): CRM web app, territory map, account/contact workflows.
- `native` (Expo): mobile shell and field execution client.
- `postgres+postgis`: primary transactional + geospatial store.
- `redis`: queue and caching substrate.
- `directus`: operational data portal and analytics-facing API.
- `odoo`: ERP/workflow integration boundary.
- `workers`: async jobs (territory rebalance, sync, maintenance).

## Repository Layout
- `app/`, `components/`, `lib/`, `prisma/`: active Next.js app surface.
- `apps/native`: Expo app.
- `services/directus-sync`: Directus sync adapters.
- `services/odoo-sync`: Odoo sync adapters.
- `services/routing`: reserved for routing/optimization services (deferred).
- `workers/territory-rebalance`: async workload skeleton.

## Data Plan
- Notion remains upstream source for CRM base records.
- PostGIS read-model is primary query source for map and territory APIs.
- Directus/Odoo consume normalized tables with explicit mapping IDs.

## Observability
- Sentry web/native DSN support.
- Structured logs via `lib/observability/logger.ts`.
- Correlation IDs propagated in API handlers and worker jobs.

## Rollout
1. Foundation rails and CI.
2. Geospatial model and API cutover.
3. Map UX cutover to MapLibre.
4. Native + integration tracks.
