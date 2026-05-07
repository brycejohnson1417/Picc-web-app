# Current Session

- Install the anti-slop operating contract for this repo.
- Add GitHub issue templates for bugs, features, and tasks.
- Add a pull request template that requires issue linkage, scope, validation, risk, and production proof.
- Add the agent/prod-proof/type/priority/area label contract that future issues and PRs will use.
- Add `npm test` to CI so tests are part of the merge gate.

# Out Of Scope

- Do not implement Nabis sync/dashboard issues #41-#45 in this PR.
- Do not change application runtime behavior.
- Do not modify production data, schemas, Vercel settings, or GitHub branch protection from this PR.
- Do not add broad architecture rewrites, Playwright suites, or secret-scanning workflows until tracked in their own issues.

# Constraints

- Keep this as a repo-governance slice tied to issue #47.
- Keep PR size near the 10-file limit.
- Use issue #47 for the repo-specific rollout and keep PR #46 focused on PPP cached Nabis lines.
- Branch protection and org-default `.github` setup require separate admin verification.
