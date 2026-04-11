# PICC Internal Platform Acceptance Checklist

This is the end-to-end proof checklist. A box is only considered complete when the flow has been exercised successfully, not when code merely exists.

## Platform
- [ ] Visiting `piccnewyork.org` leads only to the internal app flow.
- [ ] Unauthenticated users are sent to sign-in.
- [ ] Bryce is the only admin.
- [ ] Users can switch only among roles they actually hold.
- [ ] External invited BAs can sign in and operate without `@piccplatform.com`.

## Nabis And CRM
- [ ] A Nabis retailer with a new `Licensed Location ID` is synced locally.
- [ ] That retailer is created in the Dispensary Master List CRM if missing.
- [ ] Human-managed CRM fields are preserved during sync.
- [ ] Dashboard reads from local Postgres data and shows freshness timestamps.
- [ ] Orders attach to the correct store through the identity graph.

## Supply And Availability
- [ ] A worker profile can be created with home address, travel settings, vehicle, and employer.
- [ ] Gear inventory can be tracked for a worker.
- [ ] Certifications and brand training can be assigned to a worker.
- [ ] Google Calendar free/busy affects worker availability.
- [ ] Manual recurring availability windows affect worker availability.
- [ ] Manual blackout blocks affect worker availability.
- [ ] Stale/broken calendar sync is surfaced correctly to worker and ops.

## Demand
- [ ] A rep can create a vendor-day request.
- [ ] A rep can use `Override 60-Day Window` with a required reason.
- [ ] A BA can request a vendor day.
- [ ] A 4-hour request is held for admin approval.
- [ ] Automated cadence generation can create a queue item from configured thresholds.
- [ ] Ineligible stores are prevented from creating conflicting requests.

## Dispatch
- [ ] A dispatch-ready request sends concurrent offers to all eligible BAs.
- [ ] The first BA acceptance locks the assignment and withdraws all other offers.
- [ ] A BA can decline an offer.
- [ ] A BA can pass off before cutoff.
- [ ] Pass-off after cutoff is blocked and escalated.
- [ ] A no-show is flagged after the configured grace period.
- [ ] Dispatch respects worker availability, conflicts, and supply constraints.

## Brand Ambassador Day-Of Flow
- [ ] BA has a clean mobile-first `Offers` view.
- [ ] BA has a clean mobile-first `Today` view.
- [ ] BA can open assignment detail with store context.
- [ ] BA can check in with best-effort GPS.
- [ ] BA can still check in if GPS is denied/unavailable.
- [ ] BA can upload a setup photo.
- [ ] BA can work offline and queue actions/artifacts.
- [ ] BA can check out with required fields.
- [ ] BA cannot complete a Penny Bundle event without POS proof.
- [ ] Queued artifacts sync successfully when connectivity returns.

## Penny Bundle
- [ ] Excluded brands are blocked.
- [ ] No-report/no-credit is enforced.
- [ ] Existing Notion downstream credit process is preserved.
- [ ] Existing Notion email automation is preserved.
- [ ] Vendor-day event is linked to Penny Bundle credit submission records.

## Settlement
- [ ] Event pay is calculated from the locked policy snapshot.
- [ ] Travel pay is added when one-way travel exceeds 60 minutes.
- [ ] Running balance is visible to the BA from actual settlement records.
- [ ] Payroll batches can be generated for the 1st and 15th.
- [ ] Finance export is clean and correct.
- [ ] Disputed pay/credit lines can be resolved.

## Notion Vendor Day Archive
- [ ] New vendor-day lifecycle records create/update the correct Notion archive page.
- [ ] Archive sync is idempotent.
- [ ] Existing Notion views continue to work.
- [ ] Failed syncs are retryable and visible to ops/admin.
- [ ] Historical vendor days can be backfilled from Notion with a dry-run path.

## ROI And Reporting
- [ ] 30-day pre/post ROI is computed for an event.
- [ ] ROI can be viewed by event, store, BA, rep, employer, territory, and brand.
- [ ] Territory reports are available.
- [ ] BA utilization reports are available.
- [ ] Brand-level summaries are available.
- [ ] Reports support CSV/XLSX export.

## Notifications
- [ ] Users can configure notification preferences by category.
- [ ] Quiet hours suppress non-critical notifications.
- [ ] Critical notifications bypass quiet hours.

## Final Project Proof
- [ ] Every critical requirement row in `REQUIREMENTS_MATRIX.md` is `verified`.
- [ ] The database schema, Prisma schema, and application code are aligned.
- [ ] The documented spec matches the actual product behavior.
