# Session: Issue #64 Nabis Active Sync Feedback

## Scope

- Fix the Nabis dashboard feedback shown when a manual refresh collides with an active Nabis sync lease.
- Keep saved dashboard data visible and explain that the active sync is still running.
- Make the Settings Nabis sync panel treat HTTP 409 lease refusals as active-sync status instead of generic failures.
- Separate operational warnings/errors from informational VMI snapshot notes in the dashboard status strip.

## Out Of Scope

- Production data writes, schema changes, destructive operations, or Notion writes.
- Changing Nabis order, line-item, retailer, or promo total sync semantics.
- Reworking the dashboard analytics or sales metric calculations.
- Rebuilding the sync architecture.

## Constraints

- Worktree: `/Users/brycejohnson/Code/PICC-Web-App`
- Branch: `codex/64-nabis-active-sync-feedback`
- Issue: `https://github.com/brycejohnson1417/Picc-web-app/issues/64`
- Owned path globs:
  - `app/api/dashboard/route.ts`
  - `app/api/sync/run/route.ts`
  - `components/dashboard/nabis-sales-dashboard.tsx`
  - `components/settings/nabis-sync-admin-panel.tsx`
  - `lib/server/nabis-sync.ts`
  - focused tests for the touched modules
- Checked open PRs: none open at session start.

## Validation Plan

- Add or update focused tests for Nabis sync lease refusal message handling.
- Run the focused test first.
- Run `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
- Browser-verify the affected feedback path locally when auth/dev setup allows; otherwise document the blocker and rely on unit/API coverage for this surgical path.
