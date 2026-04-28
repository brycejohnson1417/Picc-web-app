# piccnewyork.org (Next.js 15)

Account-centric CRM for cannabis dispensary sales, ops, finance, and brand ambassador workflows.

## Canonical AI Entry Point

If this repository is being opened by an AI agent, use these as the source of truth before making changes:

- [`AGENTS.md`](/Users/brycejohnson/Documents/New project/Picc-web-app/AGENTS.md)
- [`AI_HANDOFF.md`](/Users/brycejohnson/Documents/New project/Picc-web-app/AI_HANDOFF.md)

Non-negotiable baseline:

- Use `main` as the canonical branch.
- Treat `https://piccnewyork.org` as the canonical live deployment.
- Treat this as the real live app, not a rebuild project.
- Keep Google Maps as the only supported map provider.
- Do not reintroduce MapLibre, Carto, `MapCanvas`, or layer-mode map code.
- Keep Clerk Google-only sign-in and the current mobile-first PWA shell.

Production URL:
- `https://piccnewyork.org`

## Stack
- Next.js 15 App Router + TypeScript strict
- Tailwind CSS v4 + Radix + shadcn-style primitives
- TanStack Table v8 + TanStack Query v5
- Prisma + PostgreSQL
- Clerk Organizations auth
- Zod + React Hook Form + Sonner + date-fns + Recharts + cmdk + framer-motion

## Canonical Roles (enforced)
- `ADMIN`
- `OPS_TEAM`
- `SALES_REP`
- `FINANCE`
- `BRAND_AMBASSADOR`

No viewer role exists in this app.

## Priority Workflows Included
- Referral tracking (`/workflows/referrals`)
- Penny bundle credit submissions (`/workflows/penny-bundles`)
- Overdue accounts (`/workflows/overdue`)
- Vendor day scheduling (`/workflows/vendor-days`)
- Sample box requests (`/workflows/sample-boxes`)

## Conversations Mode
Conversations are fully persisted in DB but currently run in **mock mode** for outbound sends.
- Inbox and thread behavior are production-style.
- Provider adapters are intentionally disabled for this phase.

## Nabis + Google Sheets Integration Basis
Workbook schema source is:
- `/Users/brycejohnson/Downloads/Nabis Notion Master Sheet.xlsx`

Schema inspection endpoint:
- `GET /api/integrations/sheets/schema`

This maps required tabs first:
- `orders`
- `details`
- `Master Sales Sheet - By Store`
- `Synced Master Sales Sheet`
- `Payment History`
- `Referral Orders (POSO)`
- `Credits`
- `Samples`
- `Missing Stores (New Orders)`
- `Re-Orders`

## Project Structure
```txt
app/
  (main)/
    accounts/
    contacts/
    conversations/
    pipelines/
    tasks/
    calendar/
    reports/
    settings/
    workflows/
  api/
    accounts/
    contacts/
    opportunities/
    tasks/
    appointments/
    activity-log/
    conversations/
    messages/
    workflows/
    integrations/
    sync/
    command/
components/
  crm/
  layout/
  ui/
lib/
  auth/
  db/
  rbac/
  activity-log/
  data/
  integrations/
  types/
  validation/
prisma/
  schema.prisma
  seed.ts
```

## Local Setup
Prerequisite:
- Node.js LTS (`20.x` or `22.x`). Node `25.x` is not supported for this project and can cause Next build/lint hangs.
- Docker and Docker Compose (for local Postgres DB)
- If you use `nvm`, run `nvm use` from the repo root (uses `.nvmrc`).

1. Install deps
```bash
npm ci
```

2. Create env files
For Prisma commands to work correctly locally, environment variables (like `DATABASE_URL`) must be placed in a `.env` file rather than just `.env.local`.
```bash
cp .env.example .env
cp .env.example .env.local
```

3. Configure `.env` and `.env.local`
- Keep `DATABASE_URL` as the default local Docker string: `postgresql://postgres:postgres@localhost:5432/picc_crm?schema=public`
- Set Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- Keep/adjust `NABIS_MASTER_SHEET_PATH`

4. Start local Postgres database using Docker
```bash
npm run db:up
```

5. Generate Prisma client
```bash
npx prisma generate
```

6. Run migrations
```bash
npx prisma migrate dev
```

7. Seed realistic demo data
```bash
npm run prisma:seed
```

*(Note: Steps 4, 6, and 7 can also be run together using `npm run db:setup`)*

8. Start app
```bash
npm run dev
```

## Clerk Setup
1. Create Clerk app and enable Organizations.
2. Add local URL (`http://localhost:3000`) to allowed origins.
3. Configure sign-in/sign-up routing to app defaults.
4. Create users and org membership; role values in DB must be one of:
   - `ADMIN`, `OPS_TEAM`, `SALES_REP`, `FINANCE`, `BRAND_AMBASSADOR`

## API Contract Surface
- `/api/accounts`
- `/api/contacts`
- `/api/opportunities`
- `/api/tasks`
- `/api/appointments`
- `/api/activity-log`
- `/api/workflows/referrals`
- `/api/workflows/penny-bundle-submissions`
- `/api/workflows/overdue`
- `/api/workflows/vendor-days`
- `/api/workflows/sample-box-requests`
- `/api/workflows/edit-suggestions`
- `/api/conversations`
- `/api/messages`
- `/api/integrations/notion/sync-team-directory`
- `/api/integrations/sheets/schema`
- `/api/sync/run`
- `/api/sync/status`
- `/api/command/search`

All mutating endpoints are guarded by org scope + RBAC and write to `ActivityLog` for account-level timeline integrity.

## Deployment (Vercel)
1. Push repo to GitHub (`bryce-picc/Picc-web-app`).
2. Import project in Vercel.
3. Set all environment variables from `.env.example`.
4. Add Postgres connection string (`DATABASE_URL`).
5. Run deploy.
6. Run production migrations:
```bash
npx prisma migrate deploy
```

## Notes
- Current active app is under `app/` + `components/` + `lib/` + `prisma/`.
- The canonical deployment is `piccnewyork.org`; do not point repo metadata or docs at older Vercel projects.
- Google Maps is the active territory map provider for the live app.
- On macOS, if `/Users/.../Downloads/...xlsx` returns `EPERM`, grant the terminal/Codex app Files access or move the workbook to a permitted directory and update `NABIS_MASTER_SHEET_PATH`.
