# Pricing catalog correction

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/185
Branch: codex/185-refresh-pricing

Scope: refresh three superseded catalog entries and regression-test the shared pricing/comparison consumers.
Owned paths: lib/preferred-partner/pricing.ts, lib/preferred-partner/pricing.test.ts, lib/server/preferred-partner-savings.test.ts, lib/server/preferred-partner-proposal.test.ts, SESSION.md.
Out of scope: order/payment mutations, external-system writes, schema/auth, account-specific policies, redesign.
Architecture: retain shared domain catalog; existing browser comparison/proposal flows consume its results.
Validation: RED regression before catalog edit, focused tests, npm run verify, authenticated browser check when available.
