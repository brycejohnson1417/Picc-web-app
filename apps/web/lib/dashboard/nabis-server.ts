import 'server-only';

import { prisma } from '@/lib/db/prisma';
import {
  buildCacheCoverage,
  formatNabisSalesRep,
  summarizeNabisDashboardAnalytics,
  type AnalyticsOrder,
  type AnalyticsTerritoryStore,
} from '@/lib/dashboard/nabis-analytics';
import { getNabisSyncFreshness } from '@/lib/server/nabis-sync';
import { readNotionCacheSnapshot } from '@/lib/server/notion-cache-store';
import { excludedInternalTransferRetailers } from '@/lib/nabis/internal-transfers';
import type { NabisDashboardMetadata, NabisDashboardResponse, SerializedNabisOrder } from '@/lib/dashboard/nabis-types';
import type { TerritoryStorePin } from '@/lib/territory/types';

const CANCELED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'VOID', 'VOIDED', 'REJECTED', 'REFUNDED']);
const TERRITORY_SNAPSHOT_KEY = 'territory-stores-v3';

export function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function ensureDateRange(query: { start?: string | null; end?: string | null }) {
  const start = String(query.start || '');
  const end = String(query.end || '');

  if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
    const error = new Error('Use valid start/end dates in YYYY-MM-DD format.');
    (error as Error & { statusCode?: number }).statusCode = 400;
    throw error;
  }

  return { start, end };
}

function startOfDayUtc(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function endOfDayUtc(value: string) {
  return new Date(`${value}T23:59:59.999Z`);
}

function toDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function secondsSince(timestamp: string | null) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
}

function staleWarning(syncLagSeconds: number | null) {
  if (syncLagSeconds == null) {
    return 'Nabis order sync has not completed yet.';
  }
  if (syncLagSeconds > 60 * 60) {
    return 'Nabis orders are more than 1 hour stale.';
  }
  if (syncLagSeconds > 15 * 60) {
    return 'Nabis orders are behind the target 5-minute sync cadence.';
  }
  return null;
}

function isCanceledStatus(status: string | null | undefined) {
  return CANCELED_STATUSES.has(String(status || '').toUpperCase());
}

function isValidDashboardOrder(row: { status: string | null; isInternalTransfer: boolean; orderTotal: unknown }) {
  const total = row.orderTotal ? Number(row.orderTotal) : 0;
  return !row.isInternalTransfer && !isCanceledStatus(row.status) && total > 0;
}

function serializeOrder(row: {
  id: string;
  externalOrderId: string;
  orderNumber: string | null;
  licensedLocationId: string | null;
  licensedLocationName: string | null;
  orderCreatedDate: Date | null;
  status: string | null;
  isInternalTransfer: boolean;
  orderTotal: unknown;
  salesRep: string | null;
  account: { id: string; name: string } | null;
}): SerializedNabisOrder {
  return {
    id: row.id,
    orderNumber: row.orderNumber ?? row.externalOrderId,
    createdDate: toDateKey(row.orderCreatedDate ?? new Date()),
    status: row.status ?? 'UNKNOWN',
    customerName: row.licensedLocationName ?? 'Unknown Retailer',
    total: row.orderTotal ? Number(row.orderTotal) : 0,
    salesRep: formatNabisSalesRep(row.salesRep),
    monthKey: toDateKey(row.orderCreatedDate ?? new Date()).slice(0, 7),
    isCanceled: isCanceledStatus(row.status),
    licensedLocationId: row.licensedLocationId ?? null,
    matchedAccountId: row.account?.id ?? null,
    matchedAccountName: row.account?.name ?? null,
  };
}

function toAnalyticsOrder(order: SerializedNabisOrder, input?: { isInternalTransfer?: boolean }): AnalyticsOrder {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    createdDate: order.createdDate,
    status: order.status,
    customerName: order.customerName,
    total: order.total,
    salesRep: order.salesRep,
    licensedLocationId: order.licensedLocationId,
    matchedAccountId: order.matchedAccountId,
    matchedAccountName: order.matchedAccountName,
    isInternalTransfer: input?.isInternalTransfer ?? false,
  };
}

function normalizeCachedTerritoryStores(payload: unknown): TerritoryStorePin[] {
  if (!Array.isArray(payload)) {
    return [];
  }

  return payload.filter((row): row is TerritoryStorePin => {
    return Boolean(row && typeof row === 'object' && typeof (row as { id?: unknown }).id === 'string' && typeof (row as { name?: unknown }).name === 'string');
  });
}

function toAnalyticsTerritoryStore(store: TerritoryStorePin): AnalyticsTerritoryStore {
  return {
    id: store.id,
    name: store.name,
    statusKey: store.statusKey,
    repNames: Array.isArray(store.repNames) ? store.repNames : [],
    licenseNumber: store.licenseNumber ?? null,
    isPreferredPartner: store.isPreferredPartner ?? false,
    lastSampleOrderDate: store.lastSampleOrderDate ?? null,
    lastSampleDeliveryDate: store.lastSampleDeliveryDate ?? null,
  };
}

async function loadCachedTerritoryStores() {
  const snapshot = await readNotionCacheSnapshot<TerritoryStorePin[]>(TERRITORY_SNAPSHOT_KEY);
  const stores = normalizeCachedTerritoryStores(snapshot?.payload);

  return {
    stores: stores.map(toAnalyticsTerritoryStore),
    syncedAt: snapshot?.syncedAt ?? null,
    recordsRead: snapshot?.recordsRead ?? stores.length,
    available: stores.length > 0,
  };
}

export async function getDashboardPayload(input: {
  orgId: string;
  start: string;
  end: string;
  forceRefresh?: boolean;
  actor?: { clerkUserId?: string | null; email?: string | null };
}) {
  const orderWhere = {
    orgId: input.orgId,
    orderCreatedDate: {
      lte: endOfDayUtc(input.end),
    },
    NOT: excludedInternalTransferRetailers.map((value) => ({
      licensedLocationName: {
        equals: value,
        mode: 'insensitive' as const,
      },
    })),
  };

  const rows = await prisma.nabisOrder.findMany({
    where: {
      ...orderWhere,
    },
    select: {
      id: true,
      externalOrderId: true,
      orderNumber: true,
      licensedLocationId: true,
      licensedLocationName: true,
      orderCreatedDate: true,
      status: true,
      isInternalTransfer: true,
      orderTotal: true,
      salesRep: true,
      account: {
        select: {
          id: true,
          name: true,
        },
      },
    },
    orderBy: [{ orderCreatedDate: 'desc' }, { externalOrderId: 'desc' }],
  });

  const rangeRows = rows.filter((row) => {
    const dateKey = row.orderCreatedDate ? toDateKey(row.orderCreatedDate) : null;
    return Boolean(dateKey && dateKey >= input.start && dateKey <= input.end);
  });
  const canceledOrders = rangeRows.filter((row) => isCanceledStatus(row.status)).length;
  const internalTransferOrders = rangeRows.filter((row) => row.isInternalTransfer).length;

  const allSerializedOrders = rows.map(serializeOrder);
  const orders = rangeRows.filter(isValidDashboardOrder).map(serializeOrder);

  const [freshness, territorySnapshot, coverageAggregate, cachedOrderCount, cachedLineItemCount, rangeLineItems] = await Promise.all([
    getNabisSyncFreshness(input.orgId),
    loadCachedTerritoryStores(),
    prisma.nabisOrder.aggregate({
      where: {
        orgId: input.orgId,
      },
      _min: {
        orderCreatedDate: true,
      },
      _max: {
        orderCreatedDate: true,
      },
    }),
    prisma.nabisOrder.count({
      where: {
        orgId: input.orgId,
      },
    }),
    prisma.nabisOrderLine.count({
      where: {
        orgId: input.orgId,
      },
    }),
    prisma.nabisOrderLine.count({
      where: {
        orgId: input.orgId,
        nabisOrder: {
          orderCreatedDate: {
            gte: startOfDayUtc(input.start),
            lte: endOfDayUtc(input.end),
          },
        },
      },
    }),
  ]);

  const syncLag = secondsSince(freshness.lastOrderSyncAt);
  const activeSync = freshness.activeSync;
  const cacheCoverage = buildCacheCoverage({
    requestedRange: { start: input.start, end: input.end },
    earliestOrderCreatedAt: coverageAggregate._min.orderCreatedDate?.toISOString() ?? null,
    latestOrderCreatedAt: coverageAggregate._max.orderCreatedDate?.toISOString() ?? null,
    cachedOrderCount,
    cachedLineItemCount,
  });

  const analytics = summarizeNabisDashboardAnalytics({
    orders: allSerializedOrders.map((order) => toAnalyticsOrder(order)),
    territoryStores: territorySnapshot.stores,
    range: { start: input.start, end: input.end },
  });

  return {
    orders,
    analytics,
    metadata: {
      fetchedAt: freshness.lastOrderSyncAt ?? new Date().toISOString(),
      dataSource: 'local-postgres',
      range: {
        startCreatedAt: input.start,
        endCreatedAt: input.end,
      },
      uniqueOrders: orders.length,
      canceledOrders,
      internalTransferOrders,
      lineItems: rangeLineItems,
      totalCount: rangeRows.length,
      totalPages: 1,
      pagesScanned: 0,
      partialScan: !cacheCoverage.fullyCovered,
      cacheHit: false,
      lastOrderSyncAt: freshness.lastOrderSyncAt,
      lastRetailerSyncAt: freshness.lastRetailerSyncAt,
      lastReconciliationAt: freshness.lastReconciliationAt,
      syncLagSeconds: syncLag,
      staleWarning: activeSync ? null : staleWarning(syncLag),
      activeSync,
      cacheCoverage,
      territorySnapshot: {
        syncedAt: territorySnapshot.syncedAt,
        recordsRead: territorySnapshot.recordsRead,
        available: territorySnapshot.available,
      },
    } satisfies NabisDashboardMetadata,
  } satisfies NabisDashboardResponse;
}
