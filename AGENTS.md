# Repository Instructions

This repository is the canonical source of truth for the live PICC app.

## Canonical Context

- GitHub repo: `https://github.com/brycejohnson1417/Picc-web-app.git`
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
- Run `npm test`
- Run `npm run build`
- Prefer additive fixes against current behavior rather than architecture rewrites

## Anti-Slop Delivery Contract

Every meaningful code change must be traceable, reviewable, and revertable.

Before implementation:

1. Link the GitHub issue. If none exists, create one before editing code.
2. Work on a feature branch, not `main`.
3. Write down scope and out-of-scope items.
4. Identify the validation plan before editing.
5. For behavior changes, add or update the failing test first unless the PR explains why TDD is not practical.
6. Create or update `SESSION.md` with the current session scope, out-of-scope items, and constraints before substantial agent work.

During implementation:

- Keep one concern per PR.
- Keep production triage surgical.
- Keep UI features fully usable from the browser.
- Do not silently mix refactors with bug fixes.
- Put business logic in server/domain modules and keep UI components thin.
- Keep Notion, Nabis, GHL, Neon, Supabase, Vercel, and other external systems behind explicit boundaries.

Before PR:

- Self-review the diff.
- Keep the PR at 10 changed files or fewer whenever possible. If it must exceed 10 files, explain why in the PR body.
- Run the repo validation commands.
- Include screenshots or browser proof for UI changes.
- Include read-only production proof for production data claims.
- List remaining risk honestly.

Production data rule:

- Local `.env.local` is not production proof.
- Production facts require a safe read-only production verification path.
- Pull production env only into a temporary ignored file, report counts/timestamps/status only, and delete it immediately.
- Do not print secrets or connection strings.
- Do not perform production writes, schema changes, or destructive operations without explicit user approval.
