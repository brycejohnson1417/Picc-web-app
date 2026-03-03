# Legacy PR Supersession Note

## Context
Two prior PRs were closed as superseded because they targeted legacy `src/*` Vite surfaces instead of the active Next.js app-router surface (`app/*`, `components/*`, `lib/*`).

Closed PRs:
- #1 `fix/build-warnings-and-dependencies...`
- #2 `feat: prep map-first optimization plan + initial perf split`

## What to keep
From those PRs, retain only planning intent:
- map-first/mobile-first CRM direction
- performance guardrails and bundle discipline
- architecture preference for normalized data models over direct UI coupling to source schema

## What not to port
- Legacy Vite `src/*` UI rewrites
- Dependency changes unrelated to active Next.js implementation path
- Build tweaks that do not apply to current app-router bundle strategy

## Going forward
All new implementation PRs must target active production surfaces only:
- `app/*`
- `components/*`
- `lib/*`
- `prisma/*` (if needed for persistence model updates)
