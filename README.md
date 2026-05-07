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
- If you use `nvm`, run `nvm use` from the repo root (uses `.nvmrc`).
- Docker-compatible runtime. On macOS, OrbStack is the recommended lightweight option.

1. Install deps
```bash
npm ci
```

2. Create env file
```bash
cp .env.local.example .env.local
```

3. Start and seed the local database
```bash
npm run db:local:setup
```

4. Start app
```bash
npm run dev:local
```

5. Open the app
- `http://127.0.0.1:3010/contacts`
- `http://127.0.0.1:3010/accounts`

Local setup uses `DEMO_MODE=true` and `picc_crm_local`, so Clerk keys are not required just to load the app. Leave integration keys blank unless you are actively testing that integration.

Useful local DB commands:
```bash
npm run db:local:up
npm run db:local:setup
npm run db:local:reset
npm run db:local:studio
```

`db:local:setup` intentionally uses `prisma db push` instead of `prisma migrate dev`. The historical production migration chain is not replayable from an empty database because an older foundation migration is a placeholder, so `db push` is the safe local bootstrap path until migrations are repaired in a dedicated migration PR.

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
1. Push repo to GitHub (`brycejohnson1417/Picc-web-app`).
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
