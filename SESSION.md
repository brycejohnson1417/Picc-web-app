# Rep Copilot MCP server

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/224

Branch: `feat/224-rep-copilot-mcp`, based on current `origin/main` (5cb036b).

Scope: build the MCP server from `docs/PRD-REP-COPILOT-MCP.md`. A thin `POST /api/mcp` route (Streamable HTTP JSON-RPC, per-agent bearer tokens from env, fail closed) over deterministic `lib/server/rep-copilot` modules: `store_report`, `attack_list`, `route_top10`, `order_history`, and a `create_checkin` stub hard-disabled behind `MCP_ENABLE_WRITES=false`. Server-side action-plan rules and attack ranking per the PRD; every report field carries source and as-of.

Owned paths: `app/api/mcp/**`, `lib/server/rep-copilot/**`, `docs/PRD-REP-COPILOT-MCP.md`, `SESSION.md`.

Data boundaries (PRD section 4, plus addendum): app Postgres territory read model and existing Notion CRM/store-detail services for account data; one Sales NY boundary module covering the SYNC financial/display facts and the Sales and Why, Headset Connections, and AR sheets (AR wins open invoices and balances, Headset sheet wins headset status, Sales and Why wins the why field; conflicts logged, never blocking); existing cached Nabis module for rating and order history (no second Nabis integration); new Distru boundary (official Distru MCP primary, REST fallback, 15-minute read cache, keys from env only). Field ownership: SYNC wins credit/payment/order facts except AR-owned invoice detail; CRM wins contacts/PPP/account status; Distru wins live inventory and marketplace orders; app Postgres wins check-ins and routes.

Out of scope: rep-facing UI, any writes (orders, proposals, check-ins), alerts/reminders, glasses clients, schema migrations, retired surfaces. Do Not Target uses the existing account tag infrastructure (tag "Do Not Target"), no new Prisma field.

Approval lane: this adds an auth/access-control surface. The PR pauses with the `@bryce approval requested:` comment; no merge and no production deploy of the endpoint until approval lands on the PR.

Overlap reviewed: open PRs #223, #219, #217, #215, #211, #189, #135, #82. No owned-glob overlap. #211 owns the app-wide Distru connection (`lib/distru/**`, `lib/server/distru-service.ts`, `lib/server/sales-ny-*.ts`, `prisma/**`); the rep-copilot Distru and Sales NY readers stay behind this issue's interfaces so they can rebase onto #211's boundary if #211 lands first. `parallel:exclusive` while the auth surface is in flight.

Plan: failing unit tests first for the action-plan rules, attack ranking, PRD section 6 Daily Green fixture, Do Not Target exclusion, and route ordering, with all external boundaries mocked (no real keys, no database). Then the boundary modules and thin route. `npm run verify` must pass; no browser surfaces change, so no e2e.
