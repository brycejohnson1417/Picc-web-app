# Gmail Sent copies

Issue #208 adds opt-in copies of app-sent provider messages to the matching sender mailbox. Gmail insertion does not transmit mail. Provider sending and mailbox copying have separate durable states. Never retry a provider send because a mailbox copy failed; ambiguous outcomes fail closed and require reconciliation.

Scope: connection settings, shared send adapter, encrypted copy ledger and focused tests. External provider-console sends and agent MCP deployment are outside this slice. No historical backfill.

Validation: RED duplicate-send/copy tests, sender and organization boundaries, revoked scope, concurrent requests, ambiguous insert, MIME safety, Settings browser flows and npm run verify. Additive schema and OAuth permission changes need reviewed release approval. Production remains unchanged until release verification.
