# PICC Internal Platform Requirements Matrix

Status meanings:
- `missing`: not built
- `partial`: some code exists but not end-to-end or not to spec
- `implemented`: built in code but not yet fully verified end-to-end
- `verified`: implemented and proven against acceptance criteria
- `blocked`: cannot proceed until an external dependency is resolved

This matrix should be updated after every meaningful implementation batch.

| ID | Domain | Requirement | Source | Current Status | Notes |
|---|---|---|---|---|---|
| IDM-001 | Identity | Canonical account identity graph keyed on `Licensed Location ID` | Original ask + PLAN 6 | implemented | Local mappings and Nabis linkage exist |
| IDM-002 | Identity | Deterministic resolution across account ID, Notion page ID, Nabis retailer ID, license number, aliases | PLAN 6 | partial | Core mapping exists; admin override UX still incomplete |
| IDM-003 | Identity | Admin-editable identity overrides | PLAN 6 | implemented | Admin override API/UI added in settings |
| IDM-004 | Migration | Dry-run-safe Notion vendor-day backfill and reconciliation tooling | PLAN 4/6 | missing | Notion archive sync exists; backfill tool does not |
| AUD-001 | Audit | Append-only immutable audit log | PLAN 4/6 | implemented | AuditEvent model/service exists |
| AUD-002 | Audit | Audit coverage for overrides, assignment changes, policy changes, sync failures, credits, payroll | PLAN 4/6 | partial | Some actions logged, not all downstream domains exist |
| POL-001 | Policy | Policy snapshot model with locked assignment references | PLAN 4/6 | implemented | Snapshot model and assignment linkage exist |
| POL-002 | Policy | Admin policy management UI/API | PLAN 6 | implemented | Admin settings API/UI can create policy snapshots |
| POL-003 | Policy | Policy changelog surfaced to admin | PLAN 4/6 | implemented | Policy history now rendered in admin settings |
| NAB-001 | Nabis | Retailer sync every 5 minutes into local `NabisRetailer` | PLAN 6 | implemented | Core sync code exists |
| NAB-002 | Nabis | Order sync into local `NabisOrder`/`NabisOrderLine` with incremental refresh | PLAN 6 | implemented | Core sync code exists |
| NAB-003 | Nabis | Daily reconciliation over trailing window | PLAN 6 | partial | Core sync exists; reconciliation behavior needs verification/ops controls |
| NAB-004 | Nabis | Auto-create/update Dispensary Master List CRM from Nabis retailers | PLAN 6 | implemented | Notion CRM sync code exists |
| NAB-005 | Nabis | Preserve human-managed CRM fields and only update system-owned fields | PLAN 6 | partial | Intended in code path, needs stricter verification |
| DASH-001 | Dashboard | Dashboard reads from Postgres, not live Nabis on page view | PLAN 6 | implemented | Switched to local data path |
| DASH-002 | Dashboard | Freshness metadata and manual refresh for admin/ops | PLAN 6 | implemented | Present in dashboard path |
| ROL-001 | Roles | Multi-role grants and active role switching | PLAN 2+ | implemented | Role grants and switching exist |
| ROL-002 | Roles | Bryce-only admin | PLAN 2+ | implemented | Restricted in access/bootstrap |
| ROL-003 | Roles | External operational invite path for outsourced BAs | PLAN 6 | implemented | Invite path exists |
| SUP-001 | Supply | Worker profile with home base, vehicle, employer, phone, photo | Original ask + PLAN 6 | implemented | Worker profile plus normalized employer relation/settings UI added |
| SUP-002 | Supply | Gear tracking | Original ask | implemented | Gear items modeled and editable in worker supply settings |
| SUP-003 | Supply | Certifications and brand training | Original ask | implemented | Certifications and brand training modeled and editable |
| SUP-004 | Supply | Skill tiers/tags and reviews | Original ask | partial | Skill tiers/tags and reviews are modeled; review capture UI still missing |
| SUP-005 | Supply | Employer/service-company billing rules | Original ask + PLAN 1/6 | partial | Employer model exists, but full billing rule logic/export handling is still incomplete |
| AVA-001 | Availability | Google Calendar sync per worker | Original ask + PLAN 6 | partial | Per-worker calendar connection model/status exists; real Google free/busy OAuth sync is still missing |
| AVA-002 | Availability | Manual recurring availability windows | Original ask + PLAN 6 | implemented | Availability rules modeled, editable, and used by matching |
| AVA-003 | Availability | Manual blackout blocks | Original ask + PLAN 6 | implemented | Blackout blocks modeled, editable, and used by matching |
| AVA-004 | Availability | Calendar stale/manual-only fallback surfaced to workers and ops | Addendum + PLAN 6 | implemented | Calendar connection health is now derived from per-worker connection records |
| DEM-001 | Demand | Request creation from rep/BA/admin/ops/store/automation sources | Original ask + PLAN 6 | partial | Core request sources exist, automation incomplete |
| DEM-002 | Demand | 60-day cooldown with request-scoped override and required reason | Latest chat + PLAN 6 | implemented | API and service logic exist |
| DEM-003 | Demand | Automated cadence generation with admin-only thresholds | Original ask + PLAN 6 | missing | No threshold config or generator UI |
| DEM-004 | Demand | Eligibility filter includes suppression flags and active conflict checks | Original ask + PLAN 6 | partial | Conflict checks exist; suppression flags not fully modeled |
| MAT-001 | Matching | Hard filters for availability, travel fit, no conflicts, gear/certs/training | Original ask + PLAN 6 | implemented | Matching now enforces travel fit, manual availability, blackout blocks, and Penny Bundle qualification |
| MAT-002 | Matching | Ranked candidate scoring with travel, availability, skills, workload, rep preference | Original ask + PLAN 6 | partial | Scoring now includes travel, availability, skill fit, workload, and preferred worker; rep-specific preference/self-claim still incomplete |
| DSP-001 | Dispatch | Concurrent offers | PLAN 6 | implemented | First acceptance wins |
| DSP-002 | Dispatch | Pass-off before cutoff and manual exception after cutoff | Addendum + PLAN 6 | implemented | Core flow exists |
| DSP-003 | Dispatch | No-show detection after 30-minute grace period | Addendum + PLAN 6 | implemented | Maintenance job logic exists |
| DSP-004 | Dispatch | Rep approval gate and rep self-claim behavior | Original ask + earlier plans | partial | Rep approval gate now exists; rep self-claim and territory-level defaults still missing |
| DSP-005 | Dispatch | Auto-dispatch configuration per rep/territory | Original ask | missing | Not built |
| EXE-001 | Execution | BA-first mobile workflow for offers/today/detail/check-in/check-out/uploads/pay/history | Original ask + PLAN 6 | partial | Large single workspace exists, not separated into polished role surfaces |
| EXE-002 | Execution | Best-effort GPS with location flags | Addendum + PLAN 6 | implemented | Non-blocking geolocation flow exists |
| EXE-003 | Execution | Offline queued execution/artifacts with sync state | Addendum + PLAN 6 | partial | IndexedDB queue exists; richer sync states and retry UX incomplete |
| EXE-004 | Execution | Setup photo, end photo, checkout notes required | Original ask + PLAN 6 | partial | UI prompts exist; enforcement needs stronger server-side completeness checks |
| EXE-005 | Execution | Context-sensitive micro-training | Original ask | missing | Not built |
| EXE-006 | Execution | Live status board for ops | Original ask | partial | Home page now surfaces live assignment status, but not yet as a real-time map/dot board |
| PEN-001 | Penny Bundle | Enforce no report, no credit | Original ask + later plans | partial | Proof requirement exists in flow direction, downstream credit system incomplete |
| PEN-002 | Penny Bundle | Preserve existing Notion automation and policy constraints | User corrections + plans | partial | Archive and policy mapping exist, full end-to-end credit linkage missing |
| PEN-003 | Penny Bundle | Link vendor-day events to Penny Bundle credit submissions DB | PLAN 3/6 | missing | Relation sync not built |
| SET-001 | Settlement | Locked assignment pay inputs and travel pay snapshot | PLAN 6 | implemented | Stored on assignment |
| SET-002 | Settlement | Payroll line items and batches | Original ask + PLAN 4/6 | implemented | Payroll batches and line items now exist and sync from checked-out assignments |
| SET-003 | Settlement | Finance exports and pay-period closing on 1st/15th | Original ask + PLAN 4/6 | partial | Pay-period batching exists and batches can be marked exported; file export output is still missing |
| SET-004 | Settlement | Worker running balance | Original ask + PLAN 2/6 | implemented | Running balance now comes from payroll line items rather than UI-only sums |
| SET-005 | Settlement | Disputed pay/credit resolution workflow | Addendum + PLAN 4/6 | partial | Payroll dispute state and API are present; credit dispute handling is still missing |
| NOT-001 | Notion | Async idempotent vendor-day archive mirror | PLAN 3/6 | implemented | Core sync exists |
| NOT-002 | Notion | Retry/dead-letter/sync health tooling for archive | PLAN 3/6 | partial | Some sync-run/checkpoint support exists; full ops tooling incomplete |
| NOT-003 | Notion | Backfill historical vendor days from archive into Postgres | PLAN 4/6 | missing | Not built |
| ROI-001 | ROI | 30-day pre/post ROI snapshot model | PLAN 2/3/4/6 | implemented | ROI snapshots now sync from checked-out assignments |
| ROI-002 | ROI | ROI by event/store/BA/rep/employer/territory/brand | Original ask + later plans | partial | Event/store/BA/employer/brand reporting exists; rep/territory drill-through is still incomplete |
| REP-001 | Reporting | Territory, BA utilization, brand-level reporting | Addendum + PLAN 4/6 | partial | BA utilization and brand summaries are now on the reports page; territory-level reporting still missing |
| REP-002 | Reporting | CSV/XLSX export for reports | Addendum + PLAN 4/6 | missing | Not built |
| NTF-001 | Notifications | User notification preferences by category | Addendum + PLAN 4 | implemented | Notification preferences are modeled and editable in worker supply settings |
| NTF-002 | Notifications | Quiet hours with critical-notification exemptions | Addendum + PLAN 4 | partial | Quiet-hours settings exist, but delivery enforcement/exemptions are not wired into sends yet |
| UX-001 | UX | Internal-only root domain | Latest chat | implemented | Root is internal-only |
| UX-002 | UX | Primary nav centered on Home/Map/Accounts/Route/Dashboard | PLAN 2/6 | implemented | Shell changed |
| UX-003 | UX | BA UX must be polished and production-ready before tutorial mode | Latest chat + PLAN 6 | partial | Direction set, execution still rough |
| TST-001 | Verification | Every requirement tied to tests or explicit manual acceptance steps | Working rule | missing | This matrix/checklist is being created now |

## Usage Rule
- No feature may be called complete unless its row is moved to `verified`.
- Every code change should update affected row statuses and notes.
