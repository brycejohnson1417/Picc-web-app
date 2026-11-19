import 'server-only';

import { isEmailAllowed, parseEmailAllowlist } from '@/lib/auth/email-allowlist';

/**
 * Feature flags for changes in risky areas (see "Flag lane" in AGENTS.md).
 *
 * - `off`: nobody sees the change.
 * - `beta`: only the people in FLAG_BETA_EMAILS see it on the live site.
 * - `all`: everyone sees it.
 *
 * A risky change merges to main with its flag at `beta` so Bryce can test it on
 * piccnewyork.org. Turning it on for everyone is a one-line PR that changes
 * `beta` to `all`, which keeps the decision in version history and makes it
 * revertable. In an emergency, setting FLAG_<NAME>=off in Vercel overrides the
 * code without a code change (it takes effect on the next deploy).
 */
export type FlagStage = 'off' | 'beta' | 'all';

export const FLAGS: Record<string, FlagStage> = {
  // Add flags here, e.g. `storeReportTool: 'beta',`
  // Remove a flag (and its checks) once it has been `all` for two weeks.
};

const STAGES = new Set<FlagStage>(['off', 'beta', 'all']);

/** `storeReportTool` -> `FLAG_STORE_REPORT_TOOL` */
export function flagEnvName(name: string) {
  return `FLAG_${name.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^A-Za-z0-9]+/g, '_').toUpperCase()}`;
}

export function resolveFlagStage(
  name: string,
  options: { flags?: Record<string, FlagStage>; env?: Record<string, string | undefined> } = {},
): FlagStage {
  const flags = options.flags ?? FLAGS;
  const env = options.env ?? process.env;
  const override = env[flagEnvName(name)]?.trim().toLowerCase();
  if (override && STAGES.has(override as FlagStage)) {
    return override as FlagStage;
  }
  // Unknown flags fail closed.
  return flags[name] ?? 'off';
}

/** Pass the signed-in user's email, e.g. the `email` returned by `guard()`. */
export function isFeatureEnabled(
  name: string,
  email: string | null | undefined,
  options: { flags?: Record<string, FlagStage>; env?: Record<string, string | undefined> } = {},
): boolean {
  const stage = resolveFlagStage(name, options);
  if (stage === 'all') return true;
  if (stage === 'off') return false;
  const env = options.env ?? process.env;
  return isEmailAllowed(email ?? '', parseEmailAllowlist(env.FLAG_BETA_EMAILS));
}
