# Rollback and version history

When something breaks on piccnewyork.org, undo first and debug second. Pick the
fastest option that fits.

| What broke | Fastest undo | Time |
| --- | --- | --- |
| The live site after a deploy | Promote the previous deployment in Vercel | ~1 minute |
| One feature behind a flag | Set `FLAG_<NAME>=off` in Vercel env, redeploy | ~3 minutes |
| A specific merged change | Revert its PR in GitHub, which redeploys | ~5 minutes |
| Data written by a bad change | Restore the database from backup | depends on provider |

## 1. Instant rollback (Vercel)

Every merge to `main` creates a new Vercel deployment of project `picc-push`.
The previous one stays ready.

- **By hand:** Vercel dashboard, project `picc-push`, Deployments, pick the last
  good one, "Promote to Production" (or "Instant Rollback").
- **By asking an agent:** "roll back piccnewyork.org to the last deploy." An
  agent with the Vercel connector can request the rollback directly.

This puts the old code back live but leaves `main` unchanged. Follow up with a
revert (step 3) so the next deploy does not bring the bad change back.

## 2. Kill switch (feature flags)

Risky changes ship behind a flag in `lib/flags.ts`. Setting the environment
variable `FLAG_<NAME>=off` in Vercel turns the feature off for everyone without
a code change. Example: flag `storeReportTool` is `FLAG_STORE_REPORT_TOOL`.

## 3. Revert a change (version history)

Every change lands as a PR or a commit on `main`, so the full history is in
GitHub. To undo one change, open its PR and click "Revert", or ask an agent:
"revert PR #123." The revert is itself a PR that runs CI and deploys normally.

## 4. Database

Schema changes only ever add tables or columns in normal work (see "Flag lane"
in `AGENTS.md`), so rolling back code never needs a database rollback. Dropping
or deleting data is Approval-lane and needs a backup taken first. Point-in-time
restore depends on the database provider.

## After any rollback

1. Comment on the original PR with what broke and what was rolled back.
2. Open a follow-up issue labeled `agent:claude` or `agent:muse` with the failure details.
3. Fix from the clean baseline, through a normal PR.
