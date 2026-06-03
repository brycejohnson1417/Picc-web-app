# Repository Instructions

This repository is the canonical source of truth for the live PICC app.

## Canonical Context

- GitHub repo: `https://github.com/brycejohnson1417/Picc-web-app.git`
- Canonical branch: `main`
- Production app: `https://piccnewyork.org`
- Main production route to verify: `https://piccnewyork.org/territory`
- Vercel project name: `picc-push`
- Vercel project ID: `prj_zKro1cfUOP9D2MTh0ZahYDREcRUA`

## Required Baseline

- This is an additive continuation of the current live app, not a rebuild.
- Keep the current mobile-first PWA shell.
- Keep Google Maps as the only supported map provider.
- Do not reintroduce MapLibre, Carto, Leaflet, `MapCanvas`, heatmap/hex layer modes, or `/api/territory/layers`.
- Keep Clerk as the auth provider.
- Sign-in is Google-only.
- Access is restricted to `@piccplatform.com` users.
- Check-ins are comment-first, not meeting-note-first.
- Territory Vendor Day Status and store-detail history should come from the Dispensary Master List / Notion-derived account data. Vendor Day dispatch and scheduling surfaces are retired.

## Do Not Use

- Do not use old repos or local clones such as `Picc-web-app-fix-accounts`.
- Do not use `picc-command-center.vercel.app`.
- Do not use `picc-dispensary-crm.vercel.app`.
- Do not revive deleted workflow surfaces unless there is an explicit product decision to do so.
- Do not revive retired Vendor Day dispatch/scheduling, Worker/Brand Ambassador coordination, Payroll, GHL/Bizly, Directus/Odoo, Redis, native app, or mobile sync worker surfaces unless there is an explicit product decision to do so.
- Do not treat stale planning docs or old commit history as more authoritative than the current `main` branch.

## Before Making Changes

1. Read [`README.md`](/Users/brycejohnson/Code/PICC-Web-App/README.md).
2. Read [`AI_HANDOFF.md`](/Users/brycejohnson/Code/PICC-Web-App/AI_HANDOFF.md).
3. Verify the live app behavior at:
   - `https://piccnewyork.org/sign-in`
   - `https://piccnewyork.org/territory`
   - `https://piccnewyork.org/calendar`

## Validation

- Run `npm run verify`
- Run `npm run test:e2e` when browser surfaces changed
- Prefer additive fixes against current behavior rather than architecture rewrites

## Anti-Slop Delivery Contract

Every meaningful code change must be traceable, reviewable, and revertable.

The canonical cross-repo protocol lives at `https://github.com/brycejohnson1417/.github/blob/main/AGENTS.md` and is mirrored locally at `/Users/brycejohnson/Code/AGENTS.md`. This section mirrors the parts that are specific to this repo. If the canonical protocol and this file disagree, use the safer repo-specific production rule but do not invent new approval gates here without updating the canonical protocol.

Before implementation:

1. Link the GitHub issue. If none exists, create one before editing code.
2. Work on a feature branch, not `main`.
3. Write down scope and out-of-scope items.
4. Identify the validation plan before editing.
5. For behavior changes, add or update the failing test first unless the PR explains why TDD is not practical.
6. Create or update `SESSION.md` with the current session scope, out-of-scope items, and constraints before substantial agent work.
7. Claim the issue before non-test edits by setting `status:in-progress`, creating a feature branch, opening a draft PR immediately, and listing owned path globs in the issue or PR.
8. Check currently open PRs for overlapping owned path globs and document which PRs were checked. If globs overlap, the later PR blocks or rebases; the first PR to land wins.

During implementation:

- Keep one concern per PR.
- Keep production triage surgical.
- Keep UI features fully usable from the browser.
- Do not silently mix refactors with bug fixes.
- Put business logic in server/domain modules and keep UI components thin.
- Keep Notion, Nabis, Neon, Supabase, Vercel, and other external systems behind explicit boundaries.
- GHL / Bizly is retired for this repo. Do not add new GHL / Bizly sync, webhook, settings, status, or seeded demo surfaces unless a new explicit product decision reverses that retirement.
- Use `parallel:ok` only when owned path globs do not overlap active PRs.
- Use `parallel:blocked` when another issue must land first.
- Use `parallel:exclusive` for protocol, CI, branch protection, schema, sync architecture, production data, or other shared-resource work.
- Use `meta:protocol-change` for changes to AGENTS, issue templates, PR templates, CI, branch protection docs, or repo workflow rules.
- Stale draft or in-progress claims are releasable if there are no commits or comments for 24 hours.

Before PR:

- Self-review the diff.
- Keep the PR at 10 changed files or fewer whenever possible. If it must exceed 10 files, explain why in the PR body.
- Run the repo validation commands.
- Include screenshots or browser proof for UI changes.
- Include read-only production proof for production data claims.
- List remaining risk honestly.

Fast lane / approval lane:

- Fast-lane PRs may be merged by an agent when scoped, labeled, green, and protected by branch rules. Examples: frontend polish, copy/UI improvements, scoped bug fixes, tests, docs, templates, and non-destructive backend fixes.
- Tested fast-lane changes should deploy forward without waiting on the user as a bottleneck. Once validation passes, the PR is mergeable, and the change does not fall into the approval lane, the agent may merge and promote/deploy to production, then verify production and report the result.
- Approval-lane PRs must pause for explicit user approval before merge only when the action is hard to undo or can mutate sensitive production state. Examples: production data writes/backfills, schema migrations, auth/RLS/access-control changes, secrets/env vars, payment logic, destructive deletes, and broad rewrites that replace major architecture rather than surgically fixing it.
- Approval mechanism: post a PR comment exactly in this form: `@bryce approval requested: <one-sentence reason>`. Do not merge until the user replies `approved` on that PR/comment.
- Large diff rule: line count and changed-file count are self-review signals, not automatic approval gates. If a PR is large, touches many files, or crosses important boundaries, explain why the scope is still coherent and what extra validation was run.

Production data rule:

- Local `.env.local` is not production proof.
- Production facts require a safe read-only production verification path.
- Pull production env only into a temporary ignored file, report counts/timestamps/status only, and delete it immediately.
- Do not print secrets or connection strings.
- Do not perform production writes, schema changes, or destructive operations without explicit user approval.
- For production backfills, CI must include clearly named tests for `lease-refusal`, `stale-recovery`, `429-backoff`, and `batch-cutoff` before any production run is considered safe.

Production verification and rollback:

- After merge, verify production behavior and comment on the PR with deployed URL, tested behavior, screenshots/browser proof when UI changed, and remaining risk.
- If production verification fails, rollback first using the previous Vercel deployment, open a follow-up issue with failure details, comment on the original PR with the follow-up link, and debug from the clean baseline.
