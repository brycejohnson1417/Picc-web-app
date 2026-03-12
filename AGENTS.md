# Repository Instructions

This repository is the canonical source of truth for the live PICC app.

## Canonical Context

- GitHub repo: `https://github.com/bryce-picc/Picc-web-app.git`
- Canonical branch: `main`
- Production app: `https://piccnewyork.org`
- Main production route to verify: `https://piccnewyork.org/territory`
- Vercel project name: `picc-push`
- Vercel project ID: `prj_zKro1cfUOP9D2MTh0ZahYDREcRUA`

## Required Baseline

- This is an additive continuation of the current live app, not a rebuild.
- Keep the current mobile-first PWA shell.
- Keep Google Maps as the only supported map provider.
- Do not reintroduce MapLibre, Carto, Leaflet, `MapCanvas`, heatmap/hex layer modes, or `/api/territory/layers`.
- Keep Clerk as the auth provider.
- Sign-in is Google-only.
- Access is restricted to `@piccplatform.com` users.
- Check-ins are comment-first, not meeting-note-first.
- Vendor day calendar data should come from the Dispensary Master List `Vendor Day` properties first.

## Do Not Use

- Do not use old repos or local clones such as `Picc-web-app-fix-accounts`.
- Do not use `picc-command-center.vercel.app`.
- Do not use `picc-dispensary-crm.vercel.app`.
- Do not revive deleted workflow surfaces unless there is an explicit product decision to do so.
- Do not treat stale planning docs or old commit history as more authoritative than the current `main` branch.

## Before Making Changes

1. Read [`README.md`](/Users/brycejohnson/Documents/New project/Picc-web-app/README.md).
2. Read [`AI_HANDOFF.md`](/Users/brycejohnson/Documents/New project/Picc-web-app/AI_HANDOFF.md).
3. Verify the live app behavior at:
   - `https://piccnewyork.org/sign-in`
   - `https://piccnewyork.org/territory`
   - `https://piccnewyork.org/calendar`

## Validation

- Run `npm run typecheck`
- Run `npm run lint`
- Run `npm run build`
- Prefer additive fixes against current behavior rather than architecture rewrites
