# PICC Internal Platform Master Spec

## Purpose
This file is the canonical product and implementation spec for the PICC internal platform build inside `/Users/brycejohnson/Documents/New project/Picc-web-app`.

It exists to prevent scope loss, chat-memory drift, and regressions caused by plan revisions over time.

## Source Precedence
When sources disagree, use this precedence order:

1. Latest explicit user instruction in chat
2. This `MASTER_SPEC.md`
3. `PLAN 6.md`
4. `PLAN 5.md`
5. `PLAN 4.md`
6. `PLAN 3.md`
7. `PLAN 2.md`
8. `PLAN 1.md`
9. Original ask

Any newly superseded decision must also be added to `SUPERSEDED_DECISIONS.md`.

## Product Direction
- `piccnewyork.org` is the internal app only.
- Public PICC New York Wholesale/store-locator/upcoming-vendor-day experiences are deferred and must not be served from the root domain.
- The canonical app is the Next.js PWA in this repo.
- Postgres is the operational source of truth.
- Notion is the CRM-connected mirror/archive layer, not the dispatch engine.
- Nabis retailer and order sync is foundational and must be continuously reconciled into Postgres and CRM.

## Locked Business Rules
- Vendor-day cooldown is 60 days by default.
- Reps and admins can bypass cooldown with a one-time request-scoped `Override 60-Day Window` action plus required reason.
- Standard vendor-day duration is 3 hours.
- A 4-hour vendor day requires explicit admin approval.
- BA offer acceptance window defaults to 4 hours and is policy-configurable.
- Event labor pay defaults to `$50/hour`.
- If one-way travel time exceeds 60 minutes, pay `$25/hour` for the full round-trip travel time.
- GPS is best-effort only; failed geolocation must not block check-in or checkout.
- Offline artifact capture is supported; queued artifacts must sync when connectivity returns.
- Tutorial mode is deferred until after the core BA workflow is fully production-ready.
- Bryce is the only `ADMIN`.

## Core System Goals
- Determine which stores need vendor days from CRM data, cadence logic, and Nabis order behavior.
- Determine which BAs are eligible, available, nearby, equipped, and trained.
- Auto-match and dispatch the right BA to the right store at the right time.
- Capture day-of execution with proof, prompts, and compliance guardrails.
- Process Penny Bundle proof and credit workflow.
- Produce payroll, exports, and ROI reporting without relying on manual spreadsheets.

## Functional Scope

### 1. Identity, Audit, And Policy
- Maintain a formal account identity graph keyed on `Licensed Location ID`.
- Support mappings across local account ID, Notion page ID, Nabis retailer ID, license number, and aliases.
- Allow admin-editable override mappings.
- Maintain append-only immutable audit events.
- Store policy snapshots and attach them to requests, assignments, payroll, and ROI calculations.

### 2. Nabis Retailer And Order Sync
- Poll Nabis retailers and orders on a recurring cadence.
- Create/update local `NabisRetailer` rows keyed by `Licensed Location ID`.
- Create/update CRM pages in the Dispensary Master List when Nabis retailers appear.
- Keep dashboard reads local to Postgres, not live-fetching Nabis on page load.
- Track freshness metadata and reconciliation health.

### 3. Worker Supply System
- Maintain BA/worker records including:
  - name
  - photo
  - phone
  - home address
  - home coordinates
  - vehicle flag/type
  - employer
  - travel radius / travel minutes
  - notes
- Maintain supply-side operational metadata including:
  - gear inventory
  - certifications
  - brand training
  - skill tier / tags
  - store reviews / feedback
  - service-company support under the same worker model with different billing rules
- Maintain worker availability from:
  - Google Calendar free/busy sync
  - manual recurring availability windows
  - manual blackout blocks

### 4. Roles And Access
- Support multi-role grants per user.
- Only show mode switching for assigned roles.
- Support invited external operational users with full `BRAND_AMBASSADOR` access.
- Keep guest invites read-only only.
- Keep Bryce as the only admin.

### 5. Demand Engine
- Allow vendor-day requests from:
  - sales rep
  - brand ambassador
  - ops/admin
  - automated cadence generation
  - store-request flow
- Enforce eligibility:
  - active customer or explicit override path
  - no suppression flags
  - no conflicting live request/event
  - cooldown satisfied unless overridden
- Compute request priority from:
  - days since last vendor day
  - order velocity
  - account value / revenue
  - never-had-vendor-day status
  - rep request flag
  - reorder potential
  - PPP / preferred partner
- Keep automated threshold configuration admin-only and policy-versioned.

### 6. Matching And Dispatch
- Use concurrent offers, not sequential offers.
- Filter candidates by:
  - availability
  - travel fit
  - no conflict
  - gear/certification/training requirements
  - coverage rules
- Rank candidates for visibility and fallback by:
  - travel time
  - availability fit
  - skill / gear fit
  - workload balance
  - rep preference
- Support rep approval and rep self-claim behavior.
- Support pass-off before cutoff and exception handling after cutoff.
- Support no-show detection after grace period.
- Maintain explicit request/offer/assignment/execution states including:
  - `passed_off`
  - `no_show`
  - `exception`
  - `disputed`

### 7. Brand Ambassador Execution
- Provide distinct BA-first surfaces for:
  - offers
  - today
  - assignment detail
  - check in
  - check out
  - uploads
  - pay
  - history
- Require setup photo at check-in.
- Require end photo and checkout notes at check-out.
- If Penny Bundle ran, require at least one POS-proof artifact before completion.
- Support proof upload types:
  - CSV
  - XLS / XLSX
  - PDF
  - screenshot
  - photo
- Support offline queueing of actions and artifacts in IndexedDB.
- Mark execution state correctly when geolocation is unavailable or distance is suspicious.

### 8. Penny Bundle And Credits
- Preserve the current Notion-based Penny Bundle downstream process.
- Preserve current Notion email automation behavior.
- Enforce:
  - no samples
  - no free promo units
  - excluded brands blocked
  - no report, no credit
- Link vendor-day events to Penny Bundle credit submissions and workflow status.

### 9. Settlement And Payroll
- Calculate event pay from locked assignment duration and policy snapshot.
- Calculate travel pay from locked travel estimate and policy snapshot.
- Support payroll batches closing on the 1st and 15th.
- Provide worker running balances.
- Provide finance-ready exports.
- Track disputed pay/credit lines through resolution.

### 10. Notion Vendor Day Archive
- Mirror vendor-day lifecycle into the Notion `🗂️ Vendor Day Events` archive.
- Keep archive writes asynchronous, retryable, and idempotent.
- Backfill existing Notion vendor-day history into Postgres with dry-run capability.
- Keep the property mapping stable enough for existing Notion views to continue working.

### 11. ROI And Reporting
- Compute default 30-day pre/post event ROI.
- Report by:
  - event
  - store
  - BA
  - rep
  - employer
  - territory
  - brand
- Include at least:
  - order-count lift
  - revenue lift
  - first reorder lag
  - Penny Bundle credit exposure
  - labor cost
  - travel cost
  - service-company cost
  - revenue-based ROI multiple
- Provide CSV/XLSX export where required.

## UX Principles
- The app should feel like Uber for reps, BAs, admin, ops, and finance.
- Internal navigation should emphasize frequently used operational surfaces, not settings.
- BA workflow must be especially polished, mobile-first, low-friction, and idiot-proof.
- Do not ship tutorial mode before the core workflow itself is cohesive enough to stand on its own.
- Immediate build priority is BA execution UX and internal navigation polish before deeper scheduling automation. Ambassadors should be able to use the app for real vendor days as soon as possible, even if some upstream scheduling/automation work still lags behind.

## Definition Of Done
The project is not done when code exists. It is only done when:

1. Every requirement in `REQUIREMENTS_MATRIX.md` is at least `implemented`.
2. All critical requirements are `verified`.
3. `ACCEPTANCE_CHECKLIST.md` is fully proven end-to-end.
4. Schema, code, and deployed database are aligned.
5. Notion and Nabis integrations operate through the intended local-sync architecture.
6. The repo documents reflect the actual built state.
