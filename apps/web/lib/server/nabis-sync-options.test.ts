import { describe, expect, it } from 'vitest';
import { nabisCronSyncOptions, nabisDashboardRefreshSyncOptions, nabisManualSyncOptions } from '@/lib/server/nabis-sync-options';

describe('Nabis sync CRM mirroring options', () => {
  it('enables CRM mirroring for scheduled cron retailer syncs', () => {
    expect(nabisCronSyncOptions()).toEqual({ syncCrm: true });
  });

  it('enables CRM mirroring when the dashboard manually refreshes Nabis data', () => {
    expect(nabisDashboardRefreshSyncOptions()).toEqual({ reconciliation: false, syncCrm: true });
  });

  it('keeps manual admin syncs local-only unless CRM mirroring is explicitly requested', () => {
    expect(nabisManualSyncOptions('nabis-retailers', {})).toEqual({ syncCrm: false });
    expect(nabisManualSyncOptions('nabis-retailers', { syncCrm: true })).toEqual({ syncCrm: true });
    expect(nabisManualSyncOptions('nabis-orders', { syncCrm: true })).toEqual({ syncCrm: false });
    expect(nabisManualSyncOptions('nabis-historical-backfill', { syncCrm: true })).toEqual({ syncCrm: false });
  });
});
