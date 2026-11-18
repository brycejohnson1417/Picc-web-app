# Session: personal Gmail account sidebar

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/222
Branch: codex/222-gmail-sidebar

Scope: isolated read-only Google Workspace add-on under integrations/gmail-sidebar/**; native Google card UI for account matching, status, orders, conversations and connection settings.
Out of scope: web-app changes, provider writes, email sending, schema/auth changes, commission calculations.
Architecture: Google Apps Script adapters read existing authoritative sources; no duplicate database. Private identifiers and evidence stay outside Git. Existing DESIGN-SYSTEM.md guides hierarchy; Google's native cards govern sidebar widgets.
Validation: failing identity/source-boundary tests first, adapter and card tests, manifest validation, npm run verify; real Gmail installation and interactions require user authorization of Google scopes and provider connections.
Overlap reviewed: open PRs 211, 215, 217, 219, 189, 135, 82. No shared source paths; SESSION.md administrative overlap only. Do not depend on or merge the unapproved distributor PR.
