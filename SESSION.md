# Issue 201: Retire worker calendar health

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/201
Branch: codex/201-retired-calendar-health from cf42d431.
Scope: remove Home worker calendar health query/tile, retire guarded endpoint with 410, delete unused service.
Owned: app/(main)/home/page.tsx; app/api/calendar/sync-health/route.ts; lib/server/calendar-sync-health.ts; lib/server/calendar-sync-health-route.test.ts; SESSION.md.
Out of scope: schema, production data, current calendar, notification preferences, payroll/history.
Architecture: retain existing authentication/role guards and active Home freshness signals; no new abstraction.
Validation: RED endpoint regression test, existing guards, verify, local Home browser proof.
Overlap: checked #194,#195,#200,#189,#166,#135,#82. #195 overlaps Home and must rebase preserving its org guard. No overlap with other changes.
