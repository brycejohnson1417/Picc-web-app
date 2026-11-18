# Personal Gmail account sidebar

Private Google Apps Script developer add-on. Uses native CardService widgets; no separate web app, public endpoint, email sending or source writes. Follows the parent DESIGN-SYSTEM.md hierarchy with Google-controlled layout.

## Files and validation

Upload Domain.js, Sources.js, Code.js and Settings.js as Apps Script server-side files, plus appsscript.json as the manifest. Do not upload tests or this document. `node --test integrations/gmail-sidebar/sidebar.test.cjs` runs local contract tests.

## Installation

Create a private standalone project under the intended Google account. Enable manifest visibility in project settings, replace the default code with the four source files and manifest, save, then use Deploy → Test deployments → Google Workspace Add-on → Install. Review and authorize its read-only Gmail scopes and outbound provider calls. Keep the project private and do not publish it to Marketplace or deploy it as a web app.

All source configuration is in the add-on's Settings card: Notion key and source IDs, distributor key and workspace identity. Use a read-only Notion integration. Distru keys may have broader capabilities, but this client calls only read endpoints. Google CardService text fields do not mask keys while typing; saved keys are omitted from all rendered cards. UserProperties is Google-hosted configuration storage, not an independent secret vault. Do not share project editor access.

## Source boundaries

- Account identity uses exact current email addresses and both directions of account/contact relations. Multiple matches require choosing a location. Contextual matching checks at most five external participants; manual search remains available.
- Financial data comes only from the account's designated financial relation. Multiple records block the section; missing values stay unknown. No first-alias fallback or recalculation.
- Distributor orders require a verified workspace and consistent company ID. Each returned order is checked against that company. Pagination URLs remain on the exact provider endpoint.
- Related threads use recorded current contacts and a 90-day window. Shared contacts can include conversations about other locations; the UI discloses this. Recent activity does not claim that a reply is owed.
- Assigned rep and customer payment status are separate fields. No payroll or commission data is accessed.

## Limits requiring live verification

Provider authorization, field types, live Google card rendering and actual Gmail installation must be checked with authorized user connections. Local mocks prove contracts, not provider access. The live web app and its unmerged distributor integration are unchanged. Large contact relations fail explicitly instead of silently truncating matches.
