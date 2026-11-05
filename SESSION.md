# Map workspace review

- Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/214
- Branch: `codex/214-map-workspace-review`
- Base: `85b9bfbb079b786c511cc9c2ba703bfe06f51747`
- Status: local design review; do not merge or deploy.

## Scope

Responsive desktop navigation, map/account browsing and contextual brief, with existing mobile and field-sales controls preserved. Source-aware reporting is reviewed using private, freshly acquired source data outside the repository.

## Out of scope

Production data writes, deployment, schema or access-policy changes, integration rollout, communication automation, and unrelated working branches.

## Architecture and ownership

Reuse TerritoryMobile state, GoogleTerritoryMap, route planner, filter/export/layer controls, and account-detail domain flows. Own app-shell.tsx, globals.css, territory-mobile.tsx, territory-list-pane.tsx, account-detail-sheet.tsx, map-overlay-controls.tsx, DESIGN-SYSTEM.md and focused tests. Checked open PRs #211, #189, #135, #82. Account-detail overlap with stale #135/#189 requires recheck before merge. Preserve their behavior.

## Validation

Run normal verify and relevant E2E. Add RED-first tests for deterministic changed behavior. Visual layout work is verified by browser interactions and screenshots because markup assertions do not establish usability. Compare desktop/mobile bounds, map continuity, search/filter selection, routes, brief actions, and reporting drill-through. Private data, metrics, screenshots and runtime artifacts stay outside the repository.

## Safety

Use an isolated local runtime with external writes disabled. Never seed invented sales records or reuse a production database URL. Existing issue181 checkout remains untouched. No claim of production integration follows from a successful local review.
