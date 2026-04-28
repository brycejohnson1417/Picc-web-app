# Bizly / Go HighLevel Integration Audit

Date: 2026-04-28

Scope:

- Read-only audit of the current Bizly Go HighLevel shape, the PICC app account/contact schema, and the active Notion CRM database schemas.
- No GHL writes, no Notion writes, no schema changes, and no imports were performed.
- Goal: define the changes required before GHL can safely connect to the PICC app and Notion.

Related docs:

- `docs/full-stack-improvement-roadmap.md`
- `docs/frontend-ux-audit.md`

Official HighLevel references checked:

- Private Integrations: https://help.gohighlevel.com/support/solutions/articles/155000003054-private-integrations-everything-you-need-to-know
- Scopes: https://marketplace.gohighlevel.com/docs/Authorization/Scopes/index.html
- Contacts API: https://marketplace.gohighlevel.com/docs/ghl/contacts/contacts/index.html
- Businesses API: https://marketplace.gohighlevel.com/docs/ghl/businesses/businesses/index.html
- Create Business: https://marketplace.gohighlevel.com/docs/ghl/businesses/create-business/index.html
- Get Contacts by Business ID: https://marketplace.gohighlevel.com/docs/ghl/contacts/get-contacts-by-business-id/index.html
- Add/remove contacts from business: https://marketplace.gohighlevel.com/docs/ghl/contacts/add-remove-contact-from-business/index.html
- Location custom fields: https://marketplace.gohighlevel.com/docs/ghl/locations/get-custom-fields/index.html
- Custom Fields V2: https://marketplace.gohighlevel.com/docs/ghl/custom-fields/custom-fields-v-2-api/index.html

## Executive Takeaway

Do not import PICC accounts into the current Bizly contact list as plain contacts.

GHL must be normalized first:

1. Use GHL Business records as the account/company layer.
2. Use GHL Contact records only for people.
3. Associate contacts to businesses through `businessId`.
4. Add PICC and Notion identifiers as GHL custom fields.
5. Preserve GHL native IDs in `ExternalRecordMap`.
6. Run dry-run matching before any create/update.
7. Keep Notion as review/mirror until GHL quality is proven.

The current Bizly GHL account is not ready for a direct import. It has many contacts but weak account identity. Business access is blocked by scope/auth right now, and the sampled contacts are mostly flat leads with no `businessId` and no custom field values.

## Current Bizly GHL State

Observed through the HighLevel connector:

- Location ID observed: `TUoDz7SGlEsgK3ilwjGr`
- Contacts are readable.
- Contacts metadata reported `2722` total records.
- Business/company read access failed with a 401 auth/scope error.
- Sampled contact records usually had:
  - `type = lead`
  - `businessId = null`
  - `customFields = []`
  - sparse `email` and `phone`
  - occasional free-text `companyName`
  - social/Instagram attribution for many recent leads
  - `dnd = false` in the sampled records
- A query for opportunities returned pipeline records with contact relations, tags, company names, and form/manual sources.

What this means:

- GHL currently behaves more like a lead inbox than a normalized account/contact CRM.
- `companyName` is not a durable account link.
- `businessId` is the association we need, but it is not populated in the sampled contact records.
- The current token can read contacts, but not the business/account layer.
- Custom field definitions could not be confirmed from the connector; record-level custom fields were empty in sampled contacts.

## Current Notion CRM Shape

Active Notion databases fetched read-only:

- `Dispensary Master List CRM`
- `Dispensary Contacts`

### Master List Key Properties

These are the Notion properties that matter for GHL business/account import:

- `Dispensary Name`
- `DBA`
- `Legal Entity Name`
- `Nickname`
- `License Number`
- `Licensed Location ID`
- `Licensed Location ID (MSS) rollup`
- `Nabis Retailer ID`
- `Full Address`
- `Address 1`
- `City`
- `Zipcode`
- `Map Location`
- `Account Status`
- `Rep`
- `Account Manager`
- `Contact`
- `Contact Email`
- `Contact Phone`
- `Contact Position`
- `Associated Contacts`
- `Billing AP Contact`
- `Billing AP Email`
- `Billing AP Phone`
- `Billing cc Contact`
- `Billing cc Email`
- `Billing cc Phone`
- `Nabis POC Name`
- `Nabis POC Email`
- `Nabis POC Phone`
- `VD Contact`
- `VD Contact Email`
- `VD Contact Number`
- `Website`
- `Instagram`
- `Referral Source`
- `Responsiveness`
- `Account Status`
- `PPP Status`
- `Headset Connection`
- `Vendor Day Status`
- `Last Contacted`
- `Follow Up Needed`
- `Follow Up Date`
- `Follow Up Reason`
- `Last Order Date`
- `Last Sample Order Date`
- `Last Delivery Date`
- `Last Order Amount`
- `Total Orders $`
- `Total Orders (count)`

Notion already has enough account identity to seed GHL correctly.

### Contacts Key Properties

These are the Notion properties that matter for GHL contact import:

- `Contact Name`
- `Contact Position`
- `Email`
- `Phone Number`
- `Phone Number (1)`
- `Dispensary`
- `Where Contact Info Came From`
- `Buyers Club Member?`
- `PPP Contact`
- `Dispensary Account Status` rollup
- `Dispensary Rep` rollup
- `Meeting Notes`

Important contact source options already exist:

- `CRM Contact`
- `Nabis Order POC`
- `Revelry Buyer`
- `Revelry Fall 2025 Buyers Directory`
- `Nabis AP Import List from Nabis`
- `Store`
- `Synced Master Sales Sheet`
- `CRM Contact Billing AP`
- `CRM Contact Billing CC`
- `Nabis POC`

## Current App Schema Reality

The app already has the primitives required for this integration:

- `IntegrationProvider` includes `GHL`.
- `IntegrationConnection` exists.
- `ExternalRecordMap` exists.
- `SyncCheckpoint` exists.
- `SyncRun` exists.
- `AccountIdentityMapping` exists.
- `Account` has:
  - `notionPageId`
  - `licensedLocationId`
  - `nabisRetailerId`
  - `licenseNumber`
  - address fields
  - uniqueness constraints for key identities
- `Contact` is tied to an `accountId`.

The missing piece is not a database table. It is a clean, enforced runtime contract that maps Notion accounts/contacts, app accounts/contacts, Nabis retailers/orders, and GHL businesses/contacts into one identity system.

## Required GHL Scope Changes

The current connector can read contacts but business access fails. Before implementation, update the HighLevel Private Integration scopes.

Required for dry-run/read:

- `contacts.readonly`
- `businesses.readonly`
- `locations/customFields.readonly`
- `locations/tags.readonly`
- `opportunities.readonly` if importing current Bizly pipeline status

Required for apply/write:

- `contacts.write`
- `businesses.write`
- `locations/customFields.write` if fields will be created by API
- `locations/tags.write` if sync tags will be created by API
- `opportunities.write` only if the app will update GHL opportunities

Optional later:

- `conversations.readonly`
- `conversations.write`
- webhook event scopes for inbound contact, opportunity, conversation, and DND changes

Do not enable broad scopes just to avoid one 401. Start with the scopes above, test read-only, then add write scopes only when the dry-run/apply UI exists.

## Required GHL Business Custom Fields

Create a GHL custom field folder/group named `PICC Integration` for Business records.

Business fields to add:

| Field label | Type | Source | Purpose |
| --- | --- | --- | --- |
| `PICC Licensed Location ID` | Text | Notion/app/Nabis | Canonical account identity |
| `PICC License Number` | Text | Notion/app | Secondary account identity |
| `PICC Notion Page ID` | Text | Notion | Durable Notion link |
| `PICC App Account ID` | Text | App | Durable app link after local account exists |
| `PICC Nabis Retailer ID` | Text | App/Nabis/Notion | Nabis identity |
| `PICC Notion URL` | URL | Notion | Quick human review link |
| `PICC Account Status` | Single select or text | Notion/app | Mirror account status |
| `PICC Rep Emails` | Text | Notion/app | Preserve user identity across systems |
| `PICC Account Manager Email` | Text | Notion/app | Account ownership |
| `PICC Source Of Truth` | Single select | App | `notion`, `app`, `nabis`, `manual-ghl`, `review` |
| `PICC Sync Status` | Single select | Sync engine | `synced`, `needs-review`, `blocked`, `error` |
| `PICC Last Synced At` | Date/time | Sync engine | Audit/debug |
| `PICC Last Sync Error` | Long text | Sync engine | Human-readable failure |
| `PICC Last GHL Inbound At` | Date/time | Webhook processor | Conflict/debug |
| `PICC Sync Checksum` | Text | Sync engine | Idempotency/change detection |
| `PICC DBA` | Text | Notion | Search/match alias |
| `PICC Legal Entity Name` | Text | Notion | Search/match alias |
| `PICC Nickname` | Text | Notion | Search/match alias |
| `PICC Referral Source` | Text or select | Notion | Sales context |
| `PICC Responsiveness` | Select | Notion | Sales context |
| `PICC PPP Status` | Select/text | Notion | Account program state |
| `PICC Headset Connection` | Select/text | Notion | Account program state |
| `PICC Vendor Day Status` | Select/text | Notion | Field ops context |
| `PICC Follow Up Needed` | Boolean | Notion/app | Follow-up workflow |
| `PICC Follow Up Date` | Date | Notion/app | Follow-up workflow |
| `PICC Follow Up Reason` | Long text | Notion/app | Follow-up workflow |
| `PICC Last Contacted` | Date | Notion/app | Activity recency |
| `PICC Last Order Date` | Date | Notion/Nabis | Account health |
| `PICC Last Sample Order Date` | Date | Notion/Nabis | Sample workflow |
| `PICC Last Delivery Date` | Date | Notion/Nabis | Account health |
| `PICC Total Orders Count` | Number | Notion/Nabis | Account health |
| `PICC Total Orders Dollars` | Number | Notion/Nabis | Account health |

Do not make every Notion rollup a GHL custom field. Only mirror fields that sales reps need in GHL or fields required for matching/debugging.

## Required GHL Contact Custom Fields

Create a GHL custom field folder/group named `PICC Integration` for Contact records if contact custom field creation is available through the location custom-field API.

Contact fields to add:

| Field label | Type | Source | Purpose |
| --- | --- | --- | --- |
| `PICC Contact Notion Page ID` | Text | Notion | Durable Notion contact identity |
| `PICC App Contact ID` | Text | App | Durable app contact identity after local contact exists |
| `PICC Account Notion Page ID` | Text | Notion | Backstop account link |
| `PICC Licensed Location ID` | Text | Notion/app | Account identity on the contact |
| `PICC GHL Business ID` | Text | GHL | Debug association state |
| `PICC Contact Source` | Multi select or text | Notion | Mirrors `Where Contact Info Came From` |
| `PICC Contact Position` | Text | Notion/app | Role/title |
| `PICC Buyers Club Member` | Boolean | Notion | Campaign segmentation |
| `PICC PPP Contact` | Boolean | Notion | Program segmentation |
| `PICC Sync Status` | Single select | Sync engine | `synced`, `needs-review`, `blocked`, `error` |
| `PICC Last Synced At` | Date/time | Sync engine | Audit/debug |
| `PICC Last Sync Error` | Long text | Sync engine | Human-readable failure |
| `PICC Duplicate Candidate` | Boolean | Sync engine | Blocks automated overwrite |
| `PICC Missing Account Link` | Boolean | Sync engine | Review queue signal |
| `PICC Do Not Sync` | Boolean | Human/admin | Manual exclusion |
| `PICC Normalized Email` | Text | Sync engine | Optional debug/dedupe |
| `PICC Normalized Phone` | Text | Sync engine | Optional debug/dedupe |

Do not overwrite GHL `dnd` or `dndSettings`. The app should read and respect them.

## Required GHL Tags

Use tags for workflow and segmentation, not for stable identity.

Recommended tags:

- `picc: synced`
- `picc: needs-review`
- `picc: sync-error`
- `picc: duplicate-candidate`
- `picc: missing-business`
- `picc: no-email`
- `picc: no-phone`
- `source: notion`
- `source: nabis-poc`
- `source: billing-ap`
- `source: billing-cc`
- `source: revelry`
- `source: ghl-existing`

Keep current Bizly sales tags such as `hot lead`, `cold lead`, and `new lead - needs proposal`, but do not rely on them for identity matching.

## Unique Identifier Strategy

### Business / Account Matching

Use this priority order:

1. Existing `ExternalRecordMap` where `provider = GHL`, `localModel = Account`, and `externalId = businessId`.
2. `PICC Licensed Location ID`.
3. `PICC License Number`.
4. `PICC Nabis Retailer ID`.
5. `PICC Notion Page ID`.
6. Exact normalized business name plus exact city/address.
7. Human review.

Never match a business solely on GHL `companyName`.

### Contact Matching

Use this priority order:

1. Existing `ExternalRecordMap` where `provider = GHL`, `localModel = Contact`, and `externalId = contactId`.
2. `PICC Contact Notion Page ID`.
3. Exact normalized email within the same account/business.
4. Exact normalized phone within the same account/business.
5. Exact normalized name plus linked business plus role/title.
6. Human review.

Never auto-create app contacts from GHL records that only have an Instagram handle or a name with no email, phone, or business link.

### Account Link Matching

For contacts:

1. Use GHL `businessId` if present.
2. Else use `PICC Licensed Location ID` custom field.
3. Else use `PICC Account Notion Page ID` custom field.
4. Else fuzzy match `companyName` to Notion/app accounts only in dry-run and only as a review suggestion.

## Import Plan

### Phase 0: Access And Snapshot

Before any write:

- Add missing HighLevel scopes.
- Confirm `GET /businesses` works.
- Confirm `GET /locations/:locationId/customFields` works.
- Confirm `GET /locations/:locationId/tags` works.
- Snapshot all GHL contacts.
- Snapshot all GHL businesses.
- Snapshot all GHL custom fields.
- Snapshot all GHL tags.
- Snapshot current Notion Master List and Contacts schemas.
- Save the raw snapshots outside the app runtime path, preferably in `data-tools`.

### Phase 1: Field Setup

Create or verify the required GHL custom fields.

Store GHL custom field IDs in `IntegrationConnection.config`, not hardcoded source files.

Field setup must be idempotent:

- If field label exists with matching type, reuse it.
- If field label exists with wrong type, flag review and stop.
- If missing and apply is approved, create it.
- Never delete existing GHL fields automatically.

### Phase 2: Account/Business Dry-Run

Dry-run Notion/app accounts into GHL businesses:

- Read Notion Master List.
- Read app `Account` rows.
- Read GHL businesses.
- Match by identifier priority.
- Produce proposed creates/updates/skips/conflicts.
- Include exact reason for every skipped row.
- Estimate API calls before apply.

No writes in this phase.

### Phase 3: Business Apply

After approval:

- Create missing GHL businesses.
- Update safe fields on matched businesses.
- Store `ExternalRecordMap` entries.
- Write `SyncRun` counts.
- Write `AuditEvent` for every external write.
- Update sync status fields only after successful write.

### Phase 4: Contact Dry-Run

Dry-run Notion contacts and existing GHL contacts:

- Read Notion Contacts.
- Read GHL contacts.
- Read GHL businesses.
- Match contacts using identifier priority.
- Propose contact creates/updates.
- Propose contact-business associations.
- Flag GHL contacts that look like dispensaries instead of people.
- Flag contacts with no email, no phone, and no business link.
- Preserve DND state.

No writes in this phase.

### Phase 5: Contact Apply

After approval:

- Create or update eligible GHL contacts.
- Associate contacts to businesses through GHL `businessId`.
- Store `ExternalRecordMap` entries.
- Add workflow tags.
- Do not change DND.
- Do not delete GHL contacts.
- Do not overwrite manually owned GHL fields unless the field is explicitly PICC-owned.

### Phase 6: Existing Bizly Lead Cleanup

Current GHL records should be reconciled after canonical Notion/app accounts are in GHL:

- Keep social/media leads as leads until they can be tied to a real dispensary.
- Convert obvious business-as-contact records into review suggestions, not automatic accounts.
- Link existing contacts to newly created businesses when match confidence is high.
- Keep original source attribution and tags.
- Add `picc: needs-review` to ambiguous records.

### Phase 7: Webhooks And Ongoing Sync

Only after dry-run/apply is stable:

- Add GHL webhooks.
- Store raw inbound payloads.
- Deduplicate provider events.
- Convert inbound GHL changes into review suggestions first.
- Do not let GHL silently overwrite Notion or app account identity.

## Notion Changes Needed

Do not add these fields until the sync plan is approved. When approved, add them as sync-managed review fields.

### Dispensary Master List CRM

Add:

- `GHL Business ID`
- `GHL Sync Status`
- `GHL Last Synced At`
- `GHL Last Sync Error`
- `GHL Contact Count`
- `GHL Needs Review`
- `GHL Last Inbound At`
- `GHL Sync Notes`

Recommended status options for `GHL Sync Status`:

- `Not synced`
- `Synced`
- `Needs review`
- `Blocked`
- `Error`

### Dispensary Contacts

Add:

- `GHL Contact ID`
- `GHL Business ID`
- `GHL Sync Status`
- `GHL Last Synced At`
- `GHL Last Sync Error`
- `GHL Duplicate Candidate`
- `GHL Missing Business Link`
- `GHL Do Not Sync`
- `GHL Last Inbound At`
- `GHL Sync Notes`

Do not make Notion the write path for GHL tokens, field IDs, or sync credentials. Those belong in app/database integration config.

## App Changes Needed

### Data Model

Use existing tables first:

- `IntegrationConnection` for GHL connection config.
- `ExternalRecordMap` for GHL `businessId` and `contactId`.
- `SyncRun` for each dry-run/apply job.
- `SyncCheckpoint` for cursors, checksums, and module state.
- `AuditEvent` for every external mutation.

Potential schema improvements:

- Add `updatedAt`, `lastSeenAt`, `lastSyncedAt`, `checksum`, `active`, and `metadata` to `ExternalRecordMap`.
- Add a `SyncReviewItem` or reuse/extend `EditSuggestion` for conflicts.
- Add optional `GHL_BUSINESS_ID` and `GHL_CONTACT_ID` identity types only if `ExternalRecordMap` is not enough.

### API

Add admin-only integration endpoints:

- `GET /api/integrations/ghl/status`
- `POST /api/integrations/ghl/test-read`
- `POST /api/integrations/ghl/field-plan/dry-run`
- `POST /api/integrations/ghl/field-plan/apply`
- `POST /api/integrations/ghl/accounts/dry-run`
- `POST /api/integrations/ghl/accounts/apply`
- `POST /api/integrations/ghl/contacts/dry-run`
- `POST /api/integrations/ghl/contacts/apply`
- `POST /api/webhooks/highlevel`

### UI

Build this in Settings before writing sync code:

- Connection status.
- Location ID.
- Scope checklist.
- Last successful contact read.
- Last successful business read.
- Custom field readiness table.
- Tag readiness table.
- Dry-run button.
- Dry-run result table.
- Apply button gated by admin role and confirmation.
- Conflict/review queue.
- Links to GHL records from account/contact detail pages.

The user should never need to inspect backend logs to know why GHL sync is blocked.

## Current Blockers

1. Business/company API access is blocked by scope/auth.
2. GHL contacts are not associated to businesses in the sampled records.
3. Existing GHL custom field definitions are not confirmed.
4. Current Bizly contacts include many low-identity social leads.
5. The app account/contact screens still read different truth layers.
6. Notion has duplicate-ish contact fields on the master account record and the separate contacts database.
7. No dry-run/apply UI exists yet for GHL.

## Data Quality Rules

Hard rules:

- Do not create a GHL Business without at least one durable account identity or a human-approved fallback.
- Do not create an app Account from a GHL contact-only record.
- Do not create a GHL Contact from a record with no email, no phone, and no linked business unless explicitly approved.
- Do not use `companyName` as a unique identifier.
- Do not overwrite DND.
- Do not delete GHL records automatically.
- Do not overwrite manually owned GHL fields.
- Do not write to Notion/GHL from a cron without a stored approved apply batch.

Recommended duplicate review flags:

- Same email on multiple GHL contacts.
- Same phone on multiple GHL contacts.
- Same contact name across multiple businesses.
- Contact companyName matching multiple Notion accounts.
- GHL contact name looks like a dispensary name.
- GHL business missing `PICC Licensed Location ID`.
- Notion account missing `Licensed Location ID` and `License Number`.

## First Implementation Sequence

1. Update HighLevel scopes and confirm read-only access to businesses, custom fields, and tags.
2. Add a read-only `data-tools` audit job that exports:
   - GHL contact summary
   - GHL business summary
   - GHL custom field summary
   - GHL tag summary
   - Notion account/contact identity summary
   - proposed match report
3. Add app Settings UI for GHL status and dry-run display.
4. Add GHL custom field readiness dry-run.
5. Add GHL business dry-run.
6. Add GHL business apply.
7. Add GHL contact dry-run.
8. Add GHL contact apply and business association.
9. Add Notion sync status mirror fields only after the GHL apply path is stable.
10. Add webhook ingestion and review queue.

## Decision Needed Before Writes

Choose the initial GHL operating mode:

Recommended:

- GHL is downstream-only for account/contact sync.
- GHL inbound edits become review suggestions.
- Notion remains human-facing CRM/review mirror.
- The app/Postgres becomes the runtime source once the read model is unified.

Do not start fully bidirectional sync until the existing Bizly lead data is cleaned and business associations are stable.
