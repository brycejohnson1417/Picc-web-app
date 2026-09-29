# Issue 199: Mailjet consolidation

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/199
Branch: codex/199-mailjet-consolidation from main 5feada8.
Scope: encrypted org-scoped Mailjet configuration, admin settings/status/validation/test-send/disconnect, existing alert/debrief callers, honest paused scheduler controls, additive provider enum migration.
Owned: lib/server/mailjet*.ts; lib/email/mailjet*.ts; app/api/integrations/mailjet/**; components/settings/mailjet-connection-card.tsx; components/settings/follow-up-preferences-card.tsx; components/mobile/settings-mobile.tsx; lib/server/{transactional-email,daily-briefing-email,daily-briefing,nabis-identity-conflicts,nabis-identity-conflict-admin}*.ts; prisma/schema.prisma and new mailjet enum migration; env example; focused E2E; SESSION.md.
Out of scope: customer campaigns, scheduled activation, old table deletion, active data migration, marketing UI.
Architecture: existing IntegrationConnection holds encrypted credentials, deterministic per-org connection ID; server boundary owns Mailjet requests. Use a dedicated application encryption key, never return secrets. Standard Settings controls and existing DESIGN-SYSTEM; product register, daylight mobile use, restrained color and clear status.
Overlap: #135 settings-mobile and #195 daily-briefing require rebase before their release; #195 remains blocked. #198 packages do not overlap. Checked #194,#189,#182,#166,#82. Schema exclusive.
Tests: RED Mailjet response/error cases and admin/org guards; GREEN send contract and encrypted persistence; actual browser controls including bad credentials/network and save/cancel; full verify. No live send without approved test recipient. Schema/env changes approval-lane.
