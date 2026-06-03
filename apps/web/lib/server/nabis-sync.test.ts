import { describe, expect, it } from 'vitest';
import { IntegrationSyncStatus } from '@prisma/client';
import {
  activeNabisSyncFromLease,
  evaluateNabisSyncLease,
  filterOrderRowsOnOrAfterCutoff,
  formatNabisSyncLeaseConflictMessage,
  getRetryDelayMs,
  nabisOrderLineFingerprint,
  pageIsOlderThanCutoff,
  parseNabisOrderForCache,
  parseNabisOrderLineForCache,
  staleNabisRetailerIdsMissingFromFeed,
} from '@/lib/server/nabis-sync';

describe('Nabis sync line cache parsing', () => {
  it('stores promo-adjusted order totals for NY V2 orders with discounts', () => {
    const order = parseNabisOrderForCache({
      id: 'af9c9739-82d6-42fd-81e9-bb2e44fde193',
      order: '924483',
      retailer: 'The Emerald - Brooklyn',
      orderAction: 'DELIVERY_TO_RETAILER',
      status: 'SCHEDULED',
      createdTimestamp: '2026-04-27T14:02:00.000Z',
      orderTotal: '3056.50',
      creditMemo: 98.54,
      orderDiscount: '479.00',
      lineItemDiscount: '0.00',
      siteLicenseNumber: 'OCM-CAURD-24-000057-D1',
      retailerId: '6593a111-5c6e-4dcf-861d-3c1333aed04e',
    });

    expect(order?.orderTotal).toBe(2478.96);
  });

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

  it('uses line item discount when Nabis does not provide an after-discount line subtotal', () => {
    const line = parseNabisOrderLineForCache({
      id: 'order-id-2',
      order: '924483',
      skuCode: 'SOM-1G',
      units: '10',
      lineItemSubtotal: '80.00',
      lineItemDiscount: '20.00',
      skuPricePerUnit: '8.00',
      itemClass: 'Cannabis',
    });

    expect(line?.unitPrice).toBe(6);
  });

  it('preserves zero-dollar unit price for fully discounted line items', () => {
    const line = parseNabisOrderLineForCache({
      id: 'order-id-3',
      order: '924484',
      skuCode: 'PROMO-1G',
      units: '4',
      lineItemSubtotal: '40.00',
      lineItemDiscount: '40.00',
      skuPricePerUnit: '10.00',
      itemClass: 'Cannabis',
    });

    expect(line?.unitPrice).toBe(0);
  });
});

describe('Nabis sync lease coordination', () => {
  it('exposes an active global sync lease for dashboard freshness', () => {
    const active = activeNabisSyncFromLease({
      status: IntegrationSyncStatus.RUNNING,
      metadata: {
        module: 'retailers_and_orders',
        refreshedAt: '2026-05-21T14:53:38.850Z',
        expiresAt: '2026-05-21T14:54:38.850Z',
      },
      now: new Date('2026-05-21T14:53:48.000Z'),
    });

    expect(active).toEqual({
      module: 'retailers_and_orders',
      refreshedAt: '2026-05-21T14:53:38.850Z',
      expiresAt: '2026-05-21T14:54:38.850Z',
    });
  });

  it('does not expose an expired global sync lease as active', () => {
    const active = activeNabisSyncFromLease({
      status: IntegrationSyncStatus.RUNNING,
      metadata: {
        module: 'retailers_and_orders',
        refreshedAt: '2026-05-21T14:53:38.850Z',
        expiresAt: '2026-05-21T14:54:38.850Z',
      },
      now: new Date('2026-05-21T14:55:00.000Z'),
    });

    expect(active).toBeNull();
  });

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

  it('formats active lease conflicts as an in-progress sync instead of a moving retry timestamp', () => {
    const message = formatNabisSyncLeaseConflictMessage({
      canAcquire: false,
      reason: 'held',
      activeHolderId: 'first-holder',
      activeModule: 'orders',
      activeRefreshedAt: '2026-05-11T23:35:02.059Z',
      activeExpiresAt: '2026-05-11T23:36:02.059Z',
    });

    expect(message).toBe('Nabis order sync is already running. Showing saved data while it finishes; refresh status in a minute.');
    expect(message).not.toContain('try again after');
    expect(message).not.toContain('2026-05-11T23:36:02.059Z');
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

describe('Nabis retailer cache retention', () => {
  it('identifies cached retailer rows missing from the current Nabis retailer feed without deleting them', () => {
    expect(
      staleNabisRetailerIdsMissingFromFeed(
        ['retailer-current', 'brand-stale', ' RETAILER-CASE '],
        ['retailer-current', 'retailer-case'],
      ),
    ).toEqual(['brand-stale']);
  });

  it('does not mark anything missing when the current retailer feed is empty or unparsable', () => {
    expect(staleNabisRetailerIdsMissingFromFeed(['retailer-current', 'brand-stale'], [])).toEqual([]);
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

describe('Nabis historical backfill paging', () => {
  it('batch-cutoff only stops after a full order page is older than the requested historical start date', () => {
    const cutoff = new Date('2025-01-01T00:00:00.000Z');

    expect(
      pageIsOlderThanCutoff(
        [
          { id: 'oldest-in-page', createdDate: '2024-12-31T23:59:59.000Z' },
          { id: 'still-needed', createdDate: '2025-01-01T00:00:00.000Z' },
        ],
        cutoff,
      ),
    ).toBe(false);

    expect(
      pageIsOlderThanCutoff(
        [
          { id: 'older-a', createdDate: '2024-12-30T00:00:00.000Z' },
          { id: 'older-b', createdTimestamp: '2024-12-31T23:59:59.000Z' },
        ],
        cutoff,
      ),
    ).toBe(true);
  });

  it('batch-cutoff excludes pre-cutoff rows from the historical backfill page before upsert', () => {
    const cutoff = new Date('2025-01-01T00:00:00.000Z');

    expect(
      filterOrderRowsOnOrAfterCutoff(
        [
          { id: 'older-row', createdDate: '2024-12-31T23:59:59.000Z' },
          { id: 'cutoff-row', createdDate: '2025-01-01T00:00:00.000Z' },
          { id: 'newer-row', createdTimestamp: '2025-02-01T00:00:00.000Z' },
        ],
        cutoff,
      ).map((row) => row.id),
    ).toEqual(['cutoff-row', 'newer-row']);
  });
});

describe('Nabis historical line merge safety', () => {
  it('builds a stable line fingerprint so resumable batches can avoid duplicate inserts without deleting sibling lines', () => {
    const first = nabisOrderLineFingerprint({
      externalOrderId: 'order-1',
      productName: 'Ichi-Roll Single 1g',
      quantity: 10,
      unitPrice: 5,
      isSample: false,
      itemStrain: 'Time Warp',
      itemCategory: 'Pre-roll',
      itemClass: 'Cannabis',
    });
    const same = nabisOrderLineFingerprint({
      externalOrderId: 'order-1',
      productName: 'Ichi-Roll Single 1g',
      quantity: 10.0,
      unitPrice: 5.0,
      isSample: false,
      itemStrain: 'Time Warp',
      itemCategory: 'Pre-roll',
      itemClass: 'Cannabis',
    });
    const sibling = nabisOrderLineFingerprint({
      externalOrderId: 'order-1',
      productName: 'Zips 3.5g',
      quantity: 4,
      unitPrice: 20,
      isSample: false,
      itemStrain: 'Blue Dream',
      itemCategory: 'Flower',
      itemClass: 'Cannabis',
    });

    expect(first).toBe(same);
    expect(first).not.toBe(sibling);
  });
});
