# PICC Web App Frontend UX Audit

Date: 2026-04-28

Scope:

- Live production app tested in the Codex in-app browser at `https://piccnewyork.org`.
- Current signed-in session was used for read-only navigation and interaction testing.
- Local repo inspected at `/Users/brycejohnson/Code/PICC-Web-App`.
- No production records, Notion data, Neon schema, Vercel config, or auth settings were mutated.

Evidence:

- Live interaction screenshots: `/var/folders/mk/25bhkgbs4533_cz886tkx9yh0000gn/T/picc-live-audit-1777354667629`
- Design-focused screenshot pass: `/var/folders/mk/25bhkgbs4533_cz886tkx9yh0000gn/T/picc-design-roast-1777355495345`
- Local checks already run during the audit:
  - `npm run typecheck`: passed
  - `npm run lint`: passed
  - `npm test`: passed, 6 files / 51 tests
  - `npm run build`: passed

## Important Correction

Production does have a working database and live data. The earlier "no database" observation was local-only: the local `DATABASE_URL` pointed at `localhost:5432`, but no local Postgres listener was available in this environment.

That means production screens should be judged as real app behavior. Local setup still needs a proper database bootstrap path so frontend work can be verified without guessing.

## Executive Read

The app is materially useful, and the real workflows are there: map, accounts, route planning, vendor days, dashboard, account detail, AI proposal, orders, history, settings, and command palette. The problem is that the design language is not yet disciplined enough for an expert-designed internal operating system.

The product feels like three generations of UI living in the same shell:

- The map is the strongest surface because it is immediate and task-shaped.
- Accounts and route are close to useful, but their spacing, overlays, and picker behavior slow the user down.
- Home, settings, reports, tasks, and parts of vendor days feel more like placeholder product pages than field-operating tools.
- The bottom nav creates real layout collisions and makes several screens feel unfinished.
- Subtle craft is inconsistent: typography scale, input rhythm, motion, focus states, panel transitions, empty states, and active states all need one system.

## Priority Findings

### P0 - Breaks Trust Or Core Workflow

1. Production console shows repeated React hydration failures.
   - Evidence: live production console reported repeated `Minified React error #418`.
   - Impact: this can cause mismatched UI, broken event binding, flicker, or invisible client-side state bugs.
   - Likely fix mode: old-app surgical fix.
   - Suggested next step: reproduce in production build locally or Vercel preview, capture component stack in development mode, and fix the server/client markup mismatch.

2. Bottom navigation overlaps app content and action bars.
   - Evidence: route action bar, calendar rows, dashboard content, reports cards, vendor day forms, and account detail bottom actions all collide visually with the fixed nav.
   - Impact: users lose visible content and some controls feel cramped or partially hidden.
   - Likely fix mode: old-app surgical fix.
   - Suggested next step: define a shared shell token such as `--bottom-nav-height`, apply it to scroll containers, sticky action bars, sheets, and account detail overlays, then test at mobile and desktop widths.

3. Route account picker appears blank in the tested viewport.
   - Evidence: `interaction_route_choose_accounts.png` showed search and alphabet rail, but no account rows visible.
   - Impact: route building is a primary field workflow; a blank picker feels broken even if data exists below or behind the viewport.
   - Likely fix mode: old-app surgical fix.
   - Suggested next step: make the picker show visible results immediately, add a result count, add loading/empty states, and pin the first result row above the fold.

4. Dashboard live data is stale.
   - Evidence: production dashboard warned `Nabis orders are more than 1 hour stale`; sync lag was roughly 221 to 234 minutes during testing. Last order sync shown: Apr 27, 2026, 9:58 PM. Retailers shown: Apr 22, 2026, 4:10 AM.
   - Impact: this undermines the sales dashboard as an operating surface.
   - Likely fix mode: old-app surgical fix for freshness visibility; deeper sync reliability may be backend/ops.
   - Suggested next step: add a stronger stale-data state with last successful sync, failed job cause if known, retry availability, and a visible "what data is stale" explanation.

5. Primary navigation hides major product areas.
   - Evidence: bottom nav exposes Home, Map, Accounts, Route, Dashboard. Calendar, Contacts, Settings, Vendor Days, Reports, Tasks, and Request Vendor Day are hidden behind profile, command palette, or direct URLs.
   - Impact: real app capability feels missing to normal users.
   - Likely fix mode: old-app surgical fix if implemented as an "All tools" drawer or command trigger; larger IA redesign may be rebuild-only.
   - Suggested next step: add a visible tools/menu entry or role-aware hub without expanding the bottom nav past five items.

### P1 - Damages Daily Usability

6. Accounts page burns the first viewport on filters instead of accounts.
   - Evidence: `/accounts` first viewport shows title, tabs, search, five filter selects, alphabet rail, and bottom nav. Account rows start below the fold.
   - Impact: the page says "find and open store context fast" but makes the user scroll before seeing stores.
   - Likely fix mode: old-app surgical fix.
   - Suggested next step: collapse secondary filters behind a filter sheet, keep search and active chips visible, and show account results in the first viewport.

7. Account search lacks immediate feedback.
   - Evidence: after searching `Buffalo`, the first viewport still looked like filters plus no visible results.
   - Impact: users cannot tell if search is running, empty, filtered out, or below the fold.
   - Likely fix mode: old-app surgical fix.
   - Suggested next step: show result count, active query chip, and empty/result state directly below search.

8. Alphabet rail collides with account content and screen edge.
   - Evidence: `/accounts` rail sits hard on the right edge over a dense filter area.
   - Impact: it feels cramped, accidental, and hard to use with a thumb.
   - Likely fix mode: old-app surgical fix.
   - Suggested next step: only show the rail when the result list is visible, give it a hit target column, and fade it until scroll/drag.

9. Contacts cards have severe contrast problems.
   - Evidence: `/contacts` cards use very dark backgrounds with nearly invisible names and labels.
   - Impact: users cannot scan contacts quickly.
   - Likely fix mode: old-app surgical fix.
   - Suggested next step: use either light cards or a true dark-card token set with accessible text colors.

10. Contacts filters button activates with no obvious visible panel.
    - Evidence: clicking Filters changed button state, but no clear filter surface appeared in the current viewport.
    - Impact: users read this as a dead button.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: open a modal/sheet with animated entrance, focus trap, applied count, reset, and apply/cancel.

11. Territory map has high marker density with limited visual hierarchy.
    - Evidence: the map works and shows many pins, but pins pile into dense clusters around active sales regions.
    - Impact: the map becomes noisy before the user gets an answer.
    - Likely fix mode: old-app surgical fix if clustering/legend is scoped; richer territory analytics may be rebuild-only.
    - Suggested next step: cluster by zoom, add a compact legend, reduce pin prominence when not selected, and make selected account state unmistakable.

12. Territory layers expose destructive actions too casually.
    - Evidence: saved territory and home marker rows show Edit, Visibility, and Delete controls side by side.
    - Impact: accidental destructive taps are too easy.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: move Delete behind row menu or require confirmation with object name and undo toast.

13. Route empty state is oversized and not operational enough.
    - Evidence: `/route` shows "Let's hit the road!" at hero scale and a huge `Choose Accounts` button.
    - Impact: it feels like onboarding copy, not a field tool a rep uses repeatedly.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: replace with compact route builder state: selected count, recent routes, nearby accounts, start point, optimize mode, and choose accounts.

14. Route bottom action bar fights the global bottom nav.
    - Evidence: route has `GO`, optimize, save, clear, calendar action bar stacked above the primary nav.
    - Impact: bottom area becomes a control pile-up.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: use one route-specific sticky footer that accounts for the global nav, or lift route actions into the route screen header after accounts are selected.

15. Calendar event pills truncate too aggressively.
    - Evidence: vendor-day events in month cells are cut off and lower rows are crowded by nav.
    - Impact: users cannot understand the schedule at a glance.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: add agenda mode, selected-day drawer, and event count badges in month cells.

16. Vendor days request form feels like a generic native form.
    - Evidence: Requests tab opens a form, but the select is huge/native and bottom nav covers the lower form area.
    - Impact: creating requests feels less polished than reviewing them.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: use the app's controlled input style, clear required states, sticky submit/cancel, save progress, and success/error toast.

17. Account detail bottom actions truncate important labels.
    - Evidence: the first action shows `add to...`.
    - Impact: a core action lacks confidence.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: use icon-only actions with tooltips/labels in a details drawer, or shorten to `Route`.

18. Account Location tab has unavailable Street View but leaves the workflow feeling dead.
    - Evidence: it shows "Street View preview unavailable. Tap to open Street View" while `Open Street View` appeared disabled.
    - Impact: user sees a promise and a blocked action.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: provide exact unavailable reason, fallback to map directions, and avoid disabled primary-looking actions without explanation.

19. AI proposal workflow requires paste-in JSON/CSV.
    - Evidence: account AI tab asks the user to paste Headset JSON/CSV into a large textarea.
    - Impact: this is power-user friction and does not feel fully integrated.
    - Likely fix mode: likely rebuild or larger integration unless existing data source can be connected safely.
    - Suggested next step: add file upload, parse preview, validation, mapping review, and saved proposal history in the UI.

20. Reports page mostly shows zero metrics.
    - Evidence: production `/reports` looked mostly empty/zero.
    - Impact: users read it as unfinished or broken.
    - Likely fix mode: old-app surgical fix for empty state; data model may be larger.
    - Suggested next step: show "no data for this period" with date controls, data freshness, and next action instead of quiet zero cards.

21. Tasks page is nearly blank.
    - Evidence: `/tasks` shows "Task Queue" with little else.
    - Impact: hidden or empty workflow looks abandoned.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: add useful empty state, task creation, filters, ownership, due dates, and clear "no tasks match" messaging.

22. Command palette is useful but too hidden.
    - Evidence: command palette opens from keyboard shortcut and contains real navigation/actions, but there is no obvious UI affordance for normal mobile users.
    - Impact: a strong navigation escape hatch is discoverable only by accident.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: add a visible command/search button in the header or profile menu, then animate the palette in with a clear search field.

23. Settings reads like a marketing/placeholder page in places.
    - Evidence: large blue hero: "Keep people, policies, and integrations in one control room."
    - Impact: internal admin users need controls first, not positioning copy.
    - Likely fix mode: old-app surgical fix.
    - Suggested next step: make settings a dense index with status chips, counts, warnings, permissions, and last-updated states.

### P2 - Polish, Design System, And Expert Feel

24. No local `DESIGN-SYSTEM.md`, `DESIGN.md`, or `PRODUCT.md` was found.
    - Evidence: repo search found none at max depth 3.
    - Impact: visual decisions are being made per component, which explains the inconsistent product feel.
    - Likely fix mode: old-app surgical doc plus gradual implementation.
    - Suggested next step: create a compact design system doc before large UI work: tokens, type scale, spacing, motion, shell rules, card rules, form rules, empty states, data freshness, and destructive actions.

25. Typography scale is inconsistent and often too theatrical.
    - Evidence: `components/mobile/route-mobile.tsx` uses `text-[56px]` for a repeated workflow. Many components use one-off hard-coded sizes and tracking.
    - Impact: the app feels designed screen-by-screen instead of system-first.
    - Likely fix mode: old-app surgical if tokenized gradually.
    - Suggested next step: define 6 to 8 semantic text roles and remove one-off display sizes from operational screens.

26. The font choice is okay but not tuned.
    - Evidence: global CSS uses `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`; Tailwind config has a small custom scale, but most components bypass it.
    - Impact: text looks serviceable, not premium.
    - Likely fix mode: old-app surgical.
    - Suggested next step: either keep system font and tune weight/line-height/letter spacing, or adopt a deliberate app font such as Geist with clear tokens. Do not just swap fonts without cleaning scale.

27. Card radius and elevation are inconsistent.
    - Evidence: shell uses rounded 28px on desktop, many cards use 18px/2xl/3xl, inputs use rounded-lg, route button uses rounded 38px.
    - Impact: the UI reads playful and accidental instead of precise.
    - Likely fix mode: old-app surgical.
    - Suggested next step: cap operational cards at 8 to 12px radius, use larger radii only for sheets/nav/shell, and remove mixed decorative rounding.

28. Motion is underused where it would clarify state.
    - Evidence: `framer-motion` is installed, but visible transitions are mostly simple Tailwind hover/active changes.
    - Impact: panels and state changes feel abrupt or invisible.
    - Likely fix mode: old-app surgical.
    - Suggested next step: add motion only to stateful moments: sheet entrance, command palette, nav active indicator, filter chips, row selection, route reorder, stale-data banner, and toast confirmation.

29. Motion should be functional, not decorative.
    - Target: 150 to 220ms transitions, `ease-out` for entering, `ease-in` for leaving, small y/opacity shifts for sheets, no bouncy marketing animation.
    - Impact: the app will feel faster and more expensive without becoming flashy.

30. Input rhythm is inconsistent.
    - Evidence: accounts search, filters, dashboard date fields, vendor request selects, and settings cards use different sizes and density.
    - Impact: every page makes the user relearn controls.
    - Likely fix mode: old-app surgical.
    - Suggested next step: define one mobile input height, one compact toolbar input, one select style, and one sheet form style.

31. Buttons do not share a clear hierarchy.
    - Evidence: red segmented controls, blue route button, black dashboard button, dark contacts buttons, green GO button, white outline exports.
    - Impact: primary action meaning changes by page.
    - Likely fix mode: old-app surgical.
    - Suggested next step: define primary, secondary, destructive, success, quiet, and icon button variants with consistent color semantics.

32. The app overuses large explanatory copy.
    - Evidence: route, settings, reports, and home use big narrative text in workflows where users need action density.
    - Impact: it feels less like an expert tool and more like a demo.
    - Likely fix mode: old-app surgical.
    - Suggested next step: move explanations into concise helper text, empty states, or tooltips. Let data and controls lead.

33. Active states are sometimes visible but not polished.
    - Evidence: bottom nav turns icon/text white; segmented tabs turn red; map controls ring. These work, but they do not feel like one system.
    - Impact: users can tell what is selected, but the product lacks crispness.
    - Likely fix mode: old-app surgical.
    - Suggested next step: use one active-state pattern: subtle filled surface, 1px border, strong text, optional icon tint, and animated active indicator.

34. Focus states and keyboard affordances need a pass.
    - Evidence: command palette exists, but most mobile-first controls do not visibly advertise focus/shortcut behavior.
    - Impact: power users do not get the "expert app" feel.
    - Likely fix mode: old-app surgical.
    - Suggested next step: add consistent focus-visible rings, visible command entry, and keyboard-accessible dialogs.

35. Empty states are too weak.
    - Evidence: tasks, reports, search/no-result scenarios, unavailable Street View, and possibly filters have weak or confusing empty states.
    - Impact: users cannot tell if they should act, wait, clear filters, or report an issue.
    - Likely fix mode: old-app surgical.
    - Suggested next step: empty states should include cause, next action, and recovery.

36. Loading states are too generic.
    - Evidence: repo has several `animate-spin` and pulse loaders, but screenshots showed little progressive loading context.
    - Impact: users perceive slow or blank states as broken.
    - Likely fix mode: old-app surgical.
    - Suggested next step: use skeletons that match final layout and inline status messages for data-heavy pages.

37. Desktop layout wastes or misuses available width.
    - Evidence: desktop browser screenshots show a fixed mobile/tablet shell with many mobile assumptions.
    - Impact: on laptops, operational density could be much better.
    - Likely fix mode: larger design pass; some surgical improvements possible.
    - Suggested next step: keep mobile-first for field reps but add responsive split panes for accounts, route, dashboard, and settings on wider screens.

38. Data freshness deserves a system-wide component.
    - Evidence: dashboard shows stale sync, home has freshness content, settings mentions integrations.
    - Impact: data confidence is scattered.
    - Likely fix mode: old-app surgical.
    - Suggested next step: one freshness badge/banner pattern with source, last sync, age, status, retry, and detail link.

39. The app lacks subtle "saved/applied" feedback.
    - Evidence: filters, route actions, layer visibility, and settings controls need more visible confirmation.
    - Impact: users repeat actions because they are unsure if the app listened.
    - Likely fix mode: old-app surgical.
    - Suggested next step: use optimistic state, small pressed animation, toast, and temporary success icon.

40. Visual language mixes consumer mobile and enterprise admin.
    - Evidence: route hero and giant rounded buttons feel consumer/onboarding; dashboard and settings are admin; map is field utility.
    - Impact: product identity feels split.
    - Likely fix mode: design system plus gradual screen cleanup.
    - Suggested next step: choose "field operating system" as the dominant language: dense, clear, tactile, fast, quiet.

## Screen-By-Screen Notes

### Home

- Large narrative sections compete with actual operating tasks.
- Good candidate for a role-aware command center, not a landing page.
- Show the next best action first: overdue follow-ups, today's vendor days, stale sync warnings, active route, recently opened accounts.
- Compress copy. Increase signal density. Give every card a job.

### Territory Map

- Strongest core screen because it immediately shows live territory context.
- Marker density needs clustering and hierarchy.
- Overlay controls should animate in/out and feel physically anchored.
- Layers/filter sheets should use one sheet pattern and keep apply/cancel out of the global nav collision zone.
- Selected store state should be more premium: dim non-selected pins, raise selected card, show route/add/navigate actions as one compact action group.

### Accounts

- Search should dominate, but filters currently dominate.
- The account list needs to appear immediately.
- Filters should become a compact sheet with active chips.
- Alphabet rail should be contextual, not always slammed against the edge.
- Search needs result count and direct no-result recovery.

### Account Detail

- The tab structure is useful.
- Bottom action labels need to stop truncating.
- Location tab needs a better fallback when Street View is unavailable.
- AI tab is a powerful idea trapped in a paste box. It needs upload, mapping, validation, preview, and saved output history.
- Orders and History are useful and should feel more like the canonical account timeline.

### Route

- Current empty state is too big and too cute for repeated field use.
- The route builder should feel like a cockpit: selected accounts, optimize mode, start point, travel method, saved routes, and launch.
- Account picker must show rows in the first viewport.
- Route action bar must stop colliding with bottom nav.
- Route reordering should have tactile drag/press motion.

### Dashboard

- Useful data, but stale sync warning needs sharper hierarchy.
- Date controls take too much space and do not feel like one component group.
- Export actions are useful but should be visually secondary.
- Metrics should expose freshness and exclusions in a consistent way.
- Charts/tables should be the first meaningful content after controls, not pushed down by chunky inputs.

### Calendar

- Month grid is familiar but cramped.
- Event truncation makes it hard to scan.
- Add day agenda drawer and event count badges.
- Bottom nav collision makes the calendar feel less trustworthy.

### Vendor Days

- The operational idea is clear.
- Requests form needs proper app-native controls.
- Request creation needs clear save/cancel states, validation, and confirmation.
- Long forms need bottom-safe padding and a sticky action footer that respects nav height.

### Contacts

- Contrast is the biggest issue.
- Filters need a real visible panel.
- Cards need better hierarchy: name, account, role, phone/email actions, status.
- Bulk/export actions should be toolbar actions, not mixed into the top form blob.

### Reports

- Zero states make it feel unfinished.
- Add date/range selection, data source status, and useful empty explanations.
- If data is unavailable, make that explicit.
- If reports are not production-ready, hide them from primary user flows or label them clearly for admins.

### Tasks

- Too empty to feel like a real workflow.
- Needs queue filters, ownership, due date, priority, create task, and empty state.
- If tasks are not backed by real data, do not expose the screen to regular users.

### Settings

- Should be a control index, not a positioning page.
- Replace hero copy with status-oriented modules.
- Surface integrations, access, usage, role policy, team activity, and support states with badges and last-updated metadata.
- Settings is where trust is built; it should feel precise and boring in the best way.

### Command Palette

- The command list is useful.
- Make it visible through a header icon/search affordance.
- The palette should open with a crisp fade/scale, focused search input, grouped commands, and keyboard hints.
- Mobile users need a discoverable equivalent.

## Design-Craft Roast

I opened the app again looking only at craft, and the first thing that hit me is that this does not yet feel like one expert designed it. It feels like a real field-sales product got wrapped in a bunch of individually decent screens, but nobody came back with a knife and made the whole thing sing.

The map is carrying the product. When I land there, I immediately understand the job: stores, territory, pins, filters, route context. Then I go to Route and suddenly I am staring at a giant "Let's hit the road!" billboard like I just installed a consumer fitness app. This is a daily work tool. I do not need a pep talk every morning. I need my next stop, travel time, and the cleanest way to build a route.

Accounts is close, but it is buried under its own controls. The page promises fast store context, then makes me look at five dropdowns before I see a single store. That is not fast. That is a filing cabinet. Collapse the filters, show me results, and let me refine after I have context.

Contacts is the roughest visual miss. Those dark cards make the names disappear. It is not edgy; it is just hard to read. In an expert app, contrast is not decoration. Contrast is productivity.

The bottom nav is acting like it owns the entire app. It covers forms, crowds route actions, steals space from calendar rows, and makes the whole shell feel like it was never measured as a system. This should be one shared layout contract, not every screen fighting for the last 84 pixels.

The typography needs adult supervision. Some screens use compact operational text, others use huge emotional headings, and a lot of components hard-code sizes like the app has no type scale. Pick a scale. Use it everywhere. Let bold data feel important because of hierarchy, not because a random screen shouted louder.

The motion is almost absent in the places where it would matter. Sheets should slide with intention. Filter chips should apply with a tiny state change. Route selections should feel tactile. The command palette should feel fast and precise. Right now, state changes often just happen. Expert apps make state changes understandable without being flashy.

Settings is trying too hard to sound strategic. I do not need "one control room" as a hero moment. I need to see who has access, which integrations are healthy, what is stale, what changed recently, and what needs attention. The less it sounds like a pitch deck, the more trustworthy it becomes.

Reports and Tasks are not allowed to look this empty if they are in production navigation. Empty is fine. Unfinished is not. An expert-designed app tells me why there is no data, what filter/range I am in, and what I can do next.

The app has real bones. The issue is not that it lacks features. The issue is that the craft layer is inconsistent: spacing, density, motion, active states, text hierarchy, empty states, and navigation all need to be tightened until every screen feels like the same product with the same opinion.

## Subtle Improvements With High UX Impact

1. Add a shared bottom-safe layout token.
   - One source of truth for nav height, safe area, sticky footers, sheets, and scroll padding.
   - This fixes many visible collisions without redesigning the app.

2. Replace page heroes with compact operational headers.
   - Use title, status chip, primary action, secondary menu, and freshness indicator.
   - Keep hero-scale text out of repeated workflows.

3. Build one sheet/dialog motion pattern.
   - Enter: 180ms ease-out, opacity 0 to 1, y 12px to 0.
   - Exit: 120ms ease-in.
   - Apply to filters, layers, route picker, account actions, command palette.

4. Add tactile pressed states.
   - Buttons and rows should compress or shade slightly on tap.
   - Keep it subtle: 0.98 scale or background tint is enough.

5. Animate active nav and segmented controls.
   - Use a small active pill/indicator that moves instead of hard swapping color.
   - This makes navigation feel continuous and intentional.

6. Make filters chip-first.
   - Primary view: search plus active chips.
   - Secondary view: filter sheet.
   - Add result counts and clear-all.

7. Normalize form controls.
   - One input height.
   - One select style.
   - One label style.
   - One validation/error style.
   - Native selects should not visually dominate polished workflows.

8. Add result and empty-state grammar.
   - Searching: "Searching accounts..."
   - Results: "14 accounts for Buffalo"
   - Empty: "No accounts match Buffalo with these filters"
   - Recovery: "Clear filters"

9. Use status color consistently.
   - Red: destructive or critical stale.
   - Blue: neutral/product action.
   - Green: success/ready/go.
   - Amber: warning/attention.
   - Do not let each page invent meanings.

10. Give data freshness a reusable component.
    - Source, age, last sync, status, retry, detail.
    - Use it on dashboard, home, settings, reports, and any import-backed screen.

11. Improve map hierarchy.
    - Cluster at low zoom.
    - Fade non-matching pins during search/filter.
    - Raise selected pin and selected account card.
    - Keep legend visible but compact.

12. Make destructive actions safer.
    - Delete should not sit beside routine actions without confirmation.
    - Use confirmation copy with object name and undo where possible.

13. Promote command/search affordance.
    - Add an icon button in the header.
    - Open command palette with visible search field and grouped actions.
    - Keep keyboard shortcut for power users.

14. Tune spacing to an 8px grid.
    - Screen gutters, card padding, row gaps, toolbar gaps, and sheet padding should all snap to a predictable rhythm.
    - This is the fastest way to make the app feel designed.

15. Reduce radius variance.
    - Operational cards: 8 to 12px.
    - Sheets/nav/shell: larger allowed.
    - Giant pill buttons only when the shape means something.

16. Add real list affordances.
    - Rows should have hover/pressed state, clear primary/secondary text, status, and action affordance.
    - Avoid card stacks where a table/list would scan faster.

17. Make saved/applied feedback visible.
    - Filters applied, layer toggled, route saved, account added, request submitted.
    - Use toast plus small inline state change.

18. Add skeletons that match final layout.
    - Avoid spinners for big lists.
    - Skeleton rows make loading feel intentional and reduce perceived latency.

19. Clean up marketing language.
    - Internal tools should sound like tools.
    - Prefer exact labels over persuasive copy.

20. Create the missing design system doc.
    - Keep it portable and short.
    - Define tokens and behavior rules before another large UI pass.

## Safe Old-App Surgical Fixes

These are reasonable to fix in the current production app one issue per PR:

- Hydration error reproduction and fix.
- Bottom nav safe-area/layout contract.
- Route account picker first-viewport results/loading/empty states.
- Accounts filter collapse and result count.
- Contacts contrast fix.
- Contacts filter sheet visibility.
- Dashboard stale-data banner upgrade.
- Calendar bottom padding and selected-day agenda.
- Vendor request form bottom padding and submit/cancel footer.
- Account detail action label cleanup.
- Command palette visible launch affordance.
- Settings hero compression into control index.
- Reports/tasks empty states.
- Shared button/input/focus/motion tokens where they do not require rewiring data flows.

## Larger Redesign Or Rebuild-Only Work

These should be planned carefully and not forced into a fragile old-app patch:

- Full responsive desktop information architecture.
- Deep account AI proposal integration beyond paste/upload/preview.
- Unified cross-source data freshness console.
- Full design-system migration across every component.
- Advanced map clustering/territory analytics if it changes backend contracts.
- Role-specific navigation model across all user types.
- Full task management model if current tasks are not backed by production-ready data.

## Recommended Next PR Order

1. Fix the shell: bottom nav height, safe area, scroll padding, sticky action collision.
2. Fix route account picker visibility and route empty/action layout.
3. Fix accounts search/filter hierarchy.
4. Fix contacts contrast and filter sheet.
5. Fix dashboard stale-data messaging and freshness component.
6. Add visible command palette trigger.
7. Add empty states for tasks/reports.
8. Create and adopt `DESIGN-SYSTEM.md` before broader visual refactors.

## Definition Of Done For UI Polish PRs

- Tested in the live-style browser viewport and a desktop viewport.
- Screenshots captured before and after.
- No bottom nav overlap.
- No hidden primary action.
- Loading, empty, error, and success states visible.
- Keyboard/focus behavior checked for dialogs and command surfaces.
- No new placeholder-only UI.
- No production data mutation during visual QA unless explicitly part of the feature.
