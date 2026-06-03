import 'server-only';

import { CalendarConnectionStatus } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export type CalendarSyncMode = 'healthy' | 'stale' | 'manual-only';

export type CalendarSyncSourceStatus = {
  workerProfileId: string;
  workerName: string;
  provider: string;
  status: CalendarConnectionStatus;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  warning: string | null;
};

export type CalendarSyncHealth = {
  mode: CalendarSyncMode;
  lastSuccessfulSyncAt: string | null;
  lastAttemptAt: string | null;
  staleWarning: string | null;
  manualOnlyReason: string | null;
  activeWorkerCount: number;
  trackedWorkerCount: number;
  sourceCount: number;
  sources: CalendarSyncSourceStatus[];
};

function secondsSince(value: Date | null | undefined) {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - value.getTime()) / 1000));
}

function warningForLag(syncLagSeconds: number | null, status: CalendarConnectionStatus) {
  if (status === CalendarConnectionStatus.REVOKED) {
    return 'Calendar access was revoked. Worker is using manual availability only.';
  }
  if (syncLagSeconds == null) {
    return 'Calendar sync has not completed yet.';
  }
  if (syncLagSeconds >= 72 * 60 * 60) {
    return 'Calendar sync is older than 72 hours. Worker is using manual availability only.';
  }
  if (syncLagSeconds >= 24 * 60 * 60) {
    return 'Calendar sync is stale. Availability may be out of date.';
  }
  if (status === CalendarConnectionStatus.ERROR) {
    return 'Latest calendar sync ended in error.';
  }
  return null;
}

function calendarConnectionMode(
  connections: Array<{
    status: CalendarConnectionStatus;
    lastSuccessfulSyncAt: Date | null;
    lastAttemptAt: Date | null;
  }>,
): CalendarSyncMode {
  if (connections.length === 0) return 'manual-only';

  const hasHealthyConnection = connections.some((connection) => {
    if (connection.status !== CalendarConnectionStatus.ACTIVE && connection.status !== CalendarConnectionStatus.STALE) {
      return false;
    }
    const latestSync = connection.lastSuccessfulSyncAt ?? connection.lastAttemptAt;
    if (!latestSync) return false;
    return secondsSince(latestSync) !== null && secondsSince(latestSync)! < 24 * 60 * 60;
  });

  if (hasHealthyConnection) return 'healthy';

  const hasPotentiallyRecoverableConnection = connections.some(
    (connection) => connection.status === CalendarConnectionStatus.ACTIVE || connection.status === CalendarConnectionStatus.STALE || connection.status === CalendarConnectionStatus.ERROR,
  );

  return hasPotentiallyRecoverableConnection ? 'stale' : 'manual-only';
}

export async function getCalendarSyncHealth(orgId: string): Promise<CalendarSyncHealth> {
  const [activeWorkerCount, workers] = await Promise.all([
    prisma.workerProfile.count({
      where: { orgId, active: true },
    }),
    prisma.workerProfile.findMany({
      where: { orgId, active: true },
      select: {
        id: true,
        displayName: true,
        calendarConnections: {
          orderBy: [{ updatedAt: 'desc' }],
          select: {
            provider: true,
            status: true,
            lastSuccessfulSyncAt: true,
            lastAttemptAt: true,
          },
        },
      },
      orderBy: { displayName: 'asc' },
    }),
  ]);

  const sources = workers.flatMap((worker) =>
    worker.calendarConnections.map((connection) => {
      const syncLag = secondsSince(connection.lastSuccessfulSyncAt ?? connection.lastAttemptAt);
      return {
        workerProfileId: worker.id,
        workerName: worker.displayName,
        provider: connection.provider,
        status: connection.status,
        lastSuccessfulSyncAt: connection.lastSuccessfulSyncAt?.toISOString() ?? null,
        lastAttemptAt: connection.lastAttemptAt?.toISOString() ?? null,
        warning: warningForLag(syncLag, connection.status),
      } satisfies CalendarSyncSourceStatus;
    }),
  );

  const flattenedConnections = workers.flatMap((worker) => worker.calendarConnections);
  const mode = calendarConnectionMode(flattenedConnections);
  const latestSuccessful = flattenedConnections
    .map((connection) => connection.lastSuccessfulSyncAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0];
  const latestAttempt = flattenedConnections
    .map((connection) => connection.lastAttemptAt)
    .filter((value): value is Date => Boolean(value))
    .sort((a, b) => b.getTime() - a.getTime())[0];

  return {
    mode,
    lastSuccessfulSyncAt: latestSuccessful?.toISOString() ?? null,
    lastAttemptAt: latestAttempt?.toISOString() ?? null,
    staleWarning:
      mode === 'stale'
        ? 'Calendar sync is stale. Worker availability may be out of date.'
        : mode === 'manual-only'
          ? 'Calendar sync is unavailable or too stale to trust.'
          : null,
    manualOnlyReason:
      mode === 'manual-only'
        ? 'Workers are using manual availability windows until calendar sync recovers.'
        : null,
    activeWorkerCount,
    trackedWorkerCount: workers.length,
    sourceCount: sources.length,
    sources,
  };
}
