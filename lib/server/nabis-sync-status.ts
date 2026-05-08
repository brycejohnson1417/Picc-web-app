import 'server-only';

import { IntegrationProvider, IntegrationSyncStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

const NABIS_STATUS_MODULES = ['retailers', 'orders', 'orders_reconcile', 'orders_historical_backfill', 'nabis_global_sync_lease'] as const;

type NabisStatusModule = (typeof NABIS_STATUS_MODULES)[number];

type CheckpointMetadata = {
  error?: unknown;
  lastSuccessfulSyncAt?: unknown;
  activeModule?: unknown;
  activeExpiresAt?: unknown;
  holderId?: unknown;
  refreshedAt?: unknown;
  expiresAt?: unknown;
  rateLimited?: unknown;
  retryAfterMs?: unknown;
  recordsRead?: unknown;
  orders?: unknown;
  uniqueOrders?: unknown;
  retailers?: unknown;
  lineItems?: unknown;
  metricRows?: unknown;
  historicalBackfill?: unknown;
  cutoffDate?: unknown;
  pagesScanned?: unknown;
  cutoffReached?: unknown;
  earliestOrderCreatedAt?: unknown;
  latestOrderCreatedAt?: unknown;
};

function metadataObject(value: unknown): CheckpointMetadata {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as CheckpointMetadata) : {};
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isoOrNull(value: Date | string | null | undefined) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function lastSuccessfulSyncAt(metadata: CheckpointMetadata, updatedAt: Date, status: IntegrationSyncStatus) {
  const explicit = stringValue(metadata.lastSuccessfulSyncAt);
  if (explicit) return explicit;
  return status === IntegrationSyncStatus.SUCCESS ? updatedAt.toISOString() : null;
}

export async function getNabisAdminSyncStatus(orgId: string) {
  const integration = await prisma.integrationConnection.findFirst({
    where: {
      orgId,
      provider: IntegrationProvider.NABIS,
    },
    select: {
      id: true,
      name: true,
      status: true,
      lastSyncedAt: true,
      updatedAt: true,
      checkpoints: {
        where: {
          module: {
            in: [...NABIS_STATUS_MODULES],
          },
        },
        select: {
          module: true,
          status: true,
          metadata: true,
          updatedAt: true,
        },
      },
      syncRuns: {
        orderBy: {
          startedAt: 'desc',
        },
        take: 8,
        select: {
          id: true,
          module: true,
          status: true,
          startedAt: true,
          finishedAt: true,
          recordsIn: true,
          recordsUpserted: true,
          error: true,
          metadata: true,
        },
      },
    },
  });

  const [orderCount, lineCount, retailerCount, earliestOrder, latestOrder] = await Promise.all([
    prisma.nabisOrder.count({ where: { orgId } }),
    prisma.nabisOrderLine.count({ where: { orgId } }),
    prisma.nabisRetailer.count({ where: { orgId } }),
    prisma.nabisOrder.findFirst({
      where: { orgId, orderCreatedDate: { not: null } },
      orderBy: { orderCreatedDate: 'asc' },
      select: { orderCreatedDate: true },
    }),
    prisma.nabisOrder.findFirst({
      where: { orgId, orderCreatedDate: { not: null } },
      orderBy: { orderCreatedDate: 'desc' },
      select: { orderCreatedDate: true },
    }),
  ]);

  const checkpoints = new Map((integration?.checkpoints ?? []).map((checkpoint) => [checkpoint.module as NabisStatusModule, checkpoint]));
  const modules = NABIS_STATUS_MODULES.map((module) => {
    const checkpoint = checkpoints.get(module);
    const metadata = metadataObject(checkpoint?.metadata);
    return {
      module,
      status: checkpoint?.status ?? IntegrationSyncStatus.IDLE,
      updatedAt: checkpoint?.updatedAt.toISOString() ?? null,
      lastSuccessfulSyncAt: checkpoint ? lastSuccessfulSyncAt(metadata, checkpoint.updatedAt, checkpoint.status) : null,
      error: stringValue(metadata.error),
      rateLimited: metadata.rateLimited === true,
      retryAfterMs: numberValue(metadata.retryAfterMs),
      activeModule: stringValue(metadata.activeModule),
      activeExpiresAt: stringValue(metadata.activeExpiresAt),
      leaseHolderId: stringValue(metadata.holderId),
      leaseRefreshedAt: stringValue(metadata.refreshedAt),
      leaseExpiresAt: stringValue(metadata.expiresAt),
      stats: {
        recordsRead: numberValue(metadata.recordsRead),
        orders: numberValue(metadata.orders),
        uniqueOrders: numberValue(metadata.uniqueOrders),
        retailers: numberValue(metadata.retailers),
        lineItems: numberValue(metadata.lineItems),
        metricRows: numberValue(metadata.metricRows),
        pagesScanned: numberValue(metadata.pagesScanned),
      },
      historicalBackfill: metadata.historicalBackfill === true,
      cutoffDate: stringValue(metadata.cutoffDate),
      cutoffReached: metadata.cutoffReached === true,
      earliestOrderCreatedAt: stringValue(metadata.earliestOrderCreatedAt),
      latestOrderCreatedAt: stringValue(metadata.latestOrderCreatedAt),
    };
  });

  const latestErrorRun = (integration?.syncRuns ?? []).find((run) => run.status === IntegrationSyncStatus.ERROR || run.error);

  return {
    integration: integration
      ? {
          id: integration.id,
          name: integration.name,
          status: integration.status,
          lastSyncedAt: isoOrNull(integration.lastSyncedAt),
          updatedAt: integration.updatedAt.toISOString(),
        }
      : {
          id: null,
          name: 'Nabis',
          status: IntegrationSyncStatus.IDLE,
          lastSyncedAt: null,
          updatedAt: null,
        },
    counts: {
      retailers: retailerCount,
      orders: orderCount,
      orderLines: lineCount,
      earliestOrderCreatedAt: isoOrNull(earliestOrder?.orderCreatedDate),
      latestOrderCreatedAt: isoOrNull(latestOrder?.orderCreatedDate),
    },
    modules,
    latestError: latestErrorRun
      ? {
          module: latestErrorRun.module,
          message: latestErrorRun.error ?? stringValue(metadataObject(latestErrorRun.metadata).error) ?? 'Sync failed',
          startedAt: latestErrorRun.startedAt.toISOString(),
          finishedAt: isoOrNull(latestErrorRun.finishedAt),
        }
      : null,
    recentRuns: (integration?.syncRuns ?? []).map((run) => ({
      id: run.id,
      module: run.module,
      status: run.status,
      startedAt: run.startedAt.toISOString(),
      finishedAt: isoOrNull(run.finishedAt),
      recordsIn: run.recordsIn,
      recordsUpserted: run.recordsUpserted,
      error: run.error,
    })),
    controls: {
      recentOrders: {
        enabled: true,
        module: 'nabis-orders',
        label: 'Refresh Recent Orders',
      },
      retailers: {
        enabled: true,
        module: 'nabis-retailers',
        label: 'Run Retailer Sync',
      },
      historicalBackfill: {
        enabled: true,
        module: 'nabis-historical-backfill',
        label: 'Run Historical Backfill',
        description: 'Backfills cached Nabis orders and order lines from 2025-01-01 with the global sync lease and rate-limit pacing.',
      },
    },
  };
}
