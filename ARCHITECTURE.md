# PICC-Web-App Architecture

## Active Topology

- `web`: the root Next.js app under `app/`, `components/`, and `lib/`.
- `postgres+postgis`: primary transactional and geospatial store.
- `notion`: upstream territory/account source and retained Vendor Day Status/history source.
- `nabis`: cached retailer/order source for account and sales intelligence.
- `google maps`: the only supported map provider.
- `vercel`: production hosting and cron execution.

## Non-Goals

This repo is not a monorepo. There is no active native app, Redis queue, Directus service, Odoo service, or mobile sync worker.

Vendor Day dispatch/scheduling, Worker/Brand Ambassador coordination, and Payroll are retired app surfaces. Their Prisma tables remain dormant until a later approval-lane migration removes the full retired cluster together.

## Boundaries

- UI components stay thin and call route/server modules.
- External systems stay behind explicit modules in `lib/server` or `lib/auth`.
- Territory Vendor Day Status is retained as Notion-derived account/store metadata.
- Retired dispatch/payroll code must not be reintroduced through routes, cron calls, or settings panels.

## Validation Baseline

- `npm run verify`
- `npm run test:e2e` when browser surfaces changed
- `npx prisma validate` before any schema-adjacent work
