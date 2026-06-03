# Vercel Deployment Checklist

## Pre-Deployment

- [ ] PR links its GitHub issue and is on a feature branch.
- [ ] `npm run verify` passes.
- [ ] `npm run test:e2e` passes when browser surfaces changed.
- [ ] `npx prisma validate` passes.
- [ ] No retired Vendor Day dispatch, Worker, Payroll, GHL/Bizly, Directus/Odoo, Redis, native, or worker-stub surfaces were reintroduced.
- [ ] No production schema/data mutation is bundled unless the PR is approval-lane and explicitly approved.

## Vercel Setup

- [ ] Production project is `picc-push`.
- [ ] Production domain is `https://piccnewyork.org`.
- [ ] Build command is `npm run build`.
- [ ] Output directory uses the Vercel Next.js default, not `dist`.
- [ ] Required production env vars are configured in Vercel without printing secrets in PRs or logs.

## Post-Deployment Smoke

- [ ] `https://piccnewyork.org/sign-in` loads.
- [ ] `https://piccnewyork.org/home` loads.
- [ ] `https://piccnewyork.org/territory` loads and keeps the Vendor Day Status filter.
- [ ] `https://piccnewyork.org/accounts` loads.
- [ ] `https://piccnewyork.org/route` loads.
- [ ] `https://piccnewyork.org/dashboard` loads.
- [ ] `https://piccnewyork.org/settings` loads.
- [ ] Retired routes such as `/vendor-days`, `/request-vendor-day`, and retired API routes are absent or 404.

## Production Safety

- [ ] Production facts are verified through read-only checks only.
- [ ] Temporary production env files are deleted after verification.
- [ ] No secrets, tokens, connection strings, or full sensitive values are pasted into issues, PRs, or chat.
