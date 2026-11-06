# Map workspace review

- Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/214
- Branch: `codex/214-map-workspace-review`
- Base: `85b9bfbb079b786c511cc9c2ba703bfe06f51747`
- Status: local design review; do not merge or deploy.

## Scope

Responsive desktop navigation, map/account browsing and contextual brief, with existing mobile and field-sales controls preserved. Source-aware reporting is reviewed using private, freshly acquired source data outside the repository.

Reporting ownership includes `components/dashboard/sales-workspace.tsx`, `lib/dashboard/sales-report*`, and `app/(main)/reports/page.tsx`. Enrollment display/filter semantics have focused regression coverage. Current enrollment counts are separate from dated monthly attainment. Tenant-specific product groupings come from the report response and remain outside public source and documentation.

Today ownership includes `components/home/sales-today.tsx`, `app/(main)/home/page.tsx`, `lib/follow-up/sales-today*`, and the existing `components/crm/account-follow-up-flow.tsx`. Today uses authenticated current account records for dated follow-ups, enrollment stages, and recorded payment conditions. Follow-up changes update existing account fields without creating a visit or duplicate note. Unverified sample conversion and enrollment age are omitted. Browser review uses the private local runtime; no production integration is claimed.

## Out of scope

Production data writes, deployment, schema or access-policy changes, integration rollout, communication automation, and unrelated working branches.

## Architecture and ownership

Reuse TerritoryMobile state, GoogleTerritoryMap, route planner, filter/export/layer controls, and account-detail domain flows. Own app-shell.tsx, globals.css, territory-mobile.tsx, territory-list-pane.tsx, account-detail-sheet.tsx, map-overlay-controls.tsx, DESIGN-SYSTEM.md and focused tests. Checked open PRs #211, #189, #135, #82. Account-detail overlap with stale #135/#189 requires recheck before merge. Preserve their behavior.

## Validation

Run normal verify and relevant E2E. Add RED-first tests for deterministic changed behavior. Visual layout work is verified by browser interactions and screenshots because markup assertions do not establish usability. Compare desktop/mobile bounds, map continuity, search/filter selection, routes, brief actions, and reporting drill-through. Private data, metrics, screenshots and runtime artifacts stay outside the repository.

## Safety

Use an isolated local runtime with external writes disabled. Never seed invented sales records or reuse a production database URL. Existing issue181 checkout remains untouched. No claim of production integration follows from a successful local review.

## November 5 continuation
Continuing this draft review: non-map information hierarchy, source-separated historical order access, and store-specific proposals with refreshed inventory. Map implementation and controls are frozen.

Owned paths: components/home/**, components/crm/distru-proposal-panel.tsx, components/dashboard/sales-workspace.tsx, components/mobile/accounts-mobile.tsx, components/crm/contacts-table.tsx, lib/proposals/**, lib/follow-up/**, SESSION.md, DESIGN-SYSTEM.md. Account-detail changes, if necessary, are limited to data display with map behavior preserved.

Checked open PRs #211, #189, #135, #82. Integration #211 remains a dependency; do not duplicate its schema or merge it implicitly. Existing account detail overlap requires preserving navigation and sample actions.

Validation: RED-first domain tests for inventory bounds, source continuity and day/backlog separation; visual-only layout verified through desktop/mobile browser interactions, screenshots, and repository verify/E2E. No production writes, migration, secrets changes or deployment in this review.

Compact, source-labeled visuals support sales comparisons and account follow-up. Review data and business-specific mapping stay outside the repository.
