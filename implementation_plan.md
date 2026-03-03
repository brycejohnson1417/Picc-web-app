# Picc-web-app Optimization Plan (Decision-Complete, 3 PRs)

## Summary
1. Use a 3-PR sequence: `speed/loading`, `mobile responsiveness`, `architecture refinements`.
2. Keep scope targeted (no broad rewrite), with measurable performance gates.
3. Use Lighthouse mobile acceptance targets you selected: `/dashboard` and `/accounts` >= 80 with LCP <= 2.8s, `/territory` >= 70.
4. Update the existing plan doc at [implementation_plan.md](/Users/brycejohnson/Documents/New project/picc-push/implementation_plan.md) first, then execute after approval.

## Baseline Facts From Repo Audit
1. Repo path is `/Users/brycejohnson/Documents/New project/picc-push`, branch `main`, tracking `piccweb/main`.
2. Runtime/tooling is currently blocked by Node `v25.4.0`; this repo expects Node `20.x` or `22.x`.
3. Current notable perf constraints:
[app/layout.tsx](/Users/brycejohnson/Documents/New project/picc-push/app/layout.tsx) and [(main)/layout.tsx](/Users/brycejohnson/Documents/New project/picc-push/app/(main)/layout.tsx) force dynamic behavior; Leaflet CSS is globally loaded in root layout; heavy interactive components are mounted globally from [app-shell.tsx](/Users/brycejohnson/Documents/New project/picc-push/components/layout/app-shell.tsx).
4. Current notable mobile constraints:
[territory-client.tsx](/Users/brycejohnson/Documents/New project/picc-push/components/territory/territory-client.tsx) uses hard minimum heights/absolute overlays; [advanced-data-table.tsx](/Users/brycejohnson/Documents/New project/picc-push/components/crm/advanced-data-table.tsx) has fixed-width controls and desktop-first table UX.
5. Current architecture constraints:
runtime DDL/raw SQL table management in [notion-cache-store.ts](/Users/brycejohnson/Documents/New project/picc-push/lib/server/notion-cache-store.ts) and [notion-territory.ts](/Users/brycejohnson/Documents/New project/picc-push/lib/server/notion-territory.ts); legacy Vite-era dirs are still in repo and excluded from checks.

## Public APIs / Interfaces / Types
1. No breaking external API changes are planned.
2. Internal schema/type additions:
Add Prisma model `NotionCacheSnapshot` to [schema.prisma](/Users/brycejohnson/Documents/New project/picc-push/prisma/schema.prisma) and corresponding migration.
3. Internal API response compatibility:
Keep existing `/api/territory/stores` response shape backward-compatible; only additive metadata allowed if needed.
4. Component contract changes:
`AdvancedDataTable` will gain responsive mode props (default non-breaking), and territory UI components will receive mobile-safe layout props (non-breaking internal usage).

## Execution Plan

### 1) Approval Gate (before implementation)
1. Replace [implementation_plan.md](/Users/brycejohnson/Documents/New project/picc-push/implementation_plan.md) with this plan.
2. Pause for user approval on the plan document content.
3. After approval, execute PRs in order below.

### 2) PR #1: Speed and Loading Optimizations
1. Branch: `codex/speed-loading-optimization`.
2. Environment normalization:
add `.nvmrc` with Node 22, update README setup note, reinstall deps under Node 22 (`npm ci`) before any perf measurements.
3. Render/cache strategy changes:
remove unnecessary `force-dynamic` from root layout in [app/layout.tsx](/Users/brycejohnson/Documents/New project/picc-push/app/layout.tsx); keep dynamic behavior only where required by auth/runtime data.
4. Route-scoped asset loading:
move Leaflet global CSS import out of root layout and into a territory-only layout at `app/(main)/territory/layout.tsx`.
5. Bundle splitting:
lazy-load command palette and dashboard chart module so non-dashboard routes don’t pay chart/cmdk costs up front.
6. Client navigation fix:
replace internal anchor navigation in conversations with `next/link` to prevent full document reloads.
7. Query/network tuning:
debounce territory search/filter requests, keep previous data during refresh, remove unnecessary client `cache: 'no-store'` usage where safe.
8. Measurement tooling:
add bundle analyzer + Lighthouse CI scripts and store baseline/final reports in `docs/perf/`.

### 3) PR #2: Mobile Responsiveness Improvements
1. Branch: `codex/mobile-responsiveness-improvements`.
2. Shell/navigation:
improve mobile drawer accessibility/focus behavior and safe-area handling for bottom nav.
3. Table responsiveness:
update [advanced-data-table.tsx](/Users/brycejohnson/Documents/New project/picc-push/components/crm/advanced-data-table.tsx) for mobile card/list fallback and full-width controls (`w-full` on small screens).
4. Territory UX on small screens:
reduce hard minimum map height, prevent overlay collisions, make route sheet behavior mobile-friendly.
5. Conversation page mobile flow:
avoid cramped 2-pane desktop layout on phones by using a mobile-first list/thread flow.
6. Spacing/touch targets:
enforce minimum 44px touch targets and reduce clipped text/overflow across key pages.

### 4) PR #3: Architecture Refinements
1. Branch: `codex/architecture-refinements`.
2. Data/cache persistence hardening:
introduce `NotionCacheSnapshot` Prisma model + migration and remove runtime table creation for that cache.
3. Raw SQL reduction:
replace raw cache CRUD with Prisma client access where possible (including `SpatialGeocodeCache` paths).
4. Request-context dedupe:
centralize workspace/auth context retrieval to avoid repeated bootstrap calls within a request.
5. Structure cleanup (targeted, not broad rewrite):
organize Notion-related server logic into clearer module boundaries while preserving existing behavior.
6. Legacy code handling:
do not delete `src/` and `api/` this cycle; mark explicitly as archived/deferred to avoid risky churn.

### 5) PR Creation and Merge Protocol
1. Open PRs against `main` on remote `piccweb` in the exact order above.
2. PR titles:
`feat: speed/loading optimizations`, `feat: mobile responsiveness pass`, `refactor: architecture refinements`.
3. Each PR description must include: before/after Lighthouse metrics, bundle delta, test evidence, and rollback note.
4. Merge order is strict: PR1 -> PR2 -> PR3 (rebase each subsequent branch on latest `main`).

## Test Cases and Acceptance Scenarios

### Global Gates (each PR)
1. `npm run lint` passes.
2. `npm run typecheck` passes.
3. `npm run build` passes under Node 22.

### Performance Gates (PR1 final)
1. Lighthouse mobile on `/dashboard`: Performance >= 80 and LCP <= 2.8s.
2. Lighthouse mobile on `/accounts`: Performance >= 80 and LCP <= 2.8s.
3. Lighthouse mobile on `/territory`: Performance >= 70.
4. Bundle diff shows reduced initial JS/CSS payload for non-territory pages.

### Mobile UX Gates (PR2 final)
1. Viewports: 390x844, 412x915, 768x1024, 1280x800.
2. Critical flows: open nav, navigate to dashboard/accounts/territory/conversations, search/filter territory, interact with tables, compose mock message.
3. No horizontal page overflow on primary pages.
4. No blocked interactive controls behind fixed overlays.

### Architecture Gates (PR3 final)
1. Cache sync endpoints still work: `/api/cron/notion-sync`, `/api/territory/stores`, `/api/territory/prewarm`.
2. No schema regressions after migration deploy.
3. Existing cache fallback behavior preserved when Notion sync fails.

## Assumptions and Defaults
1. Node 22 LTS is the default execution runtime for implementation.
2. Performance tests run in a reproducible local mode (using DEMO mode where needed to avoid Clerk auth variance).
3. `gh` CLI is authenticated for PR creation; if not, authenticate before PR step.
4. Database migration execution is allowed in the target environments used for validation.
5. Scope is optimization/refinement only; no product-feature expansion in this cycle.
