# Session: Issue #45 Nabis Sales Dashboard

## Scope

- Rebuild the Nabis sales dashboard around cached Postgres analytics by default.
- Support current month, YTD, trailing 12 months, and custom date ranges.
- Show selected-range revenue, historical monthly revenue, sales by rep, and rep/month metrics.
- Keep selected-range drilldowns, CSV export, and PDF export useful.
- Show cache coverage, freshness, and partial-cache states clearly.
- Use the Sales NY Rep Metrics PDF as a reconciliation reference only.

## Out Of Scope

- Redoing transfer cleanup.
- Production writes, schema changes, destructive operations, or Notion/Nabis writes.
- Treating the PDF sheet as authoritative.
- Moving the full rep metrics workflow to Home.

## Constraints

- Worktree: `/Users/brycejohnson/Code/worktrees/45-nabis-sales-dashboard`
- Branch: `codex/45-nabis-sales-dashboard`
- Issue: `https://github.com/brycejohnson1417/Picc-web-app/issues/45`
- Draft PR: `https://github.com/brycejohnson1417/Picc-web-app/pull/55`
- Keep UI components thin and put analytics logic in `lib/dashboard`.
- Cached Nabis coverage starts at the proven earliest order unless current cache evidence shows otherwise.
