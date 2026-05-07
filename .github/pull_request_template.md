## Summary

- Closes #
- 

## Why

Explain the user or operational problem this PR solves. Include the root cause for fixes.

## Scope

- In scope:
- Out of scope:
- Files changed:
- If this PR changes more than 10 files, explain why:

## Coordination

- Owned path globs:
- Open PRs checked for overlap:
- Blocked by:
- Blocks:
- Parallel label: `parallel:ok` / `parallel:blocked` / `parallel:exclusive`
- Lane: fast lane / approval lane
- Approval-lane reason, if any:
- Large diff / boundary note, if any:

## Labels And Review Flags

- [ ] PR has the right `type:*`, `priority:*`, `area:*`, and status labels
- [ ] PR has `agent-generated` if opened or substantially authored by an agent
- [ ] PR has `needs-prod-proof` if it discusses production data, sync state, customer-visible totals, or live integration behavior
- [ ] PR has the right `parallel:*` label and `meta:protocol-change` when it changes repo rules
- [ ] Title and commit use a conventional prefix (`fix:`, `feat:`, `chore:`, `docs:`, `test:`, or `refactor:`)
- [ ] Draft PR was opened at claim time before non-test source edits

## Validation

- [ ] `npm test`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] Browser/UI proof attached when UI behavior changed
- [ ] Read-only production proof included when production data/state is discussed
- [ ] `SESSION.md` describes current scope, out-of-scope items, and constraints

## Screenshots / Browser Proof

Add screenshots, video, or a clear note that this PR has no visual/browser surface.

## Production Proof

If this PR makes claims about production data or behavior, include the exact read-only verification performed. Do not paste secrets or connection strings.
If production verification fails after merge, rollback first, open a follow-up issue, and comment here with the follow-up link.

## Risk And Rollback

- Risk:
- Rollback:
