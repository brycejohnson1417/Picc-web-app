# Retired GHL / Bizly Integration

GHL / Bizly is no longer an active PICC integration target.

This document replaces the prior GHL / Bizly integration audit so agents do not revive stale connection plans, scopes, custom fields, webhooks, dry-run flows, or sync UI work from older roadmap notes.

## Current Decision

- Do not build or maintain GHL / Bizly sync surfaces.
- Do not add GHL / Bizly settings, status badges, webhooks, custom field plans, or account/contact sync jobs.
- Do not seed local demo connections for GHL / Bizly.
- Do not treat GHL / Bizly as an account, contact, timeline, conversation, or campaign source.

## Active CRM Sources

The active account and contact control surface remains:

- Notion Dispensary Master List CRM
- Nabis retailer/order exports and API-backed syncs
- App/Postgres read models derived from those sources
- Google Sheets workbook inputs where explicitly documented

## Historical Data

Existing database enum values or historical records that mention GHL can remain for backward compatibility until a dedicated schema cleanup/migration is approved. They should not be used for new product work.

## Replacement Rule

When older docs or stale branches mention GHL / Bizly, treat those references as retired. New work should route through the current Nabis/Notion identity model and should block possible duplicate CRM creates into review instead of creating another page.
