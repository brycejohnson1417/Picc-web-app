# Codex Review / Implementation Prompt

You are reviewing and implementing against PR request specs in this repository.

## Inputs
- `implementation_plan.md`
- `PR-01-map-first-architecture.md`
- `PR-02-performance-mobile.md`

## Required behavior
1. Read all three docs first.
2. Propose an implementation sequence with smallest safe slices.
3. Implement code changes incrementally.
4. Run build and relevant tests after each slice.
5. Keep commits scoped and message quality high.
6. Produce a final review note with:
   - what changed
   - before/after bundle metrics
   - known risks
   - rollback notes

## Constraints
- No breaking auth/session flows.
- Keep legacy tabs available while migrating architecture.
- Prefer additive + feature-flagged changes when risk is non-trivial.

## Deliverables
- Ready-to-review branch commits.
- PR body draft including:
  - Summary
  - Screenshots (mobile + desktop)
  - Build stats
  - Test checklist results
