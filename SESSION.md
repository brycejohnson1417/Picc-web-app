# Session: issue 208, Gmail Sent copies

Branch codex/208-gmail-sent-copies; draft PR #209. Base main 6650293.

Scope: separate durable provider-send and Gmail-copy states; sender-matched opt-in; incremental insertion permission; Settings status/recovery; shared transactional and test sender. External Mailjet-console sends, backfills, tracking webhooks and agent MCP are out of scope.

Architecture: reuse provider adapters; encrypted message payload while pending, stable request identity, fail closed after unknown send/insert result. No Gmail send endpoint. Concurrent provider/copy operations claimed atomically. New ledger plus connection preference requires additive migration and reviewed OAuth approval before release.

Validation: RED behavior tests first; npm run verify; focused Settings E2E and screenshots/video. No external customer messages during tests. Check open #195 #194 #189 #166 #135 #82, no source overlap other than SESSION. User authorized implementing Sent copies; production remains unchanged until concrete review.

Implementation review: sender API routing is centralized in mailjet-dispatch; all existing app Mailjet sends pass through it. Confirmed success is preserved even when copying fails. Read-only connection remains default, insertion is explicit. Provider forbids Message-Id overrides, so correlation uses a custom X-PICC header; mailbox threading is a live release check. Pending MIME encrypted, cleared when saved. Uncertain sends are never retried on their key, uncertain copies are lookup-only.

Local proof: additive migration rehearsed in isolated picc_sentcopy_208; ten concurrent send requests yielded one provider call; ten copy claims elected one worker. Native background browser toggled the actual local setting on, reloaded, and toggled it off. Focused Playwright validates mobile/desktop recovery and authorization errors. All email providers are stubbed in tests; no real email was sent or mailbox changed.
