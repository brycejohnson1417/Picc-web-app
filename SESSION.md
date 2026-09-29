# Issue 94: Defer dashboard export libraries

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/94
Branch: codex/94-dashboard-export-lazy from cf42d431.
Scope: extract PDF export from the large dashboard component and load it only on explicit export; preserve output and controls.
Owned: components/dashboard/nabis-sales-dashboard.tsx; components/dashboard/nabis-dashboard-pdf.ts; tests/e2e/dashboard-export.spec.ts; SESSION.md.
Out of scope: data semantics, redesign, auth, settings/territory refactors, production writes.
Architecture: use the existing on-demand PDF import pattern used by proposal/order exports; keep rendering thin and isolate export dependencies.
Evidence: dashboard statically imports html2canvas, jspdf, jspdf-autotable; current build 202 kB route / 417 kB first-load. Other PDF surfaces already defer imports.
Validation: no business behavior change; TDD exception for pure extraction, verify generated PDF download via browser and measure production build bundle before/after; npm run verify. Check loading/error states. No broad rewrite.
Overlap: checked #194,#195,#200,#202,#189,#166,#135,#82; owned source paths do not overlap.

Scope update: browser RED exposed pre-existing unsupported oklch export failure. Also own package.json/package-lock.json for html2canvas-pro, a compatible modern-color renderer, isolated to this export. Validate real downloaded PDF and rendered pages.
