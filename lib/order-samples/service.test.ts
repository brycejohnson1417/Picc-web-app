import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesOrder } from './plan';

const mocks = vi.hoisted(() => {
  const prisma = {
    account: { findFirst: vi.fn() },
    nabisOrder: { findFirst: vi.fn() },
    activityLog: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return { prisma, open: vi.fn(), identity: vi.fn(), read: vi.fn(), apply: vi.fn() };
});

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db/prisma', () => ({ prisma: mocks.prisma }));
vi.mock('@/lib/server/account-identity', () => ({ resolveAccountIdentity: mocks.identity }));
vi.mock('./distru', async importOriginal => ({ ...await importOriginal<typeof import('./distru')>(), openDistruSampleOrders: mocks.open }));

import { applySamples, previewSamples } from './service';

const actor = { orgId: 'org', userId: 'rep' };
const order: SalesOrder = {
  id: 'order', number: 'SO-1', status: 'pending', editable: true, date: '2026-11-25', dueDate: null,
  updatedAt: 't1', url: null, locationId: 'stock-location', snapshot: 'header',
  rows: [{ id: 'original', productId: 'roll', quantity: 9, price: 10, sample: false, snapshot: 'original paid line' }],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.identity.mockResolvedValue({ accountId: 'account' });
  mocks.prisma.account.findFirst.mockResolvedValue({ id: 'account', name: 'Example Store', address1: '8 Main St', zipcode: '10001' });
  mocks.prisma.nabisOrder.findFirst.mockResolvedValue(null);
  mocks.prisma.$transaction.mockImplementation(callback => callback(mocks.prisma));
  mocks.prisma.activityLog.findFirst.mockResolvedValue(null);
  mocks.prisma.activityLog.create.mockResolvedValue({ id: 'audit' });
  mocks.prisma.activityLog.update.mockResolvedValue({});
  mocks.open.mockResolvedValue({
    history: [order], catalog: [{ id: 'roll', sku: 'R', name: 'Roll', brand: 'Ichi Roll', kind: 'pre-roll', available: 15, strain: null }],
    canWrite: true, readOrder: mocks.read, apply: mocks.apply,
  });
  mocks.read.mockResolvedValue(order);
});

describe('confirmed first-order sample updates', () => {
  it('rejects a stale reviewed order before a write', async () => {
    const preview = await previewSamples('account', actor);
    mocks.read.mockResolvedValue({ ...order, updatedAt: 't2' });
    await expect(applySamples('account', actor, preview.fingerprint!, ['roll'])).rejects.toThrow(/order changed/i);
    expect(mocks.apply).not.toHaveBeenCalled();
    expect(mocks.prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it('verifies a timed-out write with an independent read and never attempts the update twice', async () => {
    const preview = await previewSamples('account', actor);
    mocks.apply.mockRejectedValueOnce(new Error('request timed out'));
    mocks.read.mockResolvedValueOnce(order).mockResolvedValueOnce({
      ...order, updatedAt: 't2',
      rows: [...order.rows, { id: 'new', productId: 'roll', quantity: 5, price: 0.01, sample: true, snapshot: 'new sample' }],
    });
    await expect(applySamples('account', actor, preview.fingerprint!, ['roll'])).resolves.toMatchObject({ added: 5 });
    expect(mocks.apply).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.activityLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { metadata: expect.objectContaining({ state: 'verified' }) },
    }));
  });

  it('reports an unverifiable save and keeps its audit entry pending', async () => {
    const preview = await previewSamples('account', actor);
    await expect(applySamples('account', actor, preview.fingerprint!, ['roll'])).rejects.toThrow(/could not be verified/i);
    expect(mocks.prisma.activityLog.update).not.toHaveBeenCalled();
  });
});
