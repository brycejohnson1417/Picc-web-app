# Issue #231: First-order samples policy alignment + canonical skills home

Branch: fix/231-first-order-samples-policy from main.
Scope: (1) establish skills/ as the canonical home for team skills (skills/README.md rules + the First-Order Samples & Displays skill as one readable .md); (2) align the first-order samples planner/adapter with that skill: split first orders grouped instead of blocked, Net 30 order as the default target, no same-brand strain substitution, Champs displays included, Chopsticks twin 0.5g pack classified as the brand's 1G unit. Price stays $0.01 (confirmed requirement, not in scope to change).
Out of scope: invoicing behavior, per-rep MCP access, the Rep Copilot MCP (#225), new skills beyond the samples skill.
Owned paths: skills/, lib/order-samples/, SESSION.md.
Overlap: builds on merged #230 (issue #229). No overlap with open #225, #223, #219, #217, #215, #211 beyond the shared app shell.
Validation: updated vitest coverage for the planner (split purchase, no substitution, excluded-brand display) and the catalog classification (Chopsticks). npm run verify must pass in CI before merge; it was not run in the authoring environment.
