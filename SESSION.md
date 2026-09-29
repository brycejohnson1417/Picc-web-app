# Issue 192: runtime dependency security patches

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/192
Branch: codex/192-dependency-patches from main 28f021f.

Scope: supported Next.js 15 patches, sharp security release, compatible transitive dependency fixes, current audit proof.
Out of scope: framework-major migration, xlsx replacement (#107), application refactors, schema/auth/provider changes.
Owned paths: package.json, package-lock.json, SESSION.md.
Checked PRs 190,191,189,182,166,144,135,82; no focused package overlap other than obsolete architecture rewrite #144. Source slices stay independent; resolve shared handoff only after a preceding merge.

TDD exception: package metadata changes are measured with npm audit and the full existing regression suite, not mirrored unit tests. Run clean npm ci, npm run verify, and representative browser checks. Keep a before/after audit and explicitly report unresolved findings. Do not use audit fix --force.
Architecture remains root Next.js app, Clerk, Prisma and existing integrations. This is reversible dependency patching.

Validation: clean npm ci and npm run verify passed on Node 22 (50 files, 215 tests before integrating #191). Production audit reduced from 13 affected entries (1 critical, 10 high, 2 moderate) to 5 high entries: Prisma tooling chain and xlsx (#107). Browser smoke rendered configuration gates; authenticated flows remain unverified without environment configuration. No production credentials were copied into this checkout.
Merged main a3ee3a1 (#191); resolved only SESSION.md by keeping this slice's scope. No source conflict. Repeat full verification against combined tree before publication.
Combined-tree verification passed: lint, typecheck, 51 test files / 217 tests, Prisma schema validation, production build. Lockfile churn includes native-platform packages and compatible security fixes; only three PR-owned files change relative to current main.
