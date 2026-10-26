import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ guard: vi.fn(), role: vi.fn(), health: vi.fn() }));
vi.mock('@/lib/auth/api-guard', () => ({ guard: mocks.guard }));
vi.mock('@/lib/rbac/guards', () => ({ getUserRole: mocks.role }));
vi.mock('@/lib/server/calendar-sync-health', () => ({ getCalendarSyncHealth: mocks.health }));
import { GET } from '@/app/api/calendar/sync-health/route';

describe('retired calendar health endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.guard.mockResolvedValue({ orgId: 'org-a', userId: 'user-a' });
    mocks.role.mockResolvedValue('ADMIN');
    mocks.health.mockResolvedValue({ mode: 'healthy' });
  });
  it('returns gone without querying retired worker data', async () => {
    const response = (await GET())!;
    expect(response.status).toBe(410);
    expect(await response.json()).toEqual({ error: 'Worker calendar sync has been retired.' });
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(mocks.health).not.toHaveBeenCalled();
  });
  it('retains authentication and role checks', async () => {
    mocks.guard.mockResolvedValueOnce({ error: new Response(null, { status: 401 }) });
    expect((await GET())!.status).toBe(401);
    expect(mocks.role).not.toHaveBeenCalled();
    mocks.role.mockResolvedValueOnce('SALES_REP');
    expect((await GET())!.status).toBe(403);
    expect(mocks.health).not.toHaveBeenCalled();
  });
});
