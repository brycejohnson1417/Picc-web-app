# Pricing catalog correction

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/185
Branch: codex/185-refresh-pricing

Scope: refresh three superseded catalog entries and regression-test the shared pricing/comparison consumers.
Owned paths: lib/preferred-partner/pricing.ts, lib/preferred-partner/pricing.test.ts, lib/server/preferred-partner-savings.test.ts, lib/server/preferred-partner-proposal.test.ts, SESSION.md.
Out of scope: order/payment mutations, external-system writes, schema/auth, account-specific policies, redesign.
Architecture: retain shared domain catalog; existing browser comparison/proposal flows consume its results.
Validation: RED regression before catalog edit, focused tests, npm run verify, authenticated browser check when available.

## 2026-09-16: Route completeness (#187)

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/187
Branch: codex/187-route-completeness, based on origin/main b35df64.
Scope: route order completeness, 50-store optimization, existing lead status and configurable origin.
Out of scope: schema/auth/sync/secrets changes, account mutations, unrelated UI.
Owned paths: components/mobile/route-mobile.tsx; components/territory/route-sheet.tsx; lib/territory/route*.ts; lib/territory/types.ts; app/api/territory/optimize-route/route.ts; lib/server/territory-saved-routes.ts; route-specific tests; appended SESSION.md section.
Checked PRs #182, #166, #144, #135, #82. Shared SESSION.md changes are append-only and must rebase before merge. #144 is an old monorepo rewrite contrary to current repo instructions; this slice is rebased on canonical current main and must be rechecked before merge. No active route-specific ownership found.
Architecture: existing route hook and Google adapter, domain helpers for ordering/batching; existing DESIGN-SYSTEM.md governs UI.
Validation: RED stale-order and 50-stop/origin regressions first; npm run verify; npm run test:e2e; native browser desktop/mobile interaction QA with screenshots/video.
