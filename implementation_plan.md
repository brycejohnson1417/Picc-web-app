# Picc-web-app Optimization Plan

Date: 2026-03-03
Repo: `bryce-picc/Picc-web-app`

## Objectives
1. Optimize page loading speed
2. Improve mobile responsiveness
3. Refine architecture decisions
4. Ship changes via Pull Request(s)

---

## 1) Current State (quick analysis)

### Stack
- Frontend: React + TypeScript + Vite 5
- UI: Tailwind classes in components
- API: Vercel serverless (`/api/*`) for auth, Notion, Sheets, Gemini

### Baseline build findings
- Production build succeeds
- Main JS chunk is oversized:
  - `dist/assets/index-*.js` ≈ **1,366.95 kB** (gzip ≈ 413.96 kB)
- Vite warns about chunks > 500 kB

### Primary contributors to load cost
- `App.tsx` imports many heavy tab modules up-front
- Large feature modules (ex: `SalesCRM.tsx`, `Settings.tsx`, `ProposalBuilder.tsx`, `Dashboard.tsx`) are bundled eagerly
- Sidebar is fixed desktop-first (`w-64`, `fixed`, `h-screen`) and needs a mobile navigation pattern

---

## 2) Implementation Plan (proposed)

## Phase A — Speed & Loading Optimizations

### A1. Route/tab-level lazy loading
- Replace eager imports in `App.tsx` with `React.lazy` + `Suspense` for tab content
- Load only active tab module
- Keep lightweight skeleton loader fallback

**Expected impact**
- Significant initial bundle reduction
- Faster first contentful paint on low/mid devices

**Success metric**
- Reduce main initial JS chunk by **>= 35%**
- No regression in tab switching behavior

### A2. Split heavy vendor chunks intentionally
- Add `build.rollupOptions.output.manualChunks` in `vite.config.ts`
- Separate major libraries (e.g., charts/export/integration SDKs) into stable chunks

**Expected impact**
- Better browser caching between deployments
- Smaller invalidation blast radius

**Success metric**
- No single app chunk > 500–700 kB minified for initial path

### A3. Defer non-critical third-party script initialization
- Keep Google identity script loading only on auth surface (already partially done)
- Ensure no eager load once authenticated

**Success metric**
- No unnecessary third-party script on authenticated dashboard route

---

## Phase B — Mobile Responsiveness Improvements

### B1. Responsive shell + collapsible nav
- Convert sidebar from always-fixed desktop layout to:
  - Desktop: fixed sidebar
  - Mobile: top bar + slide-over drawer
- Add overlay/backdrop + ESC close behavior

**Success metric**
- Usable navigation at 320px, 375px, 390px, 768px widths

### B2. Component-level responsive pass
- Audit highest traffic screens (`Dashboard`, `SalesCRM`, `ProposalBuilder`, `ServiceWorkspace`)
- Fix overflow, cramped grids, non-wrapping controls
- Add responsive utility classes for spacing/typography density

**Success metric**
- Zero horizontal scroll on core screens on iPhone viewport widths

### B3. Touch ergonomics
- Ensure tap targets are >= 40px high for key actions
- Improve spacing around table controls/filters

**Success metric**
- Core flows pass manual touch test on mobile simulator

---

## Phase C — Architecture Refinements

### C1. Introduce tab registry pattern
- Move tab metadata + loader mapping to a single `tabRegistry` module
- Avoid large switch/case growth in `App.tsx`

**Success metric**
- `App.tsx` reduced in complexity and direct imports

### C2. Consolidate app shell concerns
- Separate auth/session gate from main shell rendering
- Keep sidebar/header/layout concerns isolated from feature modules

**Success metric**
- Cleaner ownership boundaries; easier future feature additions

### C3. Add perf guardrails
- Add lightweight build-size reporting script in CI/local docs
- Document expected bundle thresholds in README or `docs/perf.md`

**Success metric**
- Repeatable way to catch regressions before deploy

---

## 3) Testing Plan

### Functional
- `npm run build` (must pass)
- `npm run dev` smoke for login + tab navigation + logout
- Validate each lazily loaded tab renders correctly

### Responsive
- Test widths: 320, 375, 390, 768, 1024+
- Validate nav open/close states and focus behavior
- Confirm no horizontal overflow on key screens

### Performance (before/after)
- Compare Vite build artifact sizes pre/post
- Track:
  - largest initial chunk
  - total JS transferred for initial load

---

## 4) PR Strategy

Preferred: **one focused PR** with clear commits grouped by theme:
1. perf: lazy load tab modules + suspense
2. perf: manual chunking and build config
3. ui: mobile nav shell + responsive fixes
4. refactor: tab registry + shell boundaries
5. docs: perf guardrails + test notes

Alternative (if you prefer cleaner review): split into two PRs
- PR 1: Performance + architecture foundation
- PR 2: Mobile UI/UX improvements

---

## 5) Risks & Mitigations

- Risk: lazy-loaded modules introduce loading flicker
  - Mitigation: consistent skeletons and optimistic transitions
- Risk: manualChunks misconfiguration causes cache misses or duplication
  - Mitigation: inspect build output and tune chunk map iteratively
- Risk: mobile nav regressions on desktop
  - Mitigation: strict breakpoint-specific layout tests

---

## 6) Approval Gate

If approved, next execution steps are:
1. Create feature branch
2. Implement Phase A/B/C in order
3. Run full test checklist
4. Push branch and open PR with before/after bundle stats + screenshots

Please approve with any edits to scope (single PR vs split PRs).
