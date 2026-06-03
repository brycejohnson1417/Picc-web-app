import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;

const {
  accountFindFirst,
  checkInCount,
  executeRawUnsafe,
  nabisOrderFindMany,
  territoryStoreReadModelUpsert,
} = vi.hoisted(() => ({
  accountFindFirst: vi.fn(),
  checkInCount: vi.fn(),
  executeRawUnsafe: vi.fn(),
  nabisOrderFindMany: vi.fn(),
  territoryStoreReadModelUpsert: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $executeRawUnsafe: executeRawUnsafe,
    account: {
      findFirst: accountFindFirst,
    },
    checkIn: {
      count: checkInCount,
    },
    nabisOrder: {
      findMany: nabisOrderFindMany,
    },
    territoryStoreReadModel: {
      upsert: territoryStoreReadModelUpsert,
    },
  },
}));

describe('territory read model org resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env = {
      ...originalEnv,
      DEMO_MODE: 'true',
      DEMO_ORG_ID: 'org_picc_demo',
      TERRITORY_ORG_ID: 'org_picc_prod',
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: '',
      CLERK_SECRET_KEY: '',
    };
    accountFindFirst.mockResolvedValue(null);
    checkInCount.mockResolvedValue(0);
    executeRawUnsafe.mockResolvedValue(1);
    nabisOrderFindMany.mockResolvedValue([]);
    territoryStoreReadModelUpsert.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses the seeded demo org for single-store read-model writes in demo mode', async () => {
    const { syncTerritoryStoreToReadModel } = await import('@/lib/server/territory-read-model');

    const result = await syncTerritoryStoreToReadModel({
      id: 'store_1',
      notionPageId: 'notion-page-1',
      name: 'Demo Store',
      status: 'Prospect',
      statusKey: 'prospect',
      statusColor: 'blue',
      pinKind: 'lead',
      repNames: [],
      repEmails: [],
      lat: 40.7128,
      lng: -74.006,
      locationLabel: 'Demo Store',
      locationAddress: '1 Demo Way',
      locationSource: 'notion-place',
      locationPrecision: 'address',
      isApproximate: false,
      lastEditedTime: '2026-05-31T12:00:00.000Z',
      licenseNumber: null,
      city: 'New York',
      state: 'NY',
      daysOverdue: null,
      phoneNumber: null,
      email: null,
      referralSource: null,
      followUpDate: null,
      notes: null,
      lastCheckIn: null,
      geometry: {
        type: 'Point',
        coordinates: [-74.006, 40.7128],
      },
      metrics: {
        interactionsScore: 0,
        purchasesScore: 0,
        followUpUrgencyScore: 0,
      },
    });

    expect(result.orgId).toBe('org_picc_demo');
    expect(territoryStoreReadModelUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          orgId: 'org_picc_demo',
        }),
      }),
    );
  });
});
