import { expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({ prisma: {
  nabisOrder: {
    findMany: async () => [], count: async () => 0,
    aggregate: async () => ({ _min: { orderCreatedDate: null }, _max: { orderCreatedDate: null } }),
  },
  nabisOrderLine: { count: async () => 0 },
} }));
vi.mock('@/lib/server/nabis-sync', () => ({ getNabisSyncFreshness: async () => ({
  lastOrderSyncAt: null, lastRetailerSyncAt: null, lastReconciliationAt: null, activeSync: null,
}) }));
vi.mock('@/lib/server/notion-cache-store', () => ({
  readNotionCacheSnapshot: async (key: string) => key === 'territory-stores-v4-full-address' ? {
    payload: [{ id: 'store-1', notionPageId: 'store-1', name: 'Address Store',
      lat: 42.65, lng: -73.75, status: 'Customer', statusKey: 'customer', repNames: [] }],
    syncedAt: '2026-11-09T12:00:00Z', recordsRead: 1,
  } : null,
}));

it('keeps dashboard territory coverage available after the address-only snapshot replaces the legacy snapshot', async () => {
  const { getDashboardPayload } = await import('@/lib/dashboard/nabis-server');
  const result = await getDashboardPayload({ orgId: 'test-org', start: '2026-11-01', end: '2026-11-09' });
  expect(result.metadata.territorySnapshot).toEqual({
    available: true, syncedAt: '2026-11-09T12:00:00Z', recordsRead: 1,
  });
});
