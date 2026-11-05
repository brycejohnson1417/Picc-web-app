# PICC Design System

This app is a field-sales workspace. Screens should be dense, fast, and calm. Prioritize accounts, geography, sales evidence, and next actions.

## Principles

- Put usable data in the first viewport.
- Keep controls predictable: search first, filters second, records immediately after.
- Surface freshness, loading, empty, and error states wherever data is remote.
- Use motion only for state changes: sheets, selected rows, toasts, active tabs, and loading-to-loaded transitions.
- Prefer compact, high-contrast operational components over marketing-style cards.

## Layout

- Desktop uses a 152px navigation rail and the full remaining viewport, without a simulated mobile frame.
- The map has one contextual work panel: 320px account browser or 396px Store Brief. Opening the brief replaces the browser rather than adding another panel. The map stays mounted.
- Below 1024px, keep mobile bottom navigation and safe-area spacing. Fixed action bars sit above it.
- Keep map tools in a 56px desktop toolbar and compact map controls. No page introduction or KPI wall over the geography.
- Cards should use 8px to 12px radius for data records. Large rounded panels are reserved for shell-level containers.
- Data-heavy pages should show at least one real row, skeleton row, or empty state in the first viewport.

## Type

- Use system font unless a full font pass is planned.
- Operational page titles: 16px to 22px.
- Record names: 18px to 24px depending density.
- Helper text: 13px to 15px.
- Avoid viewport-scaled type and negative letter spacing.

## Color

- PICC red `#c93412` is the brand/action accent. Graphite navigation `#242624`, warm-white surfaces `#fbfcf9`, quiet dividers `#dfe4d7`, and text `#30392a` support daylight use.
- Blue is for route/navigation affordances.
- Green is for success, selected, and active route state.
- Amber/red banners are reserved for stale data, errors, and destructive actions.
- Do not use a one-hue screen. Data surfaces should balance white, slate, red, blue, and green intentionally.

## Controls

- Search inputs are 44px to 48px high on mobile.
- Primary actions use icon plus text when the command may be unfamiliar.
- Icon-only actions need accessible labels.
- Account rows expose location and status with a separate route action. Never delay rows with an index-based animation.
- Reporting charts and totals always name their actual period and value basis. Source details stay in a disclosure. Omit unverified attainment instead of substituting zero.
- Destructive actions require either confirmation, undo, or a clearly reversible state.

## Data States

- Loading: use skeletons that match the final row shape.
- Empty: explain the active filter/query and provide the next useful action.
- Error: show the failed system, human-readable reason, and retry if available.
- Freshness: show source, last sync, stale/syncing state, and retry/detail where useful.
- Freshness controls are collapsed by default on every operational screen. The closed state shows only a compact `Last sync` timestamp plus essential state; source, record counts, errors, and manual actions belong in the disclosure details.
