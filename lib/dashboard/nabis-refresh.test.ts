import { describe, expect, it } from 'vitest';
import { withBackgroundManualRefreshStarted } from '@/lib/dashboard/nabis-refresh';
import type { NabisDashboardResponse } from '@/lib/dashboard/nabis-types';

function dashboardPayload(): NabisDashboardResponse {
  return {
    orders: [],
    analytics: {
      totalRevenue: 0,
      totalOrders: 0,
      activeSalesReps: 0,
      monthlyTrend: [],
      repStats: [],
      repMonthlyMetrics: [],
      dataNotes: [],
    },
    metadata: {
      fetchedAt: '2026-05-21T14:00:00.000Z',
      dataSource: 'local-postgres',
      range: {
        startCreatedAt: '2026-05-01',
        endCreatedAt: '2026-05-21',
      },
      uniqueOrders: 0,
      canceledOrders: 0,
      internalTransferOrders: 0,
      lineItems: 0,
      totalCount: 0,
      totalPages: 1,
      pagesScanned: 0,
      partialScan: false,
      cacheHit: false,
      lastOrderSyncAt: null,
      lastRetailerSyncAt: null,
      lastReconciliationAt: null,
      syncLagSeconds: null,
      staleWarning: null,
      cacheCoverage: {
        status: 'empty',
        fullyCovered: false,
        requestedStart: '2026-05-01',
        requestedEnd: '2026-05-21',
        message: 'No cached Nabis orders are available yet.',
        earliestOrderCreatedAt: null,
        latestOrderCreatedAt: null,
        cachedOrderCount: 0,
        cachedLineItemCount: 0,
      },
      territorySnapshot: {
        syncedAt: null,
        recordsRead: 0,
        available: false,
      },
    },
  };
}

describe('withBackgroundManualRefreshStarted', () => {
  it('marks a dashboard response when manual refresh starts in the background', () => {
    const payload = dashboardPayload();

    const result = withBackgroundManualRefreshStarted(payload, '2026-05-21T14:35:00.000Z');

    expect(result.metadata.manualRefresh).toEqual({
      status: 'background-started',
      startedAt: '2026-05-21T14:35:00.000Z',
    });
    expect(result.orders).toBe(payload.orders);
    expect(result.analytics).toBe(payload.analytics);
  });
});
