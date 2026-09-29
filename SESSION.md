# Issue 92: Territory organization boundary

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/92
Branch: codex/92-territory-org-scope from main 4fde001.
Scope: propagate authenticated org into list loaders; isolate shared Notion snapshot and fallback to its configured org; preserve filtering and refresh. Cache key already includes org, so preserve that and verify regression coverage.
Owned: lib/server/notion-territory.ts and focused tests; app/api/territory/{stores,account-refresh}/route.ts; caller org propagation in home/account-contact-runtime/daily-briefing; SESSION.md.
Out of scope: provider/mapping changes, schema, map redesign, row writes/backfills, detail routes.
Checked #194,#189,#182,#166,#135,#82: no direct source overlap except SESSION. Sequence future Home retirement and Mailjet changes after this slice or rebase them. #144 closed obsolete.
Test plan: RED organization-isolation tests including empty read model/error fallback; GREEN filters and refresh; npm run verify; production browser proof limited by authenticated session availability. Architecture remains existing shared Notion adapter plus org-scoped read models.
