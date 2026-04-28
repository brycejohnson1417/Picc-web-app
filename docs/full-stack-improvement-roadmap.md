# PICC Web App Full-Stack Improvement Roadmap

Date: 2026-04-28

Companion docs:

- `docs/frontend-ux-audit.md`
- `docs/ghl-bizly-integration-audit.md`

Scope:

- Review of the current production app behavior, local repo structure, sync architecture, API routes, Prisma schema, and current HighLevel API docs.
- No code changes, no schema changes, no external writes, and no production data mutation.
- This is a planning/audit artifact for prioritizing future PRs.

Working assumptions:

- `piccnewyork.org` remains the production internal app.
- The old app should receive surgical, individually revertable fixes.
- Do not make GHL authoritative yet. Treat GHL as a downstream communication/CRM surface, with inbound changes queued for review until trust is proven.
- Keep account identity anchored on `Licensed Location ID` where possible.
- Preserve the existing rule: no Notion, Neon, GHL, Nabis, or Vercel writes without explicit approval.

Current HighLevel doc references:

- HighLevel API docs: https://marketplace.gohighlevel.com/docs/
- Private Integrations: https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know
- API support / rate limits / V1 deprecation: https://help.gohighlevel.com/support/solutions/articles/48001060529
- Contacts API: https://marketplace.gohighlevel.com/docs/ghl/contacts/contacts-api/index.html
- Contact upsert: https://marketplace.gohighlevel.com/docs/ghl/contacts/upsert-contact/index.html
- Contact create: https://marketplace.gohighlevel.com/docs/ghl/contacts/create-contact/index.html
- Contact search: https://marketplace.gohighlevel.com/docs/ghl/contacts/search/index.html
- Get contacts by business ID: https://marketplace.gohighlevel.com/docs/ghl/contacts/get-contacts-by-business-id/index.html
- Add/remove contacts from business: https://marketplace.gohighlevel.com/docs/ghl/contacts/add-remove-contact-from-business/index.html
- Companies/business scopes: https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html
- Webhook events: https://marketplace.gohighlevel.com/docs/category/webhook/index.html

## Current Architecture Reality

The repo already has a stronger foundation than the visible UI suggests:

- `IntegrationProvider` already includes `GHL`.
- `IntegrationConnection`, `ExternalRecordMap`, `SyncCheckpoint`, and `SyncRun` already exist.
- Account identity mapping exists through `AccountIdentityMapping`.
- Nabis sync already uses the sync framework and writes local Postgres rows.
- Notion territory data is cached in `NotionCacheSnapshot` and also mirrored into `TerritoryStoreReadModel`.
- Accounts UI reads from `/api/territory/stores`, not from the local `/api/accounts` route.
- Contacts page reads from `loadLiveNotionContacts()`, which pulls a cached Notion contacts snapshot, not from the local `Contact` table.
- The app has local Account/Contact models, but the production user-facing account/contact surfaces still lean heavily on Notion-derived read models.
- `data-tools` exists as the right home for dry-run/apply data jobs that should not pollute the app repo.

The biggest architecture issue is not missing tables. It is that different screens are reading different "truth layers." Accounts, contacts, territory, Nabis, local CRM routes, and Notion mirrors are all partly real, but not unified through one explicit runtime data contract.

## Highest-Leverage Direction

The app should move toward this shape:

1. Postgres is the app runtime source.
2. Notion is an archive, workflow mirror, and human-friendly review surface.
3. Nabis is a polled source for orders/retailers.
4. GHL is a downstream communications CRM plus optional inbound signal source.
5. All external systems connect through sync jobs, checkpoints, external ID maps, audit events, and review queues.
6. The frontend never needs to know whether a row came from Notion, Nabis, or GHL. It should see one clean account/contact contract plus freshness metadata.

## Immediate Engineering Findings

1. Account and contact source-of-truth is split.
   - Accounts page reads territory stores from the Notion/PostGIS read model.
   - Contacts page reads a Notion contacts cache.
   - `/api/accounts` and `/api/contacts` read/write local Prisma models, but those are not clearly the same records shown in the main mobile flows.
   - Fix: create an explicit `runtime account/contact read contract`, then move user-facing screens to that contract.

2. Some route handlers still use ad hoc validation.
   - Good: several routes use Zod and route error helpers.
   - Weak: routes such as appointments/opportunities parse directly and can throw less consistent responses.
   - Fix: standardize `parseJsonBody`, role guard, cache headers, and public error responses across all API routes.

3. In-memory route caches are useful but fragile in serverless.
   - `Map` caches exist in API routes for territory and dashboard responses.
   - These do not survive serverless instance rotation and can produce uneven behavior.
   - Fix: use short-lived in-memory cache only as an optimization, never as the main freshness contract. Put canonical freshness in DB-backed `SyncCheckpoint` / read-model rows.

4. Sync status exists but is not yet a real ops dashboard.
   - `/api/sync/status` returns recent sync runs.
   - `TerritoryAdminSyncControls` exposes territory refresh/audit.
   - The UI does not yet give a unified "what is stale, what failed, what can I retry" control room.
   - Fix: build a single Integration Health surface in Settings.

5. Local setup is still too brittle.
   - `prisma validate` fails without `DATABASE_URL`; it passes when a dummy local URL is provided.
   - Local dev previously failed because `localhost:5432` had no database listener.
   - Fix: add a documented local Postgres path or a one-command dev bootstrap. Do not let every local audit rediscover this.

6. Performance docs are placeholders.
   - `docs/perf/baseline.md` and `docs/perf/final.md` still contain TODOs.
   - Fix: capture real baseline metrics before frontend refactors: route payload sizes, P50/P95, bundle chunks, map load time, account detail time, and sync lag.

7. Several large components should be split before more features are added.
   - High-risk files include `account-detail-sheet.tsx`, `route-mobile.tsx`, `territory-mobile.tsx`, `settings-mobile.tsx`, and `worker-supply-panel.tsx`.
   - Fix: split by state controller, view primitives, dialogs/sheets, and service hooks only when actively working in that surface.

8. Observability is still light.
   - There is a structured logger, but many critical flows use console logging or local UI messages.
   - Fix: route errors, sync failures, API latency, webhook payload outcomes, and external write results should be structured and queryable.

9. Hydration error needs urgent root cause.
   - Production had repeated React hydration error `#418`.
   - Fix: reproduce in development/prod parity, isolate server/client markup mismatch, and make it the first technical quality PR.

10. The current GHL connector can read contacts but not businesses.
    - A HighLevel contacts query returned current contact records and metadata.
    - A HighLevel business query returned `401` with an auth/scope message.
    - Fix: update GHL private integration scopes before attempting account/business sync.

## Backend Improvements

### Data Model

- Add a clear account/contact runtime contract independent of vendor shapes.
- Add GHL external maps using existing `ExternalRecordMap`:
  - `provider = GHL`
  - `localModel = Account`
  - `externalId = ghl businessId`
  - `localModel = Contact`
  - `externalId = ghl contactId`
- Consider adding optional `GHL_BUSINESS_ID` and `GHL_CONTACT_ID` identity types only if lookup ergonomics require it. Prefer `ExternalRecordMap` first.
- Store external sync metadata in `SyncCheckpoint.metadata`, not scattered app state.
- Add `sourceUpdatedAt`, `lastSyncedToGhlAt`, and `lastGhlInboundAt` to a read model or metadata payload before adding columns to core models.
- Create a conflict/review model before bidirectional sync:
  - entity type
  - local ID
  - external provider
  - external ID
  - field name
  - local value
  - external value
  - suggested action
  - status

### API Layer

- Standardize route handler shape:
  - role guard
  - Zod input
  - typed service call
  - public error mapping
  - cache headers
  - audit event when mutating
- Add request IDs to API responses and logs.
- Add `X-Data-Source`, `X-Data-Freshness`, and `X-Sync-Checkpoint` headers on data-heavy routes.
- Add consistent pagination for account/contact/task/report APIs.
- Avoid returning raw Prisma models directly from public app APIs; return view DTOs.
- Add stable search endpoints:
  - `/api/search/accounts`
  - `/api/search/contacts`
  - `/api/search/global`
- Put admin-only external sync controls under `/api/integrations/*`, not mixed into generic CRM routes.

### Sync Engine

- Use one pattern for every external sync:
  - `IntegrationConnection`
  - `SyncRun`
  - `SyncCheckpoint`
  - `ExternalRecordMap`
  - `AuditEvent`
  - dry-run result
  - apply result
- Add advisory locking or single-flight DB locks for each provider/module.
- Add idempotency keys per external record write.
- Add rate-limit backoff that reads provider headers.
- Add per-record result logging:
  - read
  - created
  - updated
  - skipped
  - conflict
  - errored
- Add a dead-letter queue for failed webhook/sync items.
- Separate scheduled sync from manual force refresh.
- Incremental sync should be the default; full rebuilds should be admin-only.
- Add "preview changes" before any external write.

### Notion Sync

- Move contacts into a local read model, not only `NotionCacheSnapshot`.
- Let Notion webhooks queue specific page refreshes for accounts and contacts.
- Show Notion lag per dataset: territory accounts, contacts, vendor-day archive, check-ins.
- Stop relying on full database scans for normal freshness.
- Keep reverse-link issues visible: if relations are not paired in Notion, surface that as a data-contract warning instead of silently accepting it.

### Nabis Sync

- Keep Nabis reads local-first on dashboards.
- Add visible job detail for:
  - retailers last successful sync
  - orders last successful sync
  - reconciliation last successful run
  - rows read/upserted/errored
  - provider rate-limit state
- Add trailing-window reconciliation status and failure reason.
- Add source identity review when Nabis retailer classification is uncertain.
- Make invoice/document gaps visible as vendor limitations, not missing UI.

### Local Development

- Add a local DB bootstrap path:
  - Docker Compose Postgres/PostGIS
  - `npm run db:dev`
  - `npm run db:reset`
  - seed with safe demo data
- Add `.env.local.example` that is shell-safe and clearly separates required vs optional vars.
- Add `npm run verify` that runs lint, typecheck, tests, Prisma validate with a safe placeholder URL, and optionally build.
- Add a local smoke mode that does not require real Notion/GHL/Nabis credentials.

## Frontend Improvements

### Shell And Navigation

- Fix bottom nav overlap first.
- Add an `All Tools` or command/search button so hidden surfaces are discoverable.
- Make the header status-aware:
  - current role
  - data freshness
  - command/search
  - profile/settings
- Use role-aware navigation without making each role feel like a different app.

### Loading And Perceived Performance

- Replace generic spinners with page-specific skeletons.
- Persist React Query cache for account/territory read views.
- Preload account detail when a list row becomes visible or hovered.
- Virtualize long account/contact lists.
- Debounce search, but show immediate "searching" state and result counts.
- Use route-level loading states that match final layout.
- Use optimistic UI for:
  - filter apply
  - route add/remove
  - saved route save/delete
  - layer visibility
  - check-in create
- Add offline-aware banners for field reps.

### Accounts And Contacts

- Collapse advanced filters behind a sheet.
- Show account rows in the first viewport.
- Add result count and active filter chips.
- Add account/contact freshness chips.
- Add "Open in Notion" and "Open in GHL" only when external maps exist.
- Add contact quality flags:
  - missing phone
  - missing email
  - duplicate candidate
  - no linked account
  - inactive account
- Add a contact/account merge review flow before syncing to GHL.

### Route Planning

- Replace hero empty state with operational builder state.
- Add recent routes and suggested routes.
- Add "near me" and "needs follow-up today" route starters.
- Add drag-to-reorder with tactile feedback.
- Add visible travel mode and optimize mode.
- Store route launch history for rep reporting.

### Map

- Add marker clustering.
- Add selected-account dimming and focus.
- Add compact legend.
- Add territory health overlays:
  - stale follow-up
  - no recent order
  - preferred partner
  - no contact
  - vendor day eligible
- Add saved map views by role/user.

### Dashboard And Reports

- Create one reusable freshness banner.
- Show sync failure reason and retry eligibility.
- Turn zero reports into real empty states.
- Add CSV/XLSX export for reports.
- Add territory-level and rep-level drilldowns.
- Add a report builder for common date windows:
  - last 7 days
  - current month
  - trailing 30
  - pre/post vendor day

### Settings

- Replace marketing hero with a dense control index.
- Add `Integrations` section:
  - Notion
  - Nabis
  - GHL
  - Google Maps
  - Google Calendar
- Each integration card should show:
  - connected/disconnected
  - scopes
  - last success
  - last failure
  - queued changes
  - dry-run button
  - apply button gated by role
  - logs/detail drawer
- Add token rotation reminders for private integration tokens.

## New Product Ideas

### Near-Term Needle Movers

- Next Best Action per account.
- Contact health score per account.
- Route suggestions from follow-up urgency plus geography.
- GHL duplicate/contact hygiene queue.
- Stale data control center.
- Account timeline combining check-ins, orders, contacts, vendor days, and GHL interactions.
- Rep command center: today, follow-ups, hot accounts, current route, stale stores.
- Ops command center: sync health, vendor-day queue, no-shows, pending approvals, stale integrations.
- Store profile "one-page brief" for reps before visiting.
- Contact capture from route/account detail with required role/source/account link.

### Bigger Bets

- GHL conversation mirror into account timeline.
- Automatic GHL campaign enrollment from account status or follow-up state.
- AI visit prep: account summary, last order, last contact, objections, recommended pitch.
- AI post-visit note cleanup into structured follow-up.
- Vendor-day eligibility engine surfaced on map and account detail.
- Territory performance heatmap.
- Rep-to-account ownership quality dashboard.
- Data quality inbox with merge, ignore, map, and create actions.
- Source-of-truth inspector: why the app believes an account/contact field has its current value.

## Go High Level Integration Plan

### The Correct Shape

Use GHL for:

- contact records
- business/company association
- call/SMS/email workflows
- campaign enrollment
- external lead capture
- downstream communication history

Do not use GHL for:

- canonical licensed-location identity
- Nabis order truth
- vendor-day dispatch truth
- payroll/ROI truth
- territory geospatial truth

### GHL Access Requirements

For a private internal integration, a HighLevel Private Integration Token is appropriate. Current docs describe private integrations as a secure internal-tool option with selectable scopes, and API V2 should be used rather than legacy V1.

Minimum scopes to request:

- `contacts.readonly`
- `contacts.write`
- `businesses.readonly`
- `businesses.write`
- likely custom fields read/write depending on final field strategy
- webhook events for contacts and associations, if inbound sync is enabled

Current connector evidence:

- Contact read works and returned a contacts page with a total count.
- Business access failed with a scope/auth `401`, so account/business sync is blocked until GHL permissions are updated.

### Field Mapping

Account to GHL business:

| PICC field | GHL target | Notes |
|---|---|---|
| `Account.name` / territory store name | business/company name | Required display field |
| `address1`, `city`, `state`, `zipcode` | business address fields or custom fields | Use normalized address |
| `phone` | business phone if supported, else custom field | Preserve contact phones separately |
| `licenseNumber` | custom field `picc_license_number` | Strong dedupe support |
| `licensedLocationId` | custom field `picc_licensed_location_id` | Best canonical key |
| `notionPageId` | custom field `picc_notion_page_id` | Debug/trace |
| `nabisRetailerId` | custom field `picc_nabis_retailer_id` | Debug/trace |
| account status | custom field or tag | Avoid overwriting manual lifecycle fields |
| rep assignment | custom field or tag | Must match GHL user strategy before writing |
| PPP/headset status | custom fields | Useful for campaigns |
| last order / vendor day | custom fields | Read-only summary from PICC |

Contact to GHL contact:

| PICC field | GHL target | Notes |
|---|---|---|
| first/last name | `firstName`, `lastName` | Split carefully when Notion only has full name |
| email | `email` | Primary dedupe when present |
| phone | `phone` | Normalize to E.164 when possible |
| account external map | `businessId` association | Use GHL business mapping |
| account name | `companyName` fallback | Only fallback when `businessId` is missing |
| role title | custom field `picc_contact_role` | Preserve store role |
| source / linked work | custom field or tag | Example: Nabis POC, billing AP, CRM contact |
| Notion contact page ID | custom field `picc_notion_contact_page_id` | Debug/trace |
| local contact ID | custom field `picc_contact_id` | Debug/trace |

Tags to consider:

- `picc-app`
- `picc-account`
- `picc-contact`
- `picc-preferred-partner`
- `picc-nabis-poc`
- `picc-billing-ap`
- `picc-needs-review`

### Matching Rules

Account/business matching priority:

1. Existing `ExternalRecordMap` for GHL business.
2. GHL custom field `picc_licensed_location_id`.
3. GHL custom field `picc_license_number`.
4. Exact normalized business name plus city/state.
5. Manual review.

Contact matching priority:

1. Existing `ExternalRecordMap` for GHL contact.
2. GHL custom field `picc_notion_contact_page_id`.
3. Email match within same business/account.
4. Phone match within same business/account.
5. Name plus business match.
6. Manual review.

Do not auto-match:

- same email across multiple dispensaries
- same phone across multiple dispensaries
- missing email and phone
- conflicting `businessId`
- GHL contact marked DND with a PICC contact that wants messaging
- inactive/deleted GHL records

### Sync Direction

Phase 1 should be outbound-only:

- PICC/Notion/Postgres -> GHL
- dry-run first
- human review of creates/updates/conflicts
- apply only approved changes

Phase 2 can ingest inbound signals:

- GHL contact created/updated/deleted webhook
- GHL association events
- GHL tag changes
- queue as suggestions
- do not overwrite local/Notion fields automatically

Bidirectional automatic sync should wait until duplicate rules and field ownership are proven.

### Backend Modules To Add

Suggested files:

- `lib/server/highlevel/client.ts`
- `lib/server/highlevel/types.ts`
- `lib/server/highlevel/mapping.ts`
- `lib/server/highlevel/match.ts`
- `lib/server/highlevel/sync.ts`
- `app/api/integrations/highlevel/status/route.ts`
- `app/api/integrations/highlevel/dry-run/route.ts`
- `app/api/integrations/highlevel/apply/route.ts`
- `app/api/webhooks/highlevel/route.ts`

If this becomes broader than the old app should carry, put batch tooling in `/Users/brycejohnson/Code/data-tools` and keep only the app runtime/status UI in `PICC-Web-App`.

### UI To Add

Settings -> Integrations -> Go High Level:

- Connection status
- Token/scopes checklist
- Location ID
- Last contact sync
- Last business sync
- Last inbound webhook
- Dry-run button
- Apply approved changes button
- Field mapping editor
- Conflict review queue
- Sync log drawer
- Token rotation reminder

Accounts:

- GHL status badge
- Open in GHL
- Last synced to GHL
- Needs review badge
- "Sync to GHL" admin action when eligible

Contacts:

- GHL status badge
- linked business/account
- DND state
- duplicate candidate badge
- missing phone/email badge
- source tag

### Dry-Run Output

A dry-run should produce:

- accounts read
- contacts read
- GHL businesses read
- GHL contacts read
- matched accounts
- matched contacts
- proposed business creates
- proposed business updates
- proposed contact creates
- proposed contact updates
- proposed associations
- skipped records
- conflicts
- required scope failures
- estimated API calls
- rate-limit state

No writes should occur in dry-run.

### Apply Rules

- Apply only a named dry-run artifact or stored review batch.
- Require admin role.
- Require explicit checkbox/confirmation in UI.
- Write `SyncRun` and `AuditEvent`.
- Upsert `ExternalRecordMap` after successful external write.
- Never delete GHL records automatically. Use tags/status only.
- Preserve GHL DND settings.
- Preserve manually owned GHL fields.
- On partial failure, retry only failed records with idempotency.

### Webhook Rules

- Add `/api/webhooks/highlevel`.
- Verify webhook authenticity based on the current HighLevel webhook signing method for the installed app/private integration.
- Store inbound payloads before processing.
- Deduplicate by provider event ID when available.
- Convert inbound changes into review suggestions.
- Show inbound conflict queue in Settings.
- Never let inbound GHL contact updates silently break account/contact identity.

## Priority PR Sequence

1. Hydration error root cause.
2. Bottom nav safe-area/layout contract.
3. Local DB bootstrap and `npm run verify`.
4. Real performance baseline docs.
5. Integration Health page using existing `SyncRun` and `SyncCheckpoint`.
6. Contacts/account read-model unification plan.
7. GHL dry-run client in `data-tools` or app server with no writes.
8. GHL settings UI showing scopes/status and dry-run summary.
9. GHL external maps and outbound account/business sync.
10. GHL outbound contact sync and business association.
11. GHL inbound webhook queue.
12. Data quality/conflict review queue.
13. Accounts/contacts UI polish and source badges.
14. Route/account loading and virtualization.
15. Reports/tasks empty-state and data contract cleanup.

## Definition Of Done For The GHL Connection

- GHL token/scopes are visible in Settings without exposing the token.
- Contact and business read access both work.
- Dry-run can compare PICC accounts/contacts to GHL without writes.
- Dry-run output includes conflicts and skipped records.
- Admin can approve/apply a batch from the UI.
- Created/updated GHL records get stored in `ExternalRecordMap`.
- Contact-to-business associations are preserved.
- DND and manually owned fields are never overwritten.
- Every external write has an audit event.
- Every sync run has counts and failure details.
- Account and contact pages show GHL sync status.
- Inbound webhooks are accepted only after verification and queue review suggestions instead of silently changing canonical data.

## Open Decision

The key product decision is whether GHL should remain a downstream communication CRM only, or whether GHL edits should eventually flow back into PICC/Notion. The recommended path is downstream first, inbound review queue second, fully bidirectional last if the data proves clean.
