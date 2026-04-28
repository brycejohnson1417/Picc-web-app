# PICC Design System

This app is a field operating system for sales, ops, and vendor-day execution. Screens should be dense, fast, and calm. The UI should prioritize records, status, and next action over decorative layout.

## Principles

- Put usable data in the first viewport.
- Keep controls predictable: search first, filters second, records immediately after.
- Surface freshness, loading, empty, and error states wherever data is remote.
- Use motion only for state changes: sheets, selected rows, toasts, active tabs, and loading-to-loaded transitions.
- Prefer compact, high-contrast operational components over marketing-style cards.

## Layout

- Mobile shell max width is controlled by `--app-shell-max`.
- Bottom navigation consumes the lower safe area; fixed action bars must sit above it.
- Cards should use 8px to 12px radius for data records. Large rounded panels are reserved for shell-level containers.
- Data-heavy pages should show at least one real row, skeleton row, or empty state in the first viewport.

## Type

- Use system font unless a full font pass is planned.
- Operational page titles: 16px to 22px.
- Record names: 18px to 24px depending density.
- Helper text: 13px to 15px.
- Avoid viewport-scaled type and negative letter spacing.

## Color

- PICC red `#c93412` is the brand/action accent.
- Blue is for route/navigation affordances.
- Green is for success, selected, and active route state.
- Amber/red banners are reserved for stale data, errors, and destructive actions.
- Do not use a one-hue screen. Data surfaces should balance white, slate, red, blue, and green intentionally.

## Controls

- Search inputs are 44px to 48px high on mobile.
- Primary actions use icon plus text when the command may be unfamiliar.
- Icon-only actions need accessible labels.
- Destructive actions require either confirmation, undo, or a clearly reversible state.

## Data States

- Loading: use skeletons that match the final row shape.
- Empty: explain the active filter/query and provide the next useful action.
- Error: show the failed system, human-readable reason, and retry if available.
- Freshness: show source, last sync, stale/syncing state, and retry/detail where useful.
