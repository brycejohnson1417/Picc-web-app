import { describe, expect, it } from 'vitest';
import { IntegrationSyncStatus } from '@prisma/client';
import { evaluateNabisSyncLease, getRetryDelayMs, parseNabisOrderLineForCache } from '@/lib/server/nabis-sync';

describe('Nabis sync line cache parsing', () => {
  it('extracts order line detail needed for local PPP savings calculations', () => {
    const line = parseNabisOrderLineForCache({
      id: 'order-id-1',
      order: '9000',
      skuName: 'Ichi-Roll Single 1g',
      units: '10',
      lineItemSubtotalAfterDiscount: '50.00',
      skuPricePerUnit: '7.00',
      lineItemIsSample: false,
      itemStrain: 'Time Warp',
      itemCategory: 'Pre-roll',
      itemClass: 'Cannabis',
    });

    expect(line).toEqual({
      externalOrderId: 'order-id-1',
      productName: 'Ichi-Roll Single 1g',
      quantity: 10,
      unitPrice: 5,
      isSample: false,
      itemStrain: 'Time Warp',
      itemCategory: 'Pre-roll',
      itemClass: 'Cannabis',
    });
  });
});

describe('Nabis sync lease coordination', () => {
  it('lease-refusal blocks a second active holder before the lease is stale', () => {
    const now = new Date('2026-05-07T18:00:00.000Z');
    const decision = evaluateNabisSyncLease({
      existingStatus: IntegrationSyncStatus.RUNNING,
      existingMetadata: {
        holderId: 'first-holder',
        module: 'orders',
        refreshedAt: '2026-05-07T17:59:30.000Z',
        expiresAt: '2026-05-07T18:00:30.000Z',
      },
      holderId: 'second-holder',
      now,
      staleAfterMs: 60_000,
    });

    expect(decision).toMatchObject({
      canAcquire: false,
      reason: 'held',
      activeHolderId: 'first-holder',
      activeModule: 'orders',
    });
  });

  it('stale-recovery lets a new holder acquire an expired lease', () => {
    const now = new Date('2026-05-07T18:00:00.000Z');
    const decision = evaluateNabisSyncLease({
      existingStatus: IntegrationSyncStatus.RUNNING,
      existingMetadata: {
        holderId: 'stale-holder',
        module: 'orders_reconcile',
        refreshedAt: '2026-05-07T17:58:00.000Z',
        expiresAt: '2026-05-07T17:59:00.000Z',
      },
      holderId: 'new-holder',
      now,
      staleAfterMs: 60_000,
    });

    expect(decision).toMatchObject({
      canAcquire: true,
      reason: 'stale',
      activeHolderId: 'stale-holder',
      activeModule: 'orders_reconcile',
    });
  });
});

describe('Nabis rate-limit backoff', () => {
  it('429-backoff honors Retry-After before exponential fallback', () => {
    const retryAfterResponse = {
      headers: new Headers({ 'retry-after': '7' }),
    };
    const retryAfterDate = new Date(Date.now() + 12_000);
    const retryAfterDateResponse = {
      headers: new Headers({ 'retry-after': retryAfterDate.toUTCString() }),
    };
    const fallbackResponse = {
      headers: new Headers(),
    };

    expect(getRetryDelayMs(retryAfterResponse, 0)).toBe(7000);
    expect(getRetryDelayMs(retryAfterDateResponse, 0)).toBeGreaterThan(0);
    expect(getRetryDelayMs(retryAfterDateResponse, 0)).toBeLessThanOrEqual(12_000);
    expect(getRetryDelayMs(fallbackResponse, 3)).toBe(8000);
  });
});
