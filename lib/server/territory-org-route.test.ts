import { beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ access: vi.fn(), source: vi.fn(), load: vi.fn(), queue: vi.fn() }));
vi.mock('@/lib/auth/territory-access', () => ({ requireTerritoryApiAccess: mocks.access }));
vi.mock('@/lib/server/notion-territory', () => ({
  requireTerritorySourceOrg: mocks.source,
  TERRITORY_WORKSPACE_ERROR: 'Territory is unavailable for this workspace',
  loadTerritoryStores: mocks.load,
  processPendingTerritoryStoreSyncQueue: mocks.queue,
}));
vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ orgId: 'org-b' });
  mocks.source.mockImplementation(() => { throw new Error('Territory is unavailable for this workspace'); });
});
it.each(['', '?refresh=1'])('rejects foreign organization before data loading or refresh work (%s)', async (query) => {
  const { GET } = await import('@/app/api/territory/stores/route');
  const response = await GET(new Request(`http://localhost/api/territory/stores${query}`));
  if (!response) throw new Error('Expected a forbidden response');
  expect(response.status).toBe(403);
  expect(response.headers.get('Cache-Control')).toContain('no-store');
  expect(mocks.load).not.toHaveBeenCalled();
  expect(mocks.queue).not.toHaveBeenCalled();
});
