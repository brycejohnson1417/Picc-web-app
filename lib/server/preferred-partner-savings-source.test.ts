import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db/prisma';
import { fetchNabisJson } from '@/lib/server/nabis-api';
import { resolveAccountIdentity } from '@/lib/server/account-identity';
import { loadTerritoryStoreDetail } from '@/lib/server/notion-territory';
import { getPreferredPartnerSavings } from '@/lib/server/preferred-partner-savings';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    account: {
      findUnique: vi.fn(),
    },
    nabisOrder: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/server/nabis-api', () => ({
  fetchNabisJson: vi.fn(),
}));

vi.mock('@/lib/server/account-identity', () => ({
  resolveAccountIdentity: vi.fn(),
}));

vi.mock('@/lib/server/notion-territory', () => ({
  loadTerritoryStoreDetail: vi.fn(),
}));

const mockedPrisma = prisma as unknown as {
  account: {
    findUnique: ReturnType<typeof vi.fn>;
  };
  nabisOrder: {
    findMany: ReturnType<typeof vi.fn>;
  };
};

const mockedFetchNabisJson = vi.mocked(fetchNabisJson);
const mockedResolveAccountIdentity = vi.mocked(resolveAccountIdentity);
const mockedLoadTerritoryStoreDetail = vi.mocked(loadTerritoryStoreDetail);
const testYear = new Date().getFullYear();

describe('Preferred Partner savings source selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockedResolveAccountIdentity.mockResolvedValue({
      accountId: 'account-1',
      orgId: 'org-1',
      notionPageId: 'notion-page-1',
    });
    mockedLoadTerritoryStoreDetail.mockResolvedValue({
      store: {
        name: 'Stale Cache Dispensary',
        licenseNumber: 'OCM-RETL-26-000001-D1',
      },
      crm: {},
      contacts: [],
    } as unknown as Awaited<ReturnType<typeof loadTerritoryStoreDetail>>);
    mockedPrisma.account.findUnique.mockResolvedValue({
      id: 'account-1',
      name: 'Stale Cache Dispensary',
      licenseNumber: 'OCM-RETL-26-000001-D1',
      licensedLocationId: 'licensed-location-1',
      nabisRetailerId: 'retailer-1',
    });
    mockedPrisma.nabisOrder.findMany.mockResolvedValue([
      {
        externalOrderId: 'cached-order-1',
        orderNumber: 'NY-OLD',
        orderCreatedDate: new Date(`${testYear}-01-10T15:00:00.000Z`),
        deliveryDate: null,
        orderTotal: 56.5,
        status: 'DELIVERED',
        createdAt: new Date(`${testYear}-01-10T16:00:00.000Z`),
        lines: [
          {
            productName: 'Ichi-Roll Single 1g',
            quantity: 10,
            unitPrice: 5,
            isSample: false,
            itemStrain: null,
            itemCategory: null,
            itemClass: null,
          },
        ],
      },
    ]);
    mockedFetchNabisJson.mockResolvedValue({
      data: [
        {
          id: 'cached-order-1',
          order: 'NY-OLD',
          createdTimestamp: `${testYear}-01-10T15:00:00.000Z`,
          orderTotal: 56.5,
          status: 'DELIVERED',
          retailerId: 'retailer-1',
          licensedLocationId: 'licensed-location-1',
          retailer: 'Stale Cache Dispensary',
          skuName: 'Ichi-Roll Single 1g',
          units: 10,
          pricePerUnit: 5,
          lineItemSubtotal: 50,
        },
        {
          id: 'live-order-today',
          order: 'NY-TODAY',
          createdTimestamp: `${testYear}-06-03T15:00:00.000Z`,
          orderTotal: 95,
          status: 'DELIVERED',
          retailerId: 'retailer-1',
          licensedLocationId: 'licensed-location-1',
          retailer: 'Stale Cache Dispensary',
          skuName: 'O-Yeah 5-Pack 2.5g',
          units: 5,
          pricePerUnit: 17.5,
          lineItemSubtotal: 87.5,
        },
      ],
      nextPage: null,
    });
  });

  it('does not let stale cached rows suppress newer current-year live Nabis orders', async () => {
    const result = await getPreferredPartnerSavings({
      orgId: 'org-1',
      accountIdOrPageId: 'account-1',
      year: testYear,
    });

    expect(mockedFetchNabisJson).toHaveBeenCalledWith('/v2/ny/order', {
      searchParams: {
        page: '0',
        limit: '500',
        action: 'DELIVERY_TO_RETAILER',
      },
    });
    expect(result.orders.map((order) => order.orderNumber)).toEqual(['NY-OLD', 'NY-TODAY']);
    expect(result.summary.orderCount).toBe(2);
    expect(result.summary.totalSavings).toBe(27.5);
  });
});
