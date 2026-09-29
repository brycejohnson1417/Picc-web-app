# Gmail Sent copies

Issue #208 adds opt-in copies of app-sent provider messages to the matching sender mailbox. Gmail insertion does not transmit mail. Provider sending and mailbox copying have separate durable states. Never retry a provider send because a mailbox copy failed; ambiguous outcomes fail closed and require reconciliation.

Scope: connection settings, shared send adapter, encrypted copy ledger and focused tests. External provider-console sends and agent MCP deployment are outside this slice. No historical backfill.

Validation: RED duplicate-send/copy tests, sender and organization boundaries, revoked scope, concurrent requests, ambiguous insert, MIME safety, Settings browser flows and npm run verify. Additive schema and OAuth permission changes need reviewed release approval. Production remains unchanged until release verification.

## Release and recovery

Apply only `20260929210000_gmail_sent_copies` before deploying the application change. It adds `MailjetDispatch` and the default-off `GmailConnection.sentCopiesEnabled` flag; no existing records are deleted or backfilled. Existing clients retain read-only Gmail access until the owner enables Sent copies through Settings and completes Google consent for `gmail.insert`.

The ledger stores sender/recipient/subject/status metadata. Pending MIME content is encrypted with the existing Mailjet encryption key and removed after the copy is confirmed. Preserve that key for pending-copy recovery. Copy status is visible only to a user connected to the exact sender mailbox in the same organization. Other sending aliases are not automatically authorized.

Mailjet owns the transmitted Message-Id and forbids overriding it. The app adds `X-PICC-Archive-ID` for correlation and uses a stable RFC Message-ID in the saved copy for duplicate lookup. The saved copy contains the submitted content, not Mailjet's rewritten tracking links or delivery-added headers. Reply threading must be checked live; provider-specific grouping is not guaranteed by this change.

A unique request claim prevents repeated/concurrent provider sends. Any unconfirmed provider attempt remains blocked on that key; verify provider history before intentionally starting a new request. Gmail insertion timeouts and stale copy claims are reconciliation-only: they search for an existing copy and never repeat insertion while uncertain. A definitive Gmail rejection can be retried from Settings, without invoking Mailjet.

Post-release proof: owner enables the setting; one explicitly authorized test is accepted once by Mailjet; exactly one corresponding Gmail Sent entry is observed; repeating a copy status check produces no additional send or insertion. Test external API calls use stubs locally, so these live checks remain required. Scheduled emails remain paused. This does not capture mail sent outside the app, deploy an agent MCP service, or add delivery/open/click webhooks.

Rollback the application deployment first if verification fails; retain the additive table and ledger, do not drop them or erase duplicate-prevention history. The prior app lacks the new ledger guard, so do not replay attempted messages during rollback.
