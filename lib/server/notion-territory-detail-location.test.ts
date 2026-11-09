import { expect, it, vi } from 'vitest';
import type { TerritoryStorePin } from '@/lib/territory/types';
import { createTerritoryStoreDetailService } from './notion-territory-store-detail';

vi.mock('@/lib/db/prisma', () => ({ prisma: {
  account: { findMany: async () => [], findFirst: async () => null },
  nabisOrder: { findMany: async () => [] },
} }));
vi.mock('@/lib/server/account-identity', () => ({ resolveAccountIdentity: async () => ({ account: null }) }));

it('keeps account detail and its navigation coordinates on the canonical address when the read model is stale', async () => {
  const oldStore: TerritoryStorePin = {
    id: 'store-1', notionPageId: 'store-1', name: 'Address Store', status: 'Customer', statusKey: 'customer',
    statusColor: '#000000', pinKind: 'customer', repNames: [], repEmails: [],
    lat: 43, lng: -78, locationLabel: 'Old location', locationAddress: '999 Old Road',
    locationSource: 'notion-place', locationPrecision: 'exact', isApproximate: false,
    city: 'Buffalo', state: 'NY', lastEditedTime: '2026-11-09T12:00:00Z', referralSource: null,
  };
  const canonical: TerritoryStorePin = { ...oldStore, lat: 42.65, lng: -73.75,
    locationLabel: '123 Main St, Suite 4, Albany, NY 12207',
    locationAddress: '123 Main St, Suite 4, Albany, NY 12207',
    locationSource: 'google-address-cache', locationPrecision: 'address', city: 'Albany',
  };
  const service = createTerritoryStoreDetailService({
    getTerritorySnapshot: async () => ({ stores: [canonical] }),
    loadTerritoryStoreFromReadModel: async () => oldStore,
    resolveStoreByIdentifier: async () => canonical,
    loadStoreCheckIns: async () => [],
    loadStoreVendorDaySummary: async () => ({ total: 0, upcomingCount: 0, recent: [] }),
    notionRequest: async <T>() => ({ properties: {} } as T),
    readNotionCacheSnapshot: async () => null,
    contactsSnapshotKey: 'contacts', normalizeCachedContacts: () => [], normalizePageId: value => value,
  });
  const detail = await service.loadTerritoryStoreDetail('store-1');
  expect(detail.store).toMatchObject({ lat: 42.65, lng: -73.75,
    locationLabel: canonical.locationLabel, locationAddress: canonical.locationAddress,
    locationSource: 'google-address-cache', locationPrecision: 'address', city: 'Albany',
  });
});
