Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/138
Branch: codex/138-ghl-bizly-deprecation

Scope:
- Deprecate active GHL/Bizly repo references now that those systems are no longer in use.
- Harden Notion CRM retailer mirroring so likely duplicate creates are blocked for review.
- Keep the current Nabis/Notion account identity path as the active integration surface.

Out of scope:
- Production Prisma enum removal or schema migration.
- Broad Nabis field update/backfill from the current retailer export.
- Existing Nabis exception workflow work in PR #135.

Validation plan:
- RED: add a Notion CRM mirror test proving same-license conflicts block creates.
- GREEN: implement duplicate guard queries for license, Nabis retailer ID, and exact name/city/zip.
- Run `npm test -- lib/server/notion-crm-sync.test.ts`.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build` before completion.

Open PR overlap checked:
- #135 `codex/134-nabis-exceptions`: unrelated Nabis exception UI work; no owned path overlap for this slice.
- #82 `codex/81-project-boundary-docs`: docs-only boundary PR; keep this docs cleanup narrow.
