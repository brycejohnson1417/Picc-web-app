# PICC Internal Platform Superseded Decisions

This file exists so older plans do not silently re-enter the build.

## Decision Log

| Topic | Older Decision | Superseding Decision | Authority |
|---|---|---|---|
| Root domain behavior | `piccnewyork.org` serves the public PICC NY Wholesale/store-locator experience plus internal app | `piccnewyork.org` is internal-only; public wholesale site is deferred | Latest chat instruction |
| Cooldown | 90-day cooldown by default, 60 with approval | 60-day default cooldown, request-scoped `Override 60-Day Window` for reps/admins | Later plans + latest chat |
| Offer model | Sequential offers to top-ranked BA one at a time | Concurrent offers to all eligible BAs; first acceptance wins | Addendum / later plans |
| GPS policy | GPS required and potentially blocking | GPS is best-effort and non-blocking; flag, do not strand the BA | Addendum / later plans |
| Dutchie flow | Dutchie-tagged stores can defer POS upload until next day | No Dutchie special-case shortcut; BA must upload proof artifact in flow | User correction |
| Public request flow | Tokenized per-store booking links | Single request page in plans, but latest domain direction means store request flow must not make the root domain public; if retained it must fit internal-only domain rules | Later plans + latest chat |
| Tutorial mode | Tutorial mode included in early role-home design | Tutorial mode deferred until after core BA workflow is stable | Latest chat + PLAN 6 |
| Rep/store relationship | Public marketing site remains active on root | Internal app only on root; external site connected later | Latest chat |
| Matching status | Candidate ranking surfaces top 3 and sequentially escalates | Candidate ranking still matters, but dispatch uses concurrent offers | Addendum / later plans |
| Check-in location | Distance/geolocation enforcement may hard-gate completion | Distance is informational and geolocation failure is acceptable | Addendum / later plans |

## Maintenance Rule
Whenever a new instruction changes prior behavior:

1. Update `MASTER_SPEC.md`
2. Add the old vs new decision here
3. Update impacted requirement rows in `REQUIREMENTS_MATRIX.md`
4. Update `BUILD_SEQUENCE.md` if the implementation order changes
