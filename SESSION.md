# Issue 93: disable placeholder membership sync

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/93
Branch: codex/93-disable-mock-sync from main 28f021f.

Scope: return a clear disabled response from the admin-only placeholder sync endpoint; eliminate hardcoded membership writes. No caller exists in the current UI.
Out of scope: membership deletion, real Notion ingestion, role changes, schema, provider/environment changes.
Owned paths: app/api/integrations/notion/sync-team-directory/route.ts, lib/server/notion-team-directory-route.test.ts, SESSION.md.
Checked PRs 190,189,182,166,144,135,82. No focused source overlap; old SESSION claims are stale. Distinct source paths from #90.

Test plan: RED admin request must return 501 without membership writes; unauthorized request remains forbidden. GREEN route replacement; npm run verify. No frontend behavior is changed and no UI caller exists, so browser feature testing is not applicable to this endpoint removal. Existing baseline 215 tests passed at 28f021f.
Architecture: retain existing admin guard; remove the fake provider implementation rather than add a replacement integration. No production membership data is changed.

Validation completed: RED failed on five unwanted membership writes; GREEN both disabled and unauthorized cases passed. npm run verify passed lint, typecheck, 51 files / 217 tests, Prisma validation and production build. No UI caller exists for the disabled route. No production memberships were read or changed by the tests.
