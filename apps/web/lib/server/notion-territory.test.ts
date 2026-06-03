import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const originalEnv = process.env;

const { territoryStoreSyncJobUpsert } = vi.hoisted(() => ({
  territoryStoreSyncJobUpsert: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    territoryStoreSyncJob: {
      upsert: territoryStoreSyncJobUpsert,
    },
  },
}));

describe('notion territory org resolution', () => {
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
    territoryStoreSyncJobUpsert.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('uses the seeded demo org for queued store sync jobs in demo mode', async () => {
    const { enqueueTerritoryStoreSync } = await import('@/lib/server/notion-territory');

    await enqueueTerritoryStoreSync(' notion-page-1 ', { reason: 'webhook' });

    expect(territoryStoreSyncJobUpsert).toHaveBeenCalledWith({
      where: {
        orgId_notionPageId: {
          orgId: 'org_picc_demo',
          notionPageId: 'notion-page-1',
        },
      },
      create: {
        orgId: 'org_picc_demo',
        notionPageId: 'notion-page-1',
        reason: 'webhook',
        status: 'pending',
      },
      update: {
        reason: 'webhook',
        status: 'pending',
        completedAt: null,
        lastError: null,
      },
    });
  });
});
