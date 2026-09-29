# Issue 91: CRM reference ownership

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/91
Branch: codex/91-crm-reference-ownership from main 4fde001.

Scope: validate linked account/contact/opportunity/pipeline/stage ownership and compatibility before CRM creates. Out of scope: schema, UI, provider changes, production data changes.
Owned paths: app/api/{contacts,tasks,opportunities,appointments}/route.ts; lib/server/crm-reference-ownership*; focused route tests; SESSION.md.
Overlap: checked PRs 189,182,166,144,135,82; no focused source overlap other than obsolete monorepo rewrite 144. Preserve those active slices.
Architecture: thin API handlers, shared server validation, existing route-error responses. Add RED route/domain tests for cross-org/mismatched references and no writes; GREEN valid paths; full npm run verify. No visual change, browser check limited to existing authenticated workflow availability. Access-control fixes require explicit approval before merge; prepare fully first.
