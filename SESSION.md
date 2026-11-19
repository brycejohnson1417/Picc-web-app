# Session: Agent workflow, feature flags and rollback

Branch `chore/agent-workflow-flags-rollback`. Labels: `meta:protocol-change`, `parallel:exclusive`.

Scope: automatic Claude review of every PR and direct push to main (`.github/workflows/claude.yml`); the Flag lane and narrowed Approval lane in `AGENTS.md`; agent roles (Muse, Claude, Codex, Dot) and the voice-to-fix loop; `lib/flags.ts` with tests; `docs/ROLLBACK.md`; PR template lane and test-note fields; `FLAG_BETA_EMAILS` in `.env.example`; repo-relative links in `AGENTS.md`.

Out of scope: any app behavior change, schema, Nabis/Distru work, the notion-territory split, dependency changes, branch protection settings (set in GitHub by an admin).

Constraints: no production writes; `ANTHROPIC_API_KEY` must be added as a repo secret before the Claude workflow can run; `FLAG_BETA_EMAILS` must be set in Vercel before any flag is used.
