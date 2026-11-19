import { describe, expect, it } from 'vitest';
import { flagEnvName, isFeatureEnabled, resolveFlagStage, type FlagStage } from './flags';

const flags: Record<string, FlagStage> = { newReport: 'beta', liveThing: 'all', parked: 'off' };
const env = { FLAG_BETA_EMAILS: 'bryce@piccplatform.com' };

describe('feature flags', () => {
  it('builds the environment override name from the flag name', () => {
    expect(flagEnvName('storeReportTool')).toBe('FLAG_STORE_REPORT_TOOL');
  });

  it('shows beta flags only to beta emails', () => {
    expect(isFeatureEnabled('newReport', 'bryce@piccplatform.com', { flags, env })).toBe(true);
    expect(isFeatureEnabled('newReport', 'BRYCE@piccplatform.com', { flags, env })).toBe(true);
    expect(isFeatureEnabled('newReport', 'ben@piccplatform.com', { flags, env })).toBe(false);
    expect(isFeatureEnabled('newReport', null, { flags, env })).toBe(false);
  });

  it('shows all flags to everyone and off flags to nobody', () => {
    expect(isFeatureEnabled('liveThing', 'ben@piccplatform.com', { flags, env })).toBe(true);
    expect(isFeatureEnabled('parked', 'bryce@piccplatform.com', { flags, env })).toBe(false);
  });

  it('fails closed for unknown flags', () => {
    expect(isFeatureEnabled('typoFlag', 'bryce@piccplatform.com', { flags, env })).toBe(false);
  });

  it('lets an environment variable switch a flag off without a code change', () => {
    const killed = { ...env, FLAG_LIVE_THING: 'off' };
    expect(resolveFlagStage('liveThing', { flags, env: killed })).toBe('off');
    expect(isFeatureEnabled('liveThing', 'ben@piccplatform.com', { flags, env: killed })).toBe(false);
  });

  it('ignores invalid override values', () => {
    expect(resolveFlagStage('liveThing', { flags, env: { FLAG_LIVE_THING: 'maybe' } })).toBe('all');
  });
});
