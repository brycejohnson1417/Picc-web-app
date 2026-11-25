# Session: Add Contact save flow

Issue #226. Continue the existing draft PR #227 from fix/contact-save-flow.

Scope: retain the account-picker retry and disabled-Save hints; preserve the store across cancel and success; make titles optional; save and verify Associated Contacts in both directions; preview existing and proposed primary values and require confirmation before replacing them. Re-read before replacing and retain all existing Associated Contacts when reading a paginated relation.

Owned paths: the contact creation API, model, adapter and their tests; contact-create-flow, the store sheet integration, and contact workspace browser tests. Overlap checked: #215, #189, #135. Keep this change isolated from those open PRs. No integrations, PPP actions, production data changes, migrations, or unrelated contact editing.

Validation: synthetic fixture tests, full npm run verify, contact-workspace browser regressions and review of the PR preview. Notion has no conditional update for this write. Re-reading and avoiding automatic retries narrow the race, but cannot eliminate concurrent updates. Do not claim production verification or use live contacts for tests.
