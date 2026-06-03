import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { loadNotionVendorDayEvents } from '@/lib/server/notion-vendor-days';
import type { TerritoryStorePin, TerritoryVendorDaySummary } from '@/lib/territory/types';

export async function loadStoreVendorDaySummary(store: TerritoryStorePin): Promise<TerritoryVendorDaySummary> {
  const normalizedStoreName = store.name.trim().toLowerCase();
  const now = Date.now();

  const accounts = await prisma.account
    .findMany({
      where: {
        OR: [
          { notionPageId: store.notionPageId },
          ...(store.licenseNumber ? [{ licenseNumber: store.licenseNumber }] : []),
          { name: store.name },
        ],
      },
      select: { id: true },
      take: 5,
    })
    .catch(() => []);

  const accountIds = accounts.map((account) => account.id);
  const localRows = accountIds.length
    ? await prisma.vendorDayEvent
        .findMany({
          where: { accountId: { in: accountIds } },
          orderBy: { eventDate: 'desc' },
          take: 50,
        })
        .catch(() => [])
    : [];

  const notionRows = await loadNotionVendorDayEvents().catch(() => []);
  const matchingNotionRows = notionRows.filter((row) => row.accountName.trim().toLowerCase() === normalizedStoreName);

  const localSummary = localRows.map((row) => ({
    id: row.id,
    eventDate: row.eventDate.toISOString(),
    status: row.status,
    repName: row.repName,
    ambassadorName: row.ambassadorName,
    notes: row.notes,
  }));

  const bridgedNotionSummary = matchingNotionRows
    .filter((row) => !localSummary.some((local) => local.eventDate.slice(0, 10) === row.eventDate.slice(0, 10)))
    .map((row) => ({
      id: row.id,
      eventDate: row.eventDate,
      status: 'SUBMITTED',
      repName: row.repName,
      ambassadorName: row.ambassadorName,
      notes: row.notes,
    }));

  const all = [...localSummary, ...bridgedNotionSummary].sort((a, b) => new Date(b.eventDate).getTime() - new Date(a.eventDate).getTime());
  const upcomingCount = all.filter((item) => new Date(item.eventDate).getTime() >= now).length;

  return {
    total: all.length,
    upcomingCount,
    recent: all.slice(0, 10),
  };
}
