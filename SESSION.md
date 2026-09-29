# Session: Gmail conversations (#206)

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/206
Branch: codex/206-gmail-conversations (from c6c7dff).

Scope: replace destructive single-contact Gmail activity import with private, read-through thread retrieval; exact From/To/Cc matching; account contact rollups; paginated conversations and readable message previews in both existing UI surfaces; filter automated/internal suggested contacts.
Out of scope: sending, scheduled mailbox mirroring, AI, attachments, schema changes, permission expansion, and deleting legacy activities.

Architecture: Gmail remains authoritative. Queries use the existing per-user/org token boundary and account/contact runtime. No persisted relationship can be moved when another contact is viewed. Existing imported rows stay untouched. Only bounded on-demand provider reads. The same read-only scope and role guard remain.

Validation: RED provider/domain/route tests for one thread matching two contacts, exact matching and Cc, pagination, safe message rendering, errors and isolation. Full npm run verify, targeted browser flows at mobile/desktop, then deployed verification.

Owned paths: lib/gmail/conversations*; lib/server/gmail-conversations*; Gmail provider/domain and tests; app/api/contacts/[contactId]/gmail/route.ts; app/api/accounts/[accountId]/gmail/route.ts; components/crm/gmail-conversations.tsx; contact-profile-workspace.tsx; components/mobile/account-detail-sheet.tsx (Gmail insertion only); suggestions route; tests/e2e/gmail-conversations.spec.ts; SESSION.md.

Overlap: checked open PRs #195, #194, #189, #166, #135, #82. Do not edit shared runtime/auth/schema files owned by #194/#195. Account sheet overlaps #189/#135: both claims are stale (latest commits/comments September 22 and June 3, >24h); reclaim only the Gmail insertion and require those PRs to rebase before landing. SESSION is a per-branch checkpoint. Existing mobile sheet is canonical, not a new account screen.
