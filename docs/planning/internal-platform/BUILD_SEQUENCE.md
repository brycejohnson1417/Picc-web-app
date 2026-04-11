# PICC Internal Platform Build Sequence

## How Work Must Proceed
This file defines the execution method so the build can continue without losing scope.

## Non-Negotiable Workflow Rules
1. Start every work session by reading:
   - `MASTER_SPEC.md`
   - `SUPERSEDED_DECISIONS.md`
   - `REQUIREMENTS_MATRIX.md`
   - `BUILD_SEQUENCE.md`
   - `ACCEPTANCE_CHECKLIST.md`
2. Do not rely on chat memory as the backlog.
3. Do not start a later phase until all critical requirements in the current phase are at least `implemented`.
4. Do not claim anything is finished until the relevant acceptance criteria are proven.
5. After each implementation batch:
   - update the requirement rows touched
   - note what changed
   - note what remains unverified
6. If a requirement changes, update the spec files first, then code.
7. Use subagents only with explicit requirement-ID bundles and disjoint write scopes.

## Execution Order

### Priority Override — April 11, 2026
Before continuing deeper scheduling/automation work, prioritize:
- internal navigation cleanup
- BA-first `Offers` / `Today` / `Assignment Detail` / `Check In` / `Check Out` / `Uploads` / `Pay` / `History` UX
- production-ready vendor-day execution flow for ambassadors already working live events

This priority override takes precedence over finishing every upstream scheduling feature first.

### Phase 0 — Canonical Foundation
Goal: ensure the data and operating substrate are trustworthy.

Requirements:
- IDM-001
- IDM-002
- IDM-003
- IDM-004
- AUD-001
- AUD-002
- POL-001
- POL-002
- POL-003
- NAB-001
- NAB-002
- NAB-003
- NAB-004
- NAB-005
- DASH-001
- DASH-002

Exit criteria:
- identity resolution is deterministic
- audit events cover the critical actions
- policy snapshots are attached where needed
- Nabis sync is local-first and CRM sync is stable
- database and Prisma are aligned

### Phase 1 — Roles, Supply, And Navigation
Goal: make user access and worker supply real before deep dispatch logic.

Requirements:
- ROL-001
- ROL-002
- ROL-003
- SUP-001
- SUP-002
- SUP-003
- SUP-004
- SUP-005
- AVA-001
- AVA-002
- AVA-003
- AVA-004
- UX-001
- UX-002
- UX-003

Exit criteria:
- worker supply data is modeled properly
- calendar/manual availability is real, not stubbed
- BA-related access is correct
- internal navigation is stable and role-aware

### Phase 2 — Demand And Dispatch
Goal: build the true upstream queueing, approval, and matching system.

Requirements:
- DEM-001
- DEM-002
- DEM-003
- DEM-004
- MAT-001
- MAT-002
- DSP-001
- DSP-002
- DSP-003
- DSP-004
- DSP-005

Exit criteria:
- requests can originate through all intended channels
- matching uses real worker constraints
- dispatch honors approvals, overrides, pass-off, and no-show logic

### Phase 3 — BA Execution And Penny Bundle
Goal: ship the operational BA workflow end-to-end.

Requirements:
- EXE-001
- EXE-002
- EXE-003
- EXE-004
- EXE-005
- EXE-006
- PEN-001
- PEN-002
- PEN-003

Exit criteria:
- BA can accept, prepare, check in, upload proof, check out, and recover from offline/geolocation issues
- Penny Bundle flow is policy-compliant and linked downstream

### Phase 4 — Settlement And Archive
Goal: complete proof, payroll, and archive integrity.

Requirements:
- SET-001
- SET-002
- SET-003
- SET-004
- SET-005
- NOT-001
- NOT-002
- NOT-003

Exit criteria:
- pay is batchable and exportable
- running balances are correct
- Notion archive is reliable and historical backfill exists

### Phase 5 — ROI, Reporting, And Operational Proof
Goal: deliver the full management system, not just dispatch mechanics.

Requirements:
- ROI-001
- ROI-002
- REP-001
- REP-002
- NTF-001
- NTF-002
- TST-001

Exit criteria:
- ROI is computable and visible
- reports are exportable
- notifications behave by preference and quiet hours
- all critical checklist items are proven

## Subagent Protocol
When using subagents:
- Assign explicit requirement IDs.
- Assign explicit file ownership.
- Require the subagent to report:
  - requirement IDs covered
  - files changed
  - what remains
  - what was verified
- Never treat “code was written” as completion.

## Session Update Protocol
At the end of each work session:
1. Update `REQUIREMENTS_MATRIX.md`
2. Update `ACCEPTANCE_CHECKLIST.md` items that are now proven
3. If scope changed, update `MASTER_SPEC.md` and `SUPERSEDED_DECISIONS.md`
4. Summarize the exact remaining blockers
