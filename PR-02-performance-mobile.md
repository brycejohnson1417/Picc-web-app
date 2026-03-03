# PR Request 02 — Performance + Mobile UX Optimization

## Goal
Improve initial load performance and make UX genuinely mobile-first.

## Scope
- Lazy-load major tab modules in `App.tsx`.
- Add `Suspense` loading states for module and portal routes.
- Configure Vite `manualChunks` to split heavy vendor bundles.
- Introduce responsive app shell behavior:
  - desktop fixed sidebar
  - mobile top bar + drawer nav
- Resolve horizontal overflow + tap-target issues on high-traffic modules.

## Proposed file areas
- `src/App.tsx`
- `src/components/Sidebar.tsx`
- `vite.config.ts`
- `src/components/{Dashboard,SalesCRM,ProposalBuilder,ServiceWorkspace}.tsx`

## Acceptance criteria
1. Build passes with no functional regressions.
2. Initial JS payload materially reduced vs baseline.
3. Core flows usable on 320/375/390/768 widths.
4. No horizontal overflow on key screens.
5. Before/after bundle stats documented in PR description.

## Baseline (captured)
- Main app chunk ~1366.95 kB minified (~413.96 kB gzip)

## Non-goals
- Pixel-perfect redesign of every legacy screen
- New feature development unrelated to performance/mobile
