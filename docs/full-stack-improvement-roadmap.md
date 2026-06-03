# Full-Stack Improvement Roadmap

This roadmap tracks active improvement areas for the live PICC app. It intentionally excludes the retired GHL / Bizly integration plan.

## Active Principles

- Keep Notion, Nabis, Google Sheets, Postgres, and Vercel behind explicit server-side boundaries.
- Keep the frontend focused on complete, browser-usable workflows rather than backend-only controls.
- Keep account identity anchored on stable retailer identity: Licensed Location ID, Nabis Retailer ID, license number, Notion page ID, and exact name/location review when identifiers conflict.
- Route ambiguous creates, duplicate candidates, and identity conflicts to review instead of creating another CRM page.
- Treat production writes, schema migrations, and destructive cleanup as approval-lane work.

## Current Integration Direction

### Notion

- Notion remains the Dispensary Master List CRM source of record for account records, contact links, vendor-day properties, and field-sales operating context.
- Notion writes must stay explicit and scoped.
- CRM page creation must avoid duplicates by checking stable identifiers and exact name/location conflicts before creating.

### Nabis

- Nabis retailer identity and order data remain active inputs.
- Retailer sync should use the current Nabis export/API identity fields before falling back to text matching.
- Current retailer exports should be used to detect stale CRM duplicates and blocked create conflicts.
- Credit-only updates can stay lower risk than address, name, license, or identity rewrites.

### Google Sheets

- Workbook-backed schema support remains active where documented in `README.md`.
- Sheets should not become a hidden source of truth when a Notion or Nabis field is canonical.

### Postgres Read Models

- Postgres read models should support fast app workflows without replacing the canonical CRM identity sources.
- Read models should expose freshness, source, and error metadata to the UI.

## Duplicate Prevention

Before creating a CRM account page from retailer data:

1. Match exact `Licensed Location ID`.
2. Block for review on exact `Nabis Retailer ID`.
3. Block for review on exact `License Number`.
4. Block for review on exact `Dispensary Name` plus city/zip.
5. Create only when all durable identity checks are clear.

When a duplicate appears:

- Compare the active current-export row to the CRM pages.
- Prefer the CRM-rich/current-export-backed page unless live evidence proves otherwise.
- Archive only the clearly stale duplicate side.
- Leave ambiguous license collisions for review.

## Active Backlog Themes

- Nabis/Notion identity guardrails and review queues.
- Account/contact quality reconciliation in the app UI.
- Route planning, territory filtering, map performance, and field-sales mobile workflows.
- Reports export and drilldown quality.
- Vendor-day scheduling and follow-up ergonomics.
- Local validation speed and deterministic sync tests.

## Retired Work

See `docs/retired-ghl-bizly-integration.md` for the retired GHL / Bizly decision. Do not rebuild those sync, webhook, status, or settings surfaces unless a new product decision explicitly reverses that retirement.
