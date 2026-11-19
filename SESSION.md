# Session: Add Contact save flow fix (2026-11-19)

Agent: Vesper (Muse), working at Bryce's direction while Codex is offline.
Issue: #226. Branch: fix/contact-save-flow.

## Scope
- ContactCreateFlow accepts an optional initialAccountPageId; the account detail sheet passes the open store so the account starts selected there.
- "Still needed: ..." hint next to Save whenever Save is disabled, computed by a new unit-tested contactCreateMissingFields helper in lib/contacts/contact-create-model.ts.
- Account-list load failure renders inside the picker with a Retry button instead of "No matching accounts".

## Out of scope
- /api/contacts, the Notion contact-creation adapter, role/collision semantics, contacts page behavior.
- PPP setup actions (separate issue).

## Validation
- Unit: lib/contacts/contact-create-model.test.ts (new missing-fields cases).
- Existing e2e tests/e2e/contact-workspace.spec.ts must stay green.
- CI: npm run verify.
