# PICC App AI Handoff

Use this file as the canonical handoff context for any other AI working on this app.

## Canonical Project

- Local repo path: `/Users/brycejohnson/Code/PICC-Web-App`
- GitHub repo: `https://github.com/brycejohnson1417/Picc-web-app.git`
- Canonical branch: `main`
- Current canonical snapshot commit: `cdbe07389dce9465666def8099335bc6b523c8c2`

## Canonical Deployment

- Production domain: `https://piccnewyork.org`
- Main production app path to verify: `https://piccnewyork.org/territory`
- Vercel project name: `picc-push`
- Vercel project ID: `prj_zKro1cfUOP9D2MTh0ZahYDREcRUA`
- Vercel org/team ID: `team_mVKQE1eiQa5fIKVC4YJI6Wkd`

## Do Not Use These As Canonical

- Do not use `picc-command-center.vercel.app`
- Do not use `picc-dispensary-crm.vercel.app`
- Do not use old local repos like `Picc-web-app-fix-accounts`
- Do not use any legacy Vite/root app surface if it appears in old history

## Product / UX Direction

- This is the real live app, not a rebuild project.
- The app is mobile-first and PWA-oriented, but it must work smoothly on desktop with the same overall UI model.
- Google Maps is the canonical map provider going forward.
- The live map is Google-only. There is no supported dual-provider architecture.
- There are no canonical `MapCanvas`, layer-mode, heatmap, hex, or `/api/territory/layers` map surfaces to extend.
- Do not regress back to MapLibre / Carto / older map stacks.
- Calendar is the vendor-day and follow-up planning surface.
- Territory map remains the main live map and account-detail workflow surface.

## Auth / Identity

- Canonical auth provider: Clerk
- Sign-in method: Google only
- Allowed users must be `@piccplatform.com`
- Production auth domain is on the custom domain flow, not `*.vercel.app`
- Notion writes are still integration-token writes, but visible attribution uses the signed-in app user label

## Notion / Data Rules

- Notion is still a key system of record for the dispensary master list.
- Vendor day calendar data should come from the `Vendor Day` properties on the Dispensary Master List first.
- The older standalone vendor day source should only be treated as fallback, not primary.
- Check-ins are comment-first, not meeting-note-first.

## Current Architecture Constraints

- Keep working in the Next.js app under this repo only.
- Do not reintroduce separate old desktop and mobile apps.
- Do not reintroduce legacy routes, duplicate repos, or stale deployments.
- Prefer additive changes against the current production baseline.

## High-Risk Regression Areas

- Auth / Clerk config
- Map provider selection
- Territory mobile vs desktop shell divergence
- Vendor day source selection
- Legacy repo / old deployment confusion

## Recommended Validation After Changes

1. Verify `https://piccnewyork.org/sign-in`
2. Verify `https://piccnewyork.org/territory`
3. Verify `https://piccnewyork.org/calendar`
4. Run:
   - `npm run typecheck`
   - `npm run lint`
   - `npm run build`

## Short Prompt To Give Another AI

Work only in `/Users/brycejohnson/Code/PICC-Web-App`, which is the canonical repo for the live PICC app. Use `main` in `https://github.com/brycejohnson1417/Picc-web-app.git`. The canonical production deployment is `https://piccnewyork.org`, backed by the Vercel project `picc-push` (`prj_zKro1cfUOP9D2MTh0ZahYDREcRUA`). Do not use legacy repos, old Vercel projects, old map providers, or rebuild a separate app surface. Keep Google Maps, the mobile-first PWA shell, Clerk Google-only auth, comment-first check-ins, and Dispensary Master List vendor-day properties as the current baseline.
