# Performance Reports

This directory stores baseline/final measurements for the optimization PRs.

## Commands

1. Build production bundle:
   ```bash
   npm run build
   ```
2. Run bundle analyzer:
   ```bash
   npm run analyze
   ```
3. Run Lighthouse CI collection/assertions:
   ```bash
   npm run perf:lighthouse
   ```

## Route Targets (mobile)

- `/dashboard`: Performance >= 80, LCP <= 2.8s
- `/accounts`: Performance >= 80, LCP <= 2.8s
- `/territory`: Performance >= 70

Update both `baseline.md` and `final.md` with metrics used in each PR description.
