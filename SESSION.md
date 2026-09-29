# Issue 197: Prisma tooling patches

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/197
Branch: codex/197-prisma-tooling, stacked on PR196 until it merges.
Owned: package.json, package-lock.json, SESSION.md.
Scope: Prisma 6 patch plus supported tooling updates to address effect/deepmerge/esbuild audit findings. No Prisma major upgrade, schema migration, API changes, or production records.
Validation: advisory baseline is RED; clean npm ci, Prisma generation/validation, npm run verify and npm audit are GREEN proof. Dependency-only change has no new source behavior test.
Architecture: retain existing Prisma client and PostgreSQL adapter. Check config loader compatibility if an override is required. PR196 package overlap is deliberately sequenced via its head commit; no other source overlap. Other open PRs checked: 195,194,189,182,166,135,82.
