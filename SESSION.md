# Session: Issue #87 Local Territory Read-Model FK Warning

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/87

## Scope
- Stop local territory sync/read-model writes from targeting a non-seeded production org while demo mode is active.
- Preserve production territory org behavior when demo mode is disabled.
- Add regression coverage for the local demo-mode org resolution path.
- Browser-verify `/territory` against local Postgres without the `TerritoryStoreReadModel_orgId_fkey` warning.

## Out Of Scope
- No production data writes.
- No schema migration or backfill.
- No territory map drawing UX changes.
- No map provider changes.
- No auth provider changes.

## Owned Paths
- `lib/server/notion-territory.ts`
- `lib/server/notion-territory.test.ts`
- `lib/server/territory-read-model.ts`
- `lib/server/territory-read-model.test.ts`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #82. It is docs-only project-boundary work and does not overlap this territory runtime fix.

## Current Evidence
- Local seed creates `OrganizationWorkspace.id = org_picc_demo`.
- Local `.env.local` has `DEMO_MODE=true` and `TERRITORY_ORG_ID=org_picc_prod`.
- `territory-read-model.ts` and `notion-territory.ts` both preferred configured `TERRITORY_ORG_ID` before demo fallback when no explicit org ID was passed.

## Constraints
- Keep Google Maps as the only map provider.
- Keep the current mobile-first PWA shell.
- Keep business logic in server modules and UI components thin.
- Keep mutations scoped by `orgId`.
- Do not rely on editing untracked local env files as the durable fix.

## Validation Plan
- Add failing Vitest tests proving demo-mode territory read-model writes and sync jobs use `DEMO_ORG_ID` even if `TERRITORY_ORG_ID` is set to the production org.
- Run the focused regression test.
- Run `npm run typecheck`.
- Run `npm run lint`.
- Run `npm test`.
- Run `npm run build`.
- Run `npm run db:local:setup`.
- Start `npm run dev:local` and browser-check `/territory` with no local FK warning in server logs.
