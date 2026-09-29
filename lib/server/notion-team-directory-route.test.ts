import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { guard, upsert } = vi.hoisted(() => ({ guard: vi.fn(), upsert: vi.fn() }));
vi.mock('@/lib/auth/api-guard', () => ({ guard }));
vi.mock('@/lib/db/prisma', () => ({ prisma: { membership: { upsert } } }));
import { POST } from '@/app/api/integrations/notion/sync-team-directory/route';

describe('retired placeholder team-directory sync', () => {
  beforeEach(() => guard.mockResolvedValue({ orgId: 'test-org', userId: 'test-admin' }));

  it('reports disabled without creating or updating any memberships', async () => {
    const response = await POST();
    expect(upsert).not.toHaveBeenCalled();
    expect(response?.status).toBe(501);
    expect(await response?.json()).toEqual({ error: 'Team directory sync is unavailable. No memberships were changed.' });
    expect(guard).toHaveBeenCalledWith(['ADMIN']);
  });

  it('preserves the existing authorization response without writes', async () => {
    guard.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    const response = await POST();
    expect(response?.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
  });
});
