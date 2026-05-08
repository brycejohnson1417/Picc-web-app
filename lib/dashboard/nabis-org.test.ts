import { describe, expect, it } from 'vitest';
import { DEFAULT_NABIS_DASHBOARD_ORG_ID, resolveNabisDashboardOrgId } from '@/lib/dashboard/nabis-org';

describe('resolveNabisDashboardOrgId', () => {
  it('uses the proven production Nabis cache org by default', () => {
    expect(resolveNabisDashboardOrgId({})).toBe(DEFAULT_NABIS_DASHBOARD_ORG_ID);
  });

  it('does not let generic shared org routing override Nabis analytics cache routing', () => {
    expect(
      resolveNabisDashboardOrgId({
        PICC_SHARED_ORG_ID: 'org_picc_demo',
      }),
    ).toBe(DEFAULT_NABIS_DASHBOARD_ORG_ID);
  });

  it('allows dashboard-specific org overrides when explicitly configured', () => {
    expect(resolveNabisDashboardOrgId({ NABIS_DASHBOARD_ORG_ID: 'org_custom_dashboard' })).toBe('org_custom_dashboard');
    expect(resolveNabisDashboardOrgId({ PICC_NABIS_ORG_ID: 'org_custom_nabis' })).toBe('org_custom_nabis');
  });
});
