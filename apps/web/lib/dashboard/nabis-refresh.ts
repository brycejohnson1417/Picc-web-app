import type { NabisDashboardResponse } from '@/lib/dashboard/nabis-types';

export function withBackgroundManualRefreshStarted(payload: NabisDashboardResponse, startedAt: string): NabisDashboardResponse {
  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      manualRefresh: {
        status: 'background-started',
        startedAt,
      },
    },
  };
}
