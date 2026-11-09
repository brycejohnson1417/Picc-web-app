# Territory address source change

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/220

Branch: `codex/220-full-address-pins`, based on current `origin/main`.

Scope: use Full Address as the sole territory location input; reuse existing geocoding/cache boundary; require the canonical address schema; add focused regressions and verify the browser map.

Owned paths: `lib/server/notion-territory.ts`, focused `lib/server/notion-territory*.test.ts`, `lib/territory/cache-keys.ts`, `lib/dashboard/nabis-server.ts`, `SESSION.md`, and focused verification tests/scripts if needed. The dashboard shares the territory snapshot key; keep its reader aligned when versioning location semantics.

Out of scope: map redesign, other product repos, provider/auth changes, database migrations, unrelated integrations. Source field removal is a separate conditional step after complete production coverage and private source preservation.

Plan: failing schema/location behavior tests first, minimal adapter change, full `npm run verify`, browser verification and read-only production reconciliation. Never equate city-only or unavailable coordinates with a verified store pin.

Architecture check: keep the existing thin UI and server-side provider/cache adapter. No new settings or parallel location source.

Overlap reviewed: open PRs #219, #217, #215, #211, #189, #135, #82. Avoid shared UI owned by the design-review PR; recheck changed paths before merge. This slice is exclusive while the shared location adapter is changing.

Source schema/data retirement is conditional on complete live pin verification. No private records or screenshots belong in this repository.
