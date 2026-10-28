# Session: territory workspace repair (#212)

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/212

Scope: explicit authorized-workspace to configured territory source resolution at the existing server boundary. Own lib/server/notion-territory.ts and territory organization regression tests.
Non-goals: data migration, environment edits, distributor work, UI redesign, authentication bypass.
Plan: reproduce shared/source mismatch with a failing test; resolve only trusted configured identities; retain missing/foreign context refusal and source cache namespace. Run npm run verify and focused route tests.
Architecture: current Next.js server adapter; preserve existing source records and caller authentication. Source namespace is server controlled.
Concurrency: checked PRs #211, #189, #135, #82; no overlapping owned paths. Keep separate from #211.
Release: access-boundary change requires explicit approval before merge/deployment. Current browser session stops at sign-in; production signed-in proof is outstanding.
