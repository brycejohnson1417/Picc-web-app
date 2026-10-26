import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), readModel: vi.fn(), sync: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/server/notion-cache-store', () => ({ readNotionCacheSnapshot: mocks.read, writeNotionCacheSnapshot: vi.fn(), getSyncTtlMinutes: () => 5, isSnapshotStale: () => false }));
vi.mock('@/lib/server/territory-read-model', async (original) => ({ ...await original<typeof import('@/lib/server/territory-read-model')>(), loadTerritoryStoresFromReadModel: mocks.readModel, syncTerritoryStoresReadModel: mocks.sync }));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
beforeEach(() => {
  vi.resetModules();vi.clearAllMocks();
  vi.stubEnv('TERRITORY_ORG_ID','org-a');vi.stubEnv('DEMO_MODE','false');
  mocks.read.mockResolvedValue({ key:'territory-stores-v3', payload:[], recordsRead:0, unresolvedLocationCount:0, lastEditedMax:null, syncedAt:new Date().toISOString() });
  mocks.readModel.mockResolvedValue({ stores:[], recordsRead:0 });
});
afterEach(() => vi.unstubAllEnvs());
it('rejects a different workspace before touching the shared snapshot or read model', async () => {
  const { loadTerritoryStores }=await import('@/lib/server/notion-territory');
  await expect(loadTerritoryStores({ orgId:'org-b' } as never)).rejects.toThrow('Territory is unavailable for this workspace');
  expect(mocks.read).not.toHaveBeenCalled();expect(mocks.readModel).not.toHaveBeenCalled();expect(mocks.sync).not.toHaveBeenCalled();
});
it('does not silently select the default organization when request context is missing', async () => {
  const { loadTerritoryStores }=await import('@/lib/server/notion-territory');
  await expect(loadTerritoryStores({} as never)).rejects.toThrow('Territory is unavailable for this workspace');
  expect(mocks.read).not.toHaveBeenCalled();
});
it('passes the authenticated configured organization to the read model', async () => {
  const { loadTerritoryStores }=await import('@/lib/server/notion-territory');
  await loadTerritoryStores({ orgId:'org-a' } as never);
  expect(mocks.readModel).toHaveBeenCalledWith({orgId:'org-a'});
});
