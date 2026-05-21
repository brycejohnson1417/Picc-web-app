# Session: Issue #79 Follow-Up Date Pin Heatmap

## Issue
- https://github.com/brycejohnson1417/Picc-web-app/issues/79

## Scope
- Add a Follow Up Date option to the territory Pin Colors UI.
- Color territory map pins by follow-up urgency using the provided blue-to-green-to-red heatmap direction.
- Show days until follow-up inside map pins only in Follow Up Date mode.
- Keep Preferred Partner bold pin outline in Follow Up Date mode while suppressing the `P` glyph.

## Out Of Scope
- No Notion, Neon, Supabase, GHL, Nabis, Vercel, schema, auth, or production data writes.
- No map provider changes.
- No unrelated territory search, account-detail, Notion-link, or route-planning behavior changes.

## Owned Paths
- `lib/territory/pin-colors.ts`
- `lib/territory/*.test.ts`
- `components/mobile/store-filter-sheet.tsx`
- `components/mobile/territory-mobile.tsx`
- `components/territory/google-territory-map.tsx`
- `app/api/territory/filter-presets/route.ts`
- `SESSION.md`

## Open PR Overlap Check
- Checked open PR #76. It owns broad `components/mobile/territory-*` search-suggestion paths and `SESSION.md`; this slice avoids search behavior.
- Checked open PR #78. It owns the focused Notion card/link helper and `SESSION.md`; this slice avoids Notion-link behavior.
- During rebase, `SESSION.md` conflicted with the landed issue #77 session note. This branch keeps the current issue #79 scope note.

## Constraints
- Production triage style: surgical, additive, one issue per PR.
- Keep UI components thin; put follow-up date classification/color logic in `lib/territory/pin-colors.ts`.
- The running browser UI is the source of truth for the feature.

## Validation Plan
- RED test first for follow-up date pin color and label classification.
- Then implement the helper/UI wiring.
- Run focused tests, typecheck, lint, full test suite, and build.
- Browser-verify `/territory`: open filters, select Follow Up Date, apply, and confirm map pins show heatmap colors with day labels.
