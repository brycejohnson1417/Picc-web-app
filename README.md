# PICC Dispensary CRM (Next.js 15)

Account-centric CRM for cannabis dispensary sales, ops, finance, and brand ambassador workflows.

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

1. Install deps
```bash
npm ci
```

2. Create env file
```bash
cp .env.example .env.local
```

3. Configure `.env.local`
- Set `DATABASE_URL`
- Set Clerk keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- Keep/adjust `NABIS_MASTER_SHEET_PATH`

4. Generate Prisma client
```bash
npx prisma generate
```

5. Run migrations
```bash
npx prisma migrate dev
```

6. Seed realistic demo data
```bash
npm run prisma:seed
```

7. Start app
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
1. Push repo to `piccweb` remote.
2. Import project in Vercel.
3. Set all environment variables from `.env.example`.
4. Add Postgres connection string (`DATABASE_URL`).
5. Run deploy.
6. Run production migrations:
```bash
npx prisma migrate deploy
```

## Notes
- This repo still contains legacy Vite-era folders (`src/`, `api/`) that are excluded from Next TypeScript checks.
- Current active app is under `app/` + `components/` + `lib/` + `prisma/`.
- On macOS, if `/Users/.../Downloads/...xlsx` returns `EPERM`, grant the terminal/Codex app Files access or move the workbook to a permitted directory and update `NABIS_MASTER_SHEET_PATH`.
