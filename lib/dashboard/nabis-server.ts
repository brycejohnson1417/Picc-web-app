import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { getNabisSyncFreshness, syncNabisOrders } from '@/lib/server/nabis-sync';
import { excludedInternalTransferRetailers } from '@/lib/nabis/internal-transfers';
import type { NabisDashboardMetadata, NabisDashboardResponse, SerializedNabisOrder } from '@/lib/dashboard/nabis-types';

const CANCELED_STATUSES = new Set(['CANCELED', 'CANCELLED', 'VOID', 'VOIDED', 'REJECTED', 'REFUNDED']);

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

export async function getDashboardPayload(input: {
  orgId: string;
  start: string;
  end: string;
  forceRefresh?: boolean;
  actor?: { clerkUserId?: string | null; email?: string | null };
}) {
  if (input.forceRefresh) {
    await syncNabisOrders(input.orgId, input.actor);
  }

  const rows = await prisma.nabisOrder.findMany({
    where: {
      orgId: input.orgId,
      orderCreatedDate: {
        gte: startOfDayUtc(input.start),
        lte: endOfDayUtc(input.end),
      },
      NOT: excludedInternalTransferRetailers.map((value) => ({
        licensedLocationName: {
          equals: value,
          mode: 'insensitive' as const,
        },
      })),
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

  const canceledOrders = rows.filter((row) => CANCELED_STATUSES.has(String(row.status || '').toUpperCase())).length;
  const internalTransferOrders = rows.filter((row) => row.isInternalTransfer).length;

  const orders: SerializedNabisOrder[] = rows
    .filter((row) => !row.isInternalTransfer && !CANCELED_STATUSES.has(String(row.status || '').toUpperCase()))
    .map((row) => ({
      id: row.id,
      orderNumber: row.orderNumber ?? row.externalOrderId,
      createdDate: toDateKey(row.orderCreatedDate ?? new Date()),
      status: row.status ?? 'UNKNOWN',
      customerName: row.licensedLocationName ?? 'Unknown Retailer',
      total: row.orderTotal ? Number(row.orderTotal) : 0,
      salesRep: row.salesRep ?? 'Unassigned',
      monthKey: toDateKey(row.orderCreatedDate ?? new Date()).slice(0, 7),
      isCanceled: false,
      licensedLocationId: row.licensedLocationId ?? null,
      matchedAccountId: row.account?.id ?? null,
      matchedAccountName: row.account?.name ?? null,
    }));

  const freshness = await getNabisSyncFreshness(input.orgId);
  const syncLag = secondsSince(freshness.lastOrderSyncAt);

  return {
    orders,
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
      lineItems: rows.length,
      totalCount: rows.length,
      totalPages: 1,
      pagesScanned: 0,
      partialScan: false,
      cacheHit: false,
      lastOrderSyncAt: freshness.lastOrderSyncAt,
      lastRetailerSyncAt: freshness.lastRetailerSyncAt,
      lastReconciliationAt: freshness.lastReconciliationAt,
      syncLagSeconds: syncLag,
      staleWarning: staleWarning(syncLag),
    } satisfies NabisDashboardMetadata,
  } satisfies NabisDashboardResponse;
}
