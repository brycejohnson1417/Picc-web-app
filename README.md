# PICC-Web-App

Live internal PICC field-sales app for account work, territory mapping, routing, sync health, and sales dashboards.

## Canonical Repo

- Local root: `/Users/brycejohnson/Code/PICC-Web-App`
- GitHub repo: `https://github.com/brycejohnson1417/Picc-web-app.git`
- Production app: `https://piccnewyork.org`
- Main production route: `https://piccnewyork.org/territory`
- Vercel project: `picc-push`

Use this repo as the active product. Do not use older clones under `/Users/brycejohnson/clawd/projects` or `/Users/brycejohnson/Documents/New project`.

## Active Stack

- Next.js 15 App Router + TypeScript strict
- Tailwind CSS v4 + Radix/shadcn-style primitives
- TanStack Table + TanStack Query
- Prisma + PostgreSQL/PostGIS
- Clerk Google-only auth
- Notion-backed territory/account sync
- Nabis cached order/retailer data
- Google Maps as the only supported map provider

## Retired Surfaces

Vendor Day dispatch/scheduling, Worker/Brand Ambassador coordination, Payroll, GHL/Bizly, Directus/Odoo, Redis, native app, and mobile worker stubs are retired. Do not extend or revive them without a new explicit product decision.

Important exception: territory Vendor Day Status remains active as Notion-derived account/store metadata. Keep the `/territory` Vendor Day Status filter, map pin/status modeling, account detail display, and store-detail Vendor Day summary/history.

## Project Structure

```txt
app/
  (main)/
    accounts/
    calendar/
    contacts/
    dashboard/
    home/
    route/
    settings/
    tasks/
    territory/
  api/
components/
  crm/
  dashboard/
  home/
  layout/
  mobile/
  settings/
  territory/
  ui/
lib/
  auth/
  db/
  server/
  territory/
  types/
prisma/
  schema.prisma
  seed.ts
scripts/
```

The root is the Next.js app. This repo is not a monorepo and should not be converted in cleanup work.

## Local Setup

Prerequisites:

- Node.js `20.x` or `22.x`; run `nvm use` from the repo root.
- Docker-compatible runtime for local PostGIS.

Install and run a normal local app:

```bash
npm ci
cp .env.local.example .env.local
npm run db:local:setup
npm run dev:local
```

For parallel agent worktrees:

```bash
npm run worktree:setup
npm run db:agent:setup
npm run dev:agent
```

`worktree:setup` writes an ignored `.env.local` with a unique `PICC_AGENT_DEV_PORT`, `PICC_AGENT_DB_NAME`, and `DATABASE_URL` for that worktree.

## Validation

```bash
npm run verify
npm run test:e2e
```

`npm run verify` runs lint, typecheck, unit tests, Prisma validation, and build.

## Deployment

Vercel should build with:

```bash
npm run build
```

Production schema changes are approval-lane work and require explicit user approval before merge/run. This cleanup wave intentionally drops no Prisma models or production tables.
