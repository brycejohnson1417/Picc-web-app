# Baseline Metrics

Date: 2026-04-28

Scope: account/contact runtime contract and sync freshness visibility.

## Route/Data Baseline

| Route | Current data path before this PR | Freshness metadata before this PR | User-visible gap |
| --- | --- | --- | --- |
| `/accounts` | Client fetches `/api/territory/stores`, which reads the territory read model/cache. | `meta.syncedAt`, `meta.stale`, `meta.syncing`, `meta.syncError`, `meta.recordsRead`, `meta.lastEditedMax`. | The account list had no clear source/freshness banner, so stale or cached data looked normal unless the request hard-failed. |
| `/contacts` | Server page called `loadLiveNotionContacts()`, which reads `NotionCacheSnapshot` for contacts and may background-refresh Notion. | Contact cache had `syncedAt`, `recordsRead`, and `lastEditedMax` internally, but callers received only rows. | The contacts page could not tell users whether contact rows were fresh, stale, syncing, or served from the last usable cache. |
| `/api/territory/account-contacts` | Reads contacts from the same Notion contact cache, filtered by account page ID. | Contact freshness stayed internal to `notion-live-crm`. | Account detail contacts could not expose contact source freshness yet. |
| `/api/accounts` and `/api/contacts` | Read/write local Prisma `Account` and `Contact` models. | No shared runtime freshness contract. | These routes are not clearly the same records shown in the main mobile Accounts/Contacts flows. |

## Pre-PR Findings

- Account and contact screens were reading different truth layers.
- Territory account data already had useful freshness metadata, but the mobile accounts UI did not surface it.
- Contact cache freshness existed in storage but was discarded by `loadLiveNotionContacts()`.
- No single account/contact payload existed for future Notion/Nabis identity work.
- Local browser Lighthouse numbers were not collected in this environment because the local database/bootstrap path is still being handled separately.

## Route Timing Targets For Follow-Up

| Route | Target measurement |
| --- | --- |
| `/api/territory/stores` | P50/P95 response time, payload size, source engine, stale/syncing/error counts. |
| `/api/runtime/account-contact` | P50/P95 response time, account count, contact count, stale source count. |
| `/accounts` | First account list paint, search response time, detail sheet open time. |
| `/contacts` | Server render time, rows rendered, freshness state shown. |

## Bundle Notes

- Bundle analyzer was not run for this baseline slice.
- This PR should avoid adding large client dependencies; the new freshness UI uses existing `lucide-react` and local UI primitives.
