# Issue 107: Spreadsheet parser hardening

Issue: https://github.com/brycejohnson1417/Picc-web-app/issues/107
Branch: codex/107-spreadsheet-hardening, from main 4fde001.
Scope: replace the vulnerable registry SheetJS version with the official fixed distribution; bound spreadsheet inputs and retain required workbook/CSV behavior.
Owned: package.json, package-lock.json, lib/integrations/sheets.ts, lib/integrations/spreadsheet-input.ts and tests, lib/server/preferred-partner-proposal.ts, SESSION.md.
Out of scope: Prisma tooling, provider changes, schema, production data, UI redesign.
Overlap checked: #195/#194/#189/#182/#166/#135/#82. No source overlap with current changes except SESSION; inspect #135 proposal overlap before implementation and sequence/rebase as needed. Dependency updates exclusive.
Validation: RED malformed/oversized input tests first; GREEN representative workbook/CSV tests; clean npm ci, npm audit, npm run verify. Existing SheetJS API adapter retained; no new parser abstraction beyond input validation.
