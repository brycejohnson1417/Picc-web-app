# Rep Copilot MCP server

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/224

Branch: `feat/224-rep-copilot-mcp`, based on current `origin/main` (5cb036b).

Scope: build the MCP server from `docs/PRD-REP-COPILOT-MCP.md`. A thin `POST /api/mcp` route (Streamable HTTP JSON-RPC, per-agent bearer tokens from env, fail closed) over deterministic `lib/server/rep-copilot` modules: `store_report`, `attack_list`, `route_top10`, `order_history`, and a `create_checkin` stub hard-disabled behind `MCP_ENABLE_WRITES=false`. Server-side action-plan rules and attack ranking per the PRD; every report field carries source and as-of.

Owned paths: `app/api/mcp/**`, `lib/server/rep-copilot/**`, `docs/PRD-REP-COPILOT-MCP.md`, `SESSION.md`.

Data boundaries (PRD section 4, refined by the 2026-11-18 data merge): app Postgres territory read model and existing Notion CRM/store-detail services for account data; one Sales NY boundary module covering the SYNC facts, the Headset Connections DB (Notion "NY Headset Connections — CSV (Sheet2-2)", wins headset status), and AR — the "Credit Status" tab of the Google workbook "Nabis Master Sheet" (per-store unpaid orders, amount paid, overdue orders, days overdue, Payment Required Rule; no balance-due column exists or is modeled). Field ownership after the merge: AR wins credit status, payment-required, days overdue, and open-invoice detail over SYNC (a data-verified refinement of the PRD's "SYNC wins money facts" rule, for Travis to confirm); SYNC supplies the remaining order and carry facts; CRM wins contacts/PPP/account status and the why field (CRM "Follow Up Reason"; Proposal Tracker Quick Notes / Store Notes upstream — no "Sales and Why" sheet exists); Distru wins live inventory and marketplace orders; app Postgres wins check-ins and routes. Conflicts are logged, never blocking.

Out of scope: rep-facing UI, any writes (orders, proposals, check-ins), alerts/reminders, glasses clients, schema migrations, retired surfaces. Do Not Target uses the existing account tag infrastructure (tag "Do Not Target"), no new Prisma field.

Approval lane: this adds an auth/access-control surface. The PR pauses with the `@bryce approval requested:` comment; no merge and no production deploy of the endpoint until approval lands on the PR.

Overlap reviewed: open PRs #223, #219, #217, #215, #211, #189, #135, #82. No owned-glob overlap. #211 owns the app-wide Distru connection (`lib/distru/**`, `lib/server/distru-service.ts`, `lib/server/sales-ny-*.ts`, `prisma/**`); the rep-copilot Distru and Sales NY readers stay behind this issue's interfaces so they can rebase onto #211's boundary if #211 lands first. `parallel:exclusive` while the auth surface is in flight.

Plan: failing unit tests first for the action-plan rules, attack ranking, PRD section 6 Daily Green fixture, Do Not Target exclusion, and route ordering, with all external boundaries mocked (no real keys, no database). Then the boundary modules and thin route. `npm run verify` must pass; no browser surfaces change, so no e2e.
