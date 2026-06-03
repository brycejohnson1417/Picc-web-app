# PICC App AI Handoff

Use this file as canonical handoff context for agents working on this app.

## Canonical Project

- Local repo path: `/Users/brycejohnson/Code/PICC-Web-App`
- GitHub repo: `https://github.com/brycejohnson1417/Picc-web-app.git`
- Canonical branch: `main`
- Production domain: `https://piccnewyork.org`
- Primary route to verify: `https://piccnewyork.org/territory`
- Vercel project: `picc-push`

## Do Not Use

- `/Users/brycejohnson/clawd/projects/picc-web-app`
- `/Users/brycejohnson/Documents/New project/Picc-web-app`
- `picc-command-center.vercel.app`
- `picc-dispensary-crm.vercel.app`
- Old Vite, native, Directus, Odoo, Redis, or worker stubs from repo history

## Current Product Boundary

- This is the live PICC field-sales app, not a rebuild.
- Keep the mobile-first PWA shell.
- Keep Google Maps as the only supported map provider.
- Keep Clerk Google-only auth.
- Keep Notion as the active territory/account source.
- Keep Nabis cached retailer/order intelligence.

## Retired Product Boundary

Do not revive these without a new explicit product decision:

- Vendor Day dispatch/scheduling routes, public request flow, workspace, cron lifecycle, and reporting
- Worker/Brand Ambassador coordination and supply settings
- Payroll API/reporting
- GHL/Bizly
- Native app, Directus/Odoo service stubs, Redis, mobile sync worker

Retained exception: territory Vendor Day Status remains active. Preserve the `/territory` Vendor Day Status filter, Notion-derived `vendorDayStatus` read/modeling, account detail display, and store-detail Vendor Day summary/history.

## Required Workflow

Use issue-first work, feature branches, draft PRs before meaningful edits, and the local anti-slop protocol in `/Users/brycejohnson/Code/AGENTS.md`.

## Validation

Run:

```bash
npm run verify
```

For browser-surface changes, also run:

```bash
npm run test:e2e
```
